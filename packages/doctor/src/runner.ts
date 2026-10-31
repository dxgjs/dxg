/**
 * Runner for dxg doctor checks.
 * Executes registered checks, aggregates results, and handles fixes.
 */

import type {
  DoctorCategory,
  DoctorCheckResult,
  DoctorContext,
  DoctorReport,
  DoctorExitCode,
} from "./types";
import { getDefaultChecks, runCheck } from "./registry";

/**
 * Run all default checks (or filtered by category) and return an aggregated report.
 */
export async function runDoctor(
  ctx: DoctorContext
): Promise<DoctorReport> {
  const categories = ctx.options.category;
  const checks = getDefaultChecks(categories);

  const allResults: DoctorCheckResult[] = [];

  // Run all checks in parallel
  const checkPromises = checks.map(async (entry) => {
    try {
      const result = await runCheck(entry.id, ctx);
      // Handle both single result and array of results
      const results = Array.isArray(result) ? result : [result];
      allResults.push(...results);
    } catch (error) {
      // Check execution failed - add an error result
      allResults.push({
        id: entry.id,
        name: `Check failed: ${entry.category}`,
        category: entry.category,
        severity: "error",
        message: `Check execution failed: ${error instanceof Error ? error.message : String(error)}`,
        fixable: false,
      });
    }
  });

  await Promise.all(checkPromises);

  // Group results by category
  const resultsByCategory: Record<DoctorCategory, DoctorCheckResult[]> = {
    env: [],
    project: [],
    database: [],
    scripts: [],
  };

  for (const result of allResults) {
    resultsByCategory[result.category].push(result);
  }

  // Compute summary
  const summary = {
    ok: 0,
    info: 0,
    warn: 0,
    error: 0,
    fixable: 0,
  };

  for (const result of allResults) {
    summary[result.severity]++;
    if (result.fixable) summary.fixable++;
  }

  const report: DoctorReport = {
    results: resultsByCategory,
    summary,
    hasErrors: summary.error > 0,
    hasWarnings: summary.warn > 0,
    hasFixes: summary.fixable > 0,
  };

  return report;
}

/**
 * Apply fixes for all fixable checks in the report.
 * Returns the number of fixes applied.
 */
export async function applyFixes(
  report: DoctorReport,
  ctx: DoctorContext
): Promise<number> {
  let applied = 0;

  for (const [, results] of Object.entries(report.results)) {
    for (const result of results) {
      if (result.fixable && result.fix) {
        try {
          if (!ctx.options.dryRun) {
            await result.fix();
          }
          applied++;
        } catch (error) {
          ctx.logger.error(
            `Failed to apply fix for ${result.id}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  return applied;
}

/**
 * Determine exit code based on report and CLI options.
 */
export function determineExitCode(
  report: DoctorReport,
  options: { checkOnly?: boolean; json?: boolean }
): DoctorExitCode {
  // Invalid usage is handled at CLI level
  if (options.checkOnly) {
    // In check-only mode, exit with 1 if any errors or warnings
    if (report.hasErrors || report.hasWarnings) {
      return 1; // ISSUES_FOUND
    }
    return 0; // OK
  }

  // Normal mode: exit with 1 only if errors found
  if (report.hasErrors) {
    return 1; // ISSUES_FOUND
  }

  return 0; // OK
}

/**
 * Run checks for a specific category only.
 */
export async function runCategoryChecks(
  category: DoctorCategory,
  ctx: DoctorContext
): Promise<DoctorCheckResult[]> {
  // Import check modules dynamically to register their checks
  await import(`./checks/${category}`);

  const checks = getDefaultChecks([category]);
  const results: DoctorCheckResult[] = [];

  for (const entry of checks) {
    try {
      const result = await runCheck(entry.id, ctx);
      const resultArray = Array.isArray(result) ? result : [result];
      results.push(...resultArray);
    } catch (error) {
      results.push({
        id: entry.id,
        name: `Check failed: ${category}`,
        category,
        severity: "error",
        message: `Check execution failed: ${error instanceof Error ? error.message : String(error)}`,
        fixable: false,
      });
    }
  }

  return results;
}