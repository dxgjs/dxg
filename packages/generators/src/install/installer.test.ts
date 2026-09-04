import { beforeEach, describe, expect, test, vi } from "vitest";
import type { Mock } from "vitest";
import { join } from "path";
import type { DependencyPlan } from "./types";
import type { FSInterface } from "../types";

// The subprocess layer is faked end-to-end: @antfu/ni's getCliCommand is
// mocked (command resolution), @dxgjs/fs's executeCommand is a programmable
// fake (process execution), and the fs seam is an in-memory store. Nothing
// here touches a real package manager, registry, or network.

vi.mock("@antfu/ni", () => {
  return {
    parseNi: vi.fn().mockReturnValue("npm-mock"),
    parseNlx: vi.fn().mockReturnValue("npx"),
    getCliCommand: vi.fn().mockImplementation(
      async (_parse: unknown, args: string[]) => {
        // Real ni semantics for parseNi: "-D first" → "<agent> install -D …";
        // plain specs → "<agent> install …". Verbatim spec passthrough.
        if (args[0] === "-D") {
          return {
            command: "npm-mock",
            args: ["install", "-D", ...args.slice(1)],
          };
        }
        return { command: "npm-mock", args: ["install", ...args] };
      },
    ),
  };
});

vi.mock("@dxgjs/fs", () => {
  return {
    executeCommand: vi.fn(),
  };
});

import { executeCommand } from "@dxgjs/fs";
import { createDependencyInstaller } from "./installer";

/**
 * In-memory FSInterface fake: records writes (order matters for the
 * before-first-install assertions), serves reads back. Keys are normalized
 * with path.join so POSIX-style test paths survive on Windows (path.join
 * there emits backslashes — the production code joins, so the store must
 * too, or lookups miss).
 */
function makeFsStore(): FSInterface & {
  writeLog: string[];
  read(name: string): string;
} {
  const files = new Map<string, string>();
  const writeLog: string[] = [];
  const key = (p: string) => join(p);
  return {
    writeLog,
    read(name: string) {
      return files.get(key(name)) ?? "";
    },
    pathExists: vi
      .fn()
      .mockImplementation(async (p: string) => files.has(key(p))),
    readFile: vi
      .fn()
      .mockImplementation(async (p: string) => files.get(key(p)) as string),
    writeFile: vi.fn().mockImplementation(async (p: string, data: string) => {
      files.set(key(p), data);
      writeLog.push(key(p));
    }),
    stat: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    readJson: vi.fn().mockImplementation(async (p: string) =>
      files.has(key(p)) ? JSON.parse(files.get(key(p)) as string) : undefined,
    ),
    writeJson: vi.fn().mockImplementation(async (p: string, data: unknown) => {
      files.set(key(p), JSON.stringify(data, null, 2));
      writeLog.push(key(p));
    }),
  };
}

describe("createDependencyInstaller", () => {
  let fsStore: ReturnType<typeof makeFsStore>;
  let defaultPlan: DependencyPlan;

  beforeEach(() => {
    vi.clearAllMocks();
    fsStore = makeFsStore();
    defaultPlan = {
      devDependencies: [
        { spec: "prisma@7.10.0", requiresBuild: true },
        { spec: "tsx", requiresBuild: false },
      ],
      dependencies: [
        { spec: "@prisma/client@7.10.0", requiresBuild: false },
        { spec: "better-sqlite3@^12.6.0", requiresBuild: true },
        {
          spec: "@prisma/engines",
          requiresBuild: true,
          approvalOnly: true,
        },
      ],
    };
  });

  test("exposes the bound agent", () => {
    const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });
    expect(installer.agent).toBe("npm");
  });

  test("installs dev deps first (with -D), then regular deps, in two batches", async () => {
    const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });
    (executeCommand as Mock).mockResolvedValue({ all: "added 42 packages" });

    const result = await installer.install(defaultPlan, { cwd: "/proj" });

    expect(result.success).toBe(true);
    const calls = (executeCommand as Mock).mock.calls;
    expect(calls).toHaveLength(2);
    // Batch 1: dev dependencies carry -D FIRST (ni's add -D convention).
    expect(calls[0][0]).toBe("npm-mock");
    expect(calls[0][1]).toEqual(["install", "-D", "prisma@7.10.0", "tsx"]);
    // Batch 2: regular dependencies, no -D.
    expect(calls[1][1]).toEqual([
      "install",
      "@prisma/client@7.10.0",
      "better-sqlite3@^12.6.0",
      // approvalOnly entries are NEVER installed by name — they arrive
      // transitively (@prisma/engines rides prisma's dependency tree).
    ]);
    expect(calls[1][1]).not.toContain("@prisma/engines");
  });

  test("resolves each batch through getCliCommand with programmatic: true and cwd", async () => {
    const installer = createDependencyInstaller({ agent: "pnpm", fs: fsStore });
    (executeCommand as Mock).mockResolvedValue({ all: "Done" });
    const { getCliCommand } = await import("@antfu/ni");

    await installer.install(defaultPlan, { cwd: "/proj" });

    const resolveCalls = (getCliCommand as Mock).mock.calls;
    expect(resolveCalls.length).toBe(2);
    for (const call of resolveCalls) {
      // programmatic:true is the non-interactivity guarantee: without it,
      // ni.detect offers to "globally install yarn" interactively.
      expect(call[2]).toMatchObject({ cwd: "/proj", programmatic: true });
    }
  });

  describe("pre-approval per agent (approvals written BEFORE the first install)", () => {
    const buildNames = ["prisma", "better-sqlite3", "@prisma/engines"];

    test("pnpm: writes allowBuilds into pnpm-workspace.yaml with quoted @ keys", async () => {
      const installer = createDependencyInstaller({
        agent: "pnpm",
        fs: fsStore,
      });
      (executeCommand as Mock).mockImplementation(async () => {
        // The approval must already be on disk by the time ANY install
        // command runs (pre-approval beats post-hoc approve+rebuild).
        expect(
          fsStore.writeLog.some((p) => p.endsWith("pnpm-workspace.yaml")),
        ).toBe(true);
        return { all: "Done" };
      });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect([...result.approvedBuilds].sort()).toEqual(
          [...buildNames].sort(),
        );
      }
      const yaml = fsStore.read("/proj/pnpm-workspace.yaml");
      expect(yaml).toContain("allowBuilds:");
      expect(yaml).toContain("prisma: true");
      expect(yaml).toContain("better-sqlite3: true");
      // The @-scoped key must be single-quoted (pnpm YAML requirement —
      // unquoted, pnpm fails with "bad indentation of a mapping entry").
      expect(yaml).toContain("'@prisma/engines': true");
    });

    test("npm: writes allowScripts into package.json (name-only entries)", async () => {
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });
      (executeCommand as Mock).mockResolvedValue({ all: "added 3 packages" });

      await installer.install(defaultPlan, { cwd: "/proj" });

      const pkg = JSON.parse(fsStore.read("/proj/package.json"));
      expect(pkg.allowScripts).toEqual({
        prisma: true,
        "better-sqlite3": true,
        "@prisma/engines": true,
      });
    });

    test("yarn@berry: writes dependenciesMeta built:true into package.json", async () => {
      const installer = createDependencyInstaller({
        agent: "yarn@berry",
        fs: fsStore,
      });
      (executeCommand as Mock).mockResolvedValue({ all: "Done in 1s" });

      await installer.install(defaultPlan, { cwd: "/proj" });

      const pkg = JSON.parse(fsStore.read("/proj/package.json"));
      expect(pkg.dependenciesMeta).toEqual({
        prisma: { built: true },
        "better-sqlite3": { built: true },
        "@prisma/engines": { built: true },
      });
    });

    test("bun and yarn classic: write NOTHING (bun trustedDependencies would REPLACE the default-trusted list)", async () => {
      for (const agent of ["bun", "yarn"] as const) {
        fsStore = makeFsStore();
        const installer = createDependencyInstaller({ agent, fs: fsStore });
        (executeCommand as Mock).mockResolvedValue({ all: "Done" });

        const result = await installer.install(defaultPlan, { cwd: "/proj" });

        expect(result.success).toBe(true);
        // bun default-trusted covers the plan (lab bun-full: zero blocked)
        // and yarn classic runs scripts by default — the adapter must not
        // write anything, especially not a full-replacement
        // trustedDependencies list (bun semantics: it would UNTRUST every
        // other default-trusted package).
        expect(fsStore.writeLog).toEqual([]);
        // No approval names reported as pre-approved (nothing was
        // written), even though the builds are expected to run.
        if (result.success) {
          expect(result.approvedBuilds).toEqual([]);
        }
      }
    });

    test("a plan with no requiresBuild entries writes no approvals", async () => {
      const installer = createDependencyInstaller({
        agent: "pnpm",
        fs: fsStore,
      });
      (executeCommand as Mock).mockResolvedValue({ all: "Done" });
      const plan: DependencyPlan = {
        devDependencies: [{ spec: "tsx", requiresBuild: false }],
        dependencies: [{ spec: "dotenv", requiresBuild: false }],
      };

      const result = await installer.install(plan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.approvedBuilds).toEqual([]);
      }
      expect(fsStore.writeLog).toEqual([]);
    });
  });

  describe("failure normalization (execa throws on non-zero exit)", () => {
    test("pnpm ERR_PNPM_IGNORED_BUILDS → build-script-blocked with suggestion, exit code kept", async () => {
      const installer = createDependencyInstaller({
        agent: "pnpm",
        fs: fsStore,
      });
      (executeCommand as Mock).mockRejectedValue({
        exitCode: 1,
        all: "ERR_PNPM_IGNORED_BUILDS  Ignored build scripts: @prisma/engines@7.10.0, prisma@7.10.0.",
        message: "Command failed with exit code 1",
      });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result).toMatchObject({
        success: false,
        reason: "build-script-blocked",
        exitCode: 1,
      });
      if (!result.success) {
        expect(result.suggestion).toContain("pnpm approve-builds");
        expect(result.output).toContain("ERR_PNPM_IGNORED_BUILDS");
      }
    });

    test("E404 → installation-failed", async () => {
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });
      (executeCommand as Mock).mockRejectedValue({
        exitCode: 1,
        all: "npm error code E404\nnpm error 404 Not Found",
        message: "Command failed with exit code 1",
      });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result).toMatchObject({
        success: false,
        reason: "installation-failed",
      });
    });

    test("node-gyp crash → native-build-failed", async () => {
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });
      (executeCommand as Mock).mockRejectedValue({
        exitCode: 1,
        all: "gyp: No Xcode or CLang version detected\nELIFECYCLE  Command failed with exit code 1.",
        message: "Command failed with exit code 1",
      });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result).toMatchObject({
        success: false,
        reason: "native-build-failed",
      });
    });

    test("first-batch failure short-circuits the second batch", async () => {
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });
      (executeCommand as Mock).mockRejectedValueOnce({
        exitCode: 1,
        all: "npm error code E404",
        message: "Command failed with exit code 1",
      });

      await installer.install(defaultPlan, { cwd: "/proj" });

      expect((executeCommand as Mock).mock.calls).toHaveLength(1);
    });

    test("unresolvable command → unknown reason with agent-specific hint", async () => {
      const installer = createDependencyInstaller({ agent: "yarn", fs: fsStore });
      const { getCliCommand } = await import("@antfu/ni");
      // mockResolvedValueOnce (NOT mockResolvedValue): a persistent
      // implementation would survive vi.clearAllMocks() in beforeEach and
      // poison every later test's resolution.
      (getCliCommand as Mock).mockResolvedValueOnce(null);

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result).toMatchObject({
        success: false,
        reason: "unknown",
        hint: expect.stringContaining("yarn"),
      });
    });
  });

  describe("silent-drift scan (exit 0 with blocked builds)", () => {
    test("npm success with install-scripts warnings reports blockedBuilds by name", async () => {
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });
      (executeCommand as Mock)
        .mockResolvedValueOnce({ all: "added 20 packages" })
        .mockResolvedValueOnce({
          all: [
            "npm warn install-scripts 2 packages had install scripts blocked",
            "npm warn install-scripts   better-sqlite3@12.6.0 (install: prebuild-install || node-gyp rebuild)",
            "added 22 packages",
          ].join("\n"),
        });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.blockedBuilds).toEqual(["better-sqlite3"]);
      }
    });

    test("bun success with 'Blocked N postinstall' reports the placeholder marker", async () => {
      const installer = createDependencyInstaller({ agent: "bun", fs: fsStore });
      (executeCommand as Mock).mockResolvedValue({
        all: "Blocked 1 postinstall. Run `bun pm untrusted` for details.",
      });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.blockedBuilds).toEqual([
          "(bun: unnamed blocked postinstalls)",
        ]);
      }
    });

    test("yarn@berry success with YN0004 reports the disabled-scripts marker", async () => {
      const installer = createDependencyInstaller({
        agent: "yarn@berry",
        fs: fsStore,
      });
      (executeCommand as Mock).mockResolvedValue({
        all: "➤ YN0004: │ better-sqlite3 lists build scripts, but all build scripts have been disabled",
      });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.blockedBuilds).toEqual([
          "(yarn: build scripts disabled via enableScripts)",
        ]);
      }
    });

    test("a fully healthy install reports zero blocked builds and echoes output", async () => {
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });
      (executeCommand as Mock).mockResolvedValue({
        all: "added 42 packages in 3s",
      });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.blockedBuilds).toEqual([]);
        expect(result.output).toContain("added 42 packages");
      }
    });
  });

  describe("dry-run and empty plans", () => {
    test("dryRun: nothing resolved, nothing executed, nothing written", async () => {
      const installer = createDependencyInstaller({
        agent: "pnpm",
        fs: fsStore,
      });

      const result = await installer.install(defaultPlan, {
        cwd: "/proj",
        dryRun: true,
      });

      expect(result).toMatchObject({
        success: true,
        approvedBuilds: [],
        blockedBuilds: [],
        output: "",
      });
      expect((executeCommand as Mock).mock.calls).toHaveLength(0);
      expect(fsStore.writeLog).toEqual([]);
    });

    test("empty plan: immediate success without touching the manager", async () => {
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });

      const result = await installer.install(
        { devDependencies: [], dependencies: [] },
        { cwd: "/proj" },
      );

      expect(result.success).toBe(true);
      expect((executeCommand as Mock).mock.calls).toHaveLength(0);
      expect(fsStore.writeLog).toEqual([]);
    });
  });
});
