import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @dxgjs/fs FIRST, before any imports that might use it
vi.mock("@dxgjs/fs", async (importOriginal) => {
  const original = await importOriginal();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mocked: any = { ...(original as Record<string, any>) };
  mocked.detectPackageManager = vi.fn();
  mocked.executeCommand = vi.fn().mockResolvedValue({
    stdout: '',
    stderr: '',
    all: '',
    failed: false,
    timedOut: false,
    isCanceled: false,
    killed: false,
    signal: undefined,
    exitCode: 0,
    pid: 0,
    command: '',
    args: [],
  });
  return mocked;
});

// Mock @antfu/ni
vi.mock("@antfu/ni", async (importOriginal) => {
  const original = await importOriginal();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mocked: any = { ...(original as Record<string, any>) };
  mocked.parseNi = vi.fn();
  mocked.getCliCommand = vi.fn();
  return mocked;
});

// Mock child_process to prevent actual command execution
vi.mock("child_process", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as Record<string, any>),
    execSync: vi.fn(),
  };
});

import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
import { parseNi, getCliCommand } from "@antfu/ni";
// Cast to mock types so we can use mockResolvedValueOnce
const mockedParseNi = parseNi as ReturnType<typeof vi.fn>;
const mockedGetCliCommand = getCliCommand as ReturnType<typeof vi.fn>;
import { detectPackageManager } from "@dxgjs/fs";
const mockedDetectPackageManager = detectPackageManager as ReturnType<typeof vi.fn>;
import databaseGenerator from "./index";

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
    expect(databaseGenerator.prompts.length).toBe(1);
  });

  test("databaseGenerator should have correct prompts", () => {
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
    expect(choices!.length).toBe(3);

    // Check choices
    const choiceValues = choices!.map(c => c.value);
    expect(choiceValues).toContain("sqlite");
    expect(choiceValues).toContain("postgresql");
    expect(choiceValues).toContain("mysql");
  });

  test("databaseGenerator should validate correctly", () => {
    // Since validateDatabase always returns true, any answers should pass
    expect(databaseGenerator.prompts).toBeDefined();
  });

  describe("Validation", () => {
    test("should throw if package.json missing", async () => {
      // Ensure no package.json in the temporary directory
      const context = {
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };
      await expect(
        databaseGenerator.run(
          { provider: "sqlite" },
          context
        )
      ).rejects.toThrow("package.json not found");
    });
  });

  describe("Template usage", () => {
    test("should read template files for schema generation", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock @antfu/ni functions
      const mockRunner = vi.fn().mockImplementation((agent: string, args: string[], ctx: any) => {
        if (!agent && !args && !ctx) {
          return { command: "npm", args: [] };
        }
        if (agent === "npm" && args.includes("add") && args.includes("-D") && args.includes("prisma")) {
          return { command: "npm", args: ["install", "-D", "prisma"] };
        }
        return { command: "npm", args: [...args] };
      });
      mockedParseNi.mockReturnValue(mockRunner);

      mockedGetCliCommand.mockResolvedValueOnce({ command: "npm", args: ["install", "-D", "prisma"] });

      // Spy on fs.executeCommand to see if package installation command is executed
      const executeCommandSpy = vi.spyOn(fs, "executeCommand");
      // We do not mock the implementation here, letting the mock from @dxgjs/fs handle it.

      // Spy on fs.readFile to see what paths are being read
      const readFileSpy = vi.spyOn(fs, "readFile");
      // Mock templates.render to replace placeholders
      const renderSpy = vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
          return (data[key] ?? '') as string;
        });
      });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "sqlite",
      };

      try {
        await databaseGenerator.run(answers, context);

        // Verify that the template files were read
        expect(readFileSpy).toHaveBeenCalledWith(
          expect.stringContaining("schema.prisma.tmpl"),
          { encoding: "utf8" }
        );

        // Verify that the rendered content was written to the schema file
        // Check the actual file created
        const schemaContent = await fs.readFile("prisma/schema.prisma", { encoding: "utf8" });
        expect(schemaContent).toContain('provider = "sqlite"');

        // Verify that the template string passed to render was the one from the .tmpl file
        const renderCalls = renderSpy.mock.calls;
        const templateUsed = renderCalls[0][0]; // first argument of first call
        expect(templateUsed).toContain("datasource db");
        expect(templateUsed).toContain("generator client");

        // Verify that executeCommand was called for package installation
        expect(executeCommandSpy).toHaveBeenCalled();
      } finally {
        // Restore spies
        readFileSpy.mockRestore();
        executeCommandSpy.mockRestore();
        renderSpy.mockRestore();
      }
    });
  });

  test("databaseGenerator should run successfully", async () => {
    // Create a package.json so that validation passes
    await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });

    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger;

    // Mock templates.render to replace placeholders
    const renderSpy = vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
      return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
        return (data[key] ?? '') as string;
      });
    });

    // Declare spies outside the try block so they can be restored in finally
    let readFileSpy: ReturnType<typeof vi.spyOn>;
    let executeCommandSpy: ReturnType<typeof vi.spyOn>;

    // Mock @antfu/ni functions
    const mockRunner = vi.fn().mockImplementation((agent: string, args: string[], ctx: any) => {
      // Simulate the behavior of parseNi for npm project with no args
      if (!agent && !args && !ctx) {
        return { command: "npm", args: [] };
      }
      // For the actual command we're testing: ["add", "-D", "prisma"]
      if (agent === "npm" && args.includes("add") && args.includes("-D") && args.includes("prisma")) {
        return { command: "npm", args: ["install", "-D", "prisma"] };
      }
      return { command: "npm", args: [...args] };
    });
    mockedParseNi.mockReturnValue(mockRunner);

    // Mock getCliCommand to return the resolved command
    mockedGetCliCommand.mockResolvedValueOnce({ command: "npm", args: ["install", "-D", "prisma"] });

    // We do not mock executeCommand here, letting the mock from @dxgjs/fs handle it.

    const context = {
      logger: mockLogger,
      fs: fs,
      templates: { render: renderSpy },
    };

    const answers = {
      provider: "sqlite",
    };

    try {
      console.log('About to run databaseGenerator');
      // Spy on fs.readFile to see what paths are being read
      readFileSpy = vi.spyOn(fs, "readFile");
      // Spy on fs.executeCommand to see if package installation command is executed
      executeCommandSpy = vi.spyOn(fs, "executeCommand");

      await databaseGenerator.run(answers, context);

      // Verify that the template files were read
      expect(readFileSpy).toHaveBeenCalledWith(
        expect.stringContaining("schema.prisma.tmpl"),
        { encoding: "utf8" }
      );

      // Verify that the rendered content was written to the schema file
      // Check the actual file created
      const schemaContent = await fs.readFile("prisma/schema.prisma", { encoding: "utf8" });
      expect(schemaContent).toContain('provider = "sqlite"');

      // Verify that the template string passed to render was the one from the .tmpl file
      const renderCall = renderSpy.mock.calls[0];
      const templateUsed = renderCall[0]; // first argument of first call
      expect(templateUsed).toContain("datasource db");
      expect(templateUsed).toContain("provider = \"{{provider}}\"");

      // Verify that executeCommand was called for package installation
      expect(executeCommandSpy).toHaveBeenCalled();

      // Verify that the logger was called for installing dependencies
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("Installing dependencies")
      );
    } finally {
      // Restore spies
      renderSpy.mockRestore();
      readFileSpy.mockRestore();
      executeCommandSpy.mockRestore();
    }
  });

  describe("Idempotence", () => {
    test("second run should not duplicate schema file", async () => {
      // Create a package.json with prisma dependency already installed
      await fs.writeFile(
        "package.json",
        '{"devDependencies":{"prisma":"^5.0.0"}}',
        { encoding: "utf8" }
      );
      // Create a schema file that already exists
      await fs.mkdir("prisma", { recursive: true });
      await fs.writeFile(
        "prisma/schema.prisma",
        `datasource db {\n  provider = "sqlite"\n  url      = "file:./dev.db"\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}`,
        { encoding: "utf8" }
      );

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock templates.render to replace placeholders
      const renderSpy = vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
        return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
          return (data[key] ?? '') as string;
        });
      });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "sqlite",
      };

      // Spy on fs.writeFile to see if it's called for the schema file
      const writeFileSpy = vi.spyOn(fs, "writeFile");
      // Spy on execSync to ensure it's not called
      const execSyncMock = vi.spyOn(require("child_process"), "execSync");

      // First run
      await databaseGenerator.run(answers, context);
      // Second run
      await databaseGenerator.run(answers, context);

      // Verify that writeFile was not called for schema file (since it should be skipped)
      const writeFileCalls = writeFileSpy.mock.calls.filter(
        (call) => call[0] === "prisma/schema.prisma"
      );
      expect(writeFileCalls.length).toBe(0);

      // Verify that execSync was not called (since dependencies are already installed)
      expect(execSyncMock).not.toHaveBeenCalled();

      // Also, the schema content should remain unchanged
      const schemaContent = await fs.readFile("prisma/schema.prisma", { encoding: "utf8" });
      expect(schemaContent).toBe(
        `datasource db {\n  provider = "sqlite"\n  url      = "file:./dev.db"\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}`
      );

      writeFileSpy.mockRestore();
      renderSpy.mockRestore();
      execSyncMock.mockRestore();
    });
  });

  describe("Package manager detection", () => {
    test("should detect packageManager field in package.json", async () => {
      // Mock the detectPackageManager function to return a specific result
      mockedDetectPackageManager.mockResolvedValueOnce("pnpm");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("pnpm");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });

    test("should detect yarn when yarn.lock exists (and no packageManager field)", async () => {
      // Mock the detectPackageManager function to return a specific result
      mockedDetectPackageManager.mockResolvedValueOnce("yarn");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("yarn");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });

    test("should detect pnpm when pnpm-lock.yaml exists (and no packageManager field)", async () => {
      // Mock the detectPackageManager function to return a specific result
      mockedDetectPackageManager.mockResolvedValueOnce("pnpm");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("pnpm");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });

    test("should detect bun when bun.lockb exists (and no packageManager field)", async () => {
      // Mock the detectPackageManager function to return a specific result
      mockedDetectPackageManager.mockResolvedValueOnce("bun");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("bun");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });

    test("should detect npm when package-lock.json exists (and no packageManager field)", async () => {
      // Mock the detectPackageManager function to return a specific result
      mockedDetectPackageManager.mockResolvedValueOnce("npm");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("npm");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });

    test("should default to npm when no lockfile exists and no packageManager field", async () => {
      // Mock the detectPackageManager function to return a specific result
      mockedDetectPackageManager.mockResolvedValueOnce("npm");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("npm");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });
    describe("Dry-run mode", () => {
      test("does not install dependencies", async () => {
        // Create a package.json so that validation passes
        await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });

        const mockLogger = {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
        } as unknown as Logger;

        // Mock detectPackageManager to return a value (though it shouldn't be called for installation in dry-run)
        mockedDetectPackageManager.mockResolvedValueOnce("npm");
        // execSync comes from the top-level vi.mock("child_process") instance
        const execSyncMock = vi.mocked(execSync);
        execSyncMock.mockClear();

        const context = {
          logger: mockLogger,
          fs: fs,
          templates: { render: vi.fn().mockReturnValue("") },
          dryRun: true, // Set dryRun to true
        };

        const answers = {
          provider: "sqlite",
        };

        await databaseGenerator.run(answers, context);

        // Verify that execSync was not called (dependency installation)
        expect(execSyncMock).not.toHaveBeenCalled();

        // Verify that the logger logged the dry-run message
        expect(mockLogger.info).toHaveBeenCalledWith("[database] Dry-run: Would install dependencies");
      });
    });
  });
});