/**
 * Shared types for database generator and doctor.
 * Single source of truth for provider data, scripts, and inspection types.
 */

export interface ProviderData {
  key: string;
  name: string;
  displayName: string;
  prismaProvider: string;
  adapterPackage: string;
  adapterImport: string;
  adapterClass: string;
  driverPackage: string;
  devDependencies: string[];
  dependencies: string[];
  templatePath: string;
  templateOutputPath: string;
  instantiationPattern: "connectionString" | "individualParams";
  notes: string;
  recommendedScripts: string[];
  supportsMigrations?: boolean;
}

export interface DatabaseScriptCatalogEntry {
  command: string;
  hint: string;
  recommended: boolean;
}

export type DatabaseScriptCatalog = Record<string, DatabaseScriptCatalogEntry>;

/** Prisma declaration classification (exact-match 7.10.0 policy). */
export type PrismaVersionClass =
  | "satisfied" // declares exactly 7.10.0 or a range that contains it
  | "incompatible" // any 6.x / 8.x / other 7.x — conflict, abort before install
  | "missing"; // not declared at all (fresh project, or repairable install)

/** Read-only project inspection for the database generator/doctor. */
export interface DatabaseInspection {
  /** prisma/schema.prisma exists on disk. */
  schemaExists: boolean;
  /** prisma7.config.ts exists on disk. */
  configExists: boolean;
  /** prisma/ directory exists. */
  prismaDirExists: boolean;
  /** prisma/ exists but holds no schema.prisma (early-fail gate). */
  prismaDirEmpty: boolean;
  /** Schema has a `generator client` block. */
  schemaHasGenerator: boolean;
  /** Generator output, project-root-relative POSIX; fallback default. */
  generatorOutput: string;
  /** True when the parsed output escapes the project root. */
  generatorOutputEscapesRoot: boolean;
  /** Schema declares the legacy (<=6) datasource url form -> P1012 under 7. */
  datasourceLegacyForm: boolean;
  /** Prisma CLI declaration class (exact-match 7.10.0 policy). */
  prismaVersion: PrismaVersionClass;
  /** Declared prisma spec string, when present. */
  prismaDeclaredSpec: string | undefined;
  /** @prisma/client declaration class. */
  clientVersion: PrismaVersionClass;
  /** Declared @prisma/client spec string, when present. */
  clientDeclaredSpec: string | undefined;
  /** Names of provider non-Prisma dependencies missing from package.json. */
  providerDependenciesMissing: string[];
  /**
   * The seed runner (tsx) is declared in package.json.
   */
  seedRunnerDeclared: boolean;
  /** prisma physically installed (agent-aware probe). */
  prismaInstalled: boolean;
  /** @prisma/client physically installed (agent-aware probe). */
  clientInstalled: boolean;
  /** .env exists. */
  envExists: boolean;
  /** .env exists and defines DATABASE_URL. */
  envHasDatabaseUrl: boolean;
  /** Helper file candidates found on disk, normalized. */
  helperCandidates: string[];
  /** The default helper path, already normalized. */
  defaultHelperPath: string;
}

/** Prisma provider detection state. */
export interface PrismaState {
  /** Whether Prisma is installed (schema.prisma or prisma7.config.ts exists). */
  installed: boolean;
  /** The detected provider key (e.g., "postgresql", "sqlite", "mysql"), or null if undetermined. */
  provider: string | null;
  /** Path to the schema file that was read, or null. */
  schemaPath: string | null;
}