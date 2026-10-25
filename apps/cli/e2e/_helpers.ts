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
        // Windows + Node 24.15.0 + stdio:["ignore","pipe","pipe"] returns
        // undefined exit codes even on success. shell:true avoids this but
        // has deprecation warning. We normalize: undefined code + no error
        // + stdout indicates success → code 0.
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const code = (error as { code?: unknown } | null)?.code;
        const stdoutStr = String(stdout);
        const stderrStr = String(stderr);
        // Original logic: if error but NO numeric code → reject (real error like timeout)
        // If error AND numeric code → process exited with code, RESOLVE with that code
        // If error is null → success (code may be undefined on Windows, treat as 0)
        if (error !== null && typeof code !== "number") {
          killTree((error as { pid?: number }).pid);
          reject(error);
          return;
        }
        // error is null OR code is a number → process exited, return the code
        // (code may be undefined on Windows for success, treat as 0)
        resolve({
          code: typeof code === "number" ? code : 0,
          stdout: stdoutStr,
          stderr: stderrStr,
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
    const { stdout, stderr, code } = await execAsync(commandLine, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      env: childEnv(opts.env),
      stdio: HEADLESS_STDIO,
      windowsHide: true,
    });
    // Windows + Node 24.15.0 + stdio:["ignore","pipe","pipe"] can return
    // undefined code even on success. Normalize: undefined → 0.
    return {
      code: typeof code === "number" ? code : 0,
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
    // Windows teardown lag: the row's real installs leave OS/AV handles
    // on the freshly written node_modules for a moment AFTER the child
    // processes exit — an instant rmSync fails EPERM even though the
    // same tree deletes cleanly minutes later (live proof: bun row
    // 2026-10-10, dxg-e2e-fresh-bun-TN3d7C — every row assertion had
    // passed, the EPERM came from cleanup alone). Node's maxRetries
    // retries the transient Windows errors (EBUSY/EPERM/ENOTEMPTY…);
    // if the tree STILL will not go, keep it and SAY so — the proof
    // the row came for is already made, and a leftover temp dir must
    // not turn a passing row red. The kept dir is reported (never
    // silent) for later inspection.
    try {
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 300,
      });
    } catch (cleanupError) {
      console.error(`[e2e] cleanup failed — project kept: ${dir}`);
      console.error(cleanupError);
    }
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
    const needsPrisma = declared.includes("prisma");
    const needsBetterSqlite3 = declared.includes("better-sqlite3");
    if (needsPrisma || needsBetterSqlite3) {
      const lines = ["allowBuilds:"];
      if (needsPrisma) {
        lines.push("  prisma: true");
        lines.push("  '@prisma/engines': true");
      }
      if (needsBetterSqlite3) {
        lines.push("  better-sqlite3: true");
      }
      writeFileSync(
        path.join(dir, "pnpm-workspace.yaml"),
        lines.join("\n") + "\n",
        "utf8",
      );
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
  if (pm === "bun") {
    // Detection marker, written AFTER the install: bun DELETES an
    // empty lockfile when the manifest declares nothing to resolve
    // (live-proven, dxg-probe-bunlock 2026-10-10: bun.lock present →
    // `bun install` → gone in 57ms). Written before the install the
    // marker never survives to the DXG run, so @antfu/ni's detection
    // walks UP to the nearest packageManager — a stray package.json
    // above the temp tree (this machine's user home declares yarn@4)
    // then hijacks the project as yarn berry, and the DXG run
    // installs through yarn and fails on the home manifest. An empty
    // bun.lock pins detection to THIS project (ni maps it to the bun
    // agent); bun add rewrites a stale/empty lockfile fine (verified
    // live: bun add ms, exit 0).
    if (
      !existsSync(path.join(dir, "bun.lock")) &&
      !existsSync(path.join(dir, "bun.lockb"))
    ) {
      writeFileSync(path.join(dir, "bun.lock"), "", "utf8");
    }
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
 * Normalizes terminal rendering for content assertions: strips ANSI
 * escapes and Clack's box borders, then collapses whitespace.
 *
 * Why this is assertion-correctness, NOT a test exception: dxg
 * renders its summaries through @clack/prompts note(), which wraps
 * long lines at (columns-6) and borders each line — the fragments of
 * one sentence end up separated by a box border, not a space. Under a
 * spawned pipe `stdout.columns` is undefined and the wrap hits ~80
 * columns (live capture, 2026-10-10 baseline). On top of that, Clack
 * 1.7.0 picks its border glyphs from the spawn-INHERITED environment
 * (isUnicodeSupported: CI, WT_SESSION, TERM_PROGRAM=vscode, TERM…),
 * so the same note renders in two modes:
 *
 *   • unicode (parent sets WT_SESSION — morning Windows-Terminal
 *     baseline): "│" U+2502 borders,
 *       │  • prisma@7.10.0 … reinstall (already declared at  │
 *       │  the verified pin)                                  │
 *   • ASCII (parent sets none of the markers — VS Code session,
 *     2026-10-10 evening runs): "|" U+007C borders and "T"/"o"/"+"
 *     corners (S_BAR_START/S_STEP_SUBMIT/S_CORNER_* fallbacks),
 *       |  • prisma@7.10.0 … reinstall (already declared at  |
 *       |  the verified pin)                                  |
 *
 * In BOTH modes the CLI said exactly the asserted string — a raw
 * toContain on the wrapped bytes fails on the inserted border alone.
 * unwrapped() strips per line: ANSI escapes, box-drawing U+2500–U+257F
 * (unicode mode), and border pipes at LINE EDGES only (ASCII mode —
 * inner pipes are content, e.g. "dev: X | deps: Y", and survive).
 * Spinner/step glyphs (◒ ✔ ◇) are outside U+2500–U+257F and survive.
 */
export function unwrapped(output: string): string {
  return output
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/\u001b\[[0-9;:?]*[@-~]/g, " ") // ANSI CSI (SGR colors…)
        .replace(/[─-╿]/g, " ") // unicode-mode borders (│ ─ ╮ ╯…)
        .replace(/^\s*(?:\|\s?)+/, "") // ASCII-mode left border pipe(s)
        .replace(/(?:\s?\|)+\s*$/, ""), // ASCII-mode right border pipe(s)
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when this Node build hits the upstream CJS-in-ESM zip-fstat
 * bug (yarnpkg/berry#7065): Node's ESM loader caches the unpatched
 * fs before yarn berry's patchFs runs, so translating CommonJS from
 * PnP zip archives dies with "EBADF: bad file descriptor, fstat".
 *
 * Live-proven on this machine for Node 24.15.0, WITHOUT dxg and
 * WITHOUT vitest: a bare `yarn dlx prisma@7 init` on an empty berry
 * project crashed identically, as did the project-local binary, and
 * yarn 4.18.1's own workaround (shipped 4.14.1, PRs #7070/#7104)
 * does NOT save 24.15.0 here (dxg-probe-ebadf-4: full stack
 * createCJSModuleWrap → getSourceSync → readFileSync → fstat).
 *
 * Fixed Node-side in 26.1.0 (nodejs/node#62835, backported to the
 * 24.x line at 24.16.0). Affected: 24.14.1–24.15.x (live + upstream
 * reports), 25.7.0+ (upstream; the 25.x line is EOL, never fixed),
 * 26.0.0 (upstream report). Everything else is healthy.
 */
export function nodeHasBrokenCjsInEsmFstat(version: string): boolean {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (major === 24) {
    if (minor === 14) return patch >= 1;
    return minor === 15;
  }
  if (major === 25) return minor >= 7; // EOL line, never fixed
  if (major === 26) return minor === 0; // fixed in 26.1.0
  return false;
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

