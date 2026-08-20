import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "@dxgjs/logger";
import * as fs from "@dxgjs/fs";
import * as path from "path";
import * as os from "os";

// Mock child_process BEFORE importing modules that use it
vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

// Import the mocked execSync
import { execSync } from "child_process";

import * as authModule from './index';

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

  describe("Metadata", () => {
    test("should have correct name", () => {
      expect(authModule.authGenerator.name).toBe("auth");
      expect(authModule.authGenerator.description).toBe(
        "Adds authentication provider configuration"
      );
      expect(Array.isArray(authModule.authGenerator.prompts)).toBe(true);
      expect(authModule.authGenerator.prompts.length).toBe(3);
    });

    test("should have correct description", () => {
      expect(authModule.authGenerator.description).toBe(
        "Adds authentication provider configuration"
      );
    });

    test("should have prompts array", () => {
      expect(Array.isArray(authModule.authGenerator.prompts)).toBe(true);
      expect(authModule.authGenerator.prompts.length).toBe(3);
    });
  });

  describe("Prompts", () => {
    test("should have provider prompt", () => {
      const prompts = authModule.authGenerator.prompts;
      expect(prompts[0].name).toBe("provider");
      expect(prompts[0].type).toBe("select");
      expect(prompts[0].message).toBe(
        "Choose your authentication provider:"
      );
      expect(prompts[0].default).toBe("better-auth");
      expect(Array.isArray(prompts[0].choices)).toBe(true);
      expect(prompts[0].choices).toEqual([
        { name: "Better Auth", value: "better-auth" },
        { name: "Auth.js", value: "auth.js" },
        { name: "Clerk", value: "clerk" },
        { name: "Lucia", value: "lucia" },
      ]);
    });

    test("should have installDependencies prompt", () => {
      const prompts = authModule.authGenerator.prompts;
      expect(prompts[1].name).toBe("installDependencies");
      expect(prompts[1].type).toBe("confirm");
      expect(prompts[1].message).toBe(
        "Do you want to install dependencies?"
      );
      expect(prompts[1].default).toBe(true);
    });

    test("should have generateExampleConfig prompt", () => {
      const prompts = authModule.authGenerator.prompts;
      expect(prompts[2].name).toBe("generateExampleConfig");
      expect(prompts[2].type).toBe("confirm");
      expect(prompts[2].message).toBe(
        "Do you want to generate example configuration files?"
      );
      expect(prompts[2].default).toBe(true);
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
      ).rejects.toThrow("package.json not found");
    });
  });

  describe("Planning", () => {
    test("planAuth returns correct data and files for better-auth", () => {
      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true,
      };
      const plan = authModule.planAuth(answers);
      expect(plan.data.provider).toBe("better-auth");
      expect(plan.data.providerName).toBe("betterAuth");
      expect(plan.data.providerPackage).toBe("better-auth");
      expect(plan.data.year).toBe(new Date().getFullYear());
      expect(plan.packages).toEqual(["better-auth"]);
      expect(plan.filesToCreate).toEqual([
        {
          path: "auth.config.ts",
          templatePath: expect.stringContaining("auth.config.ts.tmpl"),
          data: {
            provider: "better-auth",
            providerName: "betterAuth",
            providerPackage: "better-auth",
            year: new Date().getFullYear(),
          },
        },
      ]);
    });

    test("planAuth returns correct data for auth.js", () => {
      const answers = {
        provider: "auth.js",
        installDependencies: true,
        generateExampleConfig: true,
      };
      const plan = authModule.planAuth(answers);
      expect(plan.data.provider).toBe("auth.js");
      expect(plan.data.providerName).toBe("auth");
      expect(plan.data.providerPackage).toBe("@auth/core");
      expect(plan.data.year).toBe(new Date().getFullYear());
      expect(plan.packages).toEqual(["@auth/core"]);
      expect(plan.filesToCreate).toEqual([
        {
          path: "auth.config.ts",
          templatePath: expect.stringContaining("auth.config.ts.tmpl"),
          data: {
            provider: "auth.js",
            providerName: "auth",
            providerPackage: "@auth/core",
            year: new Date().getFullYear(),
          },
        },
      ]);
    });

    test("planAuth returns correct data for clerk", () => {
      const answers = {
        provider: "clerk",
        installDependencies: true,
        generateExampleConfig: true,
      };
      const plan = authModule.planAuth(answers);
      expect(plan.data.provider).toBe("clerk");
      expect(plan.data.providerName).toBe("clerk");
      expect(plan.data.providerPackage).toBe("@clerk/clerk-react");
      expect(plan.data.year).toBe(new Date().getFullYear());
      expect(plan.packages).toEqual(["@clerk/clerk-react"]);
      expect(plan.filesToCreate).toEqual([
        {
          path: "auth.config.ts",
          templatePath: expect.stringContaining("auth.config.ts.tmpl"),
          data: {
            provider: "clerk",
            providerName: "clerk",
            providerPackage: "@clerk/clerk-react",
            year: new Date().getFullYear(),
          },
        },
      ]);
    });

    test("planAuth returns correct data for lucia", () => {
      const answers = {
        provider: "lucia",
        installDependencies: true,
        generateExampleConfig: true,
      };
      const plan = authModule.planAuth(answers);
      expect(plan.data.provider).toBe("lucia");
      expect(plan.data.providerName).toBe("lucia");
      expect(plan.data.providerPackage).toBe("lucia");
      expect(plan.data.year).toBe(new Date().getFullYear());
      expect(plan.packages).toEqual(["lucia"]);
      expect(plan.filesToCreate).toEqual([
        {
          path: "auth.config.ts",
          templatePath: expect.stringContaining("auth.config.ts.tmpl"),
          data: {
            provider: "lucia",
            providerName: "lucia",
            providerPackage: "lucia",
            year: new Date().getFullYear(),
          },
        },
      ]);
    });
  });

  describe("Template usage", () => {
    test("should read template file for config generation", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Track which files have been "created"
      const createdFiles = new Set<string>();

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, check if it ends with .tmpl
        if (path.endsWith(".tmpl")) return Promise.resolve(true); // Template file exists
        // For config file check, return true if it has been "created"
        if (path === "auth.config.ts") return Promise.resolve(createdFiles.has(path));
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}'); // Empty dependencies
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          // Return a simple template that will render correctly
          return Promise.resolve(`{{providerName}}`);
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
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
        expect(fsMock.readFile).toHaveBeenCalledWith(
          expect.stringContaining("auth.config.ts.tmpl"),
          { encoding: "utf8" }
        );

        // Verify that templater.render was called for config file
        expect(renderSpy).toHaveBeenCalled();

        // Verify that fs.writeFile was called for the config file
        // Note: We're checking the mock, not the real fs, because we passed fsMock to the context
        expect(fsMock.writeFile).toHaveBeenCalledWith(
          "auth.config.ts",
          "",
          "utf8"
        );
      } finally {
        renderSpy.mockRestore();
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });
  });

  describe("Execution", () => {
    test("should run successfully with dependency installation and config generation", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Track which files have been "created"
      const createdFiles = new Set<string>();

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, check if it ends with .tmpl
        if (path.endsWith(".tmpl")) return Promise.resolve(true); // Template file exists
        // For config file check, return true if it has been "created"
        if (path === "auth.config.ts") return Promise.resolve(createdFiles.has(path));
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}'); // Empty dependencies
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          // Return a simple template that will render correctly
          return Promise.resolve(`{{providerName}}`);
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
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
        expect(execSync).toHaveBeenCalledWith(
          "npm install -D better-auth",
          { stdio: "inherit" }
        );

        // Verify that templater.render was called for config file
        expect(renderSpy).toHaveBeenCalled();

        // Verify that fs.writeFile was called for the config file
        // Note: We're checking the mock, not the real fs, because we passed fsMock to the context
        expect(fsMock.writeFile).toHaveBeenCalledWith(
          "auth.config.ts",
          "",
          "utf8"
        );
      } finally {
        renderSpy.mockRestore();
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });

    test("should skip dependency installation when already installed", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return true (simulating already installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(true);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, return false (file doesn't exist yet)
        if (path === "auth.config.ts") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{"better-auth":"^1.0.0"}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
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
        // Note: We're checking the mock, not the real fs, because we passed fsMock to the context
        expect(fsMock.writeFile).toHaveBeenCalledWith(
          "auth.config.ts",
          "",
          "utf8"
        );

        // Additionally, we can check that the logger logged the skip message
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining("already detected. Skipping dependency installation.")
        );
      } finally {
        renderSpy.mockRestore();
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });

    test("should create config file when installDependencies is false", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, return false (file doesn't exist yet)
        if (path === "auth.config.ts") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
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
        // Note: We're checking the mock, not the real fs, because we passed fsMock to the context
        expect(fsMock.writeFile).toHaveBeenCalledWith(
          "auth.config.ts",
          "",
          "utf8"
        );

        // Additionally, we can check that the logger logged the skip message
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining("better-auth already detected. Skipping dependency installation.")
        );
      } finally {
        renderSpy.mockRestore();
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });
  });

  describe("Idempotence", () => {
    test("second run should not duplicate config file or rewrite identical content", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, first time return false (file doesn't exist), second time return true (file exists)
        if (path === "auth.config.ts") {
          // Track how many times this has been called
          if (!fsMock.pathExists.mock.calls.some(call => call[0] === "auth.config.ts")) {
            return Promise.resolve(false); // First call: file doesn't exist
          }
          return Promise.resolve(true); // Subsequent calls: file exists
        }
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For config file, return the content that was previously written
        if (path === "auth.config.ts") {
          // Return what was previously written (empty string for first write)
          return Promise.resolve('');
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        // First run
        await authModule.authGenerator.run(answers, context);

        // Second run
        await authModule.authGenerator.run(answers, context);

        // Verify that fs.writeFile was only called once for the config file
        // Note: We're checking the mock, not the real fs, because we passed fsMock to the context
        const writeFileCalls = fsMock.writeFile.mock.calls.filter(
          (call) => call[0] === "auth.config.ts"
        );
        expect(writeFileCalls.length).toBe(1);

        // Additionally, we can check that the logger logged the unchanged message on second run
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining("Unchanged: auth.config.ts")
        );
      } finally {
        renderSpy.mockRestore();
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });

    test("second run should update config file if template changed (simulated by different render)", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, first time return false (file doesn't exist), second time return true (file exists)
        if (path === "auth.config.ts") {
          // Track how many times this has been called
          if (!fsMock.pathExists.mock.calls.some(call => call[0] === "auth.config.ts")) {
            return Promise.resolve(false); // First call: file doesn't exist
          }
          return Promise.resolve(true); // Subsequent calls: file exists
        }
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For config file, return the content that was previously written
        if (path === "auth.config.ts") {
          // Track what was written previously
          const writeCall = fsMock.writeFile.mock.calls.find(call => call[0] === "auth.config.ts");
          if (writeCall) {
            return Promise.resolve(writeCall[1]); // Return what was written
          }
          return Promise.resolve(''); // Default to empty string
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return different values on first and second call
      const renderSpy = vi.fn()
        .mockReturnValueOnce("FIRST_RENDER")
        .mockReturnValueOnce("SECOND_RENDER");

      const context = {
        logger,
        fs: fsMock,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        // First run
        await authModule.authGenerator.run(answers, context);

        // Second run
        await authModule.authGenerator.run(answers, context);

        // Verify that fs.writeFile was called twice for the config file (first create, second update)
        // Note: We're checking the mock, not the real fs, because we passed fsMock to the context
        const writeFileCalls = fsMock.writeFile.mock.calls.filter(
          (call) => call[0] === "auth.config.ts"
        );
        expect(writeFileCalls.length).toBe(2);

        // Additionally, we can check that the logger logged the updated message on second run
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining("Updated: auth.config.ts")
        );
      } finally {
        renderSpy.mockRestore();
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });
  });

  describe("Verification", () => {
    test("verifyAuth throws if expected config file missing", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, return false (file doesn't exist yet)
        if (path === "auth.config.ts") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        await authModule.authGenerator.run(answers, context);

        // Verify that the config file was created
        expect(await fsMock.readFile("auth.config.ts", "utf8")).toBe("");

        // Now verify that verifyAuth throws if the file is missing
        await expect(
          authModule.verifyAuth(answers, context)
        ).rejects.toThrow("Expected file missing after generation: auth.config.ts");
      } finally {
        renderSpy.mockRestore();
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });

    test("verifyAuth does not throw if config file exists", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, first time return false (file doesn't exist), then return true (file exists)
        if (path === "auth.config.ts") {
          // Track if we've "created" the file
          if (!fsMock.pathExists.mock.calls.some(call => call[0] === "auth.config.ts" && call.length > 0 && call[0] === "auth.config.ts")) {
            // First few calls: file doesn't exist
            const authConfigTsCalls = fsMock.pathExists.mock.calls.filter(call => call[0] === "auth.config.ts");
            if (authConfigTsCalls.length < 2) {
              return Promise.resolve(false); // File doesn't exist yet
            }
          }
          return Promise.resolve(true); // File exists
        }
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For config file, return the content that was "written"
        if (path === "auth.config.ts") {
          return Promise.resolve(''); // Return what was written (empty string)
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        await authModule.authGenerator.run(answers, context);

        // Verify that verifyAuth does not throw if the file exists
        await expect(
          authModule.verifyAuth(answers, context)
        ).resolves.not.toThrow();
      } finally {
        renderSpy.mockRestore();
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });
  });

  describe("Summarization", () => {
    test("summarizeAuth logs created, updated, and skipped files", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, return false (file doesn't exist yet) - will be created during execution
        if (path === "auth.config.ts") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For config file, return empty string (what gets written)
        if (path === "auth.config.ts") {
          return Promise.resolve('');
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("TEST_CONTENT");

      const context = {
        logger,
        fs: fsMock,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        await authModule.authGenerator.run(answers, context);

        // Verify that the logger logged the created file
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining("Created: auth.config.ts")
        );
      } finally {
        renderSpy.mockRestore();
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });

    test("summarizeAuth logs only created files when others empty", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, return false (file doesn't exist yet) - no config file to create
        if (path === "auth.config.ts") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For config file, return empty string (what gets written)
        if (path === "auth.config.ts") {
          return Promise.resolve('');
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: false // No config file to create
      };

      try {
        await authModule.authGenerator.run(answers, context);

        // Verify that the logger logged only created files (none in this case)
        expect(logger.info).toHaveBeenCalledWith(
          expect.stringContaining("Created: ")
        );
        // Should not have logged Updated or Unchanged since those arrays are empty
        expect(logger.info).not.toHaveBeenCalledWith(
          expect.stringContaining("Updated:")
        );
        expect(logger.info).not.toHaveBeenCalledWith(
          expect.stringContaining("Unchanged:")
        );
      } finally {
        renderSpy.mockRestore();
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });
  });

  describe("Error handling", () => {
    test("should handle template read failure", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (we'll simulate failure differently)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, return false (file doesn't exist yet)
        if (path === "auth.config.ts") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, simulate failure
        if (path.endsWith(".tmpl")) {
          return Promise.reject(new Error("Template file not found"));
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        await expect(
          authModule.authGenerator.run(answers, context)
        ).rejects.toThrow("Failed to read template file");
      } finally {
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });

    test("should handle write failure", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, return false (file doesn't exist yet)
        if (path === "auth.config.ts") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
        templates: { render: renderSpy },
      };

      // Mock fs.writeFile to fail
      const originalWriteFile = fsMock.writeFile;
      fsMock.writeFile = vi.fn().mockImplementation(async (path, data, options) => {
        if (path === "auth.config.ts") {
          throw new Error("Failed to write file");
        }
        return originalWriteFile.call(fsMock, path, data, options);
      });

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        await expect(
          authModule.authGenerator.run(answers, context)
        ).rejects.toThrow("Failed to write file");
      } finally {
        // Restore the original writeFile mock
        fsMock.writeFile = originalWriteFile;
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
      }
    });

    test("should handle dependency installation failure", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, return false (file doesn't exist yet)
        if (path === "auth.config.ts") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        // Mock execSync to throw an error
        (execSync as any).mockImplementation(() => {
          throw new Error("Installation failed");
        });

        await expect(
          authModule.authGenerator.run(answers, context)
        ).rejects.toThrow("Failed to install dependencies");
      } finally {
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
        // execSync mock is reset by vi.mock between tests
      }
    });

    test("should handle verification failure", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const logger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Mock fs
      const fsMock = {
        ...fs,
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mkdir: vi.fn(),
      };

      // Mock isAuthInstalled to return false (simulating not installed)
      vi.spyOn(authModule, "isAuthInstalled").mockResolvedValue(false);
      vi.spyOn(authModule, "detectPackageManager").mockResolvedValue("npm");

      // Setup fs mocks with proper implementation
      fsMock.pathExists.mockImplementation((path) => {
        if (path === "package.json") return Promise.resolve(true);
        // For template file check, return false (file doesn't exist yet)
        if (path.endsWith(".tmpl")) return Promise.resolve(false);
        // For config file check, return false (file doesn't exist yet)
        if (path === "auth.config.ts") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });
      fsMock.readFile.mockImplementation((path, options) => {
        if (path === "package.json") {
          // Handle both modern and legacy fs.readFile signatures
          let encoding: BufferEncoding | null | undefined = null;
          if (options != null && typeof options === 'object' && 'encoding' in options) {
            // Modern signature: options is an object
            encoding = options.encoding;
          } else if (typeof options === 'string' || options === null) {
            // Legacy signature: options is the encoding directly
            encoding = options as BufferEncoding | null | undefined;
          }
          // If encoding is utf8 or not specified (defaults to utf8 in many contexts), return our mock data
          if (encoding === "utf8" || encoding === null || encoding === undefined) {
            return Promise.resolve('{"devDependencies":{}}');
          }
        }
        // For template files, return the template content
        if (path.endsWith(".tmpl")) {
          return Promise.resolve(`{{providerName}}`); // Simple template
        }
        // For any other file, return empty string
        return Promise.resolve('');
      });

      // Mock templates.render to return a simple string
      const renderSpy = vi.fn().mockReturnValue("");

      const context = {
        logger,
        fs: fsMock,
        templates: { render: renderSpy },
      };

      const answers = {
        provider: "better-auth",
        installDependencies: true,
        generateExampleConfig: true
      };

      try {
        await authModule.authGenerator.run(answers, context);

        // Mock fs to make it seem like the file doesn't exist after generation
        const originalPathExists = fsMock.pathExists;
        fsMock.pathExists = vi.fn().mockImplementation(async (path) => {
          if (path === "auth.config.ts") {
            return false; // Simulate file missing
          }
          return originalPathExists.call(fsMock, path);
        });

        await expect(
          authModule.verifyAuth(answers, context)
        ).rejects.toThrow("Expected file missing after generation: auth.config.ts");
      } finally {
        vi.spyOn(authModule, "isAuthInstalled").mockRestore();
        vi.spyOn(authModule, "detectPackageManager").mockRestore();
        // fsMock.pathExists mock is restored implicitly by the finally block closure
      }
    });
  });
});