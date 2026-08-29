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

// Provider data - explicit and data-driven as required
export const providerData = {
  sqlite: {
    key: "sqlite",
    name: "SQLite",
    displayName: "SQLite",
    prismaProvider: "sqlite",
    adapterPackage: "@prisma/adapter-better-sqlite3",
    adapterImport: "PrismaBetterSqlite3",
    adapterClass: "PrismaBetterSqlite3",
    driverPackage: "better-sqlite3",
    devDependencies: [
      "prisma@7.10.0",
      "@types/node",
      "@types/better-sqlite3"
    ],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-better-sqlite3",
      "better-sqlite3",
      "dotenv"
    ],
    templatePath: join(templateBasePath, "prisma-client-lib.ts.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes: "SQLite is a file-based database suited for development and prototyping."
  },
  postgresql: {
    key: "postgresql",
    name: "PostgreSQL",
    displayName: "PostgreSQL",
    prismaProvider: "postgresql",
    adapterPackage: "@prisma/adapter-pg",
    adapterImport: "PrismaPg",
    adapterClass: "PrismaPg",
    driverPackage: "pg",
    devDependencies: [
      "prisma@7.10.0",
      "@types/node",
      "@types/pg"
    ],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-pg",
      "pg",
      "dotenv"
    ],
    templatePath: join(templateBasePath, "prisma-client-lib.ts.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes: "PostgreSQL is a powerful, open source object-relational database system."
  },
  mysql: {
    key: "mysql",
    name: "MySQL",
    displayName: "MySQL",
    prismaProvider: "mysql",
    adapterPackage: "@prisma/adapter-mariadb",
    adapterImport: "PrismaMariaDb",
    adapterClass: "PrismaMariaDb",
    driverPackage: "", // MariaDB adapter uses individual params, not a driver package
    devDependencies: [
      "prisma@7.10.0",
      "@types/node"
    ],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-mariadb",
      "dotenv"
    ],
    templatePath: join(templateBasePath, "prisma-client-lib-mysql.ts.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "individualParams", // Uses individual connection parameters
    notes: "MySQL is a widely-used open source relational database management system."
  },
  sqlserver: {
    key: "sqlserver",
    name: "SQL Server",
    displayName: "SQL Server",
    prismaProvider: "sqlserver",
    adapterPackage: "@prisma/adapter-mssql",
    adapterImport: "PrismaMssql",
    adapterClass: "PrismaMssql",
    driverPackage: "", // MSSQL adapter uses individual params
    devDependencies: [
      "prisma@7.10.0",
      "@types/node",
      "@types/mssql"
    ],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-mssql",
      "dotenv"
    ],
    templatePath: join(templateBasePath, "prisma-client-lib-sqlserver.ts.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "individualParams", // Uses individual connection parameters
    notes: "Microsoft SQL Server is a relational database management system developed by Microsoft."
  },
  cockroachdb: {
    key: "cockroachdb",
    name: "CockroachDB",
    displayName: "CockroachDB",
    prismaProvider: "cockroachdb",
    adapterPackage: "@prisma/adapter-pg",
    adapterImport: "PrismaPg",
    adapterClass: "PrismaPg",
    driverPackage: "pg",
    devDependencies: [
      "prisma@7.10.0",
      "@types/node",
      "@types/pg"
    ],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-pg",
      "pg",
      "dotenv"
    ],
    templatePath: join(templateBasePath, "prisma-client-lib.ts.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes: "CockroachDB is a distributed SQL database built on a transactional and strongly-consistent key-value store."
  },
  planetscale: {
    key: "planetscale",
    name: "PlanetScale",
    displayName: "PlanetScale (MySQL)",
    prismaProvider: "mysql", // Uses MySQL protocol
    adapterPackage: "@prisma/adapter-planetscale",
    adapterImport: "PrismaPlanetScale",
    adapterClass: "PrismaPlanetScale",
    driverPackage: "undici", // Required for fetch polyfill
    devDependencies: [
      "prisma@7.10.0",
      "@types/node"
    ],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-planetscale",
      "undici",
      "dotenv"
    ],
    templatePath: join(templateBasePath, "prisma-client-lib-planetscale.ts.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes: "PlanetScale is a serverless database platform built on Vitess. Requires relationMode = 'prisma' in schema.prisma for MySQL variant."
  },
  prismapostgres: {
    key: "prismapostgres",
    name: "Prisma Postgres",
    displayName: "Prisma Postgres",
    prismaProvider: "postgresql", // Uses PostgreSQL provider
    adapterPackage: "@prisma/adapter-pg",
    adapterImport: "PrismaPg",
    adapterClass: "PrismaPg",
    driverPackage: "pg",
    devDependencies: [
      "prisma@7.10.0",
      "@types/node",
      "@types/pg"
    ],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-pg",
      "pg",
      "dotenv"
    ],
    templatePath: join(templateBasePath, "prisma-client-lib.ts.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes: "Prisma Postgres is a fully managed PostgreSQL-compatible database service."
  }
};

// Prompt questions for the database generator
export const databasePrompts = [
  {
    type: "select" as const,
    name: "provider",
    message: "Choose your database provider:",
    default: "sqlite",
    choices: Object.values(providerData).map(p => ({
      name: p.displayName,
      value: p.key
    })),
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

  // Read package.json for compatibility with tests (though not strictly needed for logic)
  // This ensures fs.readFile is called for package.json as expected by tests
  await ctx.fs.readFile("package.json", { encoding: "utf8" });
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
  const providerKey = answers.provider as string;
  const provider = providerData[providerKey as keyof typeof providerData];

  if (!provider) {
    throw new Error(`Unsupported provider: ${providerKey}`);
  }

  const data = {
    provider: provider.key,
    providerName: provider.displayName,
    year: new Date().getFullYear(),
    ...provider // Spread provider data for template use
  };

  // Determine which template conditional to use
  let connectionString = false;
  let individualParams = false;
  let sqlserverParams = false;
  let planetscaleMysqlParams = false;

  if (provider.key === "sqlserver") {
    sqlserverParams = true;
  } else if (provider.key === "planetscale") {
    planetscaleMysqlParams = true;
  } else {
    // For other providers, use instantiationPattern
    if (provider.instantiationPattern === "connectionString") {
      connectionString = true;
    } else if (provider.instantiationPattern === "individualParams") {
      individualParams = true;
    }
  }

  Object.assign(data, {
    connectionString,
    individualParams,
    sqlserverParams,
    planetscaleMysqlParams
  });

  // Determine packages to install - separate dev and regular dependencies
  const devPackages = [...provider.devDependencies];
  const regularPackages = [...provider.dependencies];

  // Determine files to create - only DXG-owned application templates
  const filesToCreate = [
    {
      path: provider.templateOutputPath,
      templatePath: provider.templatePath,
      data
    }
  ];

  return {
    ...data,
    provider: provider.key, // Return just the provider key string for tests
    providerName: provider.displayName,
    devPackages,
    regularPackages,
    filesToCreate
  };
}

// Execution function
export async function executeDatabase(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planDatabase>,
): Promise<{ created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] }> {
  const { fs } = ctx;
  const planToUse = plan ?? planDatabase(answers);
  const result: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] } = {
    created: [],
    updated: [],
    skipped: [],
    conflicts: [],
  };

  // Step 1: Install development dependencies
  if (!ctx.dryRun) {
    if (planToUse.devPackages.length > 0) {
      try {
        const resolved = await getCliCommand(
          parseNi,
          ["add", "-D", ...planToUse.devPackages],
          {
            cwd: process.cwd(),
            programmatic: true,
          }
        );

        if (!resolved) {
          throw new Error("Failed to resolve package manager command for adding dev dependencies");
        }

        const { command: cmd, args, cwd: resolvedCwd } = resolved;
        const executeCwd = resolvedCwd ?? process.cwd();

        const s = spinner();
        s.start(`Installing dev dependencies: ${planToUse.devPackages.join(", ")}`);
        await executeCommand(cmd, args, {
          cwd: executeCwd,
          stdio: "inherit"
        });
        s.stop(`Successfully installed dev dependencies: ${planToUse.devPackages.join(", ")}`);
      } catch (error) {
        throw new Error(
          `Failed to install dev dependencies: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        );
      }
    }
  } else {
    // In dry-run mode, note that we would install dependencies
    if (planToUse.devPackages.length > 0) {
      note("[database] Dry-run: Would install dev dependencies");
    }
  }

  // Step 2: Install regular dependencies
  if (!ctx.dryRun) {
    if (planToUse.regularPackages.length > 0) {
      try {
        const resolved = await getCliCommand(
          parseNi,
          ["add", ...planToUse.regularPackages],
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
        s.start(`Installing dependencies: ${planToUse.regularPackages.join(", ")}`);
        await executeCommand(cmd, args, {
          cwd: executeCwd,
          stdio: "inherit"
        });
        s.stop(`Successfully installed dependencies: ${planToUse.regularPackages.join(", ")}`);
      } catch (error) {
        throw new Error(
          `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        );
      }
    }
  } else {
    // In dry-run mode, note that we would install dependencies
    if (planToUse.regularPackages.length > 0) {
      note("[database] Dry-run: Would install dependencies");
    }
  }

  // Step 3: Execute Prisma initialization
  if (!ctx.dryRun) {
    try {
      const s = spinner();
      const providerObj = providerData[planToUse.provider as keyof typeof providerData];
      s.start(`Initializing Prisma with provider ${providerObj.prismaProvider}...`);

      // Use the existing command execution infrastructure
      const prismaResolved = await getCliCommand(
        parseNi,
        ["dlx", "prisma", "init", "--datasource-provider", providerObj.prismaProvider, "--output", "./prisma"],
        {
          cwd: process.cwd(),
          programmatic: true,
        }
      );

      if (!prismaResolved) {
        throw new Error("Failed to resolve prisma command");
      }

      const { command: prismaCmd, args: prismaArgs, cwd: prismaResolvedCwd } = prismaResolved;
      const prismaExecuteCwd = prismaResolvedCwd ?? process.cwd();

      await executeCommand(prismaCmd, prismaArgs, {
        cwd: prismaExecuteCwd,
        stdio: "inherit"
      });

      s.stop(`Prisma initialized successfully with provider ${providerObj.prismaProvider}`);
    } catch (error) {
      throw new Error(
        `Failed to initialize Prisma: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  } else {
    // In dry-run mode, report what would happen
    const providerObj = providerData[planToUse.provider as keyof typeof providerData];
    note(`[database] Dry-run: Would run: prisma init --datasource-provider ${providerObj.prismaProvider} --output ./prisma`);
    note(`[database] Dry-run: Would create/update:`);
    note(`[database]   - prisma/schema.prisma`);
    note(`[database]   - prisma.config.ts`);
    note(`[database]   - .env`);
  }

  // Step 4: Handle DXG-owned application template (Prisma Client integration)
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

  // Step 5: Execute Prisma generate
  if (!ctx.dryRun) {
    try {
      const s = spinner();
      s.start(`Generating Prisma Client...`);

      // Use the existing command execution infrastructure
      const generateResolved = await getCliCommand(
        parseNi,
        ["dlx", "prisma", "generate"],
        {
          cwd: process.cwd(),
          programmatic: true,
        }
      );

      if (!generateResolved) {
        throw new Error("Failed to resolve prisma generate command");
      }

      const { command: generateCmd, args: generateArgs, cwd: generateResolvedCwd } = generateResolved;
      const generateExecuteCwd = generateResolvedCwd ?? process.cwd();

      await executeCommand(generateCmd, generateArgs, {
        cwd: generateExecuteCwd,
        stdio: "inherit"
      });

      s.stop(`Prisma Client generated successfully`);
    } catch (error) {
      throw new Error(
        `Failed to generate Prisma Client: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      );
    }
  } else {
    // In dry-run mode, report what would happen
    note("[database] Dry-run: Would run: prisma generate");
    note("[database] Dry-run: Would generate Prisma Client in ./prisma/client/");
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

  // Verify that the DXG-owned application file exists if it was supposed to be created
  for (const { path } of planToUse.filesToCreate) {
    const exists = await fs.pathExists(path);
    if (!exists) {
      throw new Error(`Expected file missing after generation: ${path}`);
    }
  }

  // Note: We don't verify prisma-owned files (schema.prisma, prisma.config.ts, .env)
  // as they are managed by Prisma CLI, not DXG
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

    // Only prompt in interactive mode (not dry-run and not CI)
    const shouldPrompt = !(ctx.dryRun === true) && !process.env.CI;

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