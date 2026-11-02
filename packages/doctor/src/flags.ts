/**
 * Flag validation and parsing for dxg doctor command.
 * Handles CLI flags, global options merging, and validation.
 */

import type { DoctorCliOptions, DoctorCategory, DoctorExitCode } from "./types";
import { ValidationError } from "@dxgjs/errors";

/** Valid doctor categories. */
const VALID_CATEGORIES: DoctorCategory[] = [
  "env",
  "project",
  "database",
  "scripts",
];

/** Valid doctor flags. */
const DOCTOR_FLAGS = [
  "category",
  "json",
  "fix",
  "yes",
  "dryRun",
  "checkOnly",
] as const;

/**
 * Validate and normalize doctor CLI options.
 * Merges global options (--non-interactive, --dry-run, --force) with doctor-specific flags.
 */
export function validateDoctorOptions(
  rawOptions: Record<string, unknown>,
  globalOptions: {
    nonInteractive?: boolean;
    dryRun?: boolean;
    force?: boolean;
  }
): DoctorCliOptions {
  const options: DoctorCliOptions = {
    ...globalOptions,
  };

  // Parse --category (can be comma-separated or repeated)
  if (rawOptions.category !== undefined) {
    const categories = parseCategories(rawOptions.category);
    options.category = categories;
  }

  // Parse boolean flags
  if (rawOptions.json !== undefined) {
    options.json = parseBoolean(rawOptions.json, "--json");
  }

  if (rawOptions.fix !== undefined) {
    options.fix = parseBoolean(rawOptions.fix, "--fix");
  }

  if (rawOptions.yes !== undefined) {
    options.yes = parseBoolean(rawOptions.yes, "--yes");
  }

  if (rawOptions.dryRun !== undefined) {
    options.dryRun = parseBoolean(rawOptions.dryRun, "--dry-run");
  }

  if (rawOptions.checkOnly !== undefined) {
    options.checkOnly = parseBoolean(rawOptions.checkOnly, "--check-only");
  }

  // Validate flag combinations
  validateFlagCombinations(options);

  return options;
}

/**
 * Parse category value(s) into array of DoctorCategory.
 */
function parseCategories(value: unknown): DoctorCategory[] {
  if (typeof value === "string") {
    return value
      .split(",")
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
      .map(validateCategory);
  }
  if (Array.isArray(value)) {
    return value.map((v) => validateCategory(String(v)));
  }
  throw new ValidationError(
    `--category must be a string or array, got ${typeof value}`
  );
}

/**
 * Validate a single category string.
 */
function validateCategory(category: string): DoctorCategory {
  const normalized = category.toLowerCase();
  if (!VALID_CATEGORIES.includes(normalized as DoctorCategory)) {
    throw new ValidationError(
      `Invalid category: "${category}". Valid categories: ${VALID_CATEGORIES.join(", ")}`
    );
  }
  return normalized as DoctorCategory;
}

/**
 * Parse a value as boolean, accepting various truthy/falsy forms.
 */
function parseBoolean(value: unknown, flagName: string): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "yes" || lower === "") {
      return true;
    }
    if (lower === "false" || lower === "0" || lower === "no") {
      return false;
    }
  }
  throw new ValidationError(
    `${flagName} must be a boolean, got ${JSON.stringify(value)}`
  );
}

/**
 * Validate flag combinations for logical consistency.
 */
function validateFlagCombinations(options: DoctorCliOptions): void {
  // --fix requires at least one check to run
  if (options.fix && options.category && options.category.length === 0) {
    throw new ValidationError(
      "--fix requires at least one category to check"
    );
  }

  // --dry-run with --fix is allowed (shows what would be fixed)
  // --yes with --fix skips confirmation prompt

  // --check-only with --fix is conflicting
  if (options.checkOnly && options.fix) {
    throw new ValidationError(
      "--check-only and --fix cannot be used together"
    );
  }

  // --check-only with --dry-run is redundant but allowed
}

/**
 * Validate that only known flags are used.
 */
export function validateKnownFlags(
  flags: Record<string, unknown>
): void {
  const knownFlags = [
    ...DOCTOR_FLAGS,
    "nonInteractive",
    "dryRun",
    "force",
    "help",
    "version",
  ];

  for (const flag of Object.keys(flags)) {
    if (!knownFlags.includes(flag)) {
      throw new ValidationError(
        `Unknown flag: --${flag}. Run "dxg doctor --help" for usage.`
      );
    }
  }
}

/**
 * Map exit code to process exit.
 */
export function mapExitCode(code: DoctorExitCode): number {
  return code;
}