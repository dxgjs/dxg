/**
 * dlx build-approval adapter: the command-line side of the same
 * per-package approval contract approvals.ts writes into project files.
 *
 * Two DIFFERENT install scopes exist for `dxg add database` under pnpm:
 *
 *   1. PROJECT install (`pnpm add`) — governed by the `allowBuilds` map
 *      pnpm-workspace.yaml holds. The installer seam pre-writes it
 *      (applyPnpmAllowBuilds) for exactly the plan's requiresBuild
 *      packages. This scope is NOT where the interactive prompt came
 *      from.
 *
 *   2. DLX CACHE install (`pnpm dlx prisma@7 ...`) — `prisma init` and
 *      `prisma generate` resolve through dlx, so prisma AND its
 *      transitive deps are installed into an isolated
 *      `<pnpm-cache>/dlx/<cacheKey>/pkg` directory the project files
 *      never mention. pnpm 11 pre-approves only the dlx alias itself
 *      (verified in pnpm 11.18.0 source: `allowBuilds = fromEntries(...
 *      resolvedPkgAliases)`); every TRANSITIVE package with a build
 *      script lands in `ignoredBuilds`. On a TTY, `promptApproveDlxBuilds`
 *      then runs the `approve-builds` handler — the multiselect
 *      "Choose which packages to build" — INSIDE DXG's init spinner. On a
 *      non-TTY the prompt is skipped silently: @prisma/engines' postinstall
 *      (the schema-engine binary download) never runs and a cold-cache
 *      machine is left without the binary that db:push/db:migrate (the
 *      scripts DXG itself writes) require.
 *
 * `--allow-build=<name>` is pnpm dlx's OFFICIAL narrow approval channel
 * (dlx cliOptionsTypes: `{"allow-build": [String, Array]}`), validated
 * empirically: with the flag, the dlx cache's .modules.yaml records
 * `allowBuilds: {prisma: true, "@prisma/engines": true}` and
 * `ignoredBuilds: []` — the prompt's precondition (non-empty
 * ignoredBuilds) is gone, so it can never appear in EITHER mode, and the
 * postinstall DOES run (binary delivered).
 *
 * Scope discipline (same security contract as approvals.ts):
 *   - ONLY pnpm: `pnpm dlx` is the only resolution with this approval
 *     gate. npx runs scripts by default; yarn v1 maps dlx execution to
 *     npx; yarn berry's dlx and `bun x` have no build-approval prompt
 *     (bun's default-trusted list covers the plan). The `command ===
 *     "pnpm"` check (not just `args[0] === "dlx"` — yarn berry also
 *     resolves to `["dlx", ...]`) is what keeps the flag pnpm-only.
 *   - ONLY the names the plan itself marked approvalOnly — the packages
 *     DXG intentionally installs (transitively) and whose build scripts
 *     it needs. No global allow-all flag exists here, and nothing
 *     outside the plan is approved.
 *   - The flag changes the dlx cacheKey, so it must ride the SAME
 *     resolution call as the command — never a separate one.
 */

import type { DependencyPlan } from "./types";

/**
 * Inserts pnpm dlx build-approval flags into a RESOLVED command line.
 * Returns the args unchanged for every other command shape — npx, yarn
 * (classic and berry dlx), and bun x executions never receive a
 * pnpm-only flag.
 */
export function withDlxBuildApprovals(
  command: string,
  args: string[],
  plan: DependencyPlan,
): string[] {
  // Only a real `pnpm dlx` invocation carries the approval gate. The
  // generator's "dlx resolved as add" guard rewrites mis-resolutions to
  // npx BEFORE this runs, so an "add" shape never reaches here with
  // command "pnpm" — but the check keeps the adapter total.
  if (command !== "pnpm" || args[0] !== "dlx") {
    return args;
  }

  // The dlx cache pre-approves the top-level alias (prisma) on its own;
  // only the TRANSITIVE build packages need the explicit flag. That is
  // exactly the plan's approvalOnly section — the same names whose
  // project-scope approvals applyPnpmAllowBuilds already writes.
  const names = [
    ...new Set(
      [...plan.devDependencies, ...plan.dependencies]
        .filter((d) => d.approvalOnly && d.requiresBuild)
        .map((d) => d.spec),
    ),
  ];
  if (names.length === 0) {
    return args;
  }

  // Flag position, verified empirically against pnpm 11.18.0: after
  // "dlx", before the package spec — the flag belongs to dlx's own
  // option parsing, so it must precede the spec it approves builds for.
  const flags = names.map((name) => `--allow-build=${name}`);
  return ["dlx", ...flags, ...args.slice(1)];
}
