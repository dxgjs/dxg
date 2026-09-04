import { detectProjectAwareness, type ProjectAwareness } from "@dxgjs/workspace";
import { Logger, type LogLevel } from "@dxgjs/logger";
import { join, dirname } from "path";
import {
  readFile,
  writeFile,
  pathExists,
  stat,
  readdir,
  mkdir,
  readJson,
  writeJson,
} from "@dxgjs/fs";
import { render as templatesRender } from "@dxgjs/templates";
import {
  createDependencyInstaller,
  detectPackageManagerAgent,
} from "@dxgjs/generators";

/**
 * Options shared by the root command and the `add` command.
 * The index signature keeps room for generator-specific flags.
 */
export interface CommanderOptions {
  verbose: boolean;
  quiet: boolean;
  dryRun: boolean;
  force: boolean;
  nonInteractive: boolean;
  [key: string]: unknown;
}

/**
 * Attempts to detect project awareness, returns a default awareness on failure but continues
 */
export async function detectProjectAwarenessSilently(targetDir: string): Promise<ProjectAwareness> {
  try {
    return await detectProjectAwareness(targetDir);
  } catch {
    // Return a minimal awareness object to allow continuation
    return {
      projectRoot: targetDir,
      workspaceRoot: targetDir,
      framework: { name: "unknown", detected: false },
      language: { name: "typescript", detected: false },
      packageManager: "unknown",
      styling: { name: "", detected: false, version: null, configFile: null },
      capabilities: { hasTests: false, hasLinting: false, hasFormatter: false, hasCI: false, hasDocker: false },
      packageJson: {
        name: "",
        version: undefined,
        private: true,
        workspaces: undefined,
        dependencies: undefined,
        devDependencies: undefined,
        peerDependencies: undefined,
        scripts: undefined,
      },
    };
  }
}

/**
 * Prepares the generator context with logger, fs, and templates
 */
export async function prepareContext(options: CommanderOptions, awareness: ProjectAwareness) {
  // Determine log level based on verbosity options
  let minLevel: LogLevel = "info";
  if (options.verbose) {
    minLevel = "debug";
  } else if (options.quiet) {
    minLevel = "warn";
  }

  const logger = new Logger({ minLevel });
  // Provide stat and readdir functions (not used by all generators but required by type)
  const fs = { readFile, writeFile, pathExists, stat, readdir, mkdir, readJson, writeJson };

  // Dependency-installer seam. Detection uses the same @antfu/ni detector
  // the install commands resolve through (fine-grained agent — yarn classic
  // vs berry — never awareness.packageManager, which is a coarse display
  // name). When no agent is detectable the seam stays absent: generators
  // fall back to their own error, and nothing here blocks scaffolding.
  let installer;
  if (!options.dryRun) {
    const agent = await detectPackageManagerAgent(awareness.projectRoot).catch(() => null);
    if (agent) {
      installer = createDependencyInstaller({ agent, fs });
    }
  }

  return {
    logger,
    fs,
    templates: { render: templatesRender },
    awareness,
    dryRun: options.dryRun ?? false,
    force: options.force ?? false,
    nonInteractive: options.nonInteractive ?? false,
    ...(installer ? { installer } : {}),
  };
}

/**
 * Runs a function in the target directory and returns to original directory
 */
export async function runInTargetDirectory<T>(
  targetDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalDir = process.cwd();
  try {
    process.chdir(targetDir);
    return await fn();
  } finally {
    process.chdir(originalDir);
  }
}

/**
 * Finds the nearest directory containing a package.json by walking upward from the start directory.
 * @param startDir - The directory to start searching from.
 * @returns The absolute path to the directory containing a package.json, or the startDir if none found.
 */
export async function findProjectRoot(startDir: string): Promise<string> {
  let current = startDir;
  while (true) {
    const packageJsonPath = join(current, "package.json");
    try {
      await stat(packageJsonPath);
      // If we get here, the file exists.
      return current;
    } catch {
      // File does not exist or we cannot access it, continue upward.
    }
    const parent = dirname(current);
    if (parent === current) {
      // We've reached the filesystem root.
      break;
    }
    current = parent;
  }
  // If we didn't find any package.json, return the startDir.
  return startDir;
}
