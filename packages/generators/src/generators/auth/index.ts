import { GeneratorContext, Generator } from "../../types";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

console.log("[auth/index.ts] module loaded");

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Template file paths
const authConfigTemplatePath = join(__dirname, "templates", "auth.config.ts.tmpl");

// Prompt questions for the auth generator
export const authPrompts = [
  {
    type: "select" as const,
    name: "provider",
    message: "Choose your authentication provider:",
    default: "better-auth",
    choices: [
      { name: "Better Auth", value: "better-auth" },
      { name: "Auth.js", value: "auth.js" },
      { name: "Clerk", value: "clerk" },
      { name: "Lucia", value: "lucia" },
    ],
  },
  {
    type: "confirm" as const,
    name: "installDependencies",
    message: "Do you want to install dependencies?",
    default: true,
  },
  {
    type: "confirm" as const,
    name: "generateExampleConfig",
    message: "Do you want to generate example configuration files?",
    default: true,
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
export function validateAuth(_answers: Record<string, unknown>): boolean {
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
      "package.json not found. Please initialize your project (e.g., npm init) before running dxg add auth."
    );
  }
}

// Check if auth dependency is already installed in package.json
export async function isAuthInstalled(fs: GeneratorContext['fs'], provider: string): Promise<boolean> {
  console.log(`[isAuthInstalled] called with provider: ${provider}`);
  try {
    const packageJsonExists = await fs.pathExists("package.json");
    if (!packageJsonExists) {
      console.log(`[isAuthInstalled] package.json not found`);
      return false;
    }
    const content = await fs.readFile("package.json", { encoding: "utf8" });
    const pkg = JSON.parse(content as string);

    // Check for the specific provider package
    const providerPackages: Record<string, string> = {
      "better-auth": "better-auth",
      "auth.js": "@auth/core",
      "clerk": "@clerk/clerk-react",
      "lucia": "lucia"
    };

    const packageName = providerPackages[provider];
    if (!packageName) {
      console.log(`[isAuthInstalled] unknown provider: ${provider}`);
      return false;
    }

    const result = (pkg.devDependencies && pkg.devDependencies[packageName]) ||
      (pkg.dependencies && pkg.dependencies[packageName]);
    console.log(`[isAuthInstalled] returning ${result}`);
    return !!result;
  } catch (error) {
    // If we can't read or parse, assume not installed
    console.log(`[isAuthInstalled] error: ${error}`);
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
export function planAuth(answers: Record<string, unknown>) {
  const provider = answers.provider as string;
  const generateExampleConfig = answers.generateExampleConfig as boolean;

  const data = {
    provider: provider,
    providerName: getProviderName(provider),
    providerPackage: getProviderPackage(provider),
    year: new Date().getFullYear(),
  };

  // Determine packages to install
  const packages: string[] = [];
  if (answers.installDependencies) {
    const packageName = getProviderPackage(provider);
    if (packageName) {
      packages.push(packageName);
    }
  }

  // Determine files to create
  const filesToCreate = [];
  if (generateExampleConfig) {
    const configPath = "auth.config.ts";
    filesToCreate.push({ path: configPath, templatePath: authConfigTemplatePath, data });
  }

  return { data, packages, filesToCreate };
}

// Helper functions
function getProviderName(provider: string): string {
  const names: Record<string, string> = {
    "better-auth": "betterAuth",
    "auth.js": "auth",
    "clerk": "clerk",
    "lucia": "lucia"
  };
  return names[provider] || provider;
}

function getProviderPackage(provider: string): string {
  const packages: Record<string, string> = {
    "better-auth": "better-auth",
    "auth.js": "@auth/core",
    "clerk": "@clerk/clerk-react",
    "lucia": "lucia"
  };
  return packages[provider] || "";
}

// Execution function
export async function executeAuth(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planAuth>,
): Promise<{ created: string[]; updated: string[]; skipped: string[] }> {
  const { logger, fs } = ctx;
  const planToUse = plan ?? planAuth(answers);
  const result: { created: string[]; updated: string[]; skipped: string[] } = {
    created: [],
    updated: [],
    skipped: [],
  };

  // Check if auth dependency is already installed
  const provider = answers.provider as string;
  const authInstalled = await isAuthInstalled(fs, provider);
  if (authInstalled) {
    logger.info(` ${provider} already detected. Skipping dependency installation.`);
  } else if (answers.installDependencies) {
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

  // Handle config files
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
export async function verifyAuth(
  _answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planAuth>,
): Promise<void> {
  const { fs } = ctx;
  const planToUse = plan ?? planAuth(_answers);

  // Verify that the config files exist if they were supposed to be created
  for (const { path } of planToUse.filesToCreate) {
    const exists = await fs.pathExists(path);
    if (!exists) {
      throw new Error(`Expected file missing after generation: ${path}`);
    }
  }
}

// Summarize function
export function summarizeAuth(
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

  logger.info(` Auth generator completed successfully`);
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
 * Auth generator – satisfies the Generator interface.
 * The run method executes the full pipeline: validate → plan → execute → verify → summarize.
 */
export const authGenerator: Generator = {
  name: "auth",
  description: "Adds authentication provider configuration",
  prompts: authPrompts,
  async run(answers: Record<string, unknown>, context: GeneratorContext) {
    const ctx = context;

    // Validate preconditions
    await checkPreconditions(ctx);

    // Validate (interface compliance)
    if (!validateAuth(answers)) {
      throw new Error("Invalid responses for auth generator");
    }

    // Plan
    const plan = planAuth(answers);

    // Execute
    const execResult = await executeAuth(answers, ctx, plan);

    // Verify
    await verifyAuth(answers, ctx, plan);

    // Summarize
    summarizeAuth(answers, execResult, ctx);
  },
};

// Default export for convenience
export default authGenerator;