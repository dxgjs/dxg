import type { Command } from "commander";
import { intro, isCancel, cancel, note, outro } from "@dxgjs/prompts";
import { databaseGenerator, type Generator } from "@dxgjs/generators";
import {
  formatError,
  ValidationError,
  ProviderMismatchError,
} from "@dxgjs/errors";
import type { GeneratorContext } from "@dxgjs/generators";
import {
  type CommanderOptions,
  detectProjectAwarenessSilently,
  prepareContext,
  runInTargetDirectory,
  findProjectRoot,
} from "../generator-run";
import pc from "picocolors";

/**
 * Registers the `add` command — runs a specific generator on the project.
 */
export function registerAddCommand(program: Command): void {
  program
    .command("add <generator>")
    .description("Add a generator to the project")
    .option(
      "--provider <value>",
      "Provider to use (for database: sqlite|postgresql|mysql|sqlserver|cockroachdb|planetscale|prisma-postgres)",
    )
    .option(
      "--orm <type>",
      "ORM to use: prisma (drizzle is coming soon)",
      "prisma",
    )
    .option(
      "--database-url <url>",
      "Database connection URL (DATABASE_URL) for non-interactive mode",
    )
    .option(
      "--non-interactive",
      "Do not prompt for input; fail if required values are missing",
    )
    .option("--dry-run", "Perform a dry run without making any changes")
    .option("--force", "Force overwrite of conflicting files")
    .action(async (generatorName, _options, cmd) => {
      // Merge local options with the root's global options so flags given
      // before the subcommand (e.g. `dxg --dry-run add db`) are honored
      // too. Commander's root parser consumes the flag wherever it appears;
      // without this merge the action would only see options declared
      // locally on this command, and root-level flags would be silently
      // dropped (the classic `dxg add db --dry-run` prompt bug).
      const options = cmd.optsWithGlobals() as CommanderOptions;

      try {
        const targetDir = process.cwd();
        const projectRoot = await findProjectRoot(targetDir);

        // Shared setup
        const awareness = await detectProjectAwarenessSilently(projectRoot);

        // Get generator instance - support both "db" (primary) and "database" (alias)
        const generatorMap: Record<string, Generator> = {
          db: databaseGenerator,
          database: databaseGenerator,
        };

        const generator = generatorMap[generatorName];
        if (!generator) {
          throw new ValidationError(`Unknown generator: ${generatorName}`);
        }

        // Build initial answers from CLI options and package.json
        const configAnswers = {
          name: awareness.packageJson.name,
          version: awareness.packageJson.version,
        };
        const cliAnswers = { ...options, ...configAnswers };

        // Show "DXG Database Setup" intro for the database generator in interactive terminals
        // (matches the logo visibility: skipped in CI, when piped, or with --json)
        const isDatabaseGenerator =
          generatorName === "db" || generatorName === "database";
        const isInteractive =
          process.stdout.isTTY &&
          !process.env.CI &&
          !options.json &&
          !options.nonInteractive;
        if (isDatabaseGenerator && isInteractive) {
          intro(pc.bgCyan(pc.black(" DXG Database Setup ")));
        }

        // Run generator in project root directory
        await runInTargetDirectory(projectRoot, async () => {
          const context = await prepareContext(options, awareness);
          // Cast context to match GeneratorContext expected by generators
          // The context has all required properties (fs, logger, templates, awareness, etc.)
          await generator.run(cliAnswers, context as GeneratorContext);
        });

        // Natural exit (code 0)
      } catch (err) {
        // A Clack cancellation (Ctrl+C during a prompt) is a clean user exit,
        // not an error. Render the cancellation message once at the top level
        // for consistent styling, then exit cleanly.
        if (isCancel(err)) {
          cancel("Operation cancelled");
          return;
        }

        // Special handling for ProviderMismatchError: use Clack's note() for
        // a nicely boxed display matching the success output style (single note
        // with multiple sections, like summarizeDatabase's Operation Summary).
        if (err instanceof ProviderMismatchError) {
          const { existingProvider, requestedProvider } = err;

          const sections = [
            `${pc.red(`[${err.code}]`)}: Prisma is already configured with "${existingProvider}", but you requested "${requestedProvider}"`,
            `Hints:\n${err.hints.map((h) => `  • ${h}`).join("\n")}`,
            `Info:\n  • Docs: ${err.docsUrl}\n  • Recovery: ${err.recoveryAction}`,
          ];

          note(sections.join("\n\n"), pc.red("Error"));

          // Outro: clear final message (red for error)
          outro(pc.red(`Failed to setup database for ${requestedProvider}`));

          process.exitCode = 1;
          return;
        }

        // Default formatting for other errors
        console.error(formatError(err));
        process.exitCode = 1;
      }
    });
}
