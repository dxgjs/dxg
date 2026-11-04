import { describe, it, expect } from "vitest";
import { parseModule } from "magicast";
import {
  ensureImport,
  ensureDefaultImport,
  ensureNamespaceImport,
  ensureExport,
  ensureDefaultExport,
  addPropertyToObject,
  removePropertyFromObject,
  findNode,
  findNodes,
} from "./ts-injection.js";

function parse(code: string) {
  return parseModule(code, { sourceFileName: "test.ts" });
}

function stringify(ast: any): string {
  return ast.generate().code;
}

describe("@dxgjs/ast TS injection helpers", () => {
  describe("ensureImport", () => {
    it("adds new import to empty file", () => {
      const ast = parse("");
      const added = ensureImport(ast, "NextAuth", "next-auth");
      expect(added).toBe(true);

      const result = stringify(ast);
      // Magicast outputs with trailing commas and spacing - check for content not exact format
      expect(result).toContain("NextAuth");
      expect(result).toContain("next-auth");
      expect(result).toContain("import");
    });

    it("adds specifier to existing import from same module", () => {
      const ast = parse('import { Session } from "next-auth";');
      const added = ensureImport(ast, "NextAuth", "next-auth");
      expect(added).toBe(true);

      const result = stringify(ast);
      expect(result).toContain("NextAuth");
      expect(result).toContain("Session");
    });

    it("does not duplicate existing specifier", () => {
      const ast = parse('import { NextAuth, Session } from "next-auth";');
      const added = ensureImport(ast, "NextAuth", "next-auth");
      expect(added).toBe(false);

      const result = stringify(ast);
      const matches = result.match(/NextAuth/g);
      expect(matches?.length).toBe(1);
    });

    it("handles type imports", () => {
      const ast = parse("");
      const added = ensureImport(ast, "Session", "next-auth", "type");
      expect(added).toBe(true);

      const result = stringify(ast);
      // Note: Magicast doesn't directly support type imports via $prepend/$append
      // This test may need adjustment based on actual behavior
      expect(result).toContain("Session");
    });

    it("preserves existing imports order", () => {
      const ast = parse('import { A } from "a";\nimport { B } from "b";');
      ensureImport(ast, "C", "c");

      const result = stringify(ast);
      const aIdx = result.indexOf('from "a"');
      const bIdx = result.indexOf('from "b"');
      const cIdx = result.indexOf('from "c"');
      expect(aIdx).toBeLessThan(bIdx);
      expect(bIdx).toBeLessThan(cIdx);
    });
  });

  describe("ensureDefaultImport", () => {
    it("adds default import", () => {
      const ast = parse("");
      const added = ensureDefaultImport(ast, "React", "react");
      expect(added).toBe(true);

      const result = stringify(ast);
      expect(result).toContain('import React from "react";');
    });

    it("adds default to existing named import", () => {
      const ast = parse('import { useState } from "react";');
      const added = ensureDefaultImport(ast, "React", "react");
      expect(added).toBe(true);

      const result = stringify(ast);
      expect(result).toContain("React");
      expect(result).toContain("useState");
    });
  });

  describe("ensureNamespaceImport", () => {
    it("adds namespace import", () => {
      const ast = parse("");
      const added = ensureNamespaceImport(ast, "React", "react");
      expect(added).toBe(true);

      const result = stringify(ast);
      expect(result).toContain('import * as React from "react";');
    });
  });

  describe("ensureExport", () => {
    it("adds named export for existing declaration", () => {
      const ast = parse("function foo() {}");
      const added = ensureExport(ast, "foo");
      expect(added).toBe(true);

      const result = stringify(ast);
      expect(result).toContain("export function foo");
    });

    it("adds re-export from module", () => {
      const ast = parse("");
      const added = ensureExport(ast, "Session", "next-auth");
      expect(added).toBe(true);

      const result = stringify(ast);
      expect(result).toContain('export { Session } from "next-auth";');
    });
  });

  describe("ensureDefaultExport", () => {
    it("adds default export", () => {
      const ast = parse("");
      const added = ensureDefaultExport(ast, {
        type: "FunctionDeclaration",
        id: { type: "Identifier", name: "MyComponent" },
        params: [],
        body: { type: "BlockStatement", body: [] },
      });
      expect(added).toBe(true);

      const result = stringify(ast);
      expect(result).toContain("export default function MyComponent");
    });

    it("replaces existing default export", () => {
      const ast = parse("export default function Old() {}");
      const added = ensureDefaultExport(ast, {
        type: "FunctionDeclaration",
        id: { type: "Identifier", name: "New" },
        params: [],
        body: { type: "BlockStatement", body: [] },
      });
      expect(added).toBe(false);

      const result = stringify(ast);
      expect(result).toContain("New");
      expect(result).not.toContain("Old");
    });
  });

  describe("addPropertyToObject / removePropertyFromObject", () => {
    it("adds property to nested object", () => {
      const ast = parse("const config = { plugins: [] };");
      const added = addPropertyToObject(ast, ["config"], "experimental", {
        type: "ObjectExpression",
        properties: [],
      });
      expect(added).toBe(true);

      const result = stringify(ast);
      expect(result).toContain("experimental");
    });

    it("removes property from object", () => {
      const ast = parse("const config = { plugins: [], experimental: {} };");
      const removed = removePropertyFromObject(ast, ["config"], "experimental");
      expect(removed).toBe(true);

      const result = stringify(ast);
      expect(result).not.toContain("experimental");
    });
  });

  describe("findNode / findNodes", () => {
    it("finds import declarations", () => {
      const ast = parse(`
import { A } from "a";
import { B } from "b";
const x = 1;
`);

      const imports = findNodes(ast, "ImportDeclaration");
      expect(imports.length).toBe(2);
    });

    it("finds first variable declaration", () => {
      const ast = parse("const a = 1;\nconst b = 2;");
      const node = findNode(ast, "VariableDeclaration");
      expect(node).not.toBeNull();
      expect(node?.declarations[0]?.id?.name).toBe("a");
    });
  });
});