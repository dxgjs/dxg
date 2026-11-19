import { describe, test, expect, vi, beforeEach, type Mock } from "vitest";
import { setupDrizzleFlow } from "./drizzle-flow";
import type { GeneratorContext } from "../../types";
import { note as noteMock, outro as outroMock } from "@dxgjs/prompts";

vi.mock("@dxgjs/prompts", async () => {
  const actual = await vi.importActual("@dxgjs/prompts");
  return {
    ...actual,
    note: vi.fn(),
    outro: vi.fn(),
  };
});

describe("drizzle-flow", () => {
  let mockContext: GeneratorContext;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = {
      fs: {
        pathExists: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        stat: vi.fn(),
        mkdir: vi.fn(),
        readdir: vi.fn(),
        readJson: vi.fn(),
        writeJson: vi.fn(),
      },
      templates: { render: vi.fn() },
      awareness: {} as GeneratorContext["awareness"],
      dryRun: false,
      force: false,
      nonInteractive: false,
    };
  });

  test("shows coming soon message via Clack note and outro", async () => {
    await setupDrizzleFlow({}, mockContext);

    expect(noteMock).toHaveBeenCalledOnce();
    expect(String((noteMock as Mock).mock.calls[0][0])).toContain("Drizzle ORM support is coming soon");
    expect(outroMock).toHaveBeenCalledOnce();
    expect(String((outroMock as Mock).mock.calls[0][0])).toContain("Check back later for Drizzle support");
  });

  test("works in non-interactive mode (same behavior)", async () => {
    mockContext.nonInteractive = true;
    await setupDrizzleFlow({}, mockContext);

    expect(noteMock).toHaveBeenCalledOnce();
    expect(outroMock).toHaveBeenCalledOnce();
  });
});