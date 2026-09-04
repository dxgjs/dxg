import { describe, expect, test } from "vitest";
import {
  packageNameFromSpec,
  isPnpmIgnoredBuilds,
  parsePnpmIgnoredBuilds,
  isNpmInstallScriptsWarning,
  parseNpmBlockedScripts,
  isBunBlockedPostinstall,
  isYarnDisabledBuildScripts,
  isPackageNotFound,
  isNativeBuildFailed,
  classifyInstallFailure,
  scanBlockedBuilds,
} from "./classify";

// Raw output captured empirically in the labs (pnpm 11.18.0, npm 12.0.1,
// bun 1.3.14 on this machine; yarn signatures are documented berry
// behavior). Tests pin the STABLE markers (error codes, owned line
// prefixes), never full prose — a reworded message must not break detection.

const PNPM_IGNORED_BUILDS = `\
Progress: resolved 46, done
node_modules/.pnpm/@prisma+engines@7.10.0/node_modules/@prisma/engines ERROR: failed to install dependencies

ERROR: Only some dependencies can be installed: node_modules/.pnpm/prisma@7.10.0
...
ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: @prisma/engines@7.10.0, prisma@7.10.0.
Run "pnpm approve-builds" to pick which dependencies should be allowed to run scripts.`;

const NPM_BLOCKED = `\
npm warn install-scripts 2 packages had install scripts blocked because they are not covered by allowScripts:
npm warn install-scripts   prisma@7.10.0 (preinstall: node scripts/preinstall-entry.js)
npm warn install-scripts   better-sqlite3@12.6.0 (install: prebuild-install || node-gyp rebuild)
added 42 packages in 3s`;

const BUN_BLOCKED = `\
+ better-sqlite3@13.0.3
Blocked 1 postinstall. Run \`bun pm untrusted\` for details.
41 packages installed`;

const YARN_BERRY_YN0004 = `\
➤ YN0004: │ @prisma/engines@npm:7.10.0 lists build scripts, but all build scripts have been disabled
Done in 1.2s`;

describe("packageNameFromSpec", () => {
  test("unscoped name keeps everything before the last @", () => {
    expect(packageNameFromSpec("better-sqlite3@^12.6.0")).toBe(
      "better-sqlite3",
    );
  });
  test("pinned unscoped spec", () => {
    expect(packageNameFromSpec("prisma@7.10.0")).toBe("prisma");
  });
  test("scoped spec: the last @ separates name from version", () => {
    expect(packageNameFromSpec("@prisma/engines@7.10.0")).toBe(
      "@prisma/engines",
    );
  });
  test("bare name (no version) is returned unchanged", () => {
    expect(packageNameFromSpec("@types/node")).toBe("@types/node");
    expect(packageNameFromSpec("dotenv")).toBe("dotenv");
  });
});

describe("pnpm ignored-builds signature", () => {
  test("detects the hard error code on stdout", () => {
    expect(isPnpmIgnoredBuilds(PNPM_IGNORED_BUILDS)).toBe(true);
  });
  test("parses deduplicated package names from the list line", () => {
    expect(parsePnpmIgnoredBuilds(PNPM_IGNORED_BUILDS)).toEqual([
      "@prisma/engines",
      "prisma",
    ]);
  });
  test("does not match a healthy install output", () => {
    expect(isPnpmIgnoredBuilds("Progress: resolved 46, done\nDone in 2s"))
      .toBe(false);
  });
});

describe("npm install-scripts warning signature", () => {
  test("detects the warn prefix", () => {
    expect(isNpmInstallScriptsWarning(NPM_BLOCKED)).toBe(true);
  });
  test("parses package names from continuation lines, deduplicated", () => {
    expect(parseNpmBlockedScripts(NPM_BLOCKED)).toEqual([
      "prisma",
      "better-sqlite3",
    ]);
  });
  test("header line (no package id) is not parsed as a name", () => {
    expect(
      parseNpmBlockedScripts(
        "npm warn install-scripts 2 packages had install scripts blocked",
      ),
    ).toEqual([]);
  });
  test("does not match a healthy npm install", () => {
    expect(isNpmInstallScriptsWarning("added 42 packages in 3s")).toBe(false);
  });
});

describe("bun blocked postinstall signature", () => {
  test("matches the singular notice", () => {
    expect(isBunBlockedPostinstall("Blocked 1 postinstall. Run `bun pm untrusted`")).toBe(
      true,
    );
  });
  test("matches the plural notice", () => {
    expect(isBunBlockedPostinstall("Blocked 3 postinstalls. Run `bun pm untrusted`")).toBe(
      true,
    );
  });
  test("does not match a healthy bun install", () => {
    expect(isBunBlockedPostinstall("41 packages installed")).toBe(false);
  });
});

describe("yarn berry YN0004 signature", () => {
  test("detects the disabled-build warning code", () => {
    expect(isYarnDisabledBuildScripts(YARN_BERRY_YN0004)).toBe(true);
  });
  test("does not match other yarn notices", () => {
    expect(isYarnDisabledBuildScripts("➤ YN0000: │ @prisma/client@npm:7.10.0 doesn't satisfy")).toBe(
      false,
    );
  });
});

describe("package-not-found signatures", () => {
  test("pnpm ERR_PNPM_FETCH_404", () => {
    expect(
      isPackageNotFound("ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/failpkg: Not Found"),
    ).toBe(true);
  });
  test("npm E404", () => {
    expect(isPackageNotFound("npm error code E404\nnpm error 404 Not Found")).toBe(
      true,
    );
  });
  test("bun GET - 404", () => {
    expect(isPackageNotFound("error: GET https://registry.npmjs.org/failpkg - 404")).toBe(
      true,
    );
  });
  test("does not match a 200 line or unrelated failure", () => {
    expect(isPackageNotFound("added 42 packages in 3s")).toBe(false);
    expect(isPackageNotFound("gyp: No Xcode or CLang version detected")).toBe(
      false,
    );
  });
});

describe("native-build-failed signatures", () => {
  test("pnpm/npm ELIFECYCLE", () => {
    expect(
      isNativeBuildFailed("…better-sqlite3 install: node-gyp rebuild\nELIFECYCLE  Command failed with exit code 1."),
    ).toBe(true);
  });
  test("execa-style 'Command failed with exit code N'", () => {
    expect(isNativeBuildFailed("Command failed with exit code 2")).toBe(true);
  });
  test("yarn berry 'couldn't be built successfully'", () => {
    expect(
      isNativeBuildFailed(
        "@prisma/engines@npm:7.10.0 couldn't be built successfully (exit code 1)",
      ),
    ).toBe(true);
  });
  test("does not match the pnpm blocked-builds policy error", () => {
    // CRITICAL ordering property: ERR_PNPM_IGNORED_BUILDS is a policy
    // outcome (tree installed), NOT a native build failure.
    expect(isNativeBuildFailed(PNPM_IGNORED_BUILDS)).toBe(false);
  });
});

describe("classifyInstallFailure", () => {
  test("pnpm ignored-builds classifies as build-script-blocked (policy, not broken install)", () => {
    const result = classifyInstallFailure(PNPM_IGNORED_BUILDS, 1, "pnpm");
    expect(result.reason).toBe("build-script-blocked");
    expect(result.suggestion).toContain("pnpm approve-builds");
  });
  test("404 classifies as installation-failed", () => {
    expect(
      classifyInstallFailure(
        "npm error code E404\nnpm error 404 Not Found",
        1,
        "npm",
      ).reason,
    ).toBe("installation-failed");
  });
  test("node-gyp failure classifies as native-build-failed", () => {
    const result = classifyInstallFailure(
      "gyp: No Xcode or CLang version detected\nELIFECYCLE  Command failed with exit code 1.",
      1,
      "npm",
    );
    expect(result.reason).toBe("native-build-failed");
  });
  test("unrecognized non-zero output classifies as unknown", () => {
    expect(classifyInstallFailure("something odd happened", 1, "bun").reason).toBe(
      "unknown",
    );
  });
  test("an ERR_PNPM_IGNORED_BUILDS output never classifies lower than build-script-blocked even mixed with gyp noise", () => {
    const result = classifyInstallFailure(
      `${PNPM_IGNORED_BUILDS}\ngyp error`,
      1,
      "pnpm",
    );
    // Most specific, recoverable policy reason wins over the generic
    // native-build signature.
    expect(result.reason).toBe("build-script-blocked");
  });
});

describe("scanBlockedBuilds (exit 0, the silent-drift hazard)", () => {
  test("npm: parses package names from the warning lines", () => {
    expect(scanBlockedBuilds(NPM_BLOCKED, "npm")).toEqual([
      "prisma",
      "better-sqlite3",
    ]);
  });
  test("bun: returns a placeholder count marker (bun names no packages)", () => {
    expect(scanBlockedBuilds(BUN_BLOCKED, "bun")).toEqual([
      "(bun: unnamed blocked postinstalls)",
    ]);
  });
  test("yarn berry: returns a disabled-scripts marker on YN0004", () => {
    expect(scanBlockedBuilds(YARN_BERRY_YN0004, "yarn@berry")).toEqual([
      "(yarn: build scripts disabled via enableScripts)",
    ]);
  });
  test("pnpm: never scans (it hard-fails instead of exiting 0 silently)", () => {
    expect(scanBlockedBuilds(PNPM_IGNORED_BUILDS, "pnpm")).toEqual([]);
  });
  test("healthy outputs scan to empty for every agent", () => {
    for (const agent of ["npm", "pnpm", "yarn", "yarn@berry", "bun"] as const) {
      expect(scanBlockedBuilds("added 42 packages in 3s", agent)).toEqual([]);
    }
  });
});
