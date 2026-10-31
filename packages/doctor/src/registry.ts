/**
 * Check registry for dxg doctor.
 * Central place to register and retrieve diagnostic checks by category.
 */

import type {
  DoctorCategory,
  DoctorCheck,
  DoctorCheckRegistryEntry,
  DoctorContext,
} from "./types";

/** Internal registry of all checks. */
const checkRegistry = new Map<string, DoctorCheckRegistryEntry>();

/**
 * Register a diagnostic check.
 * @param id Unique identifier for the check (e.g., "env:database-url")
 * @param check The check function
 * @param category Category this check belongs to
 * @param defaultRun Whether this check runs by default (default: true)
 */
export function registerCheck(
  id: string,
  check: DoctorCheck,
  category: DoctorCategory,
  defaultRun = true
): void {
  if (checkRegistry.has(id)) {
    throw new Error(`Doctor check "${id}" is already registered`);
  }
  checkRegistry.set(id, { id, check, category, default: defaultRun });
}

/**
 * Get a check by its ID.
 */
export function getCheck(id: string): DoctorCheckRegistryEntry | undefined {
  return checkRegistry.get(id);
}

/**
 * Get all checks for a specific category.
 */
export function getChecksByCategory(
  category: DoctorCategory
): DoctorCheckRegistryEntry[] {
  const results: DoctorCheckRegistryEntry[] = [];
  for (const [, entry] of checkRegistry) {
    if (entry.category === category) {
      results.push(entry);
    }
  }
  return results;
}

/**
 * Get all registered checks.
 */
export function getAllChecks(): DoctorCheckRegistryEntry[] {
  return Array.from(checkRegistry.values());
}

/**
 * Get all checks that should run by default for the given categories.
 * If categories is empty, returns all default checks from all categories.
 */
export function getDefaultChecks(
  categories?: DoctorCategory[]
): DoctorCheckRegistryEntry[] {
  const results: DoctorCheckRegistryEntry[] = [];
  for (const [, entry] of checkRegistry) {
    if (entry.default) {
      if (!categories || categories.length === 0 || categories.includes(entry.category)) {
        results.push(entry);
      }
    }
  }
  return results;
}

/**
 * Clear the registry (mainly for testing).
 */
export function clearRegistry(): void {
  checkRegistry.clear();
}

/**
 * Run a specific check by ID with the given context.
 */
export async function runCheck(
  id: string,
  ctx: DoctorContext
): Promise<Awaited<ReturnType<DoctorCheck>>> {
  const entry = checkRegistry.get(id);
  if (!entry) {
    throw new Error(`Doctor check "${id}" not found`);
  }
  return entry.check(ctx);
}