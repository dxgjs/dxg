import { describe, it, expect, beforeEach } from "vitest";
import { createAstHandle, addNpmScript, addNpmScripts, ensureGitignoreEntry } from "./json.js";
import { createMemoryFS } from "@dxgjs/fs/testing";

describe("@dxgjs/ast JSON handling", () => {
  let fs: ReturnType<typeof createMemoryFS>;

  beforeEach(() => {
    fs = createMemoryFS({});
  });

  describe("createAstHandle", () => {
    it("parses package.json and preserves formatting", async () => {
      fs = createMemoryFS({
        "package.json": `{
  "name": "my-app",
  "version": "1.0.0",
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  }
}`,
      });

      const handle = await createAstHandle(fs, "package.json");
      expect(handle.ast.name).toBe("my-app");
      expect(handle.ast.scripts.dev).toBe("next dev");
    });

    it("preserves key order when adding new script", async () => {
      fs = createMemoryFS({
        "package.json": `{
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  }
}`,
      });

      const handle = await createAstHandle(fs, "package.json");
      handle.ast.scripts.test = "vitest run";
      await handle.write();

      const result = await fs.readFile("package.json", "utf-8");
      const devIndex = result.indexOf('"dev"');
      const buildIndex = result.indexOf('"build"');
      const testIndex = result.indexOf('"test"');
      expect(devIndex).toBeLessThan(buildIndex);
      expect(buildIndex).toBeLessThan(testIndex);
    });
  });

  describe("addNpmScript", () => {
    it("adds new script to empty scripts object", async () => {
      fs = createMemoryFS({
        "package.json": `{"name": "test"}`,
      });

      const added = await addNpmScript(fs, "test", "vitest run");
      expect(added).toBe(true);

      const result = JSON.parse(await fs.readFile("package.json", "utf-8"));
      expect(result.scripts.test).toBe("vitest run");
    });

    it("does not overwrite existing script", async () => {
      fs = createMemoryFS({
        "package.json": `{"scripts": {"test": "jest"}}`,
      });

      const added = await addNpmScript(fs, "test", "vitest run");
      expect(added).toBe(false);

      const result = JSON.parse(await fs.readFile("package.json", "utf-8"));
      expect(result.scripts.test).toBe("jest");
    });

    it("preserves formatting when adding to existing scripts", async () => {
      fs = createMemoryFS({
        "package.json": `{
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  }
}`,
      });

      await addNpmScript(fs, "test", "vitest run");

      const result = await fs.readFile("package.json", "utf-8");
      expect(result).toContain('"dev": "next dev"');
      expect(result).toContain('"build": "next build"');
      expect(result).toContain('"test": "vitest run"');
    });
  });

  describe("addNpmScripts", () => {
    it("adds multiple scripts at once", async () => {
      fs = createMemoryFS({
        "package.json": `{"scripts": {"dev": "next dev"}}`,
      });

      const added = await addNpmScripts(fs, {
        build: "next build",
        test: "vitest run",
        lint: "eslint .",
      });

      expect(added).toEqual(["build", "test", "lint"]);

      const result = JSON.parse(await fs.readFile("package.json", "utf-8"));
      expect(result.scripts.build).toBe("next build");
      expect(result.scripts.test).toBe("vitest run");
      expect(result.scripts.lint).toBe("eslint .");
    });

    it("skips already existing scripts", async () => {
      fs = createMemoryFS({
        "package.json": `{"scripts": {"dev": "next dev", "build": "next build"}}`,
      });

      const added = await addNpmScripts(fs, {
        dev: "next dev -p 3001", // Should not overwrite
        test: "vitest run",
      });

      expect(added).toEqual(["test"]);

      const result = JSON.parse(await fs.readFile("package.json", "utf-8"));
      expect(result.scripts.dev).toBe("next dev"); // Unchanged
      expect(result.scripts.test).toBe("vitest run");
    });
  });

  describe("ensureGitignoreEntry", () => {
    it("creates .gitignore if missing", async () => {
      fs = createMemoryFS({});

      const added = await ensureGitignoreEntry(fs, ".env");
      expect(added).toBe(true);

      const result = await fs.readFile(".gitignore", "utf-8");
      expect(result).toBe(".env\n");
    });

    it("appends to existing .gitignore", async () => {
      fs = createMemoryFS({
        ".gitignore": "node_modules\n",
      });

      const added = await ensureGitignoreEntry(fs, ".env");
      expect(added).toBe(true);

      const result = await fs.readFile(".gitignore", "utf-8");
      expect(result).toBe("node_modules\n.env\n");
    });

    it("does not duplicate existing entry", async () => {
      fs = createMemoryFS({
        ".gitignore": "node_modules\n.env\n",
      });

      const added = await ensureGitignoreEntry(fs, ".env");
      expect(added).toBe(false);

      const result = await fs.readFile(".gitignore", "utf-8");
      // Should not have duplicate .env
      const lines = result.split("\n").filter((l) => l.trim() === ".env");
      expect(lines.length).toBe(1);
    });

    it("handles entries with whitespace", async () => {
      fs = createMemoryFS({
        ".gitignore": "node_modules\n",
      });

      const added = await ensureGitignoreEntry(fs, "  .env  ");
      expect(added).toBe(true);

      const result = await fs.readFile(".gitignore", "utf-8");
      expect(result).toContain(".env\n");
    });
  });
});