import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { setupDrizzleFlow } from "./drizzle-flow";
import type { GeneratorContext } from "../../types";

vi.mock("@dxgjs/prompts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dxgjs/prompts")>();
  return {
    ...actual,
    note: vi.fn(),
    outro: vi.fn(),
  };
});

import { note, outro } from "@dxgjs/prompts";

describe("drizzle-flow", () => {
  let mockContext: GeneratorContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      fs: {} as any,
      templates: { render: vi.fn() },
      awareness: {} as any,
      dryRun: false,
      force: false,
      nonInteractive: false,
    };
  });

  test("shows coming soon message via Clack note and outro", async () => {
    await setupDrizzleFlow({}, mockContext);

    expect(note).toHaveBeenCalledOnce();
    expect(String(note.mock.calls[0][0])).toContain("Drizzle ORM support is coming soon");
    expect(outro).toHaveBeenCalledOnce();
    expect(String(outro.mock.calls[0][0])).toContain("Check back later for Drizzle support");
  });

  test("works in non-interactive mode (same behavior)", async () => {
    mockContext.nonInteractive = true;
    await setupDrizzleFlow({}, mockContext);

    expect(note).toHaveBeenCalledOnce();
    expect(outro).toHaveBeenCalledOnce();
  });
});