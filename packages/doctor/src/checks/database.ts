/**
 * Database checks for dxg doctor.
 * Validates Prisma schema, provider, generated client, and DXG-owned artifacts.
 * Aligned with the database generator's actual behavior.
 */

import type { DoctorContext, DoctorCheckResult, DoctorCategory } from "../types";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";

const DATABASE_CHECKS = {
  "database:prisma-schema": {
    name: "Prisma schema exists",
    category: "database" as DoctorCategory,
  },
  "database:prisma-config": {
    name: "Prisma config exists",
    category: "database" as DoctorCategory,
  },
  "database:provider": {
    name: "Database provider configured",
    category: "database" as DoctorCategory,
  },
  "database:prisma-client": {
    name: "Prisma Client generated",
    category: "database" as DoctorCategory,
  },
  "database:helper-file": {
    name: "Prisma helper file exists",
    category: "database" as DoctorCategory,
  },
  "database:sqlite-db-file": {
    name: "SQLite database file exists",
    category: "database" as DoctorCategory,
  },
  "database:seed-config": {
    name: "Seed configuration present",
    category: "database" as DoctorCategory,
  },
  "database:connectivity": {
    name: "Database connectivity",
    category: "database" as DoctorCategory,
  },
} as const;

/**
 * Find Prisma schema file.
 */
function findPrismaSchema(cwd: string): string | null {
  const possiblePaths = [
    join(cwd, "prisma", "schema.prisma"),
    join(cwd, "packages", "database", "prisma", "schema.prisma"),
    join(cwd, "apps", "api", "prisma", "schema.prisma"),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Find Prisma config file (prisma7.config.ts).
 */
function findPrismaConfig(cwd: string): string | null {
  const possiblePaths = [
    join(cwd, "prisma7.config.ts"),
    join(cwd, "prisma", "prisma7.config.ts"),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Extract provider from schema or config.
 */
function extractProvider(cwd: string): string | null {
  // Try schema first
  const schemaPath = findPrismaSchema(cwd);
  if (schemaPath) {
    try {
      const content = readFileSync(schemaPath, "utf-8");
      const match = content.match(/provider\s*=\s*["'](\w+)["']/);
      if (match) return match[1].toLowerCase();
    } catch {
      // fall through
    }
  }

  // Try config
  const configPath = findPrismaConfig(cwd);
  if (configPath) {
    try {
      const content = readFileSync(configPath, "utf-8");
      // Prisma 7 config: datasourceProvider or datasource.provider
      let match = content.match(/datasourceProvider\s*:\s*["']([^"']+)["']/);
      if (match) return match[1].toLowerCase();
      match = content.match(/datasource\s*:\s*\{([\s\S]*?)\}/);
      if (match) {
        const block = match[1];
        const providerMatch = block.match(/provider\s*:\s*["']([^"']+)["']/);
        if (providerMatch) return providerMatch[1].toLowerCase();
      }
    } catch {
      // fall through
    }
  }

  return null;
}

/**
 * Find Prisma helper file (DXG-owned artifact).
 * Generator creates helper at resolved path (default: lib/prisma.ts).
 */
function findHelperFile(cwd: string): string | null {
  const possiblePaths = [
    join(cwd, "lib", "prisma.ts"),
    join(cwd, "src", "lib", "prisma.ts"),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Check if Prisma schema exists.
 * Generator creates prisma/schema.prisma OR prisma7.config.ts (Prisma 7).
 * Returns INFO if no Prisma at all (optional feature), ERR if partial setup.
 */
async function checkPrismaSchema(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const schemaPath = findPrismaSchema(ctx.cwd);
  const configPath = findPrismaConfig(ctx.cwd);

  if (!schemaPath && !configPath) {
    // No Prisma at all - optional feature, not an error
    return {
      id: "database:prisma-schema",
      name: DATABASE_CHECKS["database:prisma-schema"].name,
      category: "database",
      severity: "info",
      message: "Skipped — no Prisma schema or config (database not configured)",
      fixable: false,
    };
  }

  // Partial setup: schema exists but no config, or config exists but no schema
  if (!schemaPath || !configPath) {
    return {
      id: "database:prisma-schema",
      name: DATABASE_CHECKS["database:prisma-schema"].name,
      category: "database",
      severity: "error",
      message: "Incomplete Prisma setup",
      detail: !schemaPath
        ? "prisma/schema.prisma missing but prisma7.config.ts exists"
        : "prisma7.config.ts missing but prisma/schema.prisma exists",
      fixable: false,
    };
  }

  return {
    id: "database:prisma-schema",
    name: DATABASE_CHECKS["database:prisma-schema"].name,
    category: "database",
    severity: "ok",
    message: `Prisma schema found at ${schemaPath.replace(ctx.cwd + "/", "")}`,
    fixable: false,
  };
}

/**
 * Check if Prisma 7 config exists.
 * Generator creates prisma7.config.ts when running prisma init.
 * Returns INFO if no Prisma at all, WARN if schema exists but no config.
 */
async function checkPrismaConfig(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const schemaPath = findPrismaSchema(ctx.cwd);
  const configPath = findPrismaConfig(ctx.cwd);

  if (!schemaPath && !configPath) {
    // No Prisma at all - optional feature
    return {
      id: "database:prisma-config",
      name: DATABASE_CHECKS["database:prisma-config"].name,
      category: "database",
      severity: "info",
      message: "Skipped — no Prisma schema or config (database not configured)",
      fixable: false,
    };
  }

  if (!configPath && schemaPath) {
    // Schema exists but no config - partial setup
    return {
      id: "database:prisma-config",
      name: DATABASE_CHECKS["database:prisma-config"].name,
      category: "database",
      severity: "warn",
      message: "Prisma 7 config (prisma7.config.ts) not found",
      detail: "prisma/schema.prisma exists but prisma7.config.ts is missing",
      fixable: false,
    };
  }

  return {
    id: "database:prisma-config",
    name: DATABASE_CHECKS["database:prisma-config"].name,
    category: "database",
    severity: "ok",
    message: `Prisma config found at ${configPath!.replace(ctx.cwd + "/", "")}`,
    fixable: false,
  };
}

/**
 * Check if database provider is configured in schema/config.
 * Returns INFO if no Prisma at all, ERR if schema exists but no provider.
 */
async function checkProvider(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const schemaPath = findPrismaSchema(ctx.cwd);
  const configPath = findPrismaConfig(ctx.cwd);

  if (!schemaPath && !configPath) {
    // No Prisma at all - optional feature
    return {
      id: "database:provider",
      name: DATABASE_CHECKS["database:provider"].name,
      category: "database",
      severity: "info",
      message: "Skipped — no Prisma schema or config (database not configured)",
      fixable: false,
    };
  }

  const provider = extractProvider(ctx.cwd);

  if (!provider) {
    // Schema/config exists but no provider
    return {
      id: "database:provider",
      name: DATABASE_CHECKS["database:provider"].name,
      category: "database",
      severity: "error",
      message: "No provider specified in Prisma schema or config",
      detail: "Run 'dxg add database' to configure a provider",
      fixable: false,
    };
  }

  const validProviders = [
    "postgresql", "postgres", "mysql", "sqlite",
    "sqlserver", "cockroachdb", "planetscale", "prismapostgres"
  ];

  if (!validProviders.includes(provider)) {
    return {
      id: "database:provider",
      name: DATABASE_CHECKS["database:provider"].name,
      category: "database",
      severity: "warn",
      message: `Unknown provider: ${provider}`,
      detail: `Valid providers: ${validProviders.join(", ")}`,
      fixable: false,
    };
  }

  return {
    id: "database:provider",
    name: DATABASE_CHECKS["database:provider"].name,
    category: "database",
    severity: "ok",
    message: `Provider configured: ${provider}`,
    fixable: false,
  };
}

/**
 * Check if Prisma Client is generated.
 * Generator runs `prisma generate` every time; output path is dynamic
 * (from schema's generator block or helper-derived default).
 */
async function checkPrismaClient(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const schemaPath = findPrismaSchema(ctx.cwd);
  const configPath = findPrismaConfig(ctx.cwd);

  if (!schemaPath && !configPath) {
    return {
      id: "database:prisma-client",
      name: DATABASE_CHECKS["database:prisma-client"].name,
      category: "database",
      severity: "info",
      message: "Skipped — no Prisma schema or config",
      fixable: false,
    };
  }

  // Determine generator output path
  // Priority: schema's generator.output > helper-derived default
  let generatorOutput = "lib/prisma"; // default fallback

  if (schemaPath) {
    try {
      const content = readFileSync(schemaPath, "utf-8");
      const genMatch = content.match(/generator\s+\w+\s*\{[\s\S]*?output\s*=\s*["']([^"']+)["']/);
      if (genMatch) {
        generatorOutput = genMatch[1];
      }
    } catch {
      // use default
    }
  }

  // Also check if helper file exists to infer output path
  const helperPath = findHelperFile(ctx.cwd);
  if (helperPath) {
    // Helper imports from ./generated/prisma/client (default co-location)
    generatorOutput = join(dirname(helperPath), "generated", "prisma");
  }

  // Check for generated client
  const clientPaths = [
    join(ctx.cwd, generatorOutput, "client.ts"),
    join(ctx.cwd, "node_modules", ".prisma", "client"),
    join(ctx.cwd, "node_modules", "@prisma", "client"),
  ];

  if (schemaPath) {
    clientPaths.unshift(join(dirname(schemaPath), "..", generatorOutput, "client.ts"));
  }

  let found = false;
  for (const path of clientPaths) {
    if (existsSync(path)) {
      found = true;
      break;
    }
  }

  // Also check package.json for @prisma/client dependency
  const pkgPath = join(ctx.cwd, "package.json");
  let hasDependency = false;
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    hasDependency = !!(
      pkg.dependencies?.["@prisma/client"] ||
      pkg.devDependencies?.["@prisma/client"]
    );
  }

  if (!found && !hasDependency) {
    return {
      id: "database:prisma-client",
      name: DATABASE_CHECKS["database:prisma-client"].name,
      category: "database",
      severity: "warn",
      message: "Prisma Client not generated",
      detail: "Run 'pnpm prisma generate' or 'dxg add database' to generate client",
      fixable: true,
      fix: async () => {
        const { executeCommand } = await import("@dxgjs/fs");
        await executeCommand("pnpm", ["prisma", "generate"], { cwd: ctx.cwd });
      },
    };
  }

  if (!found && hasDependency) {
    return {
      id: "database:prisma-client",
      name: DATABASE_CHECKS["database:prisma-client"].name,
      category: "database",
      severity: "warn",
      message: "@prisma/client in package.json but client not generated",
      detail: "Run 'pnpm prisma generate' to generate the client",
      fixable: true,
      fix: async () => {
        const { executeCommand } = await import("@dxgjs/fs");
        await executeCommand("pnpm", ["prisma", "generate"], { cwd: ctx.cwd });
      },
    };
  }

  return {
    id: "database:prisma-client",
    name: DATABASE_CHECKS["database:prisma-client"].name,
    category: "database",
    severity: "ok",
    message: "Prisma Client is generated",
    fixable: false,
  };
}

/**
 * Check if Prisma helper file exists (DXG-owned artifact).
 * Generator creates helper at resolved path with import to generated client.
 */
async function checkHelperFile(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const schemaPath = findPrismaSchema(ctx.cwd);
  const configPath = findPrismaConfig(ctx.cwd);

  if (!schemaPath && !configPath) {
    return {
      id: "database:helper-file",
      name: DATABASE_CHECKS["database:helper-file"].name,
      category: "database",
      severity: "info",
      message: "Skipped — no Prisma schema or config",
      fixable: false,
    };
  }

  const helperPath = findHelperFile(ctx.cwd);

  if (!helperPath) {
    return {
      id: "database:helper-file",
      name: DATABASE_CHECKS["database:helper-file"].name,
      category: "database",
      severity: "warn",
      message: "Prisma helper file not found",
      detail: "Run 'dxg add database' to create the Prisma client helper (lib/prisma.ts)",
      fixable: false, // Generator handles this
    };
  }

  // Verify helper content imports generated client correctly
  try {
    const content = readFileSync(helperPath, "utf-8");
    const hasClientImport = /from\s+["']\.\/generated\/prisma\/client["']/.test(content) ||
      /from\s+["']@prisma\/client["']/.test(content);

    if (!hasClientImport) {
      return {
        id: "database:helper-file",
        name: DATABASE_CHECKS["database:helper-file"].name,
        category: "database",
        severity: "warn",
        message: "Prisma helper exists but may not import generated client correctly",
        detail: `Check ${helperPath.replace(ctx.cwd + "/", "")} for valid client import`,
        fixable: false,
      };
    }
  } catch {
    // ignore read errors
  }

  return {
    id: "database:helper-file",
    name: DATABASE_CHECKS["database:helper-file"].name,
    category: "database",
    severity: "ok",
    message: `Prisma helper found at ${helperPath.replace(ctx.cwd + "/", "")}`,
    fixable: false,
  };
}

/**
 * Check if SQLite database file exists (for SQLite provider).
 * Generator runs `prisma db push` which creates dev.db.
 */
async function checkSqliteDbFile(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const provider = extractProvider(ctx.cwd);
  const schemaPath = findPrismaSchema(ctx.cwd);
  const configPath = findPrismaConfig(ctx.cwd);

  if (!schemaPath && !configPath) {
    return {
      id: "database:sqlite-db-file",
      name: DATABASE_CHECKS["database:sqlite-db-file"].name,
      category: "database",
      severity: "info",
      message: "Skipped — no Prisma schema or config",
      fixable: false,
    };
  }

  // Only relevant for SQLite provider
  if (provider !== "sqlite") {
    return {
      id: "database:sqlite-db-file",
      name: DATABASE_CHECKS["database:sqlite-db-file"].name,
      category: "database",
      severity: "info",
      message: `Skipped — provider is ${provider}, not sqlite`,
      fixable: false,
    };
  }

  const baseDir = schemaPath ? dirname(schemaPath) : dirname(configPath!);
  const dbPath = join(baseDir, "dev.db");

  if (!existsSync(dbPath)) {
    return {
      id: "database:sqlite-db-file",
      name: DATABASE_CHECKS["database:sqlite-db-file"].name,
      category: "database",
      severity: "warn",
      message: "SQLite database file not found",
      detail: "Run 'pnpm prisma db push' to create the database (script added by generator)",
      fixable: false, // User runs this
    };
  }

  return {
    id: "database:sqlite-db-file",
    name: DATABASE_CHECKS["database:sqlite-db-file"].name,
    category: "database",
    severity: "ok",
    message: "SQLite database file exists (prisma/dev.db)",
    fixable: false,
  };
}

/**
 * Check if seed configuration is present in Prisma config.
 * Generator adds migrations.seed entry when db:seed script is selected.
 */
async function checkSeedConfig(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const configPath = findPrismaConfig(ctx.cwd);
  const schemaPath = findPrismaSchema(ctx.cwd);

  if (!configPath && !schemaPath) {
    return {
      id: "database:seed-config",
      name: DATABASE_CHECKS["database:seed-config"].name,
      category: "database",
      severity: "info",
      message: "Skipped — no Prisma schema or config",
      fixable: false,
    };
  }

  // Check package.json for db:seed script
  const pkgPath = join(ctx.cwd, "package.json");
  let hasSeedScript = false;
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    hasSeedScript = !!pkg.scripts?.["db:seed"];
  }

  if (!hasSeedScript) {
    return {
      id: "database:seed-config",
      name: DATABASE_CHECKS["database:seed-config"].name,
      category: "database",
      severity: "info",
      message: "Skipped — db:seed script not configured",
      detail: "Generator adds seed config when db:seed script is selected",
      fixable: false,
    };
  }

  if (!configPath) {
    return {
      id: "database:seed-config",
      name: DATABASE_CHECKS["database:seed-config"].name,
      category: "database",
      severity: "warn",
      message: "db:seed script present but prisma7.config.ts not found",
      detail: "Run 'dxg add database' to create Prisma config with seed",
      fixable: false,
    };
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    const hasSeed = /seed\s*:\s*["']([^"']+)["']/.test(content);

    if (!hasSeed) {
      return {
        id: "database:seed-config",
        name: DATABASE_CHECKS["database:seed-config"].name,
        category: "database",
        severity: "warn",
        message: "db:seed script configured but migrations.seed missing in prisma7.config.ts",
        detail: "Run 'dxg add database' to add seed configuration",
        fixable: false,
      };
    }

    return {
      id: "database:seed-config",
      name: DATABASE_CHECKS["database:seed-config"].name,
      category: "database",
      severity: "ok",
      message: "Seed configuration present in prisma7.config.ts",
      fixable: false,
    };
  } catch {
    return {
      id: "database:seed-config",
      name: DATABASE_CHECKS["database:seed-config"].name,
      category: "database",
      severity: "error",
      message: "Failed to read prisma7.config.ts",
      fixable: false,
    };
  }
}

/**
 * Check database connectivity.
 * Only testable with real DB server; generator doesn't test connectivity.
 * Conditional: only if DATABASE_URL is configured and not file-based.
 */
async function checkConnectivity(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const schemaPath = findPrismaSchema(ctx.cwd);
  const configPath = findPrismaConfig(ctx.cwd);

  if (!schemaPath && !configPath) {
    return {
      id: "database:connectivity",
      name: DATABASE_CHECKS["database:connectivity"].name,
      category: "database",
      severity: "info",
      message: "Skipped — no Prisma schema or config",
      fixable: false,
    };
  }

  // Check if DATABASE_URL is set in env
  const envPath = join(ctx.cwd, ".env");
  let databaseUrl = "";
  let isFileBased = false;

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const lines = content.split("\n");
    const databaseUrlLine = lines.find((line) =>
      line.trim().startsWith("DATABASE_URL")
    );
    if (databaseUrlLine) {
      databaseUrl = databaseUrlLine.split("=")[1]?.trim().replace(/^["']|["']$/g, "") || "";
      isFileBased = databaseUrl.startsWith("file:") || databaseUrl.startsWith("sqlite:");
    }
  }

  if (!databaseUrl) {
    return {
      id: "database:connectivity",
      name: DATABASE_CHECKS["database:connectivity"].name,
      category: "database",
      severity: "info",
      message: "Skipped — DATABASE_URL not set in .env",
      detail: "Configure DATABASE_URL to enable connectivity check",
      fixable: false,
    };
  }

  if (isFileBased) {
    return {
      id: "database:connectivity",
      name: DATABASE_CHECKS["database:connectivity"].name,
      category: "database",
      severity: "info",
      message: "Skipped — file-based database (SQLite)",
      detail: "Connectivity check only for server databases",
      fixable: false,
    };
  }

  // Try to connect using Prisma
  try {
    const { executeCommand } = await import("@dxgjs/fs");
    const result = await executeCommand("pnpm", ["prisma", "db", "execute", "--stdin"], {
      cwd: ctx.cwd,
      input: "SELECT 1;",
      timeout: 10000,
    });

    if (result.exitCode === 0) {
      return {
        id: "database:connectivity",
        name: DATABASE_CHECKS["database:connectivity"].name,
        category: "database",
        severity: "ok",
        message: "Database connection successful",
        fixable: false,
      };
    }

    return {
      id: "database:connectivity",
      name: DATABASE_CHECKS["database:connectivity"].name,
      category: "database",
      severity: "warn", // Changed from error to warn - connectivity issues may be transient
      message: "Database connection failed",
      detail: String(result.stderr ?? "") || "Unknown error",
      fixable: false,
    };
  } catch (error) {
    return {
      id: "database:connectivity",
      name: DATABASE_CHECKS["database:connectivity"].name,
      category: "database",
      severity: "warn",
      message: "Database connection failed",
      detail: error instanceof Error ? error.message : String(error),
      fixable: false,
    };
  }
}

/**
 * Register all database checks.
 */
export async function registerDatabaseChecks(): Promise<void> {
  const { registerCheck } = await import("../registry");

  registerCheck("database:prisma-schema", checkPrismaSchema, "database");
  registerCheck("database:prisma-config", checkPrismaConfig, "database");
  registerCheck("database:provider", checkProvider, "database");
  registerCheck("database:prisma-client", checkPrismaClient, "database");
  registerCheck("database:helper-file", checkHelperFile, "database");
  registerCheck("database:sqlite-db-file", checkSqliteDbFile, "database");
  registerCheck("database:seed-config", checkSeedConfig, "database");
  registerCheck("database:connectivity", checkConnectivity, "database");
}