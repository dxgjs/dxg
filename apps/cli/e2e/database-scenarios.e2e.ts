/**
 * E2E state, conflict & native scenarios — real `dxg add database`
 * against projects in every meaningful pre-state: existing Prisma
 * projects (§14), empty prisma/ (§15), existing generated files and
 * --force (§16), existing .env (§17), incompatible Prisma versions
 * (§18), the REAL sqlite native-dependency chain (§19), custom helper
 * paths (§10) and the real seed configuration + execution (§12).
 *
 * pnpm carries the cross-cutting rows (the repo's own manager); npm
 * carries the sqlite native chain (its allowScripts pre-approval is
 * the strongest real native-build proof). All installs are real.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
  CLI_BIN,
  bootstrapProject,
  depSection,
  installedVersion,
  listDir,
  mustExist,
  pmAvailable,
  readJson,
  readText,
  runDxg,
  runDriver,
  runNode,
  runPM,
  scriptSection,
  sha,
  snapshotUserFiles,
  unwrapped,
  withProject,
} from "./_helpers";

describe("E2E: dxg add database — state, conflict & native scenarios", () => {
  test("bin entry executes even when the spawning environment carries VITEST", async () => {
    await withProject("vitest-env-guard", async (dir) => {
      // A bare manifest is enough for --dry-run — it plans without installing.
      writeFileSync(
        path.join(dir, "package.json"),
        '{"name":"e2e-fixture","version":"0.0.0","private":true}',
        "utf8",
      );
      // Regression (context-construction mechanism): dist skips
      // program.parse() when VITEST is set — a guard meant for unit-test
      // IMPORTS of the module. A SPAWNED bin inherits its parent env, so a
      // vitest-spawned CLI (or any tooling exporting VITEST) used to exit 0
      // with EMPTY stdout, doing nothing. The explicit env pins the
      // regression regardless of the runner.
      const run = await runNode(
        CLI_BIN,
        [
          "add",
          "database",
          "--provider",
          "postgresql",
          "--non-interactive",
          "--dry-run",
        ],
        { cwd: dir, env: { VITEST: "true" } },
      );
      expect(
        run.code,
        `dxg exited ${run.code}\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`,
      ).toBe(0);
      expect(run.stdout).toContain("Operation Summary");
      expect(run.stdout).toContain("Database setup completed for postgresql");
    });
  });

  test("existing fully-configured project is reconciled, never overwritten", async (ctx) => {
    if (!(await pmAvailable("pnpm"))) {
      return ctx.skip("pnpm is not installed on this machine");
    }
    await withProject("existing-pnpm", async (dir) => {
      // A complete, user-customized Prisma project (declared at the
      // verified pin, real install).
      await bootstrapProject(dir, "pnpm", {
        devDependencies: { prisma: "7.10.0", "@types/pg": "^8" },
        dependencies: {
          "@prisma/client": "7.10.0",
          pg: "^8",
          dotenv: "^16",
        },
      });
      mkdirSync(path.join(dir, "prisma"), { recursive: true });
      mkdirSync(path.join(dir, "lib"), { recursive: true });
      writeFileSync(
        path.join(dir, "prisma", "schema.prisma"),
        [
          "// USER-OWNED schema — must survive dxg",
          "generator client {",
          '  provider = "prisma-client"',
          '  output = "../lib/generated/prisma"',
          "}",
          "",
          "datasource db {",
          '  provider = "postgresql"',
          "}",
          "",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        path.join(dir, "prisma7.config.ts"),
        [
          "// USER-OWNED config — must survive dxg",
          'import { defineConfig } from "prisma/config";',
          "export default defineConfig({",
          '  schema: "prisma/schema.prisma",',
          "  migrations: {",
          '    path: "custom/migrations",',
          "  },",
          '  seed: "node custom-seed.js",',
          "});",
          "",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        path.join(dir, "lib", "prisma.ts"),
        "// USER-OWNED helper — must survive dxg\nexport const db = 1;\n",
        "utf8",
      );
      writeFileSync(
        path.join(dir, ".env"),
        'CUSTOM_VAR=hello\nDATABASE_URL="postgresql://keepme@localhost:5432/custom"\n',
        "utf8",
      );

      const before = snapshotUserFiles(dir);
      const run = await runDxg(dir, [
        "--provider",
        "postgresql",
        "--non-interactive",
      ]);
      expect(
        run.code,
        `dxg exited ${run.code}\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`,
      ).toBe(0);

      // §14: every user-owned file survives byte-for-byte — the custom
      // seed entry included (no seed selected → config untouched).
      expect(snapshotUserFiles(dir)).toEqual(before);
      expect(readText(dir, "prisma7.config.ts")).toContain("custom-seed.js");
      expect(readText(dir, "prisma/schema.prisma")).toContain(
        "USER-OWNED schema",
      );
      expect(readText(dir, "lib/prisma.ts")).toContain("USER-OWNED helper");
      expect(readText(dir, ".env")).toContain('DATABASE_URL="postgresql://keepme');

      // Reconciled manifest: pins untouched, adapter self-healed in,
      // recommended scripts added.
      const pkg = readJson(dir, "package.json");
      expect(depSection(pkg, "devDependencies").prisma).toBe("7.10.0");
      expect(depSection(pkg, "dependencies")["@prisma/client"]).toBe("7.10.0");
      expect(
        depSection(pkg, "dependencies")["@prisma/adapter-pg"],
      ).toBeDefined();
      expect(scriptSection(pkg)["db:generate"]).toBe("prisma generate");
      expect(Object.keys(scriptSection(pkg)).filter((s) => s.startsWith("db:"))).toHaveLength(4);

      // generate still ran — against the USER schema's declared output.
      expect(mustExist(dir, "lib/generated/prisma/client.ts")).toContain(
        "PrismaClient",
      );
      // The satisfied skip is visible (no Prisma reinstall) — said
      // content, not the pipe-width box wrapping (unwrapped()).
      expect(unwrapped(run.stdout)).toContain("already declared at the verified pin");
    });
  });

  test("a dxg-produced project reruns as a no-op: init and installs skipped", async (ctx) => {
    if (!(await pmAvailable("npm"))) {
      return ctx.skip("npm is not installed on this machine");
    }
    await withProject("rerun-noop-npm", async (dir) => {
      await bootstrapProject(dir, "npm");
      const run1 = await runDxg(dir, [
        "--provider",
        "postgresql",
        "--non-interactive",
      ]);
      expect(
        run1.code,
        `dxg exited ${run1.code}\nSTDOUT:\n${run1.stdout}\nSTDERR:\n${run1.stderr}`,
      ).toBe(0);
      // Run 1 initialized Prisma for real — the init-skip summary line
      // must NOT be there yet. Same normalized view as the rerun
      // assertion below: a raw not.toContain could pass for the wrong
      // reason if the skip line were present but box-wrapped.
      expect(unwrapped(run1.stdout)).not.toContain(
        "(schema.prisma or prisma7.config.ts already exists)",
      );

      const pkg1 = readJson(dir, "package.json");
      const lock1 = sha(readText(dir, "package-lock.json"));
      const snapshot1 = snapshotUserFiles(dir);

      // THE rerun: same command, dxg-produced state. Context is rebuilt
      // from scratch with the filesystem rooted at the project — the
      // inspection must see run 1's files and skip what they satisfy.
      const run2 = await runDxg(dir, [
        "--provider",
        "postgresql",
        "--non-interactive",
      ]);
      expect(
        run2.code,
        `dxg exited ${run2.code}\nSTDOUT:\n${run2.stdout}\nSTDERR:\n${run2.stderr}`,
      ).toBe(0);
      console.log(
        `[e2e] rerun timings — fresh run: ${run1.ms}ms, rerun: ${run2.ms}ms`,
      );
      // Init skipped — surfaced in the operation summary. Both skip
      // lines wrap inside the ~80-column Clack box under the spawned
      // pipe; assert on the said content (unwrapped()).
      expect(unwrapped(run2.stdout)).toContain(
        "Prisma initialization (schema.prisma or prisma7.config.ts already exists)",
      );
      // No reinstall — the pins run 1 wrote are already satisfied.
      expect(unwrapped(run2.stdout)).toContain("already declared at the verified pin");
      // No user-facing file mutated by the rerun.
      expect(snapshotUserFiles(dir)).toEqual(snapshot1);
      // npm never ran again: lockfile byte-identical, manifest unchanged.
      expect(sha(readText(dir, "package-lock.json"))).toBe(lock1);
      expect(readJson(dir, "package.json")).toEqual(pkg1);
    });
  });

  test("empty prisma/ fails fast with zero mutations", async (ctx) => {
    if (!(await pmAvailable("pnpm"))) {
      return ctx.skip("pnpm is not installed on this machine");
    }
    await withProject("empty-prisma", async (dir) => {
      await bootstrapProject(dir, "pnpm");
      // The unrecoverable state: prisma/ exists, schema.prisma does not.
      mkdirSync(path.join(dir, "prisma"));
      writeFileSync(path.join(dir, "prisma", "notes.txt"), "leftover\n");

      const pkgBefore = sha(readText(dir, "package.json"));
      const lockBefore = sha(readText(dir, "pnpm-lock.yaml"));
      const run = await runDxg(dir, [
        "--provider",
        "postgresql",
        "--non-interactive",
      ]);

      // §15: explicit failure, and NOTHING was mutated.
      expect(run.code, `${run.stdout}\n${run.stderr}`).toBe(1);
      expect(`${run.stdout}\n${run.stderr}`).toMatch(/contains no schema/i);
      expect(sha(readText(dir, "package.json"))).toBe(pkgBefore);
      expect(sha(readText(dir, "pnpm-lock.yaml"))).toBe(lockBefore);
      expect(existsSync(path.join(dir, "prisma7.config.ts"))).toBe(false);
      expect(existsSync(path.join(dir, "lib"))).toBe(false);
    });
  });

  test("incompatible Prisma 6.x fails fast with zero mutations", async (ctx) => {
    if (!(await pmAvailable("pnpm"))) {
      return ctx.skip("pnpm is not installed on this machine");
    }
    await withProject("prisma-6", async (dir) => {
      // Really installs prisma 6.x — the gate has something real to see.
      // 6.9.0: the highest 6.x still published (6.10+ were unpublished from
      // the registry — 6.20.0 now resolves to E404).
      await bootstrapProject(dir, "pnpm", {
        devDependencies: { prisma: "6.9.0" },
      });
      const pkgBefore = sha(readText(dir, "package.json"));

      const run = await runDxg(dir, [
        "--provider",
        "postgresql",
        "--non-interactive",
      ]);

      // §18: fail-fast BEFORE any mutation — the declared version is
      // never silently flipped.
      expect(run.code, `${run.stdout}\n${run.stderr}`).toBe(1);
      expect(`${run.stdout}\n${run.stderr}`).toMatch(/Prisma version conflict/i);
      expect(sha(readText(dir, "package.json"))).toBe(pkgBefore);
      expect(
        depSection(readJson(dir, "package.json"), "devDependencies").prisma,
      ).toBe("6.9.0");
      expect(installedVersion(dir, "prisma", "pnpm")).toBe("6.9.0");
      expect(existsSync(path.join(dir, "prisma"))).toBe(false);
    });
  });

  test("existing .env with DATABASE_URL is preserved byte-for-byte", async (ctx) => {
    if (!(await pmAvailable("pnpm"))) {
      return ctx.skip("pnpm is not installed on this machine");
    }
    await withProject("env-preserved", async (dir) => {
      await bootstrapProject(dir, "pnpm");
      const envBefore =
        'CUSTOM_VAR=hello\nOTHER="quoted value"\nDATABASE_URL="postgresql://keepme@localhost:5432/custom"\n';
      writeFileSync(path.join(dir, ".env"), envBefore, "utf8");

      const run = await runDxg(dir, [
        "--provider",
        "postgresql",
        "--non-interactive",
      ]);
      expect(run.code).toBe(0);
      // §17: user values survive, no silent replacement.
      expect(readText(dir, ".env")).toBe(envBefore);
    });
  });

  test(".env without DATABASE_URL gets an appended line, existing bytes preserved", async (ctx) => {
    if (!(await pmAvailable("pnpm"))) {
      return ctx.skip("pnpm is not installed on this machine");
    }
    await withProject("env-appended", async (dir) => {
      await bootstrapProject(dir, "pnpm");
      const envBefore = "CUSTOM_VAR=hello\nOTHER=2\n";
      writeFileSync(path.join(dir, ".env"), envBefore, "utf8");

      const run = await runDxg(dir, [
        "--provider",
        "postgresql",
        "--non-interactive",
      ]);
      expect(run.code).toBe(0);
      const after = readText(dir, ".env");
      // §17: append-only — every original byte first, then the new line.
      expect(after.startsWith(envBefore)).toBe(true);
      expect(after).toMatch(/DATABASE_URL=/);
    });
  });

  test("modified helper file is a preserved conflict; --force overwrites it", async (ctx) => {
    if (!(await pmAvailable("pnpm"))) {
      return ctx.skip("pnpm is not installed on this machine");
    }
    await withProject("conflict-force", async (dir) => {
      await bootstrapProject(dir, "pnpm");
      const run1 = await runDxg(dir, [
        "--provider",
        "postgresql",
        "--non-interactive",
      ]);
      expect(run1.code).toBe(0);
      const helperPath = path.join(dir, "lib", "prisma.ts");

      // User modification — must be protected from silent overwrite (§16).
      const modified = `${readText(dir, "lib/prisma.ts")}\n// user edit\n`;
      writeFileSync(helperPath, modified, "utf8");

      const run2 = await runDxg(dir, [
        "--provider",
        "postgresql",
        "--non-interactive",
      ]);
      expect(run2.code).toBe(0);
      expect(readText(dir, "lib/prisma.ts")).toBe(modified);
      // The conflict is surfaced in the operation summary.
      expect(run2.stdout).toMatch(/lib\/prisma\.ts/);

      // --force resolves it with a controlled overwrite (§16).
      const run3 = await runDxg(dir, [
        "--provider",
        "postgresql",
        "--non-interactive",
        "--force",
      ]);
      expect(run3.code).toBe(0);
      const forced = readText(dir, "lib/prisma.ts");
      expect(forced).not.toContain("// user edit");
      expect(forced).toMatch(/from "\.\/generated\/prisma\/client"/);
    });
  });

  test("sqlite full chain: real native binding + db:push + real db:seed (npm)", async (ctx) => {
    if (!(await pmAvailable("npm"))) {
      return ctx.skip("npm is not installed on this machine");
    }
    await withProject("sqlite-native-npm", async (dir) => {
      await bootstrapProject(dir, "npm");
      // Driver: the CLI has no flags for script selection — db:push and
      // db:seed are opt-in, so the pre-resolved array form drives them.
      const run = await runDriver(dir, {
        provider: "sqlite",
        installPrismaSkills: false,
        databaseScripts: ["db:generate", "db:push", "db:seed"],
        helperPath: "lib/prisma.ts",
      });
      expect(
        run.code,
        `driver exited ${run.code}\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`,
      ).toBe(0);

      // Manifest: seed script wired, tsx runner added, native deps pinned.
      const pkg = readJson(dir, "package.json");
      expect(scriptSection(pkg)["db:seed"]).toBe("prisma db seed");
      expect(scriptSection(pkg)["db:push"]).toBe("prisma db push");
      expect(depSection(pkg, "devDependencies").tsx).toBeDefined();
      expect(depSection(pkg, "devDependencies").prisma).toBe("7.10.0");
      expect(depSection(pkg, "dependencies")["better-sqlite3"]).toBe(
        "^12.6.0",
      );

      // §19: the REAL native binding — npm's allowScripts pre-approval
      // must have let better-sqlite3's install script run and compile.
      mustExist(
        dir,
        "node_modules/better-sqlite3/build/Release/better_sqlite3.node",
      );
      const load = await runPM(
        "node",
        ["-e", "require('better-sqlite3');console.log('binding-ok')"],
        { cwd: dir, timeoutMs: 120_000 },
      );
      expect(load.code, `${load.stdout}\n${load.stderr}`).toBe(0);
      expect(load.stdout).toContain("binding-ok");

      // §12 config chain: prisma/seed.ts + migrations.seed really wired.
      const config = mustExist(dir, "prisma7.config.ts");
      expect(config).toContain('seed: "tsx prisma/seed.ts"');
      const seedFile = mustExist(dir, "prisma/seed.ts");
      expect(seedFile).toContain('from "../lib/prisma"');

      // Real db:push — the real schema engine applies the schema to the
      // sqlite file (needs @prisma/engines' approved postinstall download).
      const push = await runPM("npm", ["run", "db:push"], {
        cwd: dir,
        timeoutMs: 5 * 60_000,
      });
      expect(push.code, `db:push\n${push.stdout}\n${push.stderr}`).toBe(0);
      expect(
        existsSync(path.join(dir, "prisma", "dev.db"))
        || existsSync(path.join(dir, "dev.db")),
      ).toBe(true);

      // §12 REAL seed execution: tsx runs prisma/seed.ts through the
      // real better-sqlite3 adapter — no external server needed.
      const seed = await runPM("npm", ["run", "db:seed"], {
        cwd: dir,
        timeoutMs: 5 * 60_000,
      });
      expect(seed.code, `db:seed\n${seed.stdout}\n${seed.stderr}`).toBe(0);
      expect(seed.stdout).toContain("Seed script ready");
    });
  });

  test("sqlite on pnpm: commanded range survives in manifest AND lockfile (frozen-lockfile CI contract)", async (ctx) => {
    // H-4 regression (audit 2026-10-11): pnpm 12.5.1 bumps a commanded
    // RANGE on save (`better-sqlite3@^12.6.0` → `^12.11.1` in both
    // manifest and lockfile — live-proven), reconcile restores the
    // manifest, and the lockfile-only resync resynchronizes the
    // lockfile. Without the resync, CI's `pnpm install
    // --frozen-lockfile` dies with ERR_PNPM_OUTDATED_LOCKFILE
    // (live-proven on the audit reference project: lockfile ^12.11.1
    // vs manifest ^12.6.0). The fresh matrix's pg rows never install
    // better-sqlite3 — this row is where the range drift is real.
    if (!(await pmAvailable("pnpm"))) {
      return ctx.skip("pnpm is not installed on this machine");
    }
    await withProject("sqlite-native-pnpm", async (dir) => {
      await bootstrapProject(dir, "pnpm");
      const run = await runDriver(dir, {
        provider: "sqlite",
        installPrismaSkills: false,
        databaseScripts: ["db:generate", "db:push"],
        helperPath: "lib/prisma.ts",
      });
      expect(
        run.code,
        `driver exited ${run.code}\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`,
      ).toBe(0);

      // Manifest states the commanded range — not pnpm's latest-match
      // rewrite (the adapter's pin, verified against ^12.6.0).
      const pkg = readJson(dir, "package.json");
      expect(depSection(pkg, "dependencies")["better-sqlite3"]).toBe(
        "^12.6.0",
      );
      expect(depSection(pkg, "devDependencies").prisma).toBe("7.10.0");

      // Lockfile agrees: the importers entry carries the SAME specifier
      // — the exact spot the drift sat before the fix.
      const lock = readText(dir, "pnpm-lock.yaml");
      expect(lock).toMatch(/better-sqlite3:\s*\r?\n\s+specifier: \^12\.6\.0/);

      // The CI contract, executed: a frozen install must pass on the
      // state DXG leaves behind.
      const frozen = await runPM("pnpm", ["install", "--frozen-lockfile"], {
        cwd: dir,
        timeoutMs: 5 * 60_000,
      });
      expect(
        frozen.code,
        `frozen-lockfile exited ${frozen.code}\nSTDOUT:\n${frozen.stdout}\nSTDERR:\n${frozen.stderr}`,
      ).toBe(0);
    });
  });

  test("custom helper paths stay inside the project with coherent output/import", async (ctx) => {
    if (!(await pmAvailable("pnpm"))) {
      return ctx.skip("pnpm is not installed on this machine");
    }
    await withProject("custom-helpers", async (root) => {
      // Two nested projects under one isolated root: the root listing is
      // the escape proof — nothing may appear outside the projects.
      for (const helper of ["src/prisma.ts", "custom/prisma.ts"]) {
        const dir = path.join(root, `proj-${helper.split("/")[0]}`);
        mkdirSync(dir, { recursive: true });
        await bootstrapProject(dir, "pnpm");
        const run = await runDriver(dir, {
          provider: "postgresql",
          installPrismaSkills: false,
          databaseScripts: "recommended",
          helperPath: helper,
        });
        expect(
          run.code,
          `driver (${helper}) exited ${run.code}\nSTDOUT:\n${run.stdout}\nSTDERR:\n${run.stderr}`,
        ).toBe(0);

        // §10 chain: helper path → generator output → real generated
        // client → import — all coherent, nothing outside the root.
        const helperFile = mustExist(dir, helper);
        expect(helperFile).toMatch(/from "\.\/generated\/prisma\/client"/);
        const outputDir = helper.replace(/\/[^/]+$/, "/generated/prisma");
        expect(mustExist(dir, `${outputDir}/client.ts`)).toContain(
          "PrismaClient",
        );
        // Prisma 7's `init --output` writes the generator block with
        // aligned "=" signs (`provider = `, `output   = `) —
        // live-verified with a bare prisma init, no dxg involved
        // (dxg-probe-output-fmt, 2026-10-10). Prove the declared
        // output VALUE, not prisma's column alignment.
        const escapedOutputDir = outputDir.replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        expect(readText(dir, "prisma/schema.prisma")).toMatch(
          new RegExp(`output\\s+=\\s+"\\.\\./${escapedOutputDir}"`),
        );
      }
      // Escape proof: the isolated root holds exactly the two projects —
      // no `generated/`, no `lib/`, nothing written above any project.
      expect(listDir(root)).toEqual(["proj-custom", "proj-src"]);
    });
  });

  test("postgres seed configured end-to-end and really executable (lazy pg)", async (ctx) => {
    if (!(await pmAvailable("pnpm"))) {
      return ctx.skip("pnpm is not installed on this machine");
    }
    await withProject("seed-postgres", async (dir) => {
      await bootstrapProject(dir, "pnpm");
      const run = await runDriver(dir, {
        provider: "postgresql",
        installPrismaSkills: false,
        databaseScripts: ["db:generate", "db:seed"],
        helperPath: "lib/prisma.ts",
      });
      expect(run.code).toBe(0);

      // §12 configuration chain, for real.
      const pkg = readJson(dir, "package.json");
      expect(scriptSection(pkg)["db:seed"]).toBe("prisma db seed");
      expect(depSection(pkg, "devDependencies").tsx).toBeDefined();
      expect(mustExist(dir, "prisma7.config.ts")).toContain(
        'seed: "tsx prisma/seed.ts"',
      );
      expect(mustExist(dir, "prisma/seed.ts")).toContain(
        'from "../lib/prisma"',
      );

      // §12 REAL execution — the seed template runs no queries and the
      // pg adapter is lazy, so it must complete WITHOUT a PostgreSQL
      // server (a documented property this run proves).
      const seed = await runPM("pnpm", ["run", "db:seed"], {
        cwd: dir,
        timeoutMs: 5 * 60_000,
      });
      expect(seed.code, `db:seed\n${seed.stdout}\n${seed.stderr}`).toBe(0);
      expect(seed.stdout).toContain("Seed script ready");
    });
  });
});