import { Command } from "commander";
import { detectWorkspace } from "@dxgjs/workspace";
import { loadConfig } from "@dxgjs/config";
import { prompt } from "@dxgjs/prompts";
import { initGenerator } from "@dxgjs/generators";
import { Logger } from "@dxgjs/logger";
import { join } from "path";
import { readFile, writeFile, pathExists } from "@dxgjs/fs";

const program = new Command();

program
  .name("dxg")
  .description("DXG CLI – Phase 2")
  .version("0.0.0", "-v, --version")
  .argument(
    "[directory]",
    "target directory (default: current directory)",
    ".",
  )
  .action(async (targetDirRaw) => {
    try {
      const targetDir = join(process.cwd(), targetDirRaw);

      //  Workspace detection (may fail; we continue anyway)
      try {
        await detectWorkspace(targetDir);
      } catch (_) {
        // No workspace found, we continue anyway
      }

      //  Loading configuration (may return default values)
      const config = await loadConfig(targetDir);

      //  Collecting responses via the prompt abstraction
      const answers = await prompt(initGenerator.prompts);
      // Potential merge with config values (e.g. project name)
      const finalAnswers = {
        name: answers.name || config.name,
        description: answers.description,
      };

      //  Prepare context for the generator
      const logger = new Logger({ minLevel: "info" });
      // Provide stat and readdir functions (not used by init generator but required by type)
      const { stat, readdir } = await import("@dxgjs/fs");
      const context = {
        logger,
        fs: { readFile, writeFile, pathExists, stat, readdir },
        templates: { render: (await import("@dxgjs/templates")).render },
      };

      //  Execute the generator (which will perform validate → plan → execute → verify → summarize)
      await initGenerator.run(finalAnswers, context as any);

      // Sortie naturelle (code 0)
    } catch (err) {
      console.error(` ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

program.parse();
