import { describe, test, expect, vi, beforeEach } from "vitest";

// The generators package is mocked: these tests exercise prepareContext's
// package-manager reconciliation — the ONE detection that feeds BOTH the
// installer and the awareness — not the install engine itself.
const mocks = vi.hoisted(() => ({
  createDependencyInstaller: vi.fn(
    () => ({ agent: "yarn@berry", install: vi.fn() }),
  ),
  detectPackageManagerAgent: vi.fn(),
}));

vi.mock("@dxgjs/generators", () => ({
  createDependencyInstaller: mocks.createDependencyInstaller,
  detectPackageManagerAgent: mocks.detectPackageManagerAgent,
}));

import { prepareContext } from "../src/generator-run";
import type { ProjectAwareness } from "@dxgjs/workspace";
import type { CommanderOptions } from "../src/generator-run";

/** Minimal awareness — prepareContext only consumes projectRoot. */
function makeAwareness(packageManager: string): ProjectAwareness {
  return {
    projectRoot: process.cwd(),
    workspaceRoot: process.cwd(),
    framework: { name: "unknown", detected: false },
    language: { name: "typescript", detected: false },
    packageManager,
    styling: { name: "", detected: false, version: null, configFile: null },
    capabilities: {
      hasTests: false,
      hasLinting: false,
      hasFormatter: false,
      hasCI: false,
      hasDocker: false,
    },
    packageJson: { name: "test", private: true },
  };
}

const baseOptions: CommanderOptions = {
  verbose: false,
  quiet: false,
  dryRun: false,
  force: false,
  nonInteractive: false,
};

describe("prepareContext — package-manager single source of truth", () => {
  beforeEach(() => {
    // Each test asserts on its OWN invocation counts: clear the shared
    // mocks' call history between tests (implementations survive
    // mockClear; every test re-sets its detectPackageManagerAgent value) —
    // the same reset convention as the database test suites.
    vi.clearAllMocks();
  });

  test("the detected agent drives BOTH the installer and awareness.packageManager", async () => {
    mocks.detectPackageManagerAgent.mockResolvedValue("yarn@berry");
    const awareness = makeAwareness("yarn"); // the fs-based lockfile guess

    const context = await prepareContext({ ...baseOptions }, awareness);

    // Same manager reported and installed through — they can never diverge.
    expect(context.awareness.packageManager).toBe("yarn");
    expect(mocks.createDependencyInstaller).toHaveBeenCalledWith(
      expect.objectContaining({ agent: "yarn@berry" }),
    );
    expect(context.installer).toBeDefined();
  });

  test("yarn@berry collapses to the coarse yarn display name", async () => {
    mocks.detectPackageManagerAgent.mockResolvedValue("yarn@berry");
    const context = await prepareContext(
      { ...baseOptions },
      makeAwareness("unknown"),
    );
    expect(context.awareness.packageManager).toBe("yarn");
  });

  test("coarse agents pass through unchanged (npm, pnpm, bun, yarn)", async () => {
    for (const agent of ["npm", "pnpm", "bun", "yarn"] as const) {
      mocks.detectPackageManagerAgent.mockResolvedValue(agent);
      const context = await prepareContext(
        { ...baseOptions },
        makeAwareness("unknown"),
      );
      expect(context.awareness.packageManager).toBe(agent);
    }
  });

  test("dry-run detects the agent (consistent display) but builds no installer", async () => {
    mocks.detectPackageManagerAgent.mockResolvedValue("pnpm");
    const context = await prepareContext(
      { ...baseOptions, dryRun: true },
      makeAwareness("unknown"),
    );

    // The planned run reports the manager a real run would use…
    expect(context.awareness.packageManager).toBe("pnpm");
    // …but nothing installs in dry-run mode.
    expect(mocks.createDependencyInstaller).not.toHaveBeenCalled();
    expect(context.installer).toBeUndefined();
  });

  test("no detectable agent keeps the awareness fallback and no installer", async () => {
    mocks.detectPackageManagerAgent.mockResolvedValue(null);
    const awareness = makeAwareness("npm");

    const context = await prepareContext({ ...baseOptions }, awareness);

    // The input awareness object survives unchanged (no agent to win).
    expect(context.awareness.packageManager).toBe("npm");
    expect(mocks.createDependencyInstaller).not.toHaveBeenCalled();
    expect(context.installer).toBeUndefined();
  });
});
