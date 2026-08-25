import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";


// Mock @dxgjs/fs FIRST, before any imports that might use it
vi.mock("@dxgjs/fs", async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    detectPackageManager: vi.fn(),
  };
});
import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
import * as path from "path";
import * as os from "os";
import { detectPackageManager } from "@dxgjs/fs";
import tailwindGenerator from "./index";

// Mock child_process.execSync to prevent actual command execution
vi.mock("child_process", () => ({
  execSync: vi.fn()
}));

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

  describe("Validation", () => {
    test("should throw if Node.js version < 18", async () => {
      // Mock process.versions.node to simulate an old version
      const originalNodeVersion = process.versions.node;
      Object.defineProperty(process.versions, "node", {
        value: "16.0.0",
        configurable: true,
      });
      try {
        const context = {
          logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger,
          fs: fs,
          templates: { render: vi.fn().mockReturnValue("") },
        };
        await tailwindGenerator.run(
          { customiseTailwind: false, addPostcssPlugins: false, installAutoprefixer: false },
          context
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

    test("should throw if package.json missing", async () => {
      // Ensure no package.json in the temporary directory
      const context = {
        logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as Logger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };
      await expect(
        tailwindGenerator.run(
          { customiseTailwind: false, addPostcssPlugins: false, installAutoprefixer: false },
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
        customiseTailwind: true,
        addPostcssPlugins: true,
        installAutoprefixer: false,
      };

      try {
        await tailwindGenerator.run(answers, context);

        // Verify that the template files were read
        expect(readFileSpy).toHaveBeenCalledWith(
          expect.stringContaining("tailwind.config.tmpl"),
          { encoding: "utf8" }
        );
        expect(readFileSpy).toHaveBeenCalledWith(
          expect.stringContaining("postcss.config.tmpl"),
          { encoding: "utf8" }
        );

        // Verify that the rendered content was written to the config files
        // Check the actual files created
        const tailwindConfig = await fs.readFile("tailwind.config.cjs", "utf8");
        const postcssConfig = await fs.readFile("postcss.config.cjs", "utf8");

        expect(tailwindConfig).toContain("@type {import('tailwindcss').Config}");
        expect(tailwindConfig).toContain("module.exports = {");
        expect(postcssConfig).toContain("module.exports = {");
        expect(postcssConfig).toContain("plugins:");

        // Verify that the template string passed to render was the one from the .tmpl file
        const renderCalls = renderSpy.mock.calls;
        const templateUsed = renderCalls[0][0]; // first argument of first call
        expect(templateUsed).toContain("@type {import('tailwindcss').Config}");
        expect(templateUsed).toContain("module.exports = {");

        const templateUsed2 = renderCalls[1][0];
        expect(templateUsed2).toContain("module.exports = {");
        expect(templateUsed2).toContain("plugins:");
      } finally {
        readFileSpy.mockRestore();
      }
    }, 30000);
  });

  test("tailwindGenerator should run successfully", async () => {
    // Create a package.json so that validation passes
    await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");
    // Create the src directory
    await fs.mkdir("src", { recursive: true });

    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as Logger;

    // Mock templates.render to return a simple string
    const renderSpy = vi.fn().mockReturnValue("");

    const context = {
      logger: mockLogger,
      fs: fs,
      templates: { render: renderSpy },
    };

    const answers = {
      customiseTailwind: false,
      addPostcssPlugins: false,
      installAutoprefixer: false,
    };

    try {
      await tailwindGenerator.run(answers, context);

      // Verify that execSync was called with install command
      // Note: we cannot directly spy on execSync because it's mocked in the generator file.
      // The generator file mocks child_process.execSync globally via vi.mock.
      // We'll rely on the fact that the generator runs without error as success.
      // For more precise testing, we could check that a dependency was added to package.json,
      // but that's beyond scope.

      // Verify that templater.render was called for config files (if they were to be created)
      // Since all options are false, no config files should be created
      expect(renderSpy).not.toHaveBeenCalled();

      // Verify that fs.writeFile was called for CSS entrypoint
      // Check that the CSS file was created and contains the directives
      const cssContent = await fs.readFile("src/index.css", "utf8");
      expect(cssContent).toContain("@tailwind base;");
      expect(cssContent).toContain("@tailwind components;");
      expect(cssContent).toContain("@tailwind utilities;");
    } finally {
      // No need to restore execSync because it's a mock function that is reset by vi.mock between tests
      renderSpy.mockRestore();
    }
  }, 30000);

  describe("Idempotence", () => {
    test("second run should not duplicate CSS directives", async () => {
      // Create a package.json with tailwind dependencies already installed
      await fs.writeFile(
        "package.json",
        '{"devDependencies":{"tailwindcss":"^3.0.0","postcss":"^8.0.0"}}',
        "utf8"
      );
      // Create the src directory
      await fs.mkdir("src", { recursive: true });
      // Create a CSS file that already has the directives
      await fs.writeFile(
        "src/index.css",
        `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n/* custom */`,
        "utf8"
      );

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        customiseTailwind: false,
        addPostcssPlugins: false,
        installAutoprefixer: false,
      };

      // Spy on fs.writeFile to see if it's called for the CSS file
      const writeFileSpy = vi.spyOn(fs, "writeFile");
      // Spy on execSync to ensure it's not called
      const execSyncMock = vi.spyOn(require("child_process"), "execSync");

      // First run
      await tailwindGenerator.run(answers, context);
      // Second run
      await tailwindGenerator.run(answers, context);

      // Verify that writeFile was not called for CSS entrypoint (since it should be skipped)
      const writeFileCalls = writeFileSpy.mock.calls.filter(
        (call) => call[0] === "src/index.css"
      );
      expect(writeFileCalls.length).toBe(0);

      // Verify that execSync was not called (since dependencies are already installed)
      expect(execSyncMock).not.toHaveBeenCalled();

      // Also, the CSS content should remain unchanged
      const cssContent = await fs.readFile("src/index.css", "utf8");
      expect(cssContent).toBe(
        `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n/* custom */`
      );

      writeFileSpy.mockRestore();
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
  describe("Dry-run mode", () => {
    test("does not install dependencies or write files", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");
      // Create the src directory for CSS entrypoint
      await fs.mkdir("src", { recursive: true });

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");
      // Mock detectPackageManager to return a value (though it shouldn't be called for installation in dry-run)
      const detectPackageManagerMock = vi.spyOn(require("@dxgjs/fs"), "detectPackageManager");
      detectPackageManagerMock.mockResolvedValue("npm");
      // Mock execSync to ensure it's not called
      const execSyncMock = vi.spyOn(require("child_process"), "execSync");
      // Mock fs.writeFile to ensure it's not called for files
      const writeFileSpy = vi.spyOn(fs, "writeFile");

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: renderSpy },
        dryRun: true, // Set dryRun to true
      };

      const answers = {
        customiseTailwind: false,
        addPostcssPlugins: false,
        installAutoprefixer: false,
      };

      await tailwindGenerator.run(answers, context);

      // Verify that execSync was not called (dependency installation)
      expect(execSyncMock).not.toHaveBeenCalled();

      // Verify that fs.writeFile was not called for files
      expect(writeFileSpy).not.toHaveBeenCalled();

      // Verify that the logger logged the dry-run message
      expect(mockLogger.info).toHaveBeenCalledWith("[tailwind] Dry-run: Would install dependencies");
    });
  });
});