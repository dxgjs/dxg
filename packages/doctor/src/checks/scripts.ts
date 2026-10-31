/**
 * Scripts checks for dxg doctor.
 * Validates package.json scripts added by the database generator.
 * Generator adds exactly 6 Prisma scripts (provider-dependent).
 */

import type { DoctorContext, DoctorCheckResult, DoctorCategory } from "../types";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

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
 * Check if the 6 Prisma scripts added by the generator are configured.
 * Generator adds these exact 6 scripts:
 * - db:generate: "prisma generate"
 * - db:push: "prisma db push"
 * - db:migrate: "prisma migrate dev"
 * - db:migrate:deploy: "prisma migrate deploy"
 * - db:studio: "prisma studio"
 * - db:seed: "tsx prisma/seed.ts"
 *
 * For SQLite: db:push runs automatically; for server providers: user runs manually.
 * db:seed is optional (only if selected during generator run).
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

  // The 6 exact scripts the generator adds
  const requiredPrismaScripts = {
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:migrate": "prisma migrate dev",
    "db:migrate:deploy": "prisma migrate deploy",
    "db:studio": "prisma studio",
    "db:seed": "tsx prisma/seed.ts",
  };

  const missing: string[] = [];
  const configured: string[] = [];
  const mismatched: string[] = [];

  for (const [name, expectedCmd] of Object.entries(requiredPrismaScripts)) {
    if (scripts[name]) {
      configured.push(name);
      // Check if command matches expected (allow minor variations like extra flags)
      const actualCmd = scripts[name] as string;
      if (!actualCmd.includes(expectedCmd.replace("prisma ", "").replace("tsx prisma/seed.ts", "seed"))) {
        mismatched.push(name);
      }
    } else {
      missing.push(name);
    }
  }

  // db:seed is optional - only warn if missing but other scripts exist
  const isSeedMissing = missing.includes("db:seed");
  const otherMissing = missing.filter((m) => m !== "db:seed");
  const hasAnyPrismaScripts = configured.length > 0;

  if (otherMissing.length === 6) {
    // None of the 6 scripts present
    return {
      id: "scripts:prisma-scripts",
      name: SCRIPTS_CHECKS["scripts:prisma-scripts"].name,
      category: "scripts",
      severity: "warn",
      message: "No Prisma scripts configured",
      detail: "Run 'dxg add database' to add all 6 Prisma scripts",
      fixable: true,
      fix: async () => {
        pkg.scripts = { ...scripts, ...requiredPrismaScripts };
        await ctx.fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
      },
    };
  }

  if (otherMissing.length > 0) {
    return {
      id: "scripts:prisma-scripts",
      name: SCRIPTS_CHECKS["scripts:prisma-scripts"].name,
      category: "scripts",
      severity: "warn",
      message: `Missing Prisma scripts: ${otherMissing.join(", ")}`,
      detail: `Generator adds 6 scripts. Run 'dxg add database' to add missing ones${isSeedMissing ? " (db:seed is optional)" : ""}`,
      fixable: true,
      fix: async () => {
        const toAdd: Record<string, string> = {};
        for (const name of otherMissing) {
          toAdd[name] = requiredPrismaScripts[name as keyof typeof requiredPrismaScripts];
        }
        pkg.scripts = { ...scripts, ...toAdd };
        await ctx.fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2));
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
      detail: `Expected commands from generator: ${Object.entries(requiredPrismaScripts).map(([k, v]) => `${k}: ${v}`).join("; ")}`,
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
    message: `All 6 Prisma scripts configured${isSeedMissing ? " (db:seed optional)" : ""}`,
    fixable: false,
  };
}

/**
 * Register all scripts checks.
 * Only 2 checks remain: package-json-scripts (structure) and prisma-scripts (generator's 6 scripts)
 */
export async function registerScriptsChecks(): Promise<void> {
  const { registerCheck } = await import("../registry");

  registerCheck("scripts:package-json-scripts", checkPackageJsonScripts, "scripts");
  registerCheck("scripts:prisma-scripts", checkPrismaScripts, "scripts");
}