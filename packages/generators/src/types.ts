import { Logger } from "@dxgjs/logger";

export interface GeneratorContext {
  logger: Logger;
  fs: any;
  templates: {
    render: (template: string, data: Record<string, unknown>) => string;
  };
  /** Whether to run in dry-run mode (no filesystem changes) */
  dryRun?: boolean;
  /** Whether to force overwrite conflicting files */
  force?: boolean;
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