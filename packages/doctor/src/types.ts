/**
 * Type definitions for dxg doctor.
 * These types define the contract between checks, the runner, and the CLI.
 */

import type { ProjectAwareness } from "@dxgjs/workspace";
import type { Stats } from "fs";

/** Category of diagnostic check. */
export type DoctorCategory =
  | "env"
  | "project"
  | "database"
  | "scripts";

/** Severity of a diagnostic finding. */
export type DoctorSeverity = "error" | "warn" | "info" | "ok";

/** Result of a single check. */
export interface DoctorCheckResult {
  /** Unique identifier for this check (e.g., "env:database-url"). */
  id: string;
  /** Human-readable name of the check. */
  name: string;
  /** Category this check belongs to. */
  category: DoctorCategory;
  /** Severity of the finding. */
  severity: DoctorSeverity;
  /** Short message describing the result. */
  message: string;
  /** Detailed explanation, shown in verbose mode or on failure. */
  detail?: string;
  /** Whether this check can be auto-fixed. */
  fixable: boolean;
  /** If fixable, the fix function to apply. */
  fix?: () => Promise<void>;
}

/** FS interface for file operations - matches @dxgjs/fs exports. */
export interface FSInterface {
  readFile(filePath: string, options?: { encoding?: BufferEncoding | null } | BufferEncoding | null): Promise<string | Buffer>;
  readFileSync(filePath: string, options?: { encoding?: BufferEncoding | null } | BufferEncoding | null): string | Buffer;
  writeFile(filePath: string, data: string | Buffer, options?: { encoding?: BufferEncoding | null; flag?: string } | BufferEncoding | null): Promise<void>;
  writeFileSync(filePath: string, data: string | Buffer, options?: { encoding?: BufferEncoding | null; flag?: string } | BufferEncoding | null): void;
  readJson<T = unknown>(filePath: string): Promise<T>;
  writeJson<T = unknown>(filePath: string, data: T, options?: { spaces?: number }): Promise<void>;
  pathExists(filePath: string): Promise<boolean>;
  pathExistsSync(filePath: string): boolean;
  stat(filePath: string): Promise<Stats>;
  statSync(filePath: string): Stats;
  mkdir(filePath: string, options?: { recursive?: boolean }): Promise<string | undefined>;
  mkdirSync(filePath: string, options?: { recursive?: boolean }): void;
  readdir(filePath: string, options?: { encoding?: BufferEncoding | null }): Promise<string[]>;
  readdirSync(filePath: string, options?: { encoding?: BufferEncoding | null }): string[];
  glob(pattern: string, options?: { cwd?: string }): Promise<string[]>;
  globSync(pattern: string, options?: { cwd?: string }): string[];
  executeCommand(command: string, args?: string[], options?: Record<string, unknown>): Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
  }>;
}

/** Template renderer interface. */
export interface TemplateRenderer {
  render(template: string, data: Record<string, unknown>): string;
}

/** Options passed to each check. */
export interface DoctorCheckOptions {
  /** Current working directory (project root). */
  cwd: string;
  /** Parsed package.json content. */
  packageJson: Record<string, unknown>;
  /** Project awareness data. */
  awareness: ProjectAwareness;
  /** FS abstraction for reading/writing files. */
  fs: FSInterface;
  /** Template renderer. */
  templates: TemplateRenderer;
  /** CLI options merged with global options. */
  options: DoctorCliOptions;
}

/** CLI options for the doctor command. */
export interface DoctorCliOptions {
  /** Categories to run (default: all). */
  category?: DoctorCategory[];
  /** Output as JSON. */
  json?: boolean;
  /** Attempt to fix issues automatically. */
  fix?: boolean;
  /** Skip confirmation prompts for fixes. */
  yes?: boolean;
  /** Dry run — show what would be fixed without applying. */
  dryRun?: boolean;
  /** Exit with code 1 if any issues found (for CI). */
  checkOnly?: boolean;
  /** Non-interactive mode (from global options). */
  nonInteractive?: boolean;
  /** Force mode (from global options). */
  force?: boolean;
}

/** Context passed to checks, built from CLI options and project state. */
export interface DoctorContext {
  /** Current working directory (project root). */
  cwd: string;
  /** Parsed package.json content (fresh read after any fixes). */
  packageJson: Record<string, unknown>;
  /** Project awareness data. */
  awareness: ProjectAwareness;
  /** FS abstraction for reading/writing files. */
  fs: FSInterface;
  /** Template renderer. */
  templates: TemplateRenderer;
  /** CLI options merged with global options. */
  options: DoctorCliOptions;
}

/** Function signature for a diagnostic check. */
export type DoctorCheck = (
  ctx: DoctorContext
) => Promise<DoctorCheckResult | DoctorCheckResult[]>;

/** Registry entry for a check. */
export interface DoctorCheckRegistryEntry {
  /** Unique identifier for this check (e.g., "env:database-url"). */
  id: string;
  /** The check function. */
  check: DoctorCheck;
  /** Category this check belongs to. */
  category: DoctorCategory;
  /** Whether this check runs by default (can be overridden by --category). */
  default?: boolean;
}

/** Aggregated results from all checks. */
export interface DoctorReport {
  /** All check results, grouped by category. */
  results: Record<DoctorCategory, DoctorCheckResult[]>;
  /** Summary counts. */
  summary: {
    ok: number;
    info: number;
    warn: number;
    error: number;
    fixable: number;
  };
  /** Whether any errors were found. */
  hasErrors: boolean;
  /** Whether any warnings were found. */
  hasWarnings: boolean;
  /** Whether any fixes are available. */
  hasFixes: boolean;
}

/** Exit codes for the doctor command. */
export const DoctorExitCode = {
  /** All checks passed (or only info/warn). */
  OK: 0,
  /** Issues found (errors or warnings depending on --check-only). */
  ISSUES_FOUND: 1,
  /** Invalid usage (bad flags, missing args, etc.). */
  INVALID_USAGE: 2,
} as const;

export type DoctorExitCode = (typeof DoctorExitCode)[keyof typeof DoctorExitCode];