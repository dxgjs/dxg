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
  .description("DXG CLI for generating project scaffolding")
  .version("0.0.0", "-v, --version")
  .option("--non-interactive", "Do not prompt for input; fail if required values are missing")
  .argument(
    "[directory]",
    "target directory (default: current directory)",
    ".",
  )
  .action(async (targetDirRaw: string, options: any) => {
    const nonInteractive = options.nonInteractive;

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
      let answers;
      if (process.env.DXG_PROJECT_NAME && process.env.DXG_PROJECT_DESCRIPTION) {
        answers = {
          name: process.env.DXG_PROJECT_NAME,
          description: process.env.DXG_PROJECT_DESCRIPTION,
        };
      } else if (nonInteractive) {
        // In non-interactive mode, fail if required values are missing
        const missing = [];
        if (!process.env.DXG_PROJECT_NAME) missing.push("DXG_PROJECT_NAME");
        if (!process.env.DXG_PROJECT_DESCRIPTION) missing.push("DXG_PROJECT_DESCRIPTION");
        throw new Error(
          `Missing required values in non-interactive mode: ${missing.join(", ")}\n` +
            "Set the corresponding environment variables."
        );
      } else {
        answers = await prompt(initGenerator.prompts);
      }
      // Potential merge with config values (e.g. project name)
      const finalAnswers = {
        name: answers.name || config.name,
        description: answers.description || config.description,
      };

      // Prepare context for the generator
      const logger = new Logger({ minLevel: "info" });
      // Provide stat and readdir functions (not used by init generator but required by type)
      const { stat, readdir, mkdir } = await import("@dxgjs/fs");
      const context = {
        logger,
        fs: { readFile, writeFile, pathExists, stat, readdir, mkdir },
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
  .option("--provider <value>", "provider to use (for database: sqlite|postgresql|mysql; for auth: better-auth|auth.js|clerk|lucia)")
  .option("--customise", "customise Tailwind settings (content paths, theme, etc.)")
  .option("--postcss", "add additional PostCSS plugins (e.g., for minification)")
  .option("--autoprefixer", "support legacy browsers (IE11, older Android)")
  .option("--install-deps", "install dependencies after generation")
  .option("--generate-config", "generate example configuration file")
  .action(async (generatorName, targetDirRaw, options: any) => {
    const nonInteractive = options.parent?.nonInteractive ?? false;

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

      // Collecting responses via CLI flags, environment variables, or prompts
      let answers: Record<string, unknown> = {};

      if (generatorName === 'tailwind') {
        // Handle Tailwind generator options
        if (options.customise !== undefined) {
          answers.customiseTailwind = options.customise;
        } else if (process.env.DXG_TAILWIND_CUSTOMISE !== undefined) {
          answers.customiseTailwind = process.env.DXG_TAILWIND_CUSTOMISE === 'true';
        }

        if (options.postcss !== undefined) {
          answers.addPostcssPlugins = options.postcss;
        } else if (process.env.DXG_TAILWIND_POSTCSS !== undefined) {
          answers.addPostcssPlugins = process.env.DXG_TAILWIND_POSTCSS === 'true';
        }

        if (options.autoprefixer !== undefined) {
          answers.installAutoprefixer = options.autoprefixer;
        } else if (process.env.DXG_TAILWIND_AUTOPREFIXER !== undefined) {
          answers.installAutoprefixer = process.env.DXG_TAILWIND_AUTOPREFIXER === 'true';
        }

        // If no values were resolved from CLI or ENV, use prompts
        if (
          options.customise === undefined &&
          process.env.DXG_TAILWIND_CUSTOMISE === undefined &&
          options.postcss === undefined &&
          process.env.DXG_TAILWIND_POSTCSS === undefined &&
          options.autoprefixer === undefined &&
          process.env.DXG_TAILWIND_AUTOPREFIXER === undefined
        ) {
          if (nonInteractive) {
            const missing = [];
            if (options.customise === undefined && process.env.DXG_TAILWIND_CUSTOMISE === undefined) missing.push("--customise or DXG_TAILWIND_CUSTOMISE");
            if (options.postcss === undefined && process.env.DXG_TAILWIND_POSTCSS === undefined) missing.push("--postcss or DXG_TAILWIND_POSTCSS");
            if (options.autoprefixer === undefined && process.env.DXG_TAILWIND_AUTOPREFIXER === undefined) missing.push("--autoprefixer or DXG_TAILWIND_AUTOPREFIXER");
            throw new Error(
              `Missing required values in non-interactive mode: ${missing.join(", ")}`
            );
          } else {
            answers = await prompt(generator.prompts);
          }
        }
      } else if (generatorName === 'database') {
        // Handle database generator options
        if (options.provider !== undefined) {
          answers.provider = options.provider;
        } else if (process.env.DXG_DATABASE_PROVIDER !== undefined) {
          answers.provider = process.env.DXG_DATABASE_PROVIDER;
        }

        // If no provider was resolved, use prompts
        if (options.provider === undefined && process.env.DXG_DATABASE_PROVIDER === undefined) {
          if (nonInteractive) {
            throw new Error(
              `Database provider is required in non-interactive mode.\n` +
                "Provide --provider <sqlite|postgresql|mysql> or set DXG_DATABASE_PROVIDER."
            );
          } else {
            answers = await prompt(generator.prompts);
          }
        }
      } else if (generatorName === 'auth') {
        // Handle auth generator options
        if (options.provider !== undefined) {
          answers.provider = options.provider;
        } else if (process.env.DXG_AUTH_PROVIDER !== undefined) {
          answers.provider = process.env.DXG_AUTH_PROVIDER;
        }

        if (options.installDeps !== undefined) {
          answers.installDependencies = options.installDeps;
        } else if (process.env.DXG_AUTH_INSTALL_DEPS !== undefined) {
          answers.installDependencies = process.env.DXG_AUTH_INSTALL_DEPS === 'true';
        }

        if (options.generateConfig !== undefined) {
          answers.generateExampleConfig = options.generateConfig;
        } else if (process.env.DXG_AUTH_GENERATE_CONFIG !== undefined) {
          answers.generateExampleConfig = process.env.DXG_AUTH_GENERATE_CONFIG === 'true';
        }

        // If no values were resolved from CLI or ENV, use prompts
        if (
          options.provider === undefined &&
          process.env.DXG_AUTH_PROVIDER === undefined &&
          options.installDeps === undefined &&
          process.env.DXG_AUTH_INSTALL_DEPS === undefined &&
          options.generateConfig === undefined &&
          process.env.DXG_AUTH_GENERATE_CONFIG === undefined
        ) {
          if (nonInteractive) {
            const missing = [];
            if (options.provider === undefined && process.env.DXG_AUTH_PROVIDER === undefined) missing.push("--provider or DXG_AUTH_PROVIDER");
            if (options.installDeps === undefined && process.env.DXG_AUTH_INSTALL_DEPS === undefined) missing.push("--install-deps or DXG_AUTH_INSTALL_DEPS");
            if (options.generateConfig === undefined && process.env.DXG_AUTH_GENERATE_CONFIG === undefined) missing.push("--generate-config or DXG_AUTH_GENERATE_CONFIG");
            throw new Error(
              `Missing required values in non-interactive mode: ${missing.join(", ")}`
            );
          } else {
            answers = await prompt(generator.prompts);
          }
        }
      } else {
        // For init generator, use existing logic
        if (process.env.DXG_PROJECT_NAME && process.env.DXG_PROJECT_DESCRIPTION) {
          answers = {
            name: process.env.DXG_PROJECT_NAME,
            description: process.env.DXG_PROJECT_DESCRIPTION,
          };
        } else if (nonInteractive) {
          // In non-interactive mode, fail if required values are missing
          const missing = [];
          if (!process.env.DXG_PROJECT_NAME) missing.push("DXG_PROJECT_NAME");
          if (!process.env.DXG_PROJECT_DESCRIPTION) missing.push("DXG_PROJECT_DESCRIPTION");
          throw new Error(
            `Missing required values in non-interactive mode: ${missing.join(", ")}\n` +
              "Set the corresponding environment variables."
          );
        } else {
          answers = await prompt(initGenerator.prompts);
        }
      }

      // Potential merge with config values (e.g. project name)
      const finalAnswers = { ...answers };
      if (answers.name === undefined && config.name !== undefined) {
        finalAnswers.name = config.name;
      }
      if (answers.description === undefined && config.description !== undefined) {
        finalAnswers.description = config.description;
      }

      // Prepare context for the generator
      const logger = new Logger({ minLevel: "info" });
      // Provide stat and readdir functions (not used by init generator but required by type)
      const { stat, readdir, mkdir } = await import("@dxgjs/fs");
      const context = {
        logger,
        fs: { readFile, writeFile, pathExists, stat, readdir, mkdir },
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