import { stat, glob } from "@dxgjs/fs";
  import { StylingInfo } from "./types";
  import type { PackageJson } from "./types";

  /**
   * Detect Tailwind styling.
   * @param projectRoot - Absolute path to the project directory.
   * @param packageJson - The parsed package.json object (to avoid reading it again).
   * @returns StylingInfo
   */
  export async function detectStyling(
    projectRoot: string,
    packageJson: PackageJson,
  ): Promise<StylingInfo> {
    const tailwindConfigMatches = await glob("tailwind.config.*", { cwd: projectRoot });
    let configFile: string | null = null;
    for (const configPath of tailwindConfigMatches) {
      try {
        await stat(configPath);
        configFile = configPath;
        break;
      } catch {
        // Config not found, continue
      }
    }

    let detected = false;
    let version: "v3" | "v4" | null = null;

    if (configFile !== null) {
      detected = true;
      // Try to get version from package.json
      try {
        const dependencies = {
          ...(packageJson.dependencies ?? {}),
          ...(packageJson.devDependencies ?? {}),
        };
        const tailwindVersion =
          dependencies["tailwindcss"] || dependencies["@tailwindcss"];
        if (tailwindVersion) {
          // Extract major version
          const match = tailwindVersion.match(/^(\d+)\./);
          if (match) {
            const major = parseInt(match[1], 10);
            if (major === 4) {
              version = "v4";
            } else if (major === 3) {
              version = "v3";
            }
          }
        }
      } catch {
        // Failed to read package.json, leave version as null
      }
    }

    return {
      detected,
      version,
      configFile,
    };
  }