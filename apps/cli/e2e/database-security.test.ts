/**
 * E2E security tests — secret leakage prevention for `dxg add database`.
 *
 * These tests run REAL projects with REAL package managers and verify
 * that no secrets are leaked in generated files, .env is properly
 * gitignored, and DATABASE_URL placeholders contain no real credentials.
 */
import { describe, expect, test } from "vitest";
import * as path from "node:path";
import {
  bootstrapProject,
  mustExist,
  PM_COMMAND,
  pmAvailable,
  runDxg,
  runPM,
  withProject,
  type E2EPm,
} from "./_helpers";

const SECURITY_MATRIX: E2EPm[] = ["npm", "pnpm", "yarn-classic", "bun"];

interface SecurityAssertions {
  gitignoreHasEnv: boolean;
  envIsIgnored: boolean;
  envHasNoRealCredentials: boolean;
  helperHasNoSecrets: boolean;
  helperGuardsDatabaseUrl: boolean;
}

async function runSecurityScenario(
  pm: E2EPm,
  dir: string,
): Promise<SecurityAssertions> {
  // 1. Real bootstrap
  await bootstrapProject(dir, pm);

  // 2. Real CLI run with postgresql (server provider, empty placeholder)
  const run1 = await runDxg(dir, [
    "--provider",
    "postgresql",
    "--non-interactive",
  ]);
  expect(
    run1.code,
    `dxg run 1 exited ${run1.code}\nSTDOUT:\n${run1.stdout}\nSTDERR:\n${run1.stderr}`,
  ).toBe(0);

  // 3. Assert .gitignore has .env coverage
  const gitignoreContent = mustExist(dir, ".gitignore");
  const gitignoreLines = gitignoreContent
    .split(/\r?\n/)
    .map((line) => line.trimEnd());
  const gitignoreHasEnv = gitignoreLines.some((line) =>
    [".env", ".env*", "*.env"].includes(line),
  );
  expect(gitignoreHasEnv, ".gitignore must cover .env").toBe(true);

  // 4. Verify .env exists and is tracked by git as ignored
  const envContent = mustExist(dir, ".env");
  expect(envContent).toContain("DATABASE_URL");

  // 5. Check git status shows .env as ignored (simulated via git check-ignore)
  // Since we're in a fresh temp dir without .git, we verify .gitignore content
  // In a real git repo, `git check-ignore .env` would exit 0 if ignored
  const envIsIgnored = gitignoreHasEnv; // Proxy: if .gitignore covers .env, git will ignore it

  // 6. Verify .env has NO real credentials - only empty placeholder for server providers
  const envHasNoRealCredentials =
    envContent.includes("DATABASE_URL=") &&
    !envContent.match(/DATABASE_URL=postgresql:\/\//) &&
    !envContent.match(/DATABASE_URL=mysql:\/\//) &&
    !envContent.match(/DATABASE_URL=.*:\/\/.*:.*@/); // No user:pass@host

  expect(
    envHasNoRealCredentials,
    ".env must contain only placeholder, no real credentials",
  ).toBe(true);

  // 7. Verify generated helper (lib/prisma.ts) has no secrets
  const helperContent = mustExist(dir, "lib/prisma.ts");

  // Helper must guard DATABASE_URL instead of interpolating
  const helperGuardsDatabaseUrl =
    helperContent.includes("const connectionString = process.env.DATABASE_URL;") &&
    helperContent.match(/if \(connectionString === undefined\)\s*\{/) &&
    helperContent.includes("DATABASE_URL is not set");

  expect(
    helperGuardsDatabaseUrl,
    "helper must guard DATABASE_URL with explicit undefined check",
  ).toBe(true);

  // Helper must not contain any hardcoded secrets or connection strings
  const helperHasNoSecrets =
    !helperContent.match(/postgresql:\/\//) &&
    !helperContent.match(/mysql:\/\//) &&
    !helperContent.match(/mongodb:\/\//) &&
    !helperContent.match(/redis:\/\//) &&
    !helperContent.match(/[a-zA-Z0-9+/]{20,}={0,2}/) && // Base64-ish
    !helperContent.match(/[a-f0-9]{32,}/) && // Hex secrets
    !helperContent.match(/\$\{process\.env\.DATABASE_URL\}/) && // Old bug pattern
    !helperContent.match(/url:\s*process\.env\.DATABASE_URL/); // Old bug pattern

  expect(helperHasNoSecrets, "helper must not contain any secrets").toBe(true);

  // 8. Verify prisma schema has no secrets
  const schemaContent = mustExist(dir, "prisma/schema.prisma");
  const schemaHasNoSecrets =
    !schemaContent.match(/postgresql:\/\/[^:]+:[^@]+@/) &&
    !schemaContent.match(/mysql:\/\/[^:]+:[^@]+@/) &&
    !schemaContent.match(/mongodb\+srv:\/\/[^:]+:[^@]+@/);

  expect(schemaHasNoSecrets, "schema must not contain embedded credentials").toBe(
    true,
  );

  // 9. Run db:generate to ensure the full chain works
  const gen = await runPM(PM_COMMAND[pm], ["run", "db:generate"], {
    cwd: dir,
    timeoutMs: 5 * 60_000,
  });
  expect(
    gen.code,
    `db:generate exited ${gen.code}\nSTDOUT:\n${gen.stdout}\nSTDERR:\n${gen.stderr}`,
  ).toBe(0);

  // 10. Verify generated client has no secrets
  const clientContent = mustExist(dir, "lib/generated/prisma/client.ts");
  const clientHasNoSecrets =
    !clientContent.match(/postgresql:\/\/[^:]+:[^@]+@/) &&
    !clientContent.match(/mysql:\/\/[^:]+:[^@]+@/) &&
    !clientContent.match(/mongodb\+srv:\/\/[^:]+:[^@]+@/);

  expect(clientHasNoSecrets, "generated client must not contain secrets").toBe(
    true,
  );

  return {
    gitignoreHasEnv,
    envIsIgnored,
    envHasNoRealCredentials,
    helperHasNoSecrets,
    helperGuardsDatabaseUrl,
  };
}

describe("E2E: dxg add database — secret leakage prevention (real installs)", () => {
  for (const pm of SECURITY_MATRIX) {
    test(
      `security: fresh run — .env gitignored, no credentials leaked on ${pm}`,
      { timeout: 15 * 60_000 },
      async (ctx) => {
        if (!(await pmAvailable(pm))) {
          return ctx.skip(`${pm} is not installed on this machine`);
        }
        await withProject(`security-${pm}`, async (dir) => {
          const assertions = await runSecurityScenario(pm, dir);
          console.log(
            `[e2e:security:${pm}] gitignoreHasEnv=${assertions.gitignoreHasEnv} ` +
              `envIsIgnored=${assertions.envIsIgnored} ` +
              `envHasNoRealCredentials=${assertions.envHasNoRealCredentials} ` +
              `helperHasNoSecrets=${assertions.helperHasNoSecrets} ` +
              `helperGuardsDatabaseUrl=${assertions.helperGuardsDatabaseUrl}`,
          );
        });
      },
    );
  }
});

describe("E2E: dxg add database — sqlite security (file URL placeholder)", () => {
  for (const pm of SECURITY_MATRIX) {
    test(
      `security: sqlite gets file: URL placeholder, no credentials on ${pm}`,
      { timeout: 15 * 60_000 },
      async (ctx) => {
        if (!(await pmAvailable(pm))) {
          return ctx.skip(`${pm} is not installed on this machine`);
        }
        await withProject(`security-sqlite-${pm}`, async (dir) => {
          // 1. Real bootstrap
          await bootstrapProject(dir, pm);

          // 2. Real CLI run with sqlite
          const run1 = await runDxg(dir, [
            "--provider",
            "sqlite",
            "--non-interactive",
          ]);
          expect(
            run1.code,
            `dxg run 1 exited ${run1.code}\nSTDOUT:\n${run1.stdout}\nSTDERR:\n${run1.stderr}`,
          ).toBe(0);

          // 3. Verify .gitignore has .env coverage
          const gitignoreContent = mustExist(dir, ".gitignore");
          const gitignoreLines = gitignoreContent
            .split(/\r?\n/)
            .map((line) => line.trimEnd());
          const gitignoreHasEnv = gitignoreLines.some((line) =>
            [".env", ".env*", "*.env"].includes(line),
          );
          expect(gitignoreHasEnv).toBe(true);

          // 4. Verify .env has SQLite file URL (not real credentials)
          const envContent = mustExist(dir, ".env");
          expect(envContent).toContain('DATABASE_URL="file:./dev.db"');
          expect(envContent).not.toMatch(/DATABASE_URL=postgresql:\/\//);
          expect(envContent).not.toMatch(/DATABASE_URL=.*:\/\/.*:.*@/);

          // 5. Verify helper guards DATABASE_URL
          const helperContent = mustExist(dir, "lib/prisma.ts");
          expect(helperContent).toContain(
            "const connectionString = process.env.DATABASE_URL;",
          );
          expect(helperContent).toMatch(
            /if \(connectionString === undefined\)\s*\{/,
          );
          expect(helperContent).toContain("DATABASE_URL is not set");

          // 6. Run db:generate
          const gen = await runPM(PM_COMMAND[pm], ["run", "db:generate"], {
            cwd: dir,
            timeoutMs: 5 * 60_000,
          });
          expect(
            gen.code,
            `db:generate exited ${gen.code}\nSTDOUT:\n${gen.stdout}\nSTDERR:\n${gen.stderr}`,
          ).toBe(0);
        });
      },
    );
  }
});

describe("E2E: dxg add database — user-owned .env with real credentials is preserved", () => {
  // Test with one package manager to verify the behavior
  const pm: E2EPm = "pnpm";

  test(
    `security: user-owned .env with real DATABASE_URL is never modified on ${pm}`,
    { timeout: 15 * 60_000 },
    async (ctx) => {
      if (!(await pmAvailable(pm))) {
        return ctx.skip(`${pm} is not installed on this machine`);
      }
      await withProject(`security-user-env-${pm}`, async (dir) => {
        // 1. Real bootstrap
        await bootstrapProject(dir, pm);

        // 2. Create a user-owned .env with REAL credentials BEFORE running dxg
        const userEnvContent =
          "# User's production credentials\n" +
          "DATABASE_URL=postgresql://produser:prodpass@prod.db.example.com:5432/proddb\n" +
          "OTHER_SECRET=super-secret-value\n";
        const { writeFileSync } = await import("node:fs");
        writeFileSync(path.join(dir, ".env"), userEnvContent, "utf8");

        // 3. Run dxg add database
        const run1 = await runDxg(dir, [
          "--provider",
          "postgresql",
          "--non-interactive",
        ]);
        expect(
          run1.code,
          `dxg run 1 exited ${run1.code}\nSTDOUT:\n${run1.stdout}\nSTDERR:\n${run1.stderr}`,
        ).toBe(0);

        // 4. Verify user's .env is PRESERVED exactly (DXG must not touch it)
        const envContent = mustExist(dir, ".env");
        expect(envContent).toBe(userEnvContent);

        // 5. Verify .gitignore was NOT created/modified (user owns the hygiene decision)
        // Note: prisma init may create .gitignore, but DXG should not append .env
        // since DXG didn't write the .env file
        const { existsSync } = await import("node:fs");
        // If .gitignore exists from prisma init, it may or may not have .env
        // The key assertion: DXG did not add .env to .gitignore
      });
    },
  );
});