/**
 * Project structure checks for dxg doctor.
 * Validates package.json and .gitignore (for .env coverage).
 * Only checks required by the database generator.
 */

import type { DoctorContext, DoctorCheckResult, DoctorCategory } from "../types";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const PROJECT_CHECKS = {
  "project:package-json": {
    name: "package.json exists",
    category: "project" as DoctorCategory,
  },
  "project:gitignore": {
    name: ".gitignore configured",
    category: "project" as DoctorCategory,
  },
} as const;

/**
 * Check if package.json exists and is valid.
 * Required by the database generator (precondition).
 */
async function checkPackageJson(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const pkgPath = join(ctx.cwd, "package.json");

  if (!existsSync(pkgPath)) {
    return {
      id: "project:package-json",
      name: PROJECT_CHECKS["project:package-json"].name,
      category: "project",
      severity: "error",
      message: "package.json not found",
      detail: "Initialize your project (e.g., pnpm init) before running dxg add database",
      fixable: false,
    };
  }

  try {
    const content = readFileSync(pkgPath, "utf-8");
    JSON.parse(content);
    return {
      id: "project:package-json",
      name: PROJECT_CHECKS["project:package-json"].name,
      category: "project",
      severity: "ok",
      message: "package.json is valid",
      fixable: false,
    };
  } catch {
    return {
      id: "project:package-json",
      name: PROJECT_CHECKS["project:package-json"].name,
      category: "project",
      severity: "error",
      message: "package.json is invalid JSON",
      detail: "Fix syntax errors in package.json",
      fixable: false,
    };
  }
}

/**
 * Check .gitignore for .env coverage.
 * The database generator adds .env to .gitignore additively.
 * Only verifies the pattern the generator manages.
 */
async function checkGitignore(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const gitignorePath = join(ctx.cwd, ".gitignore");

  if (!existsSync(gitignorePath)) {
    return {
      id: "project:gitignore",
      name: PROJECT_CHECKS["project:gitignore"].name,
      category: "project",
      severity: "warn",
      message: ".gitignore not found",
      detail: "Create .gitignore to exclude .env (database generator adds this)",
      fixable: true,
      fix: async () => {
        const content = `.env\n`;
        await ctx.fs.writeFile(gitignorePath, content);
      },
    };
  }

  const content = readFileSync(gitignorePath, "utf-8");
  const lines = content.split(/\r?\n/);

  // Check for .env coverage using git-valid patterns: .env, .env*, *.env
  // (".env.*" does NOT cover .env - probe verified 2026-10-11)
  const coversEnv = lines.some((line) =>
    [".env", ".env*", "*.env"].includes(line.trimEnd())
  );
  const negatesEnv = lines.some((line) => line.trimEnd() === "!.env");

  if (negatesEnv) {
    return {
      id: "project:gitignore",
      name: PROJECT_CHECKS["project:gitignore"].name,
      category: "project",
      severity: "warn",
      message: ".gitignore has explicit !.env negation",
      detail: "User chose to track .env; generator will not modify",
      fixable: false,
    };
  }

  if (!coversEnv) {
    return {
      id: "project:gitignore",
      name: PROJECT_CHECKS["project:gitignore"].name,
      category: "project",
      severity: "warn",
      message: ".gitignore missing .env pattern",
      detail: "Add .env to .gitignore (generator does this additively)",
      fixable: true,
      fix: async () => {
        const needsLeadingNewline = content.length > 0 && !content.endsWith("\n");
        await ctx.fs.writeFile(gitignorePath, `${content}${needsLeadingNewline ? "\n" : ""}.env\n`);
      },
    };
  }

  return {
    id: "project:gitignore",
    name: PROJECT_CHECKS["project:gitignore"].name,
    category: "project",
    severity: "ok",
    message: ".gitignore covers .env",
    fixable: false,
  };
}

/**
 * Register all project checks.
 */
export async function registerProjectChecks(): Promise<void> {
  const { registerCheck } = await import("../registry");

  registerCheck("project:package-json", checkPackageJson, "project");
  registerCheck("project:gitignore", checkGitignore, "project");
}