/**
 * Idempotence & reconciliation behavior contract (decision document).
 *
 * A second `dxg add database` run must RECONCILE the project — never
 * blindly reinstall/reinitialize. Contract under test:
 *
 * - `prisma/` exists but holds no schema.prisma → FAIL EARLY, before ANY
 *   installation command runs (prisma init refuses existing prisma/ dirs,
 *   verified empirically — the state is unrecoverable for DXG).
 * - Incompatible Prisma declarations (6.x / 8.x / other 7.x / prerelease
 *   ranges) → FAIL EARLY, before ANY installation (npm silently flips a
 *   declared 6.20.0 to ^7.10.0 — verified empirically; DXG must not).
 * - Both Prisma packages declared at the verified pin (7.10.0, ^7.10.0…) →
 *   install batches drop them, init is skipped, generate still runs.
 * - Existing schema.prisma or prisma7.config.ts → init never executes.
 * - generate always executes (byte-stable regen, staleness case).
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
import { note as noteMock } from "@dxgjs/prompts";
import { createDependencyInstaller } from "../../install/installer";
import * as path from "path";
import * as os from "os";

vi.mock("@dxgjs/prompts", async () => {
  const actual = await vi.importActual("@dxgjs/prompts");
  return {
    ...actual,
    prompt: vi.fn(),
    multiselect: vi.fn(),
    intro: vi.fn(),
    outro: vi.fn(),
    isCancel: vi.fn((value: unknown) => value === Symbol.for("clack:cancel")),
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
  const _files = new Map<string, string>();
  const _directories = new Set<string>();

  // The exact prisma7.config.ts content written by `prisma init` 7.10.0
  const _prismaInitConfig = [
    'import { defineConfig } from "prisma/config";',
    "",
    "export default defineConfig({",
    '  schema: "prisma/schema.prisma",',
    "  migrations: {",
    '    path: "prisma/migrations",',
    "  },",
    "});",
    "",
  ].join("\n");

  const _mock = {
    ...actual,
    _files,
    _directories,
    _prismaInitConfig,
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
        return { isDirectory: () => false, isFile: () => true };
      }
      if (_directories.has(filePath)) {
        return { isDirectory: () => true, isFile: () => false };
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
        _files.set(
          filePath,
          JSON.stringify(data, null, options?.spaces ?? 2),
        );
        return undefined;
      },
    ),
    executeCommand: vi.fn().mockImplementation(
      async (command: string, args: string[] = []) => {
        // Simulate the package manager persisting installed dependencies
        // into package.json. Command shape: getCliCommand resolves batches
        // to "npm-mock install [-D] <specs...>".
        if (command === "npm-mock" && args[0] === "install") {
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
          // better-sqlite3's (approved) install script lands the binding —
          // the native artifact the verification probes.
          if (packages.some((s: string) => s.startsWith("better-sqlite3"))) {
            _files.set(
              "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
              "<binary>",
            );
          }
        }
        // Simulate `prisma init` (prisma@7.10.0, non-bun) — writes the root
        // prisma7.config.ts plus the prisma/ scaffolding (schema.prisma
        // included: the real CLI always writes it).
        if (
          command === "npx" &&
          args[0] === "prisma@7" &&
          args[1] === "init" &&
          !_files.has("prisma7.config.ts")
        ) {
          _files.set(
            "prisma/schema.prisma",
            [
              "generator client {",
              '  provider = "prisma-client"',
              '  output = "../lib/generated/prisma"',
              "}",
              "",
              "datasource db {",
              '  provider = "sqlite"',
              "}",
              "",
            ].join("\n"),
          );
          _files.set("prisma7.config.ts", _prismaInitConfig);
          _files.set(".env", 'DATABASE_URL="file:./dev.db"\n');
          _directories.add("prisma");
        }
        // Simulate `prisma generate`: emits the generated client.
        if (
          command === "npx" &&
          args[0] === "prisma@7" &&
          args[1] === "generate"
        ) {
          _files.set(
            "lib/generated/prisma/client.ts",
            "// generated prisma client\n",
          );
          _directories.add("lib/generated/prisma");
          return { all: "prisma generate ok", stdout: "", stderr: "" };
        }
        return { all: "", stdout: "", stderr: "" };
      },
    ),
  };
  return _mock;
});

vi.mock("@antfu/ni", () => {
  return {
    parseNlx: vi.fn().mockReturnValue("npx"),
    parseNi: vi.fn().mockReturnValue("npm-mock"),
    getCliCommand: vi
      .fn()
      .mockImplementation((parseNiFn: any, args: string[]) => {
        parseNiFn;
        // dlx passthrough (real ni behavior): prisma init/generate resolve
        // to npx with verbatim args.
        if (args[0] === "prisma@7" && (args[1] === "init" || args[1] === "generate")) {
          return { command: "npx", args: [...args], cwd: undefined };
        }
        // Dependency install batches resolve as npm install (-D → dev).
        if (args.includes("-D")) {
          return {
            command: "npm-mock",
            args: ["install", "-D", ...args.slice(1)],
            cwd: undefined,
          };
        }
        return { command: "npm-mock", args: ["install", ...args], cwd: undefined };
      }),
  };
});

// Import the database generator AFTER the mocks are in place
let databaseGenerator: any;

beforeAll(async () => {
  // vi.clearAllMocks() in beforeEach would wipe the mockImplementations
  // installed here — clear only the CALL state.
  const indexModule = await import("./index");
  databaseGenerator = indexModule.default;
});

const fsMockStore = fs as unknown as {
  _files: Map<string, string>;
  _directories: Set<string>;
};

/** A realistic Next.js project manifest. */
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
};

/** A manifest that already declares both Prisma packages at the verified pin. */
const SATISFIED_PACKAGE_JSON = {
  ...MY_APP_PACKAGE_JSON,
  devDependencies: {
    prisma: "7.10.0",
  },
  dependencies: {
    ...MY_APP_PACKAGE_JSON.dependencies,
    "@prisma/client": "7.10.0",
  },
};

async function seedProject(manifest: unknown = MY_APP_PACKAGE_JSON) {
  await fs.writeFile("package.json", JSON.stringify(manifest, null, 2), "utf8");
}

function readManifestFromDisk(): Record<string, any> {
  const raw = fsMockStore._files.get("package.json");
  expect(raw).toBeDefined();
  return JSON.parse(raw!);
}

function makeContext(overrides: Record<string, unknown> = {}) {
  return {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger,
    fs,
    templates: {
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
      packageJson: JSON.parse(JSON.stringify(MY_APP_PACKAGE_JSON)),
    },
    installer: createDependencyInstaller({ agent: "npm", fs: fs as any }),
    dryRun: false,
    force: false,
    nonInteractive: false,
    ...overrides,
  };
}

/**
 * Every executeCommand call whose command is an INSTALL-flavored call.
 * The plan runs dev install + deps install (through the npm-mock agent),
 * so "install never executed" is asserted via the absence of install-shaped
 * calls — the exact contract the decision document requires.
 */
function installCalls(): string[][] {
  return (fs.executeCommand as Mock).mock.calls.filter(
    (call: any[]) => {
      const [cmd, args] = call as [string, string[]];
      if (cmd !== "npm-mock") return false;
      const first = args[0];
      return first === "install" || first === "add";
    },
  );
}

function prismaCommandCalls(): string[][] {
  return (fs.executeCommand as Mock).mock.calls.filter(
    (call: any[]) => {
      const [cmd, args] = call as [string, string[]];
      return cmd === "npx" && args[0] === "prisma@7";
    },
  );
}

let originalCwd: string;
let tempDir: string;

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = path.join(
    os.tmpdir(),
    `dxg-idem-test-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}`,
  );
  fs.mkdirSync(tempDir, { recursive: true });
  process.chdir(tempDir);
  (fs.executeCommand as Mock).mockClear();
  (noteMock as Mock).mockClear();
  fsMockStore._files.clear();
  fsMockStore._directories.clear();
  delete process.env.CI;
});

afterEach(() => {
  process.chdir(originalCwd);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// GATE 1: prisma/ exists without schema.prisma → fail before install
// ---------------------------------------------------------------------------

describe("idempotence gates (fail-early, before any installation)", () => {
  test("prisma/ empty → run fails AND no install command ever executes", async () => {
    await seedProject();
    // The unrecoverable state: prisma/ exists, schema.prisma does not.
    fsMockStore._directories.add("prisma");

    await expect(
      databaseGenerator.run(
        {
          provider: "sqlite",
          installPrismaSkills: false,
          databaseScripts: "recommended",
        },
        makeContext(),
      ),
    ).rejects.toThrow(/prisma\/ directory exists but contains no schema/i);

    // The installation command is NEVER executed in this failure case.
    expect(installCalls()).toHaveLength(0);
    expect(prismaCommandCalls()).toHaveLength(0);
  });

  test("prisma/ with only unrelated files → same fail-early contract", async () => {
    await seedProject();
    fsMockStore._directories.add("prisma");
    fsMockStore._files.set(
      "prisma/notes.txt",
      "leftover from an aborted setup",
    );

    await expect(
      databaseGenerator.run(
        { provider: "sqlite", installPrismaSkills: false },
        makeContext(),
      ),
    ).rejects.toThrow(/prisma\/ directory exists but contains no schema/i);

    expect(installCalls()).toHaveLength(0);
    expect(prismaCommandCalls()).toHaveLength(0);
  });

  test("declared prisma 6.20.0 → conflict BEFORE install (no silent flip)", async () => {
    await seedProject({
      ...MY_APP_PACKAGE_JSON,
      devDependencies: { prisma: "6.20.0" },
      dependencies: { ...MY_APP_PACKAGE_JSON.dependencies },
    });

    await expect(
      databaseGenerator.run(
        { provider: "sqlite", installPrismaSkills: false },
        makeContext(),
      ),
    ).rejects.toThrow(/Prisma version conflict/i);

    expect(installCalls()).toHaveLength(0);
    expect(prismaCommandCalls()).toHaveLength(0);
    // The declared version is untouched — no silent flip to ^7.10.0.
    const manifest = readManifestFromDisk();
    expect(manifest.devDependencies.prisma).toBe("6.20.0");
  });

  test("declared @prisma/client ^7.0.0 → conflict (unverified floor)", async () => {
    await seedProject({
      ...MY_APP_PACKAGE_JSON,
      devDependencies: {},
      dependencies: {
        ...MY_APP_PACKAGE_JSON.dependencies,
        "@prisma/client": "^7.0.0",
      },
    });

    await expect(
      databaseGenerator.run(
        { provider: "sqlite", installPrismaSkills: false },
        makeContext(),
      ),
    ).rejects.toThrow(/Prisma version conflict/i);

    expect(installCalls()).toHaveLength(0);
  });

  test("declared prisma 8.0.0-rc.13 (prerelease) → conflict", async () => {
    await seedProject({
      ...MY_APP_PACKAGE_JSON,
      devDependencies: { prisma: "8.0.0-rc.13" },
      dependencies: { ...MY_APP_PACKAGE_JSON.dependencies },
    });

    await expect(
      databaseGenerator.run(
        { provider: "sqlite", installPrismaSkills: false },
        makeContext(),
      ),
    ).rejects.toThrow(/Prisma version conflict/i);

    expect(installCalls()).toHaveLength(0);
  });

  test("declared prisma 7.0.0 (silent --no-skills bug) → conflict", async () => {
    await seedProject({
      ...MY_APP_PACKAGE_JSON,
      devDependencies: { prisma: "7.0.0" },
      dependencies: { ...MY_APP_PACKAGE_JSON.dependencies },
    });

    await expect(
      databaseGenerator.run(
        { provider: "sqlite", installPrismaSkills: false },
        makeContext(),
      ),
    ).rejects.toThrow(/Prisma version conflict/i);

    expect(installCalls()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// GATE 2: satisfied declarations → no reinstall, no re-init, generate runs
// ---------------------------------------------------------------------------

describe("idempotence reconciliation (satisfied state)", () => {
  test("satisfied declarations on a fresh-shaped run → prisma init runs, prisma packages NOT reinstalled", async () => {
    await seedProject(SATISFIED_PACKAGE_JSON);

    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext(),
    );

    const installs = installCalls();
    // prisma and @prisma/client are dropped from the batches; the remaining
    // provider deps (adapter, better-sqlite3, dotenv) are still installed.
    const allSpecs = installs.flatMap((call: any[]) => {
      const args: string[] = call[1] ?? [];
      return args.filter((a) => !["install", "add", "-D"].includes(a));
    });
    expect(allSpecs).not.toContain("prisma@7.10.0");
    expect(allSpecs).not.toContain("@prisma/client@7.10.0");
    expect(allSpecs.some((s) => s.startsWith("better-sqlite3"))).toBe(true);

    // Fresh-shaped (no schema, no config): init still executes.
    const initCalls = prismaCommandCalls().filter(
      (call: any[]) => call[1]?.[1] === "init",
    );
    expect(initCalls).toHaveLength(1);
  });

  test("full second run: nothing reinstalled, init skipped, generate executed, user files byte-preserved", async () => {
    await seedProject(SATISFIED_PACKAGE_JSON);

    const context = makeContext();
    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false, databaseScripts: "recommended" },
      context,
    );
    const schemaAfterFirst = fsMockStore._files.get("prisma/schema.prisma");
    const configAfterFirst = fsMockStore._files.get("prisma7.config.ts");
    const envAfterFirst = fsMockStore._files.get(".env");
    (fs.executeCommand as Mock).mockClear();

    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false, databaseScripts: "recommended" },
      context,
    );

    // Byte-preservation: user-reconciled files were not rewritten.
    expect(fsMockStore._files.get("prisma/schema.prisma")).toBe(
      schemaAfterFirst,
    );
    expect(fsMockStore._files.get("prisma7.config.ts")).toBe(configAfterFirst);
    expect(fsMockStore._files.get(".env")).toBe(envAfterFirst);

    // Prisma packages were NOT reinstalled.
    const allSpecs = installCalls().flatMap((call: any[]) => {
      const args: string[] = call[1] ?? [];
      return args.filter((a) => !["install", "add", "-D"].includes(a));
    });
    expect(allSpecs).not.toContain("prisma@7.10.0");
    expect(allSpecs).not.toContain("@prisma/client@7.10.0");

    // init never executes; generate DOES (always-generate).
    const initCalls = prismaCommandCalls().filter(
      (call: any[]) => call[1]?.[1] === "init",
    );
    const generateCalls = prismaCommandCalls().filter(
      (call: any[]) => call[1]?.[1] === "generate",
    );
    expect(initCalls).toHaveLength(0);
    expect(generateCalls).toHaveLength(1);

    // The skip is surfaced in the operation summary.
    const summary = String(
      (noteMock as Mock).mock.calls.at(-1)?.[0] ?? "",
    );
    expect(summary).toMatch(/initialization/i);
  });

  test("schema-only project (no config): init skipped, schema byte-preserved", async () => {
    await seedProject(SATISFIED_PACKAGE_JSON);
    fsMockStore._files.set(
      "prisma/schema.prisma",
      [
        "// user-owned schema",
        "generator client {",
        '  provider = "prisma-client"',
        '  output = "../lib/generated/prisma"',
        "}",
        "",
        "datasource db {",
        '  provider = "sqlite"',
        "}",
        "",
      ].join("\n"),
    );
    fsMockStore._directories.add("prisma");

    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext(),
    );

    // init never executes (schema exists → gate).
    expect(
      prismaCommandCalls().filter((call: any[]) => call[1]?.[1] === "init"),
    ).toHaveLength(0);
    // Schema is byte-preserved.
    expect(fsMockStore._files.get("prisma/schema.prisma")).toContain(
      "// user-owned schema",
    );
    // generate still runs (always-generate).
    expect(
      prismaCommandCalls().filter((call: any[]) => call[1]?.[1] === "generate"),
    ).toHaveLength(1);
  });

  test("config-only project (prisma7.config.ts, no schema/, no prisma dir): init skipped, config byte-preserved", async () => {
    await seedProject(SATISFIED_PACKAGE_JSON);
    fsMockStore._files.set(
      "prisma7.config.ts",
      [
        "// user-owned config",
        'import { defineConfig } from "prisma/config";',
        "export default defineConfig({",
        '  schema: "prisma/schema.prisma",',
        "  migrations: {",
        '    path: "custom/migrations",',
        "  },",
        '  seed: "node custom-seed.js",',
        "});",
        "",
      ].join("\n"),
    );

    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext(),
    );

    expect(
      prismaCommandCalls().filter((call: any[]) => call[1]?.[1] === "init"),
    ).toHaveLength(0);
    // The custom config survived byte-for-byte (init would have clobbered
    // migrations.path and the custom seed — verified empirically).
    const config = fsMockStore._files.get("prisma7.config.ts")!;
    expect(config).toContain("custom/migrations");
    expect(config).toContain('seed: "node custom-seed.js"');
  });

  test("declared satisfied but NOT installed → prisma specs still skipped (lockfile repair via manager)", async () => {
    await seedProject(SATISFIED_PACKAGE_JSON);
    // No node_modules at all: declared satisfied, installed: false. The
    // decision document: declared-satisfied specs are not reinstalled by
    // DXG; the package manager restores what the lockfile knows when the
    // other specs install. DXG never force-reinstalls on a satisfied
    // declaration.
    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext(),
    );

    const allSpecs = installCalls().flatMap((call: any[]) => {
      const args: string[] = call[1] ?? [];
      return args.filter((a) => !["install", "add", "-D"].includes(a));
    });
    expect(allSpecs).not.toContain("prisma@7.10.0");
    expect(allSpecs).not.toContain("@prisma/client@7.10.0");
  });
});

// ---------------------------------------------------------------------------
// .env additive reconciliation (decision document, section 5)
// ---------------------------------------------------------------------------

describe(".env additive reconciliation", () => {
  /** Seeds the state a previous complete run leaves behind (init skipped). */
  function seedReconciledProject(): void {
    fsMockStore._files.set(
      "prisma/schema.prisma",
      [
        "generator client {",
        '  provider = "prisma-client"',
        '  output = "../lib/generated/prisma"',
        "}",
        "",
        "datasource db {",
        '  provider = "sqlite"',
        "}",
        "",
      ].join("\n"),
    );
    fsMockStore._directories.add("prisma");
    fsMockStore._files.set(
      "prisma7.config.ts",
      "// reconciled config\n",
    );
  }

  test(".env absent + init skipped → minimal .env created with a DATABASE_URL placeholder", async () => {
    await seedProject(SATISFIED_PACKAGE_JSON);
    seedReconciledProject();

    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext(),
    );

    const env = fsMockStore._files.get(".env");
    expect(env).toBeDefined();
    expect(env).toContain("DATABASE_URL=");
    expect(env).toContain(
      "Environment variables — declared by the database layer",
    );
  });

  test(".env without DATABASE_URL → one line appended, existing bytes preserved", async () => {
    await seedProject(SATISFIED_PACKAGE_JSON);
    seedReconciledProject();
    const originalEnv = [
      "# User-owned environment file",
      "NEXT_PUBLIC_API_KEY=abc123",
      "",
    ].join("\n");
    fsMockStore._files.set(".env", originalEnv);

    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext(),
    );

    const env = fsMockStore._files.get(".env")!;
    // Byte-preservation: the original content is a prefix of the result.
    expect(env.startsWith(originalEnv)).toBe(true);
    // The appended declaration exists exactly once.
    const matches = env.match(/^DATABASE_URL=$/gm) ?? [];
    expect(matches).toHaveLength(1);
  });

  test(".env already defining DATABASE_URL → untouched byte-for-byte", async () => {
    await seedProject(SATISFIED_PACKAGE_JSON);
    seedReconciledProject();
    const originalEnv = [
      "# User-owned environment file",
      'DATABASE_URL="file:./prod.db"',
      "OTHER=value",
      "",
    ].join("\n");
    fsMockStore._files.set(".env", originalEnv);

    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext(),
    );

    expect(fsMockStore._files.get(".env")).toBe(originalEnv);
  });
});

// ---------------------------------------------------------------------------
// Helper path UX + dynamic imports (decision document, sections 6-7)
// ---------------------------------------------------------------------------

describe("helper path resolution and dynamic imports", () => {
  test("custom helper path → helper lands there with a RELATIVE client import", async () => {
    await seedProject();

    await databaseGenerator.run(
      {
        provider: "sqlite",
        installPrismaSkills: false,
        helperPath: "src/lib/db.ts",
      },
      makeContext(),
    );

    // The helper was created at the custom path — not at lib/prisma.ts.
    const helper = fsMockStore._files.get("src/lib/db.ts");
    expect(helper).toBeDefined();
    expect(fsMockStore._files.has("lib/prisma.ts")).toBe(false);
    // The generated-client import is computed relative to src/lib/db.ts:
    // lib/generated/prisma from src/lib → ../../lib/generated/prisma/client.
    expect(helper).toContain(
      'import { PrismaClient } from "../../lib/generated/prisma/client";',
    );
  });

  test("discovered helper candidate is REUSED on re-run (no duplicate helper)", async () => {
    await seedProject(SATISFIED_PACKAGE_JSON);

    // First run at the custom location (explicit answer).
    await databaseGenerator.run(
      {
        provider: "sqlite",
        installPrismaSkills: false,
        helperPath: "src/lib/prisma.ts",
      },
      makeContext(),
    );
    expect(fsMockStore._files.has("src/lib/prisma.ts")).toBe(true);
    // lib/prisma.ts must NOT have been created too.
    expect(fsMockStore._files.has("lib/prisma.ts")).toBe(false);

    // Second run WITHOUT an explicit helperPath: the inspection discovers
    // src/lib/prisma.ts and planDatabase reuses it — still no lib/prisma.ts.
    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext(),
    );
    expect(fsMockStore._files.has("src/lib/prisma.ts")).toBe(true);
    expect(fsMockStore._files.has("lib/prisma.ts")).toBe(false);
  });

  test("absolute helper path is rejected with an explicit error", async () => {
    await seedProject();

    await expect(
      databaseGenerator.run(
        {
          provider: "sqlite",
          installPrismaSkills: false,
          helperPath: "/absolutely/not/here.ts",
        },
        makeContext(),
      ),
    ).rejects.toThrow(/Invalid helper path.*relative to the project root/i);
  });

  test("helper path colliding with a protected Prisma/DXG file is rejected", async () => {
    await seedProject();

    // prisma/seed.ts already carries .ts — normalization keeps it exact,
    // and it is a protected path (Prisma-owned).
    await expect(
      databaseGenerator.run(
        {
          provider: "sqlite",
          installPrismaSkills: false,
          helperPath: "prisma/seed.ts",
        },
        makeContext(),
      ),
    ).rejects.toThrow(/Invalid helper path.*collides/i);
  });

  test("backslashes and missing .ts are normalized (lib\\prisma → lib/prisma.ts)", async () => {
    await seedProject();

    await databaseGenerator.run(
      {
        provider: "sqlite",
        installPrismaSkills: false,
        helperPath: "src\\helpers\\db",
      },
      makeContext(),
    );

    const helper = fsMockStore._files.get("src/helpers/db.ts");
    expect(helper).toBeDefined();
    expect(helper).toContain(
      'import { PrismaClient } from "../../lib/generated/prisma/client";',
    );
  });
});

// ---------------------------------------------------------------------------
// Mode contracts (non-interactive, dry-run, --force) + staleness
// ---------------------------------------------------------------------------

describe("mode contracts and staleness", () => {
  test("non-interactive without helperPath → default lib/prisma.ts, no prompt", async () => {
    await seedProject();

    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext({ nonInteractive: true }),
    );

    expect(fsMockStore._files.has("lib/prisma.ts")).toBe(true);
    expect(fsMockStore._files.has("src/lib/prisma.ts")).toBe(false);
  });

  test("dry-run executes nothing and reports the plan", async () => {
    await seedProject();

    await databaseGenerator.run(
      {
        provider: "sqlite",
        installPrismaSkills: false,
        databaseScripts: "recommended",
      },
      makeContext({ dryRun: true }),
    );

    // Nothing executed: no install, no prisma command.
    expect((fs.executeCommand as Mock).mock.calls).toHaveLength(0);
    // Nothing written to disk.
    expect(fsMockStore._files.has("prisma/schema.prisma")).toBe(false);
    expect(fsMockStore._files.has("lib/prisma.ts")).toBe(false);
  });

  test("--force overwrites a conflicting helper file", async () => {
    await seedProject();
    fsMockStore._files.set("lib/prisma.ts", "// USER-OWNED content\n");

    // Without force: the conflict is reported, the user file is preserved.
    await databaseGenerator.run(
      {
        provider: "sqlite",
        installPrismaSkills: false,
        databaseScripts: "skip",
      },
      makeContext(),
    );
    expect(fsMockStore._files.get("lib/prisma.ts")).toBe(
      "// USER-OWNED content\n",
    );

    // With force: the DXG helper replaces it.
    await databaseGenerator.run(
      {
        provider: "sqlite",
        installPrismaSkills: false,
        databaseScripts: "skip",
      },
      makeContext({ force: true }),
    );
    const helper = fsMockStore._files.get("lib/prisma.ts")!;
    expect(helper).not.toBe("// USER-OWNED content\n");
    expect(helper).toContain(
      'import { PrismaClient } from "./generated/prisma/client";',
    );
  });

  test("schema changed between runs → generate re-runs and the client is refreshed (staleness)", async () => {
    await seedProject(SATISFIED_PACKAGE_JSON);

    // Run 1: full setup.
    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext(),
    );

    // The user adds a model to the schema between runs.
    const schema = fsMockStore._files.get("prisma/schema.prisma")!;
    fsMockStore._files.set(
      "prisma/schema.prisma",
      schema.replace("}", '  model Post { id Int @id }\n}'),
    );
    (fs.executeCommand as Mock).mockClear();

    // Run 2: generate MUST run again (always-generate contract).
    await databaseGenerator.run(
      { provider: "sqlite", installPrismaSkills: false },
      makeContext(),
    );

    const generateCalls = prismaCommandCalls().filter(
      (call: any[]) => call[1]?.[1] === "generate",
    );
    expect(generateCalls).toHaveLength(1);
    expect(
      prismaCommandCalls().filter((call: any[]) => call[1]?.[1] === "init"),
    ).toHaveLength(0);
  });
});
