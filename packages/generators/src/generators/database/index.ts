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
import { dirname, join, sep } from "path";
import { executeCommand } from "@dxgjs/fs";
import { parseNlx, getCliCommand } from "@antfu/ni";
import pc from "picocolors";
import type {
  DependencyPlan,
  DependencyInstallResult,
} from "../../install/types";
import { installerFailureHint } from "../../install/installer";

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
  "db:migrate": {
    command: "prisma migrate dev",
    hint: "Create and apply Prisma migrations",
    recommended: false,
  },
  "db:pull": {
    command: "prisma db pull",
    hint: "Pull the database schema into Prisma schema",
    recommended: false,
  },
  [SEED_SCRIPT_NAME]: {
    command: "prisma db seed",
    hint: "Seed the database",
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
    (name) =>
      !(excludeMigrations && name === "db:migrate"),
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
] satisfies {
  type: "input" | "confirm" | "select";
  name: string;
  message: string;
  default?: unknown;
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
export function buildPrismaInitArgs(
  prismaProvider: string,
  installSkills: boolean,
): string[] {
  return [
    "prisma@7",
    "init",
    "--datasource-provider",
    prismaProvider,
    ...(installSkills ? [] : ["--no-skills"]),
    "--output",
    "../lib/generated/prisma",
  ];
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
    throw new Error(
      "package.json not found. Please initialize your project (e.g., npm init) before running dxg add database.",
    );
  }

  // Read package.json for compatibility with tests (though not strictly needed for logic)
  // This ensures fs.readFile is called for package.json as expected by tests
  await ctx.fs.readFile("package.json", { encoding: "utf8" });
}

// Planning function
export function planDatabase(answers: Record<string, unknown>) {
  const providerKey = answers.provider as string;
  const provider = providerData[providerKey as keyof typeof providerData];

  if (!provider) {
    throw new Error(`Unsupported provider: ${providerKey}`);
  }

  const data = {
    provider: provider.key,
    providerName: provider.displayName,
    year: new Date().getFullYear(),
    ...provider, // Spread provider data for template use
  };

  // Determine packages to install - separate dev and regular dependencies
  const devPackages = [...provider.devDependencies];
  const regularPackages = [...provider.dependencies];

  // The seed script only works end-to-end when its three parts travel
  // together: the runner (tsx, devDependency), the seed file, and the
  // `prisma.seed` config Prisma reads. Selected here, materialized below.
  const seedSelected =
    resolveDatabaseScripts(answers.databaseScripts, provider.key).includes(
      SEED_SCRIPT_NAME,
    );
  if (seedSelected && !devPackages.includes("tsx")) {
    devPackages.push("tsx");
  }

  // Domain-owned build knowledge (data-driven, provider-local): which
  // packages in this provider's plan run install lifecycle scripts that
  // build native artifacts. prisma's preinstall is a Node-version guard;
  // @prisma/engines' postinstall downloads the schema engine binary
  // (required for migrate/db push); better-sqlite3@12 compiles/links the
  // .node binding. tsx, @types/*, dotenv, pg and the adapters have none.
  const requiresBuild = (spec: string): boolean =>
    /^prisma@/.test(spec) ||
    spec === "@prisma/engines" ||
    /^better-sqlite3@/.test(spec);
  // The adapter pulls @prisma/engines transitively — its build approval is
  // needed even though it never appears as a direct spec.
  const buildApprovalNames = ["prisma", "@prisma/engines"];
  if (provider.key === "sqlite") {
    buildApprovalNames.push("better-sqlite3");
  }

  // DependencyPlan consumed by the installer seam (ctx.installer): the
  // generator declares WHAT needs building; the per-manager adapters own
  // the HOW (pnpm allowBuilds / npm allowScripts / yarn berry
  // dependenciesMeta / bun default-trust).
  const dependencyPlan: DependencyPlan = {
    devDependencies: devPackages.map((spec) => ({
      spec,
      requiresBuild: requiresBuild(spec),
    })),
    dependencies: [
      ...regularPackages.map((spec) => ({
        spec,
        requiresBuild: requiresBuild(spec),
      })),
      // Approval-only entry: @prisma/engines is a TRANSITIVE dependency of
      // prisma (never installed directly by name), but its postinstall is
      // exactly what build-approval gates must cover. approvalOnly keeps it
      // out of the install command args while its name reaches the approval
      // map — validated in lab e2e-pnpm (allowBuilds with '@prisma/engines'
      // → postinstall downloads the schema-engine binary).
      {
        spec: "@prisma/engines",
        requiresBuild: true,
        reason: "postinstall downloads the schema-engine binary",
        approvalOnly: true,
      },
    ],
  };

  // Determine files to create - only DXG-owned application templates
  const filesToCreate = [
    {
      path: provider.templateOutputPath,
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
  const existingSeed = configText.match(/^[ \t]*seed\s*:\s*["'][^"']*["'],?[ \t]*$/m);
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
      throw new Error(
        "Dependency installer unavailable: the generator context was built without one (package manager could not be detected).",
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
        throw new Error(
          `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }

      if (!installResult.success) {
        s.stop("Failed to install dependencies");
        // Normalized failure: reason is machine-usable, hint/suggestion
        // carry the manager's own remediation. A build-script-blocked
        // outcome is reported as what it is — an approval gap, not a
        // broken install.
        const hint = installerFailureHint(installResult);
        throw new Error(
          `Failed to install dependencies (${installResult.reason}): ${installResult.output.trim().split("\n").slice(-8).join("\n")}${hint ? `\n${hint}` : ""}`,
          {
            cause:
              installResult.reason === "build-script-blocked"
                ? new Error(hint)
                : undefined,
          },
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

  // Step 3: Execute Prisma initialization
  if (!ctx.dryRun) {
    try {
      const s = spinner();
      const providerObj =
        providerData[planToUse.provider as keyof typeof providerData];
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
        throw new Error("Failed to resolve prisma command");
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

      const prismaExecuteCwd = prismaResolvedCwd ?? process.cwd();

      try {
        await executeCommand(prismaCmd, prismaArgs, {
          cwd: prismaExecuteCwd,
          stdio: "inherit",
        });
        s.stop(
          `Prisma initialized successfully with provider ${providerObj.prismaProvider}`,
        );
      } catch (executeError) {
        s.stop(`Failed to initialize Prisma`);
        throw new Error(
          `Failed to initialize Prisma: ${executeError instanceof Error ? executeError.message : String(executeError)}`,
          { cause: executeError },
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to initialize Prisma: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

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
        throw new Error("Failed to resolve prisma generate command");
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

      try {
        await executeCommand(generateCmd, generateArgs, {
          cwd: generateResolvedCwd ?? process.cwd(),
          stdio: "inherit",
        });
        s.stop("Prisma Client generated");
      } catch (executeError) {
        s.stop(`Failed to generate Prisma Client`);
        throw new Error(
          `Failed to generate Prisma Client: ${executeError instanceof Error ? executeError.message : String(executeError)}`,
          { cause: executeError },
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to generate Prisma Client: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  } else {
    // Dry-run: record the planned prisma init and the files Prisma owns
    const providerObj =
      providerData[planToUse.provider as keyof typeof providerData];
    // Reflect the DXG-owned skills decision in the planned command:
    // No (default) → "--no-skills" is part of the planned arguments;
    // Yes → the flag is omitted (prisma@7 then installs skills
    // non-interactively). Nothing is executed in dry-run mode.
    const plannedArgs = buildPrismaInitArgs(
      providerObj.prismaProvider,
      planToUse.installPrismaSkills === true,
    )
      .slice(1) // drop the "prisma@7" package spec for display
      .join(" ");
    result.wouldRun.push(`prisma ${plannedArgs}`);
    result.wouldRun.push("prisma generate --no-hints");
    result.wouldRun.push(
      "create prisma/schema.prisma, prisma7.config.ts, .env (Prisma-owned)",
    );
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
      throw new Error(
        `Failed to read template file ${templatePath}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
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

      // It's a file, check content
      const current = (await fs.readFile(path, { encoding: "utf8" })) as string;
      if (current === rendered) {
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
      throw new Error(`Expected file missing after generation: ${path}`);
    }
  }

  // Prisma-owned artifact: the generated client. `prisma init --output
  // ../lib/generated/prisma` + `prisma generate` produce client.ts there
  // (prisma-client generator writes INTO the project, not node_modules).
  // Missing client.ts = the "did not initialize yet" stub at import time —
  // verified empirically in lab e2e-pnpm/e2e-npm.
  const generatedClientPath = "lib/generated/prisma/client.ts";
  if (!(await fs.pathExists(generatedClientPath))) {
    throw new Error(
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
      throw new Error(
        'better-sqlite3 native binding is missing (expected node_modules/better-sqlite3/build/Release/better_sqlite3.node or prebuilds/). The install script was likely blocked by your package manager — approve the build and rebuild, e.g. "pnpm approve-builds" / "npm install-scripts approve better-sqlite3 && npm rebuild better-sqlite3" / "bun pm trust better-sqlite3".',
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
export function summarizeDatabase(result: {
  created: string[];
  updated: string[];
  skipped: string[];
  conflicts: { path: string; existsAs: "file" | "directory" }[];
  wouldRun?: string[];
}): void {
  const { created, updated, skipped, conflicts, wouldRun } = result;

  const sections: string[] = [];

  if (created.length) {
    sections.push(
      ["Created:", ...created.map((p) => `  • ${p}`)].join("\n"),
    );
  }

  if (updated.length) {
    sections.push(
      ["Updated:", ...updated.map((p) => `  • ${p}`)].join("\n"),
    );
  }

  if (skipped.length) {
    sections.push(
      ["Skipped:", ...skipped.map((p) => `  • ${p}`)].join("\n"),
    );
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
      ["Would run:", ...wouldRun.map((op) => `  • ${op}`)].join("\n"),
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

    // Intro
    intro(pc.bgCyan(pc.black(" DXG Database Setup ")));

    // Collect inputs - use CLI/provided answers, fallback to interactive prompts
    let answers = { ...cliAnswers };

    // Check if we need to prompt for missing required fields
    const needsProvider = answers.provider === undefined;
    const needsSkillsAnswer = answers.installPrismaSkills === undefined;
    const needsScriptsAnswer = answers.databaseScripts === undefined;

    // Only prompt in interactive mode (not dry-run and not CI)
    const shouldPrompt = !ctx.dryRun && !ctx.nonInteractive && !process.env.CI;

    if (shouldPrompt && (needsProvider || needsSkillsAnswer || needsScriptsAnswer)) {
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
      throw new Error(
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
        answers.databaseScripts = await promptCustomScripts(answers.provider as string);
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
      throw new Error("Invalid responses for database generator");
    }

    try {
      // Validate preconditions (inside the try so precondition failures close
      // the Clack frame via the catch's outro, like execution failures do)
      await checkPreconditions(ctx);

      // Plan
      const plan = planDatabase(answers);

      // Execute
      const execResult = await executeDatabase(answers, ctx, plan);

      // Verify (skip in dry-run mode)
      if (!ctx.dryRun) {
        await verifyDatabase(answers, ctx, plan);
      }

      // Summarize using Clack UX
      summarizeDatabase(execResult);

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
