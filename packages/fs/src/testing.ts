/**
 * In-memory filesystem for testing.
 * Provides a simple Map-based filesystem that mimics the @dxgjs/fs API.
 */

export interface MemoryFS {
  readFile: (filePath: string, encoding?: string) => Promise<string>;
  writeFile: (filePath: string, content: string, encoding?: string) => Promise<void>;
  pathExists: (filePath: string) => Promise<boolean>;
  mkdir: (dirPath: string, options?: { recursive?: boolean }) => Promise<void>;
  rm: (filePath: string, options?: { recursive?: boolean }) => Promise<void>;
  glob: (pattern: string, options?: { cwd?: string }) => Promise<string[]>;
  readdir: (dirPath: string) => Promise<string[]>;
}

/**
 * Creates an in-memory filesystem for testing.
 * @param files - Initial file contents as a map of path -> content
 * @returns MemoryFS object with filesystem methods
 */
export function createMemoryFS(files: Record<string, string> = {}): MemoryFS {
  const fs = new Map<string, string>();

  // Initialize with provided files
  for (const [path, content] of Object.entries(files)) {
    fs.set(normalizePath(path), content);
  }

  function normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/+/g, "/");
  }

  function dirname(path: string): string {
    const normalized = normalizePath(path);
    const parts = normalized.split("/");
    parts.pop();
    return parts.join("/") || "/";
  }

  async function ensureDir(dirPath: string): Promise<void> {
    const normalized = normalizePath(dirPath);
    const parts = normalized.split("/").filter(Boolean);
    let current = "";
    for (const part of parts) {
      current += (current ? "/" : "") + part;
      if (!fs.has(current)) {
        fs.set(current, ""); // Directory marker
      }
    }
  }

  return {
    async readFile(filePath: string, _encoding = "utf-8"): Promise<string> {
      const normalized = normalizePath(filePath);
      const content = fs.get(normalized);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
      }
      if (typeof content !== "string") {
        throw new Error(`EISDIR: illegal operation on a directory, read '${filePath}'`);
      }
      return content; // Always return string, encoding ignored for memory fs
    },

    async writeFile(filePath: string, content: string, _encoding = "utf-8"): Promise<void> {
      const normalized = normalizePath(filePath);
      await ensureDir(dirname(normalized));
      fs.set(normalized, content);
    },

    async pathExists(filePath: string): Promise<boolean> {
      const normalized = normalizePath(filePath);
      return fs.has(normalized);
    },

    async mkdir(dirPath: string, options: { recursive?: boolean } = {}): Promise<void> {
      const normalized = normalizePath(dirPath);
      if (options.recursive) {
        await ensureDir(normalized);
      } else {
        const parent = dirname(normalized);
        if (!(await this.pathExists(parent))) {
          throw new Error(`ENOENT: no such file or directory, mkdir '${dirPath}'`);
        }
        fs.set(normalized, "");
      }
    },

    async rm(filePath: string, options: { recursive?: boolean } = {}): Promise<void> {
      const normalized = normalizePath(filePath);
      if (!fs.has(normalized)) {
        throw new Error(`ENOENT: no such file or directory, unlink '${filePath}'`);
      }
      if (options.recursive) {
        // Remove all files under this directory
        const prefix = normalized.endsWith("/") ? normalized : normalized + "/";
        for (const key of fs.keys()) {
          if (key === normalized || key.startsWith(prefix)) {
            fs.delete(key);
          }
        }
      } else {
        fs.delete(normalized);
      }
    },

    async glob(pattern: string, options: { cwd?: string } = {}): Promise<string[]> {
      const cwd = options.cwd ? normalizePath(options.cwd) : "/";
      // Simple glob implementation - just filter by pattern
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\./g, "\\.")
        .replace(/\*/g, ".*")
        .replace(/\?/g, ".");
      const regex = new RegExp(`^${regexPattern}$`);
      const results: string[] = [];
      for (const key of fs.keys()) {
        if (key.startsWith(cwd) && regex.test(key.slice(cwd.length + 1))) {
          results.push(key);
        }
      }
      return results;
    },

    async readdir(dirPath: string): Promise<string[]> {
      const normalized = normalizePath(dirPath);
      if (!fs.has(normalized)) {
        throw new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`);
      }
      const prefix = normalized === "/" ? "" : normalized + "/";
      const results: string[] = [];
      for (const key of fs.keys()) {
        if (key.startsWith(prefix)) {
          const relative = key.slice(prefix.length);
          if (relative && !relative.includes("/")) {
            results.push(relative);
          }
        }
      }
      return results;
    },
  };
}