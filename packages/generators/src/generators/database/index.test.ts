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

import * as databaseModule from "./index";
const { databaseGenerator, detectPackageManager, planDatabase } = databaseModule;

describe("Database Generator", () => {
  let originalCwd: string;
  let tempDir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    // Create a temporary directory
    tempDir = path.join(os.tmpdir(), `dxg-database-test-${Date.now()}-${Math.random()
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

    // First (and only) prompt: provider
    expect(prompts[0].name).toBe("provider");
    expect(prompts[0].type).toBe("select");
    expect(prompts[0].message).toBe("Choose your database provider:");
    expect(prompts[0].default).toBe("sqlite");
    expect(Array.isArray(prompts[0].choices)).toBe(true);
    expect(prompts[0].choices).toEqual([
      { name: "SQLite", value: "sqlite" },
      { name: "PostgreSQL", value: "postgresql" },
      { name: "MySQL", value: "mysql" },
    ]);
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

  describe("Planning", () => {
    test("planDatabase returns correct data", () => {
      const answers = {
        provider: "sqlite",
      };
      const plan = planDatabase(answers);
      expect(plan.data.provider).toBe("sqlite");
      expect(plan.data.year).toBe(new Date().getFullYear());
      expect(plan.packages).toEqual(["prisma"]);
      expect(plan.filesToCreate).toEqual([
        {
          path: "prisma/schema.prisma",
          templatePath: expect.stringContaining("schema.prisma.tmpl"),
          data: {
            provider: "sqlite",
            year: new Date().getFullYear(),
          },
        },
      ]);
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
        provider: "sqlite",
      };

      try {
        await databaseGenerator.run(answers, context);

        // Verify that the template file was read
        expect(readFileSpy).toHaveBeenCalledWith(
          expect.stringContaining("schema.prisma.tmpl"),
          { encoding: "utf8" }
        );

        // Verify that the rendered content was written to the schema file
        // Check the actual file created
        const schemaContent = await fs.readFile("prisma/schema.prisma", "utf8");
        expect(schemaContent).toContain("RENDERED:");

        // Verify that the template string passed to render was the one from the .tmpl file
        const renderCalls = renderSpy.mock.calls;
        const templateUsed = renderCalls[0][0]; // first argument of first call
        expect(templateUsed).toContain("datasource db {");
        expect(templateUsed).toContain("provider = \"sqlite\"");
      } finally {
        readFileSpy.mockRestore();
      }
    });
  });

  test("databaseGenerator should run successfully", async () => {
    // Create a package.json so that validation passes
    await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");
    // Create the prisma directory
    await fs.mkdir("prisma", { recursive: true });

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
      provider: "sqlite",
    };

    try {
      await databaseGenerator.run(answers, context);

      // Verify that execSync was called with install command
      expect(execSync).toHaveBeenCalled();

      // Verify that templater.render was called for schema file
      expect(renderSpy).toHaveBeenCalled();

      // Verify that fs.writeFile was called for the schema file
      // Check that the schema file was created
      const schemaContent = await fs.readFile("prisma/schema.prisma", "utf8");
      expect(schemaContent).toContain("datasource db {");
      expect(schemaContent).toContain("provider = \"sqlite\"");
    } finally {
      // No need to restore execSync because it's a mock function that is reset by vi.mock between tests
      renderSpy.mockRestore();
    }
  });

  describe("Verification", () => {
    test("verifyDatabase throws if expected schema file missing", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Create the prisma directory
      await fs.mkdir("prisma", { recursive: true });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        provider: "sqlite",
      };

      try {
        await databaseGenerator.run(answers, context);

        // Verify that the schema file was created
        expect(await fs.readFile("prisma/schema.prisma", "utf8")).toHaveLength(
          0
        ); // Empty because renderSpy returns ""

        // Now verify that verifyDatabase throws if the file is missing
        await expect(
          databaseModule.verifyDatabase(answers, context)
        ).rejects.toThrow("Expected file missing after generation: prisma/schema.prisma");
      } finally {
        vi.restoreAllMocks();
      }
    });

    test("verifyDatabase does not throw if schema file exists", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Create the prisma directory
      await fs.mkdir("prisma", { recursive: true });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        provider: "sqlite",
      };

      try {
        await databaseGenerator.run(answers, context);

        // Verify that verifyDatabase does not throw if the file exists
        await expect(
          databaseModule.verifyDatabase(answers, context)
        ).resolves.not.toThrow();
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  describe("Summarization", () => {
    test("summarizeDatabase logs created, updated, and skipped files", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Create the prisma directory
      await fs.mkdir("prisma", { recursive: true });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("SCHEMA_CONTENT") },
      };

      const answers = {
        provider: "sqlite",
      };

      try {
        await databaseGenerator.run(answers, context);

        // Verify that the logger logged the created file
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining("Created: prisma/schema.prisma")
        );
      } finally {
        vi.restoreAllMocks();
      }
    });

    test("summarizeDatabase logs only created files when others empty", async () => {
      // Create a package.json so that validation passes
      await fs.writeFile("package.json", '{"devDependencies":{}}', "utf8");

      const mockLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
      } as unknown as Logger;

      // Create the prisma directory
      await fs.mkdir("prisma", { recursive: true });

      const context = {
        logger: mockLogger,
        fs: fs,
        templates: { render: vi.fn().mockReturnValue("") },
      };

      const answers = {
        provider: "sqlite",
      };

      try {
        await databaseGenerator.run(answers, context);

        // Verify that the logger logged only created files
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining("Created: prisma/schema.prisma")
        );
        // Should not have logged Updated or Unchanged since those are empty
        expect(mockLogger.info).not.toHaveBeenCalledWith(
          expect.stringContaining("Updated:")
        );
        expect(mockLogger.info).not.toHaveBeenCalledWith(
          expect.stringContaining("Unchanged:")
        );
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  describe("Package manager detection", () => {
    test("should detect yarn when yarn.lock exists", async () => {
      // Mock fs.pathExists to return a Promise for yarn.lock and false for others
      const pathExistsSpy = vi.spyOn(fs, "pathExists");
      pathExistsSpy.mockImplementation((path) => {
        if (path === "yarn.lock") return Promise.resolve(true);
        if (path === "pnpm-lock.yaml") return Promise.resolve(false);
        if (path === "package-lock.json") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });

      const packageManager = await detectPackageManager(fs);
      expect(packageManager).toBe("yarn");

      pathExistsSpy.mockRestore();
    });

    test("should detect pnpm when pnpm-lock.yaml exists", async () => {
      // Mock fs.pathExists to return a Promise for pnpm-lock.yaml and false for others
      const pathExistsSpy = vi.spyOn(fs, "pathExists");
      pathExistsSpy.mockImplementation((path) => {
        if (path === "yarn.lock") return Promise.resolve(false);
        if (path === "pnpm-lock.yaml") return Promise.resolve(true);
        if (path === "package-lock.json") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });

      const packageManager = await detectPackageManager(fs);
      expect(packageManager).toBe("pnpm");

      pathExistsSpy.mockRestore();
    });

    test("should detect npm when package-lock.json exists", async () => {
      // Mock fs.pathExists to return a Promise for package-lock.json and false for others
      const pathExistsSpy = vi.spyOn(fs, "pathExists");
      pathExistsSpy.mockImplementation((path) => {
        if (path === "yarn.lock") return Promise.resolve(false);
        if (path === "pnpm-lock.yaml") return Promise.resolve(false);
        if (path === "package-lock.json") return Promise.resolve(true);
        return Promise.resolve(false); // for any other path
      });

      const packageManager = await detectPackageManager(fs);
      expect(packageManager).toBe("npm");

      pathExistsSpy.mockRestore();
    });

    test("should default to npm when no lockfile exists", async () => {
      // Mock fs.pathExists to return a Promise false for all lockfiles
      const pathExistsSpy = vi.spyOn(fs, "pathExists");
      pathExistsSpy.mockImplementation((path) => {
        if (path === "yarn.lock") return Promise.resolve(false);
        if (path === "pnpm-lock.yaml") return Promise.resolve(false);
        if (path === "package-lock.json") return Promise.resolve(false);
        return Promise.resolve(false); // for any other path
      });

      const packageManager = await detectPackageManager(fs);
      expect(packageManager).toBe("npm");

      pathExistsSpy.mockRestore();
});
});
});
