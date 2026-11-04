/**
 * JSON/JS/TS config file manipulation using Magicast.
 * Preserves formatting, comments, trailing commas, and key order.
 */

import { loadFile, writeFile, type ProxifiedModule, parseModule } from "magicast";
import { resolve, relative, sep } from "path";
import { realpathSync } from "fs";
import JSON5 from "json5";
import {
  readFile as defaultReadFile,
  writeFile as defaultWriteFile,
  pathExists as defaultPathExists,
} from "@dxgjs/fs";

/** Minimal filesystem interface for testing */
export interface JsonFs {
  readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Uint8Array>;
  writeFile(filePath: string, content: string, encoding?: BufferEncoding): Promise<void>;
  pathExists(filePath: string): Promise<boolean>;
}

/** Default filesystem implementation using @dxgjs/fs */
const defaultFs: JsonFs = {
  readFile: async (filePath: string, encoding = "utf-8") => {
    const result = await defaultReadFile(filePath, { encoding });
    return typeof result === "string" ? result : new TextDecoder().decode(result);
  },
  writeFile: async (filePath: string, content: string, encoding = "utf-8") => {
    await defaultWriteFile(filePath, content, { encoding });
  },
  pathExists: defaultPathExists,
};

/** Check if a value is a filesystem object (has required methods) */
function isJsonFs(value: unknown): value is JsonFs {
  return (
    typeof value === "object" &&
    value !== null &&
    "readFile" in value &&
    "writeFile" in value &&
    "pathExists" in value &&
    typeof (value as JsonFs).readFile === "function" &&
    typeof (value as JsonFs).writeFile === "function" &&
    typeof (value as JsonFs).pathExists === "function"
  );
}

/** Extract filesystem and cwd from variadic arguments.
 * When first arg is JsonFs (test API), there is NO cwd parameter.
 * When first arg is string (production API), second arg may be cwd.
 */
function parseFsArgs(args: unknown[]): { fs: JsonFs; cwd?: string; isTestApi: boolean } {
  if (args.length > 0 && isJsonFs(args[0])) {
    // Test API: (fs, ...params) - no cwd
    return { fs: args[0] as JsonFs, cwd: undefined, isTestApi: true };
  }
  // Production API: (param1, cwd?) - first arg might be filePath, name, scripts, or entry
  return { fs: defaultFs, cwd: args[1] as string | undefined, isTestApi: false };
}

/** Get the file path from arguments */
function getFilePath(filePathOrFs: string | JsonFs, cwdOrPath?: string, maybeCwd?: string): string {
  if (typeof filePathOrFs === "string") {
    return filePathOrFs;
  }
  if (typeof cwdOrPath === "string") {
    return cwdOrPath;
  }
  if (typeof maybeCwd === "string") {
    return maybeCwd;
  }
  return "package.json"; // default
}

/** Resolve path for the given filesystem with path traversal protection */
function resolvePath(fs: JsonFs, filePath: string, cwd?: string): string {
  if (fs === defaultFs) {
    const baseDir = cwd ?? process.cwd();
    const resolvedBase = realpathSync(baseDir);
    const requestedPath = resolve(baseDir, filePath);
    const resolvedRequested = realpathSync(requestedPath);

    // Verify the resolved path stays within the base directory
    const relativePath = relative(resolvedBase, resolvedRequested);
    if (relativePath.startsWith("..") || relativePath.startsWith(sep) || relativePath === "") {
      throw new Error(`Path traversal attempt blocked: ${filePath}`);
    }

    return resolvedRequested;
  }
  // For in-memory fs, use path directly (fs is the root)
  return filePath;
}

/** Check if file is a JSON file (by extension) */
function isJsonFile(filePath: string): boolean {
  return filePath.endsWith(".json");
}

/** Symbol for internal JSON content */
const JSON_CONTENT = Symbol("json-content");
const FILE_PATH = Symbol("file-path");

/**
 * Create a Magicast-compatible proxy for JSON objects.
 * Magicast wraps JSON content in an `exports` property (like ES modules).
 * Uses JSON5 for parsing (supports comments, trailing commas).
 */
function createJsonProxy(obj: any, filePath: string): any {
  // Magicast structure: { exports: <json-content> }
  const exportsObj = obj;

  const handler: ProxyHandler<any> = {
    get(_target: any, prop: string | symbol): any {
      if (prop === JSON_CONTENT) return exportsObj;
      if (prop === FILE_PATH) return filePath;
      if (prop === "exports") {
        // Return a proxy for the exports object
        return createExportsProxy(exportsObj, filePath);
      }
      // For other properties, delegate to exports (Magicast behavior)
      const value = exportsObj[prop];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return createJsonProxy(value, filePath);
      }
      if (Array.isArray(value)) {
        return value.map((v) => (v && typeof v === "object" ? createJsonProxy(v, filePath) : v));
      }
      return value;
    },
    set(_target: any, prop: string | symbol, value: any): boolean {
      if (prop === JSON_CONTENT || prop === FILE_PATH) return false;
      if (prop === "exports") {
        // Replacing entire exports
        Object.assign(exportsObj, value);
        return true;
      }
      exportsObj[prop] = value;
      return true;
    },
    deleteProperty(_target: any, prop: string | symbol): boolean {
      if (prop === JSON_CONTENT || prop === FILE_PATH) return false;
      return delete exportsObj[prop];
    },
    ownKeys(_target: any): ArrayLike<string | symbol> {
      return [...Reflect.ownKeys(exportsObj), "exports"];
    },
    getOwnPropertyDescriptor(_target: any, prop: string | symbol): PropertyDescriptor | undefined {
      if (prop === JSON_CONTENT || prop === FILE_PATH) return undefined;
      if (prop === "exports") {
        return { value: createExportsProxy(exportsObj, filePath), writable: true, enumerable: true, configurable: true };
      }
      const desc = Reflect.getOwnPropertyDescriptor(exportsObj, prop);
      if (desc && desc.value && typeof desc.value === "object") {
        return { ...desc, value: createJsonProxy(desc.value, filePath) };
      }
      return desc;
    },
  };

  // Store reference to exports for serialization via symbols (non-enumerable)
  const proxy = new Proxy({ [JSON_CONTENT]: exportsObj, [FILE_PATH]: filePath }, handler);
  return proxy;
}

/** Create proxy for the exports object (the actual JSON content) */
function createExportsProxy(exportsObj: any, filePath: string): any {
  const handler: ProxyHandler<any> = {
    get(_target: any, prop: string | symbol): any {
      if (prop === JSON_CONTENT) return exportsObj;
      if (prop === FILE_PATH) return filePath;
      const value = exportsObj[prop];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return createExportsProxy(value, filePath);
      }
      if (Array.isArray(value)) {
        return value.map((v) => (v && typeof v === "object" ? createExportsProxy(v, filePath) : v));
      }
      return value;
    },
    set(_target: any, prop: string | symbol, value: any): boolean {
      if (prop === JSON_CONTENT || prop === FILE_PATH) return false;
      exportsObj[prop] = value;
      return true;
    },
    deleteProperty(_target: any, prop: string | symbol): boolean {
      if (prop === JSON_CONTENT || prop === FILE_PATH) return false;
      return delete exportsObj[prop];
    },
    ownKeys(_target: any): ArrayLike<string | symbol> {
      return Reflect.ownKeys(exportsObj).filter((k) => k !== JSON_CONTENT && k !== FILE_PATH);
    },
    getOwnPropertyDescriptor(_target: any, prop: string | symbol): PropertyDescriptor | undefined {
      if (prop === JSON_CONTENT || prop === FILE_PATH) return undefined;
      return Reflect.getOwnPropertyDescriptor(exportsObj, prop);
    },
  };
  return new Proxy(exportsObj, handler);
}

/**
 * Serialize a JSON proxy back to string.
 * Uses JSON.stringify (not JSON5) to produce valid JSON with double quotes.
 * Note: This loses comments and trailing commas, but produces valid JSON.
 */
function stringifyJson(proxy: any): string {
  // Get the actual JSON content via the symbol (bypasses proxy traps)
  const obj = proxy[JSON_CONTENT];
  // Use JSON.stringify for valid JSON output (double quotes, quoted keys)
  return JSON.stringify(obj, null, 2) + "\n";
}

export interface AstFile {
  /** The proxied module - mutate directly */
  readonly ast: ProxifiedModule | any;
  /** Write the modified AST back to disk */
  write(): Promise<void>;
  /** Modify the AST with a callback function */
  modify(fn: (ast: any) => void | Promise<void>): Promise<void>;
}

/** Internal function to create AstFile with explicit fs */
async function createAstHandleInternal(
  filePath: string,
  fs: JsonFs,
  cwd?: string
): Promise<AstFile> {
  const resolvedPath = resolvePath(fs, filePath, cwd);

  let ast: ProxifiedModule | any;
  if (fs === defaultFs) {
    // Real filesystem - use Magicast's loadFile which handles JSON/JS/TS appropriately
    ast = await loadFile(resolvedPath);
  } else {
    // In-memory filesystem - read content and parse appropriately
    const rawContent = await fs.readFile(resolvedPath, "utf-8");
    const content = typeof rawContent === "string" ? rawContent : new TextDecoder().decode(rawContent);
    if (isJsonFile(filePath)) {
      // Parse as JSON5 (supports comments, trailing commas)
      const parsed = JSON5.parse(content);
      ast = createJsonProxy(parsed, resolvedPath);
    } else {
      // Parse as JS/TS using Magicast
      ast = parseModule(content, { sourceFileName: resolvedPath }) as any;
    }
  }

  const handle: AstFile = {
    get ast() {
      return ast;
    },
    async write() {
      if (fs === defaultFs) {
        // Real filesystem - use Magicast's writeFile
        await writeFile(ast as any, resolvedPath);
      } else {
        // In-memory filesystem - serialize appropriately
        let code: string;
        if (isJsonFile(filePath) && ast[JSON_CONTENT]) {
          code = stringifyJson(ast);
        } else {
          const generated = (ast as any).generate?.();
          code = generated?.code ?? "";
        }
        await fs.writeFile(resolvedPath, code, "utf-8");
      }
    },
    async modify(fn: (ast: any) => void | Promise<void>) {
      await fn(ast);
      await handle.write();
    },
  };

  return handle;
}

/**
 * Create an AST handle for a config file (package.json, tsconfig.json, etc.)
 * Uses Magicast's proxy-based API for transparent mutations.
 *
 * Test API: createAstHandle(fs, filePath)
 * Production API: createAstHandle(filePath, cwd?)
 */
export async function createAstHandle(
  filePathOrFs: string | JsonFs,
  cwdOrPath?: string,
  maybeCwd?: string
): Promise<AstFile> {
  const { fs, cwd } = parseFsArgs([filePathOrFs, cwdOrPath, maybeCwd].filter(Boolean));
  const filePath = getFilePath(filePathOrFs, cwdOrPath, maybeCwd);
  return createAstHandleInternal(filePath, fs, cwd);
}

/**
 * Add an npm script to package.json if it doesn't exist.
 * Preserves all formatting, comments, and key order.
 *
 * Test API: addNpmScript(fs, name, command)
 * Production API: addNpmScript(name, command, cwd?)
 */
export async function addNpmScript(
  nameOrFs: string | JsonFs,
  commandOrName?: string,
  maybeCommand?: string,
  maybeCwd?: string
): Promise<boolean> {
  const { fs, cwd, isTestApi } = parseFsArgs([nameOrFs, commandOrName, maybeCommand, maybeCwd].filter(Boolean));

  let name: string;
  let command: string;

  if (isTestApi) {
    // Test API: (fs, name, command)
    name = commandOrName!;
    command = maybeCommand!;
  } else {
    // Production API: (name, command, cwd?)
    name = nameOrFs as string;
    command = commandOrName!;
  }

  const handle = await createAstHandleInternal("package.json", fs, cwd);

  // Mutate the proxied AST directly - Magicast uses exports.scripts for package.json
  handle.ast.exports.scripts = handle.ast.exports.scripts || {};
  const hadScript = name in handle.ast.exports.scripts;

  if (!hadScript) {
    handle.ast.exports.scripts[name] = command;
    await handle.write();
  }

  return !hadScript; // true if script was added, false if already existed
}

/**
 * Add multiple npm scripts to package.json.
 * Returns array of script names that were actually added.
 *
 * Test API: addNpmScripts(fs, scripts)
 * Production API: addNpmScripts(scripts, cwd?)
 */
export async function addNpmScripts(
  scriptsOrFs: Record<string, string> | JsonFs,
  maybeScripts?: Record<string, string>,
  maybeCwd?: string
): Promise<string[]> {
  const { fs, cwd } = parseFsArgs([scriptsOrFs, maybeScripts, maybeCwd].filter(Boolean));

  let scripts: Record<string, string>;

  if (isJsonFs(scriptsOrFs)) {
    // Test API: (fs, scripts)
    scripts = maybeScripts!;
  } else {
    // Production API: (scripts, cwd?)
    scripts = scriptsOrFs as Record<string, string>;
  }

  const handle = await createAstHandleInternal("package.json", fs, cwd);

  const added: string[] = [];

  handle.ast.exports.scripts = handle.ast.exports.scripts || {};
  for (const [name, cmd] of Object.entries(scripts)) {
    if (!(name in handle.ast.exports.scripts)) {
      handle.ast.exports.scripts[name] = cmd;
      added.push(name);
    }
  }

  if (added.length > 0) {
    await handle.write();
  }

  return added;
}

/**
 * Ensure a .gitignore entry exists.
 * Note: Magicast doesn't parse .gitignore (no structured syntax),
 * so this uses string manipulation - but preserves existing content.
 *
 * Test API: ensureGitignoreEntry(fs, entry)
 * Production API: ensureGitignoreEntry(entry, cwd?)
 */
export async function ensureGitignoreEntry(
  entryOrFs: string | JsonFs,
  maybeEntry?: string,
  maybeCwd?: string
): Promise<boolean> {
  const { fs, cwd, isTestApi } = parseFsArgs([entryOrFs, maybeEntry, maybeCwd].filter(Boolean));

  let entry: string;
  if (isTestApi) {
    entry = maybeEntry!;
  } else {
    entry = entryOrFs as string;
  }

  const gitignorePath = resolvePath(fs, ".gitignore", cwd);

  const exists = await fs.pathExists(gitignorePath);
  const rawContent = exists ? await fs.readFile(gitignorePath, "utf-8") : "";
  const content = typeof rawContent === "string" ? rawContent : new TextDecoder().decode(rawContent);

  // Check if entry already exists (whole line, trimmed)
  const lines = content.split(/\r?\n/);
  const normalizedEntry = entry.trim();
  const alreadyExists = lines.some((line: string) => line.trim() === normalizedEntry);

  if (alreadyExists) {
    return false;
  }

  // Add entry with proper newline handling
  let newContent = content;
  if (newContent.length > 0 && !newContent.endsWith("\n")) {
    newContent += "\n";
  }
  newContent += `${normalizedEntry}\n`;

  await fs.writeFile(gitignorePath, newContent, "utf-8");
  return true;
}

/**
 * Ensure multiple .gitignore entries exist.
 */
export async function ensureGitignoreEntries(
  entriesOrFs: string[] | JsonFs,
  maybeEntries?: string[],
  maybeCwd?: string
): Promise<string[]> {
  const { cwd, isTestApi } = parseFsArgs([entriesOrFs, maybeEntries, maybeCwd].filter(Boolean));
  // fs is not needed here as we pass cwd to ensureGitignoreEntry
  void cwd; // cwd is passed through to ensureGitignoreEntry

  let entries: string[];
  if (isTestApi) {
    entries = maybeEntries!;
  } else {
    entries = entriesOrFs as string[];
  }

  const added: string[] = [];
  for (const entry of entries) {
    const wasAdded = await ensureGitignoreEntry(entry, undefined, cwd);
    if (wasAdded) added.push(entry);
  }
  return added;
}