/**
 * Database checks for dxg doctor.
 * Validates Prisma schema, provider, generated client, and DXG-owned artifacts.
 * Aligned with the database generator's actual behavior.
 */

import type { DoctorContext, DoctorCheckResult, DoctorCategory } from "../types";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { toDisplayPath } from "../utils/paths";
import {
  SCHEMA_PATH,
  PRISMA_CONFIG_PATH,
  DEFAULT_HELPER_PATH,
  DEFAULT_GENERATOR_OUTPUT,
  SUPPORTED_PROVIDERS,
  getProviderData,
  isSupportedProvider,
  extractProviderFromSchema,
  extractProviderFromConfig,
  normalizePrismaProvider,
  parseGeneratorOutput,
  resolveGeneratorOutput,
  isValidPrismaClientHelper,
  SEED_SCRIPT_NAME,
  SEED_CONFIG_COMMAND,
} from "@dxgjs/database-meta";

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
    join(cwd, SCHEMA_PATH),
    join(cwd, "packages", "database", SCHEMA_PATH),
    join(cwd, "apps", "api", SCHEMA_PATH),
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
    join(cwd, PRISMA_CONFIG_PATH),
    join(cwd, "prisma", PRISMA_CONFIG_PATH),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Extract provider from schema or config using database-meta utilities.
 */
function extractProvider(cwd: string): string | null {
  // Try schema first
  const schemaPath = findPrismaSchema(cwd);
  if (schemaPath) {
    try {
      const content = readFileSync(schemaPath, "utf-8");
      const provider = extractProviderFromSchema(content);
      if (provider) return normalizePrismaProvider(provider);
    } catch {
      // fall through
    }
  }

  // Try config
  const configPath = findPrismaConfig(cwd);
  if (configPath) {
    try {
      const content = readFileSync(configPath, "utf-8");
      const provider = extractProviderFromConfig(content);
      if (provider) return normalizePrismaProvider(provider);
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
    join(cwd, DEFAULT_HELPER_PATH),
    join(cwd, "src", DEFAULT_HELPER_PATH),
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
    message: `Prisma schema found at ${toDisplayPath(schemaPath, ctx.cwd)}`,
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
    message: `Prisma config found at ${toDisplayPath(configPath!, ctx.cwd)}`,
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
    // Try to determine provider from context (e.g., from DATABASE_URL or defaults)
    // For now, we can only fix schema.prisma (not config)
    const canFix = !!schemaPath && !configPath;

    return {
      id: "database:provider",
      name: DATABASE_CHECKS["database:provider"].name,
      category: "database",
      severity: "error",
      message: "No provider specified in Prisma schema or config",
      detail: "Run 'dxg add database' to configure a provider",
      fixable: canFix,
      fix: canFix
        ? async () => {
            // Use AST to add provider to datasource block in schema.prisma
            await fixProviderInSchema(ctx.cwd, schemaPath!);
          }
        : undefined,
    };
  }

  if (!isSupportedProvider(provider)) {
    return {
      id: "database:provider",
      name: DATABASE_CHECKS["database:provider"].name,
      category: "database",
      severity: "warn",
      message: `Unknown provider: ${provider}`,
      detail: `Valid providers: ${SUPPORTED_PROVIDERS.join(", ")}`,
      fixable: false,
    };
  }

  const providerData = getProviderData(provider);
  return {
    id: "database:provider",
    name: DATABASE_CHECKS["database:provider"].name,
    category: "database",
    severity: "ok",
    message: `Provider configured: ${providerData?.displayName ?? provider}`,
    fixable: false,
  };
}

/**
 * AST-based fix: Add provider to datasource block in schema.prisma.
 * Uses targeted string replacement since Prisma schema has its own syntax.
 */
async function fixProviderInSchema(_cwd: string, schemaPath: string): Promise<void> {
  const { readFile, writeFile } = await import("@dxgjs/fs");

  // Read the schema file
  const contentResult = await readFile(schemaPath, "utf-8");
  const content = typeof contentResult === "string" ? contentResult : new TextDecoder().decode(contentResult);

  // Check if there's already a provider in the datasource block
  const hasProvider = /datasource\s+\w+\s*\{[\s\S]*?provider\s*=/.test(content);

  if (!hasProvider) {
    // Determine provider from context (for now default to postgresql)
    // In the future, we could infer from DATABASE_URL or other hints
    const provider = "postgresql";

    // Add provider to the datasource block
    const updated = content.replace(
      /(datasource\s+\w+\s*\{)([\s\S]*?)(\})/,
      (_match: string, before: string, middle: string, after: string) => {
        // Check if there's already a url line
        const hasUrl = /url\s*=/.test(middle);
        const indent = middle.match(/^\s*/)?.[0] || "  ";
        const providerLine = `${indent}provider = "${provider}"`;
        if (hasUrl) {
          // Insert before url line
          return before + "\n" + providerLine + "\n" + middle + after;
        } else {
          // Just add it
          return before + "\n" + providerLine + "\n" + middle + after;
        }
      }
    );

    await writeFile(schemaPath, updated, "utf-8");
  }
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

  // Determine generator output path using database-meta utilities
  // Priority: schema's generator.output > DEFAULT_GENERATOR_OUTPUT
  let generatorOutput = DEFAULT_GENERATOR_OUTPUT;
  let generatorBlockMissing = false;
  let generatorOutputMissing = false;

  if (schemaPath) {
    try {
      const content = readFileSync(schemaPath, "utf-8");
      const { present, output } = parseGeneratorOutput(content);
      if (!present) {
        generatorBlockMissing = true;
      } else if (!output) {
        generatorOutputMissing = true;
      } else {
        const resolved = resolveGeneratorOutput(output);
        if (resolved) {
          generatorOutput = resolved;
        }
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

  // Case 1: Generator block missing entirely - can fix by adding generator block
  if (!found && !hasDependency && schemaPath && generatorBlockMissing) {
    return {
      id: "database:prisma-client",
      name: DATABASE_CHECKS["database:prisma-client"].name,
      category: "database",
      severity: "warn",
      message: "Prisma Client not generated and generator block missing in schema.prisma",
      detail: "Run 'dxg add database' to add generator block with output path, then run 'pnpm prisma generate'",
      fixable: true,
      fix: async () => {
        await fixGeneratorBlockInSchema(ctx.cwd, schemaPath!);
      },
    };
  }

  // Case 2: Generator block exists but output missing - can fix by adding output
  if (!found && !hasDependency && schemaPath && generatorOutputMissing) {
    return {
      id: "database:prisma-client",
      name: DATABASE_CHECKS["database:prisma-client"].name,
      category: "database",
      severity: "warn",
      message: "Prisma Client not generated and generator output missing in schema.prisma",
      detail: "Add output path to generator block, then run 'pnpm prisma generate'",
      fixable: true,
      fix: async () => {
        await fixGeneratorOutputInSchema(ctx.cwd, schemaPath!);
      },
    };
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
 * AST-based fix: Add generator block with output to schema.prisma.
 * Uses targeted string replacement since Prisma schema has its own syntax.
 */
async function fixGeneratorBlockInSchema(_cwd: string, schemaPath: string): Promise<void> {
  const { readFile, writeFile } = await import("@dxgjs/fs");

  const contentResult = await readFile(schemaPath, "utf-8");
  const content = typeof contentResult === "string" ? contentResult : new TextDecoder().decode(contentResult);

  // Check if generator block already exists
  const hasGeneratorBlock = /generator\s+client\s*\{/.test(content);
  if (hasGeneratorBlock) return;

  // Add generator block after datasource block
  const updated = content.replace(
    /(datasource\s+\w+\s*\{[\s\S]*?\})/,
    (match) => match + "\n\ngenerator client {\n  provider = \"prisma-client-js\"\n  output   = \"" + DEFAULT_GENERATOR_OUTPUT + "\"\n}"
  );

  await writeFile(schemaPath, updated, "utf-8");
}

/**
 * AST-based fix: Add output to existing generator block in schema.prisma.
 * Uses targeted string replacement since Prisma schema has its own syntax.
 */
async function fixGeneratorOutputInSchema(_cwd: string, schemaPath: string): Promise<void> {
  const { readFile, writeFile } = await import("@dxgjs/fs");

  const contentResult = await readFile(schemaPath, "utf-8");
  const content = typeof contentResult === "string" ? contentResult : new TextDecoder().decode(contentResult);

  // Check if generator block exists but has no output
  const generatorMatch = /generator\s+client\s*\{([\s\S]*?)\}/.exec(content);
  if (!generatorMatch) return;

  const block = generatorMatch[1];
  const hasOutput = /output\s*=/.test(block);
  if (hasOutput) return;

  // Add output to the generator block
  const updated = content.replace(
    /(generator\s+client\s*\{)([\s\S]*?)(\})/,
    (_match: string, before: string, middle: string, after: string) => {
      const indent = middle.match(/^\s*/)?.[0] || "  ";
      const outputLine = `${indent}output   = "${DEFAULT_GENERATOR_OUTPUT}"`;
      return before + "\n" + middle + "\n" + outputLine + "\n" + after;
    }
  );

  await writeFile(schemaPath, updated, "utf-8");
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
    // Try to determine provider for template selection
    const provider = extractProvider(ctx.cwd) || "postgresql";
    const providerData = getProviderData(provider);

    return {
      id: "database:helper-file",
      name: DATABASE_CHECKS["database:helper-file"].name,
      category: "database",
      severity: "warn",
      message: "Prisma helper file not found",
      detail: "Run 'dxg add database' to create the Prisma client helper (lib/prisma.ts)",
      fixable: true,
      fix: async () => {
        await fixHelperFile(ctx.cwd, provider, providerData?.templateOutputPath || DEFAULT_HELPER_PATH);
      },
    };
  }

  // Verify helper content imports generated client correctly
  try {
    const content = readFileSync(helperPath, "utf-8");
    if (!isValidPrismaClientHelper(content)) {
      return {
        id: "database:helper-file",
        name: DATABASE_CHECKS["database:helper-file"].name,
        category: "database",
        severity: "warn",
        message: "Prisma helper exists but does not match expected pattern",
        detail: `Check ${toDisplayPath(helperPath, ctx.cwd)} for valid PrismaClient helper structure`,
        fixable: true,
        fix: async () => {
          const provider = extractProvider(ctx.cwd) || "postgresql";
          const providerData = getProviderData(provider);
          await fixHelperFile(ctx.cwd, provider, providerData?.templateOutputPath || DEFAULT_HELPER_PATH);
        },
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
    message: `Prisma helper found at ${toDisplayPath(helperPath, ctx.cwd)}`,
    fixable: false,
  };
}

/**
 * AST-based fix: Create Prisma helper file from template.
 * Uses targeted file creation with proper import path calculation.
 */
async function fixHelperFile(
  cwd: string,
  provider: string,
  helperPath: string
): Promise<void> {
  const { writeFile, mkdir } = await import("@dxgjs/fs");

  // Template selection based on provider
  const isSqlite = provider === "sqlite";
  const isMySQL = provider === "mysql";
  const isSqlServer = provider === "sqlserver";
  const isPlanetScale = provider === "planetscale";

  // Build the helper template based on provider
  // This mirrors the templates in generators/database/templates/
  let template = "";

  if (isSqlite) {
    // SQLite template uses BetterSqlite3 adapter
    template = generateSqliteHelper();
  } else if (isMySQL) {
    // MySQL template uses MariaDB adapter with individual params
    template = generateMySQLHelper();
  } else if (isSqlServer) {
    // SQL Server template uses MSSQL adapter
    template = generateSQLServerHelper();
  } else if (isPlanetScale) {
    // PlanetScale template uses PlanetScale adapter
    template = generatePlanetScaleHelper();
  } else {
    // Default (PostgreSQL, CockroachDB, Prisma Postgres) - connection string
    template = generateDefaultHelper();
  }

  // Ensure directory exists
  const fullHelperPath = join(cwd, helperPath);
  const helperDirPath = dirname(fullHelperPath);
  await mkdir(helperDirPath, { recursive: true });

  await writeFile(fullHelperPath, template, "utf-8");
}

/**
 * Generate default helper template (PostgreSQL, CockroachDB, Prisma Postgres).
 */
function generateDefaultHelper(): string {
  return `import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;
}

/**
 * Generate SQLite helper template.
 */
function generateSqliteHelper(): string {
  return `import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const sqlite = new Database(process.env.DATABASE_URL?.replace("file:", "") ?? "./dev.db");
const adapter = new PrismaBetterSqlite3(sqlite);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;
}

/**
 * Generate MySQL helper template.
 */
function generateMySQLHelper(): string {
  return `import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createPool } from "mariadb";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const pool = createPool({
  host: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? "3306"),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
});

const adapter = new PrismaMariaDb(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;
}

/**
 * Generate SQL Server helper template.
 */
function generateSQLServerHelper(): string {
  return `import { PrismaClient } from "@prisma/client";
import { PrismaMssql } from "@prisma/adapter-mssql";
import sql from "mssql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const pool = new sql.ConnectionPool({
  server: process.env.DATABASE_HOST,
  port: Number(process.env.DATABASE_PORT ?? "1433"),
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE_NAME,
  options: {
    encrypt: process.env.DATABASE_SSL === "true",
    trustServerCertificate: true,
  },
});

const adapter = new PrismaMssql(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;
}

/**
 * Generate PlanetScale helper template.
 */
function generatePlanetScaleHelper(): string {
  return `import { PrismaClient } from "@prisma/client";
import { PrismaPlanetScale } from "@prisma/adapter-planetscale";
import { createPool } from "@planetscale/database";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const pool = createPool({
  host: process.env.DATABASE_HOST,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  // PlanetScale uses fetch under the hood
});

const adapter = new PrismaPlanetScale(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
`;
}

/**
 * Check if SQLite database file exists (for SQLite provider).
 * Generator runs `prisma db push` which creates dev.db.
 * Returns empty array for non-SQLite providers (check not applicable).
 */
async function checkSqliteDbFile(ctx: DoctorContext): Promise<DoctorCheckResult[]> {
  const provider = extractProvider(ctx.cwd);
  const schemaPath = findPrismaSchema(ctx.cwd);
  const configPath = findPrismaConfig(ctx.cwd);

  if (!schemaPath && !configPath) {
    return [{
      id: "database:sqlite-db-file",
      name: DATABASE_CHECKS["database:sqlite-db-file"].name,
      category: "database",
      severity: "info",
      message: "Skipped — no Prisma schema or config",
      fixable: false,
    }];
  }

  // Only relevant for SQLite provider - return empty array for others
  const sqliteProviderData = getProviderData("sqlite");
  if (!sqliteProviderData || provider !== sqliteProviderData.key) {
    return [];
  }

  const baseDir = schemaPath ? dirname(schemaPath) : dirname(configPath!);
  const dbPath = join(baseDir, "dev.db");

  if (!existsSync(dbPath)) {
    return [{
      id: "database:sqlite-db-file",
      name: DATABASE_CHECKS["database:sqlite-db-file"].name,
      category: "database",
      severity: "warn",
      message: "SQLite database file not found",
      detail: "Run 'pnpm prisma db push' to create the database (script added by generator)",
      fixable: false, // User runs this
    }];
  }

  return [{
    id: "database:sqlite-db-file",
    name: DATABASE_CHECKS["database:sqlite-db-file"].name,
    category: "database",
    severity: "ok",
    message: "SQLite database file exists (prisma/dev.db)",
    fixable: false,
  }];
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

  // Check package.json for db:seed script using constant from database-meta
  const pkgPath = join(ctx.cwd, "package.json");
  let hasSeedScript = false;
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    hasSeedScript = !!pkg.scripts?.[SEED_SCRIPT_NAME];
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
    const hasSeed = new RegExp(`seed\\s*:\\s*["']${SEED_CONFIG_COMMAND.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(content);

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

  // Try to connect using Prisma with strict stdio isolation and short timeout
  const TIMEOUT_MS = 4000;

  try {
    const { executeCommand } = await import("@dxgjs/fs");
    const result = await executeCommand("pnpm", ["prisma", "db", "execute", "--stdin"], {
      cwd: ctx.cwd,
      timeout: TIMEOUT_MS,
      // Strict stdio piping prevents pnpm lockfile validation logs
      // and other side-channel output from corrupting the CLI layout
      stdio: ["pipe", "pipe", "pipe"],
      input: "SELECT 1;",
      killDescendants: true, // Ensure full process tree cleanup on timeout
    });

    if (result.exitCode === 0) {
      return {
        id: "database:connectivity",
        name: DATABASE_CHECKS["database:connectivity"].name,
        category: "database",
        severity: "ok",
        message: "Database connection established successfully",
        fixable: false,
      };
    }

    return {
      id: "database:connectivity",
      name: DATABASE_CHECKS["database:connectivity"].name,
      category: "database",
      severity: "warn",
      message: "Database connection failed",
      detail: typeof result.stderr === "string" ? result.stderr.trim() : "An unknown database connection error occurred.",
      fixable: false,
    };
  } catch (error) {
    const execaError = error as Error & { code?: string; timedOut?: boolean; exitCode?: number; stdout?: string; stderr?: string };
    // Handle explicit timeout
    if (execaError.code === "ETIMEDOUT" || execaError.timedOut) {
      return {
        id: "database:connectivity",
        name: DATABASE_CHECKS["database:connectivity"].name,
        category: "database",
        severity: "warn",
        message: "Connection failed: timeout",
        detail: `The database did not respond within ${TIMEOUT_MS}ms. Ensure your instance is running and reachable.`,
        fixable: false,
      };
    }

    // Handle other execution failures (wrong credentials, network down, etc.)
    return {
      id: "database:connectivity",
      name: DATABASE_CHECKS["database:connectivity"].name,
      category: "database",
      severity: "warn",
      message: "Database connection failed",
      detail: execaError.message || "An unknown database connection error occurred.",
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