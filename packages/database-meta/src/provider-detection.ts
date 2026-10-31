export type { PrismaState } from "./types";

/**
 * Normalizes a Prisma datasource provider string to the canonical DXG provider key.
 * Handles "postgres" -> "postgresql" and other aliases.
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
 * Compares two provider keys for equality, normalizing both.
 * "postgres" and "postgresql" are considered equal.
 */
export function providersMatch(a: string, b: string): boolean {
  return normalizePrismaProvider(a) === normalizePrismaProvider(b);
}

// Note: detectPrismaState() is intentionally NOT exported from database-meta
// because it requires @dxgjs/fs for disk I/O and is generator-specific.
// Generators should import it from @dxgjs/generators instead.