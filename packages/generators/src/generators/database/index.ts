import { GeneratorContext, Generator } from "../../types";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Get the directory where this module is located
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
    return (
      (pkg.devDependencies && pkg.devDependencies.prisma) ||
      (pkg.dependencies && pkg.dependencies.prisma)
    );
  } catch (error) {
    // If we can't read or parse, assume not installed
    return false;
  }
}

// Detect the package manager being used in the project
export async function detectPackageManager(fs: GeneratorContext['fs']): Promise<"npm" | "pnpm" | "yarn"> {
  // Check for lockfiles in order of preference
  const hasYarnLock = await fs.pathExists("yarn.lock");
  if (hasYarnLock) return "yarn";

  const hasPnpmlock = await fs.pathExists("pnpm-lock.yaml");
  if (hasPnpmlock) return "pnpm";

  const hasPackageLock = await fs.pathExists("package-lock.json");
  if (hasPackageLock) return "npm";

  // Default to npm
  return "npm";
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
): Promise<{ created: string[]; updated: string[]; skipped: string[] }> {
  const { logger, fs } = ctx;
  const planToUse = plan ?? planDatabase(answers);
  const result: { created: string[]; updated: string[]; skipped: string[] } = {
    created: [],
    updated: [],
    skipped: [],
  };

  // Check if Prisma is already installed
  const prismaInstalled = await isPrismaInstalled(fs);
  if (prismaInstalled) {
    logger.info(" Prisma already detected. Skipping dependency installation.");
  } else {
    // Install dependencies
    try {
      // Detect package manager
      const packageManager = await detectPackageManager(fs);
      const installCommand = getInstallCommand(packageManager, planToUse.packages, true); // true for devDependency
      logger.info(`Installing dependencies: ${planToUse.packages.join(", ")}`);
      execSync(installCommand, { stdio: "inherit" });
    } catch (error) {
      throw new Error(
        `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`
      );
  }
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
      const current = (await fs.readFile(path, { encoding: "utf8" })) as string;
      if (current === rendered) {
        result.skipped.push(path);
        continue;
      }
      await fs.writeFile(path, rendered, "utf8");
      result.updated.push(path);
    } else {
      // Ensure the directory exists
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir && !(await fs.pathExists(dir))) {
        await fs.mkdir(dir, { recursive: true });
      }
      await fs.writeFile(path, rendered, "utf8");
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
  result: { created: string[]; updated: string[]; skipped: string[] },
  ctx: GeneratorContext,
): void {
  const { logger } = ctx;
  const { created, updated, skipped } = result;

  if (created.length) {
    logger.info(` Created: ${created.join(", ")}`);
  }
  if (updated.length) {
    logger.info(` Updated: ${updated.join(", ")}`);
  }
  if (skipped.length) {
    logger.info(` Unchanged: ${skipped.join(", ")}`);
  }

  logger.info(` Database generator completed successfully`);
}

// Get the install command for the detected package manager
function getInstallCommand(packageManager: "npm" | "pnpm" | "yarn", packages: string[], isDevDependency: boolean): string {
  const devFlag = isDevDependency ? "-D" : ""; // Save as dev dependency
  switch (packageManager) {
    case "pnpm":
      return `pnpm add ${devFlag} ${packages.join(" ")}`;
    case "yarn":
      return `yarn add ${devFlag} ${packages.join(" ")}`;
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

    // Verify
    await verifyDatabase(answers, ctx, plan);

    // Summarize
    summarizeDatabase(answers, execResult, ctx);
  },
};

// Default export for convenience
export default databaseGenerator;