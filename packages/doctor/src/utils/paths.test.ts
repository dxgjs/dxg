import { describe, it, expect } from "vitest";
import { toRelativePath, normalizeSeparators, toDisplayPath } from "./paths";

describe("path utilities", () => {
  describe("toRelativePath", () => {
    it("converts absolute path to relative path", () => {
      expect(toRelativePath("/home/user/project/prisma/schema.prisma", "/home/user/project")).toBe("prisma/schema.prisma");
    });

    it("returns '.' when path equals cwd", () => {
      expect(toRelativePath("/home/user/project", "/home/user/project")).toBe(".");
    });

    it("returns original path when outside cwd", () => {
      expect(toRelativePath("/home/other/file.txt", "/home/user/project")).toBe("/home/other/file.txt");
    });

    it("handles Windows paths", () => {
      expect(toRelativePath("C:\\Users\\user\\project\\prisma\\schema.prisma", "C:\\Users\\user\\project")).toBe("prisma/schema.prisma");
    });

    it("handles Windows paths with mixed separators", () => {
      expect(toRelativePath("C:/Users/user/project/prisma/schema.prisma", "C:\\Users\\user\\project")).toBe("prisma/schema.prisma");
    });
  });

  describe("normalizeSeparators", () => {
    it("converts backslashes to forward slashes", () => {
      expect(normalizeSeparators("path\\to\\file")).toBe("path/to/file");
    });

    it("leaves forward slashes unchanged", () => {
      expect(normalizeSeparators("path/to/file")).toBe("path/to/file");
    });

    it("handles empty string", () => {
      expect(normalizeSeparators("")).toBe("");
    });
  });

  describe("toDisplayPath", () => {
    it("converts absolute path to relative with normalized separators", () => {
      expect(toDisplayPath("C:\\Users\\user\\project\\prisma\\schema.prisma", "C:\\Users\\user\\project")).toBe("prisma/schema.prisma");
    });

    it("handles Unix paths", () => {
      expect(toDisplayPath("/home/user/project/lib/prisma.ts", "/home/user/project")).toBe("lib/prisma.ts");
    });

    it("returns original path when outside cwd", () => {
      expect(toDisplayPath("/home/other/file.txt", "/home/user/project")).toBe("/home/other/file.txt");
    });
  });
});