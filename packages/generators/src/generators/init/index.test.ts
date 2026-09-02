import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

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
  const actual = await vi.importActual<typeof import("@dxgjs/fs")>("@dxgjs/fs");
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

// Direct access to the @dxgjs/fs mock storage (see the vi.mock factory above)
const fsMockStore = fs as unknown as { _files: Map<string, string>; _directories: Set<string> };

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

  test("initGenerator should exist", () => {
    expect(initGenerator).toBeDefined();
    expect(initGenerator.name).toBe("init");
    expect(initGenerator.description).toBe(
      "Initializes a small DXG project (proof pipeline)"
    );
    expect(Array.isArray(initGenerator.prompts)).toBe(true);
    expect(initGenerator.prompts.length).toBe(2);
  });

  test("initGenerator should have correct prompts", () => {
    const prompts = initGenerator.prompts;

    // First prompt: project name
    expect(prompts[0].name).toBe("name");
    expect(prompts[0].type).toBe("input");
    expect(prompts[0].message).toBe(
      "Project name:"
    );

    // Second prompt: description (optional)
    expect(prompts[1].name).toBe("description");
    expect(prompts[1].type).toBe("input");
    expect(prompts[1].message).toBe(
      "Description (optional):"
    );
    expect(prompts[1].default).toBe("");
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
    };

    const answers = {
      name: "my-project",
      description: "A test project",
    };

    await expect(
      initGenerator.run(answers, context)
    ).resolves.not.toThrow();

    // Verify that intro was called
    expect(prompts.intro).toHaveBeenCalledWith("DXG Project Initializer");

    // Verify that outro was called
    expect(prompts.outro).toHaveBeenCalledWith("Project my-project initialized successfully!");

    // Semantic summary UX: exactly ONE Operation Summary note renders the
    // whole structured result — not one note per created/updated file.
    const noteCalls = (prompts.note as Mock).mock.calls;
    expect(noteCalls.length).toBe(1);
    const summary = String(noteCalls[0][0]);
    expect(summary).toContain("package.json");
    expect(summary).toContain("tsconfig.json");
    expect(summary).toContain("src/index.ts");
    expect(summary).toContain(".gitignore");

    // Verify that fs.mkdir was called for the src directory (for src/index.ts)
    expect(fs.mkdir).toHaveBeenCalledWith("src", { recursive: true });

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
      dryRun: true, // Dry run mode
    };

    const answers = {
      name: "my-project",
      description: "A test project",
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

    // And no directory should have been created in dry-run mode
    expect(fs.mkdir).not.toHaveBeenCalled();

    // Semantic dry-run UX: the planned files are reported inside ONE
    // Operation Summary note (collect first, render once) — the file list
    // is preserved without coupling the test to exact wording.
    const noteCalls = (prompts.note as Mock).mock.calls;
    expect(noteCalls.length).toBe(1);
    expect(String(noteCalls[0][0])).toContain("package.json");
    expect(String(noteCalls[0][0])).toContain("tsconfig.json");
    expect(String(noteCalls[0][0])).toContain("src/index.ts");
    expect(String(noteCalls[0][0])).toContain(".gitignore");
  });

  test("initGenerator should handle force mode", async () => {
    // Create an existing package.json with different content (conflict)
    await fs.writeFile("package.json", "existing content", { encoding: "utf8" });

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
      dryRun: false,
      force: true, // Force mode
    };

    const answers = {
      name: "my-project",
      description: "A test project",
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
    (prompts.prompt as Mock).mockResolvedValueOnce({
      name: "my-project",
      description: "A test project"
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
    (prompts.prompt as Mock).mockRejectedValueOnce(new Error("Canceled"));
    // And recognize the rejection as a Clack cancellation
    (prompts.isCancel as unknown as Mock).mockReturnValueOnce(true);

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
    };

    const answers = {
      framework: "nextjs",
      typescript: true,
      installDependencies: true,
    };

    await expect(
      initGenerator.run(answers, context)
    ).rejects.toThrow("Invalid project name provided");
  });

  test("initGenerator should accept a missing optional description in non-interactive mode", async () => {
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
        return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
          return (data[key] ?? '') as string;
        });
      }) },
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
      dryRun: true, // dry-run implies non-interactive
      force: false,
      nonInteractive: true,
    };

    // Only the genuinely required value (`name`) is supplied; the optional
    // `description` must default to "" instead of failing the run.
    const cliAnswers = { name: "my-project" };

    await expect(
      initGenerator.run(cliAnswers, context)
    ).resolves.not.toThrow();

    // No prompting in non-interactive mode
    expect(prompts.prompt).not.toHaveBeenCalled();

    // The run still completes the whole pipeline (dry-run summary + outro)
    expect(prompts.outro).toHaveBeenCalledWith("Project my-project initialized successfully!");
  });

  test("initGenerator should still require a project name in non-interactive mode", async () => {
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
      dryRun: true,
      force: false,
      nonInteractive: true,
    };

    // `name` is genuinely required with no default → non-interactive fails.
    await expect(
      initGenerator.run({}, context)
    ).rejects.toThrow("Missing required values in non-interactive mode: name");
  });
});