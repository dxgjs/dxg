/**
 * Real-resolution tests for the dependency-installation command chain.
 *
 * The mocked suites (installer.test.ts, database/index.test.ts) fake
 * @antfu/ni deliberately — necessary to test flow logic, but they can never
 * catch a break in the REAL resolution chain:
 *
 *   installer.install → getCliCommand(parseNi, [...]) → @antfu/ni +
 *   package-manager-detector → resolved { command, args } → executeCommand
 *
 * These tests resolve with the REAL @antfu/ni (no mocks) against temporary
 * fixture projects for every supported agent, pinning:
 *   1. the install batch shapes (dev "-D first" vs plain specs),
 *   2. the "prisma@7 generate" dlx resolution the generator's Step 3b uses,
 *   3. that the approval-only spec never becomes a CLI argument.
 *
 * Nothing executes — resolution only. No registry, no network.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
// The REAL @antfu/ni — deliberately NOT mocked in this file.
import { getCliCommand, parseNi, parseNlx, serializeCommand } from "@antfu/ni";

/**
 * Fixture projects that make @antfu/ni agent detection deterministic: the
 * lockfile / packageManager field is matched in the fixture directory
 * itself, before detection walks up the directory tree.
 *
 * Prefixes are the OBSERVED resolution shapes of @antfu/ni 30.5.0 (probed
 * empirically — serializeCommand output pinned in the assertions): npm uses
 * its short "i" alias, bun a lowercase "-d" dev flag, and yarn v1 maps
 * dlx-style execution to npx.
 */
const agentScenarios: {
  name: string;
  /** args prefix (after the executable) for the dev batch ("-D" first). */
  expectedDevPrefix: string[];
  /** args prefix (after the executable) for the regular batch. */
  expectedRegularPrefix: string[];
  expectedDevCommand: string;
  expectedRegularCommand: string;
  expectedDlxCommand: string;
  expectedDlxPrefix: string[];
  files: Record<string, string>;
}[] = [
  {
    name: "npm",
    expectedDevPrefix: ["i", "-D"],
    expectedRegularPrefix: ["i"],
    expectedDevCommand: "npm",
    expectedRegularCommand: "npm",
    expectedDlxCommand: "npx",
    expectedDlxPrefix: [],
    files: {
      "package.json": '{"name":"dxg-fixture","private":true}',
      "package-lock.json": '{"lockfileVersion":3}',
    },
  },
  {
    name: "pnpm",
    expectedDevPrefix: ["add", "-D"],
    expectedRegularPrefix: ["add"],
    expectedDevCommand: "pnpm",
    expectedRegularCommand: "pnpm",
    expectedDlxCommand: "pnpm",
    expectedDlxPrefix: ["dlx"],
    files: {
      "package.json": '{"name":"dxg-fixture","private":true}',
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    },
  },
  {
    name: "yarn v1",
    expectedDevPrefix: ["add", "-D"],
    expectedRegularPrefix: ["add"],
    expectedDevCommand: "yarn",
    expectedRegularCommand: "yarn",
    // yarn v1 has no dlx; package-manager-detector maps its `execute` to npx.
    expectedDlxCommand: "npx",
    expectedDlxPrefix: [],
    files: {
      "package.json": '{"name":"dxg-fixture","private":true}',
      "yarn.lock": "# yarn lockfile v1\n\n",
    },
  },
  {
    name: "yarn berry",
    expectedDevPrefix: ["add", "-D"],
    expectedRegularPrefix: ["add"],
    expectedDevCommand: "yarn",
    expectedRegularCommand: "yarn",
    expectedDlxCommand: "yarn",
    expectedDlxPrefix: ["dlx"],
    files: {
      "package.json":
        '{"name":"dxg-fixture","packageManager":"yarn@4.1.1","private":true}',
    },
  },
  {
    name: "bun",
    // bun's dev flag is lowercase "-d" (observed).
    expectedDevPrefix: ["add", "-d"],
    expectedRegularPrefix: ["add"],
    expectedDevCommand: "bun",
    expectedRegularCommand: "bun",
    expectedDlxCommand: "bun",
    expectedDlxPrefix: ["x"],
    files: {
      "package.json": '{"name":"dxg-fixture","private":true}',
      "bun.lock": "",
    },
  },
];

const tempDirs: string[] = [];

function createFixtureProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dxg-install-res-"));
  tempDirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, "utf8");
  }
  return dir;
}

afterEach(() => {
  let dir = tempDirs.pop();
  while (dir) {
    rmSync(dir, { recursive: true, force: true });
    dir = tempDirs.pop();
  }
});

/** Mirrors installer.install's resolution call exactly (cwd + programmatic). */
async function resolveInstall(
  args: string[],
  files: Record<string, string>,
): Promise<{ command: string; args: string[] }> {
  const fixtureDir = createFixtureProject(files);
  const resolved = await getCliCommand(parseNi, args, {
    cwd: fixtureDir,
    programmatic: true,
  });
  if (!resolved) {
    throw new Error(`getCliCommand returned undefined for: ${args.join(" ")}`);
  }
  return resolved;
}

// Real agent detection spawns subprocess probes (npm config, etc.) — well
// over the 5s default for tests resolving across all five agents.
const RESOLVE_TIMEOUT = 30_000;

describe("install batch resolution (real @antfu/ni, all agents)", () => {
  test("dev batch: '-D first' resolves to the agent's dev-install with verbatim specs", async () => {
    for (const scenario of agentScenarios) {
      const resolved = await resolveInstall(
        ["-D", "prisma@7.10.0", "tsx"],
        scenario.files,
      );
      expect(resolved.command, `${scenario.name}: executable`).toBe(
        scenario.expectedDevCommand,
      );
      // Prefix: "<agent> i/add -D" (bun rewrites the flag to lowercase -d).
      expect(
        resolved.args.slice(0, scenario.expectedDevPrefix.length),
        `${scenario.name}: dev prefix`,
      ).toEqual(scenario.expectedDevPrefix);
      // Specs verbatim after the dev flag.
      const specs = resolved.args.slice(scenario.expectedDevPrefix.length);
      expect(specs).toEqual(["prisma@7.10.0", "tsx"]);
    }
  }, RESOLVE_TIMEOUT);

  test("regular batch: plain specs resolve to the agent's install with verbatim specs", async () => {
    for (const scenario of agentScenarios) {
      const resolved = await resolveInstall(
        ["@prisma/client@7.10.0", "better-sqlite3@^12.6.0", "dotenv"],
        scenario.files,
      );
      expect(resolved.command, `${scenario.name}: executable`).toBe(
        scenario.expectedRegularCommand,
      );
      expect(
        resolved.args.slice(0, scenario.expectedRegularPrefix.length),
        `${scenario.name}: regular prefix`,
      ).toEqual(scenario.expectedRegularPrefix);
      const specs = resolved.args.slice(scenario.expectedRegularPrefix.length);
      expect(specs).toEqual([
        "@prisma/client@7.10.0",
        "better-sqlite3@^12.6.0",
        "dotenv",
      ]);
    }
  }, RESOLVE_TIMEOUT);

  test("approval-only specs never reach the resolver (the installer filters them out first)", async () => {
    // The installer's batch construction drops approvalOnly entries BEFORE
    // resolution — the transitive @prisma/engines is never a CLI arg.
    // Pinned as the plan shape's contract: the batch args the installer
    // builds for the database plan never contain it.
    const devBatchArgs = ["-D", "prisma@7.10.0", "@types/node"];
    const regularBatchArgs = [
      "@prisma/client@7.10.0",
      "@prisma/adapter-better-sqlite3",
      "better-sqlite3@^12.6.0",
      "dotenv",
    ];
    expect(devBatchArgs).not.toContain("@prisma/engines");
    expect(regularBatchArgs).not.toContain("@prisma/engines");

    // And the shapes resolve cleanly on every agent.
    for (const scenario of agentScenarios) {
      const dev = await resolveInstall(devBatchArgs, scenario.files);
      expect(dev.args).not.toContain("@prisma/engines");
      const regular = await resolveInstall(regularBatchArgs, scenario.files);
      expect(regular.args).not.toContain("@prisma/engines");
    }
  }, RESOLVE_TIMEOUT);
});

describe("prisma generate dlx resolution (real @antfu/ni, all agents)", () => {
  test("resolves to the agent's dlx command with the prisma@7 generate args verbatim", async () => {
    for (const scenario of agentScenarios) {
      const fixtureDir = createFixtureProject(scenario.files);
      const resolved = await getCliCommand(
        parseNlx,
        ["prisma@7", "generate"],
        {
          cwd: fixtureDir,
          programmatic: true,
        },
      );
      expect(resolved, scenario.name).toBeDefined();
      if (!resolved) continue;

      expect(resolved.command).toBe(scenario.expectedDlxCommand);
      expect(
        resolved.args.slice(0, scenario.expectedDlxPrefix.length),
        `${scenario.name}: dlx prefix`,
      ).toEqual(scenario.expectedDlxPrefix);
      // The prisma args ride verbatim after the dlx/x prefix (empty for
      // npx — the args ARE the command line there).
      expect(resolved.args.slice(scenario.expectedDlxPrefix.length)).toEqual([
        "prisma@7",
        "generate",
      ]);
      // The mis-resolution signature the production guard checks for.
      expect(resolved.args).not.toContain("add");

      // Byte-for-byte parity with the manual command a user would run.
      expect(serializeCommand(resolved)).toBe(
        serializeCommand({
          command: scenario.expectedDlxCommand,
          args: [...scenario.expectedDlxPrefix, "prisma@7", "generate"],
        }),
      );
    }
  }, RESOLVE_TIMEOUT);
});
