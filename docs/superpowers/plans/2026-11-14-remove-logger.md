# Remove @dxgjs/logger Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `@dxgjs/logger` package entirely and replace its minimal usage (5 calls total) with direct `console.warn`/`console.error` calls.

**Architecture:** The logger package is vastly under-implemented vs its spec (4 levels vs 6 promised, no formatters/transports/enrichment). Only 5 actual calls exist in production code. The CLI uses Clack for all user-facing output. Tests already mock the logger. Replace with direct console calls and remove the package + its dependencies from 4 packages.

**Tech Stack:** TypeScript, pnpm workspace, vitest

**Spec:** Architecture docs (PACKAGES.md) promise a full-featured logger; audit shows toy implementation. Decision: remove.

## Global Constraints

- Code in English, comments in English, git messages in English
- French for user communication
- Follow existing code patterns in the codebase
- All tests must pass after changes
- TypeScript must compile without errors
- No breaking changes to public APIs of other packages (Logger was internal only)

---

## File Map

### Files to DELETE
- `packages/logger/` (entire directory)

### Files to MODIFY (remove logger import, replace with console)
- `packages/workspace/src/workspace.ts` - 3 `logger.warn()` → `console.warn()`
- `packages/workspace/src/capabilities.ts` - 1 `logger.warn()` → `console.warn()`
- `packages/doctor/src/runner.ts` - 1 `ctx.logger.error()` → `console.error()`
- `apps/cli/src/generator-run.ts` - remove logger creation/passing

### Files to MODIFY (remove Logger type from contexts)
- `packages/doctor/src/types.ts` - remove `Logger` from `DoctorContext` and `DoctorCheckOptions`
- `packages/generators/src/types.ts` - remove `Logger` from `GeneratorContext`

### Files to MODIFY (remove dependency from package.json)
- `packages/workspace/package.json` - remove `@dxgjs/logger`
- `packages/doctor/package.json` - remove `@dxgjs/logger`
- `packages/generators/package.json` - remove `@dxgjs/logger`
- `apps/cli/package.json` - remove `@dxgjs/logger`

### Files to VERIFY (tests should still pass)
- Test files that mock Logger (they use `vi.fn()` mocks, not real logger)

---

## Task Breakdown

### Task 1: Update workspace.ts - replace logger.warn with console.warn

**Files:**
- Modify: `packages/workspace/src/workspace.ts:1-210`

**Interfaces:**
- Consumes: None
- Produces: Modified workspace.ts with console.warn instead of logger.warn

- [ ] **Step 1: Read current file to see exact lines**

```bash
# The file has 3 logger.warn calls at lines ~71, ~166, ~205
```

- [ ] **Step 2: Edit workspace.ts - remove Logger import, replace logger.warn calls**

```typescript
// REMOVE: import { Logger } from "@dxgjs/logger";
// REMOVE: const logger = new Logger({ minLevel: "info" });

// REPLACE: logger.warn(`message`) → console.warn(`[WARN] message`)
// 3 occurrences total
```

- [ ] **Step 3: Run typecheck to verify**

```bash
cd packages/workspace && pnpm typecheck
```

- [ ] **Step 4: Run tests to verify**

```bash
cd packages/workspace && pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add packages/workspace/src/workspace.ts
git commit -m "refactor(workspace): replace @dxgjs/logger with console.warn"
```

---

### Task 2: Update capabilities.ts - replace logger.warn with console.warn

**Files:**
- Modify: `packages/workspace/src/capabilities.ts:1-106`

**Interfaces:**
- Consumes: None
- Produces: Modified capabilities.ts with console.warn instead of logger.warn

- [ ] **Step 1: Edit capabilities.ts - remove Logger import, replace logger.warn call**

```typescript
// REMOVE: import { Logger } from "@dxgjs/logger";
// REMOVE: const logger = new Logger({ minLevel: "info" });

// REPLACE: logger.warn(`message`) → console.warn(`[WARN] message`)
// 1 occurrence at line ~94
```

- [ ] **Step 2: Run typecheck to verify**

```bash
cd packages/workspace && pnpm typecheck
```

- [ ] **Step 3: Run tests to verify**

```bash
cd packages/workspace && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add packages/workspace/src/capabilities.ts
git commit -m "refactor(workspace): replace @dxgjs/logger with console.warn in capabilities"
```

---

### Task 3: Update workspace package.json - remove @dxgjs/logger dependency

**Files:**
- Modify: `packages/workspace/package.json`

**Interfaces:**
- Consumes: None
- Produces: package.json without @dxgjs/logger dependency

- [ ] **Step 1: Edit package.json - remove @dxgjs/logger from dependencies**

```json
// REMOVE: "@dxgjs/logger": "workspace:*",
```

- [ ] **Step 2: Run install to verify**

```bash
cd packages/workspace && pnpm install
```

- [ ] **Step 3: Run typecheck and tests**

```bash
cd packages/workspace && pnpm check
```

- [ ] **Step 4: Commit**

```bash
git add packages/workspace/package.json
git commit -m "chore(workspace): remove @dxgjs/logger dependency"
```

---

### Task 4: Update doctor runner.ts - replace ctx.logger.error with console.error

**Files:**
- Modify: `packages/doctor/src/runner.ts:1-170`

**Interfaces:**
- Consumes: DoctorContext no longer has logger (will be updated in Task 6)
- Produces: Modified runner.ts using console.error

- [ ] **Step 1: Edit runner.ts - replace ctx.logger.error with console.error**

```typescript
// At line ~104-106:
// REPLACE:
// ctx.logger.error(`Failed to apply fix for ${result.id}: ${error instanceof Error ? error.message : String(error)}`)
// WITH:
// console.error(`[ERROR] Failed to apply fix for ${result.id}: ${error instanceof Error ? error.message : String(error)}`)
```

- [ ] **Step 2: Run typecheck to verify (will fail until Task 6 updates types)**

```bash
cd packages/doctor && pnpm typecheck
```

- [ ] **Step 3: Commit (after Task 6 makes types compatible)**

```bash
git add packages/doctor/src/runner.ts
git commit -m "refactor(doctor): replace logger.error with console.error in runner"
```

---

### Task 5: Update generator-run.ts - remove logger creation and passing

**Files:**
- Modify: `apps/cli/src/generator-run.ts:1-185`

**Interfaces:**
- Consumes: GeneratorContext no longer has logger (Task 7)
- Produces: Modified generator-run.ts without logger

- [ ] **Step 1: Edit generator-run.ts - remove Logger import and logger creation**

```typescript
// REMOVE: import { Logger, type LogLevel } from "@dxgjs/logger";
// REMOVE: const minLevel: LogLevel = "info";
// REMOVE: const logger = new Logger({ minLevel });
// REMOVE: logger from returned context object (line ~130)
```

- [ ] **Step 2: Run typecheck to verify (will fail until Task 7)**

```bash
cd apps/cli && pnpm typecheck
```

- [ ] **Step 3: Commit (after Task 7)**

```bash
git add apps/cli/src/generator-run.ts
git commit -m "refactor(cli): remove @dxgjs/logger from generator context"
```

---

### Task 6: Update doctor types.ts - remove Logger from DoctorContext and DoctorCheckOptions

**Files:**
- Modify: `packages/doctor/src/types.ts:1-172`

**Interfaces:**
- Produces: DoctorContext and DoctorCheckOptions without logger property

- [ ] **Step 1: Edit types.ts - remove Logger import and logger property**

```typescript
// REMOVE: import type { Logger } from "@dxgjs/logger";
// REMOVE: logger: Logger; from DoctorCheckOptions (line ~81)
// REMOVE: logger: Logger; from DoctorContext (line ~119)
```

- [ ] **Step 2: Run typecheck to verify**

```bash
cd packages/doctor && pnpm typecheck
```

- [ ] **Step 3: Run tests**

```bash
cd packages/doctor && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add packages/doctor/src/types.ts
git commit -m "refactor(doctor): remove Logger type from DoctorContext"
```

---

### Task 7: Update generators types.ts - remove Logger from GeneratorContext

**Files:**
- Modify: `packages/generators/src/types.ts:1-41`

**Interfaces:**
- Produces: GeneratorContext without logger property

- [ ] **Step 1: Edit types.ts - remove Logger import and logger property**

```typescript
// REMOVE: import { Logger } from "@dxgjs/logger";
// REMOVE: logger: Logger; from GeneratorContext (line ~18)
```

- [ ] **Step 2: Run typecheck to verify**

```bash
cd packages/generators && pnpm typecheck
```

- [ ] **Step 3: Run tests**

```bash
cd packages/generators && pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add packages/generators/src/types.ts
git commit -m "refactor(generators): remove Logger type from GeneratorContext"
```

---

### Task 8: Update doctor package.json - remove @dxgjs/logger dependency

**Files:**
- Modify: `packages/doctor/package.json`

**Interfaces:**
- Consumes: None
- Produces: package.json without @dxgjs/logger

- [ ] **Step 1: Edit package.json - remove @dxgjs/logger from dependencies**

```json
// REMOVE: "@dxgjs/logger": "workspace:*",
```

- [ ] **Step 2: Run install, typecheck, tests**

```bash
cd packages/doctor && pnpm install && pnpm check
```

- [ ] **Step 3: Commit**

```bash
git add packages/doctor/package.json
git commit -m "chore(doctor): remove @dxgjs/logger dependency"
```

---

### Task 9: Update generators package.json - remove @dxgjs/logger dependency

**Files:**
- Modify: `packages/generators/package.json`

**Interfaces:**
- Consumes: None
- Produces: package.json without @dxgjs/logger

- [ ] **Step 1: Edit package.json - remove @dxgjs/logger from dependencies**

```json
// REMOVE: "@dxgjs/logger": "workspace:*",
```

- [ ] **Step 2: Run install, typecheck, tests**

```bash
cd packages/generators && pnpm install && pnpm check
```

- [ ] **Step 3: Commit**

```bash
git add packages/generators/package.json
git commit -m "chore(generators): remove @dxgjs/logger dependency"
```

---

### Task 10: Update CLI package.json - remove @dxgjs/logger dependency

**Files:**
- Modify: `apps/cli/package.json`

**Interfaces:**
- Consumes: None
- Produces: package.json without @dxgjs/logger

- [ ] **Step 1: Edit package.json - remove @dxgjs/logger from dependencies**

```json
// REMOVE: "@dxgjs/logger": "workspace:*",
```

- [ ] **Step 2: Run install, typecheck, tests**

```bash
cd apps/cli && pnpm install && pnpm check
```

- [ ] **Step 3: Commit**

```bash
git add apps/cli/package.json
git commit -m "chore(cli): remove @dxgjs/logger dependency"
```

---

### Task 11: Delete logger package directory

**Files:**
- DELETE: `packages/logger/` (entire directory)

**Interfaces:**
- Consumes: All dependent packages already updated
- Produces: Logger package removed from workspace

- [ ] **Step 1: Remove logger from pnpm-workspace.yaml if listed**

```bash
# Check pnpm-workspace.yaml for logger package entry
```

- [ ] **Step 2: Delete the directory**

```bash
rm -rf packages/logger
```

- [ ] **Step 3: Run install at root to verify workspace integrity**

```bash
pnpm install
```

- [ ] **Step 4: Run full test suite to verify nothing broke**

```bash
pnpm test
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove @dxgjs/logger package entirely"
```

---

### Task 12: Verify full build and tests pass

**Files:**
- All modified files

**Interfaces:**
- Consumes: Complete removal
- Produces: Green build and test suite

- [ ] **Step 1: Run full build**

```bash
pnpm build
```

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

- [ ] **Step 3: Run typecheck across workspace**

```bash
pnpm typecheck
```

- [ ] **Step 4: Verify CLI works manually**

```bash
pnpm --filter @dxgjs/cli build
node apps/cli/bin/index.js --help
```

- [ ] **Step 5: Final commit if any remaining changes**

```bash
git add -A
git commit -m "chore: final verification after logger removal"
```

---

## Self-Review Checklist

- [ ] All 4 dependent packages updated (workspace, doctor, generators, cli)
- [ ] All 5 logger calls replaced (3 workspace.warn, 1 capabilities.warn, 1 runner.error)
- [ ] Logger types removed from DoctorContext, DoctorCheckOptions, GeneratorContext
- [ ] Logger dependency removed from 4 package.json files
- [ ] Logger package directory deleted
- [ ] pnpm-workspace.yaml cleaned if needed
- [ ] All tests pass
- [ ] TypeScript compiles
- [ ] Build succeeds
- [ ] CLI runs

---

## Execution Notes

**Order dependency:** Tasks 4, 5 depend on Tasks 6, 7 respectively (type changes must happen first for typecheck to pass). Best execution order:
1. Tasks 1, 2, 3 (workspace - independent)
2. Tasks 6, 7 (types - independent)
3. Tasks 4, 5 (code using updated types)
4. Tasks 8, 9, 10 (package.json deps)
5. Task 11 (delete package)
6. Task 12 (verify)

**Alternative:** Do Tasks 6, 7 first, then 1-5, then 8-11.