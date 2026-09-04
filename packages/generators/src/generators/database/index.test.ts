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
import { getCliCommand } from "@antfu/ni";
import { createDependencyInstaller } from "../../install";

// Hoisted shared mock storage: the @dxgjs/fs mock factory needs it at
// hoisted time (vi.mock factories run before module scope), and the
// side-effecting executeCommand fake must reach the SAME store the fs
// seam serves — called as a bare imported function, it gets no `this`.
const fsMockStore = vi.hoisted(() => {
  return {
    _files: new Map<string, string>(),
    _directories: new Set<string>(),
  } as unknown as {
    _files: Map<string, string>;
    _directories: Set<string>;
  };
});

// The DEFAULT side-effecting subprocess fake, hoisted so the @dxgjs/fs
// factory can install it and beforeEach can REINSTALL it: vi.clearAllMocks
// resets call history but preserves custom implementations, so a scenario
// fake a test installs (e.g. the blocked-install one) would otherwise leak
// into every later test.
const defaultExecuteFake = vi.hoisted(() => {
  return async (command: string, args: string[]) => {
    const specs = args.filter(
      (a: string) =>
        !["install", "add", "-D"].includes(a) && !a.startsWith("-"),
    );
    if (
      command === "npm-mock" &&
      (args[0] === "install" || args[0] === "add")
    ) {
      const isDev = args.includes("-D");
      const section = isDev ? "devDependencies" : "dependencies";
      const pkg = JSON.parse(fsMockStore._files.get("package.json") ?? "{}");
      pkg[section] = {
        ...(pkg[section] ?? {}),
        ...Object.fromEntries(specs.map((s: string) => [s, "latest"])),
      };
      fsMockStore._files.set("package.json", JSON.stringify(pkg));
      // better-sqlite3's (approved) install script lands the binding —
      // the native artifact the verification probes. Spec-prefix match:
      // the plan pins "better-sqlite3@^12.6.0".
      if (specs.some((s: string) => s.startsWith("better-sqlite3"))) {
        fsMockStore._files.set(
          "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
          "<binary>",
        );
      }
      return { all: "added packages", stdout: "", stderr: "" };
    }
    if (command === "npx" && args[0] === "prisma@7" && args[1] === "init") {
      fsMockStore._files.set(
        "prisma/schema.prisma",
        'generator client {\n  provider = "prisma-client"\n}\ndatasource db {\n  provider = "sqlite"\n}',
      );
      fsMockStore._files.set(
        "prisma7.config.ts",
        'import { defineConfig } from "prisma/config";\nexport default defineConfig({\n  migrations: {\n    path: "prisma/migrations",\n  },\n});\n',
      );
      fsMockStore._files.set(".env", 'DATABASE_URL="file:./dev.db"\n');
      return { all: "prisma init ok", stdout: "", stderr: "" };
    }
    if (command === "npx" && args[0] === "prisma@7" && args[1] === "generate") {
      fsMockStore._files.set(
        "lib/generated/prisma/client.ts",
        "// generated prisma client\n",
      );
      fsMockStore._directories.add("lib/generated/prisma");
      return { all: "prisma generate ok", stdout: "", stderr: "" };
    }
    return { all: "", stdout: "", stderr: "" };
  };
});

// We need to mock the modules before importing the databaseGenerator
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
  const _mock = {
    ...actual,
    pathExists: vi.fn().mockImplementation(async (path: string) => {
      // Check if we have this file in our mock storage
      if (fsMockStore._files.has(path)) {
        return true;
      }
      // Check if we have this directory in our mock storage
      if (fsMockStore._directories.has(path)) {
        return true;
      }
      // Fall back to actual implementation for other paths
      return actual.pathExists(path);
    }),
    readFile: vi.fn().mockImplementation(async (path: string, options?: any) => {
      // Check if we have this file in our mock storage
      if (fsMockStore._files.has(path)) {
        return fsMockStore._files.get(path);
      }
      // Fall back to actual implementation for other paths
      return actual.readFile(path, options);
    }),
    writeFile: vi.fn().mockImplementation(async (
      path: string,
      data: string | Buffer,
      options?: any,
    ) => {
      // Store the file in our mock storage
      fsMockStore._files.set(path, data.toString());
      // Also ensure parent directories are tracked
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) {
        fsMockStore._directories.add(dir);
      }
      // Call actual writeFile (though in test env this might not do anything)
      return actual.writeFile(path, data, options);
    }),
    stat: vi.fn().mockImplementation(async (path: string) => {
      // Check if it's a file we have
      if (fsMockStore._files.has(path)) {
        return {
          isDirectory: () => false,
        };
      }
      // Check if it's a directory we have
      if (fsMockStore._directories.has(path)) {
        return {
          isDirectory: () => true,
        };
      }
      // Fall back to actual implementation
      return actual.stat(path);
    }),
    mkdir: vi.fn().mockImplementation(async (path: string, options?: any) => {
      // Track the directory as created
      fsMockStore._directories.add(path);
      // Also track parent directories
      const parentDir = path.split("/").slice(0, -1).join("/");
      if (parentDir) {
        fsMockStore._directories.add(parentDir);
      }
      // Call actual mkdir (though in test env this might not do anything)
      return actual.mkdir(path, options);
    }),
    // Storage-backed JSON seam (the approval writers and the scripts phase
    // go through readJson/writeJson — backing them by the SAME store as
    // the rest of the mock keeps one coherent project image; the real
    // implementations would write to disk while every other read comes
    // from the store, and the two would diverge mid-run).
    readJson: vi.fn().mockImplementation(async (path: string) => {
      const raw = fsMockStore._files.get(path);
      return raw ? JSON.parse(raw) : undefined;
    }),
    writeJson: vi.fn().mockImplementation(async (
      path: string,
      data: unknown,
    ) => {
      fsMockStore._files.set(path, JSON.stringify(data, null, 2));
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) {
        fsMockStore._directories.add(dir);
      }
      return actual.writeJson(path, data);
    }),
    // Fake side-effecting subprocess (hoisted defaultExecuteFake): installs
    // the default fake; scenario tests override it and beforeEach
    // reinstalls this default so implementations never leak between tests.
    executeCommand: vi.fn().mockImplementation(defaultExecuteFake),
  };
  return _mock;
});

vi.mock("@dxgjs/templates", async () => {
  const actual =
    await vi.importActual<typeof import("@dxgjs/templates")>(
      "@dxgjs/templates",
    );
  return {
    ...actual,
    // Delegate to the REAL renderer so tests exercise the exact production
    // semantics: unknown placeholders are left verbatim (never blanked out).
    render: vi.fn(actual.render),
  };
});

let triggerPrismaInitWorkaround = false;
let triggerPrismaGenerateWorkaround = false;

vi.mock("@antfu/ni", () => {
  return {
    parseNlx: vi.fn().mockReturnValue("npx"),
    parseNi: vi.fn().mockReturnValue("npm-mock"),
    getCliCommand: vi
      .fn()
      .mockImplementation((parseNiFn: any, args: string[], ctx: any) => {
        // Use the parameters to avoid TS6133
        parseNiFn;
        ctx;
        // Simulate the behavior of getCliCommand for an npm project.
        if (!args || args.length === 0) {
          return { command: "npm-mock", args: [] };
        }
        // For prisma init — keyed to the EXACT production argument shape
        // (executeDatabase calls getCliCommand(parseNlx, ["prisma@7",
        // "init", ...])). This branch MUST be evaluated before the
        // dependency-install branches, whose "-D"/"add" heuristics would
        // otherwise swallow the prisma args. Real @antfu/ni resolves this
        // command with a verbatim args passthrough (npx / pnpm dlx /
        // yarn dlx / bun x), so the mock must never transform or drop args
        // (especially --no-skills).
        if (args[0] === "prisma@7" && args[1] === "init") {
          // If we want to trigger the workaround, simulate legacy
          // @antfu/ni versions that mis-resolved the dlx command to
          // "<agent> add ..." — the production originalArgs workaround must
          // rewrite this to npx + the original args (still including
          // --no-skills).
          if (triggerPrismaInitWorkaround) {
            return {
              command: "some-agent",
              args: ["add", ...args],
            };
          }

          // Real ni behavior: verbatim passthrough after the executable.
          return { command: "npx", args: [...args] };
        }
        // prisma generate — same dlx passthrough semantics as init, and
        // equally BEFORE the install heuristics: ["prisma@7", "generate"]
        // carries no "-D", so the plain-specs branch below would otherwise
        // mis-resolve it into "npm-mock install prisma@7 generate".
        if (args[0] === "prisma@7" && args[1] === "generate") {
          if (triggerPrismaGenerateWorkaround) {
            return {
              command: "some-agent",
              args: ["add", ...args],
            };
          }
          return { command: "npx", args: [...args] };
        }
        // For dependency installation commands
        if (args.includes("-D") && !args.includes("add")) {
          return {
            command: "npm-mock",
            args: ["install", "-D", ...args.slice(1)],
          };
        }
        if (!args.includes("-D") && !args.includes("add")) {
          return { command: "npm-mock", args: ["install", ...args] };
        }
        return { command: "npm-mock", args: [...args] };
      }),
    executeCommand: vi.fn().mockResolvedValue(undefined),
  };
});

// Import the database generator and provider data for testing
let databaseGenerator: any;
let providerData: any;
let planDatabase: any;
let validateDatabase: any;

beforeAll(async () => {
  const indexModule = await import("./index");
  databaseGenerator = indexModule.default;
  providerData = indexModule.providerData;
  planDatabase = indexModule.planDatabase;
  validateDatabase = indexModule.validateDatabase;
});

// The @dxgjs/fs mock's storage is the hoisted fsMockStore (above). The fs
// import stays for the seam (context.fs) and the mock-call assertions.

/**
 * The installer seam as production builds it (prepareContext): a real
 * createDependencyInstaller bound to the npm agent and the mocked fs. The
 * generator flow under test then runs through the SAME seam users get —
 * its batches hit the faked executeCommand, its npm approval write hits
 * the in-memory store.
 */
function makeInstaller() {
  return createDependencyInstaller({ agent: "npm", fs: fs as any });
}

describe("Database Generator", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    // Create a temporary directory
    tempDir = path.join(
      os.tmpdir(),
      `dxg-db-test-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 15)}`,
    );
    // Ensure the directory exists
    fs.mkdirSync(tempDir, { recursive: true });
    // Change to the temporary directory
    process.chdir(tempDir);
    // Reset mock storage and call history between tests. The executeCommand
    // fake is REINSTALLED explicitly: vi.clearAllMocks() clears history but
    // PRESERVES custom implementations, so a scenario fake a test installed
    // (e.g. the blocked-install one) would otherwise leak into later tests.
    vi.clearAllMocks();
    (fs.executeCommand as unknown as Mock).mockImplementation(
      defaultExecuteFake as (...a: unknown[]) => unknown,
    );
    fsMockStore._files.clear();
    fsMockStore._directories.clear();
  });

  afterEach(() => {
    // Revert to original directory
    process.chdir(originalCwd);
    // Remove the temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("databaseGenerator should exist", () => {
    expect(databaseGenerator).toBeDefined();
    expect(databaseGenerator.name).toBe("database");
    expect(databaseGenerator.description).toBe(
      "Adds Prisma ORM with a selected database provider",
    );
    expect(Array.isArray(databaseGenerator.prompts)).toBe(true);
  });

  test("databaseGenerator should have correct prompts for all providers", () => {
    const prompts = databaseGenerator.prompts;

    // First prompt: provider
    expect(prompts[0].name).toBe("provider");
    expect(prompts[0].type).toBe("select");
    expect(prompts[0].message).toBe("Choose your database provider:");
    expect(prompts[0].default).toBe("sqlite");
    const choices = prompts[0].choices;
    expect(Array.isArray(choices)).toBe(true);
    expect(choices!.length).toBe(Object.values(providerData).length); // 7 providers

    // Check choices
    const choiceValues = choices!.map((c: { value: string }) => c.value);
    expect(choiceValues).toContain("sqlite");
    expect(choiceValues).toContain("postgresql");
    expect(choiceValues).toContain("mysql");
    expect(choiceValues).toContain("sqlserver");
    expect(choiceValues).toContain("cockroachdb");
    expect(choiceValues).toContain("planetscale");
    expect(choiceValues).toContain("prismapostgres");

    // Second prompt: the Prisma agent skills decision — owned by DXG
    // (a Clack confirm), so Prisma itself never asks this question.
    expect(prompts[1].name).toBe("installPrismaSkills");
    expect(prompts[1].type).toBe("confirm");
    expect(prompts[1].message).toBe("Install Prisma agent skills?");
    // Default is No: skills artifacts (.claude/skills/, .windsurf/skills/,
    // .agents/skills/, skills-lock.json) only land in the project when the
    // user explicitly opts in.
    expect(prompts[1].default).toBe(false);
  });

  test("databaseGenerator should validate correctly", () => {
    // Since validateDatabase always returns true, any answers should pass
    expect(typeof validateDatabase).toBe("function");
  });

  describe("planning", () => {
    test("should plan correctly for SQLite provider", async () => {
      const answers = { provider: "sqlite" };
      const plan = planDatabase(answers);

      expect(plan.provider).toBe("sqlite");
      expect(plan.providerName).toBe("SQLite");
      expect(plan.prismaProvider).toBe("sqlite");
      expect(plan.devPackages).toContain("prisma@7.10.0");
      expect(plan.devPackages).toContain("@types/node");
      expect(plan.devPackages).toContain("@types/better-sqlite3");
      expect(plan.regularPackages).toContain("@prisma/client@7.10.0");
      expect(plan.regularPackages).toContain("@prisma/adapter-better-sqlite3");
      expect(plan.regularPackages).toContain("dotenv");
      expect(plan.filesToCreate.length).toBe(1);
      expect(plan.filesToCreate[0].path).toBe("lib/prisma.ts");
      expect(plan.filesToCreate[0].templatePath).toContain(
        "prisma-client-lib-sqlite.tmpl",
      );
    });

    test("should plan correctly for PostgreSQL provider", async () => {
      const answers = { provider: "postgresql" };
      const plan = planDatabase(answers);

      expect(plan.provider).toBe("postgresql");
      expect(plan.providerName).toBe("PostgreSQL");
      expect(plan.prismaProvider).toBe("postgresql");
      expect(plan.devPackages).toContain("prisma@7.10.0");
      expect(plan.devPackages).toContain("@types/node");
      expect(plan.devPackages).toContain("@types/pg");
      expect(plan.regularPackages).toContain("@prisma/client@7.10.0");
      expect(plan.regularPackages).toContain("@prisma/adapter-pg");
      expect(plan.regularPackages).toContain("pg");
      expect(plan.regularPackages).toContain("dotenv");
      expect(plan.filesToCreate.length).toBe(1);
      expect(plan.filesToCreate[0].path).toBe("lib/prisma.ts");
      expect(plan.filesToCreate[0].templatePath).toContain(
        "prisma-client-lib.tmpl",
      );
    });

    test("should plan correctly for MySQL provider", async () => {
      const answers = { provider: "mysql" };
      const plan = planDatabase(answers);

      expect(plan.provider).toBe("mysql");
      expect(plan.providerName).toBe("MySQL");
      expect(plan.prismaProvider).toBe("mysql");
      expect(plan.devPackages).toContain("prisma@7.10.0");
      expect(plan.devPackages).toContain("@types/node");
      expect(plan.regularPackages).toContain("@prisma/client@7.10.0");
      expect(plan.regularPackages).toContain("@prisma/adapter-mariadb");
      expect(plan.regularPackages).toContain("dotenv");
      expect(plan.filesToCreate.length).toBe(1);
      expect(plan.filesToCreate[0].path).toBe("lib/prisma.ts");
      expect(plan.filesToCreate[0].templatePath).toContain(
        "prisma-client-lib-mysql.tmpl",
      );
    });

    test("should plan correctly for SQL Server provider", async () => {
      const answers = { provider: "sqlserver" };
      const plan = planDatabase(answers);

      expect(plan.provider).toBe("sqlserver");
      expect(plan.providerName).toBe("SQL Server");
      expect(plan.prismaProvider).toBe("sqlserver");
      expect(plan.devPackages).toContain("prisma@7.10.0");
      expect(plan.devPackages).toContain("@types/node");
      expect(plan.devPackages).toContain("@types/mssql");
      expect(plan.regularPackages).toContain("@prisma/client@7.10.0");
      expect(plan.regularPackages).toContain("@prisma/adapter-mssql");
      expect(plan.regularPackages).toContain("dotenv");
      expect(plan.filesToCreate.length).toBe(1);
      expect(plan.filesToCreate[0].path).toBe("lib/prisma.ts");
      expect(plan.filesToCreate[0].templatePath).toContain(
        "prisma-client-lib-sqlserver.tmpl",
      );
    });

    test("should plan correctly for CockroachDB provider", async () => {
      const answers = { provider: "cockroachdb" };
      const plan = planDatabase(answers);

      expect(plan.provider).toBe("cockroachdb");
      expect(plan.providerName).toBe("CockroachDB");
      expect(plan.prismaProvider).toBe("cockroachdb");
      expect(plan.devPackages).toContain("prisma@7.10.0");
      expect(plan.devPackages).toContain("@types/node");
      expect(plan.devPackages).toContain("@types/pg");
      expect(plan.regularPackages).toContain("@prisma/client@7.10.0");
      expect(plan.regularPackages).toContain("@prisma/adapter-pg");
      expect(plan.regularPackages).toContain("pg");
      expect(plan.regularPackages).toContain("dotenv");
      expect(plan.filesToCreate.length).toBe(1);
      expect(plan.filesToCreate[0].path).toBe("lib/prisma.ts");
      expect(plan.filesToCreate[0].templatePath).toContain(
        "prisma-client-lib.tmpl",
      );
    });

    test("should plan correctly for PlanetScale provider", async () => {
      const answers = { provider: "planetscale" };
      const plan = planDatabase(answers);

      expect(plan.provider).toBe("planetscale");
      expect(plan.providerName).toBe("PlanetScale (MySQL)");
      expect(plan.prismaProvider).toBe("mysql");
      expect(plan.devPackages).toContain("prisma@7.10.0");
      expect(plan.devPackages).toContain("@types/node");
      expect(plan.regularPackages).toContain("@prisma/client@7.10.0");
      expect(plan.regularPackages).toContain("@prisma/adapter-planetscale");
      expect(plan.regularPackages).toContain("undici");
      expect(plan.regularPackages).toContain("dotenv");
      expect(plan.filesToCreate.length).toBe(1);
      expect(plan.filesToCreate[0].path).toBe("lib/prisma.ts");
      expect(plan.filesToCreate[0].templatePath).toContain(
        "prisma-client-lib-planetscale.tmpl",
      );
    });

    test("should plan correctly for Prisma Postgres provider", async () => {
      const answers = { provider: "prismapostgres" };
      const plan = planDatabase(answers);

      expect(plan.provider).toBe("prismapostgres");
      expect(plan.providerName).toBe("Prisma Postgres");
      expect(plan.prismaProvider).toBe("postgresql");
      expect(plan.devPackages).toContain("prisma@7.10.0");
      expect(plan.devPackages).toContain("@types/node");
      expect(plan.devPackages).toContain("@types/pg");
      expect(plan.regularPackages).toContain("@prisma/client@7.10.0");
      expect(plan.regularPackages).toContain("@prisma/adapter-pg");
      expect(plan.regularPackages).toContain("pg");
      expect(plan.regularPackages).toContain("dotenv");
      expect(plan.filesToCreate.length).toBe(1);
      expect(plan.filesToCreate[0].path).toBe("lib/prisma.ts");
      expect(plan.filesToCreate[0].templatePath).toContain(
        "prisma-client-lib.tmpl",
      );
    });
  });

  describe("template rendering (Prisma v7 correctness)", () => {
    // Provider-correct adapter construction snippets, taken verbatim from the
    // official Prisma v7 "Add to existing project" reference (lib/prisma.ts).
    const expectedAdapterSnippets: Record<string, string[]> = {
      sqlite: ["new PrismaBetterSqlite3({ url: connectionString })"],
      postgresql: ["new PrismaPg({ connectionString })"],
      cockroachdb: ["new PrismaPg({ connectionString })"],
      prismapostgres: ["new PrismaPg({ connectionString })"],
      mysql: [
        "new PrismaMariaDb({",
        "host: process.env.DATABASE_HOST,",
        "connectionLimit: 5,",
      ],
      sqlserver: ["new PrismaMssql(sqlConfig)"],
      planetscale: [
        "new PrismaPlanetScale({ url: process.env.DATABASE_URL, fetch: undiciFetch })",
      ],
    };

    for (const providerKey of Object.keys(expectedAdapterSnippets)) {
      test(`renders raw-template-free, provider-correct lib/prisma.ts for ${providerKey}`, async () => {
        // Guard: every registered provider must be covered by this audit.
        expect(Object.keys(providerData).sort()).toEqual(
          Object.keys(expectedAdapterSnippets).sort(),
        );

        const plan = planDatabase({ provider: providerKey });
        const file = plan.filesToCreate[0];
        const template = (await fs.readFile(file.templatePath, {
          encoding: "utf8",
        })) as string;

        // Real @dxgjs/templates semantics (the mocked module delegates to it).
        const rendered = realRender(template, file.data);

        // 1. No unresolved template syntax may survive rendering.
        expect(rendered).not.toMatch(/\{\{[^}]*\}\}/);

        // 2. PrismaClient must be imported from DXG's generated client output
        // (prisma init --output ../lib/generated/prisma resolves relative to
        // prisma/schema.prisma, i.e. <project>/lib/generated/prisma).
        expect(rendered).toContain(
          'import { PrismaClient } from "./generated/prisma/client";',
        );

        // 3. Provider-correct adapter instantiation per the Prisma v7 reference.
        for (const snippet of expectedAdapterSnippets[providerKey]) {
          expect(rendered).toContain(snippet);
        }

        // 4. Connection info must be read at RUNTIME from the generated
        // project's own environment, never baked in at generation time.
        expect(rendered).toMatch(/process\.env\./);
        expect(rendered).not.toContain("`undefined`");
      });
    }
  });

  describe("execution", () => {
    test("should execute successfully with CLI answers for SQLite", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as Logger;

      const templatesMock = {
        // Real renderer semantics (delegates to @dxgjs/templates render):
        // unresolved placeholders must stay visible, never be blanked out.
        render: vi.fn(realRender),
      };

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: templatesMock,
        installer: makeInstaller(),
        awareness: {
          projectRoot: '.',
          workspaceRoot: '.',
          framework: {
            name: 'unknown',
            detected: false
          },
          language: {
            name: 'javascript',
            detected: true
          },
          packageManager: 'npm',
          styling: {
            name: 'none',
            detected: false,
            version: null,
            configFile: null
          },
          capabilities: {
            hasTests: false,
            hasLinting: false,
            hasFormatter: false,
            hasCI: false,
            hasDocker: false
          },
          packageJson: {
            name: 'test-project',
            version: '1.0.0',
            private: true
          }
        },
        dryRun: false,
        force: false,
      };

      const answers = {
        provider: "sqlite",
      };

      await expect(
        databaseGenerator.run(answers, context),
      ).resolves.not.toThrow();

      // Verify that fs.pathExists was called for package.json
      expect(fs.pathExists).toHaveBeenCalledWith("package.json");

      // Verify that fs.readFile was called for package.json and the lib/prisma.ts template
      expect(fs.readFile).toHaveBeenCalledWith("package.json", {
        encoding: "utf8",
      });
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining("prisma-client-lib-sqlite.tmpl"),
        { encoding: "utf8" },
      );

      // Verify that fs.writeFile was called for the lib/prisma.ts file (DXG-owned)
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("lib/prisma.ts"),
        expect.any(String),
        "utf8",
      );

      // Verify that getCliCommand was called for dependency installation
      expect(getCliCommand).toHaveBeenCalled();

      // Verify that executeCommand was called for: dev dependencies install,
      // regular dependencies install, prisma init, and prisma generate —
      // 4 commands total through the installer seam + Prisma steps.
      expect(fs.executeCommand).toHaveBeenCalledTimes(4);

      // The summary is fully Clack-native: the generator flow must not emit
      // logger output into the interactive UX (no logger.debug from summary).
      expect(mockLogger.debug).not.toHaveBeenCalled();
    });

    test("should NOT render schema.prisma template (Prisma-owned)", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as Logger;

      const templatesMock = {
        // Real renderer semantics (delegates to @dxgjs/templates render).
        render: vi.fn(realRender),
      };

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: templatesMock,
        installer: makeInstaller(),
        awareness: {
          projectRoot: '.',
          workspaceRoot: '.',
          framework: { name: 'unknown', detected: false },
          language: { name: 'javascript', detected: true },
          packageManager: 'npm',
          styling: { name: 'none', detected: false, version: null, configFile: null },
          capabilities: {
            hasTests: false,
            hasLinting: false,
            hasFormatter: false,
            hasCI: false,
            hasDocker: false
          },
          packageJson: {
            name: 'test-project',
            version: '1.0.0',
            private: true
          }
        },
        dryRun: false,
        force: false,
      };

      const answers = {
        provider: "sqlite",
      };

      await databaseGenerator.run(answers, context);

      // Verify that fs.readFile was NOT called for a schema.prisma.tmpl template
      // (since we removed it and Prisma owns it now)
      const schemaTemplateCalls = (fs.readFile as any).mock.calls.filter(
        (call: any[]) =>
          call[0] &&
          typeof call[0] === "string" &&
          call[0].includes("schema.prisma.tmpl"),
      );
      expect(schemaTemplateCalls.length).toBe(0);
    });

    test("should trigger workaround for @antfu/ni issue and still pass --no-skills to prisma init", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as Logger;

      const templatesMock = {
        render: vi.fn(realRender),
      };

      // Set the flag to trigger the workaround
      triggerPrismaInitWorkaround = true;

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: templatesMock,
        installer: makeInstaller(),
        awareness: {
          projectRoot: '.',
          workspaceRoot: '.',
          framework: { name: 'unknown', detected: false },
          language: { name: 'javascript', detected: true },
          packageManager: 'npm',
          styling: { name: 'none', detected: false, version: null, configFile: null },
          capabilities: {
            hasTests: false,
            hasLinting: false,
            hasFormatter: false,
            hasCI: false,
            hasDocker: false
          },
          packageJson: {
            name: 'test-project',
            version: '1.0.0',
            private: true
          }
        },
        dryRun: false,
        force: false,
        nonInteractive: false,
      };

      const answers = {
        provider: "sqlite",
      };

      await databaseGenerator.run(answers, context);

      // Reset the flag
      triggerPrismaInitWorkaround = false;

      // Expect that the workaround was triggered: command should be "npx" and args should be the original args
      // (which include --no-skills)
      expect(fs.executeCommand).toHaveBeenCalledTimes(4); // deps, deps, prisma init, prisma generate
      // The third call to executeCommand is the prisma init invocation
      const prismaInitCall = (fs.executeCommand as Mock).mock.calls[2];
      expect(prismaInitCall[0]).toBe("npx");
      expect(prismaInitCall[1]).toEqual([
        "prisma@7",
        "init",
        "--datasource-provider",
        "sqlite",
        "--no-skills",
        "--output",
        "../lib/generated/prisma"
      ]);
    });

    test("install failure surfaces the normalized reason and the manager's own remediation", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      // Simulate pnpm's hard policy error on the FIRST install batch: the
      // tree installs, the build scripts are skipped, exit 1.
      (fs.executeCommand as Mock).mockRejectedValueOnce({
        exitCode: 1,
        all: "ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: @prisma/engines@7.10.0, prisma@7.10.0.",
        message: "Command failed with exit code 1",
      });

      const context = {
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as Logger,
        fs,
        templates: { render: vi.fn(realRender) },
        installer: makeInstaller(),
        awareness: {
          projectRoot: '.',
          workspaceRoot: '.',
          framework: { name: 'unknown', detected: false },
          language: { name: 'javascript', detected: true },
          packageManager: 'pnpm',
          styling: { name: 'none', detected: false, version: null, configFile: null },
          capabilities: { hasTests: false, hasLinting: false, hasFormatter: false, hasCI: false, hasDocker: false },
          packageJson: { name: 'test-project', version: '1.0.0', private: true },
        },
        dryRun: false,
        force: false,
        nonInteractive: true,
      };

      // The generator wraps the normalized failure: reason + output tail +
      // the manager's remediation hint, as ONE error the CLI formatter
      // renders. No silent swallowing, no raw stack dump.
      await expect(
        databaseGenerator.run({ provider: "sqlite" }, context),
      ).rejects.toThrow(/Failed to install dependencies \(build-script-blocked\)/);
      // The install aborted before Prisma steps: init never ran.
      const calls = (fs.executeCommand as Mock).mock.calls;
      expect(
        calls.some((c: unknown[]) => Array.isArray(c[1]) && c[1][0] === "prisma@7"),
      ).toBe(false);
    });

    test("silently blocked builds on a successful install surface as a Clack note, then verification catches the missing binding", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      // npm exits 0 but warns: better-sqlite3's script was skipped — the
      // silent-drift hazard this pipeline exists to catch. The default fake
      // is overridden so NO binding lands on disk (the script was blocked),
      // while prisma init/generate still produce their artifacts.
      (fs.executeCommand as Mock).mockImplementation(
        async (command: string, args: string[]) => {
          if (command === "npm-mock" && args[0] === "install") {
            const isDev = args.includes("-D");
            if (isDev) {
              return { all: "added packages", stdout: "", stderr: "" };
            }
            return {
              all: [
                "added 22 packages",
                "npm warn install-scripts 2 packages had install scripts blocked",
                "npm warn install-scripts   better-sqlite3@12.6.0 (install: prebuild-install || node-gyp rebuild)",
              ].join("\n"),
              stdout: "",
              stderr: "",
            };
          }
          if (command === "npx" && args[1] === "init") {
            fsMockStore._files.set("prisma/schema.prisma", "schema");
            fsMockStore._files.set("prisma7.config.ts", "config");
            fsMockStore._files.set(".env", "DATABASE_URL=x");
            return { all: "init ok", stdout: "", stderr: "" };
          }
          if (command === "npx" && args[1] === "generate") {
            fsMockStore._files.set("lib/generated/prisma/client.ts", "// client");
            fsMockStore._directories.add("lib/generated/prisma");
            return { all: "generate ok", stdout: "", stderr: "" };
          }
          return { all: "", stdout: "", stderr: "" };
        },
      );

      const context = {
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as Logger,
        fs,
        templates: { render: vi.fn(realRender) },
        installer: makeInstaller(),
        awareness: {
          projectRoot: '.',
          workspaceRoot: '.',
          framework: { name: 'unknown', detected: false },
          language: { name: 'javascript', detected: true },
          packageManager: 'npm',
          styling: { name: 'none', detected: false, version: null, configFile: null },
          capabilities: { hasTests: false, hasLinting: false, hasFormatter: false, hasCI: false, hasDocker: false },
          packageJson: { name: 'test-project', version: '1.0.0', private: true },
        },
        dryRun: false,
        force: false,
      };

      // Two layers catch the hazard in order: the install surfaces the
      // blocked build as a Clack note (exit-0 scan)…
      const runPromise = databaseGenerator.run({ provider: "sqlite" }, context);
      // …and the run ultimately FAILS: verification detects the missing
      // native binding — "exit 0" never masquerades as "operational".
      await expect(runPromise).rejects.toThrow(
        /better-sqlite3 native binding is missing/,
      );

      const blockedNote = (noteMock as Mock).mock.calls.find(
        (call: unknown[]) => String(call[1]).includes("Install scripts blocked"),
      );
      expect(blockedNote).toBeDefined();
      expect(String(blockedNote![0])).toContain("better-sqlite3");
      // The remediation message carries the per-manager commands.
      const verifyError = await runPromise.catch((e: Error) => e);
      expect(verifyError.message).toContain("pnpm approve-builds");
    });

    test("prisma generate mis-resolved as 'add' falls back to npx with the original args", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });
      // The generate resolution returns "<agent> add prisma@7 generate" —
      // the production guard must rewrite it to npx + ["prisma@7",
      // "generate"].
      triggerPrismaGenerateWorkaround = true;

      const context = {
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as Logger,
        fs,
        templates: { render: vi.fn(realRender) },
        installer: makeInstaller(),
        awareness: {
          projectRoot: '.',
          workspaceRoot: '.',
          framework: { name: 'unknown', detected: false },
          language: { name: 'javascript', detected: true },
          packageManager: 'npm',
          styling: { name: 'none', detected: false, version: null, configFile: null },
          capabilities: { hasTests: false, hasLinting: false, hasFormatter: false, hasCI: false, hasDocker: false },
          packageJson: { name: 'test-project', version: '1.0.0', private: true },
        },
        dryRun: false,
        force: false,
        nonInteractive: true,
      };

      try {
        await databaseGenerator.run({ provider: "postgresql" }, context);

        // The generate call must have been rewritten to npx + original args.
        const calls = (fs.executeCommand as Mock).mock.calls;
        const generateCall = calls.find(
          (c: unknown[]) =>
            Array.isArray(c[1]) && c[1][0] === "prisma@7" && c[1][1] === "generate",
        );
        expect(generateCall).toBeDefined();
        expect(generateCall![0]).toBe("npx");
        expect(generateCall![1]).toEqual(["prisma@7", "generate"]);
      } finally {
        triggerPrismaGenerateWorkaround = false;
      }
    });

    test("the plan's approval-only @prisma/engines entry is pre-approved but never installed", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });
      vi.clearAllMocks();

      const context = {
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } as unknown as Logger,
        fs,
        templates: { render: vi.fn(realRender) },
        installer: makeInstaller(),
        awareness: {
          projectRoot: '.',
          workspaceRoot: '.',
          framework: { name: 'unknown', detected: false },
          language: { name: 'javascript', detected: true },
          packageManager: 'npm',
          styling: { name: 'none', detected: false, version: null, configFile: null },
          capabilities: { hasTests: false, hasLinting: false, hasFormatter: false, hasCI: false, hasDocker: false },
          packageJson: { name: 'test-project', version: '1.0.0', private: true },
        },
        dryRun: false,
        force: false,
      };

      await databaseGenerator.run({ provider: "sqlite" }, context);

      // Installed specs never contain the bare transitive name…
      const calls = (fs.executeCommand as Mock).mock.calls;
      const installCalls = calls.filter(
        (c: unknown[]) =>
          c[0] === "npm-mock" && (c[1] as string[])[0] === "install",
      );
      expect(installCalls.length).toBe(2);
      const allSpecs = installCalls.flatMap((c: unknown[]) => c[1] as string[]);
      expect(allSpecs).not.toContain("@prisma/engines");
      // …but its npm approval WAS pre-written (allowScripts in package.json).
      // The npm approval writer goes through readJson/writeJson — real fs
      // functions in this mock (only the storage-backed methods are faked)
      // — so the written manifest lives on disk in the temp dir, not in the
      // mock store.
      const pkg = JSON.parse(
        String(await fs.readFile("package.json", { encoding: "utf8" })),
      );
      expect(pkg.allowScripts).toMatchObject({
        prisma: true,
        "better-sqlite3": true,
        "@prisma/engines": true,
      });
    });
  });

  describe("Prisma agent skills decision (DXG-owned)", () => {
    const baseContext = (overrides: Record<string, unknown> = {}) => ({
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
      // The seam prepareContext builds in production; tests bind it to the
      // npm agent + the mocked fs (see makeInstaller).
      installer: makeInstaller(),
      awareness: {
        projectRoot: ".",
        workspaceRoot: ".",
        framework: { name: "unknown", detected: false },
        language: { name: "javascript", detected: true },
        packageManager: "npm",
        styling: {
          name: "none",
          detected: false,
          version: null,
          configFile: null,
        },
        capabilities: {
          hasTests: false,
          hasLinting: false,
          hasFormatter: false,
          hasCI: false,
          hasDocker: false,
        },
        packageJson: { name: "test-project", version: "1.0.0", private: true },
      },
      dryRun: false,
      force: false,
      ...overrides,
    });

    /**
     * The second-to-last executeCommand call is the prisma init invocation:
     * the flow now runs install (dev), install (deps), prisma init, prisma
     * generate — init is 3rd of 4, generate last.
     */
    function getPrismaInitArgs(): string[] {
      const calls = (fs.executeCommand as Mock).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(4);
      return calls[calls.length - 2][1] as string[];
    }

    test("user selects No → prisma init receives --no-skills", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      await databaseGenerator.run(
        { provider: "sqlite", installPrismaSkills: false },
        baseContext(),
      );

      // Exact contract: --no-skills sits between the provider and --output.
      expect(getPrismaInitArgs()).toEqual([
        "prisma@7",
        "init",
        "--datasource-provider",
        "sqlite",
        "--no-skills",
        "--output",
        "../lib/generated/prisma",
      ]);
    });

    test("user selects Yes → invoked without --no-skills and never interactive", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      await databaseGenerator.run(
        { provider: "sqlite", installPrismaSkills: true },
        baseContext(),
      );

      // prisma@7.10.0 installs agent skills UNCONDITIONALLY and
      // non-interactively when --no-skills is omitted (verified in the CLI
      // source: no prompt/TTY check on that path) — so Prisma can never ask
      // the question DXG already asked.
      expect(getPrismaInitArgs()).toEqual([
        "prisma@7",
        "init",
        "--datasource-provider",
        "sqlite",
        "--output",
        "../lib/generated/prisma",
      ]);
    });

    test("defaults to No (non-interactive) without asking Prisma", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      await databaseGenerator.run(
        { provider: "sqlite" },
        baseContext({ nonInteractive: true }),
      );

      // DXG did not ask, and Prisma must not be left to ask either: the
      // explicit --no-skills contract applies.
      expect(promptMock).not.toHaveBeenCalled();
      expect(getPrismaInitArgs()).toContain("--no-skills");
    });

    test("dry-run plans the chosen contract and never executes", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      await databaseGenerator.run(
        { provider: "sqlite", installPrismaSkills: false },
        baseContext({ dryRun: true }),
      );

      // Semantic dry-run UX: everything the run WOULD do is collected and
      // rendered in ONE coherent Operation Summary note — no note-by-note
      // narration of individual steps.
      const noteCalls = (noteMock as Mock).mock.calls;
      expect(noteCalls.length).toBe(1);
      const summary = String(noteCalls[0][0]);
      expect(summary).toContain("--no-skills");
      expect(fs.executeCommand).not.toHaveBeenCalled();

      (noteMock as Mock).mockClear();

      await databaseGenerator.run(
        { provider: "sqlite", installPrismaSkills: true },
        baseContext({ dryRun: true }),
      );
      const noteCallsYes = (noteMock as Mock).mock.calls;
      expect(noteCallsYes.length).toBe(1);
      const summaryYes = String(noteCallsYes[0][0]);
      expect(summaryYes).toContain("--datasource-provider sqlite");
      expect(summaryYes).not.toContain("--no-skills");
      expect(fs.executeCommand).not.toHaveBeenCalled();
    });

    test("PlanetScale keeps the mysql mapping regardless of the skills choice", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      await databaseGenerator.run(
        { provider: "planetscale", installPrismaSkills: true },
        baseContext(),
      );
      let args = getPrismaInitArgs();
      expect(args[args.indexOf("--datasource-provider") + 1]).toBe("mysql");
      expect(args).not.toContain("--no-skills");

      await databaseGenerator.run(
        { provider: "planetscale", installPrismaSkills: false },
        baseContext(),
      );
      args = getPrismaInitArgs();
      expect(args[args.indexOf("--datasource-provider") + 1]).toBe("mysql");
      expect(args).toContain("--no-skills");
    });

    test("asks the DXG skills question right after the provider selection", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });
      (promptMock as unknown as Mock).mockResolvedValue({
        provider: "postgresql",
        installPrismaSkills: false,
        databaseScripts: "recommended",
      });

      await databaseGenerator.run({}, baseContext());

      const questions = (promptMock as unknown as Mock).mock.calls[0][0] as Array<{
        name: string;
        type: string;
        message: string;
        default?: unknown;
      }>;
      expect(questions.map((q) => q.name)).toEqual([
        "provider",
        "installPrismaSkills",
        "databaseScripts",
      ]);
      expect(questions[1].type).toBe("confirm");
      expect(questions[1].message).toBe("Install Prisma agent skills?");
      expect(questions[1].default).toBe(false);
      // The database scripts phase question follows the skills question.
      expect(questions[2].type).toBe("select");
      expect(questions[2].default).toBe("recommended");

      // The "No" answer flows through to the Prisma arguments.
      expect(getPrismaInitArgs()).toContain("--no-skills");
    });

    test("asks only the skills question when the provider comes from the CLI", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });
      (promptMock as unknown as Mock).mockResolvedValue({
        installPrismaSkills: true,
        databaseScripts: "recommended",
      });

      await databaseGenerator.run({ provider: "sqlite" }, baseContext());

      const questions = (promptMock as unknown as Mock).mock.calls[0][0] as Array<{
        name: string;
      }>;
      expect(questions.map((q) => q.name)).toEqual([
        "installPrismaSkills",
        "databaseScripts",
      ]);

      // "Yes" → no --no-skills flag (Prisma installs skills non-interactively).
      expect(getPrismaInitArgs()).not.toContain("--no-skills");
    });
  });

  describe("dry-run mode", () => {
    test("should handle dry-run mode correctly", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });
      // Clear mock call history to not count the setup call
      vi.clearAllMocks();

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as Logger;

      const templatesMock = {
        // Real renderer semantics (delegates to @dxgjs/templates render).
        render: vi.fn(realRender),
      };

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: templatesMock,
        awareness: {
          projectRoot: '.',
          workspaceRoot: '.',
          framework: {
            name: 'unknown',
            detected: false
          },
          language: {
            name: 'javascript',
            detected: true
          },
          packageManager: 'npm',
          styling: {
            name: 'none',
            detected: false,
            version: null,
            configFile: null
          },
          capabilities: {
            hasTests: false,
            hasLinting: false,
            hasFormatter: false,
            hasCI: false,
            hasDocker: false
          },
          packageJson: {
            name: 'test-project',
            version: '1.0.0',
            private: true
          }
        },
        dryRun: true, // Dry run mode
        force: false,
      };

      const answers = {
        provider: "sqlite",
      };

      await expect(
        databaseGenerator.run(answers, context),
      ).resolves.not.toThrow();

      // In dry-run mode, fs.writeFile should NOT be called for any files
      expect(fs.writeFile).not.toHaveBeenCalled();

      // But pathExists should still be called to check for package.json
      expect(fs.pathExists).toHaveBeenCalledWith("package.json");

      // And readFile should be called for package.json and template
      expect(fs.readFile).toHaveBeenCalledWith("package.json", {
        encoding: "utf8",
      });
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining("prisma-client-lib-sqlite.tmpl"),
        { encoding: "utf8" },
      );

      // Verify that executeCommand was NOT called for prisma init or prisma generate
      expect(fs.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe("non-interactive mode", () => {
    test("should fail in non-interactive mode when provider is missing", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as Logger;

      const templatesMock = {
        // Real renderer semantics (delegates to @dxgjs/templates render).
        render: vi.fn(realRender),
      };

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: templatesMock,
        awareness: {
          projectRoot: '.',
          workspaceRoot: '.',
          framework: undefined,
          language: undefined,
          packageManager: 'npm',
          styling: undefined,
          capabilities: {},
          packageJson: {}
        },
        dryRun: true, // Dry run to avoid prompts
        force: false,
      };

      const answers = {}; // No provider specified

      await expect(databaseGenerator.run(answers, context)).rejects.toThrow(
        "Missing required values in non-interactive mode: provider",
      );
    });
  });
});
