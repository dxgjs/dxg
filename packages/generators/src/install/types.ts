/**
 * Normalized dependency-installation contract shared by every generator.
 *
 * The core principle this module encodes: **package-manager exit code 0 does
 * NOT mean the resulting project is operational.** Modern package managers
 * (pnpm ≥10, npm ≥12, yarn berry ≥4.14, bun) block dependency lifecycle
 * scripts by default — silently on some, loudly on others — so a native
 * addon can end up installed-but-unbuilt. The types below separate the
 * layers that used to be conflated under "did `install` exit 0":
 *
 *   dependency resolution  →  installation  →  lifecycle execution  →
 *   generated artifacts   →  post-install verification
 *
 * Domain-local to @dxgjs/generators on purpose (no generic framework, no
 * new public package): the database generator is the current consumer, and
 * generators own their own dependency plans.
 */

/**
 * A single dependency spec as a generator plans it.
 * `requiresBuild` marks packages whose install lifecycle scripts produce
 * native artifacts (or that a package manager's build approval gate may
 * block) — the installer pre-approves exactly these, by name, never
 * globally.
 */
export interface DependencySpec {
  /** npm spec, e.g. "better-sqlite3@^12.6.0" or "prisma@7.10.0" */
  spec: string;
  /** Whether this package's install scripts must be allowed to run. */
  requiresBuild: boolean;
  /** Domain reason surfaced in UX when the approval is written. */
  reason?: string;
  /**
   * Approval-only entry: the name is included in the build approvals but
   * NEVER passed to the install command (it is not a direct dependency —
   * e.g. @prisma/engines arrives transitively, yet its postinstall is what
   * the approval gates must cover). Installers must filter these out of
   * their install batches while keeping them in the pre-approval union.
   */
  approvalOnly?: boolean;
}

/**
 * What a generator asks the installer to do. Split by dependency section
 * because package managers record dev/regular installs differently.
 */
export interface DependencyPlan {
  devDependencies: DependencySpec[];
  dependencies: DependencySpec[];
}

/** The package managers DXG's installer supports. */
export type PackageManagerName = "npm" | "pnpm" | "yarn" | "bun";

/**
 * Fine-grained agent identity. Yarn classic and berry need different
 * approval mechanics (classic runs scripts by default; berry gates them
 * behind dependenciesMeta when enableScripts is false), so the installer
 * distinguishes them — unlike `ProjectAwareness.packageManager`, which
 * stays a coarse display name.
 */
export type PackageManagerAgent =
  | "npm"
  | "pnpm"
  | "yarn"
  | "yarn@berry"
  | "bun";

/** Why an install failed, when we can tell. Union of normalized kinds. */
export type DependencyInstallFailureReason =
  /**
   * The package manager resolved and installed everything, then refused to
   * complete because dependency build scripts were not approved
   * (pnpm ≥11's ERR_PNPM_IGNORED_BUILDS is a HARD error: exit 1 while the
   * dependency tree IS populated). Not an installation failure — a policy
   * outcome.
   */
  | "build-script-blocked"
  /**
   * Resolution/installation itself failed: package not found (E404 /
   * ERR_PNPM_FETCH_404), peer conflicts, network…
   */
  | "installation-failed"
  /**
   * An APPROVED dependency lifecycle script ran and failed (node-gyp /
   * prebuild-install). pnpm/npm propagate the script's own exit code; yarn
   * berry normalizes to 1.
   */
  | "native-build-failed"
  /**
   * Install exited 0 (or was classified recoverable) but a required
   * artifact the plan promised is missing on disk — the silent-drift
   * hazard npm/bun/yarn-berry create when they block scripts with a
   * warning and exit 0.
   */
  | "missing-binary"
  /**
   * The post-install artifact checks failed (generated client absent,
   * expected file not written) — the project is not operational yet.
   */
  | "verification-failed"
  /** Non-zero exit we could not map to a known signature. */
  | "unknown";

/**
 * Normalized result of ONE install command (a dev-deps or deps batch).
 * Discriminated on `success`; failures carry a machine-usable reason plus
 * the captured output (stdout+stderr interleaved) so the caller can render
 * the manager's own guidance without re-running anything.
 */
export type DependencyInstallResult =
  | {
      success: true;
      /** Names the plan asked to be approved (for UX echo). */
      approvedBuilds: string[];
      /**
       * Packages whose scripts the manager reported as blocked/skipped
       * despite exit 0 (npm `warn install-scripts`, bun `Blocked N
       * postinstall`, yarn-berry YN0004). Empty on a healthy install.
       */
      blockedBuilds: string[];
      /** Captured combined output, for verbose/debug display. */
      output: string;
    }
  | {
      success: false;
      reason: DependencyInstallFailureReason;
      /** Captured combined output (the classification input). */
      output: string;
      /** Exit code when the process ran to completion, else undefined. */
      exitCode?: number;
      /** Human-readable hint for the failure (see DXGError). */
      hint?: string;
      /** Suggested remediation command(s), manager-appropriate. */
      suggestion?: string;
    };

/**
 * Verifier contract: a cheap, meaningful post-install check. Receives the
 * project root; returns what is missing (empty array = operational).
 * Verifiers own their domain knowledge (e.g. the database generator knows
 * where prisma-client writes its output) — this is deliberately NOT a
 * generic framework, just a function shape.
 */
export type DependencyArtifactVerifier = (
  projectRoot: string,
) => Promise<string[]>;

/**
 * The installer seam exposed (optionally) on GeneratorContext. Generators
 * describe WHAT they need (a DependencyPlan + verifiers); the installer
 * decides HOW per package manager. Optional so existing generators keep
 * compiling unchanged until they adopt it.
 */
export interface DependencyInstaller {
  /** The fine-grained agent the install commands will run through. */
  readonly agent: PackageManagerAgent;
  /**
   * Install one batch. Resolves the command via @antfu/ni
   * (`programmatic: true` — never interactive), pre-writes the manager's
   * build approvals for exactly the `requiresBuild` specs (by name, never
   * globally), executes with buffered output, then classifies the result.
   */
  install(
    plan: DependencyPlan,
    options: DependencyInstallOptions,
  ): Promise<DependencyInstallResult>;
}

export interface DependencyInstallOptions {
  /** Project root the install runs in. */
  cwd: string;
  /** Skip the actual execution (dry-run) — approvals are not written. */
  dryRun?: boolean;
}
