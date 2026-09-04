import { describe, expect, test } from "vitest";
import { mergeAllowBuildsBlock } from "./approvals";

// mergeAllowBuildsBlock is the pure transform behind applyPnpmAllowBuilds.
// Its contract is BYTE-PRESERVING: pnpm-workspace.yaml is user-owned, so
// comments, ordering and every other key survive untouched. These tests pin
// the lab-verified behaviors (pnpm 11.18.0): "@"-prefixed keys MUST be
// single-quoted or pnpm's YAML parser fails ("bad indentation of a mapping
// entry" — lab e2e-pnpm first attempt), and existing entries are never
// duplicated or flipped.

describe("mergeAllowBuildsBlock", () => {
  test("creates the block in an empty document", () => {
    expect(mergeAllowBuildsBlock("", ["better-sqlite3"])).toBe(
      "allowBuilds:\n  better-sqlite3: true\n",
    );
  });
  test("creates the block in a whitespace-only document", () => {
    expect(mergeAllowBuildsBlock("\n  \n", ["prisma"])).toBe(
      "allowBuilds:\n  prisma: true\n",
    );
  });
  test("appends after existing top-level keys, preserving them byte-for-byte", () => {
    const yaml = "packages:\n  - apps/*\n  - packages/*\n";
    expect(mergeAllowBuildsBlock(yaml, ["prisma"])).toBe(
      "packages:\n  - apps/*\n  - packages/*\nallowBuilds:\n  prisma: true\n",
    );
  });
  test("quotes keys starting with @ (pnpm YAML requirement)", () => {
    expect(mergeAllowBuildsBlock("", ["@prisma/engines"])).toBe(
      "allowBuilds:\n  '@prisma/engines': true\n",
    );
  });
  test("is idempotent: already-approved names change nothing", () => {
    const yaml = "allowBuilds:\n  prisma: true\n";
    expect(mergeAllowBuildsBlock(yaml, ["prisma"])).toBe(yaml);
  });
  test("is idempotent for quoted scoped keys too", () => {
    const yaml = "allowBuilds:\n  '@prisma/engines': true\n";
    expect(mergeAllowBuildsBlock(yaml, ["@prisma/engines"])).toBe(yaml);
  });
  test("appends only the missing names inside an existing block", () => {
    const yaml = "allowBuilds:\n  prisma: true\n";
    expect(mergeAllowBuildsBlock(yaml, ["prisma", "better-sqlite3", "@prisma/engines"])).toBe(
      "allowBuilds:\n  prisma: true\n  better-sqlite3: true\n  '@prisma/engines': true\n",
    );
  });
  test("never flips an explicit user denial (false) to true", () => {
    // Security: a user's allowBuilds {pkg: false} must be preserved — the
    // entry exists so the merge must not re-add it either.
    const yaml = "allowBuilds:\n  some-native-pkg: false\n";
    const merged = mergeAllowBuildsBlock(yaml, ["some-native-pkg"]);
    expect(merged).toBe(yaml);
    expect(merged).not.toContain("some-native-pkg: true");
  });
  test("keeps a following top-level key intact when the block grows", () => {
    const yaml = "allowBuilds:\n  prisma: true\ncatalog:\n  react: 19.0.0\n";
    expect(mergeAllowBuildsBlock(yaml, ["better-sqlite3"])).toBe(
      "allowBuilds:\n  prisma: true\n  better-sqlite3: true\ncatalog:\n  react: 19.0.0\n",
    );
  });
  test("preserves inline comments on existing entries and around the block", () => {
    const yaml = [
      "# workspace root config",
      "packages:", // comment as an entry of its own line below
      "  - apps/*",
      "",
      "allowBuilds: # approved by the team",
      "  prisma: true # pinned",
      "",
      "# trailing comment",
    ].join("\n");
    const merged = mergeAllowBuildsBlock(yaml, ["better-sqlite3"]);
    expect(merged).toContain("allowBuilds: # approved by the team");
    expect(merged).toContain("  prisma: true # pinned");
    expect(merged).toContain("  better-sqlite3: true");
    expect(merged).toContain("# trailing comment");
    // The new entry lands inside the block, before the blank line that
    // ends it — NOT after the trailing comment.
    expect(merged.indexOf("better-sqlite3: true")).toBeLessThan(
      merged.indexOf("# trailing comment"),
    );
  });
  test("empty names list is a no-op", () => {
    const yaml = "packages:\n  - apps/*\n";
    expect(mergeAllowBuildsBlock(yaml, [])).toBe(yaml);
  });
});
