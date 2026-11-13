/**
 * Environment checks for dxg doctor.
 * Validates .env files, DATABASE_URL, and environment configuration.
 * Aligned with the database generator's actual behavior.
 */

import type { DoctorContext, DoctorCheckResult, DoctorCategory } from "../types";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { ensureGitignoreEntry } from "@dxgjs/ast";
import {
  providerPlaceholders,
  getProviderData,
  isSupportedProvider,
  extractProviderFromSchema,
  extractProviderFromConfig,
  normalizePrismaProvider,
} from "@dxgjs/database-meta";
import { SCHEMA_PATH, PRISMA_CONFIG_PATH } from "@dxgjs/database-meta";

const ENV_CHECKS = {
  "env:dotenv-exists": {
    name: "Dotenv file exists",
    category: "env" as DoctorCategory,
  },
  "env:database-url": {
    name: "DATABASE_URL configured",
    category: "env" as DoctorCategory,
  },
  "env:database-url-format": {
    name: "DATABASE_URL format valid",
    category: "env" as DoctorCategory,
  },
  "env:no-secrets-in-git": {
    name: "No secrets committed to git",
    category: "env" as DoctorCategory,
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
 * Check if .env file exists when needed (Prisma schema exists or DATABASE_URL referenced).
 * The database generator creates .env only when DATABASE_URL is needed.
 */
async function checkDotenvExists(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const envPath = join(ctx.cwd, ".env");

  // Check if Prisma schema exists (generator would need .env)
  const { existsSync: existsSyncFs } = await import("fs");
  const { join: joinPath } = await import("path");
  const possibleSchemaPaths = [
    joinPath(ctx.cwd, "prisma", "schema.prisma"),
    joinPath(ctx.cwd, "packages", "database", "prisma", "schema.prisma"),
    joinPath(ctx.cwd, "apps", "api", "prisma", "schema.prisma"),
  ];
  const hasPrismaSchema = possibleSchemaPaths.some(p => existsSyncFs(p));

  // Check if .env.example exists (user may have their own config)
  const examplePath = join(ctx.cwd, ".env.example");
  const hasExample = existsSyncFs(examplePath);

  if (!existsSync(envPath)) {
    if (hasPrismaSchema || hasExample) {
      return {
        id: "env:dotenv-exists",
        name: ENV_CHECKS["env:dotenv-exists"].name,
        category: "env",
        severity: "warn",
        message: "No .env file found",
        detail: hasExample
          ? "Create .env from .env.example to configure environment variables"
          : "Database generator will create .env when needed",
        fixable: true,
        fix: async () => {
          if (existsSync(examplePath)) {
            const content = readFileSync(examplePath, "utf-8");
            await ctx.fs.writeFile(envPath, content);
          } else {
            // Generator creates minimal .env with DATABASE_URL placeholder
            await ctx.fs.writeFile(envPath, "# Environment variables\nDATABASE_URL=\"\"\n");
          }
        },
      };
    }

    // No Prisma schema and no .env.example - .env is optional
    return {
      id: "env:dotenv-exists",
      name: ENV_CHECKS["env:dotenv-exists"].name,
      category: "env",
      severity: "info",
      message: ".env file not found (optional)",
      detail: "Create .env if you need environment variables",
      fixable: false,
    };
  }

  return {
    id: "env:dotenv-exists",
    name: ENV_CHECKS["env:dotenv-exists"].name,
    category: "env",
    severity: "ok",
    message: ".env file exists",
    fixable: false,
  };
}

/**
 * Check if DATABASE_URL is configured in .env.
 * Generator behavior: SQLite gets valid file URL (file:./dev.db), server providers get empty placeholder.
 */
async function checkDatabaseUrl(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const envPath = join(ctx.cwd, ".env");

  if (!existsSync(envPath)) {
    return {
      id: "env:database-url",
      name: ENV_CHECKS["env:database-url"].name,
      category: "env",
      severity: "info",
      message: "Cannot check DATABASE_URL — no .env file",
      detail: "Run dxg add database to create .env with appropriate DATABASE_URL",
      fixable: false,
    };
  }

  const content = readFileSync(envPath, "utf-8");
  const lines = content.split("\n");
  const databaseUrlLine = lines.find((line) =>
    line.trim().startsWith("DATABASE_URL")
  );

  if (!databaseUrlLine) {
    return {
      id: "env:database-url",
      name: ENV_CHECKS["env:database-url"].name,
      category: "env",
      severity: "warn",
      message: "DATABASE_URL not set in .env",
      detail: "Run dxg add database to configure DATABASE_URL for your provider",
      fixable: false, // Generator handles this, not doctor
    };
  }

  const value = databaseUrlLine.split("=")[1]?.trim().replace(/^["']|["']$/g, "");

  if (!value || value === '""' || value === "''") {
    // Empty DATABASE_URL - check if SQLite provider (would have file: URL)
    // For server providers, empty is expected until user fills it in
    return {
      id: "env:database-url",
      name: ENV_CHECKS["env:database-url"].name,
      category: "env",
      severity: "warn",
      message: "DATABASE_URL is empty in .env",
      detail: "For SQLite: use file:./dev.db. For server providers: add your connection string",
      fixable: false, // User must provide real connection string
    };
  }

  return {
    id: "env:database-url",
    name: ENV_CHECKS["env:database-url"].name,
    category: "env",
    severity: "ok",
    message: "DATABASE_URL is configured",
    fixable: false,
  };
}

/**
 * Check DATABASE_URL format validity using provider-specific validation.
 */
async function checkDatabaseUrlFormat(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const envPath = join(ctx.cwd, ".env");

  if (!existsSync(envPath)) {
    return {
      id: "env:database-url-format",
      name: ENV_CHECKS["env:database-url-format"].name,
      category: "env",
      severity: "info",
      message: "Skipped — no .env file",
      fixable: false,
    };
  }

  const content = readFileSync(envPath, "utf-8");
  const lines = content.split("\n");
  const databaseUrlLine = lines.find((line) =>
    line.trim().startsWith("DATABASE_URL")
  );

  if (!databaseUrlLine) {
    return {
      id: "env:database-url-format",
      name: ENV_CHECKS["env:database-url-format"].name,
      category: "env",
      severity: "info",
      message: "Skipped — DATABASE_URL not set",
      fixable: false,
    };
  }

  const value = databaseUrlLine.split("=")[1]?.trim().replace(/^["']|["']$/g, "");

  if (!value) {
    return {
      id: "env:database-url-format",
      name: ENV_CHECKS["env:database-url-format"].name,
      category: "env",
      severity: "info",
      message: "Skipped — DATABASE_URL is empty",
      fixable: false,
    };
  }

  // Detect provider from Prisma schema/config for provider-specific validation
  const provider = extractProvider(ctx.cwd);
  const providerData = provider && isSupportedProvider(provider) ? getProviderData(provider) : null;

  // Validate URL format
  try {
    const url = new URL(value);

    // Provider-specific protocol validation
    if (providerData) {
      const expectedProtocol = providerData.instantiationPattern === "connectionString"
        ? (providerData.prismaProvider === "postgresql" ? "postgresql:" :
           providerData.prismaProvider === "mysql" ? "mysql:" :
           providerData.prismaProvider === "sqlite" ? "file:" : "postgresql:")
        : null;

      // For SQLite, both file: and sqlite: are valid
      if (providerData.key === "sqlite") {
        if (url.protocol !== "file:" && url.protocol !== "sqlite:") {
          return {
            id: "env:database-url-format",
            name: ENV_CHECKS["env:database-url-format"].name,
            category: "env",
            severity: "warn",
            message: `DATABASE_URL protocol "${url.protocol}" does not match SQLite provider`,
            detail: `Expected file: or sqlite: for SQLite provider. Placeholder: ${providerPlaceholders.sqlite}`,
            fixable: false,
          };
        }
      } else if (expectedProtocol && url.protocol !== expectedProtocol) {
        // For server providers, check protocol matches
        // Allow both postgresql: and postgres: for PostgreSQL
        const isPostgres = providerData.prismaProvider === "postgresql";
        const protocolMatches = isPostgres
          ? (url.protocol === "postgresql:" || url.protocol === "postgres:")
          : url.protocol === expectedProtocol;

        if (!protocolMatches) {
          return {
            id: "env:database-url-format",
            name: ENV_CHECKS["env:database-url-format"].name,
            category: "env",
            severity: "warn",
            message: `DATABASE_URL protocol "${url.protocol}" may not match ${providerData.displayName} provider`,
            detail: `Expected ${expectedProtocol} for ${providerData.displayName}. Placeholder: ${providerPlaceholders[providerData.key]}`,
            fixable: false,
          };
        }
      }
    } else {
      // Fallback to generic validation when provider unknown
      const validProtocols = ["postgresql:", "postgres:", "mysql:", "sqlite:", "file:"];
      if (!validProtocols.includes(url.protocol)) {
        return {
          id: "env:database-url-format",
          name: ENV_CHECKS["env:database-url-format"].name,
          category: "env",
          severity: "warn",
          message: `DATABASE_URL protocol "${url.protocol}" may not be supported`,
          detail: "Supported: postgresql://, postgres://, mysql://, sqlite://, file://",
          fixable: false,
        };
      }

      if (url.protocol === "sqlite:" || url.protocol === "file:") {
        // SQLite file path validation
        const dbPath = url.pathname;
        if (!dbPath || dbPath === "/") {
          return {
            id: "env:database-url-format",
            name: ENV_CHECKS["env:database-url-format"].name,
            category: "env",
            severity: "error",
            message: "SQLite DATABASE_URL missing file path",
            detail: "Use file:./dev.db or sqlite:./dev.db",
            fixable: false,
          };
        }
      }
    }

    return {
      id: "env:database-url-format",
      name: ENV_CHECKS["env:database-url-format"].name,
      category: "env",
      severity: "ok",
      message: "DATABASE_URL format is valid",
      fixable: false,
    };
  } catch {
    return {
      id: "env:database-url-format",
      name: ENV_CHECKS["env:database-url-format"].name,
      category: "env",
      severity: "error",
      message: "DATABASE_URL is not a valid URL",
      detail: "Expected format: postgresql://user:pass@host:port/db",
      fixable: false,
    };
  }
}

/**
 * Check for secrets committed to git.
 */
async function checkNoSecretsInGit(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const envPath = join(ctx.cwd, ".env");
  const _gitignorePath = join(ctx.cwd, ".gitignore");
void _gitignorePath;

  // Check if .env is tracked by git
  try {
    const { executeCommand } = await import("@dxgjs/fs");
    const result = await executeCommand("git", ["ls-files", ".env"], { cwd: ctx.cwd });

    const stdout = String(result.stdout ?? "");
    if (stdout.trim() === ".env") {
      // .env is tracked - check if it contains real secrets
      if (existsSync(envPath)) {
        const content = readFileSync(envPath, "utf-8");
        const hasRealSecrets = /DATABASE_URL\s*=\s*["']?postgresql:\/\/[^"'\s]+["']?/i.test(content) ||
          /DATABASE_URL\s*=\s*["']?mysql:\/\/[^"'\s]+["']?/i.test(content) ||
          /SECRET|TOKEN|KEY|PASSWORD/i.test(content);

        if (hasRealSecrets) {
          return {
            id: "env:no-secrets-in-git",
            name: ENV_CHECKS["env:no-secrets-in-git"].name,
            category: "env",
            severity: "error",
            message: ".env file is tracked by git and contains secrets",
            detail: "Add .env to .gitignore and rotate any exposed credentials",
            fixable: true,
            fix: async () => {
              await ensureGitignoreEntry(ctx.fs, ".env");
              // Note: Cannot automatically rotate secrets - user must do this manually
            },
          };
        }
      }

      return {
        id: "env:no-secrets-in-git",
        name: ENV_CHECKS["env:no-secrets-in-git"].name,
        category: "env",
        severity: "warn",
        message: ".env file is tracked by git",
        detail: "Add .env to .gitignore to prevent committing secrets",
        fixable: true,
        fix: async () => {
          await ensureGitignoreEntry(ctx.fs, ".env");
        },
      };
    }
  } catch {
    // Not a git repo or git not available
  }

  return {
    id: "env:no-secrets-in-git",
    name: ENV_CHECKS["env:no-secrets-in-git"].name,
    category: "env",
    severity: "ok",
    message: "No secrets found in git-tracked files",
    fixable: false,
  };
}

/**
 * Register all environment checks.
 */
export async function registerEnvChecks(): Promise<void> {
  const { registerCheck } = await import("../registry");

  registerCheck("env:dotenv-exists", checkDotenvExists, "env");
  registerCheck("env:database-url", checkDatabaseUrl, "env");
  registerCheck("env:database-url-format", checkDatabaseUrlFormat, "env");
  registerCheck("env:no-secrets-in-git", checkNoSecretsInGit, "env");
}