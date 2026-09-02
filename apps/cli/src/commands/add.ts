import type { Command } from "commander";
import { isCancel } from "@dxgjs/prompts";
import { initGenerator, tailwindGenerator, databaseGenerator, type Generator } from "@dxgjs/generators";
import { formatDXGError } from "../errors";
import {
  type CommanderOptions,
  detectProjectAwarenessSilently,
  prepareContext,
  runInTargetDirectory,
  findProjectRoot,
} from "../generator-run";

/**
 * Registers the `add` command — runs a specific generator on the project.
 */
export function registerAddCommand(program: Command): void {
  program
    .command("add <generator>")
    .description("Add a generator to the project")
    .option(
      "--provider <value>",
      "provider to use (for database: sqlite|postgresql|mysql; for auth: better-auth|auth.js|clerk|lucia)",
    )
    .option(
      "--non-interactive",
      "Do not prompt for input; fail if required values are missing",
    )
    .option("--dry-run", "Perform a dry run without making any changes")
    .option("--force", "Force overwrite of conflicting files")
    .option("--verbose", "Enable verbose logging")
    .option("--quiet", "Suppress non-essential output")
    .action(async (generatorName, _options, cmd) => {
      // Merge local options with the root's global options so flags given
      // before the subcommand (e.g. `dxg --dry-run add tailwind`) are honored
      // too. Commander's root parser consumes the flag wherever it appears;
      // without this merge the action would only see options declared
      // locally on this command, and root-level flags would be silently
      // dropped (the classic `dxg add tailwind --dry-run` prompt bug).
      const options = cmd.optsWithGlobals() as CommanderOptions;

      try {
        const targetDir = process.cwd();
        const projectRoot = await findProjectRoot(targetDir);

        // Shared setup
        const awareness = await detectProjectAwarenessSilently(projectRoot);
        const context = prepareContext(options, awareness);

        // Get generator instance
        const generatorMap: Record<string, Generator> = {
          init: initGenerator,
          tailwind: tailwindGenerator,
          database: databaseGenerator,
          auth: (await import("@dxgjs/generators")).authGenerator,
        };

        const generator = generatorMap[generatorName];
        if (!generator) {
          throw new Error(`Unknown generator: ${generatorName}`);
        }

        // Build initial answers from CLI options and package.json
        const configAnswers = {
          name: awareness.packageJson.name,
          version: awareness.packageJson.version
        };
        const cliAnswers = { ...options, ...configAnswers };

        // Run generator in project root directory
        await runInTargetDirectory(projectRoot, async () => {
          await generator.run(cliAnswers, context);
        });

        // Natural exit (code 0)
      } catch (err) {
        // A Clack cancellation (Ctrl+C during a prompt) is a clean user exit,
        // not an error: the generator already rendered cancel("Operation
        // cancelled"). Don't print the cancel symbol, don't fail the process.
        if (isCancel(err)) {
          return;
        }
        console.error(formatDXGError(err));
        process.exitCode = 1;
      }
    });
}
