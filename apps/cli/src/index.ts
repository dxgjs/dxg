import { Command } from "commander";
import { detectWorkspace } from "@dxgjs/workspace";
import { loadConfig } from "@dxgjs/config";
import { prompt, type PromptQuestion } from "@dxgjs/prompts";
import { Logger, type LogLevel } from "@dxgjs/logger";
import { join, dirname } from "path";
import {
  readFile,
  writeFile,
  pathExists,
  stat,
  readdir,
  mkdir,
} from "@dxgjs/fs";
import { initGenerator, type Generator } from "@dxgjs/generators";
import type { DXGConfig } from "@dxgjs/config";
import { tailwindGenerator } from "@dxgjs/generators";
import { databaseGenerator } from "@dxgjs/generators";
import { render as templatesRender } from "@dxgjs/templates";
import { DXGError, formatDXGError } from "./errors";
import pkg from "../package.json" with { type: "json" };

const program = new Command();

// Helper functions to eliminate duplication

/**
 * Attempts to detect workspace, logs warning on failure but continues
 */
async function detectWorkspaceSilently(targetDir: string): Promise<void> {
  try {
    await detectWorkspace(targetDir);
  } catch {
    // No workspace found, we continue anyway
  }
}

/**
 * Loads configuration, returns default values on failure
 */
async function loadConfigSilently(targetDir: string) {
  return await loadConfig(targetDir);
}

/**
 * Prepares the generator context with logger, fs, and templates
 */
function prepareContext(options: CommanderOptions) {
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
    fs: { readFile, writeFile, pathExists, stat, readdir, mkdir },
    templates: { render: templatesRender },
    dryRun: options.dryRun ?? false,
    force: options.force ?? false,
  };
}

/**
 * Runs a function in the target directory and returns to original directory
 */
async function runInTargetDirectory<T>(targetDir: string, fn: () => Promise<T>): Promise<T> {
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

/**
 * Merges answers with config values for name and description
 */
function mergeAnswersWithConfig(answers: Record<string, unknown>, config: DXGConfig) {
  const finalAnswers = { ...answers };
  if (answers.name === undefined && config.name !== undefined) {
    finalAnswers.name = config.name;
  }
  if (answers.description === undefined && config.description !== undefined) {
    finalAnswers.description = config.description;
  }
  return finalAnswers;
}

/**
 * Answer definition for collecting values from CLI options, environment variables, or prompts
 */
interface AnswerDef {
  name: string;
  option?: string; // CLI option name (e.g., 'customise')
  env?: string; // Environment variable name (e.g., 'DXG_TAILWIND_CUSTOMISE')
  type?: "boolean" | "string";
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
async function collectAnswersForGenerator(
  generatorName: string,
  options: CommanderOptions,
  nonInteractive: boolean,
  prompts: PromptQuestion[],
  answerDefs: AnswerDef[],
): Promise<Record<string, unknown>> {
  const answers: Record<string, unknown> = {};
  const missing: string[] = [];

  for (const def of answerDefs) {
    let value: unknown = undefined;

    // 1. Check CLI option (if defined)
    if (def.option !== undefined && options[def.option] !== undefined) {
      value = options[def.option];
    }
    // 2. Check environment variable
    else if (def.env !== undefined && process.env[def.env] !== undefined) {
      const envVal = process.env[def.env];
      if (def.type === "boolean") {
        value = envVal === "true";
      } else {
        value = envVal;
      }
    }
    // 3. If not found via CLI/env, mark as missing (will prompt if interactive)
    else {
      missing.push(def.name);
    }

    if (value !== undefined) {
      answers[def.name] = value;
    }
  }

  // If in non-interactive mode and we have missing values, throw error
  if (nonInteractive && missing.length > 0) {
    throw new DXGError(
      `Missing required values in non-interactive mode for generator '${generatorName}': ${missing.join(", ")}`,
      {
        hint: "Cannot prompt for input in non-interactive mode",
        suggestion:
          "Set the corresponding environment variables (e.g., DXG_PROJECT_NAME) or provide CLI options (e.g., --name)",
      },
    );
  }

  // If interactive and we have missing values, prompt for all answers
  if (!nonInteractive && missing.length > 0) {
    const promptAnswers = await prompt(prompts);
    // Merge prompted answers with any CLI/env values we already collected
    return { ...answers, ...promptAnswers };
  }

  return answers;
}

// Answer definition mappings for each generator
const initAnswerDefs: AnswerDef[] = [
  { name: "name", env: "DXG_PROJECT_NAME" },
  { name: "description", env: "DXG_PROJECT_DESCRIPTION" },
];

const tailwindAnswerDefs: AnswerDef[] = [
  {
    name: "customiseTailwind",
    option: "customise",
    env: "DXG_TAILWIND_CUSTOMISE",
    type: "boolean",
  },
  {
    name: "addPostcssPlugins",
    option: "postcss",
    env: "DXG_TAILWIND_POSTCSS",
    type: "boolean",
  },
  {
    name: "installAutoprefixer",
    option: "autoprefixer",
    env: "DXG_TAILWIND_AUTOPREFIXER",
    type: "boolean",
  },
];

const databaseAnswerDefs: AnswerDef[] = [
  {
    name: "provider",
    option: "provider",
    env: "DXG_DATABASE_PROVIDER",
    type: "string",
  },
];

const authAnswerDefs: AnswerDef[] = [
  {
    name: "provider",
    option: "provider",
    env: "DXG_AUTH_PROVIDER",
    type: "string",
  },
  {
    name: "installDependencies",
    option: "installDeps",
    env: "DXG_AUTH_INSTALL_DEPS",
    type: "boolean",
  },
  {
    name: "generateExampleConfig",
    option: "generateConfig",
    env: "DXG_AUTH_GENERATE_CONFIG",
    type: "boolean",
  },
];

// Map generator names to their answer definitions
const answerDefsMap: Record<string, AnswerDef[]> = {
  init: initAnswerDefs,
  tailwind: tailwindAnswerDefs,
  database: databaseAnswerDefs,
  auth: authAnswerDefs,
};

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
    const nonInteractive = options.nonInteractive;

    try {
      const targetDir = join(process.cwd(), targetDirRaw);
      const projectRoot = await findProjectRoot(targetDir);

      // Shared setup
      await detectWorkspaceSilently(projectRoot);
      const config = await loadConfigSilently(projectRoot);
      const context = prepareContext(options);

      // Collect answers for init generator
      const answers = await collectAnswersForGenerator(
        "init",
        options,
        nonInteractive,
        initGenerator.prompts,
        initAnswerDefs,
      );

      // Merge with config
      const finalAnswers = mergeAnswersWithConfig(answers, config);

      // Run generator in project root directory
      await runInTargetDirectory(projectRoot, async () => {
        await initGenerator.run(finalAnswers, context);
      });

      // Natural exit (code 0)
    } catch (err) {
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
    const nonInteractive = options.nonInteractive ?? false;

    try {
      const targetDir = join(process.cwd(), targetDirRaw);
      const projectRoot = await findProjectRoot(targetDir);

      // Shared setup
      await detectWorkspaceSilently(projectRoot);
      const config = await loadConfigSilently(projectRoot);
      const context = prepareContext(options);

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

      // Get answer definitions for this generator
      const answerDefs = answerDefsMap[generatorName];
      if (!answerDefs) {
        throw new Error(
          `No answer definitions found for generator: ${generatorName}`,
        );
      }

      // Collect answers for this generator
      const answers = await collectAnswersForGenerator(
        generatorName,
        options,
        nonInteractive,
        generator.prompts,
        answerDefs,
      );

      // Merge with config (for name and description if applicable)
      const finalAnswers = mergeAnswersWithConfig(answers, config);

      // Run generator in project root directory
      await runInTargetDirectory(projectRoot, async () => {
        await generator.run(finalAnswers, context);
      });

      // Natural exit (code 0)
    } catch (err) {
      console.error(formatDXGError(err));
      process.exitCode = 1;
    }
  });

program.parse();
