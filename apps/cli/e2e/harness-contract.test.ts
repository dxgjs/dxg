/**
 * Regression tests for the e2e harness's SPAWN-CONTEXT construction.
 *
 * The 2026-10 E2E hang: `dxg add database` runs froze forever inside
 * `npx prisma init` under every execFile-based spawner (vitest workers
 * included). Root cause, bisected live with no-dist replays: node's
 * default stdin for a spawned child is an OPEN, never-fed, never-closed
 * pipe; on Windows that handle is inherited by every npm/npx grandchild
 * and the whole tree stalls — the npm exec runner sat silent for 166 s,
 * the prisma process never booted — while the identical no-dist
 * sequence passed in ~5 min flat once the parent spawned with a CLOSED
 * stdin (stdio ["ignore","pipe","pipe"]). The dist was exonerated: the
 * harness's own spawn context was the sole channel. Contract: anything
 * this harness spawns runs with a closed stdin, never an open pipe.
 */
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, test, vi } from "vitest";

type SpawnCapture = { args: string[]; options: Record<string, unknown> };

const execFileCalls: SpawnCapture[] = [];
const execCalls: SpawnCapture[] = [];

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFile: ((cmd: unknown, args: unknown, opts: unknown, cb: unknown) => {
      execFileCalls.push({
        args: [String(cmd), ...(Array.isArray(args) ? args.map(String) : [])],
        options: (opts ?? {}) as Record<string, unknown>,
      });
      (cb as (e: Error | null, out?: string, err?: string) => void)(
        null,
        "",
        "",
      );
      return undefined;
    }) as unknown as typeof actual.execFile,
    exec: ((cmd: unknown, opts: unknown, cb: unknown) => {
      execCalls.push({
        args: [String(cmd)],
        options: (opts ?? {}) as Record<string, unknown>,
      });
      (cb as (e: Error | null, out?: string, err?: string) => void)(
        null,
        "",
        "",
      );
      return undefined;
    }) as unknown as typeof actual.exec,
  };
});

const { runNode, runPM, unwrapped, nodeHasBrokenCjsInEsmFstat, bootstrapProject } =
  await import("./_helpers");

describe("e2e harness environment gates", () => {
  // Upstream bug map (yarnpkg/berry#7065, closed 2026-07-23): Node's
  // CJS-in-ESM translation path reads zip-backed PnP files with the
  // unpatched fs — EBADF fstat. Fixed Node-side in 26.1.0
  // (nodejs/node#62835, backported to the 24.x line at 24.16.0).
  // Yarn's own workaround (shipped 4.14.1, PRs #7070/#7104) was
  // live-verified INSUFFICIENT for Node 24.15.0 on this machine:
  // bare `yarn dlx prisma@7 init` crashed identically under yarn
  // 4.18.1 (dxg-probe-ebadf-4, full stack: createCJSModuleWrap →
  // getSourceSync → readFileSync → fstat).
  test("affected Node ranges: 24.14.1–24.15.x, 25.7.0+ (EOL), 26.0.x", () => {
    // Live-proven here (Windows, Node 24.15.0).
    expect(nodeHasBrokenCjsInEsmFstat("v24.15.0")).toBe(true);
    // Upstream-reported boundaries.
    expect(nodeHasBrokenCjsInEsmFstat("v24.14.1")).toBe(true);
    expect(nodeHasBrokenCjsInEsmFstat("v25.7.0")).toBe(true);
    expect(nodeHasBrokenCjsInEsmFstat("v26.0.0")).toBe(true);
    // Healthy ranges: pre-bug 24.x and 22.x, the 24.16 backport,
    // the 26.1 fix.
    expect(nodeHasBrokenCjsInEsmFstat("v22.12.0")).toBe(false);
    expect(nodeHasBrokenCjsInEsmFstat("v24.13.0")).toBe(false);
    expect(nodeHasBrokenCjsInEsmFstat("v24.14.0")).toBe(false);
    expect(nodeHasBrokenCjsInEsmFstat("v24.16.0")).toBe(false);
    expect(nodeHasBrokenCjsInEsmFstat("v26.1.0")).toBe(false);
    // Defensive: garbage is not "affected".
    expect(nodeHasBrokenCjsInEsmFstat("not-a-version")).toBe(false);
  });
});

describe("e2e harness spawn-context contract", () => {
  test("runNode spawns with a closed stdin — an open never-fed pipe is inherited by every npm/npx grandchild on Windows and froze whole E2E runs", async () => {
    await runNode("-e", ["process.exit(0)"], { cwd: os.tmpdir() });
    const call = execFileCalls.at(-1);
    expect(call).toBeDefined();
    expect(call?.options.stdio).toEqual(["ignore", "pipe", "pipe"]);
  });

  test("runPM spawns with the same closed-stdin contract (shell path)", async () => {
    await runPM("npm", ["--version"], { cwd: os.tmpdir() });
    const call = execCalls.at(-1);
    expect(call).toBeDefined();
    expect(call?.options.stdio).toEqual(["ignore", "pipe", "pipe"]);
  });
});

describe("e2e harness bootstrap-detection contract", () => {
  // Guard on the marker's PRESENCE, not on its ORDER: the mocked
  // install here cannot delete the marker the way a real `bun install`
  // does (live-proven, dxg-probe-bunlock 2026-10-10: empty bun.lock +
  // dep-less manifest → `bun install` → gone in 57ms). This test
  // locks the marker so the guard is never silently dropped; the
  // write-AFTER-install ordering itself is proven live by the bun row
  // of database-fresh.e2e.ts, which ran red before the fix (detection
  // walked up to the user home's stray package.json and the DXG run
  // installed through yarn).
  test("bootstrapProject('bun') leaves a bun.lock marker — without it @antfu/ni detection walks UP to the user home", async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "dxg-harness-bunmarker-"));
    try {
      await bootstrapProject(dir, "bun");
      expect(existsSync(path.join(dir, "bun.lock"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("e2e harness output-assertion contract", () => {
  // Bytes captured from the real failing baseline (2026-10-10, fresh-pnpm
  // second run): under a spawned pipe stdout.columns is undefined and the
  // Clack note box wraps long summary lines at ~80 columns, inserting a
  // "│" border between the wrapped fragments. The CLI said exactly what
  // the assertions look for — a raw toContain on the wrapped bytes fails
  // on the inserted border alone. This is the archived reproduction.
  const wrappedSummary = [
    "┌  \u001b[46m\u001b[30m DXG Database Setup \u001b[39m\u001b[49m",
    "│  Skipped:",
    "│    • prisma@7.10.0 and @prisma/client@7.10.0 reinstall (already declared at  │",
    "│   the verified pin)                                                          │",
    "│    • Prisma initialization (schema.prisma or prisma7.config.ts already       │",
    "│  exists)                                                                     │",
    "│    • package.json script db:generate (already exists)                        │",
    "├──────────────────────────────────────────────────────────────────────────────╯",
  ].join("\n");

  test("the baseline defect reproduces on the archived bytes: raw toContain misses content the CLI fully said", () => {
    expect(wrappedSummary).not.toContain(
      "already declared at the verified pin",
    );
    expect(wrappedSummary).not.toContain(
      "Prisma initialization (schema.prisma or prisma7.config.ts already exists)",
    );
  });

  // Bytes rebuilt from the live 2026-10-10 evening run (kept project
  // dxg-e2e-existing-pnpm-ALfMZJ): the SAME Clack note() renders in
  // ASCII mode when the spawn inherits no unicode-terminal marker
  // (@clack/prompts 1.7.0 isUnicodeSupported: CI, WT_SESSION,
  // TERM_PROGRAM=vscode, TERM… — this VS Code session sets none of
  // them, the morning CLI-in-Windows-Terminal session set WT_SESSION).
  // Borders become "|"/"-"/"+"/"T" (S_BAR/S_BAR_H/S_BAR_START ASCII
  // fallbacks) — same wrap, same inserted border, different glyphs.
  // Per-line geometry from note()'s renderer: `${S_BAR}  ${line}${pad}${S_BAR}`.
  const wrappedSummaryAscii = [
    "o  Operation Summary -----------------------------------------------------------+",
    "|                                                                               |",
    "|  Updated:                                                                     |",
    "|    • pre-approved build scripts for @prisma/engines                          |",
    "|    • package.json                                                             |",
    "|    • package.json scripts (db:generate)                                       |",
    "|    • package.json scripts (db:push)                                           |",
    "|    • package.json scripts (db:studio)                                         |",
    "|    • package.json scripts (db:pull)                                           |",
    "|                                                                               |",
    "|  Skipped:                                                                     |",
    "|    • prisma@7.10.0 and @prisma/client@7.10.0 reinstall (already declared at  |",
    "|  the verified pin)                                                            |",
    "|    • Prisma initialization (schema.prisma or prisma7.config.ts already       |",
    "|  exists)                                                                      |",
    "|                                                                               |",
    "|  Conflicts:                                                                   |",
    "|    • lib/prisma.ts (file)                                                     |",
    "|                                                                               |",
    "+-------------------------------------------------------------------------------+",
  ].join("\n");

  test("the ASCII-mode defect reproduces the same way: raw toContain misses content the CLI fully said", () => {
    expect(wrappedSummaryAscii).not.toContain(
      "already declared at the verified pin",
    );
    expect(wrappedSummaryAscii).not.toContain(
      "Prisma initialization (schema.prisma or prisma7.config.ts already exists)",
    );
  });

  test("unwrapped() restores the said-content view in ASCII mode too: border pipes at line edges are rendering, inner pipes are content", () => {
    const flat = unwrapped(wrappedSummaryAscii);
    expect(flat).toContain("already declared at the verified pin");
    expect(flat).toContain(
      "Prisma initialization (schema.prisma or prisma7.config.ts already exists)",
    );
    expect(flat).toContain("Operation Summary");
  });

  test("unwrapped() restores the said-content view: ANSI colors, box borders and pipe-width line breaks are rendering, not content", () => {
    const flat = unwrapped(wrappedSummary);
    expect(flat).toContain("already declared at the verified pin");
    expect(flat).toContain(
      "Prisma initialization (schema.prisma or prisma7.config.ts already exists)",
    );
    expect(flat).toContain("DXG Database Setup");
    // Spinner/step glyphs (◒ ✔ ◇) are outside U+2500–U+257F and survive:
    // the helper must not erase message content that happens to render
    // as symbols.
    expect(unwrapped("◒  Installing dependencies ✔  Done ◇  Summary")).toContain(
      "Installing dependencies",
    );
  });
});
