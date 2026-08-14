import { describe, test, expect } from "vitest";
import { detectWorkspace } from "./src/index";
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
});
