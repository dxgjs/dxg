import { readFile, readFileSync } from "./readFile";
  import { glob, globSync } from "./glob";
  import { writeFile, writeFileSync } from "./writeFile";
  import { readdir, readdirSync } from "./readdir";
  import { stat, statSync } from "./stat";
  import { sep, join, dirname, relative, resolve } from "./path";
  import { mkdir, mkdirSync } from "./mkdir";
  import { rm, rmSync } from "./rm";
  import { copyFile, copyFileSync } from "./copyFile";
  import { appendFile, appendFileSync } from "./appendFile";
  import { detect, getUserAgent } from "package-manager-detector";
  import { execa, type Options } from "execa";

  export { readFile, readFileSync };
  export { writeFile, writeFileSync };
  export { readdir, readdirSync };
  export { stat, statSync };
  export { sep, join, dirname, relative, resolve };
  export { mkdir, mkdirSync };
  export { rm, rmSync };
  export { copyFile, copyFileSync };
  export { appendFile, appendFileSync };
  export { glob, globSync };

  /**
   * Reads and parses a JSON file.
   * Strips a leading UTF-8 BOM before parsing: Node's utf8 decoder keeps
   * the BOM in the string and JSON.parse throws "Unexpected token" on it —
   * a Windows hazard (PowerShell 5.1 Out-File/Set-Content write BOMs) that
   * npm itself tolerates, so a BOM'd package.json must not crash DXG.
   * @param filePath - Absolute path to the JSON file.
   * @returns Promise resolving to the parsed JSON object.
   */
  export async function readJson<T = unknown>(filePath: string): Promise<T> {
    const content = await readFile(filePath, { encoding: "utf8" });
    // Ensure content is a string before parsing
    let contentString = typeof content === 'string' ? content : content.toString();
    if (contentString.charCodeAt(0) === 0xfeff) {
      contentString = contentString.slice(1);
    }
    return JSON.parse(contentString) as T;
  }

  /**
   * Writes a JSON file.
   * @param filePath - Absolute path to the JSON file.
   * @param data - Data to serialize and write.
   * @param options - Optional formatting options.
   * @param options.spaces - Number of spaces to indent (default: 2).
   * @returns Promise that resolves when the file is written.
   */
  export async function writeJson<T = unknown>(
    filePath: string,
    data: T,
    options: { spaces?: number } = {}
  ): Promise<void> {
    const json = JSON.stringify(data, null, options.spaces ?? 2);
    await writeFile(filePath, json, { encoding: "utf8" });
  }

  /**
   * Safely adds scripts to package.json, respecting dryRun and force flags.
   * @param packageJson - The current package.json object
   * @param projectRoot - Absolute path to the project root directory
   * @param dryRun - Whether to run in dry-run mode (no filesystem changes)
   * @param force - Whether to force overwrite conflicting scripts
   * @param fsUtils - File system utilities (readJson, writeJson, etc.)
   * @param scriptsToAdd - Record of script names to their commands
   * @returns Promise resolving to result object with added, skipped, conflicted scripts
   */
  export async function addPackageScripts(
    packageJson: Record<string, unknown> & { scripts?: Record<string, string> },
    projectRoot: string,
    dryRun: boolean,
    force: boolean,
    fsUtils: {
      readJson: (filePath: string) => Promise<unknown>;
      writeJson: (filePath: string, data: unknown, options?: { spaces?: number }) => Promise<void>;
    },
    scriptsToAdd: Record<string, string>
  ): Promise<{
    added: string[];
    skipped: string[];
    conflicted: { script: string; existingCommand: string }[];
  }> {
    const result: {
      added: string[];
      skipped: string[];
      conflicted: { script: string; existingCommand: string }[];
    } = {
      added: [],
      skipped: [],
      conflicted: [],
    };

    // Initialize scripts object if it doesn't exist
    const scripts = packageJson.scripts ?? {};

    // If package.json had no scripts section, attach the replacement object
    // back to the manifest. Only `packageJson` is handed to writeJson, so a
    // detached object would silently discard every added script (the mutation
    // above happens on `scripts`, but the write-back persists `packageJson`).
    // Skipped in dry-run, where writeJson is never called and the caller's
    // object stays untouched.
    if (!dryRun && !packageJson.scripts) {
      packageJson.scripts = scripts;
    }

    // Process each script to add
    for (const [scriptName, scriptCommand] of Object.entries(scriptsToAdd)) {
      if (scripts[scriptName]) {
        // Script already exists
        if (scripts[scriptName] === scriptCommand) {
          // Exact match - skip
          result.skipped.push(scriptName);
        } else {
          // Conflict - different command for same script name
          if (dryRun) {
            // In dry-run, report as conflict
            result.conflicted.push({ script: scriptName, existingCommand: scripts[scriptName] });
          } else if (force) {
            // Force overwrite
            scripts[scriptName] = scriptCommand;
            result.added.push(scriptName);
          } else {
            // No force - treat as conflict
            result.conflicted.push({ script: scriptName, existingCommand: scripts[scriptName] });
          }
        }
      } else {
        // Script doesn't exist - safe to add
        if (!dryRun) {
          scripts[scriptName] = scriptCommand;
        }
        result.added.push(scriptName);
      }
    }

    // Write back package.json if not in dry-run and we actually made changes
    if (!dryRun && result.added.length > 0) {
      const packageJsonPath = join(projectRoot, "package.json");
      await fsUtils.writeJson(packageJsonPath, packageJson);
    }

    return result;
  }

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
   * Default upper bound for a single spawned command, in milliseconds.
   * Without a bound, a wedged child (hostile network, deadlocked stdio
   * pipe) leaves `dxg` pending indefinitely with no diagnostic — the
   * audit observed 12+ minute hangs (protocol.md, 2026-10-10). 10 min
   * clears the slowest legitimate operation observed (a cold pnpm dlx
   * cache copy of ~216 MB takes ~3 min) with a 3x margin. Pass an
   * explicit `timeout` to narrow/widen it, or `timeout: 0` to opt out.
   */
  const DEFAULT_COMMAND_TIMEOUT_MS = 10 * 60_000;

  /**
   * Execute a command with the given arguments using execa.
   * Every spawned command gets a default timeout (see
   * DEFAULT_COMMAND_TIMEOUT_MS) and kills its whole process tree when
   * the bound is hit: execa's plain timeout only terminates the direct
   * child, which on Windows orphans the pnpm/prisma grandchildren —
   * they keep running (and writing project files) AFTER the failure
   * has been reported. `killDescendants` makes execa taskkill /T the
   * intact tree instead.
   * @param command - The command to execute (e.g., 'npm', 'pnpm', etc.)
   * @param args - Arguments to pass to the command
   * @param options - Optional execa options; `timeout` overrides the default bound
   * @returns Promise resolving to the execa result
   * @throws ExecaError if the command fails or times out
   */
  export async function executeCommand(
    command: string,
    args: string[] = [],
    options?: Options
  ): Promise<ReturnType<typeof execa>> {
    return execa(command, args, {
      ...options,
      timeout: options?.timeout ?? DEFAULT_COMMAND_TIMEOUT_MS,
      killDescendants: options?.killDescendants ?? true,
    });
  }

  /**
   * Detect the package manager being used in the project.
   * @param startDir - Optional starting directory (defaults to current working directory).
   * @param options - Optional configuration object.
   * @param options.withFallback - Whether to fall back to npm when detection fails or returns unknown. Defaults to false.
   * @param options.stopDir - Optional directory path to stop traversing upwards. Detection is bounded to this directory.
   * @returns Promise resolving to the detected package manager.
   */
  export async function detectPackageManager(
    startDir?: string,
    options: { withFallback?: boolean; stopDir?: string } = {},
  ): Promise<"npm" | "pnpm" | "yarn" | "bun"> {
    const { withFallback = false, stopDir } = options;
    const cwd = startDir ?? process.cwd();

    // 1. Attempt detection via project files (lockfiles, package.json)
    const result = await detect({ cwd, stopDir });

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