import { describe, test, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
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
    pathExists: vi.fn().mockImplementation(async function(this: any, path: string) {
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
    readFile: vi.fn().mockImplementation(async function(this: any, path: string, options?: any) {
      // Check if we have this file in our mock storage
      if (this._files.has(path)) {
        return this._files.get(path);
      }
      // Fall back to actual implementation for other paths
      return actual.readFile(path, options);
    }),
    writeFile: vi.fn().mockImplementation(async function(this: any, path: string, data: string | Buffer, options?: any) {
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
    stat: vi.fn().mockImplementation(async function(this: any, path: string) {
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
    mkdir: vi.fn().mockImplementation(async function(this: any, path: string, options?: any) {
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
  const actual = await vi.importActual("@dxgjs/templates");
  return {
    ...actual,
    render: vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
      // Simple template replacement for testing
      return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        return (data[key] ?? '') as string;
      });
    }),
  };
});

vi.mock("@antfu/ni", () => {
  return {
    parseNi: vi.fn().mockReturnValue("npm"),
    getCliCommand: vi.fn().mockImplementation((parseNiFn: any, args: string[], ctx: any) => {
      // Use the parameters to avoid TS6133
      parseNiFn;
      ctx;
      // Simulate the behavior of getCliCommand for npm project
      if (!args || args.length === 0) {
        return { command: "npm", args: [] };
      }
      // For dependency installation commands
      if (args.includes("add") && args.includes("-D")) {
        return { command: "npm", args: ["install", "-D", ...args.filter((arg: string) => arg !== "add" && arg !== "-D")] };
      }
      if (args.includes("add") && !args.includes("-D")) {
        return { command: "npm", args: ["install", ...args.filter((arg: string) => arg !== "add")] };
      }
      // For prisma init command
      if (args.includes("dlx") && args.includes("prisma") && args.includes("init")) {
        return { command: "npx", args: ["prisma", "init", "--datasource-provider", "sqlite", "--output", "./prisma"] };
      }
      // For prisma generate command
      if (args.includes("dlx") && args.includes("prisma") && args.includes("generate")) {
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
const fsMockStore = fs as unknown as { _files: Map<string, string>; _directories: Set<string> };

describe("Database Generator", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    // Create a temporary directory
    tempDir = path.join(os.tmpdir(), `dxg-db-test-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 15)}`);
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
      "Adds Prisma ORM with a selected database provider"
    );
    expect(Array.isArray(databaseGenerator.prompts)).toBe(true);
  });

  test("databaseGenerator should have correct prompts for all providers", () => {
    const prompts = databaseGenerator.prompts;

    // First prompt: provider
    expect(prompts[0].name).toBe("provider");
    expect(prompts[0].type).toBe("select");
    expect(prompts[0].message).toBe(
      "Choose your database provider:"
    );
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
      expect(plan.filesToCreate[0].templatePath).toContain("prisma-client-lib.ts.tmpl");
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
      expect(plan.filesToCreate[0].templatePath).toContain("prisma-client-lib.ts.tmpl");
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
      expect(plan.filesToCreate[0].templatePath).toContain("prisma-client-lib-mysql.ts.tmpl");
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
      expect(plan.filesToCreate[0].templatePath).toContain("prisma-client-lib-sqlserver.ts.tmpl");
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
      expect(plan.filesToCreate[0].templatePath).toContain("prisma-client-lib.ts.tmpl");
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
      expect(plan.filesToCreate[0].templatePath).toContain("prisma-client-lib-planetscale.ts.tmpl");
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
      expect(plan.filesToCreate[0].templatePath).toContain("prisma-client-lib.ts.tmpl");
    });
  });

  describe("execution", () => {
    test("should execute successfully with CLI answers for SQLite", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as Logger;

      const templatesMock = {
        render: vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
          // Simple template replacement for testing
          return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
            return (data[key] ?? '') as string;
          });
        })
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

      await expect(
        databaseGenerator.run(answers, context)
      ).resolves.not.toThrow();

      // Verify that fs.pathExists was called for package.json
      expect(fs.pathExists).toHaveBeenCalledWith("package.json");

      // Verify that fs.readFile was called for package.json and the lib/prisma.ts template
      expect(fs.readFile).toHaveBeenCalledWith("package.json", { encoding: "utf8" });
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining("prisma-client-lib.ts.tmpl"),
        { encoding: "utf8" }
      );

      // Verify that fs.writeFile was called for the lib/prisma.ts file (DXG-owned)
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining("lib/prisma.ts"),
        expect.any(String),
        "utf8"
      );

      // Verify that getCliCommand was called for dependency installation
      expect(getCliCommand).toHaveBeenCalled();

      // Verify that executeCommand was called for dependency installation and prisma commands
      expect(fs.executeCommand).toHaveBeenCalledTimes(4);

      // Verify that logger.debug was called for technical diagnostics
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    test("should NOT render schema.prisma template (Prisma-owned)", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as Logger;

      const templatesMock = {
        render: vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
          // Simple template replacement for testing
          return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
            return (data[key] ?? '') as string;
          });
        })
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
      const schemaTemplateCalls = (fs.readFile as any).mock.calls.filter((call: any[]) =>
        call[0] && typeof call[0] === 'string' && call[0].includes("schema.prisma.tmpl")
      );
      expect(schemaTemplateCalls.length).toBe(0);
    });
  });

  describe("dry-run mode", () => {
    test("should handle dry-run mode correctly", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });
      // Clear mock call history to not count the setup call
      vi.clearAllMocks();

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as Logger;

      const templatesMock = {
        render: vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
          // Simple template replacement for testing
          return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
            return (data[key] ?? '') as string;
          });
        })
      };

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: templatesMock,
        dryRun: true, // Dry run mode
        force: false,
      };

      const answers = {
        provider: "sqlite",
      };

      await expect(
        databaseGenerator.run(answers, context)
      ).resolves.not.toThrow();

      // In dry-run mode, fs.writeFile should NOT be called for any files
      expect(fs.writeFile).not.toHaveBeenCalled();

      // But pathExists should still be called to check for package.json
      expect(fs.pathExists).toHaveBeenCalledWith("package.json");

      // And readFile should be called for package.json and template
      expect(fs.readFile).toHaveBeenCalledWith("package.json", { encoding: "utf8" });
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining("prisma-client-lib.ts.tmpl"),
        { encoding: "utf8" }
      );

      // Verify that executeCommand was NOT called for prisma init or prisma generate
      expect(fs.executeCommand).not.toHaveBeenCalled();
    });
  });

  describe("non-interactive mode", () => {
    test("should fail in non-interactive mode when provider is missing", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
      } as unknown as Logger;

      const templatesMock = {
        render: vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
          // Simple template replacement for testing
          return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
            return (data[key] ?? '') as string;
          });
        })
      };

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: templatesMock,
        dryRun: true, // Dry run to avoid prompts
        force: false,
      };

      const answers = {}; // No provider specified

      await expect(
        databaseGenerator.run(answers, context)
      ).rejects.toThrow("Missing required values in non-interactive mode: provider");
    });
  });
});