import { Command } from "commander";
import { detectProjectAwareness, type ProjectAwareness } from "@dxgjs/workspace";
import {
  intro,
  outro,
  note,
  select,
  isCancel,
  cancel,
  spinner,
} from "@dxgjs/prompts";
import { Logger, type LogLevel } from "@dxgjs/logger";
import { join, dirname } from "path";
import {
  readFile,
  writeFile,
  pathExists,
  stat,
  readdir,
  mkdir,
  readJson,
  writeJson,
} from "@dxgjs/fs";
import { initGenerator, type Generator } from "@dxgjs/generators";
import { tailwindGenerator } from "@dxgjs/generators";
import { databaseGenerator } from "@dxgjs/generators";
import { render as templatesRender } from "@dxgjs/templates";
import pc from "picocolors";
import { formatDXGError } from "./errors";
import pkg from "../package.json" with { type: "json" };

const program = new Command();

// Helper functions to eliminate duplication

/**
 * Attempts to detect project awareness, returns a default awareness on failure but continues
 */
async function detectProjectAwarenessSilently(targetDir: string): Promise<ProjectAwareness> {
  try {
    return await detectProjectAwareness(targetDir);
  } catch {
    // Return a minimal awareness object to allow continuation
    return {
      projectRoot: targetDir,
      workspaceRoot: targetDir,
      framework: { name: "unknown", detected: false },
      language: { name: "typescript", detected: false },
      packageManager: "unknown",
      styling: { name: "", detected: false, version: null, configFile: null },
      capabilities: { hasTests: false, hasLinting: false, hasFormatter: false, hasCI: false, hasDocker: false },
      packageJson: {
        name: "",
        version: undefined,
        private: true,
        workspaces: undefined,
        dependencies: undefined,
        devDependencies: undefined,
        peerDependencies: undefined,
        scripts: undefined,
      },
    };
  }
}

/**
 * Prepares the generator context with logger, fs, and templates
 */
function prepareContext(options: CommanderOptions, awareness: ProjectAwareness) {
  // Determine log level based on verbosity options
  let minLevel: LogLevel = "info";
  if (options.verbose) {
    minLevel = "debug";
  } else if (options.quiet) {
    minLevel = "warn";
  }

  const logger = new Logger({ minLevel });
  // Provide stat and readdir functions (not used by all generators but required by type)
  return {
    logger,
    fs: { readFile, writeFile, pathExists, stat, readdir, mkdir, readJson, writeJson },
    templates: { render: templatesRender },
    awareness,
    dryRun: options.dryRun ?? false,
    force: options.force ?? false,
    nonInteractive: options.nonInteractive ?? false,
  };
}

/**
 * Runs a function in the target directory and returns to original directory
 */
async function runInTargetDirectory<T>(
  targetDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalDir = process.cwd();
  try {
    process.chdir(targetDir);
    return await fn();
  } finally {
    process.chdir(originalDir);
  }
}

/**
 * Finds the nearest directory containing a package.json by walking upward from the start directory.
 * @param startDir - The directory to start searching from.
 * @returns The absolute path to the directory containing a package.json, or the startDir if none found.
 */
async function findProjectRoot(startDir: string): Promise<string> {
  let current = startDir;
  while (true) {
    const packageJsonPath = join(current, "package.json");
    try {
      await stat(packageJsonPath);
      // If we get here, the file exists.
      return current;
    } catch {
      // File does not exist or we cannot access it, continue upward.
    }
    const parent = dirname(current);
    if (parent === current) {
      // We've reached the filesystem root.
      break;
    }
    current = parent;
  }
  // If we didn't find any package.json, return the startDir.
  return startDir;
}



interface CommanderOptions {
  verbose: boolean;
  quiet: boolean;
  dryRun: boolean;
  force: boolean;
  nonInteractive: boolean;
  [key: string]: unknown; // For any other Commander options
}

/**
 * Collects answers for a generator from CLI options, environment variables, or prompts
 * @param generatorName Name of the generator (for error messages)
 * @param options Commander options object
 * @param nonInteractive Whether to run in non-interactive mode
 * @param prompts Generator's prompt definitions
 * @param answerDefs Mapping of how to collect each answer
 */

/**
 * Runs the UX showcase demo
 */
async function runUxDemo(options: { nonInteractive: boolean; quiet: boolean }) {
  const { nonInteractive, quiet } = options;

  // Handle non-interactive mode
  if (nonInteractive) {
    if (!quiet) {
      // Using console.log for simple message in non-interactive mode
      // In a real implementation, we would use the logger if available
      console.log(
        "Running in non-interactive mode - skipping interactive demo",
      );
    }
    return;
  }

  // Show DXG-branded intro
  intro(pc.bgCyan(pc.black(`DXG UX Showcase CLI v${pkg.version}`)));

  // Step 1: Select database layer architecture
  const architectureChoice = await select({
    message: "Select your database layer architecture:",
    options: [
      {
        label: "Prisma + Kysely Combo",
        value: "prisma-kysely",
        hint: "Best of both worlds: Prisma migrations + Kysely performance",
      },
      {
        label: "Prisma Only",
        value: "prisma-only",
        hint: "Traditional and simple setup",
      },
    ],
  });

  // Handle cancellation using Clack's native cancel
  if (isCancel(architectureChoice)) {
    cancel("Demo cancelled");
    return;
  }

  // Step 2: Conditional second select based on architecture
  let databaseChoice;
  if (architectureChoice === "prisma-kysely") {
    databaseChoice = await select({
      message: "Which database dialect are you using in Prisma?",
      options: [
        {
          label: "PostgreSQL",
          value: "postgresql",
          hint: "Supabase, Neon, CockroachDB, etc.",
        },
        {
          label: "MySQL",
          value: "mysql",
          hint: "PlanetScale, MariaDB, etc.",
        },
        {
          label: "SQLite",
          value: "sqlite",
          hint: "Local file, Turso, etc.",
        },
      ],
    });
  } else if (architectureChoice === "prisma-only") {
    databaseChoice = await select({
      message: "Which database provider is configured in your schema.prisma?",
      options: [
        { label: "postgresql", value: "postgresql" },
        { label: "mysql", value: "mysql" },
        { label: "sqlite", value: "sqlite" },
      ],
    });
  }

  // Handle cancellation using Clack's native cancel
  if (isCancel(databaseChoice)) {
    cancel("Demo cancelled");
    return;
  }

  // Step 1: Configuring project files and schema
  const s = spinner();
  s.start("Configuring project files and schema...");
  await new Promise((resolve) => setTimeout(resolve, 1500)); // 1.5 seconds
  s.stop("Configured project files and schema successfully.");

  // Step 2: Installing required dependencies
  s.start("Installing required dependencies...");
  await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 seconds
  s.stop("Dependencies installed.");

  // Step 3: Running database type generation (only for Prisma + Kysely)
  if (architectureChoice === "prisma-kysely") {
    s.start("Running database type generation...");
    await new Promise((resolve) => setTimeout(resolve, 1500)); // 1.5 seconds
    s.stop("Database types generated.");
  }

  // Step 4: Generating Better Auth configuration
  s.start("Generating Better Auth configuration...");
  await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second
  s.stop("Better Auth configuration generated.");

  // Show structured informational note
  note(
    `1. Your schema.prisma has been updated.\n2. auth.ts is ready with ${databaseChoice} configurations.`,
    "What to do next?",
  );

  // Show branded success outro
  outro(
    pc.green(
      `Success! Better Auth is now fully configured. Run ${pc.bold("npx auth@latest generate")} to complete the setup.`,
    ),
  );
}

// Default command (no subcommand) - runs init generator
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
  .argument("[directory]", "target directory (default: current directory)", ".")
  .action(async (targetDirRaw: string, options: CommanderOptions) => {
    try {
      const targetDir = join(process.cwd(), targetDirRaw);
      const projectRoot = await findProjectRoot(targetDir);

      // Shared setup
      const awareness = await detectProjectAwarenessSilently(projectRoot);
      const context = prepareContext(options, awareness);

      // Build initial answers from CLI options and package.json
      const configAnswers = {
        name: awareness.packageJson.name,
        version: awareness.packageJson.version
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

// Demo command - showcases DXG terminal UX
program
  .command("showcase <demoType>")
  .description("Run DXG demonstrations and showcases")
  .option(
    "--non-interactive",
    "Do not prompt for input; fail if required values are missing",
  )
  .option("--quiet", "Suppress non-essential output")
  .action(async (demoType, options: CommanderOptions) => {
    // Access options correctly using the pattern that works for non-conflicting options
    const nonInteractive = (options["nonInteractive"] ?? false) as boolean;
    const quiet = (options["quiet"] ?? false) as boolean;

    try {
      if (demoType === "ux") {
        await runUxDemo({ nonInteractive, quiet });
      } else {
        throw new Error(`Unknown demo type: ${demoType}`);
      }
    } catch (err) {
      // A Clack cancellation (Ctrl+C during a demo prompt) is a clean user
      // exit — the demo already rendered its cancel message.
      if (isCancel(err)) {
        return;
      }
      console.error(formatDXGError(err));
      process.exitCode = 1;
    }
  });

// Add command - adds a specific generator
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
  .action(async (generatorName, targetDirRaw, options: CommanderOptions) => {

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

program.parse();
