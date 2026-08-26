import { describe, test, expect, beforeEach, vi } from "vitest";
import { Terminal } from "./src/index";
import { Text } from "./src/components/Text";
import { ansi } from "./src/ansi";
import * as semantic from "./src/semantic";

describe("Terminal", () => {
  let terminal: Terminal;

  beforeEach(() => {
    terminal = new Terminal(10, 5); // 10 columns, 5 rows
  });

  test("should initialize with correct dimensions", () => {
    expect(terminal.getWidth()).toBe(10);
    expect(terminal.getHeight()).toBe(5);
  });

  test("should clear buffer", () => {
    // Add some content
    terminal.getBuffer()[0][0] = "A";
    terminal.getBuffer()[0][1] = "B";

    terminal.clear();
    const buffer = terminal.getBuffer();
    expect(buffer[0][0]).toBe(" ");
    expect(buffer[0][1]).toBe(" ");
  });

  test("should add component", () => {
    const textComponent = new Text("Hello", 0, 0);
    terminal.addComponent(textComponent);
    // Component should be added (we can't directly test internal array, but we can test render)
  });

  test("should render components", () => {
    const textComponent = new Text("Hi", 0, 0);
    terminal.addComponent(textComponent);
    terminal.render();

    const buffer = terminal.getBuffer();
    expect(buffer[0][0]).toBe("H");
    expect(buffer[0][1]).toBe("i");
    expect(buffer[0][2]).toBe(" "); // padding
  });

  test("should handle component outside bounds", () => {
    const textComponent = new Text("VeryLongTextThatExceedsWidth", 5, 0);
    terminal.addComponent(textComponent);
    terminal.render();

    const buffer = terminal.getBuffer();
    // Text starts at x=5, y=0. Width is 10, so columns 5-9 are visible.
    // String: V(0) e(1) r(2) y(3) L(4) o(5) n(6) g(7) T(8) e(9) x(10) t(11) ...
    // Expected in buffer:
    // col5: V, col6: e, col7: r, col8: y, col9: L
    expect(buffer[0][5]).toBe("V");
    expect(buffer[0][6]).toBe("e");
    expect(buffer[0][7]).toBe("r");
    expect(buffer[0][8]).toBe("y");
    expect(buffer[0][9]).toBe("L");
    // col10 is out of bounds (should be undefined)
    expect(buffer[0][10]).toBeUndefined();
  });

  test("should get buffer correctly", () => {
    const buffer = terminal.getBuffer();
    expect(buffer.length).toBe(5); // height
    expect(buffer[0].length).toBe(10); // width
    // All should be empty spaces initially
    expect(buffer[0][0]).toBe(" ");
  });
});

describe("Text Component", () => {
  test("should create text component", () => {
    const text = new Text("Test", 2, 3);
    expect(text.getX()).toBe(2);
    expect(text.getY()).toBe(3);
    expect(text.getContent()).toBe("Test");
  });

  test("should render text at position", () => {
    const terminal = new Terminal(10, 5);
    const text = new Text("Hi", 2, 1);
    terminal.addComponent(text);
    terminal.render();

    const buffer = terminal.getBuffer();
    expect(buffer[1][2]).toBe("H"); // y=1, x=2
    expect(buffer[1][3]).toBe("i"); // y=1, x=3
    expect(buffer[1][4]).toBe(" "); // padding
  });
});

describe("ANSI Helpers", () => {
  test("should provide color helpers", () => {
    expect(ansi.red("test")).toContain("\x1b[31m");
    expect(ansi.blue("test")).toContain("\x1b[34m");
    expect(ansi.green("test")).toContain("\x1b[32m");
    expect(ansi.reset).toBe("\x1b[0m");
  });

  test("should provide background helpers", () => {
    expect(ansi.bgRed("test")).toContain("\x1b[41m");
    expect(ansi.bgBlue("test")).toContain("\x1b[44m");
  });

  test("should provide style helpers", () => {
    expect(ansi.bold("test")).toContain("\x1b[1m");
    expect(ansi.dim("test")).toContain("\x1b[2m");
    expect(ansi.italic("test")).toContain("\x1b[3m");
    expect(ansi.underline("test")).toContain("\x1b[4m");
  });

  test("should strip ANSI codes", () => {
    const colored = ansi.red("test");
    expect(ansi.strip(colored)).toBe("test");
    expect(ansi.strip("plain")).toBe("plain");
  });
});

describe("Semantic Utilities", () => {
  test("should provide semantic color primitives", () => {
    expect(semantic.success("test")).toContain("\x1b[32m"); // green
    expect(semantic.error("test")).toContain("\x1b[31m"); // red
    expect(semantic.warning("test")).toContain("\x1b[33m"); // yellow
    expect(semantic.info("test")).toContain("\x1b[34m"); // blue
    expect(semantic.muted("test")).toContain("\x1b[90m"); // gray (bright black)
    expect(semantic.accent("test")).toContain("\x1b[35m"); // magenta
  });

  test("should provide symbol vocabulary", () => {
    // Step indicators
    expect(semantic.symbols.stepActive).toContain("◆");
    expect(semantic.symbols.stepCompleted).toContain("◇");
    expect(semantic.symbols.stepCancelled).toContain("■");

    // Selection indicators
    expect(semantic.symbols.selectActive).toContain("●");
    expect(semantic.symbols.selectInactive).toContain("○");

    // Status indicators
    expect(semantic.symbols.statusSuccess).toContain("✓");
    expect(semantic.symbols.statusError).toContain("✕");
    expect(semantic.symbols.statusWarning).toContain("!");
    expect(semantic.symbols.statusInfo).toContain("•");

    // Structural elements
    expect(semantic.symbols.barVertical).toContain("│");
    expect(semantic.symbols.barHorizontal).toContain("─");
    expect(semantic.symbols.boxTopLeft).toContain("┌");
    expect(semantic.symbols.boxTopRight).toContain("┐");
    expect(semantic.symbols.boxBottomLeft).toContain("└");
    expect(semantic.symbols.boxBottomRight).toContain("┘");
  });

  test("should format step indicators", () => {
    const active = semantic.step("Installing dependencies", "active");
    const completed = semantic.step("Installing dependencies", "completed");
    const cancelled = semantic.step("Installing dependencies", "cancelled");

    expect(active).toMatch(/◆/);
    expect(active).toMatch(/Installing dependencies/);
    expect(completed).toMatch(/◇/);
    expect(completed).toMatch(/Installing dependencies/);
    expect(cancelled).toMatch(/■/);
    expect(cancelled).toMatch(/Installing dependencies/);
  });

  test("should format status messages", () => {
    expect(semantic.successMessage("Operation completed")).toMatch(/✓/);
    expect(semantic.successMessage("Operation completed")).toMatch(/Operation completed/);
    expect(semantic.errorMessage("Operation failed")).toMatch(/✕/);
    expect(semantic.errorMessage("Operation failed")).toMatch(/Operation failed/);
    expect(semantic.warningMessage("Warning message")).toMatch(/!/);
    expect(semantic.warningMessage("Warning message")).toMatch(/Warning message/);
    expect(semantic.infoMessage("Info message")).toMatch(/•/);
    expect(semantic.infoMessage("Info message")).toMatch(/Info message/);
  });

  test("should create visual separators", () => {
    const sep = semantic.separator(5);
    expect(sep).toContain("─"); // Contains the bar character
    // Check that it has 5 bar characters (after removing ANSI codes)
    const plainSep = ansi.strip(sep);
    expect(plainSep).toBe("─────");
  });

  test("should create boxed content", () => {
    const boxed = semantic.box("Hello\nWorld", "Test Box");
    expect(boxed).toContain("┌");
    expect(boxed).toContain("┐");
    expect(boxed).toContain("└");
    expect(boxed).toContain("┘");
    expect(boxed).toContain("Test Box");
    expect(boxed).toContain("Hello");
    expect(boxed).toContain("World");

    // Check that it strips to expected plain text
    const plainBoxed = ansi.strip(boxed);
    expect(plainBoxed).toContain("Test Box");
    expect(plainBoxed).toContain("Hello");
    expect(plainBoxed).toContain("World");
  });
});