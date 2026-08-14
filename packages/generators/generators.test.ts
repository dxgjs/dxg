import { describe, test, expect, vi } from "vitest";
import { reactComponentGenerator } from "./src/index";
import { Logger } from "@dxgjs/logger";

describe("Generators Package", () => {
  test("reactComponentGenerator should exist", () => {
    expect(reactComponentGenerator).toBeDefined();
    expect(reactComponentGenerator.name).toBe("react-component");
    expect(reactComponentGenerator.description).toBe(
      "Generate a basic React component",
    );
    expect(Array.isArray(reactComponentGenerator.prompts)).toBe(true);
    expect(reactComponentGenerator.prompts.length).toBe(2);
  });

  test("reactComponentGenerator should have correct prompts", () => {
    const prompts = reactComponentGenerator.prompts;

    // First prompt: componentName
    expect(prompts[0].name).toBe("componentName");
    expect(prompts[0].type).toBe("input");
    expect(prompts[0].message).toBe("What should the component be called?");
    expect(typeof prompts[0].validate).toBe("function");

    // Second prompt: componentPath
    expect(prompts[1].name).toBe("componentPath");
    expect(prompts[1].type).toBe("input");
    expect(prompts[1].message).toBe(
      "Where should the component be created? (e.g., components/Button)",
    );
    expect(prompts[1].default).toBe("components");
  });

  test("reactComponentGenerator should generate component files", async () => {
    // Mock logger
    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    } as unknown as Logger;

    // Mock fs
    const mockFs = {
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      stat: vi.fn(),
      readdir: vi.fn(),
    };

    const context = {
      logger: mockLogger,
      fs: mockFs,
    };

    const answers = {
      componentName: "TestComponent",
      componentPath: "components",
    };

    await reactComponentGenerator.run(answers, context);

    // Verify logger was called
    expect(mockLogger.info).toHaveBeenCalled();

    // Verify fs.writeFile was called twice (for component file and index file)
    expect(mockFs.writeFile).toHaveBeenCalledTimes(2);

    // Check first call (component file)
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      "components/TestComponent/TestComponent.tsx",
      expect.stringContaining("import React from 'react';"),
      { encoding: "utf8" },
    );

    // Check second call (index file)
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      "components/TestComponent/index.ts",
      expect.stringContaining("export { default } from './TestComponent';"),
      { encoding: "utf8" },
    );
  });
});
