/**
 * Unit tests for the read-only database inspection (decision document,
 * sections 3, 4, 5, 6 of the implementation spec). Everything here runs
 * against an in-memory fs double — no network, no Prisma execution, no
 * writes. The contract under test:
 *
 *   EXACT-MATCH Prisma 7.10.0 policy — 7.0.0/7.2.0 are INCOMPATIBLE (the
 *   CLI silently mis-executes the DXG command contract before 7.10.0),
 *   6.x/8.x are INCOMPATIBLE, ^7.10.0/~7.10.0/>=7.10 <8 are SATISFIED.
 *
 *   Agent-aware installed probe — yarn@berry falls back to an ANCHORED
 *   yarn.lock lookup; `prisma` must never match `@prisma/client`.
 *
 *   Generator output parsing — custom outputs, missing output, root
 *   traversal rejection, legacy datasource detection.
 *
 *   Helper path — normalization, validation, relative import computation.
 */

import { describe, expect, test } from "vitest";
import {
  PRISMA_PINNED_VERSION,
  DEFAULT_GENERATOR_OUTPUT,
  classifyPrismaVersion,
  parseVersion,
  isPackageInstalled,
  parseGeneratorOutput,
  resolveGeneratorOutput,
  schemaHasLegacyDatasource,
  computeRelativeImport,
  normalizeHelperPath,
  validateHelperPath,
  inspectDatabase,
  DEFAULT_HELPER_PATH,
  type DatabaseInspection,
} from "./inspect";
import type { FSInterface } from "../../types";

// Valid Prisma client helper content for sqlite (matches the template output)
// For lib/prisma.ts with default generator output at lib/generated/prisma
const VALID_HELPER_CONTENT_LIB = [
  'import "dotenv/config";',
  'import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";',
  'import { PrismaClient } from "./generated/prisma/client";',
  "",
  "// Fail loudly at import time: a missing DATABASE_URL must never silently",
  "// DXG writes an empty placeholder for",
  "// server providers and adapters are lazy, so the empty string must be",
  "// accepted to allow out-of-the-box db:seed (live-proven 2026-10-11).",
  "const connectionString = process.env.DATABASE_URL;",
  "",
  "if (connectionString === undefined) {",
  '  throw new Error(',
  '    "DATABASE_URL is not set. Add it to your .env file or export it in your environment.",',
  "  );",
  "}",
  "",
  "const adapter = new PrismaBetterSqlite3({ url: connectionString });",
  "const prisma = new PrismaClient({ adapter });",
  "",
  "export { prisma };",
  "",
].join("\n");

// For src/lib/prisma.ts with co-located generator output at src/lib/generated/prisma
const VALID_HELPER_CONTENT_SRC_LIB = [
  'import "dotenv/config";',
  'import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";',
  'import { PrismaClient } from "./generated/prisma/client";',
  "",
  "// Fail loudly at import time: a missing DATABASE_URL must never silently",
  "// DXG writes an empty placeholder for",
  "// server providers and adapters are lazy, so the empty string must be",
  "// accepted to allow out-of-the-box db:seed (live-proven 2026-10-11).",
  "const connectionString = process.env.DATABASE_URL;",
  "",
  "if (connectionString === undefined) {",
  '  throw new Error(',
  '    "DATABASE_URL is not set. Add it to your .env file or export it in your environment.",',
  "  );",
  "}",
  "",
  "const adapter = new PrismaBetterSqlite3({ url: connectionString });",
  "const prisma = new PrismaClient({ adapter });",
  "",
  "export { prisma };",
  "",
].join("\n");

// ---------------------------------------------------------------------------
// In-memory fs double — the minimum surface inspectDatabase touches
// ---------------------------------------------------------------------------

function makeFs(
  files: Record<string, string> = {},
  directories: string[] = [],
): FSInterface {
  const dirs = new Set(directories);
  return {
    // Exact-match semantics (like fs-extra pathExists): a path exists iff
    // it is a known file, a known directory, or the PARENT DIR of a known
    // file — NOT merely "something lives under a known directory".
    pathExists: async (p: string) =>
      p in files ||
      dirs.has(p) ||
      Object.keys(files).some((f) => f.startsWith(`${p}/`)),
    readFile: async (p: string) => (p in files ? files[p] : undefined),
    writeFile: async () => {
      throw new Error("inspection must never write");
    },
    stat: async (p: string) => ({
      isDirectory: () => dirs.has(p),
    }),
    mkdir: async () => {
      throw new Error("inspection must never mkdir");
    },
    readdir: async (p: string) =>
      Object.keys(files)
        .filter((f) => f.startsWith(`${p}/`))
        .map((f) => f.slice(p.length + 1).split("/")[0])
        .concat(
          [...dirs]
            .filter((d) => d.startsWith(`${p}/`))
            .map((d) => d.slice(p.length + 1).split("/")[0]),
        ),
    readJson: async (p: string) =>
      p in files ? (JSON.parse(files[p]) as unknown) : undefined,
    writeJson: async () => {
      throw new Error("inspection must never writeJson");
    },
  } as unknown as FSInterface;
}

// ---------------------------------------------------------------------------
// Version classification — the exact-match Prisma 7.10.0 policy
// ---------------------------------------------------------------------------

describe("parseVersion", () => {
  test("parses plain versions", () => {
    expect(parseVersion("7.10.0")).toEqual({
      major: 7,
      minor: 10,
      patch: 0,
      prerelease: "",
    });
    expect(parseVersion("6.19.3")).toMatchObject({ major: 6, minor: 19 });
  });

  test("keeps prerelease tails", () => {
    expect(parseVersion("8.0.0-rc.13").prerelease).toBe("rc.13");
    expect(
      parseVersion("6.20.0-integration-oidc-truster-publishers.2").prerelease,
    ).toContain("integration");
  });

  test("returns NaN fields for garbage", () => {
    const v = parseVersion("not-a-version");
    expect(Number.isNaN(v.major)).toBe(true);
  });
});

describe("classifyPrismaVersion — exact-match 7.10.0 policy", () => {
  test("exact pin is satisfied", () => {
    expect(classifyPrismaVersion("7.10.0")).toBe("satisfied");
    expect(classifyPrismaVersion(PRISMA_PINNED_VERSION)).toBe("satisfied");
  });

  test("verified ranges containing only the pinned major are satisfied", () => {
    expect(classifyPrismaVersion("^7.10.0")).toBe("satisfied");
    expect(classifyPrismaVersion("~7.10.0")).toBe("satisfied");
    expect(classifyPrismaVersion(">=7.10 <8")).toBe("satisfied");
    expect(classifyPrismaVersion(">=7.10.0 <8.0.0")).toBe("satisfied");
    expect(classifyPrismaVersion(">7.9.0")).toBe("satisfied");
  });

  test("other 7.x are INCOMPATIBLE (7.0.0 mis-executes the command contract)", () => {
    expect(classifyPrismaVersion("7.0.0")).toBe("incompatible");
    expect(classifyPrismaVersion("7.2.0")).toBe("incompatible");
    expect(classifyPrismaVersion("7.9.9")).toBe("incompatible");
  });

  test("6.x and 8.x are INCOMPATIBLE", () => {
    expect(classifyPrismaVersion("6.19.3")).toBe("incompatible");
    expect(classifyPrismaVersion("6.20.0")).toBe("incompatible");
    expect(classifyPrismaVersion("8.0.0")).toBe("incompatible");
    expect(classifyPrismaVersion("8.0.0-rc.13")).toBe("incompatible");
    expect(classifyPrismaVersion("^8.0.0")).toBe("incompatible");
    expect(classifyPrismaVersion("^6.0.0")).toBe("incompatible");
  });

  test("ranges that exclude 7.10.0 are INCOMPATIBLE", () => {
    expect(classifyPrismaVersion("^7.0.0")).toBe("incompatible");
    expect(classifyPrismaVersion("~7.0.0")).toBe("incompatible");
    expect(classifyPrismaVersion("^7.11.0")).toBe("incompatible");
    expect(classifyPrismaVersion(">=7.11 <8")).toBe("incompatible");
  });

  test("wildcards, latest, empty are treated as missing", () => {
    expect(classifyPrismaVersion(undefined)).toBe("missing");
    expect(classifyPrismaVersion("*")).toBe("missing");
    expect(classifyPrismaVersion("latest")).toBe("missing");
    expect(classifyPrismaVersion("")).toBe("missing");
  });

  test("prerelease versions are incompatible (no verified RC contract)", () => {
    expect(classifyPrismaVersion("7.10.0-rc.1")).toBe("incompatible");
  });
});

// ---------------------------------------------------------------------------
// Installed-state probe (agent-aware)
// ---------------------------------------------------------------------------

describe("isPackageInstalled", () => {
  test("npm-style: node_modules/<name>/package.json", async () => {
    const fs = makeFs({ "node_modules/prisma/package.json": "{}" });
    expect(await isPackageInstalled(fs, "npm", "prisma")).toBe(true);
  });

  test("absent package under npm returns false (no lockfile fallback)", async () => {
    const fs = makeFs({ "yarn.lock": '"prisma@npm:7.10.0":\n' });
    // NOT yarn@berry: the lockfile must not be consulted
    expect(await isPackageInstalled(fs, "npm", "prisma")).toBe(false);
  });

  test("yarn@berry PnP: no node_modules, anchored yarn.lock entry found", async () => {
    const fs = makeFs({
      "yarn.lock": '"prisma@npm:7.10.0":\n  version: 7.10.0\n',
    });
    expect(await isPackageInstalled(fs, "yarn@berry", "prisma")).toBe(true);
  });

  test("yarn@berry PnP: absent entry returns false", async () => {
    const fs = makeFs({ "yarn.lock": '"other-package@npm:1.0.0":\n' });
    expect(await isPackageInstalled(fs, "yarn@berry", "prisma")).toBe(false);
  });

  test("yarn@berry PnP: no yarn.lock at all returns false", async () => {
    const fs = makeFs({});
    expect(await isPackageInstalled(fs, "yarn@berry", "prisma")).toBe(false);
  });

  test("FALSE-POSITIVE GUARD: prisma never matches @prisma/client in yarn.lock", async () => {
    // Only @prisma/client is installed — the anchored match must NOT find prisma
    const fs = makeFs({
      "yarn.lock":
        '"@prisma/client@npm:7.10.0":\n  version: 7.10.0\n"@prisma/adapter-pg@npm:7.10.0":\n  version: 7.10.0\n',
    });
    expect(await isPackageInstalled(fs, "yarn@berry", "prisma")).toBe(false);
    expect(await isPackageInstalled(fs, "yarn@berry", "@prisma/client")).toBe(
      true,
    );
  });

  test("yarn@berry node-modules linker: node_modules wins before lockfile", async () => {
    const fs = makeFs({ "node_modules/prisma/package.json": "{}" }, []);
    expect(await isPackageInstalled(fs, "yarn@berry", "prisma")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Generator output parsing
// ---------------------------------------------------------------------------

describe("parseGeneratorOutput", () => {
  test("extracts the output from a generator client block", () => {
    const schema = `datasource db {
  provider = "sqlite"
}

generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"
}`;
    expect(parseGeneratorOutput(schema)).toEqual({
      present: true,
      output: "../lib/generated/prisma",
    });
  });

  test("custom output is extracted verbatim", () => {
    const schema = `generator client {
  provider = "prisma-client"
  output = "../src/generated"
}`;
    expect(parseGeneratorOutput(schema).output).toBe("../src/generated");
  });

  test("generator block without output: present, undefined output", () => {
    const schema = `generator client {\n  provider = "prisma-client"\n}`;
    expect(parseGeneratorOutput(schema)).toEqual({
      present: true,
      output: undefined,
    });
  });

  test("no generator block at all: present=false (generate no-op hazard)", () => {
    const schema = `datasource db {\n  provider = "sqlite"\n}`;
    expect(parseGeneratorOutput(schema)).toEqual({ present: false });
  });
});

describe("resolveGeneratorOutput", () => {
  test("default DXG init output resolves under lib/", () => {
    expect(resolveGeneratorOutput("../lib/generated/prisma")).toBe(
      "lib/generated/prisma",
    );
  });

  test("custom nested output resolves", () => {
    expect(resolveGeneratorOutput("../src/generated/client")).toBe(
      "src/generated/client",
    );
  });

  test("output without ../ stays under prisma/", () => {
    expect(resolveGeneratorOutput("./generated")).toBe("prisma/generated");
    expect(resolveGeneratorOutput("generated")).toBe("prisma/generated");
  });

  test("output escaping the project root is rejected", () => {
    // ../ escapes prisma/ into the root; ../.. pops BELOW the root.
    expect(resolveGeneratorOutput("../../outside")).toBeUndefined();
    expect(resolveGeneratorOutput("../../../escape")).toBeUndefined();
    // Sanity: one level of .. stays valid (lands in the root)
    expect(resolveGeneratorOutput("../lib/generated/prisma")).toBe(
      "lib/generated/prisma",
    );
  });

  test("single ../ escapes prisma/ but stays in root (valid)", () => {
    expect(resolveGeneratorOutput("../custom")).toBe("custom");
  });
});

describe("schemaHasLegacyDatasource", () => {
  test("detects the ≤6 url-in-datasource form (P1012 under Prisma 7)", () => {
    expect(
      schemaHasLegacyDatasource(
        `datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}`,
      ),
    ).toBe(true);
  });

  test("Prisma 7 form (no url) is not legacy", () => {
    expect(
      schemaHasLegacyDatasource(`datasource db {\n  provider = "postgresql"\n}`),
    ).toBe(false);
  });

  test("quoted url literal is not the env() form", () => {
    expect(
      schemaHasLegacyDatasource(
        `datasource db {\n  provider = "sqlite"\n  url = "file:./dev.db"\n}`,
      ),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper path normalization / validation / import computation
// ---------------------------------------------------------------------------

describe("normalizeHelperPath", () => {
  test("empty input resolves to the default", () => {
    expect(normalizeHelperPath(undefined)).toBe("lib/prisma.ts");
    expect(normalizeHelperPath("")).toBe("lib/prisma.ts");
    expect(normalizeHelperPath("   ")).toBe("lib/prisma.ts");
  });

  test("backslashes are normalized to forward slashes", () => {
    expect(normalizeHelperPath("src\\lib\\prisma")).toBe("src/lib/prisma.ts");
  });

  test("leading ./ is stripped and .ts is appended", () => {
    expect(normalizeHelperPath("./lib/prisma")).toBe("lib/prisma.ts");
    expect(normalizeHelperPath("lib/prisma")).toBe("lib/prisma.ts");
  });

  test("trailing / is stripped", () => {
    expect(normalizeHelperPath("lib/")).toBe("lib.ts");
    expect(normalizeHelperPath("src/lib/")).toBe("src/lib.ts");
  });

  test("existing .ts is preserved", () => {
    expect(normalizeHelperPath("lib/prisma.ts")).toBe("lib/prisma.ts");
    expect(normalizeHelperPath("src/db/helper.ts")).toBe("src/db/helper.ts");
  });
});

describe("validateHelperPath", () => {
  test("the default and normal custom paths are accepted", () => {
    expect(validateHelperPath("lib/prisma.ts")).toBeUndefined();
    expect(validateHelperPath("src/lib/prisma.ts")).toBeUndefined();
    expect(validateHelperPath("src/db/client.ts")).toBeUndefined();
  });

  test("absolute paths are rejected", () => {
    expect(validateHelperPath("/lib/prisma.ts")).toBeDefined();
    expect(validateHelperPath("C:\\lib\\prisma.ts")).toBeDefined();
    expect(validateHelperPath("\\\\server\\share\\prisma.ts")).toBeDefined();
  });

  test(".. traversal is rejected", () => {
    expect(validateHelperPath("../lib/prisma.ts")).toBeDefined();
    expect(validateHelperPath("src/../lib/prisma.ts")).toBeDefined();
  });

  test("collisions with Prisma/DXG-owned files are rejected", () => {
    expect(validateHelperPath("prisma/schema.prisma")).toBeDefined();
    expect(validateHelperPath("prisma7.config.ts")).toBeDefined();
    expect(validateHelperPath("prisma/seed.ts")).toBeDefined();
    expect(validateHelperPath(".env")).toBeDefined();
    expect(validateHelperPath("package.json")).toBeDefined();
  });
});

describe("computeRelativeImport", () => {
  test("default helper → default output (the historical literal)", () => {
    expect(computeRelativeImport("lib/prisma.ts", "lib/generated/prisma")).toBe(
      "./generated/prisma/client",
    );
  });

  test("nested helper climbs out with ../", () => {
    expect(
      computeRelativeImport("src/lib/prisma.ts", "lib/generated/prisma"),
    ).toBe("../../lib/generated/prisma/client");
  });

  test("root helper climbs one level", () => {
    expect(computeRelativeImport("helper.ts", "lib/generated/prisma")).toBe(
      "./lib/generated/prisma/client",
    );
  });

  test("custom output next to the helper stays relative", () => {
    expect(
      computeRelativeImport("src/lib/prisma.ts", "src/generated/prisma"),
    ).toBe("../generated/prisma/client");
  });

  test("helper inside the output tree", () => {
    expect(
      computeRelativeImport("lib/generated/helper.ts", "lib/generated/prisma"),
    ).toBe("./prisma/client");
  });
});

// ---------------------------------------------------------------------------
// inspectDatabase — the composite read-only inspection
// ---------------------------------------------------------------------------

function baseFixture(files: Record<string, string>, dirs: string[] = []) {
  return { fs: makeFs(files, dirs) };
}

describe("inspectDatabase", () => {
  test("fresh project: nothing exists, everything missing", async () => {
    const { fs } = baseFixture({
      "package.json": JSON.stringify({ name: "fresh" }),
    });
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.schemaExists).toBe(false);
    expect(insp.configExists).toBe(false);
    expect(insp.prismaDirExists).toBe(false);
    expect(insp.prismaDirEmpty).toBe(false);
    expect(insp.prismaVersion).toBe("missing");
    expect(insp.clientVersion).toBe("missing");
    expect(insp.prismaInstalled).toBe(false);
    expect(insp.clientInstalled).toBe(false);
    expect(insp.envExists).toBe(false);
    expect(insp.generatorOutput).toBe(DEFAULT_GENERATOR_OUTPUT);
    expect(insp.helperCandidates).toEqual([]);
    expect(insp.defaultHelperPath).toBe(DEFAULT_HELPER_PATH);
  });

  test("fully configured project: all gates satisfied", async () => {
    const { fs } = baseFixture({
      "package.json": JSON.stringify({
        devDependencies: { prisma: "7.10.0" },
        dependencies: {
          "@prisma/client": "7.10.0",
          "@prisma/adapter-better-sqlite3": "7.10.0",
          "better-sqlite3": "^12.6.0",
          dotenv: "^16.4.5",
        },
      }),
      "prisma/schema.prisma":
        'generator client {\n  provider = "prisma-client"\n  output = "../lib/generated/prisma"\n}\ndatasource db {\n  provider = "sqlite"\n}',
      "prisma7.config.ts": 'import "dotenv/config";\n',
      ".env": 'DATABASE_URL="file:./dev.db"\n',
      "lib/prisma.ts": VALID_HELPER_CONTENT_LIB,
      "node_modules/prisma/package.json": "{}",
      "node_modules/@prisma/client/package.json": "{}",
    });
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.schemaExists).toBe(true);
    expect(insp.configExists).toBe(true);
    expect(insp.schemaHasGenerator).toBe(true);
    expect(insp.generatorOutput).toBe("lib/generated/prisma");
    expect(insp.datasourceLegacyForm).toBe(false);
    expect(insp.prismaVersion).toBe("satisfied");
    expect(insp.clientVersion).toBe("satisfied");
    expect(insp.prismaInstalled).toBe(true);
    expect(insp.clientInstalled).toBe(true);
    expect(insp.envExists).toBe(true);
    expect(insp.envHasDatabaseUrl).toBe(true);
    expect(insp.helperCandidates).toEqual(["lib/prisma.ts"]);
  });

  test("empty prisma/ dir without schema is flagged (early-fail gate)", async () => {
    const { fs } = baseFixture({ "package.json": "{}" }, ["prisma"]);
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.prismaDirExists).toBe(true);
    expect(insp.prismaDirEmpty).toBe(true);
  });

  test("prisma/ with schema is not flagged empty", async () => {
    const { fs } = baseFixture(
      {
        "package.json": "{}",
        "prisma/schema.prisma":
          'generator client {\n  provider = "prisma-client"\n  output = "../lib/generated/prisma"\n}',
      },
      ["prisma"],
    );
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.prismaDirEmpty).toBe(false);
    expect(insp.schemaExists).toBe(true);
  });

  test("prisma@6 declared → incompatible (conflict gate input)", async () => {
    const { fs } = baseFixture({
      "package.json": JSON.stringify({
        devDependencies: { prisma: "^6.19.3" },
      }),
    });
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.prismaVersion).toBe("incompatible");
    expect(insp.prismaDeclaredSpec).toBe("^6.19.3");
  });

  test("prisma@7.0.0 declared → incompatible (silently mis-executes)", async () => {
    const { fs } = baseFixture({
      "package.json": JSON.stringify({
        devDependencies: { prisma: "7.0.0" },
      }),
    });
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.prismaVersion).toBe("incompatible");
  });

  test("legacy datasource url form is detected", async () => {
    const { fs } = baseFixture({
      "package.json": "{}",
      "prisma/schema.prisma":
        'datasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}',
    });
    const insp = await inspectDatabase({ fs }, "postgresql");
    expect(insp.datasourceLegacyForm).toBe(true);
  });

  test("custom generator output is parsed and resolved", async () => {
    const { fs } = baseFixture({
      "package.json": "{}",
      "prisma/schema.prisma":
        'generator client {\n  provider = "prisma-client"\n  output = "../src/generated"\n}',
    });
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.generatorOutput).toBe("src/generated");
  });

  test("output escaping the root is flagged, fallback retained", async () => {
    const { fs } = baseFixture({
      "package.json": "{}",
      "prisma/schema.prisma":
        'generator client {\n  provider = "prisma-client"\n  output = "../../outside"\n}',
    });
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.generatorOutputEscapesRoot).toBe(true);
    expect(insp.generatorOutput).toBe(DEFAULT_GENERATOR_OUTPUT);
  });

  test(".env without DATABASE_URL is reported (append gate input)", async () => {
    const { fs } = baseFixture({
      "package.json": "{}",
      ".env": 'OTHER="keep-me"\n',
    });
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.envExists).toBe(true);
    expect(insp.envHasDatabaseUrl).toBe(false);
  });

  test("export-prefixed DATABASE_URL counts (dotenv/shell convention)", async () => {
    const { fs } = baseFixture({
      "package.json": "{}",
      ".env": "export DATABASE_URL='file:./dev.db'\n",
    });
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.envHasDatabaseUrl).toBe(true);
  });

  test("provider non-Prisma dependencies missing are listed", async () => {
    const { fs } = baseFixture({
      "package.json": JSON.stringify({
        devDependencies: { prisma: "7.10.0", "@types/node": "^22" },
      }),
    });
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.providerDependenciesMissing).toContain(
      "@prisma/adapter-better-sqlite3",
    );
    expect(insp.providerDependenciesMissing).toContain("better-sqlite3");
    expect(insp.providerDependenciesMissing).toContain("dotenv");
    // Prisma itself is classified separately, never listed here
    expect(insp.providerDependenciesMissing).not.toContain("prisma");
  });

  test("both helper candidates are reported when both exist", async () => {
    const { fs } = baseFixture({
      "package.json": "{}",
      "lib/prisma.ts": VALID_HELPER_CONTENT_LIB,
      "src/lib/prisma.ts": VALID_HELPER_CONTENT_SRC_LIB,
    });
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.helperCandidates).toEqual([
      "lib/prisma.ts",
      "src/lib/prisma.ts",
    ]);
  });

  test("missing package.json does not crash the inspection", async () => {
    const fs = makeFs({});
    const insp = await inspectDatabase({ fs }, "sqlite");
    expect(insp.prismaVersion).toBe("missing");
  });

  test("inspection never writes (all write seams throw)", async () => {
    const { fs } = baseFixture({
      "package.json": JSON.stringify({ dependencies: { prisma: "7.10.0" } }),
    });
    // Any write attempt would reject — inspectDatabase must resolve cleanly
    await expect(inspectDatabase({ fs }, "sqlite")).resolves.toBeTruthy();
  });
});

// Type re-export guard: DatabaseInspection stays part of the domain API
test("DatabaseInspection type is exported", () => {
  const insp = {} as DatabaseInspection;
  expect(insp.schemaExists).toBeUndefined();
});
