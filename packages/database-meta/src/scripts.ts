import type { DatabaseScriptCatalog } from "./types";
export type { DatabaseScriptCatalog, DatabaseScriptCatalogEntry } from "./types";

// Database script contract — owned by the database domain.
//
// Every entry must have a concrete, immediately-useful purpose after
// `dxg add database`. Deliberately NOT exposed as scripts:
// - db:reset — destructive (prisma migrate reset); developers who adopt
//   the migrations workflow already know the prisma CLI.
// - db:migrate / db:migrate:deploy — Prisma migrations are NOT managed
//   by DXG; users who need migrations run the Prisma CLI directly.
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
export const SEED_SCRIPT_NAME = "db:seed";
export const SEED_FILE_PATH = "prisma/seed.ts";
export const SEED_CONFIG_COMMAND = `tsx ${SEED_FILE_PATH}`;

export const databaseScriptCatalog: DatabaseScriptCatalog = {
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
};

/** Scripts offered for a given provider key. */
export function providerScripts(_: string): string[] { // eslint-disable-line @typescript-eslint/no-unused-vars
  // All providers now get the same script catalogue since migrations
  // are not managed by DXG.
  return Object.keys(databaseScriptCatalog);
}

/** The recommended script names for a given provider key. */
export function recommendedScripts(providerKey: string): string[] {
  return providerScripts(providerKey).filter(
    (name) => databaseScriptCatalog[name].recommended,
  );
}

/**
 * Resolves the interactive database scripts decision into the final script
 * names to add. Owned by the database domain.
 *
 * - "recommended" -> the provider's recommended set.
 * - "customize"   -> a Clack multiselect over the provider-appropriate
 *   catalogue (each option shows what the script does).
 * - "skip"        -> no scripts.
 * - undefined     -> "recommended" (non-interactive / dry-run / CI default:
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