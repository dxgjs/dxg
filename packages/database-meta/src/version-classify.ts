import { PRISMA_PINNED_VERSION } from "./version";
export type { PrismaVersionClass } from "./types";

/**
 * Minimal semver parsing — major.minor.patch as numbers, prerelease kept as
 * the raw tail. No ranges, no coercion: the database domain only ever needs
 * "what exact version does this specifier pin" and "which 7.x is it".
 */
export function parseVersion(raw: string): {
  major: number;
  minor: number;
  patch: number;
  prerelease: string;
} {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(raw.trim());
  if (!m) return { major: NaN, minor: NaN, patch: NaN, prerelease: "" };
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? "",
  };
}

/** True when a bare version (no range operators) is exactly the pinned 7.10.0. */
function isExactPin(raw: string): boolean {
  return raw.trim() === PRISMA_PINNED_VERSION;
}

/**
 * True when a semver range expression's FLOOR is exactly the pinned 7.10.0
 * or higher-within-7 (i.e. ^7.10.0 / ~7.10.0 / >=7.10 <8). A range whose
 * floor is lower (^7.0.0, >7.9.0) can resolve to an unverified 7.x and is
 * therefore incompatible — the exact-match policy from the decision
 * document. Handles caret, tilde, >=/</> and space-separated AND
 * comparators. Prerelease-including ranges are rejected outright (an RC
 * range is not a verified contract).
 */
function rangeAcceptsOnlyPinnedMajor(range: string): boolean {
  const parts = range.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return false;
  if (parts.some((p) => /-\w/.test(p))) return false; // prerelease/RC
  let floorMinor = -1; // the range's lowest possible 7.x minor
  for (const part of parts) {
    const floor = /^(\^|~|>=)(\d+)\.(\d+)(?:\.\d+)?$/.exec(part);
    if (floor) {
      const [, op, M, m] = floor;
      if (Number(M) !== 7) return false;
      if (op === "^" || op === "~" || op === ">=") {
        const minor = Number(m);
        floorMinor = floorMinor === -1 ? minor : Math.max(floorMinor, minor);
      }
      continue;
    }
    const gt = /^>(?!=)(\d+)\.(\d+)\.(\d+)$/.exec(part);
    if (gt) {
      const [, M, m, p] = gt;
      if (Number(M) !== 7) return false;
      // >7.9.0 still admits 7.9.1 — only a floor that lands exactly on
      // 7.10.0 keeps the range verified: >7.9.x < 7.10 is unverified.
      const minor = Number(m) + (Number(p) > 0 ? 0 : 1);
      if (minor !== 10) return false;
      floorMinor = floorMinor === -1 ? minor : Math.max(floorMinor, minor);
      continue;
    }
    const lt = /^<(?!=)(\d+)(?:\.(\d+))?(?:\.\d+)?$/.exec(part);
    if (lt) {
      // Only an upper bound that keeps the whole 7 major is verified.
      if (Number(lt[1]) !== 8) return false;
      continue;
    }
    // Exact bare version inside an AND expression
    if (/^\d+\.\d+\.\d+$/.test(part)) {
      return isExactPin(part);
    }
    return false; // wildcards, ||, hyphen ranges: unverified — incompatible
  }
  // Exact-match policy: the range must floor EXACTLY at 7.10.0 — a lower
  // floor (^7.0.0) admits unverified 7.x, a higher one (^7.11.0) excludes
  // the pinned version. floorMinor === -1 means no floor comparator at all
  // (a lone <8): unverified.
  return floorMinor === 10;
}

/**
 * Classifies a declared prisma / @prisma/client version string against the
 * exact-match policy. Exported for tests.
 */
export function classifyPrismaVersion(
  declared: string | undefined,
): "satisfied" | "incompatible" | "missing" {
  if (declared === undefined) return "missing";
  const raw = declared.trim();
  if (raw === "" || raw === "*" || raw === "latest") return "missing"; // no usable pin — treat as absent
  if (isExactPin(raw)) return "satisfied";
  if (rangeAcceptsOnlyPinnedMajor(raw)) return "satisfied";
  return "incompatible";
}

/** Reads a dependency spec from a freshly-read package.json object. */
export function declaredVersion(
  packageJson:
    | (Record<string, unknown> & {
        devDependencies?: Record<string, string>;
        dependencies?: Record<string, string>;
      })
    | undefined,
  name: string,
): string | undefined {
  return (
    packageJson?.devDependencies?.[name] ?? packageJson?.dependencies?.[name]
  );
}

/**
 * Extracts the package NAME from an npm spec like "prisma@7.10.0" or
 * "@prisma/client@7.10.0". Exported for planDatabase's state-aware batch
 * filtering (name-based, never literal-spec — a declared "7.10.0" must
 * match a batch "prisma@7.10.0").
 */
export function specName(spec: string): string {
  const at = spec.indexOf("@", 1);
  return at === -1 ? spec : spec.slice(0, at);
}