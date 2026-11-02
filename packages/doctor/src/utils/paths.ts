/**
 * Path utilities for dxg doctor.
 * Provides cross-platform path handling for CLI output.
 */

import { relative, sep } from "path";

/**
 * Convert an absolute path to a relative path for CLI display.
 * Uses path.relative for cross-platform compatibility.
 * Falls back to the original path if relative resolution fails.
 * Normalizes separators to forward slashes for consistent display.
 *
 * @param absolutePath - The absolute path to convert
 * @param cwd - The current working directory (base for relative path)
 * @returns Relative path from cwd with forward slashes, or original path if conversion fails
 */
export function toRelativePath(absolutePath: string, cwd: string): string {
  try {
    const rel = relative(cwd, absolutePath);
    // If relative path is empty (same directory), return "."
    // If relative path starts with "..", it's outside cwd - return original
    if (rel === "") return ".";
    if (rel.startsWith("..")) return absolutePath;
    return normalizeSeparators(rel);
  } catch {
    return absolutePath;
  }
}

/**
 * Normalize path separators to forward slashes for consistent display.
 * Useful for cross-platform output consistency.
 *
 * @param path - Path to normalize
 * @returns Path with forward slashes
 */
export function normalizeSeparators(path: string): string {
  return path.replace(new RegExp(`\\${sep}`, "g"), "/");
}

/**
 * Convert an absolute path to a relative path with normalized separators.
 * Combines toRelativePath and normalizeSeparators for CLI display.
 *
 * @param absolutePath - The absolute path to convert
 * @param cwd - The current working directory
 * @returns Relative path with forward slashes
 */
export function toDisplayPath(absolutePath: string, cwd: string): string {
  return normalizeSeparators(toRelativePath(absolutePath, cwd));
}