// Get the directory where this module is located
import { GeneratorContext, Generator } from "../../types";
import { addPackageScripts } from "@dxgjs/fs";

// Import Clack-native UX utilities from @dxgjs/prompts
import {
  intro,
  outro,
  isCancel,
  cancel,
  spinner,
  note,
  prompt,
  multiselect,
} from "@dxgjs/prompts";

import { fileURLToPath } from "url";
import { dirname, join, sep, posix } from "path";
import { executeCommand } from "@dxgjs/fs";
import { parseNlx, getCliCommand } from "@antfu/ni";
import pc from "picocolors";
import type {
  DependencyPlan,
  DependencyInstallResult,
  DependencySpec,
} from "../../install/types";
import { installerFailureHint } from "../../install/installer";
import { withDlxBuildApprovals } from "../../install/dlx";

// DXG Error types
import {
  PrismaVersionConflictError,
  ProviderUnsupportedError,
  ProviderMismatchError,
  BuildBlockedError,
  TemplateMissingError,
  InstallerFailureError,
  ValidationError,
  SpawnError,
} from "@dxgjs/errors";
import {
  specName,
  DEFAULT_GENERATOR_OUTPUT,
  DEFAULT_HELPER_PATH,
  PRISMA_PINNED_VERSION,
  computeFileImport,
  computeRelativeImport,
  inspectDatabase,
  normalizeHelperPath,
  validateHelperPath,
} from "./inspect";
import {
  detectPrismaState,
  providersMatch,
  normalizePrismaProvider,
} from "./detect-prisma-state";

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine if we're in a bundled context (where __dirname points to dist/)
// In bundled context, we need to adjust the path to point to generators/database/templates/
const isBundled =
  __dirname.endsWith(`${sep}dist`) || __dirname.endsWith("/dist");
let templateBasePath: string;
if (isBundled) {
  // In bundle, templates are under generators/<generator-name>/templates/
  templateBasePath = join(__dirname, "generators", "database", "templates");
} else {
  // In source, templates are under the generator's directory
  templateBasePath = join(__dirname, "templates");
}

// Provider data - explicit and data-driven as required
export const providerData = {
  sqlite: {
    key: "sqlite",
    name: "SQLite",
    displayName: "SQLite",
    prismaProvider: "sqlite",
    adapterPackage: "@prisma/adapter-better-sqlite3",
    adapterImport: "PrismaBetterSqlite3",
    adapterClass: "PrismaBetterSqlite3",
    driverPackage: "better-sqlite3",
    devDependencies: ["prisma@7.10.0", "@types/node", "@types/better-sqlite3"],
    // better-sqlite3 is PINNED to ^12.6.0: @prisma/adapter-better-sqlite3@7.10.0
    // requires ^12.6.0, and latest (13.x) changed distribution models (no
    // install script at all). Unpinned, the two constraints could diverge
    // into a double-copy hazard.
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-better-sqlite3",
      "better-sqlite3@^12.6.0",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib-sqlite.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes:
      "SQLite is a file-based database suited for development and prototyping.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  postgresql: {
    key: "postgresql",
    name: "PostgreSQL",
    displayName: "PostgreSQL",
    prismaProvider: "postgresql",
    adapterPackage: "@prisma/adapter-pg",
    adapterImport: "PrismaPg",
    adapterClass: "PrismaPg",
    driverPackage: "pg",
    devDependencies: ["prisma@7.10.0", "@types/node", "@types/pg"],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-pg",
      "pg",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes:
      "PostgreSQL is a powerful, open source object-relational database system.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  mysql: {
    key: "mysql",
    name: "MySQL",
    displayName: "MySQL",
    prismaProvider: "mysql",
    adapterPackage: "@prisma/adapter-mariadb",
    adapterImport: "PrismaMariaDb",
    adapterClass: "PrismaMariaDb",
    driverPackage: "", // MariaDB adapter uses individual params, not a driver package
    devDependencies: ["prisma@7.10.0", "@types/node"],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-mariadb",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib-mysql.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "individualParams", // Uses individual connection parameters
    notes:
      "MySQL is a widely-used open source relational database management system.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  sqlserver: {
    key: "sqlserver",
    name: "SQL Server",
    displayName: "SQL Server",
    prismaProvider: "sqlserver",
    adapterPackage: "@prisma/adapter-mssql",
    adapterImport: "PrismaMssql",
    adapterClass: "PrismaMssql",
    driverPackage: "", // MSSQL adapter uses individual params
    devDependencies: ["prisma@7.10.0", "@types/node", "@types/mssql"],
    dependencies: ["@prisma/client@7.10.0", "@prisma/adapter-mssql", "dotenv"],
    templatePath: join(templateBasePath, "prisma-client-lib-sqlserver.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "individualParams", // Uses individual connection parameters
    notes:
      "Microsoft SQL Server is a relational database management system developed by Microsoft.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  cockroachdb: {
    key: "cockroachdb",
    name: "CockroachDB",
    displayName: "CockroachDB",
    prismaProvider: "cockroachdb",
    adapterPackage: "@prisma/adapter-pg",
    adapterImport: "PrismaPg",
    adapterClass: "PrismaPg",
    driverPackage: "pg",
    devDependencies: ["prisma@7.10.0", "@types/node", "@types/pg"],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-pg",
      "pg",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes:
      "CockroachDB is a distributed SQL database built on a transactional and strongly-consistent key-value store.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  planetscale: {
    key: "planetscale",
    name: "PlanetScale",
    displayName: "PlanetScale (MySQL)",
    prismaProvider: "mysql", // Uses MySQL protocol
    adapterPackage: "@prisma/adapter-planetscale",
    adapterImport: "PrismaPlanetScale",
    adapterClass: "PrismaPlanetScale",
    driverPackage: "undici", // Required for fetch polyfill
    devDependencies: ["prisma@7.10.0", "@types/node"],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-planetscale",
      "undici",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib-planetscale.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    // Prisma migrations (migrate dev/reset) are unsupported on Vitess:
    // schema changes go through PlanetScale's own workflow instead.
    supportsMigrations: false,
    notes:
      "PlanetScale is a serverless database platform built on Vitess. Requires relationMode = 'prisma' in schema.prisma for MySQL variant.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
  prismapostgres: {
    key: "prismapostgres",
    name: "Prisma Postgres",
    displayName: "Prisma Postgres",
    prismaProvider: "postgresql", // Uses PostgreSQL provider
    adapterPackage: "@prisma/adapter-pg",
    adapterImport: "PrismaPg",
    adapterClass: "PrismaPg",
    driverPackage: "pg",
    devDependencies: ["prisma@7.10.0", "@types/node", "@types/pg"],
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-pg",
      "pg",
      "dotenv",
    ],
    templatePath: join(templateBasePath, "prisma-client-lib.tmpl"),
    templateOutputPath: "lib/prisma.ts",
    instantiationPattern: "connectionString", // Uses DATABASE_URL connection string
    notes:
      "Prisma Postgres is a fully managed PostgreSQL-compatible database service.",
    recommendedScripts: ["db:generate", "db:push", "db:studio", "db:pull"],
  },
};

// Database script contract — owned by the database domain.
//
// Every entry must have a concrete, immediately-useful purpose after
// `dxg add database`. Deliberately NOT exposed as scripts:
// - db:reset — destructive (prisma migrate reset); developers who adopt
//   the migrations workflow already know the prisma CLI.
//
// db:seed is opt-in (customize only): selecting it generates a
// prisma/seed.ts skeleton, adds `tsx` (the seed runner) and configures
// `migrations.seed` in prisma7.config.ts — where Prisma 7's `db seed`
// reads the seed command (verified against the prisma@7.10.0 CLI: it
// resolves migrations.seed from the config file ONLY; the
// `prisma.seed` package.json field is read by the init flow's
// "Seed the database?" prompt, never by db seed). The recommended set
// stays minimal and seed stays opt-in because seeding is
// workflow-dependent.
const SEED_SCRIPT_NAME = "db:seed";
const SEED_FILE_PATH = "prisma/seed.ts";
const SEED_CONFIG_COMMAND = `tsx ${SEED_FILE_PATH}`;
// The Prisma 7 config file written at the project root by `prisma init`
// (first candidate in @prisma/config's search order, before the legacy
// prisma.config.* names).
const PRISMA_CONFIG_PATH = "prisma7.config.ts";

export const databaseScriptCatalog: Record<
  string,
  { command: string; hint: string; recommended: boolean }
> = {
  "db:generate": {
    command: "prisma generate",
    hint: "Generate Prisma Client",
    recommended: true,
  },
  "db:push": {
    command: "prisma db push",
    hint: "Push the Prisma schema to the database",
    recommended: true,
  },
  "db:studio": {
    command: "prisma studio",
    hint: "Open Prisma Studio",
    recommended: true,
  },
  "db:pull": {
    command: "prisma db pull",
    hint: "Pull the database schema into Prisma schema",
    recommended: true,
  },
  [SEED_SCRIPT_NAME]: {
    command: "prisma db seed",
    hint: "Seed the database",
    recommended: false,
  },
  "db:migrate": {
    command: "prisma migrate dev",
    hint: "Create and apply Prisma migrations",
    recommended: false,
  },
};

/** Scripts offered for a given provider key (provider-aware filtering). */
export function providerScripts(providerKey: string): string[] {
  const provider = providerData[providerKey as keyof typeof providerData];
  // Providers without Prisma-migrations support (e.g. PlanetScale on
  // Vitess) never see the migrate entry — the knowledge stays in the
  // provider table, not in a generic capability framework. The flag is
  // optional: every provider that does not opt out keeps the full catalogue.
  const excludeMigrations =
    (provider as { supportsMigrations?: boolean } | undefined)
      ?.supportsMigrations === false;
  return Object.keys(databaseScriptCatalog).filter(
    (name) => !(excludeMigrations && name === "db:migrate"),
  );
}

/** The recommended script names for a given provider key. */
export function recommendedScripts(providerKey: string): string[] {
  return providerScripts(providerKey).filter(
    (name) => databaseScriptCatalog[name].recommended,
  );
}

// Prompt questions for the database generator
export const databasePrompts = [
  {
    type: "select" as const,
    name: "provider",
    message: "Choose your database provider:",
    default: "sqlite",
    choices: Object.values(providerData).map((p) => ({
      name: p.displayName,
      value: p.key,
    })),
  },
  {
    // DXG owns the Prisma agent skills decision: the user is asked here so
    // Prisma itself never has to ask. Default is No — Prisma agent skills
    // (.claude/skills/, .windsurf/skills/, .agents/skills/, skills-lock.json)
    // are only written into the user's project when explicitly requested.
    type: "confirm" as const,
    name: "installPrismaSkills",
    message: "Install Prisma agent skills?",
    default: false,
  },
  {
    // Database scripts phase: decides which db:* npm scripts land in the
    // project's package.json. Default is the recommended set.
    type: "select" as const,
    name: "databaseScripts",
    message: "Configure database scripts?",
    default: "recommended",
    choices: [
      { name: "Recommended", value: "recommended" },
      { name: "Customize", value: "customize" },
      { name: "Skip", value: "skip" },
    ],
  },
  {
    // Helper path (decision document, section 6): where the DXG-owned
    // Prisma singleton helper lands. Relative to the project root;
    // backslashes, leading ./ and a missing .ts are normalized, and
    // protected Prisma/DXG paths are rejected by planDatabase.
    type: "input" as const,
    name: "helperPath",
    message: "Where should the Prisma client helper be created?",
    default: DEFAULT_HELPER_PATH,
    initialValue: DEFAULT_HELPER_PATH,
    validate: (value) =>
      typeof value === "string" &&
      (value === "" ||
        /^[a-zA-Z0-9_/.-]+\.[jt]s$/.test(value) ||
        "Must be a relative path ending in .ts or .tsx"),
  },
] satisfies {
  type: "input" | "confirm" | "select";
  name: string;
  message: string;
  default?: unknown;
  initialValue?: unknown;
  choices?: Array<{ name: string; value: string }>;
  validate?: (input: unknown) => boolean | string;
}[];

/**
 * Builds the exact `prisma init` argument contract. This is the single
 * source of truth used by BOTH production resolution paths in
 * executeDatabase (the primary `getCliCommand(parseNlx, ...)` call and the
 * `originalArgs` fallback/workaround), so the skills decision can never
 * diverge between the two paths.
 *
 * Skills translation (verified against the prisma@7.10.0 CLI source):
 * - `installSkills: false` passes the explicit `--no-skills` flag → Prisma
 *   skips agent skills entirely.
 * - `installSkills: true` omits the flag → prisma@7 installs agent skills
 *   unconditionally and NON-interactively (that code path contains no
 *   prompt/TTY check). Prisma therefore never asks the question DXG
 *   already asked.
 */
/**
   * Builds the exact `prisma init` argument contract. This is the single
   * source of truth used by BOTH production resolution paths in
   * executeDatabase (the primary `getCliCommand(parseNlx, ...)` call and the
   * `originalArgs` fallback/workaround), so the skills decision can never
   * diverge between the two paths.
   *
   * Skills translation (verified against the prisma@7.10.0 CLI source):
   * - `installSkills: false` passes the explicit `--no-skills` flag → Prisma
   *   skips agent skills entirely.
   * - `installSkills: true` omits the flag → prisma@7 installs agent skills
   *   unconditionally and NON-interactively (that code path contains no
   *   prompt/TTY check). Prisma therefore never asks the question DXG
   *   already asked.
   *
   * @param prismaProvider The Prisma provider (e.g. "sqlite", "postgresql")
   * @param installSkills Whether to install Prisma agent skills
   * @param outputPath    The path (relative to the prisma directory) where the
   *                      generated client should be placed. If not provided,
   *                      defaults to "../lib/generated/prisma".
   */
  export function buildPrismaInitArgs(
    prismaProvider: string,
    installSkills: boolean,
    outputPath?: string,
  ): string[] {
    return [
      "prisma@7",
      "init",
      "--datasource-provider",
      prismaProvider,
      ...(installSkills ? [] : ["--no-skills"]),
      "--output",
      outputPath ?? "../lib/generated/prisma",
    ];
  }


/**
 * Normalizes content for comparison: CRLF -> LF, trim trailing spaces per line.
 * Used for idempotence checks (e.g., lib/prisma.ts template vs existing file).
 */
export function normalizeContent(content: string): string {
  return content
    .replace(/\r\n/g, "\n") // CRLF -> LF
    .split("\n")
    .map((line) => line.trimEnd()) // trim trailing spaces
    .join("\n");
}

// Validation function
export function validateDatabase(): boolean {
  // Validation will happen in the run method; we keep this for interface compliance
  // but actual validation is done in run via checkPreconditions
  return true;
}

// Precondition checks
async function checkPreconditions(ctx: GeneratorContext): Promise<void> {
  // 1. package.json must exist (we are adding to an existing project)
  const packageJsonExists = await ctx.fs.pathExists("package.json");
  if (!packageJsonExists) {
    throw new ValidationError(
      "package.json not found. Please initialize your project (e.g., npm init) before running dxg add database.",
    );
  }

  // Read package.json for compatibility with tests (though not strictly needed for logic)
  // This ensures fs.readFile is called for package.json as expected by tests
  await ctx.fs.readFile("package.json", { encoding: "utf8" });
}

// Planning function
export function planDatabase(
  answers: Record<string, unknown>,
  inspection?: import("./inspect").DatabaseInspection,
) {
  const providerKey = answers.provider as string;
  const provider = providerData[providerKey as keyof typeof providerData];

  if (!provider) {
    const supportedProviders = Object.keys(providerData);
    throw new ProviderUnsupportedError(providerKey, supportedProviders);
  }

  // Helper path resolution (decision document, section 6). Deterministic
  // order: an explicit answer (CLI or prompt) wins; otherwise a helper
  // candidate discovered by the inspection is REUSED (a re-run must not
  // duplicate the helper at a second location); otherwise the default.
  // Non-interactive mode without an answer lands on the default — never a
  // prompt. Normalization + validation are inspect.ts's single ownership.
  const helperPath =
    typeof answers.helperPath === "string" && answers.helperPath.trim() !== ""
      ? normalizeHelperPath(answers.helperPath)
      : inspection !== undefined && inspection.helperCandidates.length > 0
        ? inspection.helperCandidates[0]
        : DEFAULT_HELPER_PATH;
  const helperError = validateHelperPath(helperPath);
  if (helperError !== undefined) {
    throw new ValidationError(`Invalid helper path "${helperPath}": ${helperError}`);
  }

  // Generator-output resolution — the single source of truth for the plan
  // fields AND the template data: a user-owned schema that declares a
  // parseable, root-internal output wins (the plan must agree with where
  // `prisma generate` will actually write the client); every other state —
  // no generator block, unparseable output, root-escaping output, or no
  // inspection at all — falls back to the helper-derived co-location rule.
  const generatorOutput =
    inspection !== undefined &&
    inspection.schemaHasGenerator &&
    !inspection.generatorOutputEscapesRoot &&
    inspection.generatorOutput !== DEFAULT_GENERATOR_OUTPUT
      ? inspection.generatorOutput
      : computeDefaultGeneratorOutput(helperPath);

  // Dynamic imports (decision document, section 7): computed here, in the
  // planning layer, from the helper path and the generator output — never
  // hardcoded in the templates. The seed imports the helper with a relative
  // specifier from its own directory (prisma/).
  const generatedClientImport = computeRelativeImport(
    helperPath,
    generatorOutput,
  );
  const helperImportFromSeed = computeFileImport(
    "prisma/seed.ts",
    helperPath.replace(/\.ts$/, ""),
  );

  const data = {
    provider: provider.key,
    providerName: provider.displayName,
    year: new Date().getFullYear(),
    generatedClientImport,
    helperImportFromSeed,
    ...provider, // Spread provider data for template use
  };

  // Determine packages to install - separate dev and regular dependencies.
  // State-aware (idempotence): when the inspection reports the Prisma
  // declarations already satisfied, the pinned prisma/@prisma/client specs
  // are dropped from the install batches — the second run must not
  // reinstall what the project already declares at the verified pin.
  // Non-Prisma provider deps (adapters, drivers, dotenv, tsx) follow the
  // same declared rule: declared → dropped (an install with nothing to do
  // still rewrites package-lock.json on npm — never assume a cheap no-op;
  // live-proven by the e2e rerun-noop lockfile mutation), missing → they
  // stay in the batch and self-heal. Every omission is reported through
  // the summary (skipped).
  const devPackages = [...provider.devDependencies];
  const regularPackages = [...provider.dependencies];

  const prismaSatisfied =
    inspection !== undefined &&
    inspection.prismaVersion === "satisfied" &&
    inspection.clientVersion === "satisfied";

  if (prismaSatisfied) {
    // Both pinned Prisma packages are declared at the verified pin: drop
    // them from the install batches by NAME (a declared "7.10.0" and a
    // batch "prisma@7.10.0" are the same package — literal-spec comparison
    // would never match). Their version gate stays here; the non-Prisma
    // declared-drop below is name-only.
    for (const list of [devPackages, regularPackages]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const name = specName(list[i]);
        if (name === "prisma" || name === "@prisma/client") {
          list.splice(i, 1);
        }
      }
    }
  }

  // Idempotence, non-Prisma side: every provider dependency the manifest
  // already declares is dropped from the batches too. The historical
  // assumption — "the manager makes their reinstall a cheap no-op" — was
  // refuted live on npm (e2e rerun-noop 2026-10-10, kept project
  // dxg-e2e-rerun-noop-npm-ZR61CI): a residual `npm install <declared
  // specs>` rewrites package-lock.json even when nothing changes, so the
  // rerun was not a byte-stable no-op. Missing entries self-heal: they
  // stay in the batch. Legacy callers without an inspection keep the
  // historical full-batch behavior.
  const declaredProviderDepsDropped: string[] = [];
  if (inspection !== undefined) {
    const missing = inspection.providerDependenciesMissing;
    for (const list of [devPackages, regularPackages]) {
      for (let i = list.length - 1; i >= 0; i--) {
        const name = specName(list[i]);
        if (
          name !== "prisma" &&
          name !== "@prisma/client" &&
          !missing.includes(name)
        ) {
          list.splice(i, 1);
          declaredProviderDepsDropped.push(name);
        }
      }
    }
  }

  // The seed script only works end-to-end when its three parts travel
  // together: the runner (tsx, devDependency), the seed file, and the
  // `prisma.seed` config Prisma reads. Selected here, materialized below.
  // A rerun of a seeded project must not reinstall a declared tsx (same
  // lockfile-mutation defect as the declared batches above).
  const seedSelected = resolveDatabaseScripts(
    answers.databaseScripts,
    provider.key,
  ).includes(SEED_SCRIPT_NAME);
  if (
    seedSelected &&
    !devPackages.includes("tsx") &&
    inspection?.seedRunnerDeclared !== true
  ) {
    devPackages.push("tsx");
  }

  // Domain-owned build knowledge (data-driven, provider-local): which
  // packages in this provider's plan run install lifecycle scripts that
  // build native artifacts. prisma's preinstall is a Node-version guard;
  // @prisma/engines' postinstall downloads the schema engine binary
  // (required for migrate/db push); better-sqlite3@12 compiles/links the
  // .node binding. tsx pulls esbuild transitively, whose postinstall
  // verifies/downloads the platform binary — an install script pnpm 11
  // blocks (strictDepBuilds on by default) unless pre-approved.
  // @types/*, dotenv, pg and the adapters have none.
  const requiresBuild = (spec: string): boolean =>
    /^prisma@/.test(spec) ||
    spec === "@prisma/engines" ||
    spec === "esbuild" ||
    /^better-sqlite3@/.test(spec);
  // The adapter pulls @prisma/engines transitively — its build approval is
  // needed even though it never appears as a direct spec. Same for esbuild
  // under the seed runner (tsx).
  const buildApprovalNames = ["prisma", "@prisma/engines"];
  if (provider.key === "sqlite") {
    buildApprovalNames.push("better-sqlite3");
  }
  if (seedSelected) {
    buildApprovalNames.push("esbuild");
  }

  // Build dependency plan with spec objects for the installer.
  const devPackageSpecs: DependencySpec[] = [
    ...devPackages.map((spec) => ({
      spec,
      requiresBuild: requiresBuild(spec),
    })),
    // tsx pulls esbuild transitively — esbuild's postinstall needs build
    // approval even though it is never installed as a direct spec.
    ...(seedSelected
      ? [{ spec: "esbuild", requiresBuild: true, approvalOnly: true }]
      : []),
  ];
  const regularPackageSpecs: DependencySpec[] = [
    ...regularPackages.map((spec) => ({
      spec,
      requiresBuild: requiresBuild(spec),
    })),
    // @prisma/engines is a transitive dependency of the adapter that requires
    // build approval but is never installed directly.
    {
      spec: "@prisma/engines",
      requiresBuild: true,
      approvalOnly: true,
    },
  ];
  const dependencyPlan: DependencyPlan = {
    devDependencies: devPackageSpecs,
    dependencies: regularPackageSpecs,
  };

  // Determine files to create - only DXG-owned application templates.
  // The helper lands at the RESOLVED helper path (user answer, discovered
  // candidate, or default) — never hardcoded lib/prisma.ts.
  const filesToCreate = [
    {
      path: helperPath,
      templatePath: provider.templatePath,
      data,
    },
  ];
  if (seedSelected) {
    filesToCreate.push({
      path: SEED_FILE_PATH,
      templatePath: join(templateBasePath, "prisma-seed.tmpl"),
      data,
    });
  }

  // State-aware decision markers (idempotence). Derived from the inspection
  // when present; a missing inspection (legacy callers, unit tests) keeps the
  // historical fresh-run behavior so nothing changes for existing callers.
  const initRequired =
    inspection === undefined
      ? true // fresh-run default: run init unconditionally (historical behavior)
      : !(inspection.schemaExists || inspection.configExists);
  const prismaDeclarationsSatisfied =
    inspection === undefined ? false : prismaSatisfied;

  return {
    ...data,
    provider: provider.key, // Return just the provider key string for tests
    providerName: provider.displayName,
    // DXG-owned Prisma agent skills decision (from the confirm prompt).
    // Defaults to false (skip) — see buildPrismaInitArgs.
    installPrismaSkills: answers.installPrismaSkills === true,
    seedSelected,
    devPackages,
    regularPackages,
    dependencyPlan,
    buildApprovalNames,
    filesToCreate,
    // Idempotence markers consumed by executeDatabase's gates and the
    // operation summary. initRequired=false means schema.prisma OR
    // prisma7.config.ts already exists: init would clobber user-owned
    // config (verified empirically), so it is skipped instead.
    initRequired,
    prismaDeclarationsSatisfied,
    generatorOutput,
    // Prisma init output path relative to the prisma directory (where schema.prisma lives).
    // This is the argument passed to `prisma init --output`.
    prismaInitOutput: posix.join("..", generatorOutput),
    envExists: inspection?.envExists ?? false,
    envNeedsDatabaseUrl: inspection?.envHasDatabaseUrl === false,
    // Non-Prisma provider dependencies dropped from the install batches
    // because the manifest already declares them (name-only check,
    // inspection-driven). Surfaced in the summary so a rerun reads as a
    // no-op for them too, not as a silent omission.
    declaredProviderDepsDropped,
    // The .env declaration line: SQLite gets the conventional file URL so
    // the recommended chain works out-of-the-box — an empty URL fails
    // `prisma db push` with `Connection url is empty` (live-proven, e2e
    // sqlite-native 2026-10-10, kept project
    // dxg-e2e-sqlite-native-npm-zYRENi: prisma7.config.ts reads
    // process.env["DATABASE_URL"]). Server providers keep the empty
    // placeholder: the connection value is the user's to fill.
    envDatabaseUrlLine:
      provider.key === "sqlite"
        ? 'DATABASE_URL="file:./dev.db"'
        : "DATABASE_URL=",
    helperPath,
    generatedClientImport,
    helperImportFromSeed,
  };
}

/**
 * Resolves the interactive database scripts decision into the final script
 * names to add. Owned by the database domain.
 *
 * - "recommended" → the provider's recommended set.
 * - "customize"   → a Clack multiselect over the provider-appropriate
 *   catalogue (each option shows what the script does).
 * - "skip"        → no scripts.
 * - undefined     → "recommended" (non-interactive / dry-run / CI default:
 *   the generator stays deterministic without a TTY).
 *
 * Throws the Clack cancel symbol when the user cancels the multiselect
 * (existing cancellation convention: primitives resolve with the symbol,
 * `prompt()` throws it, `run` catches isCancel).
 */
export function resolveDatabaseScripts(
  decision: unknown,
  providerKey: string,
): string[] {
  if (decision === "skip") {
    return [];
  }
  if (decision === "recommended") {
    return recommendedScripts(providerKey);
  }
  if (Array.isArray(decision)) {
    // Pre-resolved selection (tests / programmatic answers).
    const offered = new Set(providerScripts(providerKey));
    return decision.filter(
      (name): name is string => typeof name === "string" && offered.has(name),
    );
  }
  return recommendedScripts(providerKey);
}

/** Runs the interactive part of the customize branch (the multiselect). */
async function promptCustomScripts(providerKey: string): Promise<string[]> {
  const offered = providerScripts(providerKey);
  const selected = await multiselect({
    message: "Select database scripts to add",
    options: offered.map((name) => ({
      value: name,
      label: name,
      hint: databaseScriptCatalog[name].hint,
    })),
    initialValues: recommendedScripts(providerKey),
    required: false,
  });
  if (isCancel(selected)) {
    throw selected;
  }
  return selected as string[];
}

/**
 * Inserts the seed entry into the `migrations` block of a Prisma 7 config
 * file's raw text, preserving every other byte (comments, imports, the
 * `process.env["DATABASE_URL"]` datasource form, formatting).
 *
 * This is a deliberately narrow, domain-local text transform — a
 * temporary mechanism owned by the database generator. A robust,
 * reusable transformer for user-owned files (prisma7.config.ts, Better
 * Auth configs, layouts...) is deferred to a separate architectural
 * task; this one intentionally handles only the single shape `prisma
 * init` writes (verified against the prisma@7.10.0 CLI bundle).
 */
function insertSeedIntoPrismaConfig(configText: string): string | undefined {
  // A pre-existing seed line is REPLACED in place (the --force path —
  // a conflict was already reported for the different value, force
  // resolves it by overwriting, exactly like conflicting scripts).
  const existingSeed = configText.match(
    /^[ \t]*seed\s*:\s*["'][^"']*["'],?[ \t]*$/m,
  );
  if (existingSeed) {
    const replacement = existingSeed[0].replace(
      /(["']).*?\1/,
      `"${SEED_CONFIG_COMMAND}"`,
    );
    return configText.replace(existingSeed[0], replacement);
  }
  // Fresh insert: anchored on the migrations block `path` line prisma
  // init always writes. A string replace (not regex) keeps the match
  // literal and the rest of the file untouched. The seed entry is
  // formatted exactly like the surrounding prisma init entries
  // (4-space indent inside migrations).
  const pathLine = '    path: "prisma/migrations",';
  const anchor = configText.indexOf(pathLine);
  if (anchor === -1) {
    return undefined;
  }
  const insertAt = anchor + pathLine.length;
  return (
    configText.slice(0, insertAt) +
    "\n" +
    `    seed: "${SEED_CONFIG_COMMAND}",` +
    configText.slice(insertAt)
  );
}

/**
 * Extracts the existing `migrations.seed` command from a Prisma config
 * file's raw text, if one is configured. Returns the trimmed command
 * string (e.g. `"node custom-seed.js"`) or undefined.
 */
function readSeedFromPrismaConfig(configText: string): string | undefined {
  const match = configText.match(/seed\s*:\s*["']([^"']+)["']/);
  return match ? match[1] : undefined;
}

/**
 * Applies the Prisma 7 seed contract to the prisma7.config.ts file:
 * `migrations.seed = "tsx prisma/seed.ts"` — the ONLY place `prisma db
 * seed` reads the seed command. Semantics mirror addPackageScripts
 * (@dxgjs/fs): identical → already satisfied (skipped), different →
 * conflict preserved unless force. The rest of the config file is
 * preserved byte-for-byte. Domain-local on purpose — Prisma seed-config
 * knowledge belongs to the database domain.
 */
async function applySeedConfigToPrismaFile(
  fs: GeneratorContext["fs"],
  projectRoot: string,
  force: boolean,
): Promise<
  | { added: false; skipped: true; conflictExisting?: undefined }
  | { added: false; skipped: false; conflictExisting: string }
  | { added: true; skipped: false; conflictExisting?: undefined }
> {
  const configPath = join(projectRoot, PRISMA_CONFIG_PATH);
  // Fresh read from disk: prisma init (executeDatabase step 3) wrote the
  // file moments ago; ctx.awareness snapshots predate it. Missing file →
  // empty string (the transform reports a missing anchor, not a crash —
  // prisma init owns that file and any failure there surfaced earlier).
  const current =
    ((await fs.readFile(configPath, { encoding: "utf8" })) as
      | string
      | undefined) ?? "";

  const existing = readSeedFromPrismaConfig(current);
  if (existing !== undefined) {
    if (existing === SEED_CONFIG_COMMAND) {
      return { added: false, skipped: true };
    }
    // The user configured their own seed command — never clobber it
    // without --force (same contract as conflicting scripts).
    if (!force) {
      return { added: false, skipped: false, conflictExisting: existing };
    }
  }

  const updated = insertSeedIntoPrismaConfig(current);
  if (updated === undefined) {
    // The migrations block anchor is missing (user restructured the
    // config) — report as a conflict rather than guessing where to
    // insert, so nothing is silently misplaced.
    return {
      added: false,
      skipped: false,
      conflictExisting: "migrations.path (missing anchor)",
    };
  }
  await fs.writeFile(configPath, updated, "utf8");
  return { added: true, skipped: false };
}

// Helper-derived default generator output. Deterministic co-location
// rule: the generated client lands in <helperDir>/generated/prisma, so
// the helper's import is always "./generated/prisma/client" and stays
// INSIDE the project whatever the helper path. (Replaces the old
// /lib|custom/ heuristics, which could resolve the client outside the
// helper's subtree — even above the project root.)
function computeDefaultGeneratorOutput(helperPath: string): string {
  return posix.join(posix.dirname(helperPath), "generated", "prisma");
}

// Execution function
export async function executeDatabase(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planDatabase>,
): Promise<{
  created: string[];
  updated: string[];
  skipped: string[];
  conflicts: { path: string; existsAs: "file" | "directory" }[];
  wouldRun: string[];
}> {
  const { fs } = ctx;
  const planToUse = plan ?? planDatabase(answers);
  const result: {
    created: string[];
    updated: string[];
    skipped: string[];
    conflicts: { path: string; existsAs: "file" | "directory" }[];
    wouldRun: string[];
  } = {
    created: [],
    updated: [],
    skipped: [],
    conflicts: [],
    wouldRun: [],
  };

  // Steps 1-2: Install dependencies through the installer seam. The seam
  // (built in prepareContext from the detected agent) resolves the command,
  // pre-writes the manager's build approvals for exactly the plan's
  // requiresBuild names, runs with buffered output, and classifies. This
  // generator holds ZERO package-manager logic — no if (pm === "pnpm"),
  // ever. The spinner stays Clack-native: it runs above the buffered
  // install and the captured output is echoed on completion.
  if (!ctx.dryRun) {
    if (!ctx.installer) {
      throw new InstallerFailureError(
        "installer-unavailable",
        "Dependency installer unavailable: the generator context was built without one (package manager could not be detected).",
      );
    }
    // Reconciliation visibility: the Prisma packages were intentionally
    // left out of the install batches (already declared at the verified
    // pin) — surfaced in the summary so a second run reads as a no-op for
    // them, not as a silent omission. Unconditional on satisfaction: with
    // the declared provider-deps drop, a fully-reconciled rerun has EMPTY
    // batches, and the omission still deserves its summary line.
    if (planToUse.prismaDeclarationsSatisfied) {
      result.skipped.push(
        "prisma@7.10.0 and @prisma/client@7.10.0 reinstall (already declared at the verified pin)",
      );
    }
    // Same visibility for the non-Prisma provider dependencies dropped by
    // the plan (declared in the manifest → not reinstalled).
    if (planToUse.declaredProviderDepsDropped.length > 0) {
      result.skipped.push(
        `${planToUse.declaredProviderDepsDropped.join(", ")} reinstall (already declared)`,
      );
    }
    if (
      planToUse.devPackages.length > 0 ||
      planToUse.regularPackages.length > 0
    ) {
      const installLabel = [
        planToUse.devPackages.length > 0
          ? `dev: ${planToUse.devPackages.join(", ")}`
          : null,
        planToUse.regularPackages.length > 0
          ? `deps: ${planToUse.regularPackages.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const s = spinner();
      s.start(`Installing dependencies (${installLabel})`);
      let installResult: DependencyInstallResult;
      try {
        installResult = await ctx.installer.install(planToUse.dependencyPlan, {
          cwd: ctx.awareness.projectRoot,
        });
      } catch (error) {
        s.stop("Failed to install dependencies");
        throw new InstallerFailureError(
          "unknown",
          error instanceof Error ? error.message : String(error),
          { cause: error instanceof Error ? error : undefined },
        );
      }

      if (!installResult.success) {
        s.stop("Failed to install dependencies");
        // Normalized failure: reason is machine-usable, hint/suggestion
        // carry the manager's own remediation. A build-script-blocked
        // outcome is reported as what it is — an approval gap, not a
        // broken install.
        const hint = installerFailureHint(installResult);
        if (installResult.reason === "build-script-blocked") {
          // Extract blocked package names from the hint/output
          const blockedMatch = installResult.output.match(/build scripts for ([\w@\/,-]+) \(blocked/);
          const blockedPackages = blockedMatch
            ? blockedMatch[1].split(", ")
            : ["unknown"];
          throw new BuildBlockedError(blockedPackages, { cause: new Error(hint) });
        }
        throw new InstallerFailureError(
          installResult.reason,
          installResult.output.trim().split("\n").slice(-8).join("\n"),
          { cause: new Error(hint) },
        );
      }

      s.stop(`Successfully installed dependencies (${installLabel})`);

      // Even on success, silently-blocked builds are surfaced — the
      // silent-drift hazard (npm/bun/yarn-berry exit 0 with scripts
      // skipped). A note (not a spinner line) because the install itself
      // succeeded; the user must still know their native artifacts may be
      // missing until they approve.
      if (installResult.blockedBuilds.length > 0) {
        note(
          [
            "Some dependency build scripts were blocked by your package manager:",
            ...installResult.blockedBuilds.map((name) => `  • ${name}`),
            "Native artifacts (e.g. .node bindings) may be missing until the builds are approved.",
          ].join("\n"),
          "Install scripts blocked",
        );
        result.skipped.push(
          `build scripts for ${installResult.blockedBuilds.join(", ")} (blocked by package manager)`,
        );
      }
      if (installResult.approvedBuilds.length > 0) {
        result.updated.push(
          `pre-approved build scripts for ${installResult.approvedBuilds.join(", ")}`,
        );
      }
    }
  } else {
    // Dry-run: record the planned installs for the summary
    if (planToUse.devPackages.length > 0) {
      result.wouldRun.push(
        `install dev dependencies (${planToUse.devPackages.join(", ")})`,
      );
    }
    if (planToUse.regularPackages.length > 0) {
      result.wouldRun.push(
        `install dependencies (${planToUse.regularPackages.join(", ")})`,
      );
    }
    if (planToUse.buildApprovalNames.length > 0) {
      result.wouldRun.push(
        `pre-approve build scripts (${planToUse.buildApprovalNames.join(", ")})`,
      );
    }
  }

  // Step 3: Execute Prisma initialization — GATED (idempotence). init runs
  // ONLY when both prisma/schema.prisma AND prisma7.config.ts are absent:
  // `prisma init` exits 1 when any prisma/ folder exists (even empty) and
  // CLOBBERS an existing prisma7.config.ts (both verified empirically).
  // A second run therefore never re-inits; the skip is surfaced below.
  const providerObj =
    providerData[planToUse.provider as keyof typeof providerData];
  if (!ctx.dryRun && !planToUse.initRequired) {
    result.skipped.push(
      "Prisma initialization (schema.prisma or prisma7.config.ts already exists)",
    );
  } else if (!ctx.dryRun) {
    try {
      const s = spinner();
      s.start(
        `Initializing Prisma with provider ${providerObj.prismaProvider}...`,
      );

      // The skills decision (DXG-owned) is translated here into the exact
      // prisma init argument contract. This array is the single source of
      // truth for BOTH the primary resolution and the originalArgs fallback
      // below, so the two paths can never diverge.
      const prismaInitArguments = buildPrismaInitArgs(
        providerObj.prismaProvider,
        planToUse.installPrismaSkills === true,
        planToUse.prismaInitOutput,
      );

      // Use the existing command execution infrastructure
      const prismaResolved = await getCliCommand(
        parseNlx,
        prismaInitArguments,
        {
          cwd: process.cwd(),
          programmatic: true,
        },
      );

      if (!prismaResolved) {
        throw new SpawnError(
          "prisma",
          ["init"],
          "Failed to resolve prisma command",
        );
      }

      const {
        command: prismaCmdInitial,
        args: prismaArgsInitial,
        cwd: prismaResolvedCwd,
      } = prismaResolved;

      let prismaCmd = prismaCmdInitial;
      let prismaArgs = prismaArgsInitial;

      // Workaround for @antfu/ni issue with dlx commands
      // When args starts with ["prisma@7", "init"], some versions incorrectly resolve to "<agent> add ..."
      // Built from the same contract as the primary path (see prismaInitArguments).
      const originalArgs = [...prismaInitArguments];
      if (
        originalArgs.length >= 2 &&
        originalArgs[0] === "prisma@7" &&
        originalArgs[1] === "init" &&
        prismaArgs.includes("add")
      ) {
        // Correct the command to use npx (universal)
        prismaCmd = "npx";
        // Use the intended arguments
        prismaArgs = originalArgs;
      }

      // pnpm dlx build approval (install-layer adapter): when the command
      // really is `pnpm dlx`, pass --allow-build for exactly the plan's
      // approvalOnly packages — otherwise pnpm's dlx cache install drops
      // the transitive @prisma/engines postinstall into ignoredBuilds and
      // (TTY) prompts "Choose which packages to build" inside this spinner,
      // or (non-TTY) silently skips the schema-engine binary download.
      prismaArgs = withDlxBuildApprovals(
        prismaCmd,
        prismaArgs,
        planToUse.dependencyPlan,
      );

      const prismaExecuteCwd = prismaResolvedCwd ?? process.cwd();

      try {
        // Use stdio: "pipe" to capture output and prevent leakage into the terminal.
        // Output is only surfaced on failure for diagnostics.
        const result = await executeCommand(prismaCmd, prismaArgs, {
          cwd: prismaExecuteCwd,
          stdio: "pipe",
        });
        s.stop(
          `Prisma initialized successfully with provider ${providerObj.prismaProvider}`,
        );
        // Success: output is intentionally discarded to keep the terminal clean.
        // The Clack spinner provides the user-facing progress indication.
        void result; // Acknowledge captured output is intentionally unused on success.
      } catch (executeError) {
        s.stop(`Failed to initialize Prisma`);
        // Capture stdout/stderr from the error for diagnostics.
        const errorOutput = executeError instanceof Error
          ? (executeError as any).stdout ?? (executeError as any).stderr ?? ""
          : "";
        const errorMessage =
          executeError instanceof Error ? executeError.message : String(executeError);
        // Include captured output in the error message for actionable diagnostics.
        const fullMessage = errorOutput
          ? `${errorMessage}\n\nCaptured output:\n${errorOutput}`
          : errorMessage;
        throw new SpawnError(
          prismaCmd,
          prismaArgs,
          fullMessage,
          {
            cause: executeError instanceof Error ? executeError : undefined,
          },
        );
      }
    } catch (error) {
      throw new SpawnError(
        "prisma",
        ["init"],
        error instanceof Error ? error.message : String(error),
        { cause: error instanceof Error ? error : undefined },
      );
    }
  }

  // Step 3b: Generate the Prisma Client — ALWAYS (decision document,
  // section "always-generate"): `prisma generate` is byte-stable on an
  // unchanged schema (verified empirically, identical sha256 across runs)
  // and costs 300-700 ms, while skipping on client-existence alone is
  // indefensible (a model added between two runs would leave a stale
  // client — the staleness case). The command therefore runs on every
  // reconcile, fresh OR existing, after a skipped OR executed init.
  if (!ctx.dryRun) {
    // Step 3b: Generate the Prisma Client. Prisma 7 has NO auto-generate —
    // @prisma/client ships a stub that throws "did not initialize yet" at
    // import time until `prisma generate` runs, and no install-lifecycle
    // script triggers it. Without this step the generated lib/prisma.ts
    // would import a path that does not exist yet. Resolved through the
    // SAME dlx mechanism as init (getCliCommand(parseNlx, ["prisma@7",
    // "generate", "--no-hints"]) → pnpm dlx / npx / yarn dlx / bun x),
    // guarded by the same "dlx resolved as add" mis-resolution workaround
    // as init. `--no-hints` is Prisma's official documented flag (since
    // 5.16.0): it suppresses the interactive agent-skills offer and the NPS
    // survey — both of which render a 30s timeout prompt when stdin stays
    // TTY-attached through the npx shim — while errors and warnings are
    // still printed (verified against the prisma@7.10.0 CLI bundle).
    try {
      const s = spinner();
      s.start("Generating Prisma Client (prisma generate)");

      const generateResolved = await getCliCommand(
        parseNlx,
        ["prisma@7", "generate", "--no-hints"],
        {
          cwd: process.cwd(),
          programmatic: true,
        },
      );
      if (!generateResolved) {
        throw new SpawnError(
          "prisma",
          ["generate", "--no-hints"],
          "Failed to resolve prisma generate command",
        );
      }

      const {
        command: generateCmdInitial,
        args: generateArgsInitial,
        cwd: generateResolvedCwd,
      } = generateResolved;

      let generateCmd = generateCmdInitial;
      let generateArgs = generateArgsInitial;

      // Same @antfu/ni "dlx resolved as add" mis-resolution guard as init,
      // with the same shape: the check runs on the RESOLVED args ("add"
      // present = mis-resolved), the rewrite restores the INTENDED args
      // (the original contract — here a literal, same as init's
      // originalArgs). Checking resolved args[0] === "prisma@7" would never
      // fire: a mis-resolved command starts with "add".
      if (generateArgs.includes("add")) {
        generateCmd = "npx";
        generateArgs = ["prisma@7", "generate", "--no-hints"];
      }

      // Same pnpm dlx build approval as init (install-layer adapter): the
      // generate cache is a separate dlx install with the same transitive
      // @prisma/engines postinstall gate.
      generateArgs = withDlxBuildApprovals(
        generateCmd,
        generateArgs,
        planToUse.dependencyPlan,
      );

      try {
        // Use stdio: "pipe" to capture output and prevent leakage into the terminal.
        // Output is only surfaced on failure for diagnostics.
        const result = await executeCommand(generateCmd, generateArgs, {
          cwd: generateResolvedCwd ?? process.cwd(),
          stdio: "pipe",
        });
        s.stop("Prisma Client generated");
        // Success: output is intentionally discarded to keep the terminal clean.
        void result; // Acknowledge captured output is intentionally unused on success.
      } catch (executeError) {
        s.stop(`Failed to generate Prisma Client`);
        // Capture stdout/stderr from the error for diagnostics.
        const errorOutput = executeError instanceof Error
          ? (executeError as any).stdout ?? (executeError as any).stderr ?? ""
          : "";
        const errorMessage =
          executeError instanceof Error ? executeError.message : String(executeError);
        // Include captured output in the error message for actionable diagnostics.
        const fullMessage = errorOutput
          ? `${errorMessage}\n\nCaptured output:\n${errorOutput}`
          : errorMessage;
        throw new SpawnError(
          generateCmd,
          generateArgs,
          fullMessage,
          {
            cause: executeError instanceof Error ? executeError : undefined,
          },
        );
      }
    } catch (error) {
      throw new SpawnError(
        "prisma",
        ["generate", "--no-hints"],
        error instanceof Error ? error.message : String(error),
        { cause: error instanceof Error ? error : undefined },
      );
    }
  } else {
    // Dry-run: record the planned prisma init and the files Prisma owns.
    // The gated path (initRequired=false) shows the skip instead — the
    // wouldRun entries below reflect only what would actually execute.
    if (!planToUse.initRequired) {
      result.skipped.push(
        "Prisma initialization (schema.prisma or prisma7.config.ts already exists)",
      );
    }
    // Reflect the DXG-owned skills decision in the planned command:
    // No (default) → "--no-skills" is part of the planned arguments;
    // Yes → the flag is omitted (prisma@7 then installs skills
    // non-interactively). Nothing is executed in dry-run mode.
    if (planToUse.initRequired) {
      const plannedArgs = buildPrismaInitArgs(
        providerObj.prismaProvider,
        planToUse.installPrismaSkills === true,
        planToUse.prismaInitOutput,
      )
        .slice(1) // drop the "prisma@7" package spec for display
        .join(" ");
      result.wouldRun.push(`prisma ${plannedArgs}`);
    }
    result.wouldRun.push("prisma generate --no-hints");
    if (planToUse.initRequired) {
      result.wouldRun.push(
        "create prisma/schema.prisma, prisma7.config.ts, .env (Prisma-owned)",
      );
    }
  }

  // Step 4b: .env additive reconciliation (decision document, section 5).
  // `prisma init` preserves an existing .env byte-for-byte but NEVER adds
  // DATABASE_URL to it (verified empirically) — the historical false
  // success: green run, broken runtime. DXG owns the gap:
  // - .env absent → create a minimal one. When init ran, it created a
  //   .env with DATABASE_URL="" (empty) that the write below REPLACES
  //   with the minimal file — envExists holds the PRE-RUN truth, so the
  //   "absent" branch wins over init's empty placeholder.
  // - .env present without DATABASE_URL → APPEND one line; every existing
  //   byte is preserved.
  // - .env already defines DATABASE_URL → untouched.
  // The line's VALUE is provider-aware (plan.envDatabaseUrlLine): SQLite
  // gets the conventional file URL — an empty one fails `prisma db push`
  // with `Connection url is empty` (live-proven, e2e sqlite-native
  // 2026-10-10) — server providers keep the empty placeholder.
  if (planToUse.envNeedsDatabaseUrl) {
    if (ctx.dryRun) {
      result.wouldRun.push(
        planToUse.envExists === false && planToUse.initRequired
          ? "create .env with DATABASE_URL (via prisma init)"
          : `${planToUse.envExists === false ? "create" : "append to"} .env a minimal DATABASE_URL line`,
      );
    } else {
      const envPath = join(ctx.awareness.projectRoot, ".env");
      // envExists comes from the inspection (pre-run truth); when init
      // just created .env it holds DATABASE_URL already (marker false).
      const envText = planToUse.envExists
        ? ((await fs.readFile(envPath, {
            encoding: "utf8",
          })) as string | undefined)
        : undefined;
      if (typeof envText !== "string") {
        // No .env at all: minimal file (init skipped means nothing else
        // would create it).
        await fs.writeFile(
          envPath,
          [
            "# Environment variables — declared by the database layer",
            planToUse.envDatabaseUrlLine,
            "",
          ].join("\n"),
          "utf8",
        );
        result.created.push(".env (minimal, DATABASE_URL placeholder)");
      } else if (!/^\s*(?:export\s+)?DATABASE_URL\s*=/m.test(envText)) {
        // Byte-preserving append: original content first, untouched, then
        // the new declaration on its own line.
        const needsLeadingNewline =
          envText.length > 0 && !envText.endsWith("\n");
        await fs.writeFile(
          envPath,
          `${envText}${needsLeadingNewline ? "\n" : ""}${planToUse.envDatabaseUrlLine}\n`,
          "utf8",
        );
        result.updated.push(".env (appended DATABASE_URL)");
      }
      // envHasDatabaseUrl=true never reaches here (marker false).
    }
  }

  // Step 4c: .gitignore coverage for the .env this run wrote. `prisma
  // init` warns about it ("Don't forget to add .env in it to not commit
  // any private information" — live-captured in the audit reference
  // run) but never acts. DXG owns the DATABASE_URL declaration, so DXG
  // closes the hygiene loop — additively and byte-preservingly,
  // mirroring Step 4b's philosophy:
  // - .gitignore absent → create a minimal one covering .env.
  // - present without .env coverage → APPEND the line; every existing
  //   byte is preserved.
  //   - already covering .env (whole-line spellings: .env, .env*,
  //   *.env — the only spellings git actually ignores .env under,
  //   probe-verified 2026-10-11; ".env.*" does NOT cover .env) →
  //   untouched. Trailing spaces are insignificant to git (trimmed
  //   for the comparison); leading spaces are significant — an
  //   indented "  .env" is not coverage and must not count.
  // - an explicit `!.env` negation is a deliberate user choice to track
  //   .env → respected, untouched.
  // Scoped to envNeedsDatabaseUrl — the same marker that gates the .env
  // write: a user-owned .env that already declared DATABASE_URL is
  // none of DXG's business, and reruns find DATABASE_URL already
  // declared, never re-entering this path (idempotent by construction).
  if (planToUse.envNeedsDatabaseUrl) {
    if (ctx.dryRun) {
      result.wouldRun.push("ensure .gitignore covers .env");
    } else {
      const gitignorePath = join(ctx.awareness.projectRoot, ".gitignore");
      // pathExists BEFORE readFile: readFile throws ENOENT on a missing
      // file (there is no pre-run inspection for .gitignore — unlike
      // .env's envExists marker), so existence is checked here.
      const gitignoreText = (await fs.pathExists(gitignorePath))
        ? ((await fs.readFile(gitignorePath, {
            encoding: "utf8",
          })) as string)
        : undefined;
      const lines =
        typeof gitignoreText === "string"
          ? gitignoreText.split(/\r?\n/)
          : [];
      const coversEnv = lines.some((line) =>
        [".env", ".env*", "*.env"].includes(line.trimEnd()),
      );
      const negatesEnv = lines.some((line) => line.trimEnd() === "!.env");
      if (!coversEnv && !negatesEnv) {
        if (typeof gitignoreText !== "string") {
          await fs.writeFile(gitignorePath, ".env\n", "utf8");
          result.created.push(".gitignore (covers .env)");
        } else {
          const needsLeadingNewline =
            gitignoreText.length > 0 && !gitignoreText.endsWith("\n");
          await fs.writeFile(
            gitignorePath,
            `${gitignoreText}${needsLeadingNewline ? "\n" : ""}.env\n`,
            "utf8",
          );
          result.updated.push(".gitignore (appended .env)");
        }
      }
    }
  }

  // Step 5: Add the selected database scripts to package.json
  const selectedScripts = resolveDatabaseScripts(
    answers.databaseScripts,
    planToUse.provider,
  );
  if (selectedScripts.length === 0) {
    // "Skip" (or an empty customize selection): package.json is left
    // untouched; the summary makes the skip visible.
    result.skipped.push("database scripts (skipped)");
  } else if (!ctx.dryRun) {
    // Declared with let (not const) because addPackageScripts is the
    // sole assignment; the initial value documents the empty-result shape
    // for the catch path below.
    let scriptResult: {
      added: string[];
      skipped: string[];
      conflicted: { script: string; existingCommand: string }[];
    };
    try {
      const scriptsToAdd: Record<string, string> = {};
      for (const name of selectedScripts) {
        scriptsToAdd[name] = databaseScriptCatalog[name].command;
      }

      // Read package.json FRESH from disk. Steps 1-2 of this run executed the
      // package manager, which persists the newly installed dependencies into
      // package.json on disk. `ctx.awareness.packageJson` is the pre-install
      // snapshot captured ONCE at CLI bootstrap (detectProjectAwareness) —
      // handing it to addPackageScripts would write that stale snapshot back
      // verbatim (full writeJson overwrite), erasing every dependency the
      // package manager just recorded: node_modules had Prisma, the manifest
      // no longer declared it, and a later `pnpm prisma ...` pruned the
      // "extraneous" packages. ProjectAwareness stays read-only knowledge.
      const packageJsonPath = join(ctx.awareness.projectRoot, "package.json");
      const currentPackageJson = await ctx.fs.readJson<
        Record<string, unknown> & { scripts?: Record<string, string> }
      >(packageJsonPath);

      scriptResult = await addPackageScripts(
        currentPackageJson,
        ctx.awareness.projectRoot,
        ctx.dryRun ?? false,
        ctx.force ?? false,
        {
          readJson: ctx.fs.readJson,
          writeJson: ctx.fs.writeJson,
        },
        scriptsToAdd,
      );

      // Seed support (Prisma 7 contract): `prisma db seed` resolves its
      // command from `migrations.seed` in prisma7.config.ts — never from
      // package.json. Applied as its own file write, separate from the
      // scripts write-back (different file, different semantics): the
      // rest of the Prisma-owned config is preserved byte-for-byte.
      if (planToUse.seedSelected) {
        const seedConfigResult = await applySeedConfigToPrismaFile(
          ctx.fs,
          ctx.awareness.projectRoot,
          ctx.force ?? false,
        );
        if (seedConfigResult.conflictExisting !== undefined) {
          result.conflicts.push({
            path: `${PRISMA_CONFIG_PATH} migrations.seed (existing: ${seedConfigResult.conflictExisting})`,
            existsAs: "file",
          });
        } else if (seedConfigResult.added) {
          result.updated.push(
            `${PRISMA_CONFIG_PATH} migrations.seed (${SEED_CONFIG_COMMAND})`,
          );
        }
        // skipped → already configured identically; the summary reports
        // it through the script result (db:seed already exists).
      }

      // Record script results into the structured operation result —
      // rendered once by summarizeDatabase, never narrated mid-run.
      if (scriptResult.added.length > 0) {
        // If we added scripts, we've updated package.json
        result.updated.push("package.json");
        result.updated.push(
          ...scriptResult.added.map(
            (script) => `package.json scripts (${script})`,
          ),
        );
      }
      if (scriptResult.skipped.length > 0) {
        result.skipped.push(
          ...scriptResult.skipped.map(
            (script) => `package.json script ${script} (already exists)`,
          ),
        );
      }
      if (scriptResult.conflicted.length > 0) {
        const conflictDetails = scriptResult.conflicted
          .map((c) => `${c.script} (existing: ${c.existingCommand})`)
          .join(", ");
        result.conflicts.push({
          path: `package.json scripts (${conflictDetails})`,
          existsAs: "file",
        });
      }
    } catch (error) {
      // Don't fail the whole generator for script issues — but a missing
      // scripts section is actionable context the user needs to know about,
      // so it earns a single dedicated note (not part of the success summary).
      note(
        `Failed to add database scripts: ${error instanceof Error ? error.message : String(error)}`,
        "Warning",
      );
    }
  } else {
    // Dry-run: record the planned script additions for the summary
    result.wouldRun.push(
      `add database scripts to package.json (${selectedScripts.join(", ")})`,
    );
  }

  // Step 4: Handle DXG-owned application template (Prisma Client integration)
  for (const { path, templatePath, data } of planToUse.filesToCreate) {
    // Read the template file with utf8 encoding to get a string directly
    let template: string;
    try {
      template = (await fs.readFile(templatePath, {
        encoding: "utf8",
      })) as string;
    } catch (error) {
      throw new TemplateMissingError(templatePath, { cause: error instanceof Error ? error : undefined });
    }

    const rendered = ctx.templates.render(template, data);
    const exists = await fs.pathExists(path);

    if (exists) {
      // Check if it's a file or directory
      const stats = await fs.stat(path);
      const isDirectory = stats.isDirectory();

      if (isDirectory) {
        // Directory collision - expected path is occupied by a directory
        result.conflicts.push({ path, existsAs: "directory" });
        continue;
      }

      // It's a file, check content (normalize line endings and trailing spaces for idempotence)
      const current = (await fs.readFile(path, { encoding: "utf8" })) as string;
      if (normalizeContent(current) === normalizeContent(rendered)) {
        result.skipped.push(path);
        continue;
      }

      // File exists with different content - handle based on dryRun and force flags
      if (ctx.dryRun) {
        // In dry-run mode, report as conflict (would need user interaction or force to resolve)
        result.conflicts.push({ path, existsAs: "file" });
        continue;
      }

      if (ctx.force) {
        // Force overwrite
        await fs.writeFile(path, rendered, "utf8");
        result.updated.push(path);
        continue;
      }

      // Without force, treat as conflict
      result.conflicts.push({ path, existsAs: "file" });
      continue;
    } else {
      // Path doesn't exist, check if parent directory would be a file collision
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) {
        const dirExists = await fs.pathExists(dir);
        if (dirExists) {
          const dirStats = await fs.stat(dir);
          if (dirStats.isFile()) {
            // Parent path is occupied by a file
            result.conflicts.push({ path: dir, existsAs: "file" });
            continue;
          }
        }
      }

      // Safe to create
      if (!ctx.dryRun) {
        // Ensure the directory exists
        if (dir && !(await fs.pathExists(dir))) {
          await fs.mkdir(dir, { recursive: true });
        }
        await fs.writeFile(path, rendered, "utf8");
      }
      result.created.push(path);
    }
  }

  return result;
}

// Verification function
export async function verifyDatabase(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planDatabase>,
): Promise<void> {
  const { fs } = ctx;
  const planToUse = plan ?? planDatabase(answers);

  // Verify that the DXG-owned application file exists if it was supposed to be created
  for (const { path } of planToUse.filesToCreate) {
    const exists = await fs.pathExists(path);
    if (!exists) {
      throw new ValidationError(`Expected file missing after generation: ${path}`);
    }
  }

  // Prisma-owned artifact: the generated client. The path is DYNAMIC —
  // parsed from the schema's generator block when the project owns its
  // schema (custom output), the DXG default otherwise. `prisma generate`
  // writes client.ts at that output (prisma-client generator writes INTO
  // the project, not node_modules). Missing client.ts = the "did not
  // initialize yet" stub at import time — verified empirically in lab
  // e2e-pnpm/e2e-npm.
  const generatedClientPath = `${planToUse.generatorOutput}/client.ts`;
  if (!(await fs.pathExists(generatedClientPath))) {
    throw new ValidationError(
      `Prisma Client was not generated: ${generatedClientPath} is missing. Run "npm run db:generate" (prisma generate) and try again.`,
    );
  }

  // Native-driver artifact (SQLite only): the better-sqlite3 binding.
  // Version-aware (lab-verified): 12.x resolves lazily through the
  // `bindings` package → build/Release/better_sqlite3.node; 13.x ships
  // N-API prebuilds inside the tarball → prebuilds/<platform>-<arch>.node.
  // The plan pins ^12.6.0 (adapter requirement), but verification must
  // accept either layout — a user may have resolved a different major.
  // A missing binding is EXACTLY what a blocked install script leaves
  // behind: install exits 0 (npm/bun) or 1-with-tree-installed (pnpm),
  // `require("better-sqlite3")` still succeeds, and the failure only
  // surfaces at `new Database()` with "Could not locate the bindings file".
  if (planToUse.provider === "sqlite" && !ctx.dryRun) {
    const bindingCandidates = [
      "node_modules/better-sqlite3/build/Release/better_sqlite3.node", // 12.x
      // 13.x prebuilds: platform-arch named (win32-x64, linux-arm64, …) —
      // glob-less probe: the directory itself is the signal.
      "node_modules/better-sqlite3/prebuilds",
    ];
    let bindingFound = false;
    for (const candidate of bindingCandidates) {
      if (await fs.pathExists(candidate)) {
        bindingFound = true;
        break;
      }
    }
    if (!bindingFound) {
      throw new BuildBlockedError(
        ["better-sqlite3"],
        { cause: new Error("Native binding not found after install") },
      );
    }
  }

  // Note: We don't verify prisma-owned files (schema.prisma, prisma7.config.ts, .env)
  // as they are managed by Prisma CLI, not DXG — but the generated client
  // IS verified because lib/prisma.ts imports it.
}

// Summarize function using Clack UX (replaces logger-based summarization).
// Collect first, render once: the structured result — including the dry-run
// plan — is consolidated into a single coherent Operation Summary note.
// Fully Clack-native: no logger output (completion itself is communicated
// by the generator's outro).
export interface SummarizeDatabaseOptions {
  created: string[];
  updated: string[];
  skipped: string[];
  conflicts: { path: string; existsAs: "file" | "directory" }[];
  wouldRun?: string[];
  /** Detected Prisma provider (for the "Detected" section in dry-run). */
  detectedProvider?: string | null;
  /** Requested provider (for the "Detected" section in dry-run). */
  requestedProvider?: string;
}

/**
 * Summarizes the database generator operation.
 * Includes a "Detected" section showing the existing Prisma provider vs requested.
 */
export function summarizeDatabase(options: SummarizeDatabaseOptions): void {
  const {
    created,
    updated,
    skipped,
    conflicts,
    wouldRun,
    detectedProvider,
    requestedProvider,
  } = options;

  const sections: string[] = [];

  // Detected section (shown in dry-run and normal execution when Prisma exists)
  if (detectedProvider !== undefined) {
    const detectedLine = detectedProvider
      ? `Prisma provider: ${detectedProvider}`
      : "Prisma provider: (non déterminé)";
    const requestedLine = requestedProvider
      ? `Requested: ${requestedProvider}`
      : "Requested: (inconnu)";

    let matchStatus = "";
    if (detectedProvider && requestedProvider) {
      matchStatus = providersMatch(detectedProvider, requestedProvider)
        ? " → ✔ match"
        : " → ✖ mismatch, aucune action";
    }

    sections.push(
      ["Detected:", `  • ${detectedLine}`, `  • ${requestedLine}${matchStatus}`].join(
        "\n",
      ),
    );
  }

  if (created.length) {
    sections.push(["Created:", ...created.map((p) => `  • ${p}`)].join("\n"));
  }

  if (updated.length) {
    sections.push(["Updated:", ...updated.map((p) => `  • ${p}`)].join("\n"));
  }

  if (skipped.length) {
    sections.push(["Skipped:", ...skipped.map((p) => `  • ${p}`)].join("\n"));
  }

  if (conflicts.length) {
    sections.push(
      [
        "Conflicts:",
        ...conflicts.map((c) => `  • ${c.path} (${c.existsAs})`),
      ].join("\n"),
    );
  }

  // Dry-run plan: the operations that WOULD be performed, described
  // coherently instead of note-by-note narration.
  if (wouldRun && wouldRun.length > 0) {
    sections.push(
      ["Would run:", ...wouldRun.map((op) => `  • ${op}`)].join("\n")
    );
  }

  // Only render the summary block when there is something to report.
  if (sections.length > 0) {
    note(sections.join("\n\n"), "Operation Summary");
  }
}

/**
 * Database generator – satisfies the Generator interface.
 * The run method executes the full pipeline: validate → plan → execute → verify → summarize.
 */
export const databaseGenerator: Generator = {
  name: "database",
  description: "Adds Prisma ORM with a selected database provider",
  prompts: databasePrompts,
  async run(cliAnswers: Record<string, unknown>, context: GeneratorContext) {
    const ctx = context;

    // Collect inputs - use CLI/provided answers
    let answers = { ...cliAnswers };

    // ============================================================
    // STEP 1: Validate provider BEFORE any prompts or side effects
    // ============================================================
    // Normalize provider (postgres -> postgresql) and validate it's supported
    const rawProvider = answers.provider as string | undefined;
    let normalizedProvider: string | undefined;
    if (rawProvider !== undefined) {
      normalizedProvider = normalizePrismaProvider(rawProvider);
      answers.provider = normalizedProvider;
    }

    // Check if provider is supported (fail fast with dedicated error code)
    const supportedProviders = Object.keys(providerData);
    if (normalizedProvider !== undefined && !providerData[normalizedProvider as keyof typeof providerData]) {
      throw new ProviderUnsupportedError(normalizedProvider, supportedProviders);
    }

    // ============================================================
    // STEP 2: Detect existing Prisma state (read-only)
    // ============================================================
    const prismaState = await detectPrismaState(ctx);

    // ============================================================
    // STEP 3: Compare providers (mismatch -> error, before prompts)
    // ============================================================
    if (
      prismaState.installed &&
      prismaState.provider &&
      normalizedProvider !== undefined &&
      !providersMatch(prismaState.provider, normalizedProvider)
    ) {
      throw new ProviderMismatchError(prismaState.provider, normalizedProvider);
    }

    // ============================================================
    // STEP 4: Now handle prompts (only if validation passed)
    // ============================================================
    // Intro (only show if we might prompt or in interactive mode)
    const needsProvider = answers.provider === undefined;
    const needsSkillsAnswer = answers.installPrismaSkills === undefined;
    const needsScriptsAnswer = answers.databaseScripts === undefined;

    // Only prompt in interactive mode (not dry-run and not CI)
    const shouldPrompt = !ctx.dryRun && !ctx.nonInteractive && !process.env.CI;

    if (shouldPrompt) {
      // Show intro only in interactive mode
      intro(pc.bgCyan(pc.black(" DXG Database Setup ")));
    }

    if (
      shouldPrompt &&
      (needsProvider ||
        needsSkillsAnswer ||
        needsScriptsAnswer)
    ) {
      // Use interactive prompts for missing fields. DXG owns the Prisma
      // agent skills decision ("Install Prisma agent skills?") — it is asked
      // here, after the provider selection, so the Prisma CLI itself never
      // has to ask it. The database scripts phase question follows: it
      // decides which db:* npm scripts land in package.json.
      const promptQuestions = [];

      if (needsProvider) {
        promptQuestions.push(databasePrompts[0]); // provider prompt
      }
      if (needsSkillsAnswer) {
        promptQuestions.push(databasePrompts[1]); // skills prompt
      }
      if (needsScriptsAnswer) {
        promptQuestions.push(databasePrompts[2]); // database scripts prompt
      }

      let promptAnswers: Record<string, unknown>;
      try {
        promptAnswers = await prompt(
          promptQuestions as Parameters<typeof prompt>[0],
        );
      } catch (error) {
        // Handle cancellation during interactive input collection
        if (isCancel(error)) {
          cancel("Operation cancelled");
        }
        throw error;
      }
      answers = { ...answers, ...promptAnswers };
    } else if (needsProvider && !shouldPrompt) {
      // In non-interactive mode, throw error for missing required values
      const missing = [];
      if (needsProvider) missing.push("provider");
      throw new ValidationError(
        `Missing required values in non-interactive mode: ${missing.join(", ")}`,
      );
    }

    if (answers.installPrismaSkills === undefined) {
      // Non-interactive / dry-run / CLI-only default: do NOT install Prisma
      // agent skills. The conservative choice keeps the user's project free
      // of .claude/skills/, .windsurf/skills/, .agents/skills/ and
      // skills-lock.json unless explicitly requested (see buildPrismaInitArgs).
      answers.installPrismaSkills = false;
    }

    // Database scripts phase — interactive customize branch. The user chose
    // "Customize": show the provider-appropriate script catalogue (each
    // option carries its hint) with the recommended set preselected. Clack
    // primitives resolve with the cancel symbol; throw it so the existing
    // cancellation boundary (run's isCancel catch → the CLI's clean exit)
    // handles it. Asked AFTER database setup answers, BEFORE execution —
    // cancelling here leaves package.json completely untouched.
    if (answers.databaseScripts === "customize") {
      try {
        answers.databaseScripts = await promptCustomScripts(
          answers.provider as string,
        );
      } catch (error) {
        if (isCancel(error)) {
          cancel("Operation cancelled");
        }
        throw error;
      }
    }

    // Helper path question — asked AFTER the database scripts phase
    // (including the customize multiselect) so the flow is:
    // provider → skills → databaseScripts → [customize multiselect] → helperPath
    const needsHelperPathNow = answers.helperPath === undefined;
    if (shouldPrompt && needsHelperPathNow) {
      const helperPrompt = databasePrompts[3]; // helper path prompt
      try {
        const helperAnswer = await prompt([helperPrompt] as Parameters<typeof prompt>[0]);
        answers = { ...answers, ...helperAnswer };
      } catch (error) {
        if (isCancel(error)) {
          cancel("Operation cancelled");
        }
        throw error;
      }
    }

    // Validate (interface compliance)
    if (!validateDatabase()) {
      // Use Clack cancel for validation failure
      cancel("Invalid responses for database generator");
      throw new ValidationError("Invalid responses for database generator");
    }

    try {
      // Validate preconditions (inside the try so precondition failures close
      // the Clack frame via the catch's outro, like execution failures do)
      await checkPreconditions(ctx);

      // Inspect BEFORE planning: every gate below reasons about the real
      // on-disk state, never about what a previous run may have left.
      const inspection = await inspectDatabase(ctx, answers.provider as string);

      // GATE 1 (fail early, before ANY installation): `prisma init` exits 1
      // when any prisma/ folder exists — even an empty one (verified
      // empirically). A prisma/ directory without schema.prisma is therefore
      // unrecoverable for this generator: it must neither install (the user
      // decides the resolution) nor init (it would fail anyway).
      if (inspection.prismaDirEmpty) {
        throw new ValidationError(
          [
            "The prisma/ directory exists but contains no schema.prisma.",
            "Prisma init refuses to run when a prisma/ folder already exists,",
            "so DXG cannot reconcile this state automatically.",
            "Either create prisma/schema.prisma yourself or remove the prisma/",
            "directory, then run dxg add database again.",
          ].join("\n"),
        );
      }

      // GATE 2 (fail early, before ANY installation): an incompatible Prisma
      // declaration (6.x, 8.x, another 7.x, a prerelease range) is a user
      // decision DXG must not overturn silently — npm flips a declared
      // 6.20.0 to ^7.10.0 without any warning (verified empirically). The
      // user resolves the version conflict explicitly; nothing is touched.
      if (
        inspection.prismaVersion === "incompatible" ||
        inspection.clientVersion === "incompatible"
      ) {
        const declared = [
          inspection.prismaDeclaredSpec !== undefined
            ? `prisma: ${inspection.prismaDeclaredSpec}`
            : null,
          inspection.clientDeclaredSpec !== undefined
            ? `@prisma/client: ${inspection.clientDeclaredSpec}`
            : null,
        ]
          .filter(Boolean)
          .join(", ");
        throw new PrismaVersionConflictError(
          [
            `Prisma version conflict: this project declares ${declared},`,
            `but DXG verifies against prisma@${PRISMA_PINNED_VERSION} (exact pin).`,
            "DXG will not silently upgrade or downgrade an existing Prisma",
            "declaration. Align the declared version to 7.10.0 (or a range that",
            "contains exactly it, e.g. ^7.10.0) and run dxg add database again.",
          ].join("\n"),
        );
      }


      // GATE 3b: Provider installed but undetermined (unreadable schema).
      // Warn but continue — don't block, just inform.
      if (prismaState.installed && prismaState.provider === null) {
        note(
          [
            "Existing Prisma provider not detected, verification impossible.",
            "DXG will continue by filling in what is missing.",
          ].join("\n"),
          "Warning",
        );
      }

      // ============================================================
      // Idempotence check for lib/prisma.ts: compare generated content
      // with existing file (normalized CRLF/LF, trimmed trailing spaces)
      // ============================================================
      const helperPath = answers.helperPath as string | undefined;
      let skipHelperPrompt = false;
      if (helperPath) {
        const fs = ctx.fs;
        const existingHelper = await fs.pathExists(helperPath);
        if (existingHelper) {
          // Get the provider to generate the expected template content
          const providerKey = answers.provider as string;
          const provider = providerData[providerKey as keyof typeof providerData];
          if (provider) {
            const templatePath = provider.templatePath;
            const templateContent = (await fs.readFile(templatePath, { encoding: "utf8" })) as string;
            // We need to render the template with the same data that executeDatabase would use
            // The template uses these variables: outputPath, provider, adapterImport, adapterClass, etc.
            // Let's compute the expected rendered content
            const outputPath = helperPath.replace(/\\/g, "/");
            const generatedContent = templateContent
              .replace(/\{\{outputPath\}\}/g, provider.templateOutputPath)
              .replace(/\{\{provider\}\}/g, provider.key)
              .replace(/\{\{adapterImport\}\}/g, provider.adapterImport)
              .replace(/\{\{adapterClass\}\}/g, provider.adapterClass)
              .replace(/\{\{instantiationPattern\}\}/g, provider.instantiationPattern)
              .replace(/\{\{importPath\}\}/g, computeRelativeImport(outputPath, provider.templateOutputPath));

            // Read existing file and compare normalized
            const existingContent = (await fs.readFile(helperPath, { encoding: "utf8" })) as string;
            const normalizedGenerated = normalizeContent(generatedContent);
            const normalizedExisting = normalizeContent(existingContent);

            if (normalizedGenerated === normalizedExisting) {
              // Identical -> skip silently, don't ask for helper path again
              skipHelperPrompt = true;
            }
            // If different, it will be reported as conflict in plan/execute
          }
        }
      }

      // Helper path question — asked AFTER the database scripts phase
      // (including the customize multiselect) so the flow is:
      // provider → skills → databaseScripts → [customize multiselect] → helperPath
      // Skip if idempotence check found identical content
      const needsHelperPathNow = answers.helperPath === undefined;
      if (shouldPrompt && needsHelperPathNow && !skipHelperPrompt) {
        const helperPrompt = databasePrompts[3]; // helper path prompt
        try {
          const helperAnswer = await prompt([helperPrompt] as Parameters<typeof prompt>[0]);
          answers = { ...answers, ...helperAnswer };
        } catch (error) {
          if (isCancel(error)) {
            cancel("Operation cancelled");
          }
          throw error;
        }
      }

      // Plan (state-aware: the inspection drives init/install gating and
      // the dynamic imports for the template files)
      const plan = planDatabase(answers, inspection);

      // Execute
      const execResult = await executeDatabase(answers, ctx, plan);

      // Verify (skip in dry-run mode)
      if (!ctx.dryRun) {
        await verifyDatabase(answers, ctx, plan);
      }

      // Summarize using Clack UX
      summarizeDatabase({
        ...execResult,
        detectedProvider: prismaState.provider,
        requestedProvider: answers.provider as string,
      });

      // Outro
      outro(`Database setup completed for ${answers.provider}!`);
    } catch (error) {
      // Handle cancellation
      if (isCancel(error)) {
        cancel("Operation cancelled");
        throw error;
      }

      // Handle other errors — the CLI's error formatter prints the message;
      // the outro marks the Clack boundary without duplicating it.
      outro(`Failed to setup database for ${answers.provider}`);
      throw error;
    }
  },
};

// Default export for convenience
export default databaseGenerator;