/**
 * Path utilities for dxg doctor.
 * Provides cross-platform path handling for CLI output.
 */

import { isAbsolute, relative, win32 } from "path";

/**
 * Whether a path looks like a Windows path (drive letter or UNC prefix).
 * Used to resolve Windows paths with the win32 implementation even when
 * running on a POSIX host, where `path.relative` would not understand them.
 */
function isWindowsPath(p: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\");
}

/**
 * Convert an absolute path to a relative path for CLI display.
 * Uses path.relative for cross-platform compatibility (the win32 flavour is
 * picked automatically for Windows-style inputs, whatever the host OS).
 * Falls back to the original path if relative resolution fails.
 * Normalizes separators to forward slashes for consistent display.
 *
 * @param absolutePath - The absolute path to convert
 * @param cwd - The current working directory (base for relative path)
 * @returns Relative path from cwd with forward slashes, or original path if conversion fails
 */
export function toRelativePath(absolutePath: string, cwd: string): string {
  try {
    const useWin32 = isWindowsPath(absolutePath) || isWindowsPath(cwd);
    const rel = useWin32
      ? win32.relative(cwd, absolutePath)
      : relative(cwd, absolutePath);
    // If relative path is empty (same directory), return "."
    if (rel === "") return ".";
    // If relative path starts with "..", it's outside cwd - return original.
    // An absolute result means a different root (e.g. another drive) - same.
    if (rel.startsWith("..")) return absolutePath;
    if (useWin32 ? win32.isAbsolute(rel) : isAbsolute(rel)) return absolutePath;
    return normalizeSeparators(rel);
  } catch {
    return absolutePath;
  }
}

/**
 * Normalize path separators to forward slashes for consistent display.
 * Useful for cross-platform output consistency. Backslashes are converted
 * on every platform so Windows-style paths display the same everywhere.
 *
 * @param path - Path to normalize
 * @returns Path with forward slashes
 */
export function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, "/");
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
