import { PRISMA_PINNED_VERSION } from "./version";

/**
 * Builds the exact `prisma init` argument contract. This is the single
 * source of truth used by BOTH production resolution paths in
 * executeDatabase (the primary `getCliCommand(parseNlx, ...)` call and the
 * `originalArgs` fallback/workaround), so the skills decision can never
 * diverge between the two paths.
 *
 * Skills translation (verified against the prisma@7.10.0 CLI source):
 * - `installSkills: false` passes the explicit `--no-skills` flag -> Prisma
 *   skips agent skills entirely.
 * - `installSkills: true` omits the flag -> prisma@7 installs agent skills
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
    `prisma@${PRISMA_PINNED_VERSION}`,
    "init",
    "--datasource-provider",
    prismaProvider,
    ...(installSkills ? [] : ["--no-skills"]),
    "--output",
    outputPath ?? "../lib/generated/prisma",
  ];
}