/**
 * Prisma version constants — single source of truth.
 * - PRISMA_CLI_VERSION: Used for CLI commands (init, generate, push) via npx/pnpm dlx.
 *   Uses "@7" tag to always get the latest stable Prisma 7.x without ever upgrading to Prisma 8.
 * - PRISMA_PACKAGE_VERSION: Used for package.json dependencies.
 *   Uses "^7.10.1" semver range for the latest patch in the 7.x branch.
 */
export const PRISMA_CLI_VERSION = "7";
export const PRISMA_PACKAGE_VERSION = "^7.10.1";

// Backward compatibility alias
export const PRISMA_PINNED_VERSION = PRISMA_CLI_VERSION;