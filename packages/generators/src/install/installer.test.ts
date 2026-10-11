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

    test("npm: an explicit user denial (false) is never flipped to true", async () => {
      // Security contract, same rule as the pnpm merge: an existing entry
      // is never touched. A user's {better-sqlite3: false} stands — the
      // install proceeds, npm blocks that package's scripts, and the
      // blocked-builds scan / artifact verification reports it honestly.
      await fsStore.writeFile(
        "/proj/package.json",
        JSON.stringify({ allowScripts: { "better-sqlite3": false } }),
      );
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });
      (executeCommand as Mock).mockResolvedValue({ all: "added 3 packages" });

      await installer.install(defaultPlan, { cwd: "/proj" });

      const pkg = JSON.parse(fsStore.read("/proj/package.json"));
      expect(pkg.allowScripts["better-sqlite3"]).toBe(false);
      expect(pkg.allowScripts).toEqual({
        "better-sqlite3": false,
        prisma: true,
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

    test("yarn@berry: an explicit user denial (built:false) is never flipped, other meta fields preserved", async () => {
      // Security contract, same rule as pnpm/npm: `built` is set ONLY when
      // absent. An existing {built: false} denial stands, and unrelated
      // meta fields on another package's entry survive the write.
      await fsStore.writeFile(
        "/proj/package.json",
        JSON.stringify({
          dependenciesMeta: {
            "better-sqlite3": { built: false },
            sharp: { built: true, unplanned: "keep" },
          },
        }),
      );
      const installer = createDependencyInstaller({
        agent: "yarn@berry",
        fs: fsStore,
      });
      (executeCommand as Mock).mockResolvedValue({ all: "Done in 1s" });

      await installer.install(defaultPlan, { cwd: "/proj" });

      const pkg = JSON.parse(fsStore.read("/proj/package.json"));
      expect(pkg.dependenciesMeta["better-sqlite3"]).toEqual({ built: false });
      expect(pkg.dependenciesMeta.sharp).toEqual({
        built: true,
        unplanned: "keep",
      });
      expect(pkg.dependenciesMeta.prisma).toEqual({ built: true });
      expect(pkg.dependenciesMeta["@prisma/engines"]).toEqual({ built: true });
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

  describe("manifest reconciliation (managers rewrite installed specs)", () => {
    // npm resolves `prisma@7.10.0` then saves it with its default
    // save-prefix: devDependencies.prisma becomes "^7.10.0", silently
    // degrading the verified pin to a caret range — and a commanded
    // range fares no better (`better-sqlite3@^12.6.0` comes back as the
    // latest match, `^12.11.1`). Live-verified on npm 12 (minimal repro
    // 2026-10-10: a bare `npm install -D prisma@7.10.0` writes
    // "^7.10.0"). pnpm is NOT exempt: 12.5.1 saves pins verbatim but
    // bumps commanded RANGES to the latest match (live-proven
    // 2026-10-11: `pnpm add better-sqlite3@^12.6.0` saves `^12.11.1`
    // into both manifest and lockfile). yarn classic/berry and bun save
    // specs verbatim (no drift observed across the audit E2E baseline).
    // The mocks below reproduce each manager's save side effect on the
    // in-memory manifest; the installer must reconcile the entries it
    // installed back to the commanded specs — and resynchronize the
    // lockfile, which still records the rewritten specifier.

    /**
     * Fake install that mimics npm's manifest side effects: a pinned
     * spec is saved caret-prefixed (`7.10.0` → `^7.10.0`), a ranged
     * spec is bumped to the latest match (`^12.6.0` → `^12.11.1`),
     * and a naked spec is saved as the latest caret version.
     */
    function mockNpmCaretRewrite() {
      (executeCommand as Mock).mockImplementation(
        async (_command: string, args: string[]) => {
          // Lockfile-only resync calls (post-reconcile, see the lockfile
          // sync tests below) rewrite the LOCKFILE only — package.json is
          // not touched, so the fake writes nothing either.
          if (
            args.includes("--lockfile-only") ||
            args.includes("--package-lock-only") ||
            args.includes("--mode=update-lockfile")
          ) {
            return { all: "up to date" };
          }
          const dev = args.includes("-D");
          const specs = args.filter((a) => a !== "install" && a !== "-D");
          const pkg =
            (await fsStore.readJson("/proj/package.json")) as
              | Record<string, unknown>
              | undefined ?? {};
          const section = dev ? "devDependencies" : "dependencies";
          const entries = (pkg[section] ?? {}) as Record<string, string>;
          for (const spec of specs) {
            const at = spec.lastIndexOf("@");
            const name = at > 0 ? spec.slice(0, at) : spec;
            entries[name] =
              at <= 0
                ? "^18.0.7" // naked spec: npm saves latest with caret
                : spec.slice(at + 1).startsWith("^")
                  ? "^12.11.1" // ranged spec: bumped to the latest match
                  : `^${spec.slice(at + 1)}`; // pin: caret-prefixed
          }
          pkg[section] = entries;
          await fsStore.writeJson("/proj/package.json", pkg);
          return { all: "added 42 packages" };
        },
      );
    }

    test("npm's caret rewrite of installed pins is reconciled to the commanded specs", async () => {
      mockNpmCaretRewrite();
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      const pkg = JSON.parse(fsStore.read("/proj/package.json"));
      // Pins restored exactly — the manifest states the contract.
      expect(pkg.devDependencies.prisma).toBe("7.10.0");
      expect(pkg.dependencies["@prisma/client"]).toBe("7.10.0");
      // Commanded ranges restored verbatim (npm had bumped them to the
      // latest match).
      expect(pkg.dependencies["better-sqlite3"]).toBe("^12.6.0");
      // Naked specs carry no version contract: left as the manager wrote.
      expect(pkg.devDependencies.tsx).toBe("^18.0.7");
    });

    /**
     * pnpm 12.5.1's REAL save semantics (live-proven 2026-10-11, probe on
     * the audit reference campaign): pins are saved verbatim, naked specs
     * resolve to latest-with-caret, but a commanded RANGE is bumped to the
     * latest match (`better-sqlite3@^12.6.0` saves as `^12.11.1`).
     */
    function mockPnpmRangeRewrite() {
      (executeCommand as Mock).mockImplementation(
        async (_command: string, args: string[]) => {
          if (args.includes("--lockfile-only")) {
            return { all: "up to date" };
          }
          const dev = args.includes("-D");
          const specs = args.filter((a) => a !== "install" && a !== "-D");
          const pkg =
            (await fsStore.readJson("/proj/package.json")) as
              | Record<string, unknown>
              | undefined ?? {};
          const section = dev ? "devDependencies" : "dependencies";
          const entries = (pkg[section] ?? {}) as Record<string, string>;
          for (const spec of specs) {
            const at = spec.lastIndexOf("@");
            const name = at > 0 ? spec.slice(0, at) : spec;
            const declared = spec.slice(at + 1);
            entries[name] =
              at <= 0
                ? "^18.0.7" // naked spec: latest with caret
                : declared.startsWith("^")
                  ? "^12.11.1" // commanded range: bumped to latest match
                  : declared; // pin: saved verbatim
          }
          pkg[section] = entries;
          await fsStore.writeJson("/proj/package.json", pkg);
          return { all: "added 42 packages" };
        },
      );
    }

    /** Verbatim save semantics (yarn classic/berry, bun): the spec is the entry. */
    function mockVerbatimSave() {
      (executeCommand as Mock).mockImplementation(
        async (_command: string, args: string[]) => {
          const dev = args.includes("-D");
          const specs = args.filter((a) => a !== "install" && a !== "-D");
          const pkg =
            (await fsStore.readJson("/proj/package.json")) as
              | Record<string, unknown>
              | undefined ?? {};
          const section = dev ? "devDependencies" : "dependencies";
          const entries = (pkg[section] ?? {}) as Record<string, string>;
          for (const spec of specs) {
            const at = spec.lastIndexOf("@");
            const name = at > 0 ? spec.slice(0, at) : spec;
            entries[name] = at > 0 ? spec.slice(at + 1) : "^18.0.7";
          }
          pkg[section] = entries;
          await fsStore.writeJson("/proj/package.json", pkg);
          return { all: "added 42 packages" };
        },
      );
    }

    test("a reconciled rewrite also resynchronizes the lockfile (npm: --package-lock-only)", async () => {
      // npm rewrote the specs it saved and reconcile restored the
      // commanded ones in package.json — but package-lock.json still
      // records npm's specifiers, and `npm ci` fails on the mismatch.
      // Every batch whose entries were rewritten must be followed by a
      // lockfile-only refresh.
      mockNpmCaretRewrite();
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      const calls = (executeCommand as Mock).mock.calls as [string, string[]][];
      const resyncs = calls.filter(
        ([cmd, args]) =>
          cmd === "npm" &&
          args[0] === "install" &&
          args.includes("--package-lock-only"),
      );
      // Both batches were rewritten (pins caret-bumped) → both resynced.
      expect(resyncs).toHaveLength(2);
    });

    test("pnpm resynchronizes with --lockfile-only — frozen-lockfile CI contract", async () => {
      // pnpm 12.5.1 bumps commanded ranges to the latest match too
      // (live-proven 2026-10-11), so the drift hits pnpm-lock.yaml the
      // same way — and CI's `pnpm install --frozen-lockfile` dies with
      // ERR_PNPM_OUTDATED_LOCKFILE (live-proven on the audit reference
      // project: better-sqlite3 lockfile ^12.11.1 vs manifest ^12.6.0).
      mockPnpmRangeRewrite();
      const installer = createDependencyInstaller({ agent: "pnpm", fs: fsStore });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      const calls = (executeCommand as Mock).mock.calls as [string, string[]][];
      const resyncs = calls.filter(
        ([cmd, args]) =>
          cmd === "pnpm" &&
          args[0] === "install" &&
          args.includes("--lockfile-only"),
      );
      // Only the deps batch rewrote (pins are saved verbatim by pnpm):
      // exactly one resync, with the flag pnpm's own error message
      // recommends.
      expect(resyncs).toHaveLength(1);
    });

    test("yarn@berry resynchronizes with --mode=update-lockfile", async () => {
      mockNpmCaretRewrite();
      const installer = createDependencyInstaller({
        agent: "yarn@berry",
        fs: fsStore,
      });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      const calls = (executeCommand as Mock).mock.calls as [string, string[]][];
      const resyncs = calls.filter(
        ([cmd, args]) =>
          cmd === "yarn" &&
          args[0] === "install" &&
          args.includes("--mode=update-lockfile"),
      );
      expect(resyncs).toHaveLength(2);
    });

    test("verbatim persistence never triggers a lockfile resync", async () => {
      // yarn classic/berry and bun save specs verbatim: reconcile is a
      // read-and-skip, so no lockfile refresh may run. The resync exists
      // ONLY to repair a rewrite the manager actually performed —
      // running it unconditionally would churn every install.
      mockVerbatimSave();
      const installer = createDependencyInstaller({
        agent: "yarn@berry",
        fs: fsStore,
      });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      const calls = (executeCommand as Mock).mock.calls as [string, string[]][];
      // Exactly the two install batches — nothing else.
      expect(calls).toHaveLength(2);
      expect(
        calls.some(([, args]) =>
          args.includes("--lockfile-only") ||
          args.includes("--package-lock-only") ||
          args.includes("--mode=update-lockfile"),
        ),
      ).toBe(false);
    });

    test("a failed lockfile resync surfaces as an install failure, never silently", async () => {
      mockNpmCaretRewrite();
      // The install batches succeed; the resync dies the way execa does
      // on a non-zero exit.
      const inner = (executeCommand as Mock).getMockImplementation();
      (executeCommand as Mock).mockImplementation(
        async (command: string, args: string[]) => {
          if (args.includes("--package-lock-only")) {
            throw Object.assign(
              new Error("EPERM: operation not permitted, open 'package-lock.json'"),
              {
                exitCode: 1,
                all: "EPERM: operation not permitted, open 'package-lock.json'",
              },
            );
          }
          return inner?.(command, args);
        },
      );
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("lockfile-sync");
        expect(result.output).toContain("EPERM");
      }
    });

    test("a manifest already matching the specs is not rewritten (byte-stable fixpoint)", async () => {
      // When the manager saved the commanded specs as-is (yarn/bun
      // verbatim; pnpm's verbatim pins), reconciliation must be a
      // read-and-skip: the only package.json writes are the two the
      // fake install itself made (byte-stable fixpoint — no rewrite
      // when every entry already states the commanded spec). The fake
      // below saves verbatim; pnpm's real range bump is covered by
      // mockPnpmRangeRewrite above.
      (executeCommand as Mock).mockImplementation(
        async (_command: string, args: string[]) => {
          const dev = args.includes("-D");
          const specs = args.filter((a) => a !== "install" && a !== "-D");
          const pkg =
            (await fsStore.readJson("/proj/package.json")) as
              | Record<string, unknown>
              | undefined ?? {};
          const section = dev ? "devDependencies" : "dependencies";
          const entries = (pkg[section] ?? {}) as Record<string, string>;
          for (const spec of specs) {
            const at = spec.lastIndexOf("@");
            const name = at > 0 ? spec.slice(0, at) : spec;
            entries[name] = at > 0 ? spec.slice(at + 1) : "^18.0.7";
          }
          pkg[section] = entries;
          await fsStore.writeJson("/proj/package.json", pkg);
          return { all: "added 42 packages" };
        },
      );
      const installer = createDependencyInstaller({ agent: "pnpm", fs: fsStore });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      const pkg = JSON.parse(fsStore.read("/proj/package.json"));
      expect(pkg.devDependencies.prisma).toBe("7.10.0");
      expect(pkg.dependencies["better-sqlite3"]).toBe("^12.6.0");
      const pkgWrites = fsStore.writeLog.filter((p) =>
        p.endsWith("package.json"),
      );
      // Exactly the two fake-install writes — reconciliation added none.
      expect(pkgWrites).toHaveLength(2);
    });

    test("entries outside the plan survive reconciliation untouched", async () => {
      // A user's own declaration for a package DXG did not install is
      // not the installer's business: reconciliation touches ONLY the
      // names the plan actually installed.
      await fsStore.writeJson("/proj/package.json", {
        name: "user-project",
        dependencies: { dotenv: "^17.0.0" },
      });
      mockNpmCaretRewrite();
      const installer = createDependencyInstaller({ agent: "npm", fs: fsStore });

      const result = await installer.install(defaultPlan, { cwd: "/proj" });

      expect(result.success).toBe(true);
      const pkg = JSON.parse(fsStore.read("/proj/package.json"));
      expect(pkg.name).toBe("user-project");
      expect(pkg.dependencies.dotenv).toBe("^17.0.0");
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
