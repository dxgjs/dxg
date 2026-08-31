import { stat } from "@dxgjs/fs";
  import { detectPackageManager as detectPackageManagerFs } from "@dxgjs/fs";
  import {
    getPackageInfo,
  } from "./package-info";
  import {
    detectWorkspace,
  } from "./workspace";
  import {
    detectLanguage,
  } from "./language";
  import {
    detectFramework,
  } from "./framework";
  import {
    detectStyling,
  } from "./styling";
  import {
    detectCapabilities,
  } from "./capabilities";
  import type { ProjectAwareness } from "./types";

  /**
   * Detect project awareness for a given project path.
   * @param projectPath - Absolute path to the project directory.
   * @returns Promise resolving to project awareness information.
   */
  export async function detectProjectAwareness(projectPath: string): Promise<ProjectAwareness> {
    // Normalize the project path
    const projectRoot = await stat(projectPath).then(() => projectPath).catch(() => {
      throw new Error(`Project path does not exist: ${projectPath}`);
    });

    // Detect workspace root
    let workspaceRoot: string;
    try {
      const workspaceResult = await detectWorkspace(projectRoot);
      workspaceRoot = workspaceResult.root;
    } catch {
      // If no workspace found, treat the project root as the workspace root
      workspaceRoot = projectRoot;
    }

    // Read package.json once
    const packageJson = await getPackageInfo(projectRoot);

    // Detect package manager (using the fs package's function, but preserving old behavior)
    let packageManager: string;
    try {
      const pm = await detectPackageManagerFs(projectRoot);
      // Map bun to unknown to preserve old behavior (old did not support bun)
      if (pm === "bun") {
        packageManager = "unknown";
      } else {
        packageManager = pm;
      }
    } catch {
      // If detection fails (e.g., no lockfile and no fallback), return unknown to match old behavior
      packageManager = "unknown";
    }

    // Detect language
    const language = await detectLanguage(projectRoot);

    // Detect framework
    const framework = await detectFramework(projectRoot, packageJson);

    // Detect styling (Tailwind)
    const styling = await detectStyling(projectRoot, packageJson);

    // Detect capabilities
    const capabilities = await detectCapabilities(projectRoot, packageJson);

    return {
      projectRoot,
      workspaceRoot,
      framework,
      language,
      packageManager,
      styling,
      capabilities,
      packageJson,
    };
  }

  // Re-export detectWorkspace to maintain the existing API
  export { detectWorkspace } from "./workspace";

  // Re-export types to maintain the existing API
  export type {
    WorkspaceProject,
    WorkspaceResult,
    FrameworkInfo,
    LanguageInfo,
    StylingInfo,
    CapabilityInfo,
    ProjectAwareness,
  } from "./types";