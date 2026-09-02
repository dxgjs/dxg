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

import { initGenerator, tailwindGenerator, databaseGenerator } from "@dxgjs/generators";
import { createProgram } from "../src/index";

/**
 * Parses argv against the real program and waits for the action to settle.
 * parseAsync (unlike parse) awaits async action handlers, which is what the
 * dxg commands use.
 */
async function runCli(argv: string[]): Promise<Command> {
  const program = createProgram();
  // Never let Commander call process.exit from inside vitest
  program.exitOverride();
  await program.parseAsync(["node", "dxg", ...argv]);
  return program;
}

afterEach(() => {
  // Restore the console spies, then reset generator mock call history so
  // each test asserts on its own invocation only.
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("root command (dxg [directory] -> init generator)", () => {
  test("--dry-run reaches the init generator", async () => {
    await runCli(["--dry-run", "."]);

    const calls = vi.mocked(initGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [answers, context] = calls[0];
    expect(answers.dryRun).toBe(true);
    expect(context.dryRun).toBe(true);
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

  test("generator-specific flags keep their answer-key mappings", async () => {
    await runCli([
      "add",
      "tailwind",
      "--customise",
      "--postcss",
      "--autoprefixer",
      "--install-deps",
      "--generate-config",
    ]);

    const calls = vi.mocked(tailwindGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [answers] = calls[0];
    expect(answers.customiseTailwind).toBe(true);
    expect(answers.addPostcssPlugins).toBe(true);
    expect(answers.installAutoprefixer).toBe(true);
    expect(answers.installDependencies).toBe(true);
    expect(answers.generateExampleConfig).toBe(true);
  });

  test("--provider is forwarded as a plain answer", async () => {
    await runCli(["add", "database", "--provider", "postgresql"]);

    const calls = vi.mocked(databaseGenerator.run).mock.calls;
    expect(calls).toHaveLength(1);
    const [answers] = calls[0];
    expect(answers.provider).toBe("postgresql");
  });
});

describe("showcase command (dxg showcase <demoType>)", () => {
  test("--non-interactive reaches the action and skips the interactive demo", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCli(["showcase", "ux", "--non-interactive"]);

    expect(log).toHaveBeenCalledExactlyOnceWith(
      "Running in non-interactive mode - skipping interactive demo",
    );
  });

  test("--quiet AFTER the subcommand silences the skip message", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCli(["showcase", "ux", "--non-interactive", "--quiet"]);

    expect(log).not.toHaveBeenCalled();
  });

  test("--quiet BEFORE the subcommand silences the skip message too", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await runCli(["--quiet", "showcase", "ux", "--non-interactive"]);

    expect(log).not.toHaveBeenCalled();
  });
});
