import { readFile, stat } from "@dxgjs/fs";
  import { glob } from "@dxgjs/fs";
  import { join, dirname } from "path";
  import { Logger } from "@dxgjs/logger";
  import type { PackageJson } from "./types";
  import {
    WorkspaceProject,
    WorkspaceResult,
  } from "./types";

  const logger = new Logger({ minLevel: "info" });

  /**
   * Detect workspace configuration.
   * @param root - Optional root directory to start searching from.
   * @returns Promise resolving to workspace information.
   */
  export async function detectWorkspace(root?: string): Promise<WorkspaceResult> {
    const start = root ?? process.cwd();
    let current = start;

    // Look for workspace definition files
    const workspaceFiles = [
      "pnpm-workspace.yaml",
      "turbo.json",
      "nx.json",
      "lerna.json",
    ];
    let workspaceRoot = null;

    while (true) {
      for (const file of workspaceFiles) {
        try {
          await stat(join(current, file));
          workspaceRoot = current;
          break;
        } catch {
          // File not found, continue
        }
      }
      if (workspaceRoot) break;

      const parent = dirname(current);
      if (parent === current) {
        // Reached the filesystem root
        break;
      }
      current = parent;
    }

    if (!workspaceRoot) {
      throw new Error(
        "No workspace root found. Looked for pnpm-workspace.yaml, turbo.json, nx.json, lerna.json",
      );
    }

    // Read the root package.json
    const rootPackageJsonPath = join(workspaceRoot, "package.json");
    let rootPackageJson: PackageJson;
    try {
      const rootPackageJsonContentBuffer = await readFile(rootPackageJsonPath, {
        encoding: "utf8",
      });
      const rootPackageJsonContent = typeof rootPackageJsonContentBuffer === 'string' ? rootPackageJsonContentBuffer : rootPackageJsonContentBuffer.toString();
      rootPackageJson = JSON.parse(rootPackageJsonContent);
      // Simple validation: check for required fields
      if (
        typeof rootPackageJson.name !== "string" ||
        typeof rootPackageJson.private !== "boolean"
      ) {
        logger.warn(
          `Root package.json at ${rootPackageJsonPath} is missing required fields: name (string) and private (boolean)`,
        );
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to read or parse root package.json at ${rootPackageJsonPath}: ${msg}`,
        { cause: error }
      );
    }

    // Determine workspace packages from the root package.json
    let workspacePackages: string[] = [];
    if (Array.isArray(rootPackageJson.workspaces)) {
      workspacePackages = rootPackageJson.workspaces;
    } else if (
      rootPackageJson.workspaces &&
      typeof rootPackageJson.workspaces === 'object' &&
      'packages' in rootPackageJson.workspaces &&
      Array.isArray((rootPackageJson.workspaces as { packages?: unknown }).packages)
    ) {
      workspacePackages = (rootPackageJson.workspaces as { packages?: string[] }).packages || [];
    }

    // Always include the root package (current directory)
    // If no workspaces defined in package.json, we still include the root as '.'
    // If workspaces are defined, we still include the root package
    workspacePackages.unshift(".");

    // Normalize workspace package patterns to absolute paths
    // Normalize workspace package patterns to absolute paths using glob resolution
    const projectPaths: string[] = [];
    for (const pattern of workspacePackages) {
      // Resolve glob pattern to get matching paths
      const matches = await glob(pattern, {
        cwd: workspaceRoot,
      });

      // Filter to only include directories that contain a package.json
      for (const match of matches) {
        try {
          const statResult = await stat(match);
          if (statResult.isDirectory()) {
            const packageJsonPath = join(match, "package.json");
            try {
              await stat(packageJsonPath);
              projectPaths.push(match);
            } catch {
              // Directory does not contain a package.json, skip it
            }
          }
        } catch {
          // Path does not exist, skip it
        }
      }
    }

    // Remove duplicates while preserving order
    const seen = new Set<string>();
    const tempPaths: string[] = [];
    for (const path of projectPaths) {
      if (!seen.has(path)) {
        seen.add(path);
        tempPaths.push(path);
      }
    }
    projectPaths.length = 0;
    projectPaths.push(...tempPaths);
    // Read each project's package.json
    const projects: WorkspaceProject[] = [];
    // Map project names to their index in projects array for quick lookup
    const projectNameToIndex = new Map<string, number>();

    for (const projectPath of projectPaths) {
      try {
        const packageJsonPath = join(projectPath, "package.json");
        const packageJsonContentBuffer = await readFile(packageJsonPath, {
          encoding: "utf8",
        });
        const packageJsonContent = typeof packageJsonContentBuffer === 'string' ? packageJsonContentBuffer : packageJsonContentBuffer.toString();
        const packageJson: PackageJson = JSON.parse(packageJsonContent);

        const project: WorkspaceProject = {
          name: packageJson.name,
          version: packageJson.version,
          location: projectPath,
          workspaceDependencies: [],
        };

        const projectIndex = projects.length;
        projects.push(project);
        projectNameToIndex.set(packageJson.name, projectIndex);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Failed to read package.json for project at ${projectPath}: ${msg}`,
        );
      }
    }

    // Calculate workspace dependencies by reading each project's dependencies
    // and linking to workspace projects by name
    for (let i = 0; i < projectPaths.length; i++) {
      const projectPath = projectPaths[i];
      try {
        const packageJsonPath = join(projectPath, "package.json");
        const packageJsonContentBuffer = await readFile(packageJsonPath, {
          encoding: "utf8",
        });
        const packageJsonContent = typeof packageJsonContentBuffer === 'string' ? packageJsonContentBuffer : packageJsonContentBuffer.toString();
        const packageJson: PackageJson = JSON.parse(packageJsonContent);

        // Get all dependencies (dependencies, devDependencies, peerDependencies
        const dependencies = {
          ...(packageJson.dependencies ?? {}),
          ...(packageJson.devDependencies ?? {}),
          ...(packageJson.peerDependencies ?? {}),
        };

        // Find which dependencies are workspace projects
        const workspaceDeps: string[] = [];
        for (const depName of Object.keys(dependencies)) {
          if (projectNameToIndex.has(depName)) {
            workspaceDeps.push(depName);
          }
        }

        // Update the project's workspaceDependencies
        if (i < projects.length) {
          projects[i].workspaceDependencies = workspaceDeps;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(
          `Failed to read package.json for dependency calculation at ${projectPath}: ${msg}`,
        );
      }
    }

    return { root: workspaceRoot, projects };
  }