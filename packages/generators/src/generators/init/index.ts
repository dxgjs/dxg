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
): Promise<{ created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] }> {
  const planToUse = plan ?? planInit(answers);
  const result: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] } = {
    created: [],
    updated: [],
    skipped: [],
    conflicts: [],
  };

  for (const { path, data, template } of planToUse) {
    const rendered = await ctx.templates.render(template, data);
    const exists = await ctx.fs.pathExists(path);

    if (exists) {
      // Check if it's a file or directory
      const stats = await ctx.fs.stat(path);
      const isDirectory = stats.isDirectory();

      if (isDirectory) {
        // Directory collision - expected path is occupied by a directory
        result.conflicts.push({ path, existsAs: 'directory' });
        continue;
      }

      // It's a file, check content
      const current = await ctx.fs.readFile(path, "utf8");
      if (current === rendered) {
        result.skipped.push(path);
        continue;
      }

      // File exists with different content - conflict
      if (ctx.dryRun) {
        // In dry-run mode, report as conflict (would need user interaction or force to resolve)
        result.conflicts.push({ path, existsAs: 'file' });
        continue;
      }

      if (ctx.force) {
        // Force overwrite
        await ctx.fs.writeFile(path, rendered, "utf8");
        result.updated.push(path);
        continue;
      }

      // Without force, treat as conflict
      result.conflicts.push({ path, existsAs: 'file' });
      continue;
    } else {
      // Path doesn't exist, check if parent directory would be a file collision
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) {
        const dirExists = await ctx.fs.pathExists(dir);
        if (dirExists) {
          const dirStats = await ctx.fs.stat(dir);
          if (dirStats.isFile()) {
            // Parent path is occupied by a file
            result.conflicts.push({ path: dir, existsAs: 'file' });
            continue;
          }
        }
      }

      // Safe to create
      if (!ctx.dryRun) {
        // Ensure the directory exists
        if (dir && !(await ctx.fs.pathExists(dir))) {
          await ctx.fs.mkdir(dir, { recursive: true });
        }
        await ctx.fs.writeFile(path, rendered, "utf8");
      }
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
  result: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] },
  ctx: GeneratorContext,
): void {
  const { logger } = ctx;
  const { created, updated, skipped, conflicts } = result;
  if (created.length) {
    logger.info(` Created: ${created.join(", ")}`);
  }
  if (updated.length) {
    logger.info(` Updated: ${updated.join(", ")}`);
  }
  if (skipped.length) {
    logger.info(`Unchanged: ${skipped.join(", ")}`);
  }
  if (conflicts.length) {
    const conflictDetails = conflicts.map(c => `${c.path} (${c.existsAs})`).join(", ");
    logger.warn(` Conflicts: ${conflictDetails}`);
  }
  const total = created.length + updated.length + skipped.length + conflicts.length;
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

    // Verify (skip in dry-run mode)
    if (!ctx.dryRun) {
      await verifyInit(answers, ctx, plan);
    }

    // Summarize
    summarizeInit(answers, execResult, ctx);
  },
};

// Default export for convenience
export default initGenerator;
