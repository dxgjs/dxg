import { text, confirm, select, intro, outro, note, isCancel, cancel, spinner } from '@clack/prompts';
import { Logger } from '@dxgjs/logger';
// Import terminal utilities but rename to avoid unused variable warnings
import * as term from '@dxgjs/terminal';

const logger = new Logger({ minLevel: 'warn' });

export interface PromptQuestion {
  type: 'input' | 'confirm' | 'select';
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
  questions: PromptQuestion[]
): Promise<T> {
  const answers: Record<string, unknown> = {};

  for (const q of questions) {
    let result: unknown;
    try {
      switch (q.type) {
        case 'input': {
          const { default: defaultVal, validate } = q;
          const placeholder = typeof defaultVal === 'function' ? (defaultVal as () => string)() : (defaultVal as string) ?? '';
          result = await text({
            message: q.message,
            placeholder,
            validate: (input) => {
              if (validate) {
                const v = validate(input);
                if (v === true) return '';
                return typeof v === 'string' ? v : 'Invalid input';
              }
              return '';
            },
          });
          break;
        }
        case 'confirm': {
          const { default: defaultVal } = q;
          const boolVal = typeof defaultVal === 'function' ? !!((defaultVal as () => unknown)()) : !!defaultVal;
          result = await confirm({
            message: q.message,
            initialValue: boolVal,
          });
          break;
        }
        case 'select': {
          const { choices, default: defaultVal } = q;
          // If defaultVal is a function, call it; else use as is.
          // We expect the default value to be one of the option values (string).
          const defaultValue = typeof defaultVal === 'function' ? (defaultVal as () => string)() : (defaultVal as string);
          // If defaultValue is undefined, we'll not set initialValue (let select decide).
          const selectOptions = {
            message: q.message,
            options: choices?.map(o => ({ label: o.name, value: o.value })) ?? [],
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
    } catch (err) {
      // If user cancels (ctrl+c), @clack/prompts throws a Cancel exception
      // We'll treat it as a rejection and bubble up
      logger.warn(`Prompt cancelled: ${(err as Error)?.message ?? String(err)}`);
      throw err;
    }
    answers[q.name] = result;
  }

  return answers as T;
}

/**
 * DXG intro message with styling
 */
export const dxgIntro = (message: string): void => {
  intro(
    `${term.successMessage('DXG')} ${term.accent(message)}`
  );
};

/**
 * DXG outro message with styling
 */
export const dxgOutro = (message: string): void => {
  outro(
    `${term.successMessage('DXG')} ${term.accent(message)}`
  );
};

/**
 * DXG note message with styling
 */
export const dxgNote = (message: string): void => {
  note(term.infoMessage(message));
};

/**
 * DXG select prompt - returns value or undefined if cancelled
 */
export const dxgSelect = async <T>(
  options: Parameters<typeof select>[0]
): Promise<T | undefined> => {
  const result = await select(options);

  if (isCancel(result)) {
    return undefined;
  }

  return result as T;
};

/**
 * DXG confirm prompt - returns boolean or undefined if cancelled
 */
export const dxgConfirm = async (
  options: Parameters<typeof confirm>[0]
): Promise<boolean | undefined> => {
  const result = await confirm(options);

  if (isCancel(result)) {
    return undefined;
  }

  return result as boolean;
};

/**
 * DXG text prompt - returns string or undefined if cancelled
 */
export const dxgText = async (
  options: Parameters<typeof text>[0]
): Promise<string | undefined> => {
  const result = await text(options);

  if (isCancel(result)) {
    return undefined;
  }

  return result as string;
};

export function createSpinner() {
  return spinner();
}

// Re-export the utility functions from @clack/prompts
export { isCancel, cancel };