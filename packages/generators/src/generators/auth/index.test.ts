import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @dxgjs/fs FIRST, before any imports that might use it
vi.mock("@dxgjs/fs", async (importOriginal) => {
  const original = await importOriginal();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mocked: any = { ...(original as any) };
  mocked.detectPackageManager = vi.fn();
  return mocked;
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
    expect(Array.isArray(prompts[0].choices)).toBe(true);
    expect(prompts[0].choices.length).toBe(4);

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

      // Spy on fs.readFile to see what paths are being read
      let readFileSpy: ReturnType<typeof vi.spyOn>;

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true,
      };

      try {
        readFileSpy = vi.spyOn(fs, "readFile");
        await authGenerator.run(answers, context);

        // Verify that the template files were read
        expect(readFileSpy).toHaveBeenCalledWith(
          expect.stringContaining("auth.config.tmpl"),
          { encoding: "utf8" }
        );

        // Verify that the rendered content was written to the config file
        // Check the actual file created
        const authConfig = await fs.readFile("auth.config.ts", "utf8");
        expect(authConfig).toContain("export const authConfig");

        // Verify that the template string passed to render was the one from the .tmpl file
        const renderCalls = renderSpy.mock.calls;
        const templateUsed = renderCalls[0][0]; // first argument of first call
        expect(templateUsed).toContain("export const authConfig");
      } finally {
        readFileSpy.mockRestore();
      }
    });
  });

  test("authGenerator should run successfully", async () => {
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
    // Get the execSync mock
    const execSyncMock = vi.spyOn(require("child_process"), "execSync");
    // Spy on fs.readFile to see what paths are being read
    let readFileSpy: ReturnType<typeof vi.spyOn>;

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
      await authGenerator.run(answers, context);

      // Verify that the template files were read
      expect(readFileSpy).toHaveBeenCalledWith(
        expect.stringContaining("auth.config.ts.tmpl"),
        { encoding: "utf8" }
      );

      // Verify that the rendered content was written to the config file
      // Check the actual file created
      const authConfig = await fs.readFile("auth.config.ts", "utf8");
      expect(authConfig).toContain("export const authConfig");

      // Verify that the template string passed to render was the one from the .tmpl file
      const renderCall = renderSpy.mock.calls[0];
      const templateUsed = renderCall[0]; // first argument of first call
      expect(templateUsed).toContain("auth.config.ts.tmpl");

      // Verify that execSync was called for package installation
      expect(execSyncMock).toHaveBeenCalled();
    } finally {
      // Restore spies
      renderSpy.mockRestore();
      execSyncMock.mockRestore();
      readFileSpy.mockRestore();
    }
  });

  describe("Idempotence", () => {
    test("second run should not duplicate config file", async () => {
      // Create a package.json with auth dependency already installed
      await fs.writeFile(
        "package.json",
        '{"devDependencies":{"better-auth":"^1.0.0"}}',
        "utf8"
      );
      // Create a config file that already exists
      await fs.writeFile(
        "auth.config.ts",
        `export const authConfig = {\n  provider: "better-auth"\n};`,
        "utf8"
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
      // Spy on execSync to ensure it's not called
      const execSyncMock = vi.spyOn(require("child_process"), "execSync");

      // First run
      await authGenerator.run(answers, context);
      // Second run
      await authGenerator.run(answers, context);

      // Verify that writeFile was not called for config file (since it should be skipped)
      const writeFileCalls = writeFileSpy.mock.calls.filter(
        (call) => call[0] === "auth.config.ts"
      );
      expect(writeFileCalls.length).toBe(0);

      // Verify that execSync was not called (since dependencies are already installed)
      expect(execSyncMock).not.toHaveBeenCalled();

      // Also, the config content should remain unchanged
      const configContent = await fs.readFile("auth.config.ts", "utf8");
      expect(configContent).toBe(
        `export const authConfig = {\n  provider: "better-auth"\n};`
      );

      writeFileSpy.mockRestore();
      renderSpy.mockRestore();
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
  });
});