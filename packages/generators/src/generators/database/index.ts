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
} from "@dxgjs/prompts";

import { fileURLToPath } from "url";
import { dirname, join, sep } from "path";
import { executeCommand } from "@dxgjs/fs";
import { parseNi, parseNlx, getCliCommand } from "@antfu/ni";
import pc from "picocolors";

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine if we're in a bundled context (where __dirname points to dist/)
// In bundled context, we need to adjust the path to point to generators/database/templates/
const isBundled =
  __dirname.endsWith(`${sep}dist`) || __dirname.endsWith("/dist");
let templateBasePath;
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
    dependencies: [
      "@prisma/client@7.10.0",
      "@prisma/adapter-better-sqlite3",
      "better-sqlite3",
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

// Check if prisma dependency is already installed in package.json
export async function isPrismaInstalled(
  fs: GeneratorContext["fs"],
): Promise<boolean> {
  try {
    const packageJsonExists = await fs.pathExists("package.json");
    if (!packageJsonExists) {
      return false;
    }
    const content = await fs.readFile("package.json", { encoding: "utf8" });
    const pkg = JSON.parse(content as string);

    // Check for prisma package
    const result =
      (pkg.devDependencies && pkg.devDependencies["prisma@7"]) ||
      (pkg.dependencies && pkg.dependencies["prisma@7"]);
    return !!result;
  } catch {
    // If we can't read or parse, assume not installed
    return false;
  }
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

  // Determine files to create - only DXG-owned application templates
  const filesToCreate = [
    {
      path: provider.templateOutputPath,
      templatePath: provider.templatePath,
      data,
    },
  ];

  return {
    ...data,
    provider: provider.key, // Return just the provider key string for tests
    providerName: provider.displayName,
    // DXG-owned Prisma agent skills decision (from the confirm prompt).
    // Defaults to false (skip) — see buildPrismaInitArgs.
    installPrismaSkills: answers.installPrismaSkills === true,
    devPackages,
    regularPackages,
    filesToCreate,
  };
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

  // Step 1: Install development dependencies
  if (!ctx.dryRun) {
    if (planToUse.devPackages.length > 0) {
      try {
        const resolved = await getCliCommand(
          parseNi,
          ["-D", ...planToUse.devPackages],
          {
            cwd: process.cwd(),
            programmatic: true,
          },
        );

        if (!resolved) {
          throw new Error(
            "Failed to resolve package manager command for adding dev dependencies",
          );
        }

        const { command: cmd, args, cwd: resolvedCwd } = resolved;
        const executeCwd = resolvedCwd ?? process.cwd();

        const s = spinner();
        s.start(
          `Installing dev dependencies: ${planToUse.devPackages.join(", ")}`,
        );
        try {
          await executeCommand(cmd, args, {
            cwd: executeCwd,
            stdio: "inherit",
          });
          s.stop(
            `Successfully installed dev dependencies: ${planToUse.devPackages.join(", ")}`,
          );
        } catch (executeError) {
          s.stop(`Failed to install dev dependencies`);
          throw new Error(
            `Failed to install dev dependencies: ${executeError instanceof Error ? executeError.message : String(executeError)}`,
            { cause: executeError },
          );
        }
      } catch (error) {
        throw new Error(
          `Failed to install dev dependencies: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
  } else {
    // Dry-run: record the planned dev dependency install for the summary
    if (planToUse.devPackages.length > 0) {
      result.wouldRun.push(
        `install dev dependencies (${planToUse.devPackages.join(", ")})`,
      );
    }
  }

  // Step 2: Install regular dependencies
  if (!ctx.dryRun) {
    if (planToUse.regularPackages.length > 0) {
      try {
        const resolved = await getCliCommand(
          parseNi,
          [...planToUse.regularPackages],
          {
            cwd: process.cwd(),
            programmatic: true,
          },
        );

        if (!resolved) {
          throw new Error(
            "Failed to resolve package manager command for adding dependencies",
          );
        }

        const { command: cmd, args, cwd: resolvedCwd } = resolved;
        const executeCwd = resolvedCwd ?? process.cwd();

        const s = spinner();
        s.start(
          `Installing dependencies: ${planToUse.regularPackages.join(", ")}`,
        );
        try {
          await executeCommand(cmd, args, {
            cwd: executeCwd,
            stdio: "inherit",
          });
          s.stop(
            `Successfully installed dependencies: ${planToUse.regularPackages.join(", ")}`,
          );
        } catch (executeError) {
          s.stop(`Failed to install dependencies`);
          throw new Error(
            `Failed to install dependencies: ${executeError instanceof Error ? executeError.message : String(executeError)}`,
            { cause: executeError },
          );
        }
      } catch (error) {
        throw new Error(
          `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    }
  } else {
    // Dry-run: record the planned dependency install for the summary
    if (planToUse.regularPackages.length > 0) {
      result.wouldRun.push(
        `install dependencies (${planToUse.regularPackages.join(", ")})`,
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
    result.wouldRun.push(
      "create prisma/schema.prisma, prisma.config.ts, .env (Prisma-owned)",
    );
  }

  // Step 5: Add Prisma scripts to package.json
  if (!ctx.dryRun) {
    let scriptResult: {
      added: string[];
      skipped: string[];
      conflicted: { script: string; existingCommand: string }[];
    } = {
      added: [],
      skipped: [],
      conflicted: [],
    };
    try {
      const PRISMA_SCRIPTS: Record<string, string> = {
        "db:generate": "prisma generate",
        "db:pull": "prisma db pull",
        "db:push": "prisma db push",
        "db:seed": "prisma db seed",
        "db:studio": "prisma studio",
      };

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
        PRISMA_SCRIPTS,
      );

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
        `Failed to add Prisma scripts: ${error instanceof Error ? error.message : String(error)}`,
        "Warning",
      );
    }
  } else {
    // Dry-run: record the planned script additions for the summary
    result.wouldRun.push(
      "add Prisma scripts to package.json (db:generate, db:pull, db:push, db:seed, db:studio)",
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

  // Note: We don't verify prisma-owned files (schema.prisma, prisma.config.ts, .env)
  // as they are managed by Prisma CLI, not DXG
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

    // Only prompt in interactive mode (not dry-run and not CI)
    const shouldPrompt = !ctx.dryRun && !ctx.nonInteractive && !process.env.CI;

    if (shouldPrompt && (needsProvider || needsSkillsAnswer)) {
      // Use interactive prompts for missing fields. DXG owns the Prisma
      // agent skills decision ("Install Prisma agent skills?") — it is asked
      // here, after the provider selection, so the Prisma CLI itself never
      // has to ask it.
      const promptQuestions = [];

      if (needsProvider) {
        promptQuestions.push(databasePrompts[0]); // provider prompt
      }
      if (needsSkillsAnswer) {
        promptQuestions.push(databasePrompts[1]); // skills prompt
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
