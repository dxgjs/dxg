import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
import * as path from "path";
import * as os from "os";

let authModule: typeof import("./index");
let execSync: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  // Mock child_process
  vi.mock("child_process", () => ({
    execSync: vi.fn(),
  }));
  // Import the mocked execSync
  const childProcess = await import("child_process");
  execSync = childProcess.execSync;
  // Import the auth module
  authModule = await import("./index");
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
  });

  describe("metadata", () => {
    test("should have correct name", () => {
      expect(authModule.authGenerator.name).toBe("auth");
    });

    test("should have correct description", () => {
      expect(authModule.authGenerator.description).toBe("Adds authentication provider configuration");
    });

    test("should have prompts array", () => {
      expect(Array.isArray(authModule.authGenerator.prompts)).toBe(true);
      expect(authModule.authGenerator.prompts.length).toBe(3);
    });
  });

  describe("prompts", () => {
    test("should have provider prompt", () => {
      const providerPrompt = authModule.authGenerator.prompts.find(p => p.name === "provider");
      expect(providerPrompt).toBeDefined();
      expect(providerPrompt?.type).toBe("select");
      expect(providerPrompt?.message).toBe("Choose your authentication provider:");
      expect(providerPrompt?.default).toBe("better-auth");
      expect(providerPrompt?.choices).toHaveLength(4);
      const choiceValues = authModule.authGenerator.prompts.find(p => p.name === "provider")?.choices.map(c => c.value);
      expect(choiceValues).toEqual(["better-auth", "auth.js", "clerk", "lucia"]);
    });

    test("should have installDependencies prompt", () => {
      const installPrompt = authModule.authGenerator.prompts.find(p => p.name === "installDependencies");
      expect(installPrompt).toBeDefined();
      expect(installPrompt?.type).toBe("confirm");
      expect(installPrompt?.message).toBe("Do you want to install dependencies?");
      expect(installPrompt?.default).toBe(true);
    });

    test("should have generateExampleConfig prompt", () => {
      const configPrompt = authModule.authGenerator.prompts.find(p => p.name === "generateExampleConfig");
      expect(configPrompt).toBeDefined();
      expect(configPrompt?.type).toBe("confirm");
      expect(configPrompt?.message).toBe("Do you want to generate example configuration files?");
      expect(configPrompt?.default).toBe(true);
    });
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
        authModule.authGenerator.run(
          { provider: "better-auth", installDependencies: true, generateExampleConfig: true },
          context
        )
      ).rejects.toThrow("package.json not found. Please initialize your project (e.g., npm init) before running dxg add auth.");
    });
  });

  describe("Planning", () => {
    test("planAuth returns correct data and files for better-auth", () => {
      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };
      const plan = authModule.planAuth(answers);
      expect(plan.data).toEqual({
        provider: "better-auth",
        providerName: "betterAuth",
        providerPackage: "better-auth",
        year: expect.any(Number)
      });
      expect(plan.packages).toEqual(["better-auth"]);
      expect(plan.filesToCreate).toHaveLength(1);
      expect(plan.filesToCreate[0].path).toBe("auth.config.ts");
      expect(plan.filesToCreate[0].templatePath).toContain("auth.config.ts.tmpl");
      expect(plan.filesToCreate[0].data).toEqual(plan.data);
    });

    test("planAuth returns correct data for auth.js", () => {
      const answers = {
        provider: "auth.js",
        installDependencies: false,
        generateExampleConfig: true
      };
      const plan = authModule.planAuth(answers);
      expect(plan.data.provider).toBe("auth.js");
      expect(plan.data.providerName).toBe("auth");
      expect(plan.data.providerPackage).toBe("@auth/core");
      expect(plan.packages).toHaveLength(0); // installDependencies false
      expect(plan.filesToCreate).toHaveLength(1);
    });

    test("planAuth returns correct data for clerk", () => {
      const answers = {
        provider: "clerk",
        installDependencies: true,
        generateExampleConfig: false
      };
      const plan = authModule.planAuth(answers);
      expect(plan.data.provider).toBe("clerk");
      expect(plan.data.providerName).toBe("clerk");
      expect(plan.data.providerPackage).toBe("@clerk/clerk-react");
      expect(plan.packages).toEqual(["@clerk/clerk-react"]);
      expect(plan.filesToCreate).toHaveLength(0);
    });

    test("planAuth returns correct data for lucia", () => {
      const answers = {
        provider: "lucia",
        installDependencies: false,
        generateExampleConfig: false
      };
      const plan = authModule.planAuth(answers);
      expect(plan.data.provider).toBe("lucia");
      expect(plan.data.providerName).toBe("lucia");
      expect(plan.data.providerPackage).toBe("lucia");
      expect(plan.packages).toHaveLength(0);
      expect(plan.filesToCreate).toHaveLength(0);
    });
  });

  describe("Template usage", () => {
    test("should read template file for config generation", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Spy on fs.readFile to see what paths are being read
      const readFileSpy = vi.spyOn(fs, "readFile");
      // Mock templates.render to return a known string
      const renderSpy = vi.fn().mockImplementation((template, data) => {
        return `RENDERED:${template}:${JSON.stringify(data)}`;
      });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        await authModule.authGenerator.run(answers, context);

        // Verify that the template file was read
        expect(readFileSpy).toHaveBeenCalledWith(
          expect.stringContaining("auth.config.ts.tmpl"),
          { encoding: "utf8" }
        );

        // Verify that the rendered content was written to the config file
        const authConfig = await fs.readFile("auth.config.ts", "utf8");
        expect(authConfig).toContain("RENDERED:");

        // Verify that the template string passed to render was the one from the .tmpl file
        const renderCalls = renderSpy.mock.calls;
        const templateUsed = renderCalls[0][0]; // first argument of first call
        expect(templateUsed).toContain("import { {{providerName}} } from \"{{providerPackage}}\";");
        expect(templateUsed).toContain("export const auth = {{providerName}}({");
      } finally {
        readFileSpy.mockRestore();
      }
    });
  });

  describe("Execution", () => {
    test("should run successfully with dependency installation and config generation", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock the authModule functions
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false); // not installed
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        await authModule.authGenerator.run(answers, context);

        // Verify that execSync was called with install command
        expect(execSync).toHaveBeenCalled();
        // Check that the command includes the package and is dev dependency
        const execCall = execSync.mock.calls[0][0];
        expect(execCall).toMatch(/npm install -D better-auth/);

        // Verify that templater.render was called for config file
        expect(renderSpy).toHaveBeenCalled();

        // Verify that fs.writeFile was called for the config file
        // Check that the file was created
        const authConfig = await fs.readFile("auth.config.ts", "utf8");
        expect(authConfig).toBe(""); // because renderSpy returns empty string
      } finally {
        renderSpy.mockRestore();
      }
    });

    test("should skip dependency installation when already installed", async () => {
      // Create a package.json that already has the dependency installed
      await fs.writeFile("package.json", '{"devDependencies":{"better-auth":"^1.0.0"}}', "utf8");

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
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        await authModule.authGenerator.run(answers, context);

        // Should NOT call execSync for installation (already installed)
        expect(execSync).not.toHaveBeenCalled();

        // Verify that templater.render was called for config file
        expect(renderSpy).toHaveBeenCalled();

        // Verify that fs.writeFile was called for the config file
        const authConfig = await fs.readFile("auth.config.ts", "utf8");
        expect(authConfig).toBe("");

        // Additionally, we can check that the logger logged the skip message
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining("already detected. Skipping dependency installation.")
          );
      } finally {
        renderSpy.mockRestore();
      }
    });

    test("should create config file when installDependencies is false", async () => {
      // Create a package.json so that validation passes
      // Make sure it does NOT have the better-auth dependency installed
      await fs.writeFile("package.json", '{"devDependencies":{"other-package":"^1.0.0"}}', "utf8");

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
        provider: "better-auth",
        installDependencies: false,
        generateExampleConfig: true
      };

      try {
        await authModule.authGenerator.run(answers, context);

        // Should NOT call execSync for installation (installDependencies is false)
        expect(execSync).not.toHaveBeenCalled();

        // Verify that templater.render was called for config file
        expect(renderSpy).toHaveBeenCalled();

        // Verify that fs.writeFile was called for the config file
        const authConfig = await fs.readFile("auth.config.ts", "utf8");
        expect(authConfig).toBe("");

        // Additionally, we can verify that the logger would have logged that it's checking installation
        // (though we don't need to check this specifically for this test)
      } finally {
        renderSpy.mockRestore();
      }
    });

    test("should not create config file when generateExampleConfig is false", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock the authModule functions
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: false
      };

      try {
        await authModule.authGenerator.run(answers, context);

        // Dependency installation should happen
        expect(execSync).toHaveBeenCalled();

        // Verify that templater.render was NOT called for config file
        expect(renderSpy).not.toHaveBeenCalled();

        // Verify that auth.config.ts was NOT created
        const exists = await fs.pathExists("auth.config.ts");
        expect(exists).toBe(false);
      } finally {
        renderSpy.mockRestore();
      }
    });
  });

  describe("Idempotence", () => {
    test("second run should not duplicate config file or rewrite identical content", async () => {
      // Create a package.json
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock the authModule functions
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Mock templates.render to return a fixed string (simulating the rendered template)
      const renderedContent = "// Rendered auth config\nconsole.log('hi');";
      const renderSpy = vi.fn().mockReturnValue(renderedContent);

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      // Spy on fs.writeFile to see if it's called for the config file
      const writeFileSpy = vi.spyOn(fs, "writeFile");

      // First run
      await authModule.authGenerator.run(answers, context);
      // Second run
      await authModule.authGenerator.run(answers, context);

      // Verify that writeFile was called exactly once (first run creates, second run skips because content identical)
      const writeFileCalls = writeFileSpy.mock.calls.filter(
        (call) => call[0] === "auth.config.ts"
      );
      expect(writeFileCalls.length).toBe(1);

      // Also, the file content should be the rendered content
      const authConfig = await fs.readFile("auth.config.ts", "utf8");
      expect(authConfig).toBe(renderedContent);

      writeFileSpy.mockRestore();
    });

    test("second run should update config file if template changed (simulated by different render)", async () => {
      // Create a package.json
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock the authModule functions
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // First render returns content A
      const renderSpy = vi.fn()
        .mockReturnValueOnce("// Template A")
        .mockReturnValueOnce("// Template B"); // second call returns different content

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      // Spy on fs.writeFile
      const writeFileSpy = vi.spyOn(fs, "writeFile");

      // First run
      await authModule.authGenerator.run(answers, context);
      // Second run
      await authModule.authGenerator.run(answers, context);

      // Verify that writeFile was called twice (first creation, second update because content differs)
      const writeFileCalls = writeFileSpy.mock.calls.filter(
        (call) => call[0] === "auth.config.ts"
      );
      expect(writeFileCalls.length).toBe(2);

      // Second call should have written the second template content
      expect(writeFileCalls[1][1]).toBe("// Template B");

      writeFileSpy.mockRestore();
    });
  });

  describe("Verification", () => {
    test("verifyAuth throws if expected config file missing", async () => {
      const answers = {
        provider: "better-auth",
        installDependencies: false,
        generateExampleConfig: true
      };
      const plan = authModule.planAuth(answers);

      const context = {
        logger: { info: vi.fn(), error: vi.fn() } as unknown as Logger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      // Do not create the file
      await expect(authModule.verifyAuth(answers, context, plan)).rejects.toThrow(
        "Expected file missing after generation: auth.config.ts"
      );
    });

    test("verifyAuth does not throw if config file exists", async () => {
      const answers = {
        provider: "better-auth",
        installDependencies: false,
        generateExampleConfig: true
      };
      const plan = authModule.planAuth(answers);

      const context = {
        logger: { info: vi.fn(), error: vi.fn() } as unknown as Logger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      // Create the file
      await fs.writeFile("auth.config.ts", "// dummy", "utf8");

      await expect(authModule.verifyAuth(answers, context, plan)).resolves.not.toThrow();
    });
  });

  describe("Summarization", () => {
    test("summarizeAuth logs created, updated, and skipped files", () => {
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      const result = {
        created: ["auth.config.ts"],
        updated: ["other.ts"],
        skipped: ["same.ts"]
      };

      authModule.summarizeAuth({}, result, {
        logger: mockLogger
      } as any);

      expect(mockLogger.info).toHaveBeenCalledWith(" Created: auth.config.ts");
      expect(mockLogger.info).toHaveBeenCalledWith(" Updated: other.ts");
      expect(mockLogger.info).toHaveBeenCalledWith(" Unchanged: same.ts");
      expect(mockLogger.info).toHaveBeenCalledWith(" Auth generator completed successfully");
    });

    test("summarizeAuth logs only created files when others empty", () => {
      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      const result = {
        created: ["auth.config.ts", "another.ts"],
        updated: [],
        skipped: []
      };

      authModule.summarizeAuth({}, result, {
        logger: mockLogger
      } as any);

      expect(mockLogger.info).toHaveBeenCalledWith(" Created: auth.config.ts, another.ts");
      expect(mockLogger.info).toHaveBeenCalledWith(" Auth generator completed successfully");
      // Ensure updated and unchanged not called
      expect(mockLogger.info.mock.calls.length).toBe(2);
    });
  });

  describe("Error handling", () => {
    test("should handle template read failure", async () => {
      // Create a package.json
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs.readFile to throw error for template path
      const readFileSpy = vi.spyOn(fs, "readFile")
        .mockImplementation(async (filePath, _options) => {
          if (filePath.endsWith("auth.config.ts.tmpl")) {
            throw new Error("Template read failed");
          }
          // For package.json, return empty object
          if (filePath === "package.json") {
            return "{}";
          }
          return "";
        });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      await expect(authModule.authGenerator.run(answers, context)).rejects.toThrow(
        "Failed to read template file"
      );

      readFileSpy.mockRestore();
    });

    test("should handle write failure", async () => {
      // Create a package.json
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs.writeFile to throw error
      const writeFileSpy = vi.spyOn(fs, "writeFile")
        .mockImplementation(async (filePath, _data, _options) => {
          if (filePath === "auth.config.ts") {
            throw new Error("Write failed");
          }
          // For other files, resolve normally
          return Promise.resolve();
        });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      // Mock isAuthInstalled and detectPackageManager
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      await expect(authModule.authGenerator.run(answers, context)).rejects.toThrow(
        "Write failed"
      );

      writeFileSpy.mockRestore();
    });

    test("should handle dependency installation failure", async () => {
      // Create a package.json
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock isAuthInstalled and detectPackageManager
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Mock templates.render to return a simple string
      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      // Mock execSync to throw error for dependency installation
      execSync.mockImplementationOnce(() => {
        throw new Error("Installation failed");
      });

      await expect(authModule.authGenerator.run(answers, context)).rejects.toThrow(
        "Failed to install dependencies"
      );
    });

    test("should handle verification failure", async () => {
      // Create a package.json
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs.pathExists to return false for the config file after execution
      const pathExistsSpy = vi.spyOn(fs, "pathExists")
        .mockImplementation(async (filePath) => {
          if (filePath === "package.json") return true;
          if (filePath === "auth.config.ts.tmpl") return true; // template exists
          return false; // config file missing
        });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      // Mock isAuthInstalled and detectPackageManager
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      await expect(authModule.authGenerator.run(answers, context)).rejects.toThrow(
        "Expected file missing after generation: auth.config.ts"
      );

      pathExistsSpy.mockRestore();
    });
  });
});