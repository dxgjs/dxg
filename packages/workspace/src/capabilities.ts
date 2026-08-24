import { stat } from "@dxgjs/fs";
  import { join } from "path";
  import { Logger } from "@dxgjs/logger";
  import type { PackageJson } from "./types";
  import { CapabilityInfo } from "./types";

  const logger = new Logger({ minLevel: "info" });

  /**
   * Detect capabilities (Prisma and authentication).
   * @param projectRoot - Absolute path to the project directory.
   * @param packageJson - The parsed package.json object (to avoid reading it again).
   * @returns CapabilityInfo
   */
  export async function detectCapabilities(projectRoot: string, packageJson: PackageJson): Promise<CapabilityInfo> {
    let prisma = false;
    let authentication = false;

    try {
      const dependencies = {
        ...(packageJson.dependencies ?? {}),
        ...(packageJson.devDependencies ?? {}),
        ...(packageJson.peerDependencies ?? {}),
      };

      // Check for Prisma
      if (dependencies["prisma"]) {
        prisma = true;
      } else {
        // Also check for prisma schema file
        try {
          await stat(join(projectRoot, "prisma", "schema.prisma"));
          prisma = true;
        } catch {
          // Ignore
        }
      }

      // Check for authentication packages
      const authPackages = [
        "better-auth",
        "auth.js",
        "@auth/core",
        "lucia",
        "@clerk/clerk-react",
        "@clerk/clerk-sdk",
        "@clerk/nextjs",
      ];
      for (const authPackage of authPackages) {
        if (dependencies[authPackage]) {
          authentication = true;
          break;
        }
      }
    } catch (error) {
      // Failed to read package.json, leave as false
      logger.warn(
        `Failed to read package.json for capability detection at ${projectRoot}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      prisma,
      authentication,
    };
  }