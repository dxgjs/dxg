// packages/generators/src/generators/database/prisma-flow.ts
// This module contains ALL Prisma-specific logic extracted from index.ts
// It exports a single setupPrismaFlow function that runs the complete Prisma setup

import type { GeneratorContext } from "../../types";
import { intro, outro, isCancel, cancel, prompt } from "@dxgjs/prompts";
import { validateDatabase } from "@dxgjs/database-meta";
import pc from "picocolors";

// Import all the public functions from index.ts (they are the single source of truth)
import {
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

// Import types
import type { DatabaseInspection } from "./inspect";

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
  // This function will contain the exact same logic as the Prisma branch
  // in databaseGenerator.run() - will be populated in Task 4
  throw new Error("Not implemented yet - will be populated in Task 4");
}

// Type for the plan returned by planDatabase
export type PlanDatabaseResult = ReturnType<typeof import("./index").planDatabase>;