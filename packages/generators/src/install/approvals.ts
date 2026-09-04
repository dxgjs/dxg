/**
 * Build-approval policy: the per-manager mechanics for allowing EXACTLY the
 * packages a plan marked `requiresBuild` to run their install scripts.
 *
 * Security contract (non-negotiable):
 *   - Approvals are per-package-name. NEVER a global "allow everything"
 *     (no dangerouslyAllowAllBuilds / --dangerously-allow-all-scripts /
 *     enableScripts:true / --ignore-scripts).
 *   - Approvals are written BEFORE the install, additively — existing
 *     entries are preserved, never removed or flipped to false.
 *   - Nothing outside the plan's requiresBuild names is touched.
 *
 * Every mechanic below was validated empirically on this machine (pnpm
 * 11.18.0, npm 12.0.1, bun 1.3.14, yarn classic 1.22.22, yarn berry 4.1.1):
 *   - pnpm 11: `allowBuilds` map in pnpm-workspace.yaml, name → true|false.
 *     Pre-writing {pkg: true} BEFORE install = scripts run inline, exit 0.
 *     (Lab e2e-pnpm: full database plan, zero ERR_PNPM_IGNORED_BUILDS.)
 *     Keys starting with "@" MUST be single-quoted or pnpm's YAML parser
 *     fails with "bad indentation of a mapping entry" (lab-observed).
 *   - npm 12: `allowScripts` map in package.json. Name-only entries work
 *     pre-written (lab npm-nameonly: script ran, binding created, no
 *     warning) — the pkg@version pinning npm's CLI applies by default is
 *     NOT required for pre-approval. NOTE (live-verified, npm 12): when
 *     the map is ABSENT, npm silently blocks scripts with a warn line and
 *     exit 0 — DXG pre-writes the map for exactly the plan's packages.
 *   - yarn berry: `dependenciesMeta` {pkg: {built: true}} in package.json
 *     is the documented allow-list path when enableScripts is false.
 *     Verified live on yarn 4.1.1: it overrides enableScripts:false
 *     PER PACKAGE (the plan's prisma/engines built while out-of-plan sharp
 *     stayed YN0004-blocked), and enableScripts defaults to TRUE for fresh
 *     projects — the map is written so the plan's builds survive either
 *     default. Classic (v1): scripts run by default, nothing to write
 *     (verified live: full sqlite plan, binding + engines binary on disk,
 *     zero approval config written by DXG).
 *   - bun: its default-trusted list covers the packages DXG's database plan
 *     needs (lab bun-full: zero blocked). Writing `trustedDependencies`
 *     would REPLACE the default list (bun semantics) — a hazard — so the
 *     adapter writes nothing.
 */

import { join } from "path";
import type { FSInterface } from "../types";

/**
 * Minimal YAML writer/patcher for the single map pnpm 11 needs. Not a
 * general YAML library: pnpm-workspace.yaml is user-owned, so edits are
 * byte-preserving text transforms on the `allowBuilds:` block only —
 * comments, ordering, and every other key survive untouched.
 *
 * Format matches what pnpm itself writes (observed in lab m2/e5):
 *   allowBuilds:
 *     better-sqlite3: true
 *     '@prisma/engines': true
 */
export async function applyPnpmAllowBuilds(
  fs: FSInterface,
  projectRoot: string,
  packageNames: string[],
): Promise<void> {
  if (packageNames.length === 0) return;
  const yamlPath = join(projectRoot, "pnpm-workspace.yaml");
  const existing = (await fs.pathExists(yamlPath))
    ? ((await fs.readFile(yamlPath, { encoding: "utf8" })) as string)
    : "";

  const updated = mergeAllowBuildsBlock(existing, packageNames);
  if (updated === existing) return; // Idempotent: nothing new to approve.

  await fs.writeFile(yamlPath, updated, "utf8");
}

/**
 * Pure transform (exported for tests): merges names into the allowBuilds
 * map, preserving the rest of the document byte-for-byte.
 */
export function mergeAllowBuildsBlock(
  yaml: string,
  packageNames: string[],
): string {
  if (packageNames.length === 0) return yaml;

  const lines = yaml.split("\n");

  // Locate the top-level `allowBuilds:` key. The pattern accepts a trailing
  // inline comment on the key line — missing it would append a SECOND
  // `allowBuilds:` block at the document end, a duplicate mapping key pnpm
  // rejects. (Block style only: pnpm itself never writes the `{…}` flow
  // form.)
  const keyIdx = lines.findIndex((line) =>
    /^allowBuilds:\s*(#.*)?$/.test(line.trim()),
  );

  if (keyIdx === -1) {
    // No allowBuilds block yet: append one. pnpm creates pnpm-workspace.yaml
    // itself when missing (empty file → just the new block).
    const block = [
      "allowBuilds:",
      ...packageNames.map((n) => `  ${yamlKey(n)}: true`),
    ].join("\n");
    if (yaml === "" || yaml.trim() === "") return `${block}\n`;
    return `${yaml.replace(/\n+$/, "")}\n${block}\n`;
  }

  // Collect the existing entry names in the block (indented lines directly
  // under allowBuilds:) and find the block's end — the first line that is
  // not an indented entry (another top-level key, a comment at column 0,
  // EOF, or a blank line, conservatively).
  const existingNames = new Set<string>();
  let end = keyIdx + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() === "") break;
    if (!/^\s/.test(line)) break;
    const entry = line.match(/^\s+([^\s:][^:]*):\s*(.*)$/);
    if (entry) existingNames.add(unquoteYamlKey(entry[1].trim()));
    end += 1;
  }

  // Append only the missing approvals, right after the block's last line —
  // the block grows, everything else stays in place.
  const missing = packageNames.filter((n) => !existingNames.has(n));
  if (missing.length === 0) return yaml;

  lines.splice(end, 0, ...missing.map((n) => `  ${yamlKey(n)}: true`));
  return lines.join("\n");
}

/**
 * pnpm's YAML requires quoting for keys starting with "@" (lab-verified:
 * an unquoted `@prisma/engines:` key breaks parsing). Same rule pnpm
 * itself applies when it writes placeholders.
 */
function yamlKey(name: string): string {
  return /^@/.test(name) ? `'${name}'` : name;
}

function unquoteYamlKey(key: string): string {
  return key.replace(/^['"]|['"]$/g, "");
}

/**
 * npm 12: pre-write `allowScripts` {name: true} into package.json.
 * Name-only entries. STRICTLY ADDITIVE — the same rule as the pnpm merge:
 * a name that already has an entry is never touched, so an explicit user
 * denial (`false`) stands. The install then blocks/skips that package's
 * scripts and the blocked-builds scan (or artifact verification) surfaces
 * it honestly — never a silent flip.
 */
export async function applyNpmAllowScripts(
  fs: FSInterface,
  projectRoot: string,
  packageNames: string[],
): Promise<void> {
  if (packageNames.length === 0) return;
  const pkgPath = join(projectRoot, "package.json");
  const pkg = (await fs.readJson<Record<string, unknown>>(pkgPath)) ?? {};
  const allowScripts = (pkg.allowScripts ?? {}) as Record<string, boolean>;
  let changed = false;
  for (const name of packageNames) {
    if (allowScripts[name] === undefined) {
      allowScripts[name] = true;
      changed = true;
    }
  }
  if (!changed) return;
  pkg.allowScripts = allowScripts;
  await fs.writeJson(pkgPath, pkg);
}

/**
 * yarn berry: pre-write `dependenciesMeta` {name: {built: true}} into
 * package.json — the documented allow-list when enableScripts is false
 * (per-package override, live-verified on yarn 4.1.1: the plan's packages
 * built while out-of-plan sharp stayed YN0004-blocked). STRICTLY ADDITIVE
 * — same rule as pnpm/npm: `built` is set ONLY when the field is absent.
 * An explicit denial (`built: false`) stands; other meta fields on an
 * existing entry are always preserved. NEVER `onlyBuiltDependencies`
 * (pnpm-only name; and writing unknown keys into berry's .yarnrc.yml would
 * abort under enableStrictSettings).
 */
export async function applyYarnBerryDependenciesMeta(
  fs: FSInterface,
  projectRoot: string,
  packageNames: string[],
): Promise<void> {
  if (packageNames.length === 0) return;
  const pkgPath = join(projectRoot, "package.json");
  const pkg = (await fs.readJson<Record<string, unknown>>(pkgPath)) ?? {};
  const meta = (pkg.dependenciesMeta ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  let changed = false;
  for (const name of packageNames) {
    const entry = (meta[name] ?? {}) as Record<string, unknown>;
    if (entry.built === undefined) {
      entry.built = true;
      meta[name] = entry;
      changed = true;
    }
  }
  if (!changed) return;
  pkg.dependenciesMeta = meta;
  await fs.writeJson(pkgPath, pkg);
}
