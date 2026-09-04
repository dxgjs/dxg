import { Command } from "commander";
import { isCancel } from "@dxgjs/prompts";
import { initGenerator } from "@dxgjs/generators";
import { formatDXGError } from "./errors";
import {
  type CommanderOptions,
  detectProjectAwarenessSilently,
  prepareContext,
  runInTargetDirectory,
  findProjectRoot,
} from "./generator-run";
import { registerAddCommand } from "./commands/add";
import pkg from "../package.json" with { type: "json" };

/**
 * Builds the DXG CLI program: root metadata, global options, default action
 * (init generator) and subcommands. Exported so tests can parse an argv
 * against the real program without triggering the entry-point side effect.
 */
export function createProgram(): Command {
  const program = new Command();

  // Default command (no subcommand) - runs init generator on the current
  // working directory
  program
    .name("dxg")
    .description("DXG CLI for generating project scaffolding")
    .version(pkg.version, "-v, --version")
    .option(
      "--non-interactive",
      "Do not prompt for input; fail if required values are missing",
    )
    .option("--dry-run", "Perform a dry run without making any changes")
    .option("--force", "Force overwrite of conflicting files")
    .option("--verbose", "Enable verbose logging")
    .option("--quiet", "Suppress non-essential output")
    .action(async (options: CommanderOptions) => {
      try {
        const targetDir = process.cwd();
        const projectRoot = await findProjectRoot(targetDir);

        // Shared setup
        const awareness = await detectProjectAwarenessSilently(projectRoot);
        const context = await prepareContext(options, awareness);

        // Build initial answers from CLI options and package.json
        const configAnswers = {
          name: awareness.packageJson.name,
          version: awareness.packageJson.version,
        };
        const cliAnswers = { ...options, ...configAnswers };
        // Run generator in project root directory
        await runInTargetDirectory(projectRoot, async () => {
          await initGenerator.run(cliAnswers, context);
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

  // Add command - adds a specific generator
  registerAddCommand(program);

  return program;
}

// Entry point: the bin imports dist/index.js for its side effect only, so
// parsing must happen at module load — except under Vitest, where tests
// import createProgram() and drive parsing with their own argv.
if (!process.env.VITEST) {
  const program = createProgram();
  program.parse();
}
