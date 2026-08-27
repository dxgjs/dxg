import { describe, test, expect, beforeEach } from "vitest";
import { Terminal } from "./src/index";
import { Text } from "./src/components/Text";

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
