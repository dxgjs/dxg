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
 * spinner stays alive (the Clack convention survives), and on completion
 * the captured output is echoed once so the user still sees the manager's
 * progress/result lines. `prisma init`/`prisma generate` keep `inherit` —
 * they are tool output the user wants live.
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
    const batches: { args: string[]; label: string }[] = [];
    if (devSpecs.length > 0) {
      batches.push({
        args: ["-D", ...devSpecs.map((d) => d.spec)],
        label: "dev dependencies",
      });
    }
    if (regularSpecs.length > 0) {
      batches.push({
        args: regularSpecs.map((d) => d.spec),
        label: "dependencies",
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
