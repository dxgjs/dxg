import { Logger } from "@dxgjs/logger";
import type { ProjectAwareness } from "@dxgjs/workspace";
import type { DependencyInstaller } from "./install/types";
type FS = typeof import("@dxgjs/fs");

export interface FSInterface {
  pathExists: FS["pathExists"];
  readFile: FS["readFile"];
  writeFile: FS["writeFile"];
  stat: FS["stat"];
  mkdir: FS["mkdir"];
  readdir: FS["readdir"];
  readJson: FS["readJson"];
  writeJson: FS["writeJson"];
}

export interface GeneratorContext {
  logger: Logger;
  fs: FSInterface;
  templates: {
    render: (template: string, data: Record<string, unknown>) => string;
  };
  awareness: ProjectAwareness;
  /** Whether to run in dry-run mode (no filesystem changes) */
  dryRun?: boolean;
  /** Whether to force overwrite conflicting files */
  force?: boolean;
  /** Whether to run in non-interactive mode (no prompts) */
  nonInteractive?: boolean;
  /**
   * Dependency-installation seam (optional — additive, existing generators
   * keep working without it). Built by the CLI in prepareContext: resolves
   * the package-manager command via @antfu/ni, pre-writes build approvals
   * for exactly the packages a generator's plan marks requiresBuild, and
   * normalizes the outcome so "install exited 0" can be told apart from
   * "the project is operational". Generators describe WHAT they need; this
   * owns the per-manager HOW.
   */
  installer?: DependencyInstaller;
}

export interface GeneratorPrompt {
  type: "input" | "confirm" | "select";
  name: string;
  message: string;
  default?: string | (() => string) | boolean;
  choices?: Array<{ name: string; value: string }>;
  validate?: (input: unknown) => boolean | string;
}

export interface Generator {
  name: string;
  description: string;
  prompts: GeneratorPrompt[];
  run(answers: Record<string, unknown>, context: GeneratorContext): Promise<void>;
}