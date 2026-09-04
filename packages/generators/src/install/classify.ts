/**
 * Failure classification: maps raw package-manager output + exit code to a
 * normalized `DependencyInstallFailureReason`.
 *
 * Every signature below was captured empirically (lab runs against the
 * real pnpm 11.18.0 / npm 12.0.1 / bun 1.3.14 / yarn classic 1.22.22 /
 * yarn berry 4.1.1 on this machine). Matching is anchored on stable
 * machine markers (error CODES, manager-owned line prefixes), never on
 * full prose, so a reworded message cannot silently break detection.
 *
 * Critical asymmetry this module exists for:
 *   - pnpm ≥11 BLOCKS LOUDLY: exit 1 + ERR_PNPM_IGNORED_BUILDS on stdout,
 *     while the dependency tree IS installed (resolutions succeeded).
 *   - npm 12 / bun / yarn-berry BLOCK SILENTLY: exit 0 + a warning line
 *     (npm warn install-scripts / bun "Blocked N postinstall" / YN0004).
 * So both branches must classify: exit≠0 needs a reason, and exit==0 needs
 * a blocked-builds scan.
 */

import type {
  DependencyInstallFailureReason,
  PackageManagerAgent,
} from "./types";

/** Extracts the bare package name from an npm spec ("a@^1" → "a", "@x/y@2" → "@x/y"). */
export function packageNameFromSpec(spec: string): string {
  // Scoped: the LAST "@" separates scope/name from the version.
  const at = spec.lastIndexOf("@");
  if (at > 0) return spec.slice(0, at);
  return spec;
}

/**
 * pnpm ≥11 hard-error signature (exit 1, printed on STDOUT while stderr is
 * empty). The dependency tree IS installed at this point — only the build
 * scripts were skipped, so this is "build-script-blocked", NOT an
 * installation failure. Format captured in lab e2r/e5:
 *   [ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @prisma/engines@7.10.0, prisma@7.10.0
 */
export function isPnpmIgnoredBuilds(output: string): boolean {
  return output.includes("ERR_PNPM_IGNORED_BUILDS");
}

/**
 * Parses the pnpm ignored-builds package list. Deduplicated names, each
 * potentially versioned ("@prisma/engines@7.10.0").
 */
export function parsePnpmIgnoredBuilds(output: string): string[] {
  const match = output.match(/Ignored build scripts:\s*(.+)$/m);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((entry) =>
      packageNameFromSpec(entry.trim().replace(/^['"]|['"]$/g, "")),
    )
    .filter((name) => name.length > 0);
}

/**
 * npm ≥12 blocked-scripts notice (exit 0, STDERR). Captured in lab e6:
 *   npm warn install-scripts 2 packages had install scripts blocked because they are not covered by allowScripts:
 *   npm warn install-scripts   prisma@7.10.0 (preinstall: node scripts/preinstall-entry.js)
 */
export function isNpmInstallScriptsWarning(output: string): boolean {
  return output.includes("npm warn install-scripts");
}

/** Parses the npm blocked-scripts package names from the notice lines. */
export function parseNpmBlockedScripts(output: string): string[] {
  const names: string[] = [];
  for (const line of output.split("\n")) {
    // Continuation lines: "npm warn install-scripts   <pkg>@<ver> (<scripts>)".
    // The package id itself cannot contain spaces; the "(", which begins
    // the script list, ends it.
    const match = line.match(
      /^\s*npm warn install-scripts\s+([^\s(]+)\s+\(/,
    );
    if (match) {
      names.push(packageNameFromSpec(match[1]));
    }
  }
  return [...new Set(names)];
}

/**
 * bun blocked postinstall notice (exit 0, STDOUT — verified: the notice
 * rides the install summary stream, not stderr). Captured in lab e8-vfy:
 *   Blocked 1 postinstall. Run `bun pm untrusted` for details.
 * `bun pm untrusted` itself proved UNRELIABLE for this (it reported 0
 * right after an install printed "Blocked 1") — never depend on it.
 */
export function isBunBlockedPostinstall(output: string): boolean {
  return /Blocked \d+ postinstalls?\b/.test(output);
}

/**
 * yarn berry disabled-build warning (exit 0): YN0004 — "…lists build
 * scripts, but all build scripts have been disabled". Verified locally
 * (yarn 4.1.1, lab adversarial): enableScripts:false blocks OUT-OF-PLAN
 * packages (sharp stayed YN0004-blocked) while dependenciesMeta built:true
 * entries keep the plan's own packages building.
 */
export function isYarnDisabledBuildScripts(output: string): boolean {
  return /YN0004/.test(output);
}

/** Registry 404 signatures (exit 1): pnpm ERR_PNPM_FETCH_404 (stdout), npm E404 (stderr), bun "GET … - 404" (stderr). */
export function isPackageNotFound(output: string): boolean {
  return (
    output.includes("ERR_PNPM_FETCH_404") ||
    /\bE404\b/.test(output) ||
    /GET .* - 404/.test(output)
  );
}

/**
 * A dependency lifecycle script that RAN and failed. pnpm/npm propagate the
 * script's own exit code under ELIFECYCLE / "Command failed with exit code
 * N"; yarn berry reports "couldn't be built successfully (exit code N)".
 */
export function isNativeBuildFailed(output: string): boolean {
  return (
    output.includes("ELIFECYCLE") ||
    /Command failed with exit code \d+/.test(output) ||
    /couldn't be built successfully/.test(output)
  );
}

/**
 * Classifies a non-zero exit into a normalized failure reason.
 * Order matters: the most specific, recoverable signatures are tested
 * before the generic ones, so "install ran, only the build approval is
 * missing" never reads as a broken install.
 */
export function classifyInstallFailure(
  output: string,
  exitCode: number | undefined,
  agent: PackageManagerAgent,
): {
  reason: DependencyInstallFailureReason;
  hint?: string;
  suggestion?: string;
} {
  void exitCode; // Signatures are more reliable than codes (npm propagates script codes).
  void agent; // Signatures are shared where they overlap (ELIFECYCLE, 404).

  // pnpm blocked-builds is a POLICY outcome with a tree fully installed —
  // the cheapest, most actionable failure, so it wins over everything.
  if (isPnpmIgnoredBuilds(output)) {
    return {
      reason: "build-script-blocked",
      hint:
        "pnpm installed the dependencies but skipped their build scripts (strictDepBuilds is on by default).",
      suggestion:
        "pnpm approve-builds  # or set allowBuilds in pnpm-workspace.yaml",
    };
  }
  if (isPackageNotFound(output)) {
    return {
      reason: "installation-failed",
      hint: "The package manager could not find one of the requested packages in the registry.",
    };
  }
  if (isNativeBuildFailed(output)) {
    return {
      reason: "native-build-failed",
      hint: "A dependency's install script ran and failed — often a native build (missing compiler toolchain or no matching prebuild).",
    };
  }
  return { reason: "unknown" };
}

/**
 * Scans a SUCCESS (exit 0) install output for silently-blocked build
 * scripts — the silent-drift hazard. npm warns on stderr, bun on stdout,
 * yarn berry emits YN0004; pnpm never reaches here silently (it hard-fails
 * instead).
 */
export function scanBlockedBuilds(
  output: string,
  agent: PackageManagerAgent,
): string[] {
  switch (agent) {
    case "npm":
      return parseNpmBlockedScripts(output);
    case "bun":
      // bun's notice names no packages on the install stream — only a
      // count. Package-level naming is not available without `bun pm
      // untrusted`, which proved unreliable in the lab.
      return isBunBlockedPostinstall(output)
        ? ["(bun: unnamed blocked postinstalls)"]
        : [];
    case "yarn@berry":
      return isYarnDisabledBuildScripts(output)
        ? ["(yarn: build scripts disabled via enableScripts)"]
        : [];
    default:
      return [];
  }
}
