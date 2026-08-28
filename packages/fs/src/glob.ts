import fg from "fast-glob";
import type { Options } from "fast-glob";

/**
 * Resolve glob pattern(s) to an array of absolute file paths.
 * @param pattern - A glob pattern or array of glob patterns.
 * @param options - Options to pass to fast-glob.
 * @returns Promise resolving to an array of absolute paths.
 */
export async function glob(
  pattern: string | string[],
  options: Options = {}
): Promise<string[]> {
  const { cwd = process.cwd(), dot = false, ...opts } = options;
  // Use fast-glob with absolute: true to get absolute paths
  const paths = await fg(pattern, {
    cwd,
    dot,
    onlyFiles: false, // we want directories too
    absolute: true,
    ...opts,
  });
  return paths;
}

/**
 * Synchronously resolve glob pattern(s) to an array of absolute file paths.
 * @param pattern - A glob pattern or array of glob patterns.
 * @param options - Options to pass to fast-glob.
 * @returns Array of absolute paths.
 */
export function globSync(
  pattern: string | string[],
  options: Options = {}
): string[] {
  const { cwd = process.cwd(), dot = false, ...opts } = options;
  // Use fast-glob with absolute: true to get absolute paths
  const paths = fg.sync(pattern, {
    cwd,
    dot,
    onlyFiles: false,
    absolute: true,
    ...opts,
  });
  return paths;
}
