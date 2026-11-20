import { describe, test, expect, vi, beforeEach } from "vitest";
import { ValidationError } from "@dxgjs/errors";
import { setupDrizzleFlow } from "./drizzle-flow";
import type { GeneratorContext } from "../../types";

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

  test("fails with a ValidationError instead of reporting success", async () => {
    await expect(setupDrizzleFlow({}, mockContext)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(setupDrizzleFlow({}, mockContext)).rejects.toThrow(
      "Drizzle ORM is not supported yet.",
    );
  });

  test("tells the user how to proceed with Prisma", async () => {
    const error = await setupDrizzleFlow({}, mockContext).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    const hints = (error as ValidationError).hints.join("\n");
    expect(hints).toContain("coming soon");
    expect(hints).toContain("--orm prisma");
  });

  test("behaves the same in non-interactive mode", async () => {
    mockContext.nonInteractive = true;

    await expect(setupDrizzleFlow({}, mockContext)).rejects.toThrow(
      "Drizzle ORM is not supported yet.",
    );
  });

  test("does not touch the filesystem", async () => {
    await setupDrizzleFlow({}, mockContext).catch(() => undefined);

    expect(mockContext.fs.writeFile).not.toHaveBeenCalled();
    expect(mockContext.fs.mkdir).not.toHaveBeenCalled();
  });
});
