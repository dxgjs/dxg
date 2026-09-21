/**
 * Regression tests for the pnpm dlx build-approval adapter — the fix for
 * the "Choose which packages to build ❯○ @prisma/engines" prompt that
 * appeared INSIDE `dxg add database`'s "Initializing Prisma" spinner.
 *
 * Root cause (verified in pnpm 11.18.0 source + machine state, see
 * dlx.ts docblock): `pnpm dlx` installs the package and its transitive
 * deps into an isolated dlx cache. pnpm pre-approves ONLY the top-level
 * alias (`prisma`); the transitive `@prisma/engines` (whose postinstall
 * downloads the schema-engine binary db:push/db:migrate need) lands in
 * the cache's `ignoredBuilds`. On a TTY pnpm then runs its approve-builds
 * multiselect INSIDE the caller's spinner; non-TTY it silently skips
 * the postinstall — a cold machine ends up without the binary.
 *
 * `--allow-build=<name>` (pnpm dlx's official narrow approval channel)
 * adds the name to the cache's allowBuilds: `ignoredBuilds` stays empty,
 * the prompt's precondition disappears in BOTH modes, and the postinstall
 * runs.
 *
 * Layer contract this suite pins:
 *
 *   planDatabase (domain) → approvalOnly entries → withDlxBuildApprovals
 *   (install adapter) → resolved command line → executeCommand
 *
 * These are NOT resolution tests (see prisma-init-command.test.ts for the
 * raw ni chain, and dlx-subprocess.test.ts for the real subprocess
 * boundary): they pin the ADAPTER — that the resolved command line
 * carries the flag for exactly the plan's approvalOnly packages, and
 * ONLY for a real `pnpm dlx` shape. The generator-level suites
 * (index.test.ts, idempotence.test.ts) mock @antfu/ni as an npm/npx
 * project, so they can never catch this — the pnpm path is untested there.
 */

import { describe, expect, test } from "vitest";
import { withDlxBuildApprovals } from "./dlx";
import type { DependencyPlan } from "./types";

/** The REAL database plan shape for a postgresql project (from
 * planDatabase): the approvalOnly entry is the transitive @prisma/engines. */
const postgresPlan: DependencyPlan = {
  devDependencies: [{ spec: "prisma@7.10.0", requiresBuild: true }],
  dependencies: [
    { spec: "@prisma/client@7.10.0", requiresBuild: false },
    {
      spec: "@prisma/engines",
      requiresBuild: true,
      reason: "postinstall downloads the schema-engine binary",
      approvalOnly: true,
    },
  ],
};

/** A plan with no approvalOnly entry: nothing to flag. */
const plainPlan: DependencyPlan = {
  devDependencies: [{ spec: "tsx", requiresBuild: false }],
  dependencies: [{ spec: "pg", requiresBuild: false }],
};

describe("withDlxBuildApprovals (adapter)", () => {
  test("pnpm dlx: inserts --allow-build for the plan's approvalOnly packages", () => {
    const args = withDlxBuildApprovals(
      "pnpm",
      ["dlx", "prisma@7", "init", "--datasource-provider", "postgresql"],
      postgresPlan,
    );
    expect(args).toEqual([
      "dlx",
      "--allow-build=@prisma/engines",
      "prisma@7",
      "init",
      "--datasource-provider",
      "postgresql",
    ]);
  });

  test("pnpm dlx: flag precedes the package spec (dlx option parsing)", () => {
    const args = withDlxBuildApprovals(
      "pnpm",
      ["dlx", "prisma@7", "generate", "--no-hints"],
      postgresPlan,
    );
    // Position pinned by the empirical A/B on pnpm 11.18.0:
    // `pnpm dlx --allow-build=@prisma/engines prisma@7 --version` runs.
    const flagIdx = args.indexOf("--allow-build=@prisma/engines");
    expect(flagIdx).toBeGreaterThan(0);
    expect(flagIdx).toBeLessThan(args.indexOf("prisma@7"));
  });

  test("pnpm dlx: preserves every non-flag argument verbatim", () => {
    const original = [
      "dlx",
      "prisma@7",
      "init",
      "--datasource-provider",
      "postgresql",
      "--no-skills",
      "--output",
      "../lib/generated/prisma",
    ];
    const args = withDlxBuildApprovals("pnpm", original, postgresPlan);
    // Everything after "dlx" (the spec + Prisma CLI flags) survives
    // untouched — only the approval flags are inserted after "dlx".
    expect(args.slice(1).filter((a) => !a.startsWith("--allow-build="))).toEqual(
      original.slice(1),
    );
  });

  test("pnpm dlx: deduplicates approvalOnly names across sections", () => {
    const plan: DependencyPlan = {
      devDependencies: [
        {
          spec: "@prisma/engines",
          requiresBuild: true,
          approvalOnly: true,
        },
      ],
      dependencies: [
        {
          spec: "@prisma/engines",
          requiresBuild: true,
          approvalOnly: true,
        },
      ],
    };
    const args = withDlxBuildApprovals(
      "pnpm",
      ["dlx", "prisma@7", "init"],
      plan,
    );
    expect(args.filter((a) => a === "--allow-build=@prisma/engines")).toHaveLength(1);
  });

  test("pnpm dlx: multiple approvalOnly names each get one flag", () => {
    const plan: DependencyPlan = {
      devDependencies: [],
      dependencies: [
        { spec: "@prisma/engines", requiresBuild: true, approvalOnly: true },
        { spec: "better-sqlite3", requiresBuild: true, approvalOnly: true },
      ],
    };
    const args = withDlxBuildApprovals("pnpm", ["dlx", "prisma@7", "init"], plan);
    expect(args).toEqual([
      "dlx",
      "--allow-build=@prisma/engines",
      "--allow-build=better-sqlite3",
      "prisma@7",
      "init",
    ]);
  });

  test("pnpm dlx: a plan without approvalOnly entries changes nothing", () => {
    const args = ["dlx", "prisma@7", "init"];
    expect(withDlxBuildApprovals("pnpm", args, plainPlan)).toBe(args);
  });

  test("approvalOnly entries WITHOUT requiresBuild are not flagged", () => {
    // Defense in depth: the adapter honors the plan's own build gate, not
    // just the approvalOnly marker.
    const plan: DependencyPlan = {
      devDependencies: [],
      dependencies: [
        { spec: "@prisma/engines", requiresBuild: false, approvalOnly: true },
      ],
    };
    const args = ["dlx", "prisma@7", "init"];
    expect(withDlxBuildApprovals("pnpm", args, plan)).toBe(args);
  });

  test("non-pnpm commands are returned unchanged (npx / yarn / bun)", () => {
    // npx: scripts run by default — a pnpm flag would break the command.
    expect(
      withDlxBuildApprovals("npx", ["prisma@7", "init"], postgresPlan),
    ).toEqual(["prisma@7", "init"]);

    // yarn berry ALSO resolves to ["dlx", ...] — the flag must stay
    // pnpm-only, hence the command check, not just args[0].
    expect(
      withDlxBuildApprovals("yarn", ["dlx", "prisma@7", "init"], postgresPlan),
    ).toEqual(["dlx", "prisma@7", "init"]);

    // bun x.
    expect(
      withDlxBuildApprovals("bun", ["x", "prisma@7", "init"], postgresPlan),
    ).toEqual(["x", "prisma@7", "init"]);
  });

  test("a mis-resolved pnpm 'add' shape never receives the flag", () => {
    // The generator's "dlx resolved as add" guard rewrites mis-resolutions
    // to npx BEFORE the adapter runs; the adapter's own guard keeps it
    // total even if that ordering ever changes.
    expect(
      withDlxBuildApprovals("pnpm", ["add", "prisma@7"], postgresPlan),
    ).toEqual(["add", "prisma@7"]);
  });
});
