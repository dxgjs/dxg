import { describe, test, expect } from "vitest";
import { detectWorkspace, detectProjectAwareness } from "./src/index";
import * as path from "path";
import { tmpdir } from "os";
import { mkdir, rm, writeFile } from "fs/promises";

describe("Workspace Detection", () => {
  test("should detect workspace with pnpm-workspace.yaml", async () => {
    // Create a temporary directory for testing
    const testDir = path.join(tmpdir(), `dxg-workspace-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    try {
      // Create pnpm-workspace.yaml
      await writeFile(
        path.join(testDir, "pnpm-workspace.yaml"),
        'packages:\n  - "packages/pkg-a"\n',
        { encoding: "utf8" },
      );
      // Create package.json
      await writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({
          name: "test-root",
          private: true,
          workspaces: { packages: ["packages/pkg-a"] },
        }),
        { encoding: "utf8" },
      );
      // Create a package directory
      await mkdir(path.join(testDir, "packages", "pkg-a"), { recursive: true });
      await writeFile(
        path.join(testDir, "packages", "pkg-a", "package.json"),
        JSON.stringify({ name: "pkg-a", version: "1.0.0" }),
        { encoding: "utf8" },
      );

      const result = await detectWorkspace(testDir);
      expect(result.root).toBe(testDir);
      expect(result.projects.length).toBeGreaterThan(0);
      // Should find the root package and the workspace package
      const projectNames = result.projects.map((p) => p.name);
      expect(projectNames).toContain("test-root");
      expect(projectNames).toContain("pkg-a");
    } finally {
      // Clean up test directory
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("should detect workspace with turbo.json", async () => {
    // Create a temporary directory for testing
    const testDir = path.join(tmpdir(), `dxg-workspace-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    try {
      // Create turbo.json
      await writeFile(path.join(testDir, "turbo.json"), "{}", {
        encoding: "utf8",
      });
      // Create package.json
      await writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({ name: "test-root", private: true }),
        { encoding: "utf8" },
      );

      const result = await detectWorkspace(testDir);
      expect(result.root).toBe(testDir);
      expect(result.projects.length).toBe(1); // Only root since no workspaces defined
      expect(result.projects[0].name).toBe("test-root");
    } finally {
      // Clean up test directory
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("should detect workspace with nx.json", async () => {
    // Create a temporary directory for testing
    const testDir = path.join(tmpdir(), `dxg-workspace-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    try {
      // Create nx.json
      await writeFile(path.join(testDir, "nx.json"), "{}", {
        encoding: "utf8",
      });
      // Create package.json
      await writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({ name: "test-root", private: true }),
        { encoding: "utf8" },
      );

      const result = await detectWorkspace(testDir);
      expect(result.root).toBe(testDir);
    } finally {
      // Clean up test directory
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("should detect workspace with lerna.json", async () => {
    // Create a temporary directory for testing
    const testDir = path.join(tmpdir(), `dxg-workspace-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    try {
      // Create lerna.json
      await writeFile(path.join(testDir, "lerna.json"), "{}", {
        encoding: "utf8",
      });
      // Create package.json
      await writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({ name: "test-root", private: true }),
        { encoding: "utf8" },
      );

      const result = await detectWorkspace(testDir);
      expect(result.root).toBe(testDir);
    } finally {
      // Clean up test directory
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("should throw error when no workspace files found", async () => {
    // Create a temporary directory for testing
    const testDir = path.join(tmpdir(), `dxg-workspace-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    try {
      // Create only a package.json (no workspace files)
      await writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({ name: "test-root", private: true }),
        { encoding: "utf8" },
      );

      await expect(detectWorkspace(testDir)).rejects.toThrow(
        "No workspace root found",
      );
    } finally {
      // Clean up test directory
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("should handle nested directory structure", async () => {
    // Create a temporary directory for testing
    const testDir = path.join(tmpdir(), `dxg-workspace-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    try {
      // Create workspace files in a subdirectory
      const subDir = path.join(testDir, "sub");
      await mkdir(subDir, { recursive: true });
      await writeFile(
        path.join(subDir, "pnpm-workspace.yaml"),
        'packages:\n  - "packages/pkg-b"\n',
        { encoding: "utf8" },
      );
      await writeFile(
        path.join(subDir, "package.json"),
        JSON.stringify({
          name: "sub-root",
          private: true,
          workspaces: { packages: ["packages/pkg-b"] },
        }),
        { encoding: "utf8" },
      );
      // Create a package directory
      await mkdir(path.join(subDir, "packages", "pkg-b"), { recursive: true });
      await writeFile(
        path.join(subDir, "packages", "pkg-b", "package.json"),
        JSON.stringify({ name: "pkg-b", version: "2.0.0" }),
        { encoding: "utf8" },
      );

      // Call detectWorkspace with custom root (subDir)
      const result = await detectWorkspace(subDir);
      expect(result.root).toBe(subDir);
      expect(result.projects.length).toBeGreaterThan(0);
      const projectNames = result.projects.map((p) => p.name);
      expect(projectNames).toContain("sub-root");
      expect(projectNames).toContain("pkg-b");
    } finally {
      // Clean up test directory
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("should use custom root when provided", async () => {
    // Create a temporary directory for testing
    const testDir = path.join(tmpdir(), `dxg-workspace-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });

    try {
      // Create workspace files in a subdirectory
      const subDir = path.join(testDir, "sub");
      await mkdir(subDir, { recursive: true });
      await writeFile(
        path.join(subDir, "pnpm-workspace.yaml"),
        'packages:\n  - "packages/pkg-b"\n',
        { encoding: "utf8" },
      );
      await writeFile(
        path.join(subDir, "package.json"),
        JSON.stringify({
          name: "sub-root",
          private: true,
          workspaces: { packages: ["packages/pkg-b"] },
        }),
        { encoding: "utf8" },
      );

      // Call detectWorkspace with custom root
      const result = await detectWorkspace(subDir);
      expect(result.root).toBe(subDir);
      expect(result.projects.length).toBeGreaterThan(0);
    } finally {
      // Clean up test directory
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("should calculate workspace dependencies", async () => {
    // Create a temporary directory for testing
    const testDir = path.join(
      tmpdir(),
      `dxg-workspace-deps-test-${Date.now()}`,
    );
    await mkdir(testDir, { recursive: true });

    try {
      // Create workspace definition file (pnpm-workspace.yaml)
      await writeFile(
        path.join(testDir, "pnpm-workspace.yaml"),
        'packages:\n  - "packages/pkg-a"\n  - "packages/pkg-b"\n',
        { encoding: "utf8" },
      );

      // Create root package.json with workspaces
      await writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({
          name: "test-root",
          private: true,
          workspaces: { packages: ["packages/pkg-a", "packages/pkg-b"] },
        }),
        { encoding: "utf8" },
      );

      // Create package a (depends on package b)
      await mkdir(path.join(testDir, "packages", "pkg-a"), { recursive: true });
      await writeFile(
        path.join(testDir, "packages", "pkg-a", "package.json"),
        JSON.stringify({
          name: "pkg-a",
          version: "1.0.0",
          dependencies: {
            "pkg-b": "workspace:*",
            lodash: "^4.17.21", // external dep
          },
          devDependencies: {
            typescript: "^5.0.0", // external dev dep
          },
        }),
        { encoding: "utf8" },
      );

      // Create package b (no dependencies)
      await mkdir(path.join(testDir, "packages", "pkg-b"), { recursive: true });
      await writeFile(
        path.join(testDir, "packages", "pkg-b", "package.json"),
        JSON.stringify({
          name: "pkg-b",
          version: "2.0.0",
        }),
        { encoding: "utf8" },
      );

      const result = await detectWorkspace(testDir);
      expect(result.root).toBe(testDir);
      expect(result.projects.length).toBe(3); // root + pkg-a + pkg-b

      // Find projects by name
      const rootProject = result.projects.find((p) => p.name === "test-root");
      const pkgAproject = result.projects.find((p) => p.name === "pkg-a");
      const pkgBproject = result.projects.find((p) => p.name === "pkg-b");

      // Root should have no workspace dependencies (it doesn't depend on workspace packages)
      expect(rootProject?.workspaceDependencies).toEqual([]);

      // pkg-a should depend on pkg-b (workspace dependency)
      expect(pkgAproject?.workspaceDependencies).toEqual(["pkg-b"]);

      // pkg-b should have no workspace dependencies
      expect(pkgBproject?.workspaceDependencies).toEqual([]);
    } finally {
      // Clean up test directory
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("should handle various dependency types", async () => {
    // Create a temporary directory for testing
    const testDir = path.join(
      tmpdir(),
      `dxg-workspace-deps-types-test-${Date.now()}`,
    );
    await mkdir(testDir, { recursive: true });

    try {
      // Create workspace definition file (pnpm-workspace.yaml)
      await writeFile(
        path.join(testDir, "pnpm-workspace.yaml"),
        'packages:\n  - "packages/pkg-a"\n  - "packages/pkg-b"\n  - "packages/pkg-c"\n',
        { encoding: "utf8" },
      );

      // Create root package.json with workspaces
      await writeFile(
        path.join(testDir, "package.json"),
        JSON.stringify({
          name: "test-root",
          private: true,
          workspaces: {
            packages: ["packages/pkg-a", "packages/pkg-b", "packages/pkg-c"],
          },
        }),
        { encoding: "utf8" },
      );

      // Create package a with different types of dependencies
      await mkdir(path.join(testDir, "packages", "pkg-a"), { recursive: true });
      await writeFile(
        path.join(testDir, "packages", "pkg-a", "package.json"),
        JSON.stringify({
          name: "pkg-a",
          version: "1.0.0",
          dependencies: {
            "pkg-b": "^1.0.0", // regular dependency
          },
          devDependencies: {
            "pkg-c": "^2.0.0", // dev dependency
          },
          peerDependencies: {
            "pkg-d": "^3.0.0", // peer dependency (not in workspace, so should be ignored)
          },
        }),
        { encoding: "utf8" },
      );

      // Create package b and c
      await mkdir(path.join(testDir, "packages", "pkg-b"), { recursive: true });
      await writeFile(
        path.join(testDir, "packages", "pkg-b", "package.json"),
        JSON.stringify({ name: "pkg-b", version: "1.0.0" }),
        { encoding: "utf8" },
      );

      await mkdir(path.join(testDir, "packages", "pkg-c"), { recursive: true });
      await writeFile(
        path.join(testDir, "packages", "pkg-c", "package.json"),
        JSON.stringify({ name: "pkg-c", version: "1.0.0" }),
        { encoding: "utf8" },
      );

      const result = await detectWorkspace(testDir);
      expect(result.root).toBe(testDir);

      // Find pkg-a project
      const pkgAproject = result.projects.find((p) => p.name === "pkg-a");

      // Should have both pkg-b (from dependencies) and pkg-c (from devDependencies)
      expect(pkgAproject?.workspaceDependencies).toEqual(
        expect.arrayContaining(["pkg-b", "pkg-c"]),
      );
      expect(pkgAproject?.workspaceDependencies.length).toBe(2);
    } finally {
      // Clean up test directory
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe("detectProjectAwareness", () => {
    test("should detect project awareness for standalone project", async () => {
      // Create a temporary directory for testing
      const testDir = path.join(tmpdir(), `dxg-awareness-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      try {
        // Create a package.json with some dependencies
        await writeFile(
          path.join(testDir, "package.json"),
          JSON.stringify({
            name: "test-project",
            version: "1.0.0",
            dependencies: {
              lodash: "^4.17.21",
            },
            devDependencies: {
              jest: "^27.0.0",
            },
          }),
          { encoding: "utf8" },
        );

        const result = await detectProjectAwareness(testDir);

        // Check basic properties
        expect(result.projectRoot).toBe(testDir);
        expect(result.workspaceRoot).toBe(testDir); // Same as project root for standalone
        expect(result.language).toEqual(
          expect.objectContaining({
            name: "javascript",
            detected: true,
          }),
        );
        expect(result.packageManager).toBe("unknown"); // No lockfile, so unknown
        expect(result.styling).toEqual(
          expect.objectContaining({
            detected: false,
          }),
        );
        expect(result.framework).toEqual(
          expect.objectContaining({
            detected: false,
          }),
        );
        expect(result.capabilities).toEqual(
          expect.objectContaining({
            hasTests: false,
            hasLinting: false,
            hasFormatter: false,
            hasCI: false,
            hasDocker: false,
          }),
        );
      } finally {
        // Clean up test directory
        await rm(testDir, { recursive: true, force: true });
      }
    });

    test("should detect project awareness for workspace project", async () => {
      // Create a temporary directory for testing
      const testDir = path.join(tmpdir(), `dxg-awareness-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      try {
        // Create workspace files
        await writeFile(
          path.join(testDir, "pnpm-workspace.yaml"),
          'packages:\n  - "packages/*"\n',
          { encoding: "utf8" },
        );
        await writeFile(
          path.join(testDir, "package.json"),
          JSON.stringify({
            name: "test-root",
            private: true,
            workspaces: { packages: ["packages/*"] },
          }),
          { encoding: "utf8" },
        );

        // Create a package directory with a lockfile to test package manager detection
        await mkdir(path.join(testDir, "packages", "test-pkg"), {
          recursive: true,
        });
        await writeFile(
          path.join(testDir, "packages", "test-pkg", "package.json"),
          JSON.stringify({ name: "test-pkg", version: "1.0.0" }),
          { encoding: "utf8" },
        );
        await writeFile(
          path.join(testDir, "pnpm-lock.yaml"),
          "# pnpm lockfile",
          { encoding: "utf8" },
        );

        const result = await detectProjectAwareness(testDir);

        // Check basic properties
        expect(result.projectRoot).toBe(testDir);
        expect(result.workspaceRoot).toBe(testDir);
        expect(result.packageManager).toBe("pnpm"); // Should detect pnpm from lockfile
        expect(result.language).toEqual(
          expect.objectContaining({
            name: "javascript",
            detected: true,
          }),
        );
      } finally {
        // Clean up test directory
        await rm(testDir, { recursive: true, force: true });
      }
    });

    test("should detect framework (Next.js)", async () => {
      // Create a temporary directory for testing
      const testDir = path.join(tmpdir(), `dxg-awareness-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      try {
        // Create a package.json with Next.js dependency
        await writeFile(
          path.join(testDir, "package.json"),
          JSON.stringify({
            name: "nextjs-app",
            version: "1.0.0",
            dependencies: {
              next: "^13.0.0",
              react: "^18.0.0",
              "react-dom": "^18.0.0",
            },
          }),
          { encoding: "utf8" },
        );

        const result = await detectProjectAwareness(testDir);

        // Should detect Next.js framework
        expect(result.framework).toEqual(
          expect.objectContaining({
            name: "next",
            detected: true,
            version: "13.0.0",
          }),
        );
      } finally {
        // Clean up test directory
        await rm(testDir, { recursive: true, force: true });
      }
    });

    test("should detect styling (Tailwind CSS)", async () => {
      // Create a temporary directory for testing
      const testDir = path.join(tmpdir(), `dxg-awareness-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      try {
        // Create a package.json with Tailwind dependency and config file
        await writeFile(
          path.join(testDir, "package.json"),
          JSON.stringify({
            name: "tailwind-app",
            version: "1.0.0",
            dependencies: {
              tailwindcss: "^3.0.0",
            },
          }),
          { encoding: "utf8" },
        );
        await writeFile(
          path.join(testDir, "tailwind.config.js"),
          "module.exports = { content: ['./src/**/*.{js,ts,jsx,tsx}'] };",
          { encoding: "utf8" },
        );

        const result = await detectProjectAwareness(testDir);

        // Should detect Tailwind styling
        expect(result.styling).toEqual(
          expect.objectContaining({
            name: "tailwindcss",
            detected: true,
          }),
        );
      } finally {
        // Clean up test directory
        await rm(testDir, { recursive: true, force: true });
      }
    });

    test("should detect capabilities", async () => {
      // Create a temporary directory for testing
      const testDir = path.join(tmpdir(), `dxg-awareness-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      try {
        // Create a package.json with test, lint, and format scripts
        await writeFile(
          path.join(testDir, "package.json"),
          JSON.stringify({
            name: "capable-app",
            version: "1.0.0",
            scripts: {
              test: "jest",
              lint: "eslint src",
              format: "prettier --write src",
            },
            devDependencies: {
              jest: "^27.0.0",
              eslint: "^8.0.0",
              prettier: "^2.0.0",
            },
          }),
          { encoding: "utf8" },
        );

        const result = await detectProjectAwareness(testDir);

        // Should detect capabilities
        expect(result.capabilities).toEqual(
          expect.objectContaining({
            hasTests: true,
            hasLinting: true,
            hasFormatter: true,
          }),
        );
      } finally {
        // Clean up test directory
        await rm(testDir, { recursive: true, force: true });
      }
    });

    test("should handle nested directory (call from subdirectory)", async () => {
      // Create a temporary directory for testing
      const testDir = path.join(tmpdir(), `dxg-awareness-test-${Date.now()}`);
      await mkdir(testDir, { recursive: true });

      try {
        // Create workspace files in subdirectory
        const subDir = path.join(testDir, "sub");
        await mkdir(subDir, { recursive: true });
        await writeFile(
          path.join(subDir, "package.json"),
          JSON.stringify({
            name: "sub-project",
            version: "1.0.0",
            dependencies: {
              express: "^4.18.0",
            },
          }),
          { encoding: "utf8" },
        );

        // Call detectProjectAwareness from subdirectory
        const result = await detectProjectAwareness(subDir);

        // Should still detect correctly from subdirectory
        expect(result.projectRoot).toBe(subDir);
        expect(result.workspaceRoot).toBe(subDir); // No workspace found, so same as project root
        expect(result.language).toEqual(
          expect.objectContaining({
            name: "javascript",
            detected: true,
          }),
        );
        expect(result.packageManager).toBe("unknown"); // No lockfile
      } finally {
        // Clean up test directory
        await rm(testDir, { recursive: true, force: true });
      }
    });
  });
});
