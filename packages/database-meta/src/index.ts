/**
 * @dxgjs/database-meta — Shared database constants and utilities.
 *
 * Single source of truth for:
 * - Prisma version pin
 * - Provider data (7 providers)
 * - Script catalog and recommended scripts
 * - Path constants (generator output, helper, config file)
 * - Import path computation
 * - Helper path normalization/validation
 * - Provider detection (pure functions)
 * - Version classification
 * - DATABASE_URL placeholders
 * - Schema utilities
 */

// Version
export { PRISMA_PINNED_VERSION } from "./version";

// Paths
export {
  DEFAULT_GENERATOR_OUTPUT,
  DEFAULT_HELPER_PATH,
  PRISMA_CONFIG_PATH,
  SCHEMA_PATH,
  CONFIG_PATH,
  ENV_PATH,
} from "./paths";

// Providers
export {
  providerData,
  SUPPORTED_PROVIDERS,
  getProviderData,
  isSupportedProvider,
  type ProviderData,
} from "./providers";

// Scripts
export {
  databaseScriptCatalog,
  SEED_SCRIPT_NAME,
  SEED_FILE_PATH,
  SEED_CONFIG_COMMAND,
  providerScripts,
  recommendedScripts,
  resolveDatabaseScripts,
  type DatabaseScriptCatalog,
  type DatabaseScriptCatalogEntry,
} from "./scripts";

// Prisma args
export { buildPrismaInitArgs } from "./prisma-args";

// Import path computation
export {
  resolveGeneratorOutput,
  computeRelativeImport,
  computeFileImport,
} from "./imports";

// Helper path normalization/validation
export {
  normalizeHelperPath,
  validateHelperPath,
  isValidPrismaClientHelper,
} from "./helper";

// Provider detection (pure functions)
export {
  normalizePrismaProvider,
  extractProviderFromSchema,
  extractProviderFromConfig,
  providersMatch,
  type PrismaState,
} from "./provider-detection";

// Version classification
export {
  parseVersion,
  classifyPrismaVersion,
  declaredVersion,
  specName,
  type PrismaVersionClass,
} from "./version-classify";

// Schema utilities
export {
  schemaHasLegacyDatasource,
  parseGeneratorOutput,
} from "./schema-utils";

// Placeholders
export { providerPlaceholders } from "./placeholders";

// Utils
export {
  normalizeContent,
  sanitizeEnvValue,
  validateDatabase,
} from "./utils";

// Types - DatabaseInspection is only defined in types.ts, re-export from there
export type {
  DatabaseInspection,
} from "./types";