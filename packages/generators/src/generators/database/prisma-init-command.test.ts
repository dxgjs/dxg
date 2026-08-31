/**
 * Regression tests for the `prisma init` argument contract.
 *
 * The tests in `index.test.ts` mock `@antfu/ni` entirely — necessary to test
 * the generator flow, but they can never catch a break in the REAL
 * command-resolution chain:
 *
 *   executeDatabase → getCliCommand(parseNlx, [...]) → @antfu/ni +
 *   package-manager-detector → resolved { command, args } → executeCommand
 *   (execa) → prisma@7 init
 *
 * Prisma 7 auto-installs "agent skills" (`.claude/skills/`,
 * `.windsurf/skills/`, `.agents/skills/`, `skills-lock.json`) whenever
 * `--no-skills` does not reach the `prisma init` process. DXG owns that
 * decision via its own confirm prompt ("Install Prisma agent skills?"):
 * No (default) → the explicit `--no-skills` flag; Yes → the flag is omitted,
 * which makes prisma@7 install the skills unconditionally and
 * non-interactively (no prompt exists in that CLI code path). These tests
 * resolve commands with the REAL `@antfu/ni` (no mocks) against temporary
 * fixture projects, pinning the argument contract for every supported
 * provider, package manager, and skills choice — always as Prisma CLI flags.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
// The REAL @antfu/ni — deliberately NOT mocked in this file.
import { getCliCommand, parseNlx, serializeCommand } from "@antfu/ni";

// The REAL provider table and the REAL argument builder used by
// executeDatabase for BOTH resolution paths (primary getCliCommand call and
// the originalArgs fallback/workaround).
import { buildPrismaInitArgs, providerData } from "./index";

/** The DXG confirm-prompt default for "Install Prisma agent skills?" (No). */
const SKILLS_DEFAULT = false;

/**
 * Fixture projects that make @antfu/ni agent detection deterministic: the
 * lockfile / packageManager field is matched in the fixture directory itself,
 * before detection walks up the directory tree.
 */
const agentScenarios: {
  name: string;
  expectedCommand: string;
  expectedArgsPrefix: string[];
  files: Record<string, string>;
}[] = [
  {
    name: "npm",
    expectedCommand: "npx",
    expectedArgsPrefix: ["prisma@7"],
    files: {
      "package.json": '{"name":"dxg-fixture","private":true}',
      "package-lock.json": '{"lockfileVersion":3}',
    },
  },
  {
    name: "pnpm",
    expectedCommand: "pnpm",
    expectedArgsPrefix: ["dlx", "prisma@7"],
    files: {
      "package.json": '{"name":"dxg-fixture","private":true}',
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
    },
  },
  {
    // package-manager-detector maps yarn v1 `execute` to npx.
    name: "yarn v1",
    expectedCommand: "npx",
    expectedArgsPrefix: ["prisma@7"],
    files: {
      "package.json": '{"name":"dxg-fixture","private":true}',
      "yarn.lock": "# yarn lockfile v1\n\n",
    },
  },
  {
    name: "yarn berry",
    expectedCommand: "yarn",
    expectedArgsPrefix: ["dlx", "prisma@7"],
    files: {
      "package.json":
        '{"name":"dxg-fixture","packageManager":"yarn@4.1.1","private":true}',
    },
  },
  {
    name: "bun",
    expectedCommand: "bun",
    expectedArgsPrefix: ["x", "prisma@7"],
    files: {
      "package.json": '{"name":"dxg-fixture","private":true}',
      "bun.lock": "",
    },
  },
];

const tempDirs: string[] = [];

function createFixtureProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "dxg-prisma-init-"));
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

/**
 * Resolves the production `prisma init` command with the REAL @antfu/ni
 * chain against a fixture project, mirroring executeDatabase exactly
 * (`cwd` = project dir, `programmatic: true`) for the given skills choice.
 */
async function resolvePrismaInitCommand(
  prismaProvider: string,
  files: Record<string, string>,
  installSkills: boolean = SKILLS_DEFAULT,
): Promise<{ command: string; args: string[]; cwd?: string }> {
  const fixtureDir = createFixtureProject(files);
  const resolved = await getCliCommand(
    parseNlx,
    buildPrismaInitArgs(prismaProvider, installSkills),
    {
      cwd: fixtureDir,
      programmatic: true,
    },
  );
  if (!resolved) {
    throw new Error("getCliCommand returned undefined for prisma init");
  }
  return resolved;
}

/**
 * The core invariant: whatever the package manager, `--no-skills` must reach
 * the `prisma init` process as a Prisma CLI flag — after the package spec and
 * after the `init` subcommand (so it can never be interpreted as a
 * package-manager option), exactly once, and the @antfu/ni "dlx resolved as
 * add" mis-resolution signature must never appear.
 */
function expectPrismaInitContract(
  resolved: { command: string; args: string[]; cwd?: string },
  prismaProvider: string,
  installSkills: boolean = SKILLS_DEFAULT,
): void {
  const { command, args } = resolved;
  expect(typeof command).toBe("string");
  expect(command.length).toBeGreaterThan(0);

  const packageIdx = args.indexOf("prisma@7");
  const initIdx = args.indexOf("init");
  const providerFlagIdx = args.indexOf("--datasource-provider");
  const noSkillsIdx = args.indexOf("--no-skills");
  const outputIdx = args.indexOf("--output");

  // Package spec present, then the subcommand.
  expect(packageIdx).toBeGreaterThan(-1);
  expect(initIdx).toBeGreaterThan(packageIdx);

  // Prisma CLI flags come after the subcommand — they can never be
  // interpreted as package-manager options (which would precede the package
  // spec, e.g. `pnpm --no-skills dlx ...`).
  expect(providerFlagIdx).toBeGreaterThan(initIdx);
  expect(outputIdx).toBeGreaterThan(initIdx);

  // Adjacent flag/value pairs, verbatim.
  expect(args[providerFlagIdx + 1]).toBe(prismaProvider);
  expect(args[outputIdx + 1]).toBe("../lib/generated/prisma");

  if (installSkills) {
    // "Yes" → the flag is omitted entirely; prisma@7 then installs agent
    // skills unconditionally and non-interactively (no prompt/TTY check in
    // that CLI code path), so Prisma never asks the question DXG asked.
    expect(noSkillsIdx).toBe(-1);
  } else {
    // "No" (DXG default) → `--no-skills` exactly once, as a Prisma CLI flag.
    // Dropping it would flip Prisma into installing skills silently.
    expect(noSkillsIdx).toBeGreaterThan(initIdx);
    expect(args.indexOf("--no-skills", noSkillsIdx + 1)).toBe(-1);
  }

  // Signature of the @antfu/ni mis-resolution that the production
  // originalArgs workaround guards against.
  expect(args).not.toContain("add");

  // ni's nlx resolution does not return a cwd; production falls back to
  // process.cwd() (the project root). If ni ever starts returning one it
  // must point at the project that was detected.
  expect(resolved.cwd ?? process.cwd()).toBe(process.cwd());
}

describe("prisma init argument contract (real @antfu/ni resolution)", () => {
  test("every supported provider keeps <provider> + --no-skills through real resolution", async () => {
    // Provider mapping is preserved (PlanetScale keeps its MySQL mapping).
    expect(providerData.planetscale.prismaProvider).toBe("mysql");

    const npmScenario = agentScenarios[0];
    for (const provider of Object.values(providerData)) {
      // The exact shape shared by BOTH production paths (primary call and
      // originalArgs fallback) for the DXG default (No → --no-skills).
      expect(buildPrismaInitArgs(provider.prismaProvider, false)).toEqual([
        "prisma@7",
        "init",
        "--datasource-provider",
        provider.prismaProvider,
        "--no-skills",
        "--output",
        "../lib/generated/prisma",
      ]);
      // And for "Yes": identical contract minus the --no-skills flag.
      expect(buildPrismaInitArgs(provider.prismaProvider, true)).toEqual([
        "prisma@7",
        "init",
        "--datasource-provider",
        provider.prismaProvider,
        "--output",
        "../lib/generated/prisma",
      ]);

      const resolved = await resolvePrismaInitCommand(
        provider.prismaProvider,
        npmScenario.files,
      );
      expect(resolved.command).toBe(npmScenario.expectedCommand);
      expect(resolved.args.slice(0, 1)).toEqual(npmScenario.expectedArgsPrefix);
      expectPrismaInitContract(resolved, provider.prismaProvider);
    }
  });

  test("PlanetScale resolves with its mysql mapping + --no-skills", async () => {
    const resolved = await resolvePrismaInitCommand(
      providerData.planetscale.prismaProvider,
      agentScenarios[1].files, // pnpm
    );
    expect(resolved.command).toBe("pnpm");
    expectPrismaInitContract(resolved, "mysql");
  });

  for (const scenario of agentScenarios) {
    test(`${scenario.name}: resolves to exactly the manual command (postgresql, skills=No)`, async () => {
      const resolved = await resolvePrismaInitCommand(
        "postgresql",
        scenario.files,
      );
      expect(resolved.command).toBe(scenario.expectedCommand);
      expect(resolved.args.slice(0, scenario.expectedArgsPrefix.length)).toEqual(
        scenario.expectedArgsPrefix,
      );
      expectPrismaInitContract(resolved, "postgresql");

      // Byte-for-byte parity with the manual command a user would run.
      expect(serializeCommand(resolved)).toBe(
        serializeCommand({
          command: scenario.expectedCommand,
          args: [
            ...scenario.expectedArgsPrefix,
            ...buildPrismaInitArgs("postgresql", false).slice(1),
          ],
        }),
      );
    });

    test(`${scenario.name}: resolves to exactly the manual command (postgresql, skills=Yes)`, async () => {
      const resolved = await resolvePrismaInitCommand(
        "postgresql",
        scenario.files,
        true,
      );
      expect(resolved.command).toBe(scenario.expectedCommand);
      expect(resolved.args.slice(0, scenario.expectedArgsPrefix.length)).toEqual(
        scenario.expectedArgsPrefix,
      );
      expectPrismaInitContract(resolved, "postgresql", true);

      // Byte-for-byte parity — no --no-skills, everything else verbatim.
      expect(serializeCommand(resolved)).toBe(
        serializeCommand({
          command: scenario.expectedCommand,
          args: [
            ...scenario.expectedArgsPrefix,
            ...buildPrismaInitArgs("postgresql", true).slice(1),
          ],
        }),
      );
    });
  }

  test("pnpm projects resolve byte-for-byte to the documented manual command", async () => {
    const noSkills = await resolvePrismaInitCommand(
      "postgresql",
      agentScenarios[1].files, // pnpm
    );
    expect(serializeCommand(noSkills)).toBe(
      "pnpm dlx prisma@7 init --datasource-provider postgresql --no-skills --output ../lib/generated/prisma",
    );

    const withSkills = await resolvePrismaInitCommand(
      "postgresql",
      agentScenarios[1].files, // pnpm
      true,
    );
    // "Yes" contract: same structure, skills flag omitted. prisma@7.10.0
    // installs the skills non-interactively on this path.
    expect(serializeCommand(withSkills)).toBe(
      "pnpm dlx prisma@7 init --datasource-provider postgresql --output ../lib/generated/prisma",
    );
  });
});

