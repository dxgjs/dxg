import { describe, test, expect, vi, afterEach } from "vitest";
import type { Command } from "commander";

// Generator implementations are mocked: these tests exercise Commander
// parsing — how argv flags reach the action, the generator context and the
// answer mappings — not the generators themselves (covered by their own
// suites). The mocks must provide every runtime export the CLI imports,
// including the dynamic `authGenerator` import.
vi.mock("@dxgjs/generators", () => ({
  initGenerator: { run: vi.fn() },
  tailwindGenerator: { run: vi.fn() },
  databaseGenerator: { run: vi.fn() },
  authGenerator: { run: vi.fn() },
}));

// A stand-in for Clack's internal cancel symbol. vi.mock factories are
// hoisted above imports, so the symbol must live at module scope for the
// isCancel override below to see it.
const CANCEL_STANDIN = Symbol("clack:cancel");

// In the cancellation test the CLI's isCancel(error) branch must run
// exactly as it does for a genuine Clack Ctrl+C; the rest of
// @dxgjs/prompts keeps its real implementation.
vi.mock("@dxgjs/prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dxgjs/prompts")>();
  return {
    ...actual,
    isCancel: (value: unknown) => value === CANCEL_STANDIN,
  };
});

import { initGenerator, tailwindGenerator, databaseGenerator, authGenerator } from "@dxgjs/generators";
import { createProgram } from "../src/index";

/**
 * Builds the program with process.exit disabled: exitOverride() converts
 * Commander's exits into thrown errors, so parse failures surface as
 * rejections instead of killing the vitest worker. The override must be set
 * on every subcommand too — Commander stores the callback per instance, so
 * an error raised inside `add` would otherwise fall through to the real
 * process.exit.
 */
function makeProgram(): Command {
  const program = createProgram();
  program.exitOverride();
  for (const sub of program.commands) {
    sub.exitOverride();
  }
  return program;
}

/**
 * Parses argv against the real program and waits for the action to settle.
 * parseAsync (unlike parse) awaits async action handlers, which is what the
 * dxg commands use.
 */
async function runCli(argv: string[]): Promise<Command> {
  const program = makeProgram();
  await program.parseAsync(["node", "dxg", ...argv]);
  return program;
}

/**
 * Expects Commander to reject argv with an error whose message contains the
 * given fragment.
 */
async function expectCommanderError(argv: string[], fragment: string) {
  const program = makeProgram();
  await expect(program.parseAsync(["node", "dxg", ...argv])).rejects.toThrow(
    expect.objectContaining({ message: expect.stringContaining(fragment) }),
  );
}

afterEach(() => {
  // Restore the console spies, then reset generator mock call history so
  // each test asserts on its own invocation only.
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("root command (dxg -> init generator on the current directory)", () => {
  test("--dry-run reaches the init generator", async () => {
    await runCli(["--dry-run"]);

    const calls = vi.mocked(initGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [answers, context] = calls[0];
    expect(answers.dryRun).toBe(true);
    expect(context.dryRun).toBe(true);
  });

  test("--force reaches the generator context", async () => {
    await runCli(["--force"]);

    const calls = vi.mocked(initGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [, context] = calls[0];
    expect(context.force).toBe(true);
  });

  test("--verbose lowers the logger minLevel to debug", async () => {
    await runCli(["--verbose"]);

    const calls = vi.mocked(initGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [, context] = calls[0];
    // minLevel is private on Logger; probe it through a structural cast
    const logger = context.logger as unknown as { minLevel: unknown };
    expect(logger.minLevel).toBe("debug");
  });

  test("--quiet raises the logger minLevel to warn", async () => {
    await runCli(["--quiet"]);

    const calls = vi.mocked(initGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [, context] = calls[0];
    const logger = context.logger as unknown as { minLevel: unknown };
    expect(logger.minLevel).toBe("warn");
  });

  test("a positional directory argument is rejected", async () => {
    // With no registered argument, Commander treats the bare token as an
    // excess argument and fails before the action runs.
    await expectCommanderError(
      ["some-project"],
      "too many arguments. Expected 0 arguments but got 1",
    );
    await expectCommanderError(
      ["."],
      "too many arguments. Expected 0 arguments but got 1",
    );
  });
});

describe("add command (dxg add <generator>)", () => {
  test("--dry-run AFTER the subcommand activates dry run (the original collision bug)", async () => {
    await runCli(["add", "tailwind", "--dry-run"]);

    const calls = vi.mocked(tailwindGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [answers, context] = calls[0];
    expect(answers.dryRun).toBe(true);
    expect(context.dryRun).toBe(true);
  });

  test("--dry-run BEFORE the subcommand activates dry run too", async () => {
    await runCli(["--dry-run", "add", "tailwind"]);

    const calls = vi.mocked(tailwindGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [answers, context] = calls[0];
    expect(answers.dryRun).toBe(true);
    expect(context.dryRun).toBe(true);
  });

  test("--non-interactive AFTER the subcommand reaches the generator context", async () => {
    await runCli(["add", "tailwind", "--non-interactive"]);

    const calls = vi.mocked(tailwindGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [, context] = calls[0];
    expect(context.nonInteractive).toBe(true);
  });

  test("--non-interactive BEFORE the subcommand reaches the generator context too", async () => {
    await runCli(["--non-interactive", "add", "tailwind"]);

    const calls = vi.mocked(tailwindGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [, context] = calls[0];
    expect(context.nonInteractive).toBe(true);
  });

  test("--force AFTER the subcommand reaches the generator context", async () => {
    await runCli(["add", "tailwind", "--force"]);

    const calls = vi.mocked(tailwindGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [, context] = calls[0];
    expect(context.force).toBe(true);
  });

  test("--provider is forwarded as a plain answer", async () => {
    await runCli(["add", "database", "--provider", "postgresql"]);

    const calls = vi.mocked(databaseGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [answers] = calls[0];
    expect(answers.provider).toBe("postgresql");
  });

  test("add auth dispatches through the dynamic generator import", async () => {
    await runCli(["add", "auth", "--provider", "better-auth"]);

    // authGenerator is resolved via `(await import(...)).authGenerator` in
    // the action — this pins that the dynamic path dispatches like the
    // statically imported generators and forwards its answers.
    const calls = vi.mocked(authGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [answers] = calls[0];
    expect(answers.provider).toBe("better-auth");
  });

  test("a positional directory argument after the generator is rejected", async () => {
    await expectCommanderError(
      ["add", "tailwind", "some-project"],
      "too many arguments for 'add'",
    );
  });

  test("unknown generators fail with a descriptive error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const before = process.exitCode;
    try {
      await runCli(["add", "nope"]);

      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        "Error: Unknown generator: nope",
      );
      // The failed run must not dispatch to any generator
      expect(vi.mocked(initGenerator.run).mock.calls).toHaveLength(0);
      expect(vi.mocked(tailwindGenerator.run).mock.calls).toHaveLength(0);
      expect(vi.mocked(databaseGenerator.run).mock.calls).toHaveLength(0);
    } finally {
      // The action sets process.exitCode on failure; restore it so later
      // tests start from the inherited (undefined) state.
      process.exitCode = before;
    }
  });

  test("unknown generator sets the process exit code", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = process.exitCode;
    try {
      await runCli(["add", "nope"]);
      expect(process.exitCode).toBe(1);
    } finally {
      process.exitCode = before;
    }
  });

  test("cancellation (Clack cancel symbol) exits cleanly without error output", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // mockImplementationOnce (not mockImplementation): clearAllMocks resets
    // call history, not implementations — once keeps the override scoped to
    // this test's single invocation.
    vi.mocked(tailwindGenerator.run).mockImplementationOnce(async () => {
      throw CANCEL_STANDIN;
    });

    const before = process.exitCode;
    try {
      await runCli(["add", "tailwind"]);

      // isCancel(CANCEL_STANDIN) is true (see the module-level mock): the
      // CLI must treat it as a clean user exit — no error print, no failure
      // exit code.
      expect(errorSpy).not.toHaveBeenCalled();
      expect(process.exitCode).not.toBe(1);
    } finally {
      process.exitCode = before;
    }
  });
});
