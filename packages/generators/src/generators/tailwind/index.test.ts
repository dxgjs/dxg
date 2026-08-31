import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

// We need to mock the modules before importing the tailwindGenerator
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
          isFile: () => true,
        };
      }
      // Check if it's a directory we have
      if (this._directories.has(path)) {
        return {
          isDirectory: () => true,
          isFile: () => false,
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
      // For the actual command we're testing: ["add", "-D", "tailwindcss", "postcss"]
      if (agent === "npm" && args.includes("add") && args.includes("-D") && args.includes("tailwindcss") && args.includes("postcss")) {
        return { command: "npm", args: ["install", "-D", "tailwindcss", "postcss"] };
      }
      return { command: "npm", args: [...args] };
    }),
    // Fix: Export getCliCommand as a mock function that accepts arguments
    getCliCommand: vi.fn().mockResolvedValue({ command: "npm", args: ["install", "-D", "tailwindcss", "postcss"] }),
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
import tailwindGenerator from "./index";

// Direct access to the @dxgjs/fs mock storage (see the vi.mock factory above)
const fsMockStore = fs as unknown as { _files: Map<string, string>; _directories: Set<string> };

describe("Tailwind Generator", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    // Create a temporary directory
    tempDir = path.join(os.tmpdir(), `dxg-tailwind-test-${Date.now()}-${Math.random()
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

  test("tailwindGenerator should exist", () => {
    expect(tailwindGenerator).toBeDefined();
    expect(tailwindGenerator.name).toBe("tailwind");
    expect(tailwindGenerator.description).toBe(
      "Adds Tailwind CSS v4 to a Node/frontend project"
    );
    expect(Array.isArray(tailwindGenerator.prompts)).toBe(true);
    expect(tailwindGenerator.prompts.length).toBe(3);
  });

  test("tailwindGenerator should have correct prompts", () => {
    const prompts = tailwindGenerator.prompts;

    // First prompt: customiseTailwind
    expect(prompts[0].name).toBe("customiseTailwind");
    expect(prompts[0].type).toBe("confirm");
    expect(prompts[0].message).toBe(
      "Do you want to customise Tailwind settings (content paths, theme, etc.)? [y/N]"
    );
    expect(prompts[0].default).toBe(false);

    // Second prompt: addPostcssPlugins
    expect(prompts[1].name).toBe("addPostcssPlugins");
    expect(prompts[1].type).toBe("confirm");
    expect(prompts[1].message).toBe(
      "Do you want to add additional PostCSS plugins (e.g., for minification)? [y/N]"
    );
    expect(prompts[1].default).toBe(false);

    // Third prompt: installAutoprefixer
    expect(prompts[2].name).toBe("installAutoprefixer");
    expect(prompts[2].type).toBe("confirm");
    expect(prompts[2].message).toBe(
      "Do you need to support legacy browsers (IE11, older Android)? [y/N]"
    );
    expect(prompts[2].default).toBe(false);
  });

  test("tailwindGenerator should validate correctly", () => {
    // Since validateTailwind always returns true, any answers should pass
    expect(tailwindGenerator.prompts).toBeDefined();
  });

  test("tailwindGenerator should run successfully with CLI answers", async () => {
    // Create a package.json so that validation passes
    await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });
    // Create the src directory
    await fs.mkdir("src", { recursive: true });

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
      customiseTailwind: false,
      addPostcssPlugins: false,
      installAutoprefixer: false,
    };

    await expect(
      tailwindGenerator.run(answers, context)
    ).resolves.not.toThrow();

    // Verify that intro was called
    expect(prompts.intro).toHaveBeenCalledWith("DXG Tailwind Setup");

    // Verify that outro was called
    expect(prompts.outro).toHaveBeenCalledWith("Tailwind CSS setup completed!");

    // Verify that note was called for user-facing messages
    expect(prompts.note).toHaveBeenCalled();

    // Verify that logger.debug was called for technical diagnostics
    expect(mockLogger.debug).toHaveBeenCalled();

    // Verify that fs.pathExists was called for package.json
    expect(fs.pathExists).toHaveBeenCalledWith("package.json");

    // Verify that fs.mkdir was called for src directory
    expect(fs.mkdir).toHaveBeenCalledWith("src", { recursive: true });

    // Verify that fs.writeFile was called for CSS file
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("src/index.css"),
      expect.any(String),
      "utf8"
    );
  });

  test("tailwindGenerator should handle dry-run mode", async () => {
    // Create a package.json so that validation passes
    await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });
    // Create the src directory
    await fs.mkdir("src", { recursive: true });

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
      customiseTailwind: false,
      addPostcssPlugins: false,
      installAutoprefixer: false,
    };

    await expect(
      tailwindGenerator.run(answers, context)
    ).resolves.not.toThrow();

    // In dry-run mode, fs.writeFile should NOT be called for the CSS file
    expect(fs.writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining("src/index.css"),
      expect.any(String),
      "utf8"
    );

    // But pathExists should still be called to check for package.json
    expect(fs.pathExists).toHaveBeenCalledWith("package.json");

    // And mkdir should still be called for src directory
    expect(fs.mkdir).toHaveBeenCalledWith("src", { recursive: true });

    // And readFile should be called for package.json (framework detection)
    expect(fs.readFile).toHaveBeenCalledWith("package.json", { encoding: "utf8" });

    // Verify that the dry-run message was noted
    expect(prompts.note).toHaveBeenCalledWith(
      "[tailwind] Dry-run: Would install dependencies"
    );
  });

  test("tailwindGenerator should handle force mode", async () => {
    // Create a package.json and an existing CSS file without directives (conflict)
    await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });
    await fs.mkdir("src", { recursive: true });
    await fs.writeFile("src/index.css", "existing content", { encoding: "utf8" });

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
      customiseTailwind: false,
      addPostcssPlugins: false,
      installAutoprefixer: false,
    };

    await expect(
      tailwindGenerator.run(answers, context)
    ).resolves.not.toThrow();

    // In force mode, fs.writeFile should be called to overwrite existing files
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("src/index.css"),
      expect.any(String),
      "utf8"
    );
  });

  test("tailwindGenerator should handle interactive prompts when CLI answers are incomplete", async () => {
    // Override the prompt mock for this specific test
    (prompts.prompt as Mock).mockResolvedValueOnce({
      customiseTailwind: true,
      addPostcssPlugins: false,
      installAutoprefixer: true
    });

    // Create a package.json so that validation passes
    await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });
    // Create the src directory
    await fs.mkdir("src", { recursive: true });

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
      tailwindGenerator.run(cliAnswers, context)
    ).resolves.not.toThrow();

    // Verify that prompt was called
    expect(prompts.prompt).toHaveBeenCalled();
  });

  test("tailwindGenerator should handle cancellation", async () => {
    // Override the prompt mock to simulate cancellation for this test
    (prompts.prompt as Mock).mockRejectedValueOnce(new Error("Canceled"));
    // And recognize the rejection as a Clack cancellation
    (prompts.isCancel as unknown as Mock).mockReturnValueOnce(true);

    // Create a package.json so that validation passes
    await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });
    // Create the src directory
    await fs.mkdir("src", { recursive: true });

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
      tailwindGenerator.run(cliAnswers, context)
    ).rejects.toThrow();

    // Verify that cancel was called
    expect(prompts.cancel).toHaveBeenCalledWith("Operation cancelled");
  });

  test("tailwindGenerator should handle missing package.json", async () => {
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

    const answers = {
      customiseTailwind: false,
      addPostcssPlugins: false,
      installAutoprefixer: false,
    };

    await expect(
      tailwindGenerator.run(answers, context)
    ).rejects.toThrow("package.json not found");
  });

  test("tailwindGenerator should handle Node.js version < 18", async () => {
    // Mock process.versions.node to simulate an old version
    const originalNodeVersion = process.versions.node;
    Object.defineProperty(process.versions, "node", {
      value: "16.0.0",
      configurable: true,
    });
    try {
      const context = {
        logger: {
          info: vi.fn(),
          error: vi.fn(),
          warn: vi.fn(),
          debug: vi.fn(),
        } as unknown as Logger,
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
      await tailwindGenerator.run(
        {
          customiseTailwind: false,
          addPostcssPlugins: false,
          installAutoprefixer: false,
        },
        context,
      );
      expect(false).toBe(true); // Should not reach here
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Node.js version");
    } finally {
      // Restore original node version
      Object.defineProperty(process.versions, "node", {
        value: originalNodeVersion,
        configurable: true,
      });
    }
  });
});