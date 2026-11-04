/**
 * @dxgjs/ast - AST manipulation utilities powered by Magicast
 * Preserves formatting, comments, and structure when modifying config files.
 */

export {
  createAstHandle,
  type AstFile,
  addNpmScript,
  addNpmScripts,
  ensureGitignoreEntry,
  ensureGitignoreEntries,
} from "./json.js";

export {
  ensureImport,
  ensureDefaultImport,
  ensureNamespaceImport,
  ensureExport,
  ensureDefaultExport,
  addPropertyToObject,
  removePropertyFromObject,
  findNode,
  findNodes,
  insertStatement,
  appendStatement,
  parseSourceFile,
  writeSourceFile,
} from "./ts-injection.js";