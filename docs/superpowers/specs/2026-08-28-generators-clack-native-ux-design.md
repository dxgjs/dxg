# DXG Generators Clack-native UX Refactor Design

## Goal
Refactor the DXG generator UX so that all interactive generators follow a consistent, Clack-native CLI flow.

## Architecture
```
@clack/prompts → interaction
picocolors      → styling
@dxgjs/logger  → diagnostics
generators      → orchestration
@dxgjs/fs       → filesystem operations
package manager → dependency installation
```

## Key Principles
1. **No new terminal abstraction** - Do not recreate `@dxgjs/terminal` or create generic UI helpers
2. **Strict separation** - Clack for user interaction, logger only for technical diagnostics
3. **Internal prompting** - Generators handle their own Clack prompts rather than receiving pre-collected answers
4. **Consistent UX flow** - Follow intro → collect inputs → cancellation → validation → operations → success/failure → outro pattern
5. **Preserve existing behavior** - Maintain non-interactive mode, dry-run, force, and quiet mode functionality

## Changes Required

### Generator Interface Updates
No changes needed to the Generator interface in `@dxgjs/generators/src/types.ts` as it already supports the required pattern.

### Generator Implementation Changes

#### 1. Init Generator (`packages/generators/src/generators/init/index.ts`)
- Replace logger-based summarization with Clack intro/outro/note
- Add interactive prompts for project name and description using `@dxgjs/prompts`
- Implement proper cancellation handling with `isCancel()` and `cancel()`
- Use spinner for file creation operations (if deemed significant)
- Remove logger.info calls that duplicate Clack UX
- Keep logger.debug for technical diagnostics

#### 2. Database Generator (`packages/generators/src/generators/database/index.ts`)
- Replace logger-based output with Clack intro/outro/note
- Add interactive prompt for database provider selection
- Implement proper cancellation handling
- Use spinner for dependency installation and schema creation
- Remove logger.info calls that duplicate Clack UX
- Keep logger.debug for technical diagnostics (package manager detection, file operations)

#### 3. Tailwind Generator (`packages/generators/src/generators/tailwind/index.ts`)
- Replace logger-based output with Clack intro/outro/note
- Add interactive prompts for Tailwind configuration options
- Implement proper cancellation handling
- Use spinner for dependency installation and file creation
- Remove logger.info calls that duplicate Clack UX
- Keep logger.debug for technical diagnostics

#### 4. Auth Generator (`packages/generators/src/generators/auth/index.ts`)
- Replace logger-based output with Clack intro/outro/note
- Add interactive prompts for auth provider selection and options
- Implement proper cancellation handling
- Use spinner for dependency installation and config generation
- Remove logger.info calls that duplicate Clack UX
- Keep logger.debug for technical diagnostics

### CLI Changes
No changes needed to the CLI as it already:
- Collects answers from options/env/prompts
- Passes them to generators
- Handles non-interactive mode properly
- Will work with generators that handle prompting internally (they'll skip prompts when answers are provided)

### Error Handling Standardization
- Use Clack spinner for operations with clear start/stop messages
- On failure: spinner.stop("Failed to [operation].") + clear user-facing message
- Technical details go to logger.debug
- Never expose stack traces in normal execution
- User cancellation: cancel("Operation cancelled.") - not treated as error

### Non-Interactive Mode Support
- Generators must check for pre-provided answers before prompting
- When answers are provided via CLI/env, skip interactive prompts
- Use resolved values for execution
- Continue to support dry-run and force flags

### Logger Usage Guidelines
- **debug**: Technical information (detected frameworks, package managers, file operations)
- **info**: Only for non-interactive diagnostic output when no Clack UI represents the same operation
- **warn**: Recoverable technical conditions
- **error**: Technical failure information when appropriate

## Success Criteria
After implementation:
1. Generators feel like native modern CLI commands
2. Clear, coherent user flow without duplicated output
3. Proper separation of user-facing UX (Clack) and technical diagnostics (logger)
4. All existing functionality preserved (non-interactive, dry-run, force, quiet mode)
5. Tests updated to verify behavior rather than implementation details
6. Manual UX verification shows intuitive, Clack-native experience