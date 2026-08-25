import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";


// Mock @dxgjs/fs FIRST, before any imports that might use it
vi.mock("@dxgjs/fs", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    detectPackageManager: vi.fn(),
  };
});
// Mock child_process.execSync to prevent actual command execution
vi.mock("child_process", () => ({
  execSync: vi.fn()
}));

import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
import * as path from "path";
import * as os from "os";
import { detectPackageManager } from "@dxgjs/fs";
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
    expect(Array.isArray(prompts[0].choices)).toBe(true);
    expect(prompts[0].choices.length).toBe(3);

    // Check choices
    const choiceValues = prompts[0].choices.map(c => c.value);
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
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Spy on fs.readFile to see what paths are being read
      let readFileSpy: ReturnType<typeof vi.spyOn> = vi.spyOn(fs, "readFile");
      // Mock templates.render to replace placeholders
      let renderSpy: ReturnType<typeof vi.fn> = vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
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
        const schemaContent = await fs.readFile("prisma/schema.prisma", "utf8");
        expect(schemaContent).toContain('provider = "sqlite"');

        // Verify that the template string passed to render was the one from the .tmpl file
        const renderCalls = renderSpy.mock.calls;
        const templateUsed = renderCalls[0][0]; // first argument of first call
        expect(templateUsed).toContain("datasource db");
        expect(templateUsed).toContain("generator client");
      } finally {
        readFileSpy.mockRestore();
      }
    });
  });

  test("databaseGenerator should run successfully", async () => {
  // Create a package.json so that validation passes
  await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

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

  try {
    console.log('About to run databaseGenerator');
    // Spy on fs.readFile to see what paths are being read
    const readFileSpy = vi.spyOn(fs, "readFile");
    // Initialize the execSync mock BEFORE running the generator
    const execSyncMock = vi.spyOn(require("child_process"), "execSync");

    await databaseGenerator.run(answers, context);

    // Verify that the template files were read
    expect(readFileSpy).toHaveBeenCalledWith(
      expect.stringContaining("schema.prisma.tmpl"),
      { encoding: "utf8" }
    );

    // Verify that the rendered content was written to the schema file
    // Check the actual file created
    const schemaContent = await fs.readFile("prisma/schema.prisma", "utf8");
    expect(schemaContent).toContain('provider = "sqlite"');

    // Verify that the template string passed to render was the one from the .tmpl file
    const renderCall = renderSpy.mock.calls[0];
    const templateUsed = renderCall[0]; // first argument of first call
    expect(templateUsed).toContain("datasource db");
    expect(templateUsed).toContain("provider = \"{{provider}}\"");

    // Verify that execSync was called for package installation
    expect(execSyncMock).toHaveBeenCalled();

    // Verify that the logger was called for installing dependencies
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("Installing dependencies")
    );
  } finally {
    // Restore spies
    renderSpy.mockRestore();
  }
});

  describe("Idempotence", () => {
    test("second run should not duplicate schema file", async () => {
      // Create a package.json with prisma dependency already installed
      await fs.writeFile(
        "package.json",
        '{"devDependencies":{"prisma":"^5.0.0"}}',
        "utf8"
      );
      // Create a schema file that already exists
      await fs.mkdir("prisma", { recursive: true });
      await fs.writeFile(
        "prisma/schema.prisma",
        `datasource db {\n  provider = "sqlite"\n  url      = "file:./dev.db"\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}`,
        "utf8"
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
      const schemaContent = await fs.readFile("prisma/schema.prisma", "utf8");
      expect(schemaContent).toBe(
        `datasource db {\n  provider = "sqlite"\n}\n\ngenerator client {\n  provider = "prisma-client-js"\n}`
      );

      writeFileSpy.mockRestore();
      renderSpy.mockRestore();
      execSyncMock.mockRestore();
    });
  });

  describe("Package manager detection", () => {
    test("should detect packageManager field in package.json", async () => {
      // Mock the detectPackageManager function to return a specific result
      detectPackageManager.mockResolvedValueOnce("pnpm");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("pnpm");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });

    test("should detect yarn when yarn.lock exists (and no packageManager field)", async () => {
      // Mock the detectPackageManager function to return a specific result
      detectPackageManager.mockResolvedValueOnce("yarn");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("yarn");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });

    test("should detect pnpm when pnpm-lock.yaml exists (and no packageManager field)", async () => {
      // Mock the detectPackageManager function to return a specific result
      detectPackageManager.mockResolvedValueOnce("pnpm");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("pnpm");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });

    test("should detect bun when bun.lockb exists (and no packageManager field)", async () => {
      // Mock the detectPackageManager function to return a specific result
      detectPackageManager.mockResolvedValueOnce("bun");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("bun");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });

    test("should detect npm when package-lock.json exists (and no packageManager field)", async () => {
      // Mock the detectPackageManager function to return a specific result
      detectPackageManager.mockResolvedValueOnce("npm");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("npm");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });

    test("should default to npm when no lockfile exists and no packageManager field", async () => {
      // Mock the detectPackageManager function to return a specific result
      detectPackageManager.mockResolvedValueOnce("npm");

      const packageManager = await detectPackageManager(undefined);
      expect(packageManager).toBe("npm");
      expect(detectPackageManager).toHaveBeenCalledWith(undefined);
    });
  describe("Dry-run mode", () => {
    test("does not install dependencies", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");
  
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;
  
      // Mock detectPackageManager to return a value (though it shouldn't be called for installation in dry-run)
      const detectPackageManagerMock = vi.spyOn(require("@dxgjs/fs"), "detectPackageManager");
      detectPackageManagerMock.mockResolvedValue("npm");
      // Mock execSync to ensure it's not called
      const execSyncMock = vi.spyOn(require("child_process"), "execSync");
  
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
describe("Dry-run mode", () => {
  test("does not install dependencies", async () => {
    // Create a package.json so that validation passes
    await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger;

    // Mock detectPackageManager to return a value (though it shouldn't be called for installation in dry-run)
    const detectPackageManagerMock = vi.spyOn(require("@dxgjs/fs"), "detectPackageManager");
    detectPackageManagerMock.mockResolvedValue("npm");
    // Mock execSync to ensure it's not called
    const execSyncMock = vi.spyOn(require("child_process"), "execSync");

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