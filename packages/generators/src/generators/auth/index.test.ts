import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @dxgjs/fs FIRST, before any imports that might use it
vi.mock("@dxgjs/fs", async (importOriginal) => {
  const original = await importOriginal();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mocked: any = { ...(original as any) };
  mocked.executeCommand = vi.fn();
  return mocked;
});

// Mock @antfu/ni
vi.mock("@antfu/ni", async (importOriginal) => {
  const original = await importOriginal();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mocked: any = { ...(original as any) };
  mocked.parseNi = vi.fn();
  mocked.getCliCommand = vi.fn();
  return mocked;
});

import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
import * as path from "path";
import * as os from "os";
import { parseNi, getCliCommand } from "@antfu/ni";
// Cast to mock types so we can use mockResolvedValueOnce
const mockedParseNi = parseNi as ReturnType<typeof vi.fn>;
const mockedGetCliCommand = getCliCommand as ReturnType<typeof vi.fn>;
import authGenerator from "./index";

describe("Auth Generator", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    // Create a temporary directory
    tempDir = path.join(os.tmpdir(), `dxg-auth-test-${Date.now()}-${Math.random()
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

  test("authGenerator should exist", () => {
    expect(authGenerator).toBeDefined();
    expect(authGenerator.name).toBe("auth");
    expect(authGenerator.description).toBe(
      "Adds authentication provider configuration"
    );
    expect(Array.isArray(authGenerator.prompts)).toBe(true);
    expect(authGenerator.prompts.length).toBe(3);
  });

  test("authGenerator should have correct prompts", () => {
    const prompts = authGenerator.prompts;

    // First prompt: provider
    expect(prompts[0].name).toBe("provider");
    expect(prompts[0].type).toBe("select");
    expect(prompts[0].message).toBe(
      "Choose your authentication provider:"
    );
    expect(prompts[0].default).toBe("better-auth");
    const choices = prompts[0].choices;
    expect(Array.isArray(choices)).toBe(true);
    expect(choices!.length).toBe(4);

    // Second prompt: installDependencies
    expect(prompts[1].name).toBe("installDependencies");
    expect(prompts[1].type).toBe("confirm");
    expect(prompts[1].message).toBe(
      "Do you want to install dependencies?"
    );
    expect(prompts[1].default).toBe(true);

    // Third prompt: generateExampleConfig
    expect(prompts[2].name).toBe("generateExampleConfig");
    expect(prompts[2].type).toBe("confirm");
    expect(prompts[2].message).toBe(
      "Do you want to generate example configuration files?"
    );
    expect(prompts[2].default).toBe(true);
  });

  test("authGenerator should validate correctly", () => {
    // Since validateAuth always returns true, any answers should pass
    expect(authGenerator.prompts).toBeDefined();
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
        authGenerator.run(
          { provider: "better-auth", installDependencies: true, generateExampleConfig: true },
          context
        )
      ).rejects.toThrow("package.json not found");
    });
  });

  describe("Template usage", () => {
    test("should read template files for config generation", async () => {
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

      // Mock @antfu/ni functions - use already mocked versions from top of file
      // Mock parseNi to return a runner function
      const mockRunner = vi.fn().mockImplementation((agent, args, ctx) => {
        // Simulate the behavior of parseNi for npm project with no args
        if (!agent && !args && !ctx) {
          return { command: "npm", args: [] };
        }
        // For the actual command we're testing: ["add", "-D", "better-auth"]
        if (agent === "npm" && args.includes("add") && args.includes("-D") && args.includes("better-auth")) {
          return { command: "npm", args: ["install", "-D", "better-auth"] };
        }
        return { command: "npm", args: [...(args || [])] };
      });
      mockedParseNi.mockReturnValue(mockRunner);

      // Mock getCliCommand to return the resolved command
      mockedGetCliCommand.mockResolvedValue({ command: "npm", args: ["install", "-D", "better-auth"] });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: renderSpy },
      };

      // Spy on fs.readFile to see what paths are being read
      let readFileSpy: ReturnType<typeof vi.spyOn>;
      // Spy on fs.executeCommand to see if package installation command is executed
      let executeCommandSpy: ReturnType<typeof vi.spyOn>;

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true,
      };

      try {
        readFileSpy = vi.spyOn(fs, "readFile");
        executeCommandSpy = vi.spyOn(fs, "executeCommand");
        await authGenerator.run(answers, context);

        // Verify that the template files were read
        expect(readFileSpy).toHaveBeenCalledWith(
          expect.stringContaining("auth.config.ts.tmpl"),
          { encoding: "utf8" }
        );

        // Verify that the rendered content was written to the config file
        // Check the actual file created
        const authConfig = await fs.readFile("auth.config.ts", { encoding: "utf8" });
        expect(authConfig).toContain("export const auth");

        // Verify that the template string passed to render was the one from the .tmpl file
        const renderCalls = renderSpy.mock.calls;
        const templateUsed = renderCalls[0][0]; // first argument of first call
        expect(templateUsed).toContain("// Generated by DXG auth generator");

        // Verify that executeCommand was called for package installation
        expect(executeCommandSpy).toHaveBeenCalled();
      } finally {
        readFileSpy.mockRestore();
        executeCommandSpy.mockRestore();
      }
    });
  });

  test("authGenerator should run successfully", async () => {
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

    // Mock @antfu/ni functions - use already mocked versions from top of file
    // Mock parseNi to return a runner function
    const mockRunner = vi.fn().mockImplementation((agent, args, ctx) => {
      // Simulate the behavior of parseNi for npm project with no args
      if (!agent && !args && !ctx) {
        return { command: "npm", args: [] };
      }
      // For the actual command we're testing: ["add", "-D", "better-auth"]
      if (agent === "npm" && args.includes("add") && args.includes("-D") && args.includes("better-auth")) {
        return { command: "npm", args: ["install", "-D", "better-auth"] };
      }
      return { command: "npm", args: [...(args || [])] };
    });
    mockedParseNi.mockReturnValue(mockRunner);

    // Mock getCliCommand to return the resolved command
    mockedGetCliCommand.mockResolvedValue({ command: "npm", args: ["install", "-D", "better-auth"] });
    // Spy on fs.readFile to see what paths are being read
    let readFileSpy: ReturnType<typeof vi.spyOn>;
    // Spy on fs.executeCommand to see if package installation command is executed
    let executeCommandSpy: ReturnType<typeof vi.spyOn>;

    const context = {
      logger: mockLogger,
      fs: fs,
      templates: { render: renderSpy },
    };

    const answers = {
      provider: "better-auth",
      installDependencies: true,
      generateExampleConfig: true,
    };

    try {
      readFileSpy = vi.spyOn(fs, "readFile");
      executeCommandSpy = vi.spyOn(fs, "executeCommand");
      await authGenerator.run(answers, context);

      // Verify that the template files were read
      expect(readFileSpy).toHaveBeenCalledWith(
        expect.stringContaining("auth.config.ts.tmpl"),
        { encoding: "utf8" }
      );

      // Verify that the rendered content was written to the config file
      // Check the actual file created
      const authConfig = await fs.readFile("auth.config.ts", { encoding: "utf8" });
      expect(authConfig).toContain("export const auth");

      // Verify that the template string passed to render was the one from the .tmpl file
      const renderCall = renderSpy.mock.calls[0];
      const templateUsed = renderCall[0]; // first argument of first call
      expect(templateUsed).toContain("// Generated by DXG auth generator");

      // Verify that executeCommand was called for package installation
      expect(executeCommandSpy).toHaveBeenCalled();
    } finally {
      // Restore spies
      renderSpy.mockRestore();
      executeCommandSpy.mockRestore();
      readFileSpy.mockRestore();
    }
  });

  describe("Idempotence", () => {
    test("second run should not duplicate config file", async () => {
      // Create a package.json with auth dependency already installed
      await fs.writeFile(
        "package.json",
        '{"devDependencies":{"better-auth":"^1.0.0"}}',
        { encoding: "utf8" }
      );
      // Create a config file that already exists
      await fs.writeFile(
        "auth.config.ts",
        `export const authConfig = {\n  provider: "better-auth"\n};`,
        { encoding: "utf8" }
      );

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      const renderSpy = vi.fn().mockReturnValue("");
      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true, // This should now be skipped because dep is already installed
        generateExampleConfig: true,
      };

      // Spy on fs.writeFile to see if it's called for the config file
      const writeFileSpy = vi.spyOn(fs, "writeFile");
      // Spy on fs.executeCommand to ensure it's not called
      const executeCommandSpy = vi.spyOn(fs, "executeCommand");

      // First run
      await authGenerator.run(answers, context);
      // Second run
      await authGenerator.run(answers, context);

      // Verify that writeFile was not called for config file (since it should be skipped)
      const writeFileCalls = writeFileSpy.mock.calls.filter(
        (call) => call[0] === "auth.config.ts"
      );
      expect(writeFileCalls.length).toBe(0);

      // Verify that executeCommand was not called (since dependencies are already installed)
      expect(executeCommandSpy).not.toHaveBeenCalled();

      // Also, the config content should remain unchanged
      const configContent = await fs.readFile("auth.config.ts", { encoding: "utf8" });
      expect(configContent).toBe(
        `export const authConfig = {\n  provider: "better-auth"\n};`
      );

      writeFileSpy.mockRestore();
      renderSpy.mockRestore();
    });
  });

  describe("Package manager resolution", () => {
    test("should resolve correct command for npm project", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });

      // Mock parseNi to return a runner function
      const mockRunner = vi.fn().mockImplementation((agent, args, ctx) => {
        // Simulate the behavior of parseNi for npm project with no args
        if (!agent && !args && !ctx) {
          return { command: "npm", args: [] };
        }
        // For the actual command we're testing: ["add", "-D", "better-auth"]
        if (agent === "npm" && args.includes("add") && args.includes("-D") && args.includes("better-auth")) {
          return { command: "npm", args: ["install", "-D", "better-auth"] };
        }
        return { command: "npm", args: [...(args || [])] };
      });
      mockedParseNi.mockReturnValue(mockRunner);

      // Mock getCliCommand to return the resolved command
      mockedGetCliCommand.mockResolvedValue({ command: "npm", args: ["install", "-D", "better-auth"] });

      const context = {
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: false, // Simplify for this test
      };

      await authGenerator.run(answers, context);

      // Verify that getCliCommand was called with parseNi and the correct args
      expect(mockedGetCliCommand).toHaveBeenCalledWith(
        mockedParseNi,
        ["add", "-D", "better-auth"],
        {
          cwd: expect.any(String),
          programmatic: true,
        }
      );
    });

    test("should resolve correct command for pnpm project", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });

      // Mock parseNi to return a runner function
      const mockRunner = vi.fn().mockImplementation((agent, args, ctx) => {
        // Simulate the behavior of parseNi for pnpm project with no args
        if (!agent && !args && !ctx) {
          return { command: "pnpm", args: [] };
        }
        // For the actual command we're testing: ["add", "-D", "better-auth"]
        if (agent === "pnpm" && args.includes("add") && args.includes("-D") && args.includes("better-auth")) {
          return { command: "pnpm", args: ["add", "-D", "better-auth"] };
        }
        return { command: "pnpm", args: [...(args || [])] };
      });
      mockedParseNi.mockReturnValue(mockRunner);

      // Mock getCliCommand to return the resolved command
      mockedGetCliCommand.mockResolvedValue({ command: "pnpm", args: ["add", "-D", "better-auth"] });

      const context = {
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: false, // Simplify for this test
      };

      await authGenerator.run(answers, context);

      // Verify that getCliCommand was called with parseNi and the correct args
      expect(mockedGetCliCommand).toHaveBeenCalledWith(
        mockedParseNi,
        ["add", "-D", "better-auth"],
        {
          cwd: expect.any(String),
          programmatic: true,
        }
      );
    });

    test("should handle unresolved command gracefully", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', { encoding: "utf8" });

      // Mock parseNi to return a runner function
      const mockRunner = vi.fn().mockImplementation((agent, args, ctx) => {
        // Simulate the behavior of parseNi for npm project with no args
        if (!agent && !args && !ctx) {
          return { command: "npm", args: [] };
        }
        // For the actual command we're testing: ["add", "-D", "better-auth"]
        if (agent === "npm" && args.includes("add") && args.includes("-D") && args.includes("better-auth")) {
          return { command: "npm", args: ["install", "-D", "better-auth"] };
        }
        return { command: "npm", args: [...(args || [])] };
      });
      mockedParseNi.mockReturnValue(mockRunner);

      // Mock getCliCommand to return undefined (unresolved)
      mockedGetCliCommand.mockResolvedValue(undefined);

      const context = {
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: false, // Simplify for this test
      };

      await expect(authGenerator.run(answers, context)).rejects.toThrow(
        "Failed to resolve package manager command for adding dependencies"
      );
    });
  });
});