// Template source strings (owned by the init generator)
import { GeneratorContext, Generator } from "../../types";

const packageJsonTpl = `{
  "name": "{{name}}",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest"
  }
}`;

const tsconfigTpl = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}`;

const indexTpl = `// Minimal entry point
console.log('Project {{name}} initialized!');
`;

const gitignoreTpl = `# dependencies
node_modules/
# builds
dist/
# logs
*.log
`;

// Prompt questions for the init generator
export const initPrompts = [
  {
    type: "input" as const,
    name: "name",
    message: "Project name:",
    validate: (input: unknown) => {
      if (typeof input !== "string" || !input?.trim()) {
        return "Project name is required";
      }
      return true;
    },
  },
  {
    type: "input" as const,
    name: "description",
    message: "Description (optional):",
    default: "",
  },
] satisfies {
  type: "input" | "confirm" | "select";
  name: string;
  message: string;
  default?: unknown;
  choices?: Array<{ name: string; value: string }>;
  validate?: (input: unknown) => boolean | string;
}[];

// Validation function
export function validateInit(answers: Record<string, unknown>): boolean {
  return typeof answers.name === "string" && answers.name.trim().length > 0;
}

// Planning function
export function planInit(answers: Record<string, unknown>) {
  const data = {
    name: answers.name,
    description: answers.description,
    year: new Date().getFullYear(),
  };
  return [
    { path: "package.json", data, template: packageJsonTpl },
    { path: "tsconfig.json", data, template: tsconfigTpl },
    { path: "src/index.ts", data, template: indexTpl },
    { path: ".gitignore", data, template: gitignoreTpl },
  ] as const;
}

// Execution function
export async function executeInit(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planInit>,
): Promise<{ created: string[]; updated: string[]; skipped: string[] }> {
  const planToUse = plan ?? planInit(answers);
  const result: { created: string[]; updated: string[]; skipped: string[] } = {
    created: [],
    updated: [],
    skipped: [],
  };

  for (const { path, data, template } of planToUse) {
    const rendered = await ctx.templates.render(template, data);
    const exists = await ctx.fs.pathExists(path);
    if (exists) {
      const current = await ctx.fs.readFile(path, "utf8");
      if (current === rendered) {
        result.skipped.push(path);
        continue;
      }
      await ctx.fs.writeFile(path, rendered, "utf8");
      result.updated.push(path);
    } else {
      await ctx.fs.writeFile(path, rendered, "utf8");
      result.created.push(path);
    }
  }
  return result;
}

// Verification function
export async function verifyInit(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planInit>,
): Promise<void> {
  const planToUse = plan ?? planInit(answers);
  for (const { path } of planToUse) {
    const exists = await ctx.fs.pathExists(path);
    if (!exists) {
      throw new Error(`Expected file missing after generation: ${path}`);
    }
  }
}

// Summarize function
export function summarizeInit(
  answers: Record<string, unknown>,
  result: { created: string[]; updated: string[]; skipped: string[] },
  ctx: GeneratorContext,
): void {
  const { logger } = ctx;
  const { created, updated, skipped } = result;
  const total = created.length + updated.length + skipped.length;
  if (created.length) {
    logger.info(` Created: ${created.join(", ")}`);
  }
  if (updated.length) {
    logger.info(` Updated: ${updated.join(", ")}`);
  }
  if (skipped.length) {
    logger.info(`️  Unchanged: ${skipped.join(", ")}`);
  }
  logger.info(
    ` Initialization completed: ${answers.name} (${total} files processed)`,
  );
}

/**
 * Init generator – satisfies the Generator interface.
 * The run method executes the full pipeline: validate → plan → execute → verify → summarize.
 */
export const initGenerator: Generator = {
  name: "init",
  description: "Initializes a small DXG project (proof pipeline)",
  prompts: initPrompts,
  async run(answers: Record<string, unknown>, context: GeneratorContext) {
    const ctx = context;

    // Validate
    if (!validateInit(answers)) {
      throw new Error("Invalid responses for init generator");
    }

    // Plan
    const plan = planInit(answers);

    // Execute
    const execResult = await executeInit(answers, ctx, plan);

    // Verify
    await verifyInit(answers, ctx, plan);

    // Summarize
    summarizeInit(answers, execResult, ctx);
  },
};

// Default export for convenience
export default initGenerator;
