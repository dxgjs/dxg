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

// Shared database meta (single source of truth for Prisma version, providers, scripts, paths)
import {
  providerData,
  DEFAULT_GENERATOR_OUTPUT,
  DEFAULT_HELPER_PATH,
  PRISMA_CONFIG_PATH as CONFIG_PATH,
  SCHEMA_PATH,
  ENV_PATH,
  classifyPrismaVersion,
  declaredVersion,
  specName,
  schemaHasLegacyDatasource,
  parseGeneratorOutput,
  resolveGeneratorOutput,
  isValidPrismaClientHelper,
  type DatabaseInspection,
} from "@dxgjs/database-meta";

// Re-export database-meta functions for backward compatibility with tests and consumers
export {
  PRISMA_PINNED_VERSION,
  DEFAULT_GENERATOR_OUTPUT,
  DEFAULT_HELPER_PATH,
  parseVersion,
  classifyPrismaVersion,
  parseGeneratorOutput,
  resolveGeneratorOutput,
  computeRelativeImport,
  computeFileImport,
  normalizeHelperPath,
  validateHelperPath,
  schemaHasLegacyDatasource,
  type DatabaseInspection,
  type PrismaVersionClass,
} from "@dxgjs/database-meta";

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

// ---------------------------------------------------------------------------
// The inspection itself
// ---------------------------------------------------------------------------

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
