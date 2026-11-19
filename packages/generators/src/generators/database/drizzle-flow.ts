import type { GeneratorContext } from "../../types";
import { note, outro } from "@dxgjs/prompts";
import pc from "picocolors";

/**
 * Placeholder flow for Drizzle ORM — displays a friendly "coming soon" message
 * and exits gracefully. This module will be replaced with real Drizzle setup
 * logic when Drizzle support is implemented.
 */
export async function setupDrizzleFlow(
  _answers: Record<string, unknown>,
  _ctx: GeneratorContext,
): Promise<void> {
  note(
    [
      "Drizzle ORM support is coming soon!",
      "",
      "We're working on adding first-class Drizzle support to DXG.",
      "In the meantime, you can use Prisma (the default) which provides",
      "excellent type safety, migrations, and a great developer experience.",
    ].join("\n"),
    "Drizzle ORM",
  );

  outro(pc.green("Check back later for Drizzle support!"));

  // Graceful exit - process.exitCode stays 0
}