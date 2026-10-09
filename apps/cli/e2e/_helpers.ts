/**
 * Shared E2E helpers — REAL end-to-end infrastructure for
 * `dxg add database` validation.
 *
 * Everything here drives real artifacts: the built CLI binary, real
 * package managers, real installs in isolated temp projects. No
 * mocking. The only programmatic layer is driver.mjs, used for answers
 * the CLI cannot express non-interactively — it runs the same BUILT
 * generator code.
 */
import { exec, execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const execAsync = promisify(exec);

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
export const CLI_BIN = path.join(REPO_ROOT, "apps", "cli", "bin", "index.js");
export const DRIVER = path.join(REPO_ROOT, "apps", "cli", "e2e", "driver.mjs");

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
  ms: number;
}

const DEFAULT_TIMEOUT_MS = 12 * 60_000;
const MAX_BUFFER = 40 * 1024 * 1024;

// Headless spawn contract: a spawned child gets a CLOSED stdin, never
// node's default open never-fed pipe. On Windows that pipe handle is
// inherited by every npm/npx grandchild (CreateProcess handle
// inheritance) and the whole spawn tree stalls — the exact hang that
// froze `dxg add database` E2E runs for the full 12-minute timeout.
// Bisected live with no-dist replays: the identical bootstrap+install+
// prisma-init sequence hung as an execFile child with the default
// stdin, and passed in ~5 min flat with stdio[0]="ignore". The dist
// was exonerated — the spawn context alone was the channel.
const HEADLESS_STDIO: ["ignore", "pipe", "pipe"] = ["ignore", "pipe", "pipe"];

function childEnv(extra?: Record<string, string>): Record<string, string> {
  return {
    ...process.env,
    // Corepack's first-download prompt would hang a non-TTY spawn.
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    ...extra,
  };
}

/**
 * execFile's timeout SIGTERMs only the direct child; its npm/npx
 * grandchildren survive as orphans holding the temp project's
 * node_modules and the shared npm cache locks open (observed live:
 * zombie runners outliving their killed parent by minutes, polluting
 * later runs). Best-effort tree kill — the timeout rejection still
 * propagates when it fails.
 */
function killTree(pid: number | undefined): void {
  if (process.platform !== "win32" || pid === undefined) return;
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
  } catch {
    // hygiene only
  }
}

/** Runs a Node script — no shell, safe with spaces in paths. */
export function runNode(
  jsFile: string,
  args: string[],
  opts: { cwd: string; timeoutMs?: number; env?: Record<string, string> },
): Promise<RunResult> {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [jsFile, ...args],
      {
        cwd: opts.cwd,
        timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        env: childEnv(opts.env),
        stdio: HEADLESS_STDIO,
      },
      (error, stdout, stderr) => {
        const code = (error as { code?: unknown } | null)?.code;
        if (error !== null && typeof code !== "number") {
          killTree((error as { pid?: number }).pid);
          reject(error);
          return;
        }
        resolve({
          code: typeof code === "number" ? code : 0,
          stdout: String(stdout),
          stderr: String(stderr),
          ms: Date.now() - started,
        });
      },
    );
  });
}

function quote(arg: string): string {
  return /\s/.test(arg) ? `"${arg}"` : arg;
}

/**
 * Runs a package-manager command. Uses a shell because npm/yarn are
 * .cmd shims on Windows; commands and args are controlled literals
 * (quoted when they contain spaces).
 */
export async function runPM(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs?: number; env?: Record<string, string> },
): Promise<RunResult> {
  const started = Date.now();
  const commandLine = [cmd, ...args].map(quote).join(" ");
  try {
    const { stdout, stderr } = await execAsync(commandLine, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: childEnv(opts.env),
      stdio: HEADLESS_STDIO,
    });
    return {
      code: 0,
      stdout: String(stdout),
      stderr: String(stderr),
      ms: Date.now() - started,
    };
  } catch (error) {
    const e = error as { code?: unknown; stdout?: string; stderr?: string };
    if (typeof e.code === "number") {
      return {
        code: e.code,
        stdout: String(e.stdout ?? ""),
        stderr: String(e.stderr ?? ""),
        ms: Date.now() - started,
      };
    }
    throw error;
  }
}

/** The real CLI: `dxg add database <flags>` through the built bin entry. */
export function runDxg(
  dir: string,
  flags: string[],
  opts: { timeoutMs?: number } = {},
): Promise<RunResult> {
  return runNode(CLI_BIN, ["add", "database", ...flags], {
    cwd: dir,
    timeoutMs: opts.timeoutMs,
  });
}

/** The programmatic driver — real generator, explicit answers. */
export function runDriver(
  dir: string,
  answers: Record<string, unknown>,
  opts: { timeoutMs?: number } = {},
): Promise<RunResult> {
  return runNode(DRIVER, [dir, JSON.stringify(answers)], {
    cwd: dir,
    timeoutMs: opts.timeoutMs,
  });
}

/** Package managers officially supported by the generator's installer. */
export type E2EPm = "npm" | "pnpm" | "yarn-classic" | "yarn-berry" | "bun";

export const PM_COMMAND: Record<E2EPm, string> = {
  npm: "npm",
  pnpm: "pnpm",
  "yarn-classic": "yarn",
  "yarn-berry": "yarn",
  bun: "bun",
};

/**
 * Manifest tweak that pins the yarn family through corepack: the
 * packageManager field both selects the yarn version corepack runs and
 * is the detection trigger @antfu/ni uses to tell classic from berry.
 */
export const PM_PACKAGE_MANAGER: Partial<Record<E2EPm, string>> = {
  "yarn-classic": "yarn@1.22.22",
  "yarn-berry": "yarn@4.9.2",
};

const pmAvailableCache = new Map<E2EPm, boolean>();

export async function pmAvailable(pm: E2EPm): Promise<boolean> {
  const cached = pmAvailableCache.get(pm);
  if (cached !== undefined) {
    return cached;
  }
  // Probe from a real scratch PROJECT (manifest present, yarn rows
  // pinned through packageManager): managers resolve through the same
  // corepack/project-detection path the actual rows use — a bare temp
  // cwd can false-negative when the user home holds a stray manifest.
  const scratch = mkdtempSync(path.join(os.tmpdir(), `dxg-e2e-probe-${pm}-`));
  let available: boolean;
  try {
    const pinned = PM_PACKAGE_MANAGER[pm];
    writeFileSync(
      path.join(scratch, "package.json"),
      JSON.stringify({
        name: "e2e-probe",
        private: true,
        ...(pinned === undefined ? {} : { packageManager: pinned }),
      }),
      "utf8",
    );
    if (pm === "yarn-berry") {
      writeFileSync(path.join(scratch, "yarn.lock"), "", "utf8");
    }
    const res = await runPM(PM_COMMAND[pm], ["--version"], {
      cwd: scratch,
      timeoutMs: 180_000,
    });
    available = res.code === 0;
  } catch {
    available = false;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  pmAvailableCache.set(pm, available);
  return available;
}

/**
 * Creates an isolated temp project and removes it after the test. On
 * failure the project is KEPT for diagnosis (path printed, then the
 * error is rethrown).
 */
export async function withProject(
  name: string,
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const dir = mkdtempSync(path.join(os.tmpdir(), `dxg-e2e-${name}-`));
  try {
    await fn(dir);
    rmSync(dir, { recursive: true, force: true });
  } catch (error) {
    console.error(`[e2e] failure — project kept for diagnosis: ${dir}`);
    throw error;
  }
}

/** Minimal real project: manifest + real `<pm> install` (lockfile created). */
export async function bootstrapProject(
  dir: string,
  pm: E2EPm,
  manifest: Record<string, unknown> = {},
): Promise<number> {
  const pinned = PM_PACKAGE_MANAGER[pm];
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(
      {
        name: "e2e-fixture",
        version: "0.0.0",
        private: true,
        ...(pinned === undefined ? {} : { packageManager: pinned }),
        ...manifest,
      },
      null,
      2,
    ),
    "utf8",
  );
  if (pm === "yarn-berry") {
    // Yarn Berry walks UP for a project root; a stray package.json or
    // yarn.lock anywhere above the temp dir would swallow the project
    // ("doesn't seem to be part of the project declared in ..."). An
    // empty yarn.lock marks THIS directory as its own project root —
    // the boundary berry's own error message recommends.
    writeFileSync(path.join(dir, "yarn.lock"), "", "utf8");
  }
  if (pm === "pnpm") {
    // pnpm (strictDepBuilds on by default) fails an install with
    // unapproved build scripts. A bootstrap manifest that declares prisma
    // runs its lifecycle scripts during THIS install — pre-write the SAME
    // approvals the CLI itself writes later (applyPnpmAllowBuilds: the
    // allowBuilds map, lab-validated format, "@" keys single-quoted), or
    // the bootstrap dies with ERR_PNPM_IGNORED_BUILDS before the
    // generator ever runs. onlyBuiltDependencies (the pre-11 name) is
    // NOT read by the pnpm corepack resolves for lockfile-less temp
    // manifests (12.x here) — verified live in the bootstrap failures.
    const declared = [
      ...Object.keys(
        (manifest.devDependencies ?? {}) as Record<string, string>,
      ),
      ...Object.keys((manifest.dependencies ?? {}) as Record<string, string>),
    ];
    if (declared.includes("prisma")) {
      writeFileSync(
        path.join(dir, "pnpm-workspace.yaml"),
        "allowBuilds:\n  prisma: true\n  '@prisma/engines': true\n",
        "utf8",
      );
    }
  }
  if (pm === "bun") {
    // bun writes no lockfile when a manifest declares nothing to
    // resolve, and without a marker @antfu/ni's detection walks UP — a
    // stray package.json above the temp tree (this machine's user home
    // declares packageManager yarn@4) then hijacks the project as yarn
    // berry. An empty bun.lock pins detection to THIS project (ni maps
    // it to the bun agent); bun add rewrites a stale/empty lockfile
    // fine (verified live: bun add ms, exit 0).
    if (
      !existsSync(path.join(dir, "bun.lock")) &&
      !existsSync(path.join(dir, "bun.lockb"))
    ) {
      writeFileSync(path.join(dir, "bun.lock"), "", "utf8");
    }
  }
  const res = await runPM(PM_COMMAND[pm], ["install"], {
    cwd: dir,
    timeoutMs: 6 * 60_000,
  });
  if (res.code !== 0) {
    throw new Error(
      `bootstrap: ${pm} install failed (exit ${res.code})\n${res.stdout}\n${res.stderr}`,
    );
  }
  return res.ms;
}

// ---------------------------------------------------------------------------
// Project-state assertions
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

export function readJson(dir: string, rel: string): Json {
  return JSON.parse(readText(dir, rel)) as Json;
}

export function readText(dir: string, rel: string): string {
  return readFileSync(path.join(dir, rel), "utf8");
}

export function mustExist(dir: string, rel: string): string {
  const file = path.join(dir, rel);
  if (!existsSync(file)) {
    throw new Error(`expected file missing: ${file}`);
  }
  return readFileSync(file, "utf8");
}

export function sha(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

/** SHA map of the user-facing files idempotence must preserve byte-for-byte. */
export function snapshotUserFiles(dir: string): Record<string, string> {
  const files = [
    "prisma/schema.prisma",
    "prisma7.config.ts",
    "lib/prisma.ts",
    ".env",
  ];
  const out: Record<string, string> = {};
  for (const rel of files) {
    const file = path.join(dir, rel);
    out[rel] = existsSync(file) ? sha(readFileSync(file, "utf8")) : "<absent>";
  }
  return out;
}

export function depSection(
  pkg: Json,
  section: "dependencies" | "devDependencies",
): Record<string, string> {
  return (pkg[section] ?? {}) as Record<string, string>;
}

export function scriptSection(pkg: Json): Record<string, string> {
  return (pkg.scripts ?? {}) as Record<string, string>;
}

/**
 * The version ACTUALLY installed on disk: node_modules layout for
 * npm/pnpm/yarn-classic/bun. Yarn Berry PnP has no node_modules — the
 * resolved version is read from the real yarn.lock entry instead.
 */
export function installedVersion(
  dir: string,
  name: string,
  pm: E2EPm,
): string | undefined {
  const manifestPath = path.join(dir, "node_modules", name, "package.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Json;
    return typeof manifest.version === "string" ? manifest.version : undefined;
  }
  if (pm === "yarn-berry") {
    const lockPath = path.join(dir, "yarn.lock");
    if (existsSync(lockPath)) {
      const lock = readFileSync(lockPath, "utf8");
      const m = new RegExp(`^\\s*"?${name}@npm:([^"\\s]+)`, "m").exec(lock);
      return m?.[1];
    }
  }
  return undefined;
}

/** Lists a directory's entries (sorted) — used to prove nothing escapes. */
export function listDir(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

