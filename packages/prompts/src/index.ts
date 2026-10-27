import {
  text,
  confirm,
  select,
  multiselect,
  intro,
  outro,
  isCancel,
  cancel,
  spinner as clackSpinner,
  note,
} from "@clack/prompts";
import { styleText } from "node:util";

export interface PromptQuestion {
  type: "input" | "confirm" | "select";
  name: string;
  message: string;
  default?: unknown;
  initialValue?: unknown;
  choices?: Array<{ name: string; value: string }>;
  validate?: (input: unknown) => boolean | string;
}

/**
 * DXG-enhanced prompt function with consistent styling
 */
export async function prompt<T extends Record<string, unknown>>(
  questions: PromptQuestion[],
): Promise<T> {
  const answers: Record<string, unknown> = {};

  for (const q of questions) {
    let result: unknown;
    switch (q.type) {
      case "input": {
        const { default: defaultVal, validate, initialValue } = q;
        const placeholder =
          typeof defaultVal === "function"
            ? (defaultVal as () => string)()
            : ((defaultVal as string) ?? "");
        // Use initialValue if provided, otherwise fall back to placeholder for backward compatibility
        const initialVal: string | undefined =
          initialValue !== undefined
            ? String(initialValue)
            : placeholder;
        result = await text({
          message: q.message,
          placeholder,
          initialValue: initialVal,
          validate: (input) => {
            if (validate) {
              const v = validate(input);
              if (v === true) return "";
              return typeof v === "string" ? v : "Invalid input";
            }
            return "";
          },
        });
        break;
      }
      case "confirm": {
        const { default: defaultVal } = q;
        const boolVal =
          typeof defaultVal === "function"
            ? !!(defaultVal as () => unknown)()
            : !!defaultVal;
        result = await confirm({
          message: q.message,
          initialValue: boolVal,
        });
        break;
      }
      case "select": {
        const { choices, default: defaultVal } = q;
        // If defaultVal is a function, call it; else use as is.
        // We expect the default value to be one of the option values (string).
        const defaultValue =
          typeof defaultVal === "function"
            ? (defaultVal as () => string)()
            : (defaultVal as string);
        // If defaultValue is undefined, we'll not set initialValue (let select decide).
        const selectOptions = {
          message: q.message,
          options:
            choices?.map((o) => ({ label: o.name, value: o.value })) ?? [],
        } as Parameters<typeof select>[0] & { initialValue?: string };
        if (defaultValue !== undefined) {
          selectOptions.initialValue = defaultValue;
        }
        result = await select(selectOptions);
        break;
      }
      default:
        throw new Error(`Unsupported prompt type: ${q.type}`);
    }
    // Clack primitives RESOLVE with the cancel symbol on Ctrl+C (they do
    // not throw). Propagate it so callers' `isCancel(error)` handling —
    // the intended cancellation boundary — actually runs.
    if (isCancel(result)) {
      throw result;
    }
    answers[q.name] = result;
  }

  return answers as T;
}

type ClackSpinner = typeof clackSpinner;
type SpinnerOptions = Parameters<ClackSpinner>[0];
type SpinnerResult = ReturnType<ClackSpinner>;

/**
 * Headless replacement for the Clack spinner.
 *
 * The Clack spinner's start() calls @clack/core's block(), which opens a
 * readline interface plus keypress events on process.stdin — a flowing
 * read posted on the parent's stdin handle. When stdin is not a TTY
 * (CI, test harnesses), child processes spawned with stdio "inherit"
 * receive that same handle, and two concurrent reads on one shared NT
 * handle leave the child's read pending forever (audit probes R7-R10,
 * 2026-10-10: 0-CPU freeze, files written only when the parent tree is
 * killed). This spinner writes plain, non-animated traces and never
 * touches stdin. Semantics follow Clack: stop/cancel/error close the
 * spinner, cancel sets isCancelled and runs the onCancel callback only
 * if a spinner was active, and clear() closes without erasing traces
 * already emitted (they cannot be erased — and should not be: in
 * headless logs a durable trace beats a clean console).
 */
function createHeadlessSpinner(options?: SpinnerOptions): SpinnerResult {
  const output = options?.output ?? process.stdout;
  let current = "";
  let active = false;
  let cancelled = false;
  const stripTrailingDots = (message: string) => message.replace(/\.+$/, "");
  const write = (line: string) => {
    output.write(`${line}\n`);
  };
  const finish = (symbol: string, color: "green" | "red", message = "") => {
    if (!active) return;
    active = false;
    if (message) current = stripTrailingDots(message);
    write(`${styleText(color, symbol)}  ${current}`.trimEnd());
  };
  return {
    start(message = "") {
      active = true;
      cancelled = false;
      current = stripTrailingDots(message);
      if (current) write(`${styleText("magenta", "◒")}  ${current}...`);
    },
    message(message = "") {
      if (!active || !message) return;
      current = stripTrailingDots(message);
      write(`${styleText("magenta", "◒")}  ${current}...`);
    },
    stop(message = "") {
      finish("✔", "green", message);
    },
    cancel(message = "") {
      const wasActive = active;
      cancelled = true;
      finish("■", "red", message);
      if (wasActive) options?.onCancel?.();
    },
    error(message = "") {
      finish("✖", "red", message);
    },
    clear() {
      active = false;
    },
    get isCancelled() {
      return cancelled;
    },
  };
}

/**
 * Spinner factory with a headless guard: interactive TTY sessions get the
 * real Clack spinner; non-TTY sessions (CI, test harnesses) get a spinner
 * that never reads stdin (see createHeadlessSpinner for the deadlock
 * rationale). Options are forwarded untouched in TTY mode.
 */
export function spinner(options?: SpinnerOptions): SpinnerResult {
  if (process.stdin.isTTY) {
    return clackSpinner(options);
  }
  return createHeadlessSpinner(options);
}

export { text, confirm, select, multiselect, intro, outro, isCancel, cancel, note };
