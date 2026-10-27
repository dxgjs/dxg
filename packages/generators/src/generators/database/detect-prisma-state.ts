/**
 * READ-ONLY Prisma provider detection.
 *
 * Extracts the provider from an existing Prisma schema (prisma/schema.prisma)
 * or Prisma 7 config (prisma7.config.ts). Never writes, never mutates.
 * Used by the database generator to detect provider mismatches before planning.
 */

import type { GeneratorContext } from "../../types";

export interface PrismaState {
  /** Whether Prisma is installed (schema.prisma or prisma7.config.ts exists). */
  installed: boolean;
  /** The detected provider key (e.g., "postgresql", "sqlite", "mysql"), or null if undetermined. */
  provider: string | null;
  /** Path to the schema file that was read, or null. */
  schemaPath: string | null;
}

/**
 * Normalizes a Prisma datasource provider string to the canonical DXG provider key.
 * Handles "postgres" → "postgresql" and other aliases.
 */
export function normalizePrismaProvider(raw: string): string {
  const normalized = raw.trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (normalized === "postgres") return "postgresql";
  return normalized;
}

/**
 * Extracts the provider from a Prisma schema.prisma text.
 * Looks for `datasource <name> { provider = "..." }` pattern, ignoring comments.
 */
export function extractProviderFromSchema(schemaText: string): string | null {
  // Remove single-line comments
  const withoutSingleLineComments = schemaText.replace(/\/\/.*$/gm, "");
  // Remove multi-line comments
  const withoutComments = withoutSingleLineComments.replace(/\/\*[\s\S]*?\*\//g, "");

  // Find datasource block and extract provider
  // Matches: datasource db { provider = "postgresql" } or datasource db { provider = "postgres" }
  const datasourceMatch = withoutComments.match(
    /datasource\s+\w+\s*\{([\s\S]*?)\}/,
  );
  if (!datasourceMatch) return null;

  const block = datasourceMatch[1];
  const providerMatch = /provider\s*=\s*["']([^"']+)["']/.exec(block);
  if (!providerMatch) return null;

  return normalizePrismaProvider(providerMatch[1]);
}

/**
 * Extracts the provider from a Prisma 7 config (prisma7.config.ts) text.
 * Looks for `datasourceProvider: "..."` or `datasource: { provider: "..." }` patterns.
 */
export function extractProviderFromConfig(configText: string): string | null {
  // Remove comments
  const withoutSingleLineComments = configText.replace(/\/\/.*$/gm, "");
  const withoutComments = withoutSingleLineComments.replace(/\/\*[\s\S]*?\*\//g, "");

  // Pattern 1: datasourceProvider: "postgresql"
  const directMatch = /datasourceProvider\s*:\s*["']([^"']+)["']/.exec(
    withoutComments,
  );
  if (directMatch) return normalizePrismaProvider(directMatch[1]);

  // Pattern 2: datasource: { provider: "postgresql" }
  const datasourceBlockMatch = /datasource\s*:\s*\{([\s\S]*?)\}/.exec(
    withoutComments,
  );
  if (datasourceBlockMatch) {
    const block = datasourceBlockMatch[1];
    const providerMatch = /provider\s*:\s*["']([^"']+)["']/.exec(block);
    if (providerMatch) return normalizePrismaProvider(providerMatch[1]);
  }

  return null;
}

/**
 * Detects the existing Prisma state in the project.
 * Reads schema.prisma first, falls back to prisma7.config.ts.
 * Returns { installed: false, provider: null, schemaPath: null } if neither exists.
 */
export async function detectPrismaState(
  ctx: Pick<GeneratorContext, "fs">,
): Promise<PrismaState> {
  const fs = ctx.fs;

  // Check schema.prisma first
  const schemaPath = "prisma/schema.prisma";
  const schemaExists = await fs.pathExists(schemaPath);

  if (schemaExists) {
    try {
      const schemaText = (await fs.readFile(schemaPath, {
        encoding: "utf8",
      })) as string | undefined;
      if (typeof schemaText === "string" && schemaText.trim() !== "") {
        const provider = extractProviderFromSchema(schemaText);
        return {
          installed: true,
          provider,
          schemaPath,
        };
      }
    } catch {
      // Read failed — fall through to config check
    }
  }

  // Fall back to prisma7.config.ts
  const configPath = "prisma7.config.ts";
  const configExists = await fs.pathExists(configPath);

  if (configExists) {
    try {
      const configText = (await fs.readFile(configPath, {
        encoding: "utf8",
      })) as string | undefined;
      if (typeof configText === "string" && configText.trim() !== "") {
        const provider = extractProviderFromConfig(configText);
        return {
          installed: true,
          provider,
          schemaPath: configPath,
        };
      }
    } catch {
      // Read failed
    }
  }

  return {
    installed: false,
    provider: null,
    schemaPath: null,
  };
}

/**
 * Compares two provider keys for equality, normalizing both.
 * "postgres" and "postgresql" are considered equal.
 */
export function providersMatch(a: string, b: string): boolean {
  return normalizePrismaProvider(a) === normalizePrismaProvider(b);
}