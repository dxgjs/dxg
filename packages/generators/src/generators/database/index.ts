// Get the directory where this module is located
import { GeneratorContext, Generator } from "../../types";

// Import Clack-native UX utilities from @dxgjs/prompts
import {
  intro,
  outro,
  isCancel,
  cancel,
  spinner,
  note,
  prompt,
} from "@dxgjs/prompts";

import { fileURLToPath } from "url";
import { dirname, join, sep } from "path";
import { executeCommand } from "@dxgjs/fs";
import { parseNi, getCliCommand } from "@antfu/ni";

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine if we're in a bundled context (where __dirname points to dist/)
// In bundled context, we need to adjust the path to point to generators/database/templates/
const isBundled = __dirname.endsWith(`${sep}dist`) || __dirname.endsWith("/dist");
let templateBasePath;
if (isBundled) {
  // In bundle, templates are under generators/<generator-name>/templates/
  templateBasePath = join(__dirname, "generators", "database", "templates");
} else {
  // In source, templates are under the generator's directory
  templateBasePath = join(__dirname, "templates");
}
// Template file paths
const schemaTemplatePath = join(templateBasePath, "schema.prisma.tmpl");

// Prompt questions for the database generator
export const databasePrompts = [
  {
    type: "select" as const,
    name: "provider",
    message: "Choose your database provider:",
    default: "sqlite",
    choices: [
      { name: "SQLite", value: "sqlite" },
      { name: "PostgreSQL", value: "postgresql" },
      { name: "MySQL", value: "mysql" },
    ],
  },
] satisfies {
  type: "input" | "confirm" | "select";
  name: string;
  message: string;
  default?: unknown;
  choices?: Array<{ name: string; value: string }>;
  validate?: (input: unknown) => boolean | string;
}[];

// Validation function
export function validateDatabase(): boolean {
  // Validation will happen in the run method; we keep this for interface compliance
  // but actual validation is done in run via checkPreconditions
  return true;
}

// Precondition checks
async function checkPreconditions(ctx: GeneratorContext): Promise<void> {
  // 1. package.json must exist (we are adding to an existing project)
  const packageJsonExists = await ctx.fs.pathExists("package.json");
  if (!packageJsonExists) {
    throw new Error(
      "package.json not found. Please initialize your project (e.g., npm init) before running dxg add database."
    );
  }
}

// Check if prisma dependency is already installed in package.json
export async function isPrismaInstalled(fs: GeneratorContext['fs']): Promise<boolean> {
  try {
    const packageJsonExists = await fs.pathExists("package.json");
    if (!packageJsonExists) {
      return false;
    }
    const content = await fs.readFile("package.json", { encoding: "utf8" });
    const pkg = JSON.parse(content as string);

    // Check for prisma package
    const result = (pkg.devDependencies && pkg.devDependencies["prisma"]) ||
      (pkg.dependencies && pkg.dependencies["prisma"]);
    return !!result;
  } catch {
    // If we can't read or parse, assume not installed
    return false;
  }
}

// Planning function
export function planDatabase(answers: Record<string, unknown>) {
  const provider = answers.provider as string;

  const data = {
    provider: provider,
    providerName: getProviderName(provider),
    year: new Date().getFullYear(),
  };

  // Determine packages to install
  const packages: string[] = ["prisma"];
  if (provider !== "sqlite") {
    // For non-sqlite databases, we also need the corresponding database client
    const providerClients: Record<string, string> = {
      postgresql: "@prisma/client",
      mysql: "@prisma/client",
    };
    packages.push(providerClients[provider] || "@prisma/client");
  }

  // Determine files to create
  const filesToCreate = [
    { path: "prisma/schema.prisma", templatePath: schemaTemplatePath, data },
  ];

  return { data, packages, filesToCreate };
}

// Helper functions
function getProviderName(provider: string): string {
  const names: Record<string, string> = {
    sqlite: "SQLite",
    postgresql: "PostgreSQL",
    mysql: "MySQL"
  };
  return names[provider] || provider;
}

// Execution function
export async function executeDatabase(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planDatabase>,
): Promise<{ created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] }> {
  const { logger, fs } = ctx;
  const planToUse = plan ?? planDatabase(answers);
  const result: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] } = {
    created: [],
    updated: [],
    skipped: [],
    conflicts: [],
  };

  // Check if Prisma is already installed
  const prismaInstalled = await isPrismaInstalled(fs);
  if (prismaInstalled) {
        note("Prisma already detected. Skipping dependency installation.");
        logger.debug("[database] Prisma already detected. Skipping dependency installation.");
  } else if (!ctx.dryRun) {
        // Install dependencies using @antfu/ni getCliCommand and executeCommand
    try {
      const resolved = await getCliCommand(
        parseNi,
        ["add", "-D", ...planToUse.packages],
        {
          cwd: process.cwd(),
          programmatic: true,
        }
      );

      if (!resolved) {
        throw new Error("Failed to resolve package manager command for adding dependencies");
      }

      const { command: cmd, args, cwd: resolvedCwd } = resolved;
      const executeCwd = resolvedCwd ?? process.cwd();

      const s = spinner();
      s.start(`Installing dependencies: ${planToUse.packages.join(", ")}`);
      await executeCommand(cmd, args, {
        cwd: executeCwd,
        stdio: "inherit"
      });
      s.stop(`Successfully installed: ${planToUse.packages.join(", ")}`);
    } catch (error) {
      throw new Error(
        `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  } else {
    // In dry-run mode, note that we would install dependencies
        note("[database] Dry-run: Would install dependencies");
  }

  // Handle schema file
  for (const { path, templatePath, data } of planToUse.filesToCreate) {
    // Read the template file with utf8 encoding to get a string directly
    let template: string;
    try {
      template = (await fs.readFile(templatePath, { encoding: "utf8" })) as string;
    } catch (error) {
      throw new Error(
        `Failed to read template file ${templatePath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }

    const rendered = ctx.templates.render(template, data);
    const exists = await fs.pathExists(path);

    if (exists) {
      // Check if it's a file or directory
      const stats = await fs.stat(path);
      const isDirectory = stats.isDirectory();

      if (isDirectory) {
        // Directory collision - expected path is occupied by a directory
        result.conflicts.push({ path, existsAs: 'directory' });
        continue;
      }

      // It's a file, check content
      const current = (await fs.readFile(path, { encoding: "utf8" })) as string;
      if (current === rendered) {
        result.skipped.push(path);
        continue;
      }

      // File exists with different content - handle based on dryRun and force flags
      if (ctx.dryRun) {
        // In dry-run mode, report as conflict (would need user interaction or force to resolve)
        result.conflicts.push({ path, existsAs: 'file' });
        continue;
      }

      if (ctx.force) {
        // Force overwrite
        await fs.writeFile(path, rendered, "utf8");
        result.updated.push(path);
        continue;
      }

      // Without force, treat as conflict
      result.conflicts.push({ path, existsAs: 'file' });
      continue;
    } else {
      // Path doesn't exist, check if parent directory would be a file collision
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) {
        const dirExists = await fs.pathExists(dir);
        if (dirExists) {
          const dirStats = await fs.stat(dir);
          if (dirStats.isFile()) {
            // Parent path is occupied by a file
            result.conflicts.push({ path: dir, existsAs: 'file' });
            continue;
          }
        }
      }

      // Safe to create
      if (!ctx.dryRun) {
        // Ensure the directory exists
        if (dir && !(await fs.pathExists(dir))) {
          await fs.mkdir(dir, { recursive: true });
        }
        await fs.writeFile(path, rendered, "utf8");
      }
      result.created.push(path);
    }
  }

  return result;
}

// Verification function
export async function verifyDatabase(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planDatabase>,
): Promise<void> {
  const { fs } = ctx;
  const planToUse = plan ?? planDatabase(answers);

  // Verify that the schema file exists if it was supposed to be created
  for (const { path } of planToUse.filesToCreate) {
    const exists = await fs.pathExists(path);
    if (!exists) {
      throw new Error(`Expected file missing after generation: ${path}`);
    }
  }
}

// Summarize function using Clack UX (replaces logger-based summarization)
export function summarizeDatabase(
  answers: Record<string, unknown>,
  result: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] },
  ctx: GeneratorContext,
): void {
  const { logger } = ctx;
  const { created, updated, skipped, conflicts } = result;
  if (created.length) {
    note(`Created: ${created.join(", ")}`);
  }
  if (updated.length) {
    note(`Updated: ${updated.join(", ")}`);
  }
  if (skipped.length) {
    note(`Unchanged: ${skipped.join(", ")}`);
  }
  if (conflicts.length) {
    const conflictDetails = conflicts.map(c => `${c.path} (${c.existsAs})`).join(", ");
    note(`Conflicts: ${conflictDetails}`);
  }

  logger.debug(`Database generator completed successfully (provider: ${answers.provider})`);
  note(`Database generator completed successfully (provider: ${answers.provider})`);
}


/**
 * Database generator – satisfies the Generator interface.
 * The run method executes the full pipeline: validate → plan → execute → verify → summarize.
 */
export const databaseGenerator: Generator = {
  name: "database",
  description: "Adds Prisma ORM with a selected database provider",
  prompts: databasePrompts,
  async run(cliAnswers: Record<string, unknown>, context: GeneratorContext) {
    const ctx = context;

    // Intro
    intro("DXG Database Setup");

    // Collect inputs - use CLI/provided answers, fallback to interactive prompts
    let answers = { ...cliAnswers };

    // Check if we need to prompt for missing required fields
    const needsProvider = answers.provider === undefined;

    // Only prompt in interactive mode
    const shouldPrompt = !(ctx.dryRun === true && Object.keys(cliAnswers).length > 0) && !process.env.CI; // Simple check for non-interactive

    if (needsProvider && shouldPrompt) {
      // Use interactive prompts for missing fields
      const promptQuestions = [];

      if (needsProvider) {
        promptQuestions.push(databasePrompts[0]); // provider prompt
      }

      let promptAnswers: Record<string, unknown>;
      try {
        promptAnswers = await prompt(promptQuestions as Parameters<typeof prompt>[0]);
      } catch (error) {
        // Handle cancellation during interactive input collection
        if (isCancel(error)) {
          cancel("Operation cancelled");
        }
        throw error;
      }
      answers = { ...answers, ...promptAnswers };
    } else if (needsProvider && !shouldPrompt) {
      // In non-interactive mode, throw error for missing required values
      const missing = [];
      if (needsProvider) missing.push("provider");
      throw new Error(`Missing required values in non-interactive mode: ${missing.join(", ")}`);
    }

    // Validate preconditions
    await checkPreconditions(ctx);

    // Validate (interface compliance)
    if (!validateDatabase()) {
      // Use Clack cancel for validation failure
      cancel("Invalid responses for database generator");
      throw new Error("Invalid responses for database generator");
    }

    // Plan
    const plan = planDatabase(answers);

    // Use spinner for file creation operations
    const s = spinner();
    s.start("Setting up database...");

    try {
      // Execute
      const execResult = await executeDatabase(answers, ctx, plan);

      // Verify (skip in dry-run mode)
      if (!ctx.dryRun) {
        await verifyDatabase(answers, ctx, plan);
      }

      // Stop spinner
      s.stop();

      // Summarize using Clack UX
      summarizeDatabase(answers, execResult, ctx);

      // Outro
      outro(`Database setup completed for ${answers.provider}!`);
    } catch (error) {
      // Stop spinner on error
      s.stop();

      // Handle cancellation
      if (isCancel(error)) {
        cancel("Operation cancelled");
        throw error;
      }

      // Handle other errors
      note(`Error: ${error instanceof Error ? error.message : String(error)}`);
      outro(`Failed to setup database for ${answers.provider}`);
      throw error;
    }
  },
};

// Default export for convenience
export default databaseGenerator;