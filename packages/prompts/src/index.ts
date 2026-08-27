import {
  text,
  confirm,
  select,
  intro,
  outro,
  isCancel,
  cancel,
  spinner,
  note,
} from "@clack/prompts";

export interface PromptQuestion {
  type: "input" | "confirm" | "select";
  name: string;
  message: string;
  default?: unknown;
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
        const { default: defaultVal, validate } = q;
        const placeholder =
          typeof defaultVal === "function"
            ? (defaultVal as () => string)()
            : ((defaultVal as string) ?? "");
        result = await text({
          message: q.message,
          placeholder,
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
    answers[q.name] = result;
  }

  return answers as T;
}

export { text, confirm, select, intro, outro, isCancel, cancel, spinner, note };
