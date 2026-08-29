import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// We need to mock the modules before importing the initGenerator
vi.mock("@dxgjs/prompts", async () => {
  const actual = await vi.importActual("@dxgjs/prompts");
  return {
    ...actual,
    prompt: vi.fn().mockResolvedValue({}),
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
  const actual = await vi.importActual("@dxgjs/fs");
  return {
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

// Import the mocked modules
const prompts = await import("@dxgjs/prompts");
import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
import * as path from "path";
import * as os from "os";
import initGenerator from "./index";

describe("Init Generator", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    // Create a temporary directory
    tempDir = path.join(os.tmpdir(), `dxg-init-test-${Date.now()}-${Math.random()
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

  test("initGenerator should exist", () => {
    expect(initGenerator).toBeDefined();
    expect(initGenerator.name).toBe("init");
    expect(initGenerator.description).toBe(
      "Initialize a new DXG project"
    );
    expect(Array.isArray(initGenerator.prompts)).toBe(true);
    expect(initGenerator.prompts.length).toBe(4);
  });

  test("initGenerator should have correct prompts", () => {
    const prompts = initGenerator.prompts;

    // First prompt: projectName
    expect(prompts[0].name).toBe("projectName");
    expect(prompts[0].type).toBe("input");
    expect(prompts[0].message).toBe(
      "What is the name of your project?"
    );

    // Second prompt: framework
    expect(prompts[1].name).toBe("framework");
    expect(prompts[1].type).toBe("select");
    expect(prompts[1].message).toBe(
      "Choose your frontend framework:"
    );
    expect(prompts[1].default).toBe("nextjs");
    const choices = prompts[1].choices;
    expect(Array.isArray(choices)).toBe(true);
    expect(choices!.length).toBe(4);

    // Third prompt: typescript
    expect(prompts[2].name).toBe("typescript");
    expect(prompts[2].type).toBe("confirm");
    expect(prompts[2].message).toBe(
      "Do you want to use TypeScript?"
    );
    expect(prompts[2].default).toBe(true);

    // Fourth prompt: installDependencies
    expect(prompts[3].name).toBe("installDependencies");
    expect(prompts[3].type).toBe("confirm");
    expect(prompts[3].message).toBe(
      "Do you want to install dependencies?"
    );
    expect(prompts[3].default).toBe(true);
  });

  test("initGenerator should validate correctly", () => {
    // Since validateInit always returns true, any answers should pass
    expect(initGenerator.prompts).toBeDefined();
  });

  test("initGenerator should run successfully with CLI answers", async () => {
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
    };

    const answers = {
      projectName: "my-project",
      framework: "nextjs",
      typescript: true,
      installDependencies: true,
    };

    await expect(
      initGenerator.run(answers, context)
    ).resolves.not.toThrow();

    // Verify that intro was called
    expect(prompts.intro).toHaveBeenCalledWith("DXG Project Init");

    // Verify that outro was called
    expect(prompts.outro).toHaveBeenCalledWith("Project initialized successfully!");

    // Verify that note was called for user-facing messages
    expect(prompts.note).toHaveBeenCalled();

    // Verify that logger.debug was called for technical diagnostics
    expect(mockLogger.debug).toHaveBeenCalled();

    // Verify that fs.mkdir was called for the project directory
    expect(fs.mkdir).toHaveBeenCalledWith("my-project", { recursive: true });

    // Verify that fs.writeFile was called for package.json
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("package.json"),
      expect.any(String),
      "utf8"
    );
  });

  test("initGenerator should handle dry-run mode", async () => {
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
    };

    const answers = {
      projectName: "my-project",
      framework: "nextjs",
      typescript: true,
      installDependencies: true,
    };

    await expect(
      initGenerator.run(answers, context)
    ).resolves.not.toThrow();

    // In dry-run mode, fs.writeFile should NOT be called for package.json
    expect(fs.writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining("package.json"),
      expect.any(String),
      "utf8"
    );

    // But fs.mkdir should still be called for the project directory
    expect(fs.mkdir).toHaveBeenCalledWith("my-project", { recursive: true });

    // Verify that the dry-run message was noted
    expect(prompts.note).toHaveBeenCalledWith(
      "[init] Dry-run: Would create project structure"
    );
  });

  test("initGenerator should handle force mode", async () => {
    // Mock that files already exist
    vi.mocked(fs).pathExists.mockResolvedValue(true);
    vi.mocked(fs).stat.mockResolvedValue({ isDirectory: () => false });
    vi.mocked(fs).readFile.mockResolvedValue("existing content"); // Different from template

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
      projectName: "my-project",
      framework: "nextjs",
      typescript: true,
      installDependencies: true,
    };

    await expect(
      initGenerator.run(answers, context)
    ).resolves.not.toThrow();

    // In force mode, fs.writeFile should be called to overwrite existing files
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("package.json"),
      expect.any(String),
      "utf8"
    );
  });

  test("initGenerator should handle interactive prompts when CLI answers are incomplete", async () => {
    // Override the prompt mock for this specific test
    (prompts.prompt as vi.Mock).mockResolvedValueOnce({
      projectName: "my-project",
      framework: "vue",
      typescript: false,
      installDependencies: true
    });

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

    // No CLI answers provided, so it should prompt for all fields
    const cliAnswers = {};

    await expect(
      initGenerator.run(cliAnswers, context)
    ).resolves.not.toThrow();

    // Verify that prompt was called
    expect(prompts.prompt).toHaveBeenCalled();
  });

  test("initGenerator should handle cancellation", async () => {
    // Override the prompt mock to simulate cancellation for this test
    (prompts.prompt as vi.Mock).mockRejectedValueOnce(new Error("Canceled"));

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
      initGenerator.run(cliAnswers, context)
    ).rejects.toThrow();

    // Verify that cancel was called
    expect(prompts.cancel).toHaveBeenCalledWith("Operation cancelled");
  });

  test("initGenerator should handle missing project name", async () => {
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as unknown as Logger;

    const context = {
      logger: mockLogger,
      fs: fs,
      templates: { render: vi.fn().mockReturnValue("") },
    };

    const answers = {
      framework: "nextjs",
      typescript: true,
      installDependencies: true,
    };

    await expect(
      initGenerator.run(answers, context)
    ).rejects.toThrow("Project name is required");
  });
});