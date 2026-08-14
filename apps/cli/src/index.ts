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
    "répertoire cible (défaut : répertoire courant)",
    ".",
  )
  .action(async (targetDirRaw) => {
    try {
      const targetDir = join(process.cwd(), targetDirRaw);

      // 1��️��⃣ Détection de l'espace de travail (peut échouer ; on continue)
      try {
        await detectWorkspace(targetDir);
      } catch (_) {
        // Aucun espace de travail trouvé, on continue quand même
      }

      // 2��️��⃣ Chargement de la configuration (peut retourner des valeurs par défaut)
      const config = await loadConfig(targetDir);

      // 3��️��⃣ Collecte des réponses via l'abstraction de prompts
      const answers = await prompt(initGenerator.prompts);
      // Fusion éventuelle avec les valeurs de config (ex. nom du projet)
      const finalAnswers = {
        name: answers.name || config.name,
        description: answers.description,
      };

      // 4��️��⃣ Préparer le contexte pour le générateur
      const logger = new Logger({ minLevel: "info" });
      // Provide stat and readdir functions (not used by init generator but required by type)
      const { stat, readdir } = await import("@dxgjs/fs");
      const context = {
        logger,
        fs: { readFile, writeFile, pathExists, stat, readdir },
        templates: { render: (await import("@dxgjs/templates")).render },
      };

      // 5��️��⃣ Exécuter le générateur (qui executera validate → plan → execute → verify → summarize)
      await initGenerator.run(finalAnswers, context as any);

      // Sortie naturelle (code 0)
    } catch (err) {
      console.error(`��❌ ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

program.parse();