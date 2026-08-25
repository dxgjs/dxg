import { GeneratorContext, Generator } from "../../types";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { detectPackageManager } from "@dxgjs/fs";

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Template file paths
const tailwindConfigTemplatePath = join(__dirname, "tailwind.config.tmpl");
const postcssConfigTemplatePath = join(__dirname, "postcss.config.tmpl");

// Prompt questions for the tailwind generator
export const tailwindPrompts = [
  {
    type: "confirm" as const,
    name: "customiseTailwind",
    message: "Do you want to customise Tailwind settings (content paths, theme, etc.)? [y/N]",
    default: false,
  },
  {
    type: "confirm" as const,
    name: "addPostcssPlugins",
    message: "Do you want to add additional PostCSS plugins (e.g., for minification)? [y/N]",
    default: false,
  },
  {
    type: "confirm" as const,
    name: "installAutoprefixer",
    message: "Do you need to support legacy browsers (IE11, older Android)? [y/N]",
    default: false,
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
export function validateTailwind(_answers: Record<string, unknown>): boolean {
  // Validation will happen in the run method; we keep this for interface compliance
  // but actual validation is done in run via checkPreconditions
  return true;
}

// Precondition checks
async function checkPreconditions(ctx: GeneratorContext): Promise<void> {
  // 1. Node.js >= 18
  const nodeVersion = process.versions.node;
  const major = parseInt(nodeVersion.split(".")[0], 10);
  if (major < 18) {
    throw new Error(
      `Node.js version ${nodeVersion} is not supported. Please use Node.js >= 18.`
    );
  }

  // 2. package.json exists
  const packageJsonExists = await ctx.fs.pathExists("package.json");
  if (!packageJsonExists) {
    throw new Error(
      "package.json not found. Please initialize your project (e.g., npm init) before running dxg add tailwind."
    );
  }

  }

/**
 * Check if Tailwind CSS is already installed in package.json
 */
export async function isTailwindInstalled(fs: GeneratorContext['fs']): Promise<boolean> {
  try {
    const packageJsonExists = await fs.pathExists("package.json");
    if (!packageJsonExists) return false;
    const content = await fs.readFile("package.json", { encoding: "utf8" });
    const pkg = JSON.parse(content as string);
    return (
      (pkg.dependencies && pkg.dependencies.tailwindcss) ||
      (pkg.devDependencies && pkg.devDependencies.tailwindcss)
    );
  } catch (error) {
    // If we can't read or parse, assume not installed
    return false;
  }
}


// Planning function
export function planTailwind(answers: Record<string, unknown>) {
  const data = {
    customiseTailwind: answers.customiseTailwind,
    addPostcssPlugins: answers.addPostcssPlugins,
    installAutoprefixer: answers.installAutoprefixer,
    year: new Date().getFullYear(),
  };

  // Determine packages to install
  const packages = ["tailwindcss", "postcss"];
  if (answers.installAutoprefixer) {
    packages.push("autoprefixer");
  }

  // Determine config files to create
  const configFiles = [];
  if (answers.customiseTailwind) {
    configFiles.push({ path: "tailwind.config.cjs", templatePath: tailwindConfigTemplatePath, data });
  }
  if (answers.addPostcssPlugins) {
    configFiles.push({ path: "postcss.config.cjs", templatePath: postcssConfigTemplatePath, data });
  }

  return { data, packages, configFiles };
}

// Execution function
export async function executeTailwind(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planTailwind>,
): Promise<{ created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] }> {
  const { logger, fs } = ctx;
  const planToUse = plan ?? planTailwind(answers);
  const result: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] } = {
    created: [],
    updated: [],
    skipped: [],
    conflicts: [],
  };

  // Check if Tailwind is already installed
  const tailwindInstalled = await isTailwindInstalled(fs);
  if (tailwindInstalled) {
    logger.info(" Tailwind CSS already detected. Skipping dependency installation.");
  } else {
    // Install dependencies
    try {
      // Detect package manager
      const packageManager = await detectPackageManager(undefined);
      const installCommand = getInstallCommand(packageManager, planToUse.packages);
      logger.info(`Installing dependencies: ${planToUse.packages.join(", ")}`);
      execSync(installCommand, { stdio: "inherit" });
    } catch (error) {
      throw new Error(
        `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Handle config files
  for (const { path, templatePath, data } of planToUse.configFiles) {
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
      await fs.writeFile(path, rendered, "utf8");
      result.created.push(path);
    }
  }

  // Handle CSS entrypoint
  const cssEntrypoint = await determineCssEntrypoint(ctx);
  if (cssEntrypoint) {
    const cssResult: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] } = await updateCssEntrypoint(fs, cssEntrypoint, ctx);
    if (cssResult.created) result.created.push(...cssResult.created);
    if (cssResult.updated) result.updated.push(...cssResult.updated);
    if (cssResult.skipped) result.skipped.push(...cssResult.skipped);
    if (cssResult.conflicts) result.conflicts.push(...cssResult.conflicts);
  }

  return result;
}

// Verification function
export async function verifyTailwind(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planTailwind>,
): Promise<void> {
  const { fs } = ctx;
  const planToUse = plan ?? planTailwind(answers);

  // Verify dependencies are in package.json (basic check)
  const packageJsonExists = await fs.pathExists("package.json");
  if (!packageJsonExists) {
    throw new Error("package.json not found after generation");
  }

  // Verify config files if they were supposed to be created
  for (const { path } of planToUse.configFiles) {
    const exists = await fs.pathExists(path);
    if (!exists) {
      throw new Error(`Expected config file missing: ${path}`);
    }
  }

  // Verify CSS entrypoint exists and contains Tailwind directives
  const cssEntrypoint = await determineCssEntrypoint(ctx);
  if (cssEntrypoint) {
    const exists = await fs.pathExists(cssEntrypoint);
    if (!exists) {
      throw new Error(`CSS entrypoint not found: ${cssEntrypoint}`);
    }

    const content = (await fs.readFile(cssEntrypoint, { encoding: "utf8" })) as string;
    const hasTailwindDirectives =
      content.includes("@tailwind base;") &&
      content.includes("@tailwind components;") &&
      content.includes("@tailwind utilities;");

    if (!hasTailwindDirectives) {
      throw new Error(`CSS entrypoint missing Tailwind directives: ${cssEntrypoint}`);
    }
  }
}

// Summarize function
export function summarizeTailwind(
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
    logger.info(`Unchanged: ${skipped.join(", ")}`);
  }
  if (conflicts.length) {
    const conflictDetails = conflicts.map(c => `${c.path} (${c.existsAs})`).join(", ");
    logger.warn(` Conflicts: ${conflictDetails}`);
  }

  logger.info(` Tailwind CSS v4 installed successfully`);
}

/**
 * Get the install command for the detected package manager
 */
function getInstallCommand(packageManager: "npm" | "pnpm" | "yarn" | "bun", packages: string[]): string {
  const devFlag = "-D"; // Save as dev dependency
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
 * Determine the CSS entrypoint based on project framework
 */
async function determineCssEntrypoint(ctx: GeneratorContext): Promise<string | null> {
  // Framework detection based on dependencies and file structure
  const packageJsonExists = await ctx.fs.pathExists("package.json");
  if (!packageJsonExists) return null;

  let packageJsonContent: string;
  try {
    const fileContent = await ctx.fs.readFile("package.json", { encoding: "utf8" });
    packageJsonContent = fileContent as string;
  } catch (error) {
    ctx.logger.warn(`Could not read package.json for framework detection: ${error}`);
    return null;
  }

  let packageJson: Record<string, any> = {};
  try {
    packageJson = JSON.parse(packageJsonContent);
  } catch (error) {
    ctx.logger.warn("Could not parse package.json");
    return null;
  }

  const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };

  // Check for Next.js
  if (dependencies.next) {
    // Check if using app router (pages/app directory exists)
    const appDirExists = await ctx.fs.pathExists("app");
    const pagesDirExists = await ctx.fs.pathExists("pages");

    if (appDirExists) {
      // App Router
      const appGlobals = "app/globals.css";
      if (await ctx.fs.pathExists(appGlobals)) return appGlobals;
      // If not exists, we'll create it later
      return appGlobals;
    } else if (pagesDirExists) {
      // Pages Router
      const stylesGlobals = "styles/globals.css";
      if (await ctx.fs.pathExists(stylesGlobals)) return stylesGlobals;
      return stylesGlobals;
    }
    // Fallback
    return "styles/globals.css";
  }

  // Check for Vite + React
  if (dependencies.vite && dependencies.react) {
    const srcIndexCss = "src/index.css";
    if (await ctx.fs.pathExists(srcIndexCss)) return srcIndexCss;
    return srcIndexCss;
  }

  // Check for SvelteKit
  if (dependencies["@sveltejs/kit"]) {
    const srcAppCss = "src/app.css";
    if (await ctx.fs.pathExists(srcAppCss)) return srcAppCss;
    return srcAppCss;
  }

  // Check for Remix
  if (dependencies["@remix-run/react"]) {
    const appStylesTailwind = "app/styles/tailwind.css";
    if (await ctx.fs.pathExists(appStylesTailwind)) return appStylesTailwind;
    return appStylesTailwind;
  }

  // Check for Astro
  if (dependencies["@astrojs/tailwind"]) {
    const srcStylesGlobal = "src/styles/global.css";
    if (await ctx.fs.pathExists(srcStylesGlobal)) return srcStylesGlobal;
    return srcStylesGlobal;
  }

  // Check for Nuxt
  if (dependencies.nuxt) {
    const assetsCssTailwind = "assets/css/tailwind.css";
    if (await ctx.fs.pathExists(assetsCssTailwind)) return assetsCssTailwind;
    return assetsCssTailwind;
  }

  // Check for SolidStart
  if (dependencies["solid-start"]) {
    const srcIndexCss = "src/index.css";
    if (await ctx.fs.pathExists(srcIndexCss)) return srcIndexCss;
    return srcIndexCss;
  }

  // Generic fallback - look for common CSS files
  const commonCssPaths = [
    "src/index.css",
    "src/styles.css",
    "styles.css",
    "src/main.css",
    "public/styles.css",
    "styles/globals.css",
    "app/globals.css"
  ];

  for (const path of commonCssPaths) {
    if (await ctx.fs.pathExists(path)) {
      return path;
    }
  }

  // If none found, default to src/index.css for generic projects
  return "src/index.css";
}

/**
 * Update the CSS entrypoint to include Tailwind directives
 */
async function updateCssEntrypoint(
  fs: GeneratorContext['fs'],
  cssEntrypoint: string,
  ctx: GeneratorContext
): Promise<{ created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] }> {
  const result: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] } = {
    created: [],
    updated: [],
    skipped: [],
    conflicts: [],
  };

  const exists = await fs.pathExists(cssEntrypoint);
  const tailwindDirectives = `\n@tailwind base;\n@tailwind components;\n@tailwind utilities;\n`;

  if (!exists) {
    // Check if parent directory would be a file collision
    const dir = cssEntrypoint.split("/").slice(0, -1).join("/");
    if (dir) {
      const dirExists = await fs.pathExists(dir);
      if (dirExists) {
        const dirStats = await fs.stat(dir);
        if (dirStats.isFile()) {
          // Parent path is occupied by a file
          result.conflicts.push({ path: dir, existsAs: 'file' });
          return result;
        }
      }
    }

    // Safe to create
    if (!ctx.dryRun) {
      // Create the directory if it doesn't exist
      if (dir && !(await fs.pathExists(dir))) {
        await fs.mkdir(dir, { recursive: true });
      }

      // Create the file with Tailwind directives
      await fs.writeFile(cssEntrypoint, tailwindDirectives, "utf8");
    }
    result.created.push(cssEntrypoint);
    return result;
  }

  // Path exists, check if it's a file or directory
  const stats = await fs.stat(cssEntrypoint);
  const isDirectory = stats.isDirectory();

  if (isDirectory) {
    // Directory collision - expected path is occupied by a directory
    result.conflicts.push({ path: cssEntrypoint, existsAs: 'directory' });
    return result;
  }

  // It's a file, check if it already contains the directives
  const content = (await fs.readFile(cssEntrypoint, { encoding: "utf8" })) as string;
  const hasBase = content.includes("@tailwind base;");
  const hasComponents = content.includes("@tailwind components;");
  const hasUtilities = content.includes("@tailwind utilities;");

  if (hasBase && hasComponents && hasUtilities) {
    result.skipped.push(cssEntrypoint);
    return result;
  }

  // File exists but doesn't have all directives - handle based on dryRun and force flags
  if (ctx.dryRun) {
    // In dry-run mode, report as conflict (would need user interaction or force to resolve)
    result.conflicts.push({ path: cssEntrypoint, existsAs: 'file' });
    return result;
  }

  if (ctx.force) {
    // Force overwrite - add missing directives
    let newContent = content;
    if (!newContent.endsWith("\n")) {
      newContent += "\n";
    }

    if (!hasBase) newContent += "@tailwind base;\n";
    if (!hasComponents) newContent += "@tailwind components;\n";
    if (!hasUtilities) newContent += "@tailwind utilities;\n";

    await fs.writeFile(cssEntrypoint, newContent, "utf8");
    result.updated.push(cssEntrypoint);
    return result;
  }

  // Without force, treat as conflict
  result.conflicts.push({ path: cssEntrypoint, existsAs: 'file' });
  return result;
}

/**
 * Tailwind generator – satisfies the Generator interface.
 * The run method executes the full pipeline: validate → plan → execute → verify → summarize.
 */
export const tailwindGenerator: Generator = {
  name: "tailwind",
  description: "Adds Tailwind CSS v4 to a Node/frontend project",
  prompts: tailwindPrompts,
  async run(answers: Record<string, unknown>, context: GeneratorContext) {
    const ctx = context;

    // Validate preconditions
    await checkPreconditions(ctx);

    // Validate (interface compliance)
    if (!validateTailwind(answers)) {
      throw new Error("Invalid responses for tailwind generator");
    }

    // Plan
    const plan = planTailwind(answers);

    // Execute
    const execResult = await executeTailwind(answers, ctx, plan);

    // Verify (skip in dry-run mode)
    if (!ctx.dryRun) {
      await verifyTailwind(answers, ctx, plan);
    }

    // Summarize
    summarizeTailwind(answers, execResult, ctx);
  },
};

// Default export for convenience
export default tailwindGenerator;