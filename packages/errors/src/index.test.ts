import { describe, it, expect } from "vitest";
import {
  DXGError,
  PrismaVersionConflictError,
  ProviderUnsupportedError,
  BuildBlockedError,
  TemplateMissingError,
  InstallerFailureError,
  ValidationError,
  GitError,
  SpawnError,
  isDXGError,
  formatError,
  formatErrorJSON,
} from "./index";

describe("DXGError hierarchy", () => {
  it("should create base DXGError with all properties", () => {
    const error = new DXGError("TEST_CODE", "Test message", {
      recoverable: true,
      hints: ["hint1", "hint2"],
      docsUrl: "https://example.com",
      recoveryAction: "retry",
    });

    expect(error.code).toBe("TEST_CODE");
    expect(error.message).toBe("Test message");
    expect(error.recoverable).toBe(true);
    expect(error.hints).toEqual(["hint1", "hint2"]);
    expect(error.docsUrl).toBe("https://example.com");
    expect(error.recoveryAction).toBe("retry");
  });

  it("should serialize to JSON", () => {
    const error = new DXGError("TEST_CODE", "Test message");
    const json = error.toJSON();

    expect(json).toEqual({
      name: "DXGError",
      code: "TEST_CODE",
      message: "Test message",
      recoverable: false,
      hints: [],
      docsUrl: "",
      recoveryAction: "abort",
      stack: error.stack,
      cause: null,
    });
  });
});

describe("PrismaVersionConflictError", () => {
  it("should create with correct defaults", () => {
    const error = new PrismaVersionConflictError("Version mismatch");

    expect(error.name).toBe("PrismaVersionConflictError");
    expect(error.code).toBe("DXG_E_PRISMA_VERSION_CONFLICT");
    expect(error.recoverable).toBe(true);
    expect(error.recoveryAction).toBe("reconfigure");
    expect(error.hints.length).toBeGreaterThan(0);
  });
});

describe("ProviderUnsupportedError", () => {
  it("should create with provider name in message", () => {
    const error = new ProviderUnsupportedError("unknown-db");

    expect(error.name).toBe("ProviderUnsupportedError");
    expect(error.code).toBe("DXG_E_UNSUPPORTED_PROVIDER");
    expect(error.message).toContain("unknown-db");
  });
});

describe("BuildBlockedError", () => {
  it("should create with package list", () => {
    const error = new BuildBlockedError(["pkg1", "pkg2"]);

    expect(error.name).toBe("BuildBlockedError");
    expect(error.code).toBe("DXG_E_BUILD_BLOCKED");
    expect(error.message).toContain("pkg1");
    expect(error.message).toContain("pkg2");
  });
});

describe("TemplateMissingError", () => {
  it("should create with template path", () => {
    const error = new TemplateMissingError("/path/to/template.ts");

    expect(error.name).toBe("TemplateMissingError");
    expect(error.code).toBe("DXG_E_TEMPLATE_MISSING");
    expect(error.message).toContain("/path/to/template.ts");
    expect(error.recoverable).toBe(false);
  });
});

describe("InstallerFailureError", () => {
  it("should create with reason and output", () => {
    const error = new InstallerFailureError("network", "connection refused");

    expect(error.name).toBe("InstallerFailureError");
    expect(error.code).toBe("DXG_E_INSTALLER_FAILURE");
    expect(error.message).toContain("network");
    expect(error.message).toContain("connection refused");
  });
});

describe("ValidationError", () => {
  it("should create with message", () => {
    const error = new ValidationError("Invalid input");

    expect(error.name).toBe("ValidationError");
    expect(error.code).toBe("DXG_E_VALIDATION");
    expect(error.message).toBe("Invalid input");
  });
});

describe("GitError", () => {
  it("should create with message", () => {
    const error = new GitError("not a git repo");

    expect(error.name).toBe("GitError");
    expect(error.code).toBe("DXG_E_GIT");
    expect(error.message).toContain("not a git repo");
  });
});

describe("SpawnError", () => {
  it("should create with command and args", () => {
    const error = new SpawnError("prisma", ["generate"], "command not found");

    expect(error.name).toBe("SpawnError");
    expect(error.code).toBe("DXG_E_SPAWN");
    expect(error.message).toContain("prisma");
    expect(error.message).toContain("generate");
  });
});

describe("isDXGError", () => {
  it("should return true for DXGError instances", () => {
    expect(isDXGError(new DXGError("TEST", "msg"))).toBe(true);
    expect(isDXGError(new PrismaVersionConflictError("msg"))).toBe(true);
    expect(isDXGError(new ValidationError("msg"))).toBe(true);
  });

  it("should return false for non-DXGError", () => {
    expect(isDXGError(new Error("regular"))).toBe(false);
    expect(isDXGError("string")).toBe(false);
    expect(isDXGError(null)).toBe(false);
    expect(isDXGError(undefined)).toBe(false);
    expect(isDXGError({})).toBe(false);
  });
});

describe("formatError", () => {
  it("should format DXGError with hints and docs", () => {
    const error = new ValidationError("Invalid input", {
      hints: ["Check the input", "Try again"],
      docsUrl: "https://example.com",
      recoveryAction: "reconfigure",
    });
    const formatted = formatError(error);

    expect(formatted).toContain("DXG_E_VALIDATION");
    expect(formatted).toContain("Invalid input");
    expect(formatted).toContain("Check the input");
    expect(formatted).toContain("Try again");
    expect(formatted).toContain("https://example.com");
    expect(formatted).toContain("reconfigure");
  });

  it("should format regular Error", () => {
    const error = new Error("regular error");
    const formatted = formatError(error);

    expect(formatted).toBe("Error: regular error");
  });

  it("should format unknown error", () => {
    const formatted = formatError("string error");
    expect(formatted).toBe("Error: string error");
  });
});

describe("formatErrorJSON", () => {
  it("should format DXGError as JSON object", () => {
    const error = new ValidationError("Invalid input");
    const json = formatErrorJSON(error);

    expect(json).toEqual({
      name: "ValidationError",
      code: "DXG_E_VALIDATION",
      message: "Invalid input",
      recoverable: true,
      hints: [
        "Check the error message for the specific validation failure",
        "Provide the required values and try again",
      ],
      docsUrl: "https://dxg.dev/errors/validation",
      recoveryAction: "reconfigure",
      stack: error.stack,
      cause: null,
    });
  });

  it("should format regular Error as JSON", () => {
    const error = new Error("regular error");
    const json = formatErrorJSON(error);

    expect(json).toEqual({
      name: "Error",
      code: "DXG_E_UNKNOWN",
      message: "regular error",
      recoverable: false,
      hints: [],
      docsUrl: "",
      recoveryAction: "abort",
      stack: error.stack,
      cause: null,
    });
  });

  it("should format unknown error as JSON", () => {
    const json = formatErrorJSON("string error");

    expect(json).toEqual({
      name: "UnknownError",
      code: "DXG_E_UNKNOWN",
      message: "string error",
      recoverable: false,
      hints: [],
      docsUrl: "",
      recoveryAction: "abort",
      stack: null,
      cause: null,
    });
  });
});

describe("formatDXGError (legacy)", () => {
  it("should alias formatError", async () => {
    const { formatDXGError } = await import("./index");
    const error = new ValidationError("test");
    expect(formatDXGError(error)).toBe(formatError(error));
  });
});