import { describe, test, expect } from "vitest";
import {
  LOGO_LINES,
  renderBanner,
  renderLogo,
  shouldShowLogo,
} from "../src/logo";

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;]*m/;

describe("logo", () => {
  test("has six lines of the same width, made of block characters only", () => {
    expect(LOGO_LINES).toHaveLength(6);
    expect(new Set(LOGO_LINES.map((line) => line.length)).size).toBe(1);
    for (const line of LOGO_LINES) {
      expect(line).toMatch(/^[█╗╔╝╚═║ ]+$/);
    }
  });

  test("renders one gray per line when colors are enabled", () => {
    const lines = renderLogo(true);

    expect(lines).toHaveLength(LOGO_LINES.length);
    for (const line of lines) expect(line).toMatch(ANSI);
    // a gradient: no two consecutive lines share the same color code
    const colors = lines.map((line) => line.match(/\x1b\[38;5;(\d+)m/)?.[1]);
    expect(new Set(colors).size).toBe(lines.length);
  });

  test("renders plain text, without any escape code, when colors are disabled", () => {
    const lines = renderLogo(false);

    expect(lines.join("\n")).not.toMatch(ANSI);
    expect(lines[0]).toBe(LOGO_LINES[0].trimEnd());
  });
});

describe("banner", () => {
  test("lists the commands and shows the version", () => {
    const banner = renderBanner("1.2.3", false);

    expect(banner).toContain("v1.2.3");
    expect(banner).toContain("dxg add db");
    expect(banner).toContain("dxg doctor --fix");
    expect(banner).toContain("npx @dxgjs/cli add db");
    expect(banner).toContain("https://github.com/dxgjs/dxg");
  });

  test("contains no escape code when colors are disabled", () => {
    expect(renderBanner("1.2.3", false)).not.toMatch(ANSI);
    expect(renderBanner("1.2.3", true)).toMatch(ANSI);
  });

  test("aligns the command descriptions in a column", () => {
    const lines = renderBanner("1.2.3", false).split("\n");
    const descriptions = [
      "Set up a database with Prisma ORM",
      "Diagnose your DXG project",
      "Repair what can be repaired",
    ];

    const offsets = descriptions.map((description) => {
      const line = lines.find((l) => l.includes(description));
      expect(line).toBeDefined();
      return line!.indexOf(description);
    });

    expect(new Set(offsets).size).toBe(1);
  });
});

describe("shouldShowLogo", () => {
  const interactive = { isTTY: true, env: {} as NodeJS.ProcessEnv };

  test("shows the logo in an interactive terminal", () => {
    expect(shouldShowLogo(interactive)).toBe(true);
  });

  test("hides it when output is piped or redirected", () => {
    expect(shouldShowLogo({ ...interactive, isTTY: false })).toBe(false);
  });

  test("hides it in CI", () => {
    expect(shouldShowLogo({ ...interactive, env: { CI: "true" } })).toBe(false);
    expect(shouldShowLogo({ ...interactive, env: { CI: "1" } })).toBe(false);
  });

  test("does not treat an explicitly disabled CI variable as CI", () => {
    expect(shouldShowLogo({ ...interactive, env: { CI: "false" } })).toBe(true);
    expect(shouldShowLogo({ ...interactive, env: { CI: "0" } })).toBe(true);
    expect(shouldShowLogo({ ...interactive, env: { CI: "" } })).toBe(true);
  });

  test("hides it for machine-readable output (--json)", () => {
    expect(shouldShowLogo({ ...interactive, json: true })).toBe(false);
  });
});
