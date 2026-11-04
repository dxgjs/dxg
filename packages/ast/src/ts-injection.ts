/**
 * TypeScript/JavaScript AST injection helpers using Magicast.
 * For modifying source files (middleware.ts, next.config.js, app/layout.tsx, etc.)
 * while preserving formatting, comments, and structure.
 */

import { parseModule, writeFile, type ProxifiedModule, type ProxifiedImportsMap, type ProxifiedImportItem, type ImportItemInput } from "magicast";
import { resolve, relative, sep } from "path";
import { realpathSync } from "fs";

/** Resolve and validate a file path stays within the allowed base directory */
function resolveAndValidate(filePath: string, baseDir?: string): string {
  const base = baseDir ?? process.cwd();
  const resolvedBase = realpathSync(base);
  const requested = resolve(base, filePath);
  const resolved = realpathSync(requested);

  // Verify the resolved path stays within the base directory
  const relativePath = relative(resolvedBase, resolved);
  if (relativePath.startsWith("..") || relativePath.startsWith(sep) || relativePath === "") {
    throw new Error(`Path traversal attempt blocked: ${filePath}`);
  }

  return resolved;
}

/** Import specifier kinds */
export type ImportKind = "value" | "type" | "typeof";

/** Parse a source file and return a proxied module for mutation */
export async function parseSourceFile(filePath: string, baseDir?: string): Promise<ProxifiedModule> {
  const { readFile } = await import("@dxgjs/fs");
  const resolvedPath = resolveAndValidate(filePath, baseDir);
  const content = await readFile(resolvedPath, "utf-8");
  const contentStr = typeof content === "string" ? content : new TextDecoder().decode(content);
  // Use sourceFileName for source map generation
  return parseModule(contentStr, { sourceFileName: resolvedPath } as any);
}

/** Write a proxied module back to file */
export async function writeSourceFile(ast: ProxifiedModule, filePath: string, baseDir?: string): Promise<void> {
  const resolvedPath = resolveAndValidate(filePath, baseDir);
  await writeFile(ast as any, resolvedPath);
}

/** Get mutable imports map with $prepend/$append/$items */
function getImportsMap(ast: ProxifiedModule): ProxifiedImportsMap & { $prepend: (item: ImportItemInput) => void; $append: (item: ImportItemInput) => void; $items: ProxifiedImportItem[] } {
  return ast.imports as any;
}

/** Check if there's an existing import from the given module */
function hasImportFrom(importsMap: ReturnType<typeof getImportsMap>, from: string): boolean {
  return importsMap.$items?.some((item: ProxifiedImportItem) => item.from === from) ?? false;
}

/** Check if a specific specifier exists in imports from the given module */
function hasSpecifierInModule(importsMap: ReturnType<typeof getImportsMap>, from: string, specifier: string): boolean {
  return importsMap.$items?.some(
    (item: ProxifiedImportItem) => item.from === from && (item.imported === specifier || item.local === specifier)
  ) ?? false;
}

/**
 * Ensure a named import exists in the module.
 * Uses Magicast's imports proxy API.
 */
export function ensureImport(
  ast: ProxifiedModule,
  specifier: string,
  from: string,
  _kind: ImportKind = "value"
): boolean {
  const importsMap = getImportsMap(ast);

  // Check if specifier already exists in any import from this module
  if (hasSpecifierInModule(importsMap, from, specifier)) {
    return false;
  }

  // Check if there's an existing import from this module
  if (hasImportFrom(importsMap, from)) {
    // Add specifier to existing import - Magicast will merge it
    importsMap.$append({
      imported: specifier,
      local: specifier,
      from,
    });
    return true;
  }

  // No import from this module exists - add new import at the end
  importsMap.$append({
    imported: specifier,
    local: specifier,
    from,
  });
  return true;
}

/** Ensure a default import exists */
export function ensureDefaultImport(
  ast: ProxifiedModule,
  specifier: string,
  from: string
): boolean {
  const importsMap = getImportsMap(ast);

  // Check if default import with this local name already exists from this module
  if (importsMap.$items?.some(
    (item: ProxifiedImportItem) => item.from === from && item.imported === "default" && item.local === specifier
  ) ?? false) {
    return false;
  }

  // Check if there's an existing import from this module
  if (hasImportFrom(importsMap, from)) {
    // Add default import to existing import - Magicast will merge it
    importsMap.$append({
      imported: "default",
      local: specifier,
      from,
    });
    return true;
  }

  // No import from this module exists - add new import at the end
  importsMap.$append({
    imported: "default",
    local: specifier,
    from,
  });
  return true;
}

/** Ensure a namespace import exists (import * as name from 'module') */
export function ensureNamespaceImport(
  ast: ProxifiedModule,
  specifier: string,
  from: string
): boolean {
  const importsMap = getImportsMap(ast);

  // Check if namespace import with this local name already exists from this module
  if (importsMap.$items?.some(
    (item: ProxifiedImportItem) => item.from === from && item.imported === "*" && item.local === specifier
  ) ?? false) {
    return false;
  }

  // Check if there's an existing import from this module
  if (hasImportFrom(importsMap, from)) {
    // Add namespace import to existing import - Magicast will merge it
    importsMap.$append({
      imported: "*",
      local: specifier,
      from,
    });
    return true;
  }

  // No import from this module exists - add new import at the end
  importsMap.$append({
    imported: "*",
    local: specifier,
    from,
  });
  return true;
}

/** Get the underlying Babel Program node */
function getProgram(ast: ProxifiedModule): any {
  // $ast IS the Program node directly, not a File node with .program
  return (ast as any).$ast;
}

/** Get the program body (array of statements) */
function getBody(ast: ProxifiedModule): any[] {
  return getProgram(ast).body;
}

/** Ensure a named export exists (local or re-export) */
export function ensureExport(
  ast: ProxifiedModule,
  specifier: string,
  from?: string
): boolean {
  const body = getBody(ast);

  if (from) {
    // Re-export: export { specifier } from "from"
    const existingReExport = body.find(
      (n: any) => n.type === "ExportNamedDeclaration" && n.source?.value === from
    );

    if (existingReExport) {
      const hasSpecifier = existingReExport.specifiers.some(
        (s: any) => s.local?.name === specifier || s.exported?.name === specifier
      );
      if (!hasSpecifier) {
        existingReExport.specifiers.push({
          type: "ExportSpecifier",
          local: { type: "Identifier", name: specifier },
          exported: { type: "Identifier", name: specifier },
        });
        return true;
      }
      return false;
    }

    // New re-export
    const newReExport = {
      type: "ExportNamedDeclaration",
      specifiers: [{
        type: "ExportSpecifier",
        local: { type: "Identifier", name: specifier },
        exported: { type: "Identifier", name: specifier },
      }],
      source: { type: "Literal", value: from },
      declaration: null,
    };
    body.push(newReExport);
    return true;
  }

  // Local export - check if already exported
  const hasLocalExport = body.some(
    (n: any) =>
      n.type === "ExportNamedDeclaration" &&
      (n.declaration &&
        (n.declaration.id?.name === specifier ||
          n.declaration.declarations?.some((d: any) => d.id?.name === specifier)))
  );

  if (hasLocalExport) return false;

  // Find the declaration to export
  const declarationIdx = body.findIndex(
    (n: any) =>
      (n.type === "FunctionDeclaration" ||
        n.type === "ClassDeclaration" ||
        n.type === "VariableDeclaration") &&
      (n.id?.name === specifier ||
        n.declarations?.some((d: any) => d.id?.name === specifier))
  );

  if (declarationIdx >= 0) {
    const declaration = body[declarationIdx];
    const newExport = {
      type: "ExportNamedDeclaration",
      declaration,
      specifiers: [],
      source: null,
    };
    body[declarationIdx] = newExport;
    return true;
  }

  return false;
}

/** Ensure a default export exists */
export function ensureDefaultExport(ast: ProxifiedModule, declaration: any): boolean {
  const body = getBody(ast);
  const existingDefault = body.find(
    (n: any) => n.type === "ExportDefaultDeclaration"
  );

  if (existingDefault) {
    existingDefault.declaration = declaration;
    return false;
  }

  const newExport = {
    type: "ExportDefaultDeclaration",
    declaration,
  };
  body.push(newExport);
  return true;
}

/** Add a property to an object expression in the AST (e.g., config object) */
export function addPropertyToObject(
  ast: ProxifiedModule,
  objectPath: string[],
  key: string,
  value: any
): boolean {
  // Navigate to the object through the AST
  // For a variable declaration like "const config = { ... }"
  // We need to find the VariableDeclarator with id.name === objectPath[0]
  // then get its init (the ObjectExpression)
  let obj: any = getBody(ast);

  // First, find the target node in the body
  for (const segment of objectPath) {
    if (Array.isArray(obj)) {
      // If it's an array (like body), find the element
      const found = obj.find((n: any) => {
        if (n.type === "VariableDeclaration") {
          return n.declarations.some((d: any) => d.id?.name === segment);
        }
        return n.id?.name === segment || n.name === segment;
      });
      if (!found) return false;
      // Get the initializer for VariableDeclaration
      if (found.type === "VariableDeclaration") {
        const declarator = found.declarations.find((d: any) => d.id?.name === segment);
        obj = declarator?.init;
      } else {
        obj = found;
      }
    } else if (obj && typeof obj === "object") {
      obj = obj[segment];
    }
    if (!obj) return false;
  }

  if (obj && obj.properties) {
    const exists = obj.properties.some(
      (p: any) => p.key?.name === key || p.key?.value === key
    );
    if (exists) return false;

    obj.properties.push({
      type: "Property",
      key: { type: "Identifier", name: key },
      value,
      kind: "init",
    });
    return true;
  }

  return false;
}

/** Remove a property from an object expression in the AST */
export function removePropertyFromObject(
  ast: ProxifiedModule,
  objectPath: string[],
  key: string
): boolean {
  let obj: any = getBody(ast);

  // First, find the target node in the body
  for (const segment of objectPath) {
    if (Array.isArray(obj)) {
      const found = obj.find((n: any) => {
        if (n.type === "VariableDeclaration") {
          return n.declarations.some((d: any) => d.id?.name === segment);
        }
        return n.id?.name === segment || n.name === segment;
      });
      if (!found) return false;
      if (found.type === "VariableDeclaration") {
        const declarator = found.declarations.find((d: any) => d.id?.name === segment);
        obj = declarator?.init;
      } else {
        obj = found;
      }
    } else if (obj && typeof obj === "object") {
      obj = obj[segment];
    }
    if (!obj) return false;
  }

  if (obj && obj.properties) {
    const idx = obj.properties.findIndex(
      (p: any) => p.key?.name === key || p.key?.value === key
    );
    if (idx >= 0) {
      obj.properties.splice(idx, 1);
      return true;
    }
  }

  return false;
}

/** Find a node by type in the module body */
export function findNode(
  ast: ProxifiedModule,
  type: string,
  predicate?: (node: any) => boolean
): any | null {
  const body = getBody(ast);
  const nodes = body.filter((n: any) => n.type === type);
  return nodes.find(predicate ?? (() => true)) ?? null;
}

/** Find all nodes by type in the module body */
export function findNodes(ast: ProxifiedModule, type: string): any[] {
  const body = getBody(ast);
  return body.filter((n: any) => n.type === type);
}

/** Insert a statement at a specific position in the module body */
export function insertStatement(ast: ProxifiedModule, statement: any, index: number): void {
  const body = getBody(ast);
  body.splice(index, 0, statement);
}

/** Append a statement to the end of the module body */
export function appendStatement(ast: ProxifiedModule, statement: any): void {
  const body = getBody(ast);
  body.push(statement);
}

/** Get all import statements as a readable array */
export function getImports(ast: ProxifiedModule): Array<{ from: string; specifiers: Array<{ imported: string; local: string }> }> {
  const importsMap = getImportsMap(ast);
  const items = importsMap.$items ?? [];
  return items.map((item: ProxifiedImportItem) => ({
    from: item.from,
    specifiers: [{ imported: item.imported, local: item.local }],
  }));
}

/** Get all export statements */
export function getExports(ast: ProxifiedModule): Array<{ name: string; isDefault: boolean; isReExport: boolean }> {
  const body = getBody(ast);
  return body
    .filter((n: any) => n.type === "ExportNamedDeclaration" || n.type === "ExportDefaultDeclaration")
    .map((n: any) => {
      if (n.type === "ExportDefaultDeclaration") {
        return { name: n.declaration?.id?.name ?? "default", isDefault: true, isReExport: false };
      }
      return {
        name: n.declaration?.id?.name ?? n.specifiers?.[0]?.local?.name,
        isDefault: false,
        isReExport: !!n.source,
      };
    });
}