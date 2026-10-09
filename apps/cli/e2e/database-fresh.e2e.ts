/**
 * E2E matrix — `dxg add database` on REAL projects, one row per
 * officially supported package manager (npm, pnpm, yarn classic, yarn
 * berry, bun — the installer's PackageManagerAgent union).
 *
 * Each row is a complete proof chain: real bootstrap install → real
 * DXG CLI run → real dependency installation → real prisma init →
 * REAL generated client → script wiring (db:generate run for real) →
 * second DXG run proving idempotence on disk. Nothing is mocked.
 */
import { describe, expect, test } from "vitest";
import {
  bootstrapProject,
  depSection,
  installedVersion,
  mustExist,
  PM_COMMAND,
  pmAvailable,
  readJson,
  runDxg,
  runPM,
  scriptSection,
  snapshotUserFiles,
  withProject,
  type E2EPm,
} from "./_helpers";

const RECOMMENDED_SCRIPTS: Record<string, string> = {
  "db:generate": "prisma generate",
  "db:push": "prisma db push",
  "db:studio": "prisma studio",
  "db:pull": "prisma db pull",
};

const MATRIX: E2EPm[] = [
  "npm",
  "pnpm",
  "yarn-classic",
  "yarn-berry",
  "bun",
];

interface FreshTimings {
  bootMs: number;
  dxg1Ms: number;
  genMs: number;
  dxg2Ms: number;
}

/** The full fresh-project proof chain for one package manager. */
async function freshScenario(pm: E2EPm, dir: string): Promise<FreshTimings> {
  // 1. Real bootstrap: manifest + real `<pm> install` (lockfile → agent
  // detection has something real to detect).
  const bootMs = await bootstrapProject(dir, pm);

  // 2. The REAL CLI, non-interactive, PostgreSQL (§7 main path).
  const run1 = await runDxg(dir, ["--provider", "postgresql", "--non-interactive"]);
  expect(
    run1.code,
    `dxg run 1 exited ${run1.code}\nSTDOUT:\n${run1.stdout}\nSTDERR:\n${run1.stderr}`,
  ).toBe(0);

  // 3. Prisma-owned artifacts on disk.
  const schema = mustExist(dir, "prisma/schema.prisma");
  expect(schema).toContain('provider = "postgresql"');
  expect(schema).toContain("generator client");
  const config = mustExist(dir, "prisma7.config.ts");
  expect(config).toContain("migrations");
  expect(mustExist(dir, ".env")).toMatch(/DATABASE_URL/);

  // 4. DXG-owned helper + the Phase 1 output/import coherence chain:
  // the import inside lib/prisma.ts must point at the client that was
  // REALLY generated.
  const helper = mustExist(dir, "lib/prisma.ts");
  expect(helper).toContain("PrismaPg");
  expect(helper).toMatch(/from "\.\/generated\/prisma\/client"/);
  const client = mustExist(dir, "lib/generated/prisma/client.ts");
  expect(client).toContain("PrismaClient");

  // 5. Manifest pins + recommended scripts (no dup).
  const pkg1 = readJson(dir, "package.json");
  expect(depSection(pkg1, "devDependencies").prisma).toBe("7.10.0");
  expect(depSection(pkg1, "dependencies")["@prisma/client"]).toBe("7.10.0");
  expect(scriptSection(pkg1)).toMatchObject(RECOMMENDED_SCRIPTS);
  expect(
    Object.keys(scriptSection(pkg1)).filter((s) => s.startsWith("db:")),
  ).toHaveLength(4);

  // 6. The versions REALLY installed (node_modules / yarn.lock for PnP).
  expect(installedVersion(dir, "prisma", pm)).toBe("7.10.0");
  expect(installedVersion(dir, "@prisma/client", pm)).toBe("7.10.0");

  // 7. Script wiring proof: run db:generate through the package manager
  // for real — the generated script must actually work.
  const gen = await runPM(PM_COMMAND[pm], ["run", "db:generate"], {
    cwd: dir,
    timeoutMs: 5 * 60_000,
  });
  expect(
    gen.code,
    `db:generate exited ${gen.code}\nSTDOUT:\n${gen.stdout}\nSTDERR:\n${gen.stderr}`,
  ).toBe(0);

  // 8. Idempotence (§13): the second REAL run must reconcile, not redo —
  // user-owned files byte-stable, manifest semantically stable, the
  // Prisma reinstall skip visible, no duplicated scripts.
  const filesBefore = snapshotUserFiles(dir);
  const pkgBefore = readJson(dir, "package.json");
  const run2 = await runDxg(dir, ["--provider", "postgresql", "--non-interactive"]);
  expect(
    run2.code,
    `dxg run 2 exited ${run2.code}\nSTDOUT:\n${run2.stdout}\nSTDERR:\n${run2.stderr}`,
  ).toBe(0);
  expect(snapshotUserFiles(dir)).toEqual(filesBefore);
  expect(readJson(dir, "package.json")).toEqual(pkgBefore);
  expect(run2.stdout).toContain("already declared at the verified pin");
  expect(
    Object.keys(scriptSection(readJson(dir, "package.json"))).filter((s) =>
      s.startsWith("db:"),
    ),
  ).toHaveLength(4);

  return { bootMs, dxg1Ms: run1.ms, genMs: gen.ms, dxg2Ms: run2.ms };
}

describe("E2E: dxg add database — fresh project matrix (real installs)", () => {
  for (const pm of MATRIX) {
    test(
      `fresh + real generate + idempotence on ${pm}`,
      { timeout: 15 * 60_000 },
      async (ctx) => {
        if (!(await pmAvailable(pm))) {
          return ctx.skip(`${pm} is not installed on this machine`);
        }
        await withProject(`fresh-${pm}`, async (dir) => {
          const timings = await freshScenario(pm, dir);
          console.log(
            `[e2e:${pm}] bootstrap=${timings.bootMs}ms dxg1=${timings.dxg1Ms}ms ` +
              `db:generate=${timings.genMs}ms dxg2=${timings.dxg2Ms}ms`,
          );
        });
      },
    );
  }
});
