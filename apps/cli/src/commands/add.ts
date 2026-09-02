import type { Command } from "commander";
import { isCancel } from "@dxgjs/prompts";
import { join } from "path";
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
    .argument("[directory]", "target directory (default: current directory)", ".")
    .option(
      "--provider <value>",
      "provider to use (for database: sqlite|postgresql|mysql; for auth: better-auth|auth.js|clerk|lucia)",
    )
    .option(
      "--customise",
      "customise Tailwind settings (content paths, theme, etc.)",
    )
    .option(
      "--postcss",
      "add additional PostCSS plugins (e.g., for minification)",
    )
    .option("--autoprefixer", "support legacy browsers (IE11, older Android)")
    .option("--install-deps", "install dependencies after generation")
    .option("--generate-config", "generate example configuration file")
    .option("--dry-run", "Perform a dry run without making any changes")
    .option("--force", "Force overwrite of conflicting files")
    .option("--verbose", "Enable verbose logging")
    .option("--quiet", "Suppress non-essential output")
    .action(async (generatorName, targetDirRaw, _options, cmd) => {
      // Merge local options with the root's global options so flags given
      // before the subcommand (e.g. `dxg --dry-run add tailwind`) are honored
      // too. Commander's root parser consumes the flag wherever it appears;
      // without this merge the action would only see options declared
      // locally on this command, and root-level flags would be silently
      // dropped (the classic `dxg add tailwind --dry-run` prompt bug).
      const options = cmd.optsWithGlobals() as CommanderOptions;

      try {
        const targetDir = join(process.cwd(), targetDirRaw);
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
        // Map Commander flag names to the answer keys generators consume, so
        // every option advertised by --help actually influences the run (and
        // counts as already supplied — no redundant prompt). Only set when the
        // flag was explicitly provided; absent flags fall through to the
        // generator's default/prompt behavior.
        const flagAnswers: Record<string, unknown> = {};
        if (options.customise) flagAnswers.customiseTailwind = true;
        if (options.postcss) flagAnswers.addPostcssPlugins = true;
        if (options.autoprefixer) flagAnswers.installAutoprefixer = true;
        if (options.installDeps) flagAnswers.installDependencies = true;
        if (options.generateConfig) flagAnswers.generateExampleConfig = true;
        const cliAnswers = { ...options, ...configAnswers, ...flagAnswers };

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
