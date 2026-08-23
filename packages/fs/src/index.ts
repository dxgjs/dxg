import { readFile, readFileSync } from "./readFile";
import { writeFile, writeFileSync } from "./writeFile";
import { readdir, readdirSync } from "./readdir";
import { stat, statSync } from "./stat";
import { sep, join, dirname, relative, resolve } from "./path";
import { mkdir, mkdirSync } from "./mkdir";
import { rm, rmSync } from "./rm";
import { copyFile, copyFileSync } from "./copyFile";
import { appendFile, appendFileSync } from "./appendFile";
import { detect, getUserAgent } from "package-manager-detector";

export { readFile, readFileSync };
export { writeFile, writeFileSync };
export { readdir, readdirSync };
export { stat, statSync };
export { sep, join, dirname, relative, resolve };
export { mkdir, mkdirSync };
export { rm, rmSync };
export { copyFile, copyFileSync };
export { appendFile, appendFileSync };

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export function pathExistsSync(filePath: string): boolean {
  try {
    statSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the package manager being used in the project.
 * @param startDir - Optional starting directory (defaults to current working directory).
 * @param options - Optional configuration object.
 * @param options.withFallback - Whether to fall back to npm when detection fails or returns unknown. Defaults to false.
 * @returns Promise resolving to the detected package manager.
 */
export async function detectPackageManager(
  startDir?: string,
  options: { withFallback?: boolean } = {},
): Promise<"npm" | "pnpm" | "yarn" | "bun"> {
  const { withFallback = false } = options;
  const cwd = startDir ?? process.cwd();

  // 1. Attempt detection via project files (lockfiles, package.json)
  const result = await detect({ cwd });

  // Define allowed package managers matching the return type signature
  const supportedManagers = ["npm", "pnpm", "yarn", "bun"] as const;
  type SupportedPM = (typeof supportedManagers)[number];

  // If a valid and supported package manager is found via files
  if (
    result?.name &&
    (supportedManagers as readonly string[]).includes(result.name)
  ) {
    return result.name as SupportedPM;
  }

  // 2. Handle failure or unknown package managers when fallback is enabled
  if (withFallback) {
    // Attempt detection via current terminal execution environment (User Agent)
    const ua = getUserAgent();
    if (ua && (supportedManagers as readonly string[]).includes(ua)) {
      return ua as SupportedPM;
    }
    // Ultimate fallback value if user agent is missing or unsupported
    return "npm";
  }

  // 3. Throw explicit errors if detection failed and fallback is disabled
  if (!result) {
    throw new Error(
      "Package manager detection failed and fallback is disabled",
    );
  } else {
    throw new Error(
      `Unknown package manager: ${result.name} and fallback is disabled`,
    );
  }
}
