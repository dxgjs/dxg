import { Logger } from "@dxgjs/logger";
import type * as FS from "@dxgjs/fs";

export interface GeneratorContext {
  logger: Logger;
  fs: typeof FS;
  templates: {
    render: (template: string, data: Record<string, unknown>) => string;
  };
}

export interface GeneratorPrompt {
  type: "input" | "confirm" | "select";
  name: string;
  message: string;
  default?: string | (() => string) | boolean;
  choices?: Array<{ name: string; value: string }>;
  validate?: (input: unknown) => boolean | string;
}

export interface Generator {
  name: string;
  description: string;
  prompts: GeneratorPrompt[];
  run(answers: Record<string, unknown>, context: GeneratorContext): Promise<void>;
}