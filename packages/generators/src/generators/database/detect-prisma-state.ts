/**
 * READ-ONLY Prisma provider detection.
 *
 * Extracts the provider from an existing Prisma schema (prisma/schema.prisma)
 * or Prisma 7 config (prisma7.config.ts). Never writes, never mutates.
 * Used by the database generator to detect provider mismatches before planning.
 */

import type { GeneratorContext } from "../../types";

// Shared database meta (provider detection pure functions)
import {
  normalizePrismaProvider,
  extractProviderFromSchema,
  extractProviderFromConfig,
  providersMatch,
  type PrismaState,
} from "@dxgjs/database-meta";

/**
 * Detects the existing Prisma state in the project.
 * Reads schema.prisma first, falls back to prisma7.config.ts.
 * Returns { installed: false, provider: null, schemaPath: null } if neither exists.
 */
export async function detectPrismaState(
  ctx: Pick<GeneratorContext, "fs">,
): Promise<PrismaState> {
  const fs = ctx.fs;

  // Check schema.prisma first
  const schemaPath = "prisma/schema.prisma";
  const schemaExists = await fs.pathExists(schemaPath);

  if (schemaExists) {
    try {
      const schemaText = (await fs.readFile(schemaPath, {
        encoding: "utf8",
      })) as string | undefined;
      if (typeof schemaText === "string" && schemaText.trim() !== "") {
        const provider = extractProviderFromSchema(schemaText);
        return {
          installed: true,
          provider,
          schemaPath,
        };
      }
    } catch {
      // Read failed — fall through to config check
    }
  }

  // Fall back to prisma7.config.ts
  const configPath = "prisma7.config.ts";
  const configExists = await fs.pathExists(configPath);

  if (configExists) {
    try {
      const configText = (await fs.readFile(configPath, {
        encoding: "utf8",
      })) as string | undefined;
      if (typeof configText === "string" && configText.trim() !== "") {
        const provider = extractProviderFromConfig(configText);
        return {
          installed: true,
          provider,
          schemaPath: configPath,
        };
      }
    } catch {
      // Read failed
    }
  }

  return {
    installed: false,
    provider: null,
    schemaPath: null,
  };
}