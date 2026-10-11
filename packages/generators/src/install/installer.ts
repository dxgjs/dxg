/**
 * The dependency installer: resolves the package-manager command via
 * @antfu/ni, pre-writes build approvals for exactly the plan's
 * `requiresBuild` packages, executes with buffered output, then normalizes
 * the outcome.
 *
 * Output handling — the deliberate deviation from DXG's `stdio: "inherit"`
 * convention for installs ONLY: the silent blockers (npm 12, bun, yarn
 * berry) print their "scripts blocked" notices on stdout/stderr while
 * exiting 0. Inherit would stream those straight past the Clack spinner
 * AND make them invisible to classification. So installs run piped; the
 * spinner stays alive (the Clack convention survives). The captured
 * output rides the result: on failure the caller embeds the tail in the
 * thrown error, on success the blocked-builds note names the affected
 * packages. `prisma init`/`prisma generate` keep `inherit` — they are
 * tool output the user wants live.
 *
 * Non-interactivity: every getCliCommand call passes `programmatic: true`
 * — verified in ni's source: the "Would you like to globally install yarn?"
 * prompt exists ONLY on the non-programmatic path (`if (name &&
 * !cmdExists(name) && !programmatic)`), and CI=1 exits 1 instead. No
 * hidden prompts can ever spawn from here.
 */

import { parseNi, getCliCommand } from "@antfu/ni";
import { executeCommand } from "@dxgjs/fs";
import { join } from "path";
import type { FSInterface } from "../types";
import type {
  DependencyInstallOptions,
  DependencyInstallResult,
  DependencyInstaller,
  DependencyPlan,
  PackageManagerAgent,
} from "./types";
import {
  applyNpmAllowScripts,
  applyPnpmAllowBuilds,
  applyYarnBerryDependenciesMeta,
} from "./approvals";
import {
  classifyInstallFailure,
  packageNameFromSpec,
  scanBlockedBuilds,
} from "./classify";

export { packageNameFromSpec };

/** Options for createDependencyInstaller. */
export interface CreateInstallerOptions {
  /** Agent detected via @antfu/ni (fine-grained: yarn vs yarn@berry). */
  agent: PackageManagerAgent;
  /** Filesystem seam (GeneratorContext.fs). */
  fs: FSInterface;
}

/**
 * Reconciles package.json after a successful install batch: the manifest
 * must state the spec DXG commanded, not the manager's save-prefix
 * policy. npm resolves `prisma@7.10.0` and saves it caret-prefixed
 * (`^7.10.0` — live-verified on npm 12; minimal repro 2026-10-10: a
 * bare `npm install -D prisma@7.10.0` writes "^7.10.0"), and even a
 * commanded range comes back as the latest match
 * (`better-sqlite3@^12.6.0` → `^12.11.1`), silently breaking the
 * verified-pin contract. pnpm/yarn/bun save specs verbatim, so for
 * them this is a read-and-skip — the file is rewritten only when an
 * installed entry actually differs (byte-stable fixpoint). Naked
 * specs (no `@version` part) carry no version contract and stay as
 * the manager wrote them; entries outside the batch are never touched.
 */
async function reconcileBatchSpecs(
  fs: FSInterface,
  cwd: string,
  section: "devDependencies" | "dependencies",
  specs: string[],
): Promise<void> {
  const wanted: { name: string; declared: string }[] = [];
  for (const spec of specs) {
    // Same split as packageNameFromSpec: the LAST "@" separates the
    // (possibly scoped) name from the version part.
    const at = spec.lastIndexOf("@");
    if (at <= 0) continue; // naked spec — no version contract
    const declared = spec.slice(at + 1);
    if (declared === "") continue;
    wanted.push({ name: packageNameFromSpec(spec), declared });
  }
  if (wanted.length === 0) return;

  const pkgPath = join(cwd, "package.json");
  if (!(await fs.pathExists(pkgPath))) return; // nothing to reconcile against
  const pkg = (await fs.readJson<Record<string, unknown>>(pkgPath)) ?? {};
  const entries = (pkg[section] ?? {}) as Record<string, unknown>;
  let changed = false;
  for (const { name, declared } of wanted) {
    if (entries[name] !== undefined && entries[name] !== declared) {
      entries[name] = declared;
      changed = true;
    }
  }
  if (!changed) return;
  pkg[section] = entries;
  await fs.writeJson(pkgPath, pkg);
}

/**
 * Builds the installer bound to a detected agent. The agent (not
 * `awareness.packageManager`) decides the approval mechanics, so the
 * generator never branches on the package manager.
 */
export function createDependencyInstaller(
  options: CreateInstallerOptions,
): DependencyInstaller {
  const { agent, fs } = options;

  async function preApprove(
    plan: DependencyPlan,
    projectRoot: string,
  ): Promise<string[]> {
    // Union of both sections' requiresBuild names — approvals are recorded
    // once, before either install command runs.
    const names = [
      ...new Set(
        [...plan.devDependencies, ...plan.dependencies]
          .filter((d) => d.requiresBuild)
          .map((d) => packageNameFromSpec(d.spec)),
      ),
    ];
    if (names.length === 0) return [];

    switch (agent) {
      case "pnpm":
        await applyPnpmAllowBuilds(fs, projectRoot, names);
        return names;
      case "npm":
        await applyNpmAllowScripts(fs, projectRoot, names);
        return names;
      case "yarn@berry":
        await applyYarnBerryDependenciesMeta(fs, projectRoot, names);
        return names;
      default:
        // yarn classic: scripts run by default, nothing to pre-write.
        // bun: the default-trusted list covers DXG's plans; writing
        // trustedDependencies would REPLACE that list (bun semantics) —
        // never do that from a scaffolder.
        return [];
    }
  }

  async function install(
    plan: DependencyPlan,
    options: DependencyInstallOptions,
  ): Promise<DependencyInstallResult> {
    const { cwd, dryRun } = options;
    if (dryRun) {
      return {
        success: true,
        approvedBuilds: [],
        blockedBuilds: [],
        output: "",
      };
    }

    // One install command per non-empty section, in plan order — dev first
    // (mirrors the previous generator flow: tools before runtime deps).
    // approvalOnly entries are excluded: they exist to reach the approval
    // map, never to be installed by name (they arrive transitively).
    const installable = (deps: DependencyPlan["devDependencies"]) =>
      deps.filter((d) => !d.approvalOnly);
    const devSpecs = installable(plan.devDependencies);
    const regularSpecs = installable(plan.dependencies);
    const batches: {
      args: string[];
      label: string;
      section: "devDependencies" | "dependencies";
      specs: string[];
    }[] = [];
    if (devSpecs.length > 0) {
      batches.push({
        args: ["-D", ...devSpecs.map((d) => d.spec)],
        label: "dev dependencies",
        section: "devDependencies",
        specs: devSpecs.map((d) => d.spec),
      });
    }
    if (regularSpecs.length > 0) {
      batches.push({
        args: regularSpecs.map((d) => d.spec),
        label: "dependencies",
        section: "dependencies",
        specs: regularSpecs.map((d) => d.spec),
      });
    }
    if (batches.length === 0) {
      return {
        success: true,
        approvedBuilds: [],
        blockedBuilds: [],
        output: "",
      };
    }

    // Approvals are written once, BEFORE the first install — pre-approval
    // (validated end-to-end in labs) beats post-hoc approve+rebuild flows.
    const approvedBuilds = await preApprove(plan, cwd);

    const outputs: string[] = [];
    // Deduplicated across batches: two install commands can both report the
    // same blocked package — the user-facing note should list it once.
    const blockedBuilds: string[] = [];

    for (const batch of batches) {
      const resolved = await getCliCommand(parseNi, batch.args, {
        cwd,
        programmatic: true,
      });
      if (!resolved) {
        return {
          success: false,
          reason: "unknown",
          output: outputs.join("\n"),
          hint: `Failed to resolve the ${agent} command for installing ${batch.label}.`,
        };
      }

      const { command, args, cwd: resolvedCwd } = resolved;
      let exitCode: number | undefined;
      let output: string;
      try {
        // Piped (buffered) capture: classification needs the blocked-script
        // notices that arrive even on success. stdout+stderr interleaved.
        const result = await executeCommand(command, args, {
          cwd: resolvedCwd ?? cwd,
          all: true,
        });
        output = String(result.all ?? result.stdout ?? "");
      } catch (error) {
        // execa throws on non-zero exit; the payload carries streams + code.
        const e = error as {
          message?: string;
          exitCode?: number;
          all?: string;
          stdout?: string;
          stderr?: string;
        };
        exitCode = e.exitCode;
        output = String(e.all ?? e.stdout ?? e.stderr ?? e.message ?? "");
        const classified = classifyInstallFailure(output, exitCode, agent);
        return {
          success: false,
          reason: classified.reason,
          output: [...outputs, output].join("\n"),
          exitCode,
          hint: classified.hint,
          suggestion: classified.suggestion,
        };
      }

      // Even a 0-exit install can have silently blocked builds — scan.
      const batchBlocked = scanBlockedBuilds(output, agent);
      for (const name of batchBlocked) {
        if (!blockedBuilds.includes(name)) {
          blockedBuilds.push(name);
        }
      }
      outputs.push(output);

      // The manifest a manager writes for an installed spec is not
      // guaranteed to BE the spec (npm rewrites entries with its
      // save-prefix) — reconcile the entries THIS batch installed
      // before moving on, so a later batch's failure still leaves
      // the earlier contract intact.
      await reconcileBatchSpecs(fs, cwd, batch.section, batch.specs);
    }

    return {
      success: true,
      approvedBuilds,
      blockedBuilds,
      output: outputs.join("\n"),
    };
  }

  return { agent, install };
}

/**
 * Detects the fine-grained agent for a project directory via @antfu/ni's
 * detect (same detector getCliCommand uses, so the approval mechanics can
 * never diverge from the command actually run). Returns null when no agent
 * is detectable — callers surface an explicit error rather than guessing.
 */
export async function detectPackageManagerAgent(
  cwd: string,
): Promise<PackageManagerAgent | null> {
  const { detect } = await import("@antfu/ni");
  const agent = await detect({ cwd, programmatic: true });
  return (agent as PackageManagerAgent | undefined) ?? null;
}

/**
 * Maps an install failure to a DXG-presentable hint. Kept separate from
 * the installer so the CLI layer (which owns DXGError) stays the only
 * place that formats errors.
 */
export function installerFailureHint(
  result: Extract<DependencyInstallResult, { success: false }>,
): string {
  const lines: string[] = [];
  if (result.hint) lines.push(result.hint);
  if (result.suggestion) lines.push(`Try: ${result.suggestion}`);
  return lines.join("\n");
}

/** Convenience: project-root-relative paths of the approval files. */
export function approvalPaths(projectRoot: string): {
  workspaceYaml: string;
  packageJson: string;
} {
  return {
    workspaceYaml: join(projectRoot, "pnpm-workspace.yaml"),
    packageJson: join(projectRoot, "package.json"),
  };
}
