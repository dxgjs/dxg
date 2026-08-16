import { Command } from "commander";
import { detectWorkspace } from "@dxgjs/workspace";
import { loadConfig } from "@dxgjs/config";
import { prompt } from "@dxgjs/prompts";
import { Logger } from "@dxgjs/logger";
import { join } from "path";
import { readFile, writeFile, pathExists } from "@dxgjs/fs";
import { initGenerator } from "@dxgjs/generators";
import { tailwindGenerator } from "@dxgjs/generators";
import { databaseGenerator } from "@dxgjs/generators";

const program = new Command();

program
  .name("dxg")
  .description("DXG CLI")
  .version("0.0.0", "-v, --version")
  .argument(
    "[directory]",
    "target directory (default: current directory)",
    ".",
  )
  .action(async (targetDirRaw) => {
    // If no subcommand is given, run init generator
    try {
      const targetDir = join(process.cwd(), targetDirRaw);

      // Workspace detection (may fail; we continue anyway)
      try {
        await detectWorkspace(targetDir);
      } catch (_) {
        // No workspace found, we continue anyway
      }

      // Loading configuration (may return default values)
      const config = await loadConfig(targetDir);

      // Collecting responses via the prompt abstraction for init generator
      const answers = await prompt(initGenerator.prompts);
      // Potential merge with config values (e.g. project name)
      const finalAnswers = {
        name: answers.name || config.name,
        description: answers.description,
      };

      // Prepare context for the generator
      const logger = new Logger({ minLevel: "info" });
      // Provide stat and readdir functions (not used by init generator but required by type)
      const { stat, readdir } = await import("@dxgjs/fs");
      const context = {
        logger,
        fs: { readFile, writeFile, pathExists, stat, readdir },
        templates: { render: (await import("@dxgjs/templates")).render },
      };

      // Change to target directory, run generator, then change back
      const originalDir = process.cwd();
      try {
        process.chdir(targetDir);
        await initGenerator.run(finalAnswers, context as any);
      } finally {
        process.chdir(originalDir);
      }

      // Natural exit (code 0)
    } catch (err) {
      console.error(` ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

program
  .command("add <generator>")
  .description("Add a generator to the project")
  .argument("[directory]", "target directory (default: current directory)", ".")
  .action(async (generatorName, targetDirRaw) => {
    try {
      const targetDir = join(process.cwd(), targetDirRaw);

      // Workspace detection (may fail; we continue anyway)
      try {
        await detectWorkspace(targetDir);
      } catch (_) {
        // No workspace found, we continue anyway
      }

      // Loading configuration (may return default values)
      const config = await loadConfig(targetDir);

      // Map of available generators
      const generatorMap: Record<string, any> = {
        init: initGenerator,
        tailwind: tailwindGenerator,
        database: databaseGenerator,
        auth: (await import("@dxgjs/generators")).authGenerator,
      };

      const generator = generatorMap[generatorName];
      if (!generator) {
        throw new Error(`Unknown generator: ${generatorName}`);
      }

      // Collecting responses via the prompt abstraction for the selected generator
      const answers = await prompt(generator.prompts);
      // Potential merge with config values (e.g. project name)
      const finalAnswers = { ...answers };
      if (answers.name === undefined && config.name !== undefined) {
        finalAnswers.name = config.name;
      }

      // Prepare context for the generator
      const logger = new Logger({ minLevel: "info" });
      // Provide stat and readdir functions (not used by init generator but required by type)
      const { stat, readdir } = await import("@dxgjs/fs");
      const context = {
        logger,
        fs: { readFile, writeFile, pathExists, stat, readdir },
        templates: { render: (await import("@dxgjs/templates")).render },
      };

      // Change to target directory, run generator, then change back
      const originalDir = process.cwd();
      try {
        process.chdir(targetDir);
        await generator.run(finalAnswers, context as any);
      } finally {
        process.chdir(originalDir);
      }

      // Natural exit (code 0)
    } catch (err) {
      console.error(` ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

program.parse();