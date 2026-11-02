/**
 * Renderers for dxg doctor output.
 * Uses Clack for interactive UI and picocolors for colors.
 * No emojis - uses 6-char colored tags and bullets.
 */

import pc from "picocolors";
import { intro, outro, note, spinner } from "@dxgjs/prompts";
import type {
  DoctorReport,
  DoctorCheckResult,
  DoctorCategory,
  DoctorSeverity,
  DoctorContext,
} from "./types";

// 6-character colored tags for consistent alignment
const TAGS: Record<DoctorSeverity, string> = {
  ok: pc.green("[ OK ]  "),
  info: pc.blue("[ INFO ] "),
  warn: pc.yellow("[ WARN ] "),
  error: pc.red("[ ERR ]  "),
};

const CATEGORY_LABELS: Record<DoctorCategory, string> = {
  env: "ENV",
  project: "PROJ",
  database: "DB",
  scripts: "SCRPT",
};

/**
 * Strip ANSI escape codes from a string to get visual length.
 */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Format check result lines for display.
 * @param result - The check result to format
 * @param showCategory - Whether to prefix with category label (true for individual render, false for grouped report)
 * @returns Array of formatted lines ready for output
 */
function formatCheckLines(
  result: DoctorCheckResult,
  showCategory: boolean,
): string[] {
  const tag = TAGS[result.severity];
  const categoryLabel = showCategory
    ? pc.gray(`[${CATEGORY_LABELS[result.category]}] `)
    : "";
  const name = pc.bold(result.name);
  const message = result.message;

  const prefix = `${tag}${categoryLabel}${name} — `;
  const tagVisualLength = stripAnsi(tag).length;

  // Detail and fixable lines align with the tag (e.g., [ WARN ])
  // In flat mode (showCategory=true): tag starts at column 0, so indent = tagVisualLength
  // In report mode (showCategory=false): note() adds box padding, tag starts at box margin + tagVisualLength,
  // so indent = tagVisualLength to align with tag position
  const detailIndent = tagVisualLength;

  const lines: string[] = [
    `${prefix}${message}`,
  ];

  if (result.detail) {
    const indent = " ".repeat(detailIndent);
    lines.push(`${indent}${pc.gray(result.detail)}`);
  }

  if (result.fixable) {
    const indent = " ".repeat(detailIndent);
    lines.push(`${indent}${pc.cyan("→ Fixable with --fix")}`);
  }

  return lines;
}

/**
 * Show the doctor intro banner.
 */
export function showIntro(): void {
  intro(pc.bgCyan(pc.black(" DXG Doctor ")));
}

/**
 * Show the doctor outro with summary.
 */
export function showOutro(
  report: DoctorReport,
  options: {
    json?: boolean;
    checkOnly?: boolean;
    fix?: boolean;
    dryRun?: boolean;
  },
): void {
  if (options.json) return; // JSON output handled separately

  const { summary } = report;
  const parts: string[] = [];

  if (summary.ok > 0) parts.push(`${pc.green(summary.ok)} ${pc.green("ok")}`);
  if (summary.info > 0)
    parts.push(`${pc.blue(summary.info)} ${pc.blue("info")}`);
  if (summary.warn > 0)
    parts.push(`${pc.yellow(summary.warn)} ${pc.yellow("warn")}`);
  if (summary.error > 0)
    parts.push(`${pc.red(summary.error)} ${pc.red("err")}`);

  const summaryLine = parts.join(" • ");

  if (options.dryRun && summary.fixable > 0) {
    outro(pc.cyan(`Dry run — ${summaryLine} • ${summary.fixable} fixable`));
  } else if (options.fix && summary.fixable > 0) {
    outro(pc.green(`Fixed ${summary.fixable} issue(s) — ${summaryLine}`));
  } else if (report.hasErrors && summary.fixable > 0) {
    outro(pc.red(`${summaryLine} • Run with --fix to attempt repairs`));
  } else if (report.hasWarnings && summary.fixable > 0) {
    outro(pc.yellow(`${summaryLine} • Run with --fix to attempt repairs`));
  } else if (report.hasErrors) {
    outro(pc.red(`${summaryLine}`));
  } else if (report.hasWarnings) {
    outro(pc.yellow(`${summaryLine}`));
  } else {
    outro(pc.green(`${summaryLine} • All checks passed`));
  }
}

/**
 * Render a single check result in human-readable format.
 * Includes category label since it's shown in isolation.
 */
export function renderCheckResult(result: DoctorCheckResult): void {
  const lines = formatCheckLines(result, true);
  for (const line of lines) {
    console.log(line);
  }
}

/**
 * Render all results grouped by category.
 * Wraps each category in a note() block with category name as title,
 * omitting the per-line category label since it's redundant.
 */
export function renderReport(report: DoctorReport): void {
  const categoryOrder: DoctorCategory[] = [
    "env",
    "project",
    "database",
    "scripts",
  ];

  for (const category of categoryOrder) {
    const results = report.results[category];
    if (results.length === 0) continue;

    // Sort by severity: error > warn > info > ok
    const severityOrder: DoctorSeverity[] = ["error", "warn", "info", "ok"];
    const sorted = [...results].sort(
      (a, b) =>
        severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity),
    );

    // Build section content using shared formatter (showCategory = false)
    const lines: string[] = [];
    for (const result of sorted) {
      lines.push(...formatCheckLines(result, false));
    }

    // Wrap in note component like Operation Summary
    note(lines.join("\n"), pc.bold(CATEGORY_LABELS[category]));
  }
}

/**
 * Render report as JSON.
 */
export function renderJson(report: DoctorReport): void {
  console.log(JSON.stringify(report, null, 2));
}

/**
 * Show a spinner while running checks.
 */
export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
): Promise<T> {
  const s = spinner();
  s.start(message);
  try {
    const result = await fn();
    s.stop(pc.green("Done"));
    return result;
  } catch (error) {
    s.stop(pc.red("Failed"));
    throw error;
  }
}

/**
 * Show a note with details (for fix dry-run preview).
 */
export function showFixPreview(fixes: string[]): void {
  if (fixes.length === 0) return;

  note(
    fixes.map((f) => pc.gray("• ") + f).join("\n"),
    pc.cyan("Proposed fixes (dry run)"),
  );
}

/**
 * Confirm before applying fixes (unless --yes).
 */
export async function confirmFixes(
  ctx: DoctorContext,
  count: number,
): Promise<boolean> {
  if (ctx.options.yes || ctx.options.nonInteractive) {
    return true;
  }

  // Use Clack confirm for interactive confirmation
  const { confirm, isCancel } = await import("@dxgjs/prompts");
  const result = await confirm({
    message: `Apply ${count} fix${count === 1 ? "" : "es"}?`,
    initialValue: true,
  });
  if (isCancel(result)) {
    return false;
  }
  return result;
}

/**
 * Format a check ID for display.
 */
export function formatCheckId(id: string): string {
  return pc.gray(`(${id})`);
}
