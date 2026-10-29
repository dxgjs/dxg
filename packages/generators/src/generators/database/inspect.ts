/**
 * READ-ONLY project inspection for the database generator.
 *
 * Everything in this module answers ONE question: "what does the project
 * already have, so the generator can reconcile instead of blindly
 * reinstalling/reinitializing?". It never installs packages, never executes
 * Prisma, never writes a single file — the inspection result feeds
 * planDatabase and the execution gates in executeDatabase.
 *
 * Domain-local on purpose (the decision document forbids a generic
 * detection/state framework): Prisma knowledge stays in the database domain,
 * package-manager knowledge is a single agent-aware installed-probe.
 */

import type { GeneratorContext } from "../../types";
import type { PackageManagerAgent } from "../../install/types";
import { providerData } from "./index";

// The single Prisma version DXG verifies against (the decision document's
// exact-match policy). Other 7.x are NOT compatible: prisma@7.0.0 silently
// ignores --no-skills, prints the help text and exits 0 without creating
// anything (verified empirically against the real CLI).
export const PRISMA_PINNED_VERSION = "7.10.0";

// Where `prisma init --output ../lib/generated/prisma` writes the generated
// client, relative to the project root. Also the fallback when a user-owned
// schema's generator block cannot be parsed.
export const DEFAULT_GENERATOR_OUTPUT = "lib/generated/prisma";

const SCHEMA_PATH = "prisma/schema.prisma";
const CONFIG_PATH = "prisma7.config.ts";
const ENV_PATH = ".env";

/** Prisma declaration classification (decision document, section 3). */
export type PrismaVersionClass =
  | "satisfied" // declares exactly 7.10.0 or a range that contains it
  | "incompatible" // any 6.x / 8.x / other 7.x — conflict, abort before install
  | "missing"; // not declared at all (fresh project, or repairable install)

/**
 * Minimal semver parsing — major.minor.patch as numbers, prerelease kept as
 * the raw tail. No ranges, no coercion: the database domain only ever needs
 * "what exact version does this specifier pin" and "which 7.x is it".
 */
export function parseVersion(raw: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
} {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(raw.trim());
  if (!m) return { major: NaN, minor: NaN, patch: NaN, prerelease: "" };
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? "",
  };
}

/** True when a bare version (no range operators) is exactly the pinned 7.10.0. */
function isExactPin(raw: string): boolean {
  return raw.trim() === PRISMA_PINNED_VERSION;
}

/**
 * True when a semver range expression's FLOOR is exactly the pinned 7.10.0
 * or higher-within-7 (i.e. ^7.10.0 / ~7.10.0 / >=7.10 <8). A range whose
 * floor is lower (^7.0.0, >7.9.0) can resolve to an unverified 7.x and is
 * therefore incompatible — the exact-match policy from the decision
 * document. Handles caret, tilde, >=/</> and space-separated AND
 * comparators. Prerelease-including ranges are rejected outright (an RC
 * range is not a verified contract).
 */
function rangeAcceptsOnlyPinnedMajor(range: string): boolean {
  const parts = range.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.some((p) => /-\w/.test(p))) return false; // prerelease/RC
  let floorMinor = -1; // the range's lowest possible 7.x minor
  for (const part of parts) {
    const floor = /^(\^|~|>=)(\d+)\.(\d+)(?:\.\d+)?$/.exec(part);
    if (floor) {
      const [, op, M, m] = floor;
      if (Number(M) !== 7) return false;
      if (op === "^" || op === "~" || op === ">=") {
        const minor = Number(m);
        floorMinor = floorMinor === -1 ? minor : Math.max(floorMinor, minor);
      }
      continue;
    }
    const gt = /^>(?!=)(\d+)\.(\d+)\.(\d+)$/.exec(part);
    if (gt) {
      const [, M, m, p] = gt;
      if (Number(M) !== 7) return false;
      // >7.9.0 still admits 7.9.1 — only a floor that lands exactly on
      // 7.10.0 keeps the range verified: >7.9.x < 7.10 is unverified.
      const minor = Number(m) + (Number(p) > 0 ? 0 : 1);
      if (minor !== 10) return false;
      floorMinor = floorMinor === -1 ? minor : Math.max(floorMinor, minor);
      continue;
    }
    const lt = /^<(?!=)(\d+)(?:\.(\d+))?(?:\.\d+)?$/.exec(part);
    if (lt) {
      // Only an upper bound that keeps the whole 7 major is verified.
      if (Number(lt[1]) !== 8) return false;
      continue;
    }
    // Exact bare version inside an AND expression
    if (/^\d+\.\d+\.\d+$/.test(part)) {
      return isExactPin(part);
    }
    return false; // wildcards, ||, hyphen ranges: unverified — incompatible
  }
  // Exact-match policy: the range must floor EXACTLY at 7.10.0 — a lower
  // floor (^7.0.0) admits unverified 7.x, a higher one (^7.11.0) excludes
  // the pinned version. floorMinor === -1 means no floor comparator at all
  // (a lone <8): unverified.
  return floorMinor === 10;
}

/**
 * Classifies a declared prisma / @prisma/client version string against the
 * exact-match policy. Exported for tests.
 */
export function classifyPrismaVersion(
  declared: string | undefined,
): PrismaVersionClass {
  if (declared === undefined) return "missing";
  const raw = declared.trim();
  if (raw === "" || raw === "*" || raw === "latest") return "missing"; // no usable pin — treat as absent
  if (isExactPin(raw)) return "satisfied";
  if (rangeAcceptsOnlyPinnedMajor(raw)) return "satisfied";
  return "incompatible";
}

/** Reads a dependency spec from a freshly-read package.json object. */
function declaredVersion(
  packageJson:
    | (Record<string, unknown> & {
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      })
    | undefined,
  name: string,
): string | undefined {
  return (
    packageJson?.devDependencies?.[name] ?? packageJson?.dependencies?.[name]
  );
}

/**
 * Installed-state probe, agent-aware (decision document, section 4).
 *
 * - npm / pnpm / yarn classic / bun: node_modules/<name>/package.json
 *   (pnpm's symlink is followed by pathExists).
 * - yarn@berry: node_modules first (covers nodeLinker: node-modules, which
 *   behaves like npm — verified empirically), then an ANCHORED yarn.lock
 *   lookup (PnP mode has no node_modules at all; the lockfile entry looks
 *   like `"prisma@npm:7.10.0"`).
 *
 * The lockfile match is anchored on the quote so `prisma` can never match
 * `@prisma/client` (the latter's entry starts with `"@prisma/client@`).
 */
export async function isPackageInstalled(
  fs: GeneratorContext["fs"],
  agent: PackageManagerAgent | undefined,
  name: string,
): Promise<boolean> {
  if (await fs.pathExists(`node_modules/${name}/package.json`)) {
    return true;
  }
  if (agent !== "yarn@berry") return false;
  // Absent lockfile → not installed. Guarded explicitly: the REAL @dxgjs/fs
  // readFile rejects with ENOENT on a missing file (found by real E2E — the
  // in-memory test mock resolves undefined and masked this), and a yarn@berry
  // project may legitimately have no yarn.lock yet (fresh, never installed).
  if (!(await fs.pathExists("yarn.lock"))) return false;
  let lockfile: unknown;
  try {
    lockfile = await fs.readFile("yarn.lock", { encoding: "utf8" });
  } catch {
    return false; // unreadable lockfile (locked, perms) — not "installed"
  }
  if (typeof lockfile !== "string") return false;
  // Anchored: entry key must start exactly with "name@ — no substring match
  // across a longer package name (@prisma/client would not match prisma).
  const anchor = `"${name}@`;
  for (const line of lockfile.split("\n")) {
    if (line.trimStart().startsWith(anchor)) return true;
  }
  return false;
}

/** Legacy (≤6) datasource form: `url = env("...")` inside the datasource block. */
export function schemaHasLegacyDatasource(schemaText: string): boolean {
  return /datasource\s+\w+\s*\{[^}]*url\s*=\s*env\(/s.test(schemaText);
}

/**
 * Extracts the `generator client { ... output = "..." }` block's output path
 * from schema.prisma text. Returns:
 * - { present: true, output } on success
 * - { present: true, output: undefined } when a generator block exists but
 *   its output cannot be parsed (generate will fail loudly on its own —
 *   verified: "An output path is required for the `prisma-client` generator")
 * - { present: false } when there is no generator block at all (generate
 *   exits 0 having generated NOTHING — the false-success case).
 */
export function parseGeneratorOutput(
  schemaText: string,
): { present: boolean; output?: string } {
  const block = /generator\s+client\s*\{([\s\S]*?)\}/.exec(schemaText);
  if (!block) return { present: false };
  const output = /^\s*output\s*=\s*"([^"]+)"/m.exec(block[1]);
  return { present: true, output: output?.[1] };
}

/**
 * Resolves a generator output declared in schema.prisma (relative to the
 * prisma/ directory, the way Prisma resolves it) into a project-root-
 * relative POSIX path. Returns undefined when the path escapes the root.
 */
export function resolveGeneratorOutput(declared: string): string | undefined {
  const segments = declared.replace(/\\/g, "/").split("/").filter((s) => s !== "");
  // Prisma resolves output relative to the schema file (prisma/), so the
  // resolution stack starts one level deep: ["prisma"]. Popping that base
  // lands at the project root; popping BELOW it escapes the project.
  const stack = ["prisma"];
  for (const seg of segments) {
    if (seg === ".") continue;
    if (seg === "..") {
      if (stack.length === 0) return undefined; // already outside the root
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  if (stack.length === 0) return undefined;
  return stack.join("/");
}

/**
 * Computes the ESM import specifier for the generated client, relative to
 * the helper file that imports it. Both inputs are project-root-relative
 * POSIX paths (the helper WITH its .ts extension, the output WITHOUT one).
 */
export function computeRelativeImport(
  fromFile: string,
  toPath: string,
): string {
  const fromDir = dirnameSegments(fromFile);
  const to = toPath.split("/").filter((s) => s !== "");
  let common = 0;
  while (
    common < fromDir.length &&
    common < to.length &&
    fromDir[common] === to[common]
  ) {
    common++;
  }
  const ups = fromDir.length - common;
  const rest = to.slice(common);
  const prefix = ups === 0 ? "./" : "../".repeat(ups);
  if (rest.length === 0) return `${prefix}client`;
  return `${prefix}${rest.join("/")}/client`;
}

function dirnameSegments(filePath: string): string[] {
  const parts = filePath.split("/");
  parts.pop(); // drop the file name
  return parts.filter((s) => s !== "");
}

/**
 * Computes a relative ESM import specifier from one FILE to another FILE
 * (both project-root-relative POSIX paths, both WITH their .ts extension
 * stripped by the caller). Unlike computeRelativeImport (directory-to-
 * generated-client), this targets an exact file: the seed imports the
 * helper, e.g. prisma/seed.ts → lib/prisma.ts = "../lib/prisma".
 */
export function computeFileImport(
  fromFile: string,
  toFile: string,
): string {
  const fromDir = dirnameSegments(fromFile);
  const to = toFile.split("/").filter((s) => s !== "");
  let common = 0;
  while (
    common < fromDir.length &&
    common < to.length &&
    fromDir[common] === to[common]
  ) {
    common++;
  }
  const ups = fromDir.length - common;
  const rest = to.slice(common);
  const prefix = ups === 0 ? "./" : "../".repeat(ups);
  return `${prefix}${rest.join("/")}`;
}

// ---------------------------------------------------------------------------
// Helper path normalization / validation (decision document, section 6)
// ---------------------------------------------------------------------------

export const DEFAULT_HELPER_PATH = "lib/prisma.ts";

/** Paths DXG must never let the helper collide with (user/Prisma-owned). */
const PROTECTED_PATHS = new Set([
  "prisma/schema.prisma",
  "prisma7.config.ts",
  "prisma/seed.ts",
  ".env",
]);

/**
 * Validates whether a file's content matches a recognized Prisma client
 * helper pattern. This prevents treating arbitrary prisma.ts files as
 * valid helpers (requirement: inspect content, not just filename).
 */
export function isValidPrismaClientHelper(content: string): boolean {
  if (!content || typeof content !== "string") return false;

  // Must import PrismaClient from generated client
  const hasPrismaClientImport = /import\s+\{\s*PrismaClient\s*\}\s+from\s+["'][^"']*["']/.test(content);

  // Must import an adapter from a known provider adapter package
  const hasAdapterImport = /import\s+\{\s*\w+\s*\}\s+from\s+["']@prisma\/adapter-[^"']*["']/.test(content);

  // Must create adapter instance (new AdapterClass(...))
  const hasAdapterInstantiation = /const\s+\w+\s*=\s*new\s+\w+\s*\(/.test(content);

  // Must create PrismaClient with adapter - accepts both { adapter: adapter } and { adapter } shorthand
  const hasPrismaClientWithAdapter = /const\s+prisma\s*=\s*new\s+PrismaClient\s*\(\s*\{\s*adapter\s*(?::\s*\w+)?\s*\}\s*\)/.test(content);

  // Must export prisma
  const hasPrismaExport = /export\s+\{\s*prisma\s*\}/.test(content);

  return (
    hasPrismaClientImport &&
    hasAdapterImport &&
    hasAdapterInstantiation &&
    hasPrismaClientWithAdapter &&
    hasPrismaExport
  );
}

/**
 * Normalizes a user-entered helper path: backslashes to forward slashes,
 * leading ./ stripped, trailing / stripped, .ts appended when omitted,
 * empty → default.
 */
export function normalizeHelperPath(input: string | undefined): string {
  let p = (input ?? "").trim();
  if (p === "") return DEFAULT_HELPER_PATH;
  p = p.replace(/\\/g, "/");
  while (p.startsWith("./")) p = p.slice(2);
  while (p.endsWith("/")) p = p.slice(0, -1);
  if (!p.endsWith(".ts")) p = `${p}.ts`;
  return p;
}

/**
 * Validates a normalized helper path. Returns an error message for every
 * rejection case, or undefined when the path is acceptable.
 */
export function validateHelperPath(normalized: string): string | undefined {
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    /^\\\\/.test(normalized)
  ) {
    return "Helper path must be relative to the project root";
  }
  if (normalized.split("/").includes("..")) {
    return "Helper path must stay inside the project root";
  }
  if (PROTECTED_PATHS.has(normalized)) {
    return `Helper path collides with ${normalized} (Prisma/DXG-owned file)`;
  }
  if (normalized === "package.json") {
    return "Helper path cannot be package.json";
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The inspection itself
// ---------------------------------------------------------------------------

export interface DatabaseInspection {
  /** prisma/schema.prisma exists on disk. */
  schemaExists: boolean;
  /** prisma7.config.ts exists on disk. */
  configExists: boolean;
  /** prisma/ directory exists. */
  prismaDirExists: boolean;
  /** prisma/ exists but holds no schema.prisma (early-fail gate). */
  prismaDirEmpty: boolean;
  /** Schema has a `generator client` block. */
  schemaHasGenerator: boolean;
  /** Generator output, project-root-relative POSIX; fallback default. */
  generatorOutput: string;
  /** True when the parsed output escapes the project root. */
  generatorOutputEscapesRoot: boolean;
  /** Schema declares the legacy (≤6) datasource url form → P1012 under 7. */
  datasourceLegacyForm: boolean;
  /** Prisma CLI declaration class (exact-match 7.10.0 policy). */
  prismaVersion: PrismaVersionClass;
  /** Declared prisma spec string, when present. */
  prismaDeclaredSpec: string | undefined;
  /** @prisma/client declaration class. */
  clientVersion: PrismaVersionClass;
  /** Declared @prisma/client spec string, when present. */
  clientDeclaredSpec: string | undefined;
  /** Names of provider non-Prisma dependencies missing from package.json. */
  providerDependenciesMissing: string[];
  /**
   * The seed runner (tsx) is declared in package.json. Not a provider
   * dependency — planDatabase adds it dynamically when db:seed is selected,
   * so its declared check lives here rather than in
   * providerDependenciesMissing.
   */
  seedRunnerDeclared: boolean;
  /** prisma physically installed (agent-aware probe). */
  prismaInstalled: boolean;
  /** @prisma/client physically installed (agent-aware probe). */
  clientInstalled: boolean;
  /** .env exists. */
  envExists: boolean;
  /** .env exists and defines DATABASE_URL. */
  envHasDatabaseUrl: boolean;
  /** Helper file candidates found on disk, normalized. */
  helperCandidates: string[];
  /** The default helper path, already normalized. */
  defaultHelperPath: string;
}

/**
 * Inspects the project. All reads go through ctx.fs so tests drive the same
 * seam as production, and nothing here mutates state.
 */
export async function inspectDatabase(
  ctx: Pick<GeneratorContext, "fs"> & {
    installer?: { agent: PackageManagerAgent };
  },
  providerKey: string,
): Promise<DatabaseInspection> {
  const fs = ctx.fs;

  const schemaExists = await fs.pathExists(SCHEMA_PATH);
  const configExists = await fs.pathExists(CONFIG_PATH);
  const prismaDirExists = await fs.pathExists("prisma");

  // prisma/ exists but there is no schema to generate from AND init cannot
  // run (it refuses any existing prisma/ folder — verified empirically).
  let prismaDirEmpty = false;
  if (prismaDirExists && !schemaExists) {
    const entries = (await fs
      .readdir("prisma")
      .catch(() => [] as string[])) as string[];
    prismaDirEmpty = !entries.some((e) => e === "schema.prisma");
  }

  let schemaHasGenerator = false;
  let generatorOutput = DEFAULT_GENERATOR_OUTPUT;
  let generatorOutputEscapesRoot = false;
  let datasourceLegacyForm = false;
  if (schemaExists) {
    const schemaText = (await fs.readFile(SCHEMA_PATH, {
      encoding: "utf8",
    })) as string | undefined;
    if (typeof schemaText === "string" && schemaText.trim() !== "") {
      const gen = parseGeneratorOutput(schemaText);
      schemaHasGenerator = gen.present;
      if (gen.present && gen.output !== undefined) {
        const resolved = resolveGeneratorOutput(gen.output);
        if (resolved === undefined) {
          generatorOutputEscapesRoot = true;
        } else {
          generatorOutput = resolved;
        }
      }
      datasourceLegacyForm = schemaHasLegacyDatasource(schemaText);
    }
  }

  // package.json read fresh (never the pre-run awareness snapshot).
  const packageJson = await fs.readJson<
    | (Record<string, unknown> & {
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      })
    | undefined
  >("package.json");

  const prismaDeclaredSpec = declaredVersion(packageJson, "prisma");
  const clientDeclaredSpec = declaredVersion(packageJson, "@prisma/client");
  const prismaVersion = classifyPrismaVersion(prismaDeclaredSpec);
  const clientVersion = classifyPrismaVersion(clientDeclaredSpec);

  // Provider non-Prisma dependencies: name-only declared check (adapters,
  // drivers, dotenv). Version pinning stays provider data's job.
  const provider = providerData[providerKey as keyof typeof providerData];
  const providerDeps: string[] = provider
    ? [...provider.dependencies, ...provider.devDependencies]
        .map((spec) => specName(spec))
        .filter((name) => name !== "prisma" && name !== "@prisma/client")
    : [];
  const providerDependenciesMissing: string[] = [];
  for (const name of providerDeps) {
    if (declaredVersion(packageJson, name) === undefined) {
      providerDependenciesMissing.push(name);
    }
  }

  // Seed runner declared check (name-only, same rule as the provider deps):
  // planDatabase pushes tsx into the dev batch only when db:seed is
  // selected AND the project does not declare it — this field is the
  // rerun-side idempotence gate for that push.
  const seedRunnerDeclared = declaredVersion(packageJson, "tsx") !== undefined;

  const agent = ctx.installer?.agent;
  const prismaInstalled = await isPackageInstalled(fs, agent, "prisma");
  const clientInstalled = await isPackageInstalled(fs, agent, "@prisma/client");

  const envExists = await fs.pathExists(ENV_PATH);
  let envHasDatabaseUrl = false;
  if (envExists) {
    const envText = (await fs.readFile(ENV_PATH, { encoding: "utf8" })) as
      | string
      | undefined;
    envHasDatabaseUrl =
      typeof envText === "string" &&
      /^\s*(?:export\s+)?DATABASE_URL\s*=/m.test(envText);
  }

  // Helper candidates: paths a previous DXG run may have created. Discovery
  // now includes CONTENT VALIDATION (requirement: inspect Prisma Client
  // imports/initialization patterns, not just file existence).
  const helperCandidates: string[] = [];
  // Plausible locations where DXG may have created the helper
  const plausibleHelperPaths = [
    DEFAULT_HELPER_PATH,
    "src/lib/prisma.ts",
    "lib2/prisma.ts",
  ];
  for (const candidate of plausibleHelperPaths) {
    if (await fs.pathExists(candidate)) {
      const content = (await fs.readFile(candidate, { encoding: "utf8" })) as string | undefined;
      if (content && isValidPrismaClientHelper(content)) {
        helperCandidates.push(candidate);
      }
    }
  }

  return {
    schemaExists,
    configExists,
    prismaDirExists,
    prismaDirEmpty,
    schemaHasGenerator,
    generatorOutput,
    generatorOutputEscapesRoot,
    datasourceLegacyForm,
    prismaVersion,
    prismaDeclaredSpec,
    clientVersion,
    clientDeclaredSpec,
    providerDependenciesMissing,
    seedRunnerDeclared,
    prismaInstalled,
    clientInstalled,
    envExists,
    envHasDatabaseUrl,
    helperCandidates,
    defaultHelperPath: DEFAULT_HELPER_PATH,
  };
}

/**
 * Extracts the package NAME from an npm spec like "prisma@7.10.0" or
 * "@prisma/client@7.10.0". Exported for planDatabase's state-aware batch
 * filtering (name-based, never literal-spec — a declared "7.10.0" must
 * match a batch "prisma@7.10.0").
 */
export function specName(spec: string): string {
  const at = spec.indexOf("@", 1);
  return at === -1 ? spec : spec.slice(0, at);
}
