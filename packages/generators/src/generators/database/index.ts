import { GeneratorContext, Generator } from "../../types";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { detectPackageManager } from "@dxgjs/fs";

// Get the directory where this module is located
// DEBUG LINE ADDED
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Template file paths
const schemaTemplatePath = join(__dirname, "schema.prisma.tmpl");

// Prompt questions for the database generator
export const databasePrompts = [
  {
    type: "select" as const,
    name: "provider",
    message: "Choose your database provider:",
    default: "sqlite", // SQLite
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
export function validateDatabase(_answers: Record<string, unknown>): boolean {
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

// Check if Prisma is already installed in package.json
export async function isPrismaInstalled(fs: GeneratorContext['fs']): Promise<boolean> {
  try {
    const packageJsonExists = await fs.pathExists("package.json");
    if (!packageJsonExists) return false;
    const content = await fs.readFile("package.json", { encoding: "utf8" });
    const pkg = JSON.parse(content as string);
    const result = (
      (pkg.devDependencies && pkg.devDependencies.prisma) ||
      (pkg.dependencies && pkg.dependencies.prisma)
    );
    return result;
  } catch (error) {
    // If we can't read or parse, assume not installed
    return false;
  }
}


// Planning function
export function planDatabase(answers: Record<string, unknown>) {
  const data = {
    provider: answers.provider,
    year: new Date().getFullYear(),
  };

  // Determine packages to install
  const packages = ["prisma"]; // We always install prisma as devDependency

  // Determine files to create
  const filesToCreate = [];
  const schemaPath = "prisma/schema.prisma";
  filesToCreate.push({ path: schemaPath, templatePath: schemaTemplatePath, data });

  return { data, packages, filesToCreate };
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
    console.log("[executeDatabase] Prisma is installed, skipping.");
    logger.info(" Prisma already detected. Skipping dependency installation.");
  } else if (!ctx.dryRun) {
    console.log("[executeDatabase] Prisma is not installed, installing.");
    // Install dependencies
    try {
      // Detect package manager
      const packageManager = await detectPackageManager(undefined);
      const installCommand = getInstallCommand(packageManager, planToUse.packages, true); // true for devDependency
      console.log("[executeDatabase] packageManager:", packageManager);
      console.log("[executeDatabase] installCommand:", installCommand);
      // logger.info(`Installing dependencies: ${planToUse.packages.join(", ")}`);
      console.log("[executeDatabase] Before execSync call");
		      console.log("[executeDatabase] installCommand:", installCommand);
      execSync(installCommand, { stdio: "inherit" });
    } catch (error) {
      throw new Error(
        `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`
      );
  }
  } else {
    // In dry-run mode, log that we would install dependencies
    console.log("[executeDatabase] Prisma is not installed, but dry-run: skipping installation")
    logger.info("[database] Dry-run: Would install dependencies")
  }

  // Handle schema file
  for (const { path, templatePath, data } of planToUse.filesToCreate) {
    // Read the template file with utf8 encoding to get a string directly
    let template: string;
    try {
      template = (await fs.readFile(templatePath, { encoding: "utf8" })) as string;
    } catch (error) {
      throw new Error(
        `Failed to read template file ${templatePath}: ${error instanceof Error ? error.message : String(error)}`
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
  _answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planDatabase>,
): Promise<void> {
  const { fs } = ctx;
  const planToUse = plan ?? planDatabase(_answers);

  // Verify that the schema file exists and contains the expected provider
  for (const { path } of planToUse.filesToCreate) {
    const exists = await fs.pathExists(path);
    if (!exists) {
      throw new Error(`Expected file missing after generation: ${path}`);
    }

    const content = (await fs.readFile(path, { encoding: "utf8" })) as string;
    // Check that the provider is set correctly in the schema
    const providerLine = `provider = "${_answers.provider}"`;
    if (!content.includes(providerLine)) {
      throw new Error(`Generated schema missing expected provider: ${providerLine}`);
    }
  }
}

// Summarize function
export function summarizeDatabase(
  _answers: Record<string, unknown>,
  result: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] },
  ctx: GeneratorContext,
): void {
  const { logger } = ctx;
  const { created, updated, skipped, conflicts } = result;

  if (created.length) {
    logger.info(` Created: ${created.join(", ")}`);
  }
  if (updated.length) {
    logger.info(` Updated: ${updated.join(", ")}`);
  }
  if (skipped.length) {
    logger.info(` Unchanged: ${skipped.join(", ")}`);
  }
  if (conflicts.length) {
    const conflictDetails = conflicts.map(c => `${c.path} (${c.existsAs})`).join(", ");
    logger.warn(` Conflicts: ${conflictDetails}`);
  }

  logger.info(` Database generator completed successfully`);
}

// Get the install command for the detected package manager
function getInstallCommand(packageManager: "npm" | "pnpm" | "yarn" | "bun", packages: string[], isDevDependency: boolean): string {
  const devFlag = isDevDependency ? "-D" : ""; // Save as dev dependency
  switch (packageManager) {
    case "pnpm":
      return `pnpm add ${devFlag} ${packages.join(" ")}`;
    case "yarn":
      return `yarn add ${devFlag} ${packages.join(" ")}`;
    case "bun":
      return `bun add ${devFlag} ${packages.join(" ")}`;
    case "npm":
    default:
      return `npm install ${devFlag} ${packages.join(" ")}`;
  }
}

/**
 * Database generator – satisfies the Generator interface.
 * The run method executes the full pipeline: validate → plan → execute → verify → summarize.
 */
export const databaseGenerator: Generator = {
  name: "database",
  description: "Adds Prisma ORM with a selected database provider",
  prompts: databasePrompts,
  async run(answers: Record<string, unknown>, context: GeneratorContext) {
    const ctx = context;

    // Validate preconditions
    await checkPreconditions(ctx);

    // Validate (interface compliance)
    if (!validateDatabase(answers)) {
      throw new Error("Invalid responses for database generator");
    }

    // Plan
    const plan = planDatabase(answers);

    // Execute
    const execResult = await executeDatabase(answers, ctx, plan);

    // Verify (skip in dry-run mode)
    if (!ctx.dryRun) {
      await verifyDatabase(answers, ctx, plan);
    }

    // Summarize
    summarizeDatabase(answers, execResult, ctx);
  },
};

// Default export for convenience
export default databaseGenerator;