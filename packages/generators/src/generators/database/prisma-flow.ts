// packages/generators/src/generators/database/prisma-flow.ts
// This module contains ALL Prisma-specific logic extracted from index.ts
// It exports a single setupPrismaFlow function that runs the complete Prisma setup

import type { GeneratorContext } from "../../types";
import { outro, isCancel, cancel, prompt, note } from "@dxgjs/prompts";
import pc from "picocolors";
import { resolvePackageManagerCommands, type PackageManagerAgent } from "@dxgjs/fs";

// Import from database-meta (single source of truth for Prisma version, providers, scripts, paths)
import {
  providerData,
  databaseScriptCatalog,
  recommendedScripts,
  validateDatabase,
} from "@dxgjs/database-meta";

// Import from local modules
import { detectPrismaState } from "./detect-prisma-state";
import { inspectDatabase } from "./inspect";
import {
  databasePrompts,
  PRISMA_PINNED_VERSION,
  DEFAULT_HELPER_PATH,
  normalizePrismaProvider,
  providersMatch,
  checkPreconditions,
  promptCustomScripts,
  planDatabase,
  executeDatabase,
  verifyDatabase,
  summarizeDatabase,
} from "./index";

// Import error types
import {
  PrismaVersionConflictError,
  ProviderUnsupportedError,
  ProviderMismatchError,
  ValidationError,
} from "@dxgjs/errors";

// Re-export all the public functions from index.ts for backward compatibility
export {
  planDatabase,
  executeDatabase,
  verifyDatabase,
  summarizeDatabase,
  databasePrompts,
  providerData,
  detectPrismaState,
  inspectDatabase,
  buildPrismaInitArgs,
  providerScripts,
  recommendedScripts,
  resolveDatabaseScripts,
  normalizePrismaProvider,
  providersMatch,
  PRISMA_PINNED_VERSION,
  PRISMA_CONFIG_PATH,
  SEED_SCRIPT_NAME,
  SEED_FILE_PATH,
  SEED_CONFIG_COMMAND,
  DEFAULT_GENERATOR_OUTPUT,
  DEFAULT_HELPER_PATH,
  checkPreconditions,
  promptCustomScripts,
  insertSeedIntoPrismaConfig,
  readSeedFromPrismaConfig,
  applySeedConfigToPrismaFile,
  writeSecureFile,
  computeDefaultGeneratorOutput,
  buildIndividualEnvLines,
  parseDatabaseUrl,
} from "./index";

/**
 * Runs the complete Prisma database setup flow.
 * This is the main entry point for Prisma ORM setup, called by databaseGenerator.run()
 * when orm === 'prisma'.
 */
export async function setupPrismaFlow(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
): Promise<void> {
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
  if (
    normalizedProvider !== undefined &&
    !providerData[normalizedProvider as keyof typeof providerData]
  ) {
    throw new ProviderUnsupportedError(
      normalizedProvider,
      supportedProviders,
    );
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
  // STEP 3: Inspect project state BEFORE prompts (for idempotence)
  // ============================================================
  // We need the provider to inspect correctly (provider-specific deps, env handling)
  const providerForInspection = (answers.provider as string) ?? "postgresql";
  const inspection = await inspectDatabase(ctx, providerForInspection);

  // ============================================================
  // GATE 1 (fail early, before ANY installation): `prisma init` exits 1
  // when any prisma/ folder exists — even an empty one (verified
  // empirically). A prisma/ directory without schema.prisma is therefore
  // unrecoverable for this generator: it must neither install (the user
  // decides the resolution) nor init (it would fail anyway).
  // ============================================================
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

  // ============================================================
  // GATE 2 (fail early, before ANY installation): an incompatible Prisma
  // declaration (6.x, 8.x, another 7.x, a prerelease range) is a user
  // decision DXG must not overturn silently — npm flips a declared
  // 6.20.0 to ^7.10.0 without any warning (verified empirically). The
  // user resolves the version conflict explicitly; nothing is touched.
  // ============================================================
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

  // ============================================================
  // STEP 4: Now handle prompts (only if validation passed)
  // ============================================================
  // Intro already shown during ORM selection if interactive
  const needsProvider = answers.provider === undefined;
  const needsSkillsAnswer = answers.installPrismaSkills === undefined;
  // Check if scripts are already configured in package.json
  const packageJsonForScripts = await ctx.fs
    .readJson<
      Record<string, unknown> & { scripts?: Record<string, string> }
    >("package.json")
    .catch(() => undefined);
  const existingScripts = packageJsonForScripts?.scripts ?? {};
  const recommendedScriptNames = recommendedScripts(providerForInspection);
  const hasAllRecommendedScripts = recommendedScriptNames.every(
    (name) => existingScripts[name] === databaseScriptCatalog[name].command,
  );
  const needsScriptsAnswer =
    answers.databaseScripts === undefined && !hasAllRecommendedScripts;

  // Only prompt in interactive mode (not dry-run and not CI)
  const shouldPrompt = !ctx.dryRun && !ctx.nonInteractive && !process.env.CI;

  // First: prompt for provider if needed (provider is now at index 1)
  if (shouldPrompt && needsProvider) {
    // Use existing Prisma provider as default if detected, otherwise postgresql
    const providerDefault = prismaState.provider ?? "postgresql";
    const providerPrompt = {
      ...databasePrompts[1], // provider prompt is at index 1 (index 0 is ORM)
      default: providerDefault,
    };
    const promptQuestions = [providerPrompt];
    let promptAnswers: Record<string, unknown>;
    try {
      promptAnswers = await prompt(
        promptQuestions as Parameters<typeof prompt>[0],
      );
    } catch (error) {
      if (isCancel(error)) {
        throw error;
      }
      throw error;
    }
    answers = { ...answers, ...promptAnswers };
    // Re-inspect with the now-known provider
    const newProvider = answers.provider as string;
    if (newProvider !== providerForInspection) {
      // Provider changed, re-inspect for accurate provider-specific checks
      Object.assign(inspection, await inspectDatabase(ctx, newProvider));
    }
    // Provider mismatch check for interactive mode: if project already has Prisma
    // with a different provider, error out immediately (same as CLI mode)
    if (
      prismaState.installed &&
      prismaState.provider &&
      !providersMatch(prismaState.provider, newProvider)
    ) {
      throw new ProviderMismatchError(prismaState.provider, newProvider);
    }
  } else if (needsProvider && !shouldPrompt) {
    // In non-interactive mode, throw error for missing required values
    throw new ValidationError(
      "Missing required values in non-interactive mode: provider",
    );
  }

  // After provider is known (either from CLI or prompt), check if databaseUrl is needed
  // databaseUrl prompt is needed for ALL providers when not provided AND no existing DATABASE_URL in .env
  const needsDatabaseUrl =
    answers.databaseUrl === undefined && !inspection.envHasDatabaseUrl;

  // Second: prompt for configureDatabaseUrl (for ALL providers, not just server)
  // This matches the test expectations: configureDatabaseUrl is always prompted separately
  if (shouldPrompt && needsDatabaseUrl) {
    const { providerPlaceholders } = await import("@dxgjs/database-meta");
    const placeholder =
      providerPlaceholders[answers.provider as string] ?? "";
    const configureUrlPrompt = {
      type: "confirm" as const,
      name: "configureDatabaseUrl",
      message: "Configure database connection URL now?",
      default: false,
    };
    const configureAnswer = await prompt([configureUrlPrompt]);
    answers = { ...answers, ...configureAnswer };

    // Third: if user wants to configure URL, prompt for databaseUrl
    if (configureAnswer.configureDatabaseUrl) {
      const databaseUrlPrompt = { ...databasePrompts[2] }; // databaseUrl is at index 2
      databaseUrlPrompt.initialValue = placeholder;
      databaseUrlPrompt.default = placeholder;
      databaseUrlPrompt.message +=
        " (format: see template — replace USER/PASSWORD/HOST/DATABASE)";
      const databaseUrlAnswer = await prompt([databaseUrlPrompt]);
      answers = { ...answers, ...databaseUrlAnswer };
    }
    // If user says No, skip databaseUrl prompt — they'll set it in .env later
  }

  // Fourth: prompt for skills and databaseScripts (combined)
  if (shouldPrompt && (needsSkillsAnswer || needsScriptsAnswer)) {
    const promptQuestions = [];
    if (needsSkillsAnswer) {
      promptQuestions.push(databasePrompts[3]); // skills prompt at index 3
    }
    if (needsScriptsAnswer) {
      promptQuestions.push(databasePrompts[4]); // database scripts prompt at index 4
    }
    if (promptQuestions.length > 0) {
      let promptAnswers: Record<string, unknown>;
      try {
        promptAnswers = await prompt(
          promptQuestions as Parameters<typeof prompt>[0],
        );
      } catch (error) {
        if (isCancel(error)) {
          throw error;
        }
        throw error;
      }
      answers = { ...answers, ...promptAnswers };
    }
  }

  // Non-interactive / dry-run / CLI: provide default databaseUrl ONLY for SQLite
  // For server providers, leave undefined — user configures in .env later
  if (answers.databaseUrl === undefined && !inspection.envHasDatabaseUrl) {
    if (answers.provider === "sqlite") {
      const { providerPlaceholders } = await import("@dxgjs/database-meta");
      answers.databaseUrl = providerPlaceholders.sqlite ?? "file:./dev.db";
    }
    // For server providers: no default, they'll set DATABASE_URL in .env manually
  }

  // Non-interactive / dry-run / CLI: provide default databaseUrl ONLY for SQLite
  // For server providers, leave undefined — user configures in .env later
  if (answers.databaseUrl === undefined && !inspection.envHasDatabaseUrl) {
    if (answers.provider === "sqlite") {
      const { providerPlaceholders } = await import("@dxgjs/database-meta");
      answers.databaseUrl = providerPlaceholders.sqlite ?? "file:./dev.db";
    }
    // For server providers: no default, they'll set DATABASE_URL in .env manually
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
        throw error;
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

    // Re-inspect with the final provider (after any prompts) for provider-dependent
    // logic: helper path resolution, planDatabase, etc.
    // Note: GATE 1 and GATE 2 already ran earlier with provider-independent checks.
    const inspection = await inspectDatabase(ctx, answers.provider as string);

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
    // Helper path resolution: detect valid existing helpers BEFORE prompting
    // ============================================================
    // The inspection now returns only content-validated helpers in helperCandidates.
    // - 0 valid helpers -> show prompt with default
    // - 1 valid helper -> auto-reuse it, skip prompt
    // - Multiple valid helpers -> prompt for disambiguation
    const needsHelperPathNow = answers.helperPath === undefined;
    const validHelpers = inspection.helperCandidates ?? [];
    const validHelperCount = validHelpers.length;

    if (needsHelperPathNow && validHelperCount === 1) {
      // Exactly one valid helper found: auto-reuse it, no prompt
      answers.helperPath = validHelpers[0];
    } else if (shouldPrompt && needsHelperPathNow && validHelperCount > 1) {
      // Multiple valid helpers: prompt for disambiguation
      const helperPrompt = databasePrompts[5]; // helper path prompt (index 5, shifted by ORM)
      // Show all valid helpers as hint
      helperPrompt.message += ` (found ${validHelperCount} existing: ${validHelpers.join(", ")})`;
      try {
        const helperAnswer = await prompt([helperPrompt] as Parameters<
          typeof prompt
        >[0]);
        answers = { ...answers, ...helperAnswer };
      } catch (error) {
        if (isCancel(error)) {
          throw error;
        }
        throw error;
      }
    } else if (needsHelperPathNow && !shouldPrompt && validHelperCount > 0) {
      // Non-interactive mode: auto-select first valid helper
      answers.helperPath = validHelpers[0];
    }
    // If no valid helpers found, show the normal prompt with default
    if (shouldPrompt && needsHelperPathNow && validHelperCount === 0) {
      const helperPrompt = databasePrompts[5]; // helper path prompt (index 5, shifted by ORM)
      try {
        const helperAnswer = await prompt([helperPrompt] as Parameters<
          typeof prompt
        >[0]);
        answers = { ...answers, ...helperAnswer };
      } catch (error) {
        if (isCancel(error)) {
          throw error;
        }
        throw error;
      }
    } else if (
      needsHelperPathNow &&
      !shouldPrompt &&
      validHelperCount === 0
    ) {
      // Non-interactive mode with no valid helpers: use default
      answers.helperPath = DEFAULT_HELPER_PATH;
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

    // Next steps — provider-specific, package-manager-aware guided next steps
    const { providerPlaceholders } = await import("@dxgjs/database-meta");
    const placeholder =
      providerPlaceholders[answers.provider as string] ?? "";
    const isSqlite = answers.provider === "sqlite";
    const pm = ctx.awareness.packageManager;

    // Resolve package-manager-specific command prefixes using shared utility
    // Fall back to npm if package manager is unknown (e.g., in test environments without lock files)
    let cmds: { run: string; exec: string };
    try {
      cmds = resolvePackageManagerCommands(pm as PackageManagerAgent);
    } catch {
      cmds = { run: "npm run", exec: "npx" };
    }

    const lines: string[] = ["", pc.bold("Checklist:"), ""];

    if (isSqlite) {
      lines.push(
        "SQLite is ready — the dev.db file will be created on first migration.",
        "",
        `  1. Push schema to database:`,
        `     ${pc.cyan(`${cmds.run} db:push`)}  ${pc.dim(`# or: ${cmds.exec} prisma db push`)}`,
        "",
        `  2. Generate Prisma Client:`,
        `     ${pc.cyan(`${cmds.run} db:generate`)}  ${pc.dim(`# or: ${cmds.exec} prisma generate --no-hints`)}`,
        "",
        `  3. Open Prisma Studio:`,
        `     ${pc.cyan(`${cmds.run} db:studio`)}  ${pc.dim(`# or: ${cmds.exec} prisma studio`)}`,
      );
    } else {
      lines.push(
        "  1. Configure your connection string",
        `     Edit ${pc.cyan(".env")} and replace the placeholder:`,
        `     ${pc.cyan(`DATABASE_URL="${placeholder}"`)}`,
        "",
        "  2. Push schema to database:",
        `     ${pc.cyan(`${cmds.run} db:push`)}  ${pc.dim(`# or: ${cmds.exec} prisma db push`)}`,
        "",
        "  3. Generate Prisma Client:",
        `     ${pc.cyan(`${cmds.run} db:generate`)}  ${pc.dim(`# or: ${cmds.exec} prisma generate --no-hints`)}`,
        "",
        "  4. Open Prisma Studio:",
        `     ${pc.cyan(`${cmds.run} db:studio`)}  ${pc.dim(`# or: ${cmds.exec} prisma studio`)}`,
      );

      // Provider-specific tips
      if (answers.provider === "postgresql") {
        lines.push(
          "",
          pc.dim(
            "Tip: For Neon/Supabase: use pooled URL (port 6543) for CLI, direct URL (port 5432) for runtime via DIRECT_URL.",
          ),
        );
      } else if (answers.provider === "planetscale") {
        lines.push(
          "",
          pc.dim(
            'Warning: PlanetScale requires `relationMode = "prisma"` in schema.prisma (MySQL protocol).',
          ),
          pc.dim(
            "   Schema changes use PlanetScale's deploy request workflow, not prisma migrate.",
          ),
        );
      } else if (answers.provider === "prismapostgres") {
        lines.push(
          "",
          pc.dim(
            "Tip: Prisma Postgres uses pooled connection: pooled.db.prisma.io (PgBouncer).",
          ),
          pc.dim("   Migrations use direct host: db.prisma.io."),
        );
      } else if (answers.provider === "cockroachdb") {
        lines.push(
          "",
          pc.dim("Tip: CockroachDB uses port 26257 with sslmode=require."),
        );
      } else if (answers.provider === "mysql") {
        lines.push(
          "",
          pc.dim(
            "Tip: For SSL: add ?sslcert=./cert.pem&sslaccept=strict to the URL.",
          ),
        );
      } else if (answers.provider === "sqlserver") {
        lines.push(
          "",
          pc.dim(
            "Tip: SQL Server uses semicolon syntax: sqlserver://host:1433;database=db;user=user;password=pass;encrypt=true",
          ),
        );
      }
    }

    lines.push(
      "",
      pc.dim(
        `Docs: https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/${answers.provider}`,
      ),
    );

    // Render Next steps in a separate note box
    note(lines.join("\n"), "Next Steps");

    // Outro — completion message only (green for success)
    outro(pc.green(`Database setup completed for ${answers.provider}!`));
  } catch (error) {
    // Handle cancellation - propagate to CLI for consistent rendering
    if (isCancel(error)) {
      throw error;
    }

    // Handle other errors — the CLI's error formatter prints the message;
    // the outro marks the Clack boundary without duplicating it (red for error).
    outro(pc.red(`Failed to setup database for ${answers.provider}`));
    throw error;
  }
}

// Type for the plan returned by planDatabase
export type PlanDatabaseResult = ReturnType<typeof import("./index").planDatabase>;