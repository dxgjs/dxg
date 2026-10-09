import { defineConfig } from "vitest/config";

/**
 * E2E suite — REAL end-to-end validation of `dxg add database`: real
 * temp projects, real package managers, real installs, real Prisma 7.
 *
 * Deliberately separate from the unit suite (`vitest run`):
 * - the include pattern only matches `e2e/*.e2e.ts`, which the unit
 *   run's default include (any `*.test.ts`) never matches — the 280
 *   offline unit tests stay offline;
 * - these tests REQUIRE network + locally installed package managers,
 *   so they must never run as part of the default `pnpm test`.
 *
 * Sequential (single fork): real installs are heavy and the timing
 * measurements must not contend for CPU/disk.
 */
export default defineConfig({
  test: {
    include: ["e2e/**/*.e2e.ts"],
    testTimeout: 15 * 60_000,
    hookTimeout: 15 * 60_000,
    // Vitest 4: pools were reworked — fileParallelism false runs the
    // heavy real-install files strictly sequentially in one fork.
    fileParallelism: false,
  },
});
