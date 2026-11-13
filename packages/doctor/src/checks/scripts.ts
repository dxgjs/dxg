/**
 * Scripts checks for dxg doctor.
 * Validates package.json scripts added by the database generator.
 * Generator adds exactly 5 Prisma scripts (provider-independent):
 * - db:generate: "prisma generate"
 * - db:push: "prisma db push"
 * - db:studio: "prisma studio"
 * - db:pull: "prisma db pull"
 * - db:seed: "prisma db seed" (optional, only if selected during generator run)
 *
 * Migration scripts (db:migrate, db:migrate:deploy) are NOT managed by DXG.
 * Users who need migrations run the Prisma CLI directly.
 */

import type { DoctorContext, DoctorCheckResult, DoctorCategory } from "../types";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { addNpmScripts } from "@dxgjs/ast";
import {
  databaseScriptCatalog,
  SEED_SCRIPT_NAME,
} from "@dxgjs/database-meta";

const SCRIPTS_CHECKS = {
  "scripts:package-json-scripts": {
    name: "package.json scripts valid",
    category: "scripts" as DoctorCategory,
  },
  "scripts:prisma-scripts": {
    name: "Prisma scripts configured",
    category: "scripts" as DoctorCategory,
  },
} as const;

/**
 * Check package.json scripts for validity.
 * Only validates structure; generator doesn't require specific non-DB scripts.
 */
async function checkPackageJsonScripts(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const pkgPath = join(ctx.cwd, "package.json");

  if (!existsSync(pkgPath)) {
    return {
      id: "scripts:package-json-scripts",
      name: SCRIPTS_CHECKS["scripts:package-json-scripts"].name,
      category: "scripts",
      severity: "error",
      message: "package.json not found",
      fixable: false,
    };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const scripts = pkg.scripts || {};

  // Check for common issues (empty strings, non-strings)
  const issues: string[] = [];

  for (const [name, script] of Object.entries(scripts)) {
    if (typeof script !== "string") {
      issues.push(`Script "${name}" is not a string`);
    } else if (script.trim() === "") {
      issues.push(`Script "${name}" is empty`);
    }
  }

  if (issues.length > 0) {
    return {
      id: "scripts:package-json-scripts",
      name: SCRIPTS_CHECKS["scripts:package-json-scripts"].name,
      category: "scripts",
      severity: "warn",
      message: `Script issues: ${issues.join("; ")}`,
      detail: "Fix invalid script definitions in package.json",
      fixable: false,
    };
  }

  return {
    id: "scripts:package-json-scripts",
    name: SCRIPTS_CHECKS["scripts:package-json-scripts"].name,
    category: "scripts",
    severity: "ok",
    message: `package.json scripts valid (${Object.keys(scripts).length} scripts)`,
    fixable: false,
  };
}

/**
 * Check if the Prisma scripts added by the generator are configured.
 * Generator adds scripts from databaseScriptCatalog:
 * - db:generate: "prisma generate" (recommended)
 * - db:push: "prisma db push" (recommended)
 * - db:studio: "prisma studio" (recommended)
 * - db:pull: "prisma db pull" (recommended)
 * - db:seed: "prisma db seed" (optional, only if selected during generator run)
 *
 * Migration scripts (db:migrate, db:migrate:deploy) are NOT managed by DXG.
 * Users who need migrations run the Prisma CLI directly.
 */
async function checkPrismaScripts(ctx: DoctorContext): Promise<DoctorCheckResult> {
  const pkgPath = join(ctx.cwd, "package.json");

  if (!existsSync(pkgPath)) {
    return {
      id: "scripts:prisma-scripts",
      name: SCRIPTS_CHECKS["scripts:prisma-scripts"].name,
      category: "scripts",
      severity: "info",
      message: "Skipped — no package.json",
      fixable: false,
    };
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const scripts = pkg.scripts || {};

  // Get all catalog scripts from database-meta (provider-independent since migrations not managed by DXG)
  const allCatalogScripts = Object.keys(databaseScriptCatalog);

  const missing: string[] = [];
  const configured: string[] = [];
  const mismatched: string[] = [];

  for (const name of allCatalogScripts) {
    const expectedCmd = databaseScriptCatalog[name].command;
    if (scripts[name]) {
      configured.push(name);
      // Check if command matches expected (allow minor variations like extra flags)
      const actualCmd = scripts[name] as string;
      if (!actualCmd.includes(expectedCmd.replace("prisma ", "").replace("prisma db seed", "seed"))) {
        mismatched.push(name);
      }
    } else {
      missing.push(name);
    }
  }

  // db:seed is optional - only warn if missing but other scripts exist
  const isSeedMissing = missing.includes(SEED_SCRIPT_NAME);
  const otherMissing = missing.filter((m) => m !== SEED_SCRIPT_NAME);
  const hasAnyPrismaScripts = configured.length > 0;

  if (otherMissing.length === allCatalogScripts.length) {
    // None of the scripts present
    const requiredScripts: Record<string, string> = {};
    for (const name of allCatalogScripts) {
      requiredScripts[name] = databaseScriptCatalog[name].command;
    }
    return {
      id: "scripts:prisma-scripts",
      name: SCRIPTS_CHECKS["scripts:prisma-scripts"].name,
      category: "scripts",
      severity: "warn",
      message: "No Prisma scripts configured",
      detail: "Run 'dxg add database' to add all Prisma scripts",
      fixable: true,
      fix: async () => {
        await addNpmScripts(ctx.fs, requiredScripts);
      },
    };
  }

  if (otherMissing.length > 0) {
    const toAdd: Record<string, string> = {};
    for (const name of otherMissing) {
      toAdd[name] = databaseScriptCatalog[name].command;
    }
    return {
      id: "scripts:prisma-scripts",
      name: SCRIPTS_CHECKS["scripts:prisma-scripts"].name,
      category: "scripts",
      severity: "warn",
      message: `Missing Prisma scripts: ${otherMissing.join(", ")}`,
      detail: `Generator adds ${allCatalogScripts.length} scripts. Run 'dxg add database' to add missing ones${isSeedMissing ? " (db:seed is optional)" : ""}`,
      fixable: true,
      fix: async () => {
        await addNpmScripts(ctx.fs, toAdd);
      },
    };
  }

  if (mismatched.length > 0) {
    return {
      id: "scripts:prisma-scripts",
      name: SCRIPTS_CHECKS["scripts:prisma-scripts"].name,
      category: "scripts",
      severity: "warn",
      message: `Prisma scripts may have incorrect commands: ${mismatched.join(", ")}`,
      detail: `Expected commands from generator: ${Object.entries(databaseScriptCatalog).map(([k, v]) => `${k}: ${v.command}`).join("; ")}`,
      fixable: false,
    };
  }

  if (isSeedMissing && hasAnyPrismaScripts) {
    return {
      id: "scripts:prisma-scripts",
      name: SCRIPTS_CHECKS["scripts:prisma-scripts"].name,
      category: "scripts",
      severity: "info",
      message: "All required Prisma scripts configured (db:seed optional, not configured)",
      fixable: false,
    };
  }

  return {
    id: "scripts:prisma-scripts",
    name: SCRIPTS_CHECKS["scripts:prisma-scripts"].name,
    category: "scripts",
    severity: "ok",
    message: `All ${allCatalogScripts.length} Prisma scripts configured${isSeedMissing ? " (db:seed optional)" : ""}`,
    fixable: false,
  };
}

/**
 * Register all scripts checks.
 * Only 2 checks remain: package-json-scripts (structure) and prisma-scripts (generator's 5 scripts)
 */
export async function registerScriptsChecks(): Promise<void> {
  const { registerCheck } = await import("../registry");

  registerCheck("scripts:package-json-scripts", checkPackageJsonScripts, "scripts");
  registerCheck("scripts:prisma-scripts", checkPrismaScripts, "scripts");
}