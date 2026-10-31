/**
 * Normalizes content for comparison: CRLF -> LF, trim trailing spaces per line.
 * Used for idempotence checks (e.g., lib/prisma.ts template vs existing file).
 */
export function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n") // CRLF -> LF
    .split("\n")
    .map((line) => line.trimEnd()) // trim trailing spaces
    .join("\n");
}

/**
 * Sanitizes a value for safe embedding in a .env file.
 * Prevents environment variable injection by removing newlines, carriage returns,
 * and escaping shell metacharacters that could be interpreted by shell consumers.
 * Backslashes are escaped first to avoid double-escaping.
 */
export function sanitizeEnvValue(value: string): string {
  return value
    .replace(/[\r\n]/g, "") // Remove newlines and carriage returns
    .replace(/\\/g, "\\\\") // Escape backslashes FIRST
    .replace(/\$/g, "\\$") // Escape $ to prevent variable expansion
    .replace(/`/g, "\\`") // Escape backticks to prevent command substitution
    .replace(/"/g, '\\"'); // Escape double quotes to prevent quote breaking
}

/** Validation function — kept for interface compliance. */
export function validateDatabase(): boolean {
  // Validation will happen in the run method; we keep this for interface compliance
  // but actual validation is done in run via checkPreconditions
  return true;
}