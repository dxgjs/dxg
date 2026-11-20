import type { GeneratorContext } from "../../types";
import { ValidationError } from "@dxgjs/errors";

/**
 * Placeholder flow for Drizzle ORM. Drizzle support is not implemented yet, so
 * selecting it fails with an actionable error (the CLI exits with a non-zero
 * code) instead of reporting success after doing nothing. This module will be
 * replaced with real Drizzle setup logic when Drizzle support is implemented.
 */
export async function setupDrizzleFlow(
  _answers: Record<string, unknown>,
  _ctx: GeneratorContext,
): Promise<void> {
  void _answers;
  void _ctx;

  throw new ValidationError("Drizzle ORM is not supported yet.", {
    hints: [
      "Drizzle support is coming soon",
      "Use Prisma instead (the default): omit --orm or pass --orm prisma",
    ],
  });
}
