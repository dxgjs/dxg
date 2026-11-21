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

/**
 * True when a bare version (no range operators) is a valid 7.x version.
 * Accepts any 7.x.y version (not 6.x, not 8.x, not prerelease).
 */
function isValid7xVersion(raw: string): boolean {
  const parsed = parseVersion(raw.trim());
  return parsed.major === 7 && parsed.prerelease === "";
}

/**
 * True when a semver range expression's FLOOR is within the 7.x branch
 * and the range does not admit 8.x or prerelease versions.
 * Accepts ranges like ^7.10.1, ~7.10.1, >=7.10.1 <8, etc.
 */
function rangeAcceptsValid7x(range: string): boolean {
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
      // >7.9.0 admits 7.9.1+ — any >7.x within 7.x branch is valid
      const minor = Number(m) + (Number(p) > 0 ? 0 : 1);
      if (minor < 0) return false;
      floorMinor = floorMinor === -1 ? minor : Math.max(floorMinor, minor);
      continue;
    }
    const lt = /^<(?!=)(\d+)(?:\.(\d+))?(?:\.\d+)?$/.exec(part);
    if (lt) {
      // Only an upper bound that keeps the whole 7 major is valid.
      if (Number(lt[1]) !== 8) return false;
      continue;
    }
    // Exact bare version inside an AND expression
    if (/^\d+\.\d+\.\d+$/.test(part)) {
      return isValid7xVersion(part);
    }
    return false; // wildcards, ||, hyphen ranges: unverified — incompatible
  }
  // The range must have a floor within 7.x (not just <8 alone)
  // floorMinor === -1 means no floor comparator at all (a lone <8): incompatible.
  return floorMinor !== -1;
}

/**
 * Classifies a declared prisma / @prisma/client version string against the
 * 7.x verification policy. Exported for tests.
 */
export function classifyPrismaVersion(
  declared: string | undefined,
): "satisfied" | "incompatible" | "missing" {
  if (declared === undefined) return "missing";
  const raw = declared.trim();
  if (raw === "" || raw === "*" || raw === "latest") return "missing"; // no usable pin — treat as absent
  if (isValid7xVersion(raw)) return "satisfied";
  if (rangeAcceptsValid7x(raw)) return "satisfied";
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
 * Extracts the package NAME from an npm spec like "prisma@7" or
 * "@prisma/client@^7.10.1". Exported for planDatabase's state-aware batch
 * filtering (name-based, never literal-spec — a declared "7" must
 * match a batch "prisma@7").
 */
export function specName(spec: string): string {
  const at = spec.indexOf("@", 1);
  return at === -1 ? spec : spec.slice(0, at);
}