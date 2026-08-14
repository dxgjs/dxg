import { Logger } from "@dxgjs/logger";
import { readFile, stat, writeFile, readdir } from "@dxgjs/fs";

export interface GeneratorContext {
  logger: Logger;
  fs: {
    readFile: typeof readFile;
    writeFile: typeof writeFile;
    stat: typeof stat;
    readdir: typeof readdir;
  };
}

export interface GeneratorPrompt {
  type: "input" | "confirm" | "select";
  name: string;
  message: string;
  default?: string | (() => string);
  choices?: Array<{ name: string; value: string }>;
  validate?: (input: unknown) => boolean | string;
}

export interface Generator {
  name: string;
  description: string;
  prompts: GeneratorPrompt[];
  run(answers: Record<string, unknown>, context: GeneratorContext): Promise<void>;
}
