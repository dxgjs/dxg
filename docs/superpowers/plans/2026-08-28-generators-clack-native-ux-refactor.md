# DXG Generators Clack-native UX Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the DXG generator UX so that all interactive generators follow a consistent, Clack-native CLI flow.

**Architecture:** Each generator will handle its own prompting using @dxgjs/prompts directly, follow a consistent UX flow (intro → collect inputs → cancellation → validation → operations → success/failure → outro), use spinner for operations, and maintain strict separation between Clack (user interaction) and logger (technical diagnostics).

**Tech Stack:** TypeScript, @clack/prompts (via @dxgjs/prompts), picocolors, @dxgjs/logger

## Global Constraints
- Do not create new terminal abstraction (no @dxgjs/terminal replacement)
- Preserve non-interactive mode, dry-run, force, and quiet mode functionality
- Maintain existing generator behavior and test coverage
- Strict separation: Clack for user interaction, logger only for technical diagnostics
- Generators handle prompting internally rather than receiving pre-collected answers
- Keep implementation minimal and YAGNI-compliant

---
### Task 1: Refactor Init Generator

**Files:**
- Modify: `packages\generators\src\generators\init\index.ts`

**Interfaces:**
- Consumes: Generator context with logger, fs, templates
- Produces: Initialized project with package.json, tsconfig.json, src/index.ts, .gitignore

- [ ] **Step 1: Analyze current init generator implementation**

Read the current init generator to understand its structure and identify logger usage that should be converted to Clack UX.

- [ ] **Step 2: Write failing test for interactive behavior**

Create a test that verifies the generator shows proper Clack prompts and handles user input correctly.

```typescript
import { initGenerator } from '@/generators/generators/init';

// Mock context
const mockContext = {
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  },
  fs: {
    pathExists: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    stat: jest.fn(),
    mkdir: jest.fn()
  },
  templates: {
    render: jest.fn((template, data) => {
      if (template.includes('name')) return `{\n  "name": "${data.name}"\n}`;
      if (template.includes('outDir')) return `{\n  "compilerOptions": { "outDir": "./dist" }\n}`;
      if (template.includes('console.log')) return `console.log('Project {{name}} initialized!');`;
      if (template.includes('node_modules')) return '# dependencies\nnode_modules/\n';
      return template;
    })
  },
  dryRun: false,
  force: false
};

describe('Init Generator Clack UX', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should show intro and collect project name via prompt', async () => {
    // Mock @dxgjs/prompts functions
    jest.mock('@dxgjs/prompts', () => ({
      intro: jest.fn(),
      outro: jest.fn(),
      note: jest.fn(),
      select: jest.fn(),
      text: jest.fn().mockResolvedValue('my-project'),
      confirm: jest.fn(),
      isCancel: jest.fn(() => false),
      cancel: jest.fn(),
      spinner: jest.fn(() => ({
        start: jest.fn(),
        stop: jest.fn()
      }))
    }));

    const { intro, outro, note, text, spinner } = require('@dxgjs/prompts');
    
    await initGenerator.run({ name: 'my-project' }, mockContext);
    
    // Should show intro
    expect(intro).toHaveBeenCalled();
    // Should collect project name via text prompt (since name is provided, might skip)
    // Should show outro
    expect(outro).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dxgjs/generators test`
Expected: FAIL with test not passing

- [ ] **Step 4: Implement Clack-native UX for init generator**

Modify the init generator to use Clack prompts for interaction and logger only for diagnostics.

```typescript
// Replace the executeInit function to use Clack UX
export async function executeInit(
  answers: Record<string, unknown>,
  ctx: GeneratorContext,
  plan?: ReturnType<typeof planInit>,
): Promise<{ created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] }> {
  const { logger } = ctx;
  
  // Import Clack functions locally to avoid changing the interface
  const { intro, outro, note, spinner, isCancel, cancel } = await import('@dxgjs/prompts');
  
  // Show intro
  intro('Project Initialization');
  
  // Collect inputs if not provided
  let finalAnswers = { ...answers };
  if (!answers.name) {
    const nameAnswer = await text({
      message: 'Project name:',
      validate: (input) => {
        if (!input?.trim()) {
          return 'Project name is required';
        }
        return true;
      }
    });
    
    if (isCancel(nameAnswer)) {
      cancel('Project initialization cancelled.');
      return { created: [], updated: [], skipped: [], conflicts: [] };
    }
    
    finalAnswers.name = nameAnswer;
  }
  
  if (!answers.description) {
    const descAnswer = await text({
      message: 'Description (optional):',
      default: ''
    });
    
    if (isCancel(descAnswer)) {
      cancel('Project initialization cancelled.');
      return { created: [], updated: [], skipped: [], conflicts: [] };
    }
    
    finalAnswers.description = descAnswer;
  }
  
  // Continue with existing logic but use spinner for file operations
  const planToUse = plan ?? planInit(finalAnswers);
  const result: { created: string[]; updated: string[]; skipped: string[]; conflicts: { path: string; existsAs: 'file' | 'directory' }[] } = {
    created: [],
    updated: [],
    skipped: [],
    conflicts: [],
  };
  
  // Process each file with appropriate spinner messages
  for (const { path, data, template } of planToUse) {
    // Use spinner for significant operations
    if (path === 'package.json' || path === 'tsconfig.json') {
      const s = spinner();
      s.start(`Creating ${path}...`);
      
      // ... existing file creation logic ...
      
      s.stop(`Created ${path}.`);
    } else {
      // ... existing logic without spinner for smaller files ...
    }
  }
  
  // Show success message
  outro(`Project ${finalAnswers.name} initialized successfully.`);
  
  return result;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dxgjs/generators test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/generators/src/generators/init/index.ts
git commit -m "feat(generators): refactor init generator to use Clack-native UX"
```

---
### Task 2: Refactor Database Generator

**Files:**
- Modify: `packages\generators\src\generators\database\index.ts`

**Interfaces:**
- Consumes: Generator context with logger, fs, templates
- Produces: Prisma setup with schema.prisma and installed dependencies

- [ ] **Step 1: Analyze current database generator implementation**

Read the current database generator to understand its structure and identify logger usage that should be converted to Clack UX.

- [ ] **Step 2: Write failing test for interactive behavior**

Create a test that verifies the generator shows proper Clack prompts for database provider selection and handles the UX flow correctly.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dxgjs/generators test`
Expected: FAIL with test not passing

- [ ] **Step 4: Implement Clack-native UX for database generator**

Modify the database generator to use Clack prompts for provider selection and logger only for diagnostics.

```typescript
// Modify the run method to handle prompting internally
export const databaseGenerator: Generator = {
  name: "database",
  description: "Adds Prisma ORM with a selected database provider",
  prompts: databasePrompts, // Keep for interface compliance but handle internally
  async run(answers: Record<string, unknown>, context: GeneratorContext) {
    const ctx = context;
    
    // Import Clack functions locally
    const { intro, outro, note, select, isCancel, cancel, spinner } = await import('@dxgjs/prompts');
    
    // Show intro
    intro('Database Setup');
    
    // Collect provider if not provided
    let finalAnswers = { ...answers };
    if (!answers.provider) {
      const providerAnswer = await select({
        message: "Choose your database provider:",
        options: [
          { label: "SQLite", value: "sqlite" },
          { label: "PostgreSQL", value: "postgresql" },
          { label: "MySQL", value: "mysql" },
        ],
      });
      
      if (isCancel(providerAnswer)) {
        cancel("Database setup cancelled.");
        return;
      }
      
      finalAnswers.provider = providerAnswer;
    }
    
    // Validate preconditions
    await checkPreconditions(ctx);
    
    // Validate (interface compliance)
    if (!validateDatabase()) {
      throw new Error("Invalid responses for database generator");
    }
    
    // Plan
    const plan = planDatabase(finalAnswers);
    
    // Execute with Clack UX
    const { logger } = ctx;
    
    // Check if Prisma is already installed
    const prismaInstalled = await isPrismaInstalled(fs);
    if (prismaInstalled) {
      note("Prisma already detected. Skipping dependency installation.");
    } else if (!ctx.dryRun) {
      // Install dependencies with spinner
      const s = spinner();
      s.start("Installing dependencies...");
      
      try {
        // ... existing dependency installation logic ...
        
        s.stop("Dependencies installed.");
      } catch (error) {
        s.stop("Failed to install dependencies.");
        
        // Log technical details for diagnostics
        logger.debug(
          error instanceof Error
            ? error.stack ?? error.message
            : String(error),
        );
        
        throw error;
      }
    } else {
      // In dry-run mode
      logger.info("[database] Dry-run: Would install dependencies");
    }
    
    // Handle schema file with spinner
    for (const { path, templatePath, data } of planToUse.filesToCreate) {
      // ... existing template processing logic ...
      
      // Use spinner for schema creation
      if (path.includes('schema.prisma')) {
        const s = spinner();
        s.start("Creating Prisma schema...");
        
        // ... existing file creation logic ...
        
        s.stop("Prisma schema created.");
      }
    }
    
    // Verify (skip in dry-run mode)
    if (!ctx.dryRun) {
      const verifySpinner = spinner();
      verifySpinner.start("Verifying schema...");
      await verifyDatabase(finalAnswers, ctx, plan);
      verifySpinner.stop("Schema verified.");
    }
    
    // Summarize with Clack UX
    outro(`Database setup complete for ${finalAnswers.provider}.`);
    
    // Note about next steps
    note(
      "Run \`pnpm prisma generate\` to generate Prisma client.\n" +
      "Run \`pnpm prisma migrate dev\` to create your first migration."
    );
  }
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dxgjs/generators test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/generators/src/generators/database/index.ts
git commit -m "feat(generators): refactor database generator to use Clack-native UX"
```

---
### Task 3: Refactor Tailwind Generator

**Files:**
- Modify: `packages\generators\src\generators\tailwind\index.ts`

**Interfaces:**
- Consumes: Generator context with logger, fs, templates
- Produces: Tailwind CSS configuration with config files and updated CSS entrypoint

- [ ] **Step 1: Analyze current tailwind generator implementation**

Read the current tailwind generator to understand its structure and identify logger usage that should be converted to Clack UX.

- [ ] **Step 2: Write failing test for interactive behavior**

Create a test that verifies the generator shows proper Clack prompts for Tailwind configuration options and handles the UX flow correctly.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dxgjs/generators test`
Expected: FAIL with test not passing

- [ ] **Step 4: Implement Clack-native UX for tailwind generator**

Modify the tailwind generator to use Clack prompts for configuration options and logger only for diagnostics.

```typescript
// Modify the run method to handle prompting internally
export const tailwindGenerator: Generator = {
  name: "tailwind",
  description: "Adds Tailwind CSS v4 to a Node/frontend project",
  prompts: tailwindPrompts, // Keep for interface compliance but handle internally
  async run(answers: Record<string, unknown>, context: GeneratorContext) {
    const ctx = context;
    
    // Import Clack functions locally
    const { intro, outro, note, confirm, isCancel, cancel, spinner } = await import('@dxgjs/prompts');
    
    // Show intro
    intro('Tailwind CSS Setup');
    
    // Collect configuration options if not provided
    let finalAnswers = { ...answers };
    
    if (finalAnswers.customiseTailwind === undefined) {
      const customiseAnswer = await confirm({
        message: "Do you want to customise Tailwind settings (content paths, theme, etc.)?",
        initialValue: false
      });
      
      if (isCancel(customiseAnswer)) {
        cancel("Tailwind setup cancelled.");
        return;
      }
      
      finalAnswers.customiseTailwind = customiseAnswer;
    }
    
    if (finalAnswers.addPostcssPlugins === undefined) {
      const postcssAnswer = await confirm({
        message: "Do you want to add additional PostCSS plugins (e.g., for minification)?",
        initialValue: false
      });
      
      if (isCancel(postcssAnswer)) {
        cancel("Tailwind setup cancelled.");
        return;
      }
      
      finalAnswers.addPostcssPlugins = postcssAnswer;
    }
    
    if (finalAnswers.installAutoprefixer === undefined) {
      const autoprefixerAnswer = await confirm({
        message: "Do you need to support legacy browsers (IE11, older Android)?",
        initialValue: false
      });
      
      if (isCancel(autoprefixerAnswer)) {
        cancel("Tailwind setup cancelled.");
        return;
      }
      
      finalAnswers.installAutoprefixer = autoprefixerAnswer;
    }
    
    // Validate preconditions
    await checkPreconditions(ctx);
    
    // Validate (interface compliance)
    if (!validateTailwind()) {
      throw new Error("Invalid responses for tailwind generator");
    }
    
    // Plan
    const plan = planTailwind(finalAnswers);
    
    // Execute with Clack UX
    const { logger, fs } = ctx;
    
    // Check if Tailwind is already installed
    const tailwindInstalled = await isTailwindInstalled(fs);
    if (tailwindInstalled) {
      note("Tailwind CSS already detected. Skipping dependency installation.");
    } else if (!ctx.dryRun) {
      // Install dependencies with spinner
      const s = spinner();
      s.start("Installing dependencies...");
      
      try {
        // ... existing dependency installation logic ...
        
        s.stop("Dependencies installed.");
      } catch (error) {
        s.stop("Failed to install dependencies.");
        
        // Log technical details for diagnostics
        logger.debug(
          error instanceof Error
            ? error.stack ?? error.message
            : String(error),
        );
        
        throw error;
      }
    } else {
      // In dry-run mode
      logger.info("[tailwind] Dry-run: Would install dependencies");
    }
    
    // Handle config files with spinners
    for (const { path, templatePath, data } of planToUse.configFiles) {
      // ... existing template processing logic ...
      
      // Use spinner for config file creation
      if (path === 'tailwind.config.js' || path === 'postcss.config.js') {
        const s = spinner();
        s.start(`Creating ${path}...`);
        
        // ... existing file creation logic ...
        
        s.stop(`${path} created.`);
      }
    }
    
    // Handle CSS entrypoint with spinner
    const cssEntrypoint = await determineCssEntrypoint(ctx);
    if (cssEntrypoint) {
      const s = spinner();
      s.start(`Updating CSS entrypoint: ${cssEntrypoint}...`);
      
      // ... existing CSS entrypoint update logic ...
      
      s.stop(`CSS entrypoint updated.`);
    }
    
    // Verify (skip in dry-run mode)
    if (!ctx.dryRun) {
      const verifySpinner = spinner();
      verifySpinner.start("Verifying Tailwind setup...");
      await verifyTailwind(finalAnswers, ctx, plan);
      verifySpinner.stop("Tailwind setup verified.");
    }
    
    // Summarize with Clack UX
    outro("Tailwind CSS v4 installed successfully.");
  }
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dxgjs/generators test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/generators/src/generators/tailwind/index.ts
git commit -m "feat(generators): refactor tailwind generator to use Clack-native UX"
```

---
### Task 4: Refactor Auth Generator

**Files:**
- Modify: `packages\generators\src\generators\auth\index.ts`

**Interfaces:**
- Consumes: Generator context with logger, fs, templates
- Produces: Auth configuration with config files and installed dependencies

- [ ] **Step 1: Analyze current auth generator implementation**

Read the current auth generator to understand its structure and identify logger usage that logger usage that should be converted to Clack UX.

- [ ] **Step 2: Write failing test for interactive behavior**

Create a test that verifies the generator shows proper Clack prompts for auth provider selection and options, and handles the UX flow correctly.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @dxgjs/generators test`
Expected: FAIL with test not passing

- [ ] **Step 4: Implement Clack-native UX for auth generator**

Modify the auth generator to use Clack prompts for provider selection and options, and logger only for diagnostics.

```typescript
// Modify the run method to handle prompting internally
export const authGenerator: Generator = {
  name: "auth",
  description: "Adds authentication provider configuration",
  prompts: authPrompts, // Keep for interface compliance but handle internally
  async run(answers: Record<string, unknown>, context: GeneratorContext) {
    const ctx = context;
    
    // Import Clack functions locally
    const { intro, outro, note, select, confirm, isCancel, cancel, spinner } = await import('@dxgjs/prompts');
    
    // Show intro
    intro('Authentication Setup');
    
    // Collect provider if not provided
    let finalAnswers = { ...answers };
    if (!answers.provider) {
      const providerAnswer = await select({
        message: "Choose your authentication provider:",
        options: [
          { name: "Better Auth", value: "better-auth" },
          { name: "Auth.js", value: "auth.js" },
          { name: "Clerk", value: "clerk" },
          { name: "Lucia", value: "lucia" },
        ],
      });
      
      if (isCancel(providerAnswer)) {
        cancel("Auth setup cancelled.");
        return;
      }
      
      finalAnswers.provider = providerAnswer;
    }
    
    // Collect installDependencies if not provided
    if (finalAnswers.installDependencies === undefined) {
      const installDepsAnswer = await confirm({
        message: "Do you want to install dependencies?",
        initialValue: true
      });
      
      if (isCancel(installDepsAnswer)) {
        cancel("Auth setup cancelled.");
        return;
      }
      
      finalAnswers.installDependencies = installDepsAnswer;
    }
    
    // Collect generateExampleConfig if not provided
    if (finalAnswers.generateExampleConfig === undefined) {
      const generateConfigAnswer = await confirm({
        message: "Do you want to generate example configuration files?",
        initialValue: true
      });
      
      if (isCancel(generateConfigAnswer)) {
        cancel("Auth setup cancelled.");
        return;
      }
      
      finalAnswers.generateExampleConfig = generateConfigAnswer;
    }
    
    // Validate preconditions
    await checkPreconditions(ctx);
    
    // Validate (interface compliance)
    if (!validateAuth()) {
      throw new Error("Invalid responses for auth generator");
    }
    
    // Plan
    const plan = planAuth(finalAnswers);
    
    // Execute with Clack UX
    const { logger, fs } = ctx;
    
    // Check if auth dependency is already installed
    const provider = finalAnswers.provider as string;
    if (!ctx.dryRun) {
      const authInstalled = await isAuthInstalled(fs, provider);
      if (authInstalled) {
        note(`${provider} already detected. Skipping dependency installation.`);
      } else if (finalAnswers.installDependencies) {
        // Install dependencies with spinner
        const s = spinner();
        s.start("Installing dependencies...");
        
        try {
          // ... existing dependency installation logic ...
          
          s.stop("Dependencies installed.");
        } catch (error) {
          s.stop("Failed to install dependencies.");
          
          // Log technical details for diagnostics
          logger.debug(
            error instanceof Error
              ? error.stack ?? error.message
              : String(error),
          );
          
          throw error;
        }
      }
    } else {
      // In dry-run mode
      if (!finalAnswers.installDependencies) {
        logger.info("[auth] Dry-run: Would not install dependencies");
      } else {
        const authInstalled = await isAuthInstalled(fs, provider);
        if (!authInstalled) {
          logger.info("[auth] Dry-run: Would install dependencies");
        }
      }
    }
    
    // Handle config files with spinners
    for (const { path, templatePath, data } of planToUse.filesToCreate) {
      // ... existing template processing logic ...
      
      // Use spinner for config file creation
      const s = spinner();
      s.start(`Creating ${path}...`);
      
      // ... existing file creation logic ...
      
      s.stop(`${path} created.`);
    }
    
    // Verify (skip in dry-run mode)
    if (!ctx.dryRun) {
      const verifySpinner = spinner();
      verifySpinner.start("Verifying auth setup...");
      await verifyAuth(finalAnswers, ctx, plan);
      verifySpinner.stop("Auth setup verified.");
    }
    
    // Summarize with Clack UX
    outro(`Auth generator completed successfully for ${provider}.`);
    
    // Note about next steps
    if (finalAnswers.generateExampleConfig) {
      note(
        `Review the generated auth.config.ts file and adjust configuration as needed.\n` +
        "Refer to the provider's documentation for usage instructions."
      );
    }
  }
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @dxgjs/generators test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/generators/src/generators/auth/index.ts
git commit -m "feat(generators): refactor auth generator to use Clack-native UX"
```

---
### Task 5: Update Tests

**Files:**
- Modify: `packages\generators\__tests__\*` (as needed)
- Modify: `apps\cli\__tests__\*` (as needed)

**Interfaces:**
- Consumes: Updated generator implementations
- Produces: Verified functionality through tests

- [ ] **Step 1: Analyze existing tests**

Review existing tests to understand what needs to be updated for the new Clack-native UX approach.

- [ ] **Step 2: Update init generator tests**

Modify tests to verify the new Clack UX behavior rather than logger output.

- [ ] **Step 3: Update database generator tests**

Modify tests to verify the new Clack UX behavior for provider selection and operations.

- [ ] **Step 4: Update tailwind generator tests**

Modify tests to verify the new Clack UX behavior for configuration options.

- [ ] **Step 5: Update auth generator tests**

Modify tests to verify the new Clack UX behavior for provider selection and options.

- [ ] **Step 6: Update CLI tests if needed**

Verify that the CLI still works correctly with generators that handle prompting internally.

- [ ] **Step 7: Run all tests**

Run: `pnpm test`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add packages/generators/__tests__/ apps/cli/__tests__/
git commit -m "test: update tests for Clack-native UX refactor"
```

---
### Task 6: Verify Build and Typecheck

**Files:**
- No specific files to modify

**Interfaces:**
- Consumes: All refactored code
- Produces: Verified build and type safety

- [ ] **Step 1: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Commit if needed**

```bash
git add .
git commit -m "build: verify typecheck and build after UX refactor"
```

---
### Task 7: Manual UX Verification

**Files:**
- No specific files to modify

**Interfaces:**
- Consumes: All refactored generators
- Produces: Verified user experience

- [ ] **Step 1: Test init generator interactively**

Run: `pnpm dxg init` (or `dxg init`)
Verify:
- Shows intro
- Prompts for project name and description
- Handles cancellation correctly
- Shows appropriate spinners during file creation
- Shows outro with success message
- Logger only shows debug information with --verbose

- [ ] **Step 2: Test database generator interactively**

Run: `pnpm dxg add database`
Verify:
- Shows intro
- Prompts for database provider
- Handles cancellation correctly
- Shows spinner during dependency installation
- Shows spinner during schema creation
- Shows outro with success message and next steps
- Logger only shows debug information with --verbose

- [ ] **Step 3: Test tailwind generator interactively**

Run: `pnpm dxg add tailwind`
Verify:
- Shows intro
- Prompts for all configuration options
- Handles cancellation correctly
- Shows spinner during dependency installation
- Shows spinner during config file creation
- Shows spinner during CSS entrypoint update
- Shows outro with success message
- Logger only shows debug information with --verbose

- [ ] **Step 4: Test auth generator interactively**

Run: `pnpm dxg add auth`
Verify:
- Shows intro
- Prompts for auth provider
- Prompts for dependency installation option
- Prompts for config generation option
- Handles cancellation correctly
- Shows spinner during dependency installation
- Shows spinner during config file creation
- Shows outro with success message
- Logger only shows debug information with --verbose

- [ ] **Step 5: Test non-interactive mode**

Run: `pnpm dxg add database --provider sqlite --non-interactive`
Verify:
- No prompts shown
- Uses provided values
- Works correctly with existing CLI answer collection
- Logger shows appropriate information

- [ ] **Step 6: Test dry-run mode**

Run: `pnpm dxg add database --dry-run`
Verify:
- No actual file changes
- Shows what would be done
- Logger shows dry-run information

- [ ] **Step 7: Test force mode**

Run: `pnpm dxg add database --force` (when files exist)
Verify:
- Correctly overwrites existing files
- Shows appropriate UX

- [ ] **Step 8: Test quiet mode**

Run: `pnpm dxg add database --quiet`
Verify:
- Minimal output
- Errors still shown
- Spinners may be suppressed (check existing behavior)

- [ ] **Step 9: Document findings**

```bash
git add .
git commit -m "docs: record manual UX verification results"
```

## Success Criteria

After completing all tasks:
1. All generators feel like native modern CLI commands
2. Clear, coherent user flow without duplicated output between Clack and logger
3. Proper separation: Clack handles all user interaction, logger only for technical diagnostics
4. All existing functionality preserved (non-interactive, dry-run, force, quiet mode)
5. All tests pass
6. Build and typecheck succeed
7. Manual UX verification shows intuitive, Clack-native experience matching the design specification