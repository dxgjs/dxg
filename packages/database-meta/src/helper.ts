import { DEFAULT_HELPER_PATH } from "./paths";

/** Paths DXG must never let the helper collide with (user/Prisma-owned). */
const PROTECTED_PATHS = new Set([
  "prisma/schema.prisma",
  "prisma7.config.ts",
  "prisma/seed.ts",
  ".env",
]);

/**
 * Validates whether a file's content matches a recognized Prisma client
 * helper pattern. This prevents treating arbitrary prisma.ts files as
 * valid helpers (requirement: inspect content, not just filename).
 */
export function isValidPrismaClientHelper(content: string): boolean {
  if (!content || typeof content !== "string") return false;

  // Must import PrismaClient from generated client
  const hasPrismaClientImport = /import\s+\{\s*PrismaClient\s*\}\s+from\s+["'][^"']*["']/.test(content);

  // Must import an adapter from a known provider adapter package
  const hasAdapterImport = /import\s+\{\s*\w+\s*\}\s+from\s+["']@prisma\/adapter-[^"']*["']/.test(content);

  // Must create adapter instance (new AdapterClass(...))
  const hasAdapterInstantiation = /const\s+\w+\s*=\s*new\s+\w+\s*\(/.test(content);

  // Must create PrismaClient with adapter - accepts both { adapter: adapter } and { adapter } shorthand
  const hasPrismaClientWithAdapter = /const\s+prisma\s*=\s*new\s+PrismaClient\s*\(\s*\{\s*adapter\s*(?::\s*\w+)?\s*\}\s*\)/.test(content);

  // Must export prisma
  const hasPrismaExport = /export\s+\{\s*prisma\s*\}/.test(content);

  return (
    hasPrismaClientImport &&
    hasAdapterImport &&
    hasAdapterInstantiation &&
    hasPrismaClientWithAdapter &&
    hasPrismaExport
  );
}

/**
 * Normalizes a user-entered helper path: backslashes to forward slashes,
 * leading ./ stripped, trailing / stripped, .ts appended when omitted,
 * empty -> default.
 */
export function normalizeHelperPath(input: string | undefined): string {
  let p = (input ?? "").trim();
  if (p === "") return DEFAULT_HELPER_PATH;
  p = p.replace(/\\/g, "/");
  while (p.startsWith("./")) p = p.slice(2);
  while (p.endsWith("/")) p = p.slice(0, -1);
  if (!p.endsWith(".ts")) p = `${p}.ts`;
  return p;
}

/**
 * Validates a normalized helper path. Returns an error message for every
 * rejection case, or undefined when the path is acceptable.
 */
export function validateHelperPath(normalized: string): string | undefined {
  if (
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    /^\\\\/.test(normalized)
  ) {
    return "Helper path must be relative to the project root";
  }
  if (normalized.split("/").includes("..")) {
    return "Helper path must stay inside the project root";
  }
  if (PROTECTED_PATHS.has(normalized)) {
    return `Helper path collides with ${normalized} (Prisma/DXG-owned file)`;
  }
  if (normalized === "package.json") {
    return "Helper path cannot be package.json";
  }
  return undefined;
}