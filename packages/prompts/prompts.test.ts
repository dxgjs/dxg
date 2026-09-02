import { describe, test, expect, vi, beforeEach, beforeAll } from "vitest";
import type { PromptQuestion } from "./src/index";

// Mock implementations - declared at top level so they're accessible when the
// vi.mock factory below executes (it runs lazily on first import, in beforeAll,
// after these initializations).
const mockText = vi.fn();
const mockSelect = vi.fn();
const mockConfirm = vi.fn();
const mockIntro = vi.fn();
const mockOutro = vi.fn();
const mockNote = vi.fn();
const mockIsCancel = vi.fn(() => false);
const mockSpinner = vi.fn();
const mockCancel = vi.fn();

// Stand-in for Clack's internal cancel symbol (a unique symbol in the real lib)
const CANCEL = Symbol("clack:cancel");

// Mock @clack/prompts before importing our module
vi.mock("@clack/prompts", () => ({
  text: mockText,
  select: mockSelect,
  confirm: mockConfirm,
  intro: mockIntro,
  outro: mockOutro,
  note: mockNote,
  isCancel: mockIsCancel,
  spinner: mockSpinner,
  cancel: mockCancel,
}));

describe("Prompts Package", () => {
  let prompts: typeof import("./src/index");

  // Import the module after mocking
  beforeAll(async () => {
    prompts = await import("./src/index");
  });

  beforeEach(() => {
    // resetAllMocks clears call history AND implementations of every mock
    vi.resetAllMocks();
    mockIsCancel.mockReturnValue(false);
  });

  describe("Export surface", () => {
    test("should expose the documented API", () => {
      for (const name of [
        "prompt",
        "text",
        "confirm",
        "select",
        "intro",
        "outro",
        "note",
        "isCancel",
        "cancel",
        "spinner",
      ]) {
        expect(
          typeof prompts[name as keyof typeof prompts],
          `export "${name}"`,
        ).toBe("function");
      }
    });
  });

  // NOTE: the package re-exports @clack/prompts verbatim — the raw primitives
  // stay passthrough (consumers call isCancel(result) themselves, e.g. the
  // CLI showcase). The prompt() wrapper is different: it converts a resolved
  // cancel symbol into a rejection so generators' catch { isCancel(error) }
  // boundary actually runs.
  describe("Passthrough re-exports", () => {

    test("intro forwards the message unchanged", () => {
      prompts.intro("test message");
      expect(mockIntro).toHaveBeenCalledWith("test message");
    });

    test("outro forwards the message unchanged", () => {
      prompts.outro("test message");
      expect(mockOutro).toHaveBeenCalledWith("test message");
    });

    test("note forwards the message unchanged", () => {
      prompts.note("test message");
      expect(mockNote).toHaveBeenCalledWith("test message");
    });

    test("select resolves with the raw Clack value", async () => {
      mockSelect.mockResolvedValue("option1");

      const options = {
        message: "Choose an option",
        options: [
          { label: "Option 1", value: "option1" },
          { label: "Option 2", value: "option2" },
        ],
      };
      const result = await prompts.select(options);

      expect(result).toBe("option1");
      expect(mockSelect).toHaveBeenCalledWith(options);
    });

    test("select forwards the cancel symbol untouched (no auto-handling)", async () => {
      mockSelect.mockResolvedValue(CANCEL);
      mockIsCancel.mockReturnValue(true);

      const result = await prompts.select({
        message: "Choose an option",
        options: [],
      });

      // The raw cancel symbol is returned as-is; converting it (e.g. to
      // undefined) would break consumers that check isCancel(result)
      expect(result).toBe(CANCEL);
      expect(mockIsCancel).not.toHaveBeenCalled();
    });

    test("confirm resolves with the raw Clack value", async () => {
      mockConfirm.mockResolvedValue(true);

      const result = await prompts.confirm({ message: "Are you sure?" });

      expect(result).toBe(true);
      expect(mockConfirm).toHaveBeenCalledWith({ message: "Are you sure?" });
    });

    test("text resolves with the raw Clack value", async () => {
      mockText.mockResolvedValue("test input");

      const result = await prompts.text({ message: "Enter something" });

      expect(result).toBe("test input");
      expect(mockText).toHaveBeenCalledWith({ message: "Enter something" });
    });

    test("isCancel is forwarded to the underlying implementation", () => {
      mockIsCancel.mockReturnValue(true);

      expect(prompts.isCancel(CANCEL)).toBe(true);
      expect(mockIsCancel).toHaveBeenCalledWith(CANCEL);
    });

    test("cancel is forwarded to the underlying implementation", () => {
      prompts.cancel("Operation cancelled");

      expect(mockCancel).toHaveBeenCalledWith("Operation cancelled");
    });
  });

  describe("prompt()", () => {
    test("aggregates answers keyed by question name", async () => {
      mockText.mockResolvedValue("my-project");
      mockConfirm.mockResolvedValue(true);
      mockSelect.mockResolvedValue("sqlite");

      const questions: PromptQuestion[] = [
        { type: "input", name: "name", message: "Project name?" },
        { type: "confirm", name: "typescript", message: "Use TypeScript?" },
        {
          type: "select",
          name: "database",
          message: "Which database?",
          choices: [
            { name: "SQLite", value: "sqlite" },
            { name: "PostgreSQL", value: "postgres" },
          ],
        },
      ];

      const answers = await prompts.prompt(questions);

      expect(answers).toEqual({
        name: "my-project",
        typescript: true,
        database: "sqlite",
      });
    });

    test("input: uses the default value as placeholder", async () => {
      mockText.mockResolvedValue("typed");
      await prompts.prompt([
        { type: "input", name: "name", message: "Name?", default: "demo-app" },
      ]);

      expect(mockText).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Name?", placeholder: "demo-app" }),
      );
    });

    test("input: invokes function defaults for the placeholder", async () => {
      mockText.mockResolvedValue("typed");
      await prompts.prompt([
        {
          type: "input",
          name: "name",
          message: "Name?",
          default: () => "fn-value",
        },
      ]);

      expect(mockText).toHaveBeenCalledWith(
        expect.objectContaining({ placeholder: "fn-value" }),
      );
    });

    test("input: falls back to an empty placeholder", async () => {
      mockText.mockResolvedValue("typed");
      await prompts.prompt([{ type: "input", name: "name", message: "Name?" }]);

      expect(mockText).toHaveBeenCalledWith(
        expect.objectContaining({ placeholder: "" }),
      );
    });

    test("input: adapts custom validate to the Clack contract", async () => {
      mockText.mockResolvedValue("typed");
      await prompts.prompt([
        {
          type: "input",
          name: "pkg",
          message: "Package name?",
          validate: (input: unknown) => {
            if (input === "valid") return true;
            if (input === "invalid") return false;
            return "custom error";
          },
        },
      ]);

      const { validate } = mockText.mock.calls[0][0];
      expect(validate("valid")).toBe("");
      expect(validate("invalid")).toBe("Invalid input");
      expect(validate("other")).toBe("custom error");
    });

    test("input: always validates when no custom validate is given", async () => {
      mockText.mockResolvedValue("typed");
      await prompts.prompt([
        { type: "input", name: "pkg", message: "Package name?" },
      ]);

      const { validate } = mockText.mock.calls[0][0];
      expect(validate("anything")).toBe("");
    });

    test("confirm: maps default to initialValue", async () => {
      mockConfirm.mockResolvedValue(true);
      await prompts.prompt([
        { type: "confirm", name: "ok", message: "Proceed?", default: true },
      ]);

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ initialValue: true }),
      );
    });

    test("confirm: supports function defaults and falsy values", async () => {
      mockConfirm.mockResolvedValue(false);
      await prompts.prompt([
        { type: "confirm", name: "ok", message: "Proceed?", default: () => false },
      ]);

      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ initialValue: false }),
      );
    });

    test("select: maps choices to Clack options", async () => {
      mockSelect.mockResolvedValue("sqlite");
      await prompts.prompt([
        {
          type: "select",
          name: "db",
          message: "Which database?",
          choices: [{ name: "SQLite", value: "sqlite" }],
        },
      ]);

      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Which database?",
          options: [{ label: "SQLite", value: "sqlite" }],
        }),
      );
    });

    test("select: sets initialValue from a static default", async () => {
      mockSelect.mockResolvedValue("sqlite");
      await prompts.prompt([
        {
          type: "select",
          name: "db",
          message: "Which database?",
          default: "sqlite",
          choices: [{ name: "SQLite", value: "sqlite" }],
        },
      ]);

      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({ initialValue: "sqlite" }),
      );
    });

    test("select: invokes function defaults", async () => {
      mockSelect.mockResolvedValue("postgres");
      await prompts.prompt([
        {
          type: "select",
          name: "db",
          message: "Which database?",
          default: () => "postgres",
          choices: [{ name: "PostgreSQL", value: "postgres" }],
        },
      ]);

      expect(mockSelect).toHaveBeenCalledWith(
        expect.objectContaining({ initialValue: "postgres" }),
      );
    });

    test("select: omits initialValue when no default is provided", async () => {
      mockSelect.mockResolvedValue("sqlite");
      await prompts.prompt([
        {
          type: "select",
          name: "db",
          message: "Which database?",
          choices: [{ name: "SQLite", value: "sqlite" }],
        },
      ]);

      const selectArgs = mockSelect.mock.calls[0][0];
      expect("initialValue" in selectArgs).toBe(false);
    });

    test("rejects unsupported question types", async () => {
      const bad = {
        type: "radio",
        name: "x",
        message: "?",
      } as unknown as PromptQuestion;

      await expect(prompts.prompt([bad])).rejects.toThrow(
        "Unsupported prompt type: radio",
      );
    });

    // Clack primitives RESOLVE with the cancel symbol on Ctrl+C — they never
    // throw it themselves. The wrapper must convert it to a rejection so the
    // generators' catch { isCancel(error) } cancellation boundary runs.
    describe("cancellation propagation", () => {
      test("input: rejects with the raw cancel symbol (isCancel-compatible)", async () => {
        mockText.mockResolvedValue(CANCEL);
        mockIsCancel.mockImplementation((v: unknown) => v === CANCEL);

        const rejection = prompts.prompt([
          { type: "input", name: "name", message: "Project name?" },
        ]);

        await expect(rejection).rejects.toBe(CANCEL);
      });

      test("confirm: rejects with the raw cancel symbol", async () => {
        mockConfirm.mockResolvedValue(CANCEL);
        mockIsCancel.mockImplementation((v: unknown) => v === CANCEL);

        const rejection = prompts.prompt([
          { type: "confirm", name: "ok", message: "Proceed?" },
        ]);

        await expect(rejection).rejects.toBe(CANCEL);
      });

      test("select: rejects with the raw cancel symbol", async () => {
        mockSelect.mockResolvedValue(CANCEL);
        mockIsCancel.mockImplementation((v: unknown) => v === CANCEL);

        const rejection = prompts.prompt([
          {
            type: "select",
            name: "db",
            message: "Which database?",
            choices: [{ name: "SQLite", value: "sqlite" }],
          },
        ]);

        await expect(rejection).rejects.toBe(CANCEL);
      });

      test("stops asking subsequent questions after a cancellation", async () => {
        mockText.mockResolvedValueOnce(CANCEL);
        mockIsCancel.mockImplementation((v: unknown) => v === CANCEL);
        mockConfirm.mockResolvedValue(true); // would be Q2 if reached

        await expect(
          prompts.prompt([
            { type: "input", name: "name", message: "Project name?" },
            { type: "confirm", name: "ok", message: "Proceed?" },
          ]),
        ).rejects.toBe(CANCEL);

        // The second question was never asked — cancellation halts collection.
        expect(mockConfirm).not.toHaveBeenCalled();
      });
    });
  });
});
