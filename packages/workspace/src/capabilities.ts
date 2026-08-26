import { stat } from "@dxgjs/fs";
  import { join } from "path";
  import { Logger } from "@dxgjs/logger";
  import type { PackageJson } from "./types";
  import { CapabilityInfo } from "./types";

  const logger = new Logger({ minLevel: "info" });

  /**
   * Detect capabilities (tests, linting, formatting, CI, Docker).
   * @param projectRoot - Absolute path to the project directory.
   * @param packageJson - The parsed package.json object (to avoid reading it again).
   * @returns CapabilityInfo
   */
  export async function detectCapabilities(projectRoot: string, packageJson: PackageJson): Promise<CapabilityInfo> {
    let hasTests = false;
    let hasLinting = false;
    let hasFormatter = false;
    let hasCI = false;
    let hasDocker = false;

    try {
      const scripts = packageJson.scripts ?? {};

      // Check for test capabilities (based on script presence only)
      if (scripts.test) {
        hasTests = true;
      }

      // Check for linting capabilities (based on script presence only)
      if (scripts.lint) {
        hasLinting = true;
      }

      // Check for formatting capabilities (based on script presence only)
      if (scripts.format) {
        hasFormatter = true;
      }

      // Check for CI capabilities
      if (scripts.ci) {
        hasCI = true;
      } else {
        // Check for common CI configuration files
        const ciFileList = [".gitlab-ci.yml", ".travis.yml", "azure-pipelines.yml"];
        for (const file of ciFileList) {
          try {
            await stat(join(projectRoot, file));
            hasCI = true;
            break;
          } catch {
            // Ignore and continue
          }
        }
        // Also check for GitHub actions directory
        try {
          await stat(join(projectRoot, ".github/workflows"));
          hasCI = true;
        } catch {
          // Ignore
        }
        // Check for circleci directory
        try {
          await stat(join(projectRoot, "circleci"));
          hasCI = true;
        } catch {
          // Ignore
        }
      }

      // Check for Docker capabilities
      try {
        await stat(join(projectRoot, "Dockerfile"));
        hasDocker = true;
      } catch {
        // Ignore, check for docker-compose
      }
      if (!hasDocker) {
        try {
          await stat(join(projectRoot, "docker-compose.yml"));
          hasDocker = true;
        } catch {
          // Ignore
        }
        try {
          await stat(join(projectRoot, "docker-compose.yaml"));
          hasDocker = true;
        } catch {
          // Ignore
        }
      }
    } catch (error) {
      // Failed to read package.json, leave as false
      logger.warn(
        `Failed to read package.json for capability detection at ${projectRoot}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      hasTests,
      hasLinting,
      hasFormatter,
      hasCI,
      hasDocker,
    };
  }