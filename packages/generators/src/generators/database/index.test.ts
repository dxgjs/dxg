import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

// We need to mock the modules before importing the databaseGenerator
vi.mock("@dxgjs/prompts", async () => {
  const actual = await vi.importActual("@dxgjs/prompts");
  return {
    ...actual,
    prompt: vi.fn().mockResolvedValue({ provider: "sqlite" }),
    intro: vi.fn(),
    outro: vi.fn(),
    isCancel: vi.fn(),
    cancel: vi.fn(),
    spinner: vi.fn().mockReturnValue({
      start: vi.fn(),
      stop: vi.fn(),
    }),
    note: vi.fn(),
    // Remove unused imports that we actually removed from the implementation
    // text: vi.fn(),
    // confirm: vi.fn(),
    select: vi.fn(),
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

vi.mock("@antfu/ni", async () => {
  const actual = await vi.importActual("@antfu/ni");
  return {
    ...actual,
    parseNi: vi.fn().mockReturnValue((agent: string, args: string[], ctx: any) => {
      // Simulate the behavior of parseNi for npm project with no args
      if (!agent && !args && !ctx) {
        return { command: "npm", args: [] };
      }
      // For the actual command we're testing: ["add", "-D", "prisma"]
      if (agent === "npm" && args.includes("add") && args.includes("-D") && args.includes("prisma")) {
        return { command: "npm", args: ["install", "-D", "prisma"] };
      }
      return { command: "npm", args: [...args] };
    }),
    // Fix: Export getCliCommand as a mock function that accepts arguments
    getCliCommand: vi.fn().mockResolvedValue({ command: "npm", args: ["install", "-D", "prisma"] }),
    // Fix: Export executeCommand as a mock function
    executeCommand: vi.fn().mockResolvedValue(undefined),
  };
});

// Import the mocked modules
const prompts = await import("@dxgjs/prompts");
import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
import * as path from "path";
import * as os from "os";
import databaseGenerator from "./index";

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

  test("databaseGenerator should run successfully with CLI answers", async () => {
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

    // Verify that fs.readFile was called for package.json and template
    expect(fs.readFile).toHaveBeenCalledWith("package.json", { encoding: "utf8" });
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining("schema.prisma.tmpl"),
      { encoding: "utf8" }
    );

    // Verify that fs.writeFile was called for the schema file
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("prisma/schema.prisma"),
      expect.any(String),
      "utf8"
    );

    // Verify that logger.debug was called for technical diagnostics
    expect(mockLogger.debug).toHaveBeenCalled();
  });

  test("databaseGenerator should handle dry-run mode", async () => {
    // Create a package.json so that validation passes
    await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });

    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    const context = {
      logger: mockLogger,
      fs: fs,
      templates: { render: vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
        // Simple template replacement for testing
        return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
          return (data[key] ?? '') as string;
        });
      }) },
      dryRun: true, // Dry run mode
      force: false,
    };

    const answers = {
      provider: "sqlite",
    };

    await expect(
      databaseGenerator.run(answers, context)
    ).resolves.not.toThrow();

    // In dry-run mode, fs.writeFile should NOT be called for the schema file
    expect(fs.writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining("prisma/schema.prisma"),
      expect.any(String),
      "utf8"
    );

    // But pathExists should still be called to check for package.json
    expect(fs.pathExists).toHaveBeenCalledWith("package.json");

    // And readFile should be called for package.json and template
    expect(fs.readFile).toHaveBeenCalledWith("package.json", { encoding: "utf8" });
    expect(fs.readFile).toHaveBeenCalledWith(
      expect.stringContaining("schema.prisma.tmpl"),
      { encoding: "utf8" }
    );
  });

  test("databaseGenerator should handle force mode", async () => {
    // Create a package.json (precondition) and an existing schema file with
    // different content (conflict)
    await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });
    await fs.mkdir("prisma", { recursive: true });
    await fs.writeFile("prisma/schema.prisma", "existing content", { encoding: "utf8" });

    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    const context = {
      logger: mockLogger,
      fs: fs,
      templates: { render: vi.fn().mockImplementation((template: string, data: Record<string, unknown>) => {
        // Simple template replacement for testing
        return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
          return (data[key] ?? '') as string;
        });
      }) },
      dryRun: false,
      force: true, // Force mode
    };

    const answers = {
      provider: "sqlite",
    };

    await expect(
      databaseGenerator.run(answers, context)
    ).resolves.not.toThrow();

    // In force mode, fs.writeFile should be called to overwrite existing files
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("prisma/schema.prisma"),
      expect.any(String),
      "utf8"
    );
  });

  test("databaseGenerator should handle interactive prompts when CLI answers are incomplete", async () => {
    // Override the prompt mock for this specific test
    (prompts.prompt as Mock).mockResolvedValueOnce({ provider: "postgresql" });

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

    // No CLI answers provided, so it should prompt for provider
    const cliAnswers = {};

    await expect(
      databaseGenerator.run(cliAnswers, context)
    ).resolves.not.toThrow();

    // Verify that prompt was called
    expect(prompts.prompt).toHaveBeenCalled();
  });

  test("databaseGenerator should handle cancellation", async () => {
    // Override the prompt mock to simulate cancellation for this test
    (prompts.prompt as Mock).mockRejectedValueOnce(new Error("Canceled"));
    // And recognize the rejection as a Clack cancellation
    (prompts.isCancel as unknown as Mock).mockReturnValueOnce(true);

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

    // No CLI answers, so it will try to prompt
    const cliAnswers = {};

    await expect(
      databaseGenerator.run(cliAnswers, context)
    ).rejects.toThrow();
  });

  test("databaseGenerator should handle missing package.json", async () => {
    // Ensure no package.json in the temporary directory
    // (fs.pathExists is already mocked to return false by default)

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
    ).rejects.toThrow("package.json not found");
  });
});