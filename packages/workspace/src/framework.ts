import { stat, glob } from "@dxgjs/fs";
  import { join } from "path";
  import { FrameworkInfo } from "./types";
  import type { PackageJson } from "./types";

  /**
   * Detect the framework based on configuration files and package.json dependencies.
   * @param projectRoot - Absolute path to the project directory.
   * @param packageJson - The parsed package.json object (to avoid reading it again).
   * @returns FrameworkInfo
   */
  export async function detectFramework(projectRoot: string, packageJson: PackageJson): Promise<FrameworkInfo> {
    // Check for Next.js
    const nextConfigMatches = await glob("next.config.*", { cwd: projectRoot });
    for (const configPath of nextConfigMatches) {
      try {
        await stat(configPath);
        // Found a Next.js config, now check for app or pages directory
        const appDirPath = join(projectRoot, "app");
        const srcAppDirPath = join(projectRoot, "src", "app");
        const pagesDirPath = join(projectRoot, "pages");
        const srcPagesDirPath = join(projectRoot, "src", "pages");

        let nextAppRouter = false;
        let nextPagesRouter = false;

        try {
          await stat(appDirPath);
          nextAppRouter = true;
        } catch {
          // Ignore
        }
        try {
          await stat(srcAppDirPath);
          nextAppRouter = true;
        } catch {
          // Ignore
        }
        try {
          await stat(pagesDirPath);
          nextPagesRouter = true;
        } catch {
          // Ignore
        }
        try {
          await stat(srcPagesDirPath);
          nextPagesRouter = true;
        } catch {
          // Ignore
        }

        if (nextAppRouter) {
          return { name: "next-app" };
        } else if (nextPagesRouter) {
          return { name: "next-pages" };
        } else {
          // Default to next-pages if we have a Next.js config but no app/pages?
          // We'll assume next-pages for safety.
          return { name: "next-pages" };
        }
      } catch {
        // Config not found, continue
      }
    }

    // Check for Vite
    const viteConfigMatches = await glob("vite.config.*", { cwd: projectRoot });
    for (const configPath of viteConfigMatches) {
      try {
        await stat(configPath);
        return { name: "vite" };
      } catch {
        // Config not found, continue
      }
    }

    // Check for Astro
    const astroConfigMatches = await glob("astro.config.*", { cwd: projectRoot });
    for (const configPath of astroConfigMatches) {
      try {
        await stat(configPath);
        return { name: "astro" };
      } catch {
        // Config not found, continue
      }
    }

    // Check for React Router via dependencies
    const dependencies = {
      ...(packageJson.dependencies ?? {}),
      ...(packageJson.devDependencies ?? {}),
      ...(packageJson.peerDependencies ?? {}),
    };
    if (dependencies["react-router"] || dependencies["react-router-dom"]) {
      return { name: "react-router" };
    }

    // If none of the above, return unknown
    return { name: "unknown" };
  }