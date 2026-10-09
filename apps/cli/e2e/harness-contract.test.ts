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
import * as os from "node:os";
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

const { runNode, runPM } = await import("./_helpers");

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
