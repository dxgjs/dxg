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
    _files: new Map<string, string>(),
    _directories: new Set<string>(),
    pathExists: vi.fn().mockImplementation(async function (
      this: any,
      path: string,
    ) {
      // Check if we have this file in our mock storage
      if (this._files.has(path)) {
        return true;
      }
      // Check if we have this directory in our mock storage
      if (this._directories.has(path)) {
        return true;
      }
      // Fall back to actual implementation for other paths
      return actual.pathExists(path);
    }),
    readFile: vi.fn().mockImplementation(async function (
      this: any,
      path: string,
      options?: any,
    ) {
      // Check if we have this file in our mock storage
      if (this._files.has(path)) {
        return this._files.get(path);
      }
      // Fall back to actual implementation for other paths
      return actual.readFile(path, options);
    }),
    writeFile: vi.fn().mockImplementation(async function (
      this: any,
      path: string,
      data: string | Buffer,
      options?: any,
    ) {
      // Store the file in our mock storage
      this._files.set(path, data.toString());
      // Also ensure parent directories are tracked
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) {
        this._directories.add(dir);
      }
      // Call actual writeFile (though in test env this might not do anything)
      return actual.writeFile(path, data, options);
    }),
    stat: vi.fn().mockImplementation(async function (this: any, path: string) {
      // Check if it's a file we have
      if (this._files.has(path)) {
        return {
          isDirectory: () => false,
        };
      }
      // Check if it's a directory we have
      if (this._directories.has(path)) {
        return {
          isDirectory: () => true,
        };
      }
      // Fall back to actual implementation
      return actual.stat(path);
    }),
    mkdir: vi.fn().mockImplementation(async function (
      this: any,
      path: string,
      options?: any,
    ) {
      // Track the directory as created
      this._directories.add(path);
      // Also track parent directories
      const parentDir = path.split("/").slice(0, -1).join("/");
      if (parentDir) {
        this._directories.add(parentDir);
      }
      // Call actual mkdir (though in test env this might not do anything)
      return actual.mkdir(path, options);
    }),
    executeCommand: vi.fn().mockResolvedValue(undefined),
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

vi.mock("@antfu/ni", () => {
  return {
    parseNlx: vi.fn().mockReturnValue("npx"),
    parseNi: vi.fn().mockReturnValue("npm"),
    getCliCommand: vi
      .fn()
      .mockImplementation((parseNiFn: any, args: string[], ctx: any) => {
        // Use the parameters to avoid TS6133
        parseNiFn;
        ctx;
        // Simulate the behavior of getCliCommand for npm project
        if (!args || args.length === 0) {
          return { command: "npm", args: [] };
        }
        // For prisma init command — keyed to the EXACT production argument
        // shape (executeDatabase calls getCliCommand(parseNlx,
        // ["prisma@7", "init", ...])). This branch MUST be evaluated before
        // the dependency-install branches, whose "-D"/"add" heuristics would
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
        // For dependency installation commands
        if (args.includes("-D") && !args.includes("add")) {
          return { command: "npm", args: ["install", "-D", ...args] };
        }
        if (!args.includes("-D") && !args.includes("add")) {
          return { command: "npm", args: ["install", ...args] };
        }
        // For prisma generate command
        if (
          args.includes("dlx") &&
          args.includes("prisma") &&
          args.includes("generate")
        ) {
          return { command: "npx", args: ["prisma", "generate"] };
        }
        return { command: "npm", args: [...args] };
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

// Direct access to the @dxgjs/fs mock storage (see the vi.mock factory above)
const fsMockStore = fs as unknown as {
  _files: Map<string, string>;
  _directories: Set<string>;
};

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
    // Reset mock storage and call history between tests
    vi.clearAllMocks();
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
      // regular dependencies install, and prisma init. (prisma generate is no
      // longer part of the generator flow, so 3 commands total.)
      expect(fs.executeCommand).toHaveBeenCalledTimes(3);

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
      expect(fs.executeCommand).toHaveBeenCalledTimes(3); // deps, deps, prisma init
      // The last call to executeCommand should be for prisma init
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

    /** The last executeCommand call is the prisma init invocation. */
    function getPrismaInitArgs(): string[] {
      const calls = (fs.executeCommand as Mock).mock.calls;
      return calls[calls.length - 1][1] as string[];
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
      const noNote = (noteMock as Mock).mock.calls.find((call) =>
        String(call[0]).includes("Would run: prisma"),
      );
      expect(String(noNote?.[0])).toContain("--no-skills");
      expect(fs.executeCommand).not.toHaveBeenCalled();

      (noteMock as Mock).mockClear();

      await databaseGenerator.run(
        { provider: "sqlite", installPrismaSkills: true },
        baseContext({ dryRun: true }),
      );
      const yesNote = (noteMock as Mock).mock.calls.find((call) =>
        String(call[0]).includes("Would run: prisma"),
      );
      expect(String(yesNote?.[0])).toContain("--datasource-provider sqlite");
      expect(String(yesNote?.[0])).not.toContain("--no-skills");
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
      ]);
      expect(questions[1].type).toBe("confirm");
      expect(questions[1].message).toBe("Install Prisma agent skills?");
      expect(questions[1].default).toBe(false);

      // The "No" answer flows through to the Prisma arguments.
      expect(getPrismaInitArgs()).toContain("--no-skills");
    });

    test("asks only the skills question when the provider comes from the CLI", async () => {
      await fs.writeFile("package.json", '{"devDependencies":{}}', {
        encoding: "utf8",
      });
      (promptMock as unknown as Mock).mockResolvedValue({
        installPrismaSkills: true,
      });

      await databaseGenerator.run({ provider: "sqlite" }, baseContext());

      const questions = (promptMock as unknown as Mock).mock.calls[0][0] as Array<{
        name: string;
      }>;
      expect(questions.map((q) => q.name)).toEqual(["installPrismaSkills"]);

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
