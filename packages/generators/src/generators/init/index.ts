// Template source strings (owned by the init generator)
import { GeneratorContext, Generator } from "../../types";

// Import Clack-native UX utilities from @dxgjs/prompts
import {
  intro,
  outro,
  isCancel,
  cancel,
  spinner,
  note,
  prompt,
} from "@dxgjs/prompts";

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
      if (ctx.dryRun) {
        // In dry-run mode, don't actually write the file
      } else {
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

// Summarize function using Clack UX (replaces logger-based summarization).
// Collect first, render once: the structured result is consolidated into a
// single coherent Operation Summary note — no per-event narration.
export function summarizeInit(
  result: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] },
): void {
  const { created, updated, skipped, conflicts } = result;

  const sections: string[] = [];

  if (created.length) {
    sections.push(["Created:", ...created.map(p => `  • ${p}`)].join("\n"));
  }
  if (updated.length) {
    sections.push(["Updated:", ...updated.map(p => `  • ${p}`)].join("\n"));
  }
  if (skipped.length) {
    sections.push(["Skipped:", ...skipped.map(p => `  • ${p}`)].join("\n"));
  }
  if (conflicts.length) {
    sections.push(["Conflicts:", ...conflicts.map(c => `  • ${c.path} (${c.existsAs})`)].join("\n"));
  }

  // Only render the summary block when there is something to report;
  // completion itself is communicated by the generator's outro.
  if (sections.length > 0) {
    note(sections.join("\n\n"), "Operation Summary");
  }
}

/**
 * Init generator – satisfies the Generator interface.
 * The run method executes the full pipeline: validate → plan → execute → verify → summarize.
 */
export const initGenerator: Generator = {
  name: "init",
  description: "Initializes a small DXG project (proof pipeline)",
  prompts: initPrompts,
  async run(cliAnswers: Record<string, unknown>, context: GeneratorContext) {
    const ctx = context;

    // Intro
    intro("DXG Project Initializer");

    // Collect inputs - use CLI/provided answers, fallback to interactive prompts
    let answers = { ...cliAnswers };

    // Check if we need to prompt for missing required fields
    const needsName = !answers.name || (typeof answers.name === "string" && !answers.name.trim());
    const needsDescription = answers.description === undefined; // description is optional, so we only prompt if not provided at all

    // Only prompt in interactive mode
    const shouldPrompt = !ctx.dryRun && !ctx.nonInteractive && !process.env.CI;

    if ((needsName || needsDescription) && shouldPrompt) {
      // Use interactive prompts for missing fields
      const promptQuestions = [];

      if (needsName) {
        promptQuestions.push(initPrompts[0]); // name prompt
      }

      if (needsDescription) {
        promptQuestions.push(initPrompts[1]); // description prompt
      }

      let promptAnswers: Record<string, unknown>;
      try {
        promptAnswers = await prompt(promptQuestions as Parameters<typeof prompt>[0]);
      } catch (error) {
        // Handle cancellation during interactive input collection
        if (isCancel(error)) {
          cancel("Operation cancelled");
        }
        throw error;
      }
      answers = { ...answers, ...promptAnswers };
    } else if ((needsName || needsDescription) && !shouldPrompt) {
      // Non-interactive: only genuinely required values without a declared
      // default fail the run (database-generator convention). `description`
      // is optional with a declared default of "" — apply it, don't demand it.
      if (needsName) {
        throw new Error("Missing required values in non-interactive mode: name");
      }
      if (needsDescription) {
        answers.description = "";
      }
    }

    // Validate
    if (!validateInit(answers)) {
      // Use Clack cancel for validation failure
      cancel("Invalid project name provided");
      throw new Error("Invalid project name provided");
    }

    // Use spinner for file creation operations
    const s = spinner();
    s.start("Creating project files...");

    try {
      // Plan (inside the try so plan failures close the Clack frame via the
      // catch's outro, like execution failures do)
      const plan = planInit(answers);

      // Execute
      const execResult = await executeInit(answers, ctx, plan);

      // Verify (skip in dry-run mode)
      if (!ctx.dryRun) {
        await verifyInit(answers, ctx, plan);
      }

      // Stop spinner
      s.stop();

      // Summarize using Clack UX
      summarizeInit(execResult);

      // Outro
      outro(`Project ${answers.name} initialized successfully!`);
    } catch (error) {
      // Stop spinner on error
      s.stop();

      // Handle cancellation
      if (isCancel(error)) {
        cancel("Operation cancelled");
        throw error;
      }

      // Handle other errors — the CLI's error formatter prints the message;
      // the outro marks the Clack boundary without duplicating it.
      outro(`Failed to initialize project ${answers.name}`);
      throw error;
    }
  },
};

// Default export for convenience
export default initGenerator;