/**
 * Regression tests for the package.json manifest invariant:
 *
 *   package.json == the dependencies DXG actually installed
 *
 * Root cause pinned here (`dxg add database`): executeDatabase installs
 * dependencies through the package manager (Steps 1-2 run `pnpm add ...`),
 * and `pnpm add` itself persists those dependencies into package.json. The
 * generator then injects the Prisma scripts (Step 5) through @dxgjs/fs
 * `addPackageScripts`, which writes back the manifest object it was handed.
 * When that object is the ProjectAwareness snapshot taken BEFORE the
 * installation (apps/cli → detectProjectAwareness), the write-back erases
 * every dependency the package manager just recorded:
 *
 *   detectProjectAwareness (in-memory snapshot, t0)
 *     → pnpm add -D prisma ...            (disk updated, t1)
 *     → pnpm add @prisma/client ...       (disk updated, t1)
 *     → addPackageScripts(stale t0 object) → writeJson  (BUG: t0 over t1)
 *
 *   → node_modules holds the packages, package.json does not declare them
 *   → `pnpm prisma db pull` triggers pnpm's pre-run verification, which
 *     prunes the undeclared packages and removes the prisma binary.
 *
 * The fix under test: executeDatabase re-reads the manifest from disk at
 * mutation time (ctx.fs.readJson) so script injection can never resurrect a
 * stale snapshot. ProjectAwareness stays read-only knowledge.
 *
 * The real `pnpm add` persistence semantics (updating the manifest) are
 * simulated in the executeCommand mock — that is exactly what a real
 * `pnpm add` does between awareness detection and script injection.
 * Script semantics (identical / conflicting / force / dry-run) are pinned
 * through the REAL addPackageScripts implementation from @dxgjs/fs.
 */

import {
  describe,
  test,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  type Mock,
} from "vitest";
import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
import { render as realRender } from "@dxgjs/templates";
import { note as noteMock, prompt as promptMock } from "@dxgjs/prompts";
import * as path from "path";
import * as os from "os";

vi.mock("@dxgjs/prompts", async () => {
  const actual = await vi.importActual("@dxgjs/prompts");
  return {
    ...actual,
    prompt: vi.fn(),
    intro: vi.fn(),
    outro: vi.fn(),
    isCancel: vi.fn(),
    cancel: vi.fn(),
    spinner: vi.fn().mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
    }),
    note: vi.fn(),
  };
});

vi.mock("@dxgjs/fs", async () => {
  const actual = await vi.importActual<typeof import("@dxgjs/fs")>("@dxgjs/fs");
  // Hoisted store. Mock implementations MUST close over these maps instead of
  // relying on `this`: several call sites invoke these functions without a
  // receiver — the generator's direct `import { executeCommand } from
  // "@dxgjs/fs"` (bare call → this === undefined) and the fsUtils adapters
  // handed to addPackageScripts (this === the plain fsUtils object) — so
  // `this`-based implementations throw "Cannot read properties of undefined".
  const _files = new Map<string, string>();
  const _directories = new Set<string>();
  const _mock = {
    ...actual,
    _files,
    _directories,
    pathExists: vi.fn().mockImplementation(async (filePath: string) => {
      if (_files.has(filePath) || _directories.has(filePath)) {
        return true;
      }
      return actual.pathExists(filePath);
    }),
    readFile: vi.fn().mockImplementation(
      async (filePath: string, options?: any) => {
        if (_files.has(filePath)) {
          return _files.get(filePath);
        }
        return actual.readFile(filePath, options);
      },
    ),
    writeFile: vi.fn().mockImplementation(
      async (filePath: string, data: string | Buffer) => {
        // Purely in-memory: no real-disk writes in these tests.
        _files.set(filePath, data.toString());
        const dir = filePath.split("/").slice(0, -1).join("/");
        if (dir) {
          _directories.add(dir);
        }
        return undefined;
      },
    ),
    stat: vi.fn().mockImplementation(async (filePath: string) => {
      if (_files.has(filePath)) {
        return { isDirectory: () => false };
      }
      if (_directories.has(filePath)) {
        return { isDirectory: () => true };
      }
      return actual.stat(filePath);
    }),
    mkdir: vi.fn().mockImplementation(async (filePath: string) => {
      _directories.add(filePath);
      const parentDir = filePath.split("/").slice(0, -1).join("/");
      if (parentDir) {
        _directories.add(parentDir);
      }
      return undefined;
    }),
    // Manifest I/O goes through the same in-memory store so readJson sees
    // exactly what the simulated package manager and writeJson persisted.
    readJson: vi.fn().mockImplementation(async (filePath: string) => {
      const content = _files.get(filePath);
      if (content !== undefined) {
        return JSON.parse(content);
      }
      return actual.readJson(filePath);
    }),
    writeJson: vi.fn().mockImplementation(
      async (
        filePath: string,
        data: unknown,
        options?: { spaces?: number },
      ) => {
        // addPackageScripts calls this through its fsUtils adapter (plain
        // receiver), so the store MUST be captured in this closure.
        _files.set(
          filePath,
          JSON.stringify(data, null, options?.spaces ?? 2),
        );
        return undefined;
      },
    ),
    // Simulates the package manager's own persistence semantics: a real
    // `pnpm add ...` records the new dependencies in package.json itself.
    // This is the disk state DXG's script injection must build upon.
    // executeCommand is called bare by the generator (direct import), so the
    // store MUST be captured in this closure rather than reached via `this`.
    executeCommand: vi.fn().mockImplementation(
      async (command: string, args: string[] = []) => {
        if (command === "npm" && args[0] === "install") {
          const dev = args[1] === "-D";
          const packages = dev ? args.slice(2) : args.slice(1);
          const manifest = JSON.parse(
            _files.get("package.json") ?? "{}",
          ) as Record<string, any>;
          const section = dev
            ? (manifest.devDependencies ??= {})
            : (manifest.dependencies ??= {});
          for (const spec of packages) {
            const at = spec.lastIndexOf("@");
            const name = at > 0 ? spec.slice(0, at) : spec;
            section[name] = at > 0 ? spec.slice(at + 1) : "*";
          }
          _files.set("package.json", JSON.stringify(manifest, null, 2));
        }
        // prisma init (npx prisma@7 init ...) and anything else: no-op.
        return undefined;
      },
    ),
  };
  return _mock;
});

vi.mock("@antfu/ni", () => {
  return {
    parseNi: vi.fn().mockReturnValue("npm"),
    parseNlx: vi.fn().mockReturnValue("npx"),
    getCliCommand: vi
      .fn()
      .mockImplementation(async (_parseFn: unknown, args: string[]) => {
        if (!args || args.length === 0) {
          return { command: "npm", args: [] };
        }
        // prisma init: verbatim dlx passthrough (never an install).
        if (args[0] === "prisma@7" && args[1] === "init") {
          return { command: "npx", args: [...args] };
        }
        // Dependency installation: `ni add -D <pkgs>` / `ni add <pkgs>`.
        if (args[0] === "-D") {
          return { command: "npm", args: ["install", "-D", ...args.slice(1)] };
        }
        return { command: "npm", args: ["install", ...args] };
      }),
  };
});

vi.mock("@dxgjs/templates", async () => {
  const actual =
    await vi.importActual<typeof import("@dxgjs/templates")>("@dxgjs/templates");
  return {
    ...actual,
    render: vi.fn(actual.render),
  };
});

let databaseGenerator: any;
let providerData: any;

beforeAll(async () => {
  const indexModule = await import("./index");
  databaseGenerator = indexModule.default;
  providerData = indexModule.providerData;
});

const fsMockStore = fs as unknown as {
  _files: Map<string, string>;
  _directories: Set<string>;
};

/** The exact manifest from the real-world bug report (fresh Next.js app). */
const MY_APP_PACKAGE_JSON = {
  name: "my-app",
  version: "0.1.0",
  private: true,
  scripts: {
    dev: "next dev",
    build: "next build",
    start: "next start",
    lint: "eslint",
  },
  dependencies: {
    next: "16.2.12",
    react: "19.2.4",
    "react-dom": "19.2.4",
  },
  devDependencies: {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    eslint: "^9",
    "eslint-config-next": "16.2.12",
    tailwindcss: "^4",
    typescript: "^5",
  },
};

/** Package name from a dependency spec ("@prisma/client@7.10.0" → "@prisma/client"). */
function specName(spec: string): string {
  const at = spec.lastIndexOf("@");
  return at > 0 ? spec.slice(0, at) : spec;
}

async function seedProject(manifest: unknown = MY_APP_PACKAGE_JSON) {
  await fs.writeFile("package.json", JSON.stringify(manifest, null, 2), "utf8");
}

/** The manifest exactly as pnpm/the outside world would read it from disk. */
function readManifestFromDisk(): Record<string, any> {
  const raw = fsMockStore._files.get("package.json");
  expect(raw).toBeDefined();
  return JSON.parse(raw!);
}

/** A GeneratorContext holding a STALE awareness snapshot, like the CLI. */
function makeContext(
  manifest: unknown = MY_APP_PACKAGE_JSON,
  overrides: Record<string, unknown> = {},
) {
  return {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger,
    fs,
    templates: {
      // Real renderer semantics (delegates to @dxgjs/templates render).
      render: vi.fn(realRender),
    },
    awareness: {
      projectRoot: ".",
      workspaceRoot: ".",
      framework: { name: "next-app", detected: true },
      language: { name: "typescript", detected: true },
      packageManager: "pnpm",
      styling: {
        name: "tailwindcss",
        detected: true,
        version: "v4",
        configFile: null,
      },
      capabilities: {
        hasTests: false,
        hasLinting: true,
        hasFormatter: false,
        hasCI: false,
        hasDocker: false,
      },
      // Deep copy: the CLI holds the t0 snapshot while `pnpm add` updates
      // the disk. This object MUST NOT be what gets written back.
      packageJson: JSON.parse(JSON.stringify(manifest)),
    },
    dryRun: false,
    force: false,
    ...overrides,
  };
}

function notes(): string[] {
  return (noteMock as Mock).mock.calls.map((call) => String(call[0]));
}

/**
 * The single Operation Summary note rendered by summarizeDatabase — the
 * coherent result of the whole run (semantic contract: collect first,
 * render once). `runs` is the number of generator runs the test performed:
 * each run renders EXACTLY one note, and the helper returns the latest
 * run's summary.
 */
function operationSummary(runs = 1): string {
  const summaryNotes = notes();
  expect(summaryNotes.length).toBe(runs);
  return summaryNotes[runs - 1];
}

describe("package manifest invariant (dependencies survive script injection)", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tempDir = path.join(
      os.tmpdir(),
      `dxg-manifest-test-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 15)}`,
    );
    fs.mkdirSync(tempDir, { recursive: true });
    process.chdir(tempDir);
    vi.clearAllMocks();
    fsMockStore._files.clear();
    fsMockStore._directories.clear();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("postgresql: dependencies installed by the package manager survive Prisma script injection", async () => {
    await seedProject();

    await databaseGenerator.run(
      { provider: "postgresql", installPrismaSkills: false, databaseScripts: "recommended" },
      makeContext(),
    );

    const final = readManifestFromDisk();

    // The Prisma dependencies recorded by the (simulated) `pnpm add` runs
    // must still be declared after the script injection write-back.
    expect(final.dependencies).toMatchObject({
      "@prisma/client": "7.10.0",
      "@prisma/adapter-pg": expect.any(String),
      pg: expect.any(String),
      dotenv: expect.any(String),
    });
    expect(final.devDependencies).toMatchObject({
      prisma: "7.10.0",
      "@types/pg": expect.any(String),
      "@types/node": expect.any(String),
    });

    // Pre-existing project content is untouched.
    expect(final.name).toBe("my-app");
    expect(final.version).toBe("0.1.0");
    expect(final.private).toBe(true);
    expect(final.dependencies).toMatchObject({
      next: "16.2.12",
      react: "19.2.4",
      "react-dom": "19.2.4",
    });
    expect(final.devDependencies).toMatchObject({
      "@tailwindcss/postcss": "^4",
      "@types/react": "^19",
      "@types/react-dom": "^19",
      eslint: "^9",
      "eslint-config-next": "16.2.12",
      tailwindcss: "^4",
      typescript: "^5",
    });

    // The recommended database scripts are added alongside the untouched
    // existing scripts (recommended set: generate, push, studio).
    expect(final.scripts).toEqual({
      dev: "next dev",
      build: "next build",
      start: "next start",
      lint: "eslint",
      "db:generate": "prisma generate",
      "db:push": "prisma db push",
      "db:studio": "prisma studio",
    });
  });

  test("prisma remains declared after generation (pnpm prisma stays executable)", async () => {
    await seedProject();

    await databaseGenerator.run(
      { provider: "postgresql", installPrismaSkills: false, databaseScripts: "recommended" },
      makeContext(),
    );

    const final = readManifestFromDisk();
    // `pnpm prisma ...` resolves node_modules/.bin/prisma only while the
    // prisma package stays declared; an undeclared binary is exactly what
    // pnpm's pre-run verification pruned in the original bug report.
    expect(final.devDependencies.prisma).toBe("7.10.0");
    expect(final.dependencies["@prisma/client"]).toBe("7.10.0");
  });

  test("every provider installs and persists exactly its declared dependency set", async () => {
    for (const provider of Object.values(providerData) as any[]) {
      fsMockStore._files.clear();
      fsMockStore._directories.clear();
      vi.clearAllMocks();
      await seedProject();

      await databaseGenerator.run(
        { provider: provider.key, installPrismaSkills: false, databaseScripts: "recommended" },
        makeContext(),
      );

      // Exactly two install invocations: dev (-D) first, then regular.
      const installCalls = (fs.executeCommand as Mock).mock.calls.filter(
        (call) => (call[1] as string[])[0] === "install",
      );
      expect(installCalls).toHaveLength(2);
      expect(installCalls[0][1].slice(2)).toEqual(provider.devDependencies);
      expect(installCalls[1][1].slice(1)).toEqual(provider.dependencies);

      // Every installed package is declared in the final manifest.
      const final = readManifestFromDisk();
      for (const spec of provider.devDependencies) {
        expect(final.devDependencies).toHaveProperty(specName(spec));
      }
      for (const spec of provider.dependencies) {
        expect(final.dependencies).toHaveProperty(specName(spec));
      }
      // Pre-existing dependencies survive for every provider.
      expect(final.dependencies.next).toBe("16.2.12");
    }
  });

  test("identical scripts are treated as unchanged and trigger no second write", async () => {
    await seedProject();
    const context = makeContext();

    await databaseGenerator.run(
      { provider: "postgresql", installPrismaSkills: false, databaseScripts: "recommended" },
      context,
    );
    const writeCallsAfterFirstRun = (fs.writeJson as Mock).mock.calls.length;
    expect(writeCallsAfterFirstRun).toBeGreaterThan(0);

    await databaseGenerator.run(
      { provider: "postgresql", installPrismaSkills: false, databaseScripts: "recommended" },
      context,
    );

    // Idempotent re-run: identical scripts → skipped, nothing rewritten.
    expect((fs.writeJson as Mock).mock.calls.length).toBe(
      writeCallsAfterFirstRun,
    );
    // The skip is reported inside the single Operation Summary (semantic:
    // skipped info is preserved, not its exact wording). Two runs → two
    // notes, one per run; we assert on the second run's summary.
    const secondRunSummary = operationSummary(2);
    expect(secondRunSummary).toContain("db:generate");
    expect(secondRunSummary.toLowerCase()).toContain("skip");
    // And the manifest still holds both dependencies and scripts.
    const final = readManifestFromDisk();
    expect(final.devDependencies.prisma).toBe("7.10.0");
    expect(final.scripts["db:generate"]).toBe("prisma generate");
  });

  test("conflicting scripts are reported and the existing command is preserved without force", async () => {
    const manifest = {
      ...MY_APP_PACKAGE_JSON,
      scripts: {
        ...MY_APP_PACKAGE_JSON.scripts,
        "db:generate": "prisma generate --custom",
      },
    };
    await seedProject(manifest);

    await databaseGenerator.run(
      { provider: "postgresql", installPrismaSkills: false, databaseScripts: "recommended" },
      makeContext(manifest),
    );

    // Conflicts are reported inside the single Operation Summary, with both
    // the conflicting script and the user's existing command preserved
    // (semantic: conflict info is preserved, not its exact wording).
    const conflictSummary = operationSummary();
    expect(conflictSummary).toContain("db:generate");
    expect(conflictSummary).toContain("prisma generate --custom");
    expect(conflictSummary.toLowerCase()).toContain("conflict");
    expect(conflictSummary).toContain("package.json");

    const final = readManifestFromDisk();
    // The user's own script command is never clobbered without --force...
    expect(final.scripts["db:generate"]).toBe("prisma generate --custom");
    // ...the remaining scripts are still added...
    expect(final.scripts["db:push"]).toBe("prisma db push");
    expect(final.scripts["db:studio"]).toBe("prisma studio");
    // ...and the installed dependencies survive the write-back.
    expect(final.dependencies["@prisma/client"]).toBe("7.10.0");
    expect(final.devDependencies.prisma).toBe("7.10.0");
  });

  test("force follows existing DXG semantics: overwrites conflicting scripts and keeps dependencies", async () => {
    const manifest = {
      ...MY_APP_PACKAGE_JSON,
      scripts: {
        ...MY_APP_PACKAGE_JSON.scripts,
        "db:generate": "prisma generate --custom",
      },
    };
    await seedProject(manifest);

    await databaseGenerator.run(
      { provider: "postgresql", installPrismaSkills: false, databaseScripts: "recommended" },
      makeContext(manifest, { force: true }),
    );

    const final = readManifestFromDisk();
    // --force overwrites the conflicting script with the DXG command.
    expect(final.scripts["db:generate"]).toBe("prisma generate");
    expect(final.scripts["db:push"]).toBe("prisma db push");
    // No conflict reported when forcing.
    expect(notes().some((n) => n.includes("Prisma script conflicts"))).toBe(
      false,
    );
    // Dependencies still survive the force write-back.
    expect(final.dependencies["@prisma/client"]).toBe("7.10.0");
    expect(final.devDependencies.prisma).toBe("7.10.0");
    // Existing project content is still untouched.
    expect(final.dependencies.next).toBe("16.2.12");
    expect(final.scripts.dev).toBe("next dev");
  });

  test("dryRun does not mutate package.json", async () => {
    await seedProject();
    const before = fsMockStore._files.get("package.json");

    await databaseGenerator.run(
      { provider: "postgresql", installPrismaSkills: false, databaseScripts: "recommended" },
      makeContext(MY_APP_PACKAGE_JSON, { dryRun: true }),
    );

    // Byte-identical manifest, no installs, no writes, no generated file.
    expect(fsMockStore._files.get("package.json")).toBe(before);
    expect(fs.executeCommand).not.toHaveBeenCalled();
    expect(fs.writeJson).not.toHaveBeenCalled();
    expect(fsMockStore._files.has("lib/prisma.ts")).toBe(false);
  });

  test("a manifest without a scripts section still receives the Prisma scripts and keeps its dependencies", async () => {
    const manifest = {
      name: "bare-app",
      version: "1.0.0",
      private: true,
      dependencies: { react: "19.2.4" },
    };
    await seedProject(manifest);

    await databaseGenerator.run(
      { provider: "postgresql", installPrismaSkills: false, databaseScripts: "recommended" },
      makeContext(manifest),
    );

    const final = readManifestFromDisk();
    expect(final.scripts["db:generate"]).toBe("prisma generate");
    expect(final.scripts["db:studio"]).toBe("prisma studio");
    expect(final.dependencies.react).toBe("19.2.4");
    expect(final.dependencies["@prisma/client"]).toBe("7.10.0");
    expect(final.devDependencies.prisma).toBe("7.10.0");
  });

  test("ProjectAwareness stays read-only (its snapshot is never written back)", async () => {
    await seedProject();
    const context = makeContext();

    await databaseGenerator.run(
      { provider: "postgresql", installPrismaSkills: false, databaseScripts: "recommended" },
      context,
    );

    // The awareness snapshot must remain exactly the t0 state: script
    // mutations belong to the freshly-read manifest, never to the
    // read-only ProjectAwareness object.
    expect(context.awareness.packageJson.scripts).toEqual(
      MY_APP_PACKAGE_JSON.scripts,
    );
    expect(context.awareness.packageJson.dependencies).toEqual(
      MY_APP_PACKAGE_JSON.dependencies,
    );
  });

  test("the --no-skills contract is unaffected by the manifest fix", async () => {
    await seedProject();

    await databaseGenerator.run(
      { provider: "postgresql", installPrismaSkills: false, databaseScripts: "recommended" },
      makeContext(),
    );

    const prismaInitCall = (fs.executeCommand as Mock).mock.calls.find(
      (call) => (call[1] as string[]).includes("init"),
    );
    expect(prismaInitCall).toBeDefined();
    expect(prismaInitCall![0]).toBe("npx");
    expect(prismaInitCall![1]).toEqual([
      "prisma@7",
      "init",
      "--datasource-provider",
      "postgresql",
      "--no-skills",
      "--output",
      "../lib/generated/prisma",
    ]);
    // Full answers provided → DXG never prompts, Prisma never asks.
    expect(promptMock).not.toHaveBeenCalled();
  });
});


