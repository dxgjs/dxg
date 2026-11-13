# Implementation Plan: Refactor @dxgjs/doctor to Leverage @dxgjs/database-meta and @dxgjs/ast

## Overview
The `@dxgjs/doctor` package currently duplicates significant logic that already exists in `@dxgjs/database-meta` and `@dxgjs/ast`. This plan refactors the doctor checks to use the centralized, tested utilities from these packages, reducing code duplication, improving maintainability, and ensuring consistency with the database generator.

## Architecture Decisions
- **Single source of truth**: All provider metadata, paths, scripts, and validation logic live in `@dxgjs/database-meta`
- **AST-based modifications**: Use `@dxgjs/ast` for all file modifications (Prisma schema, package.json, .gitignore, .env) to preserve formatting
- **Pure functions first**: Prefer pure validation functions from database-meta over inline regex/string manipulation
- **Vertical slicing**: Refactor one check category at a time (database → env → scripts → project), verifying each works before moving on

## Task List

### Phase 1: Database Checks Refactor (Core)
- [x] Task 1: Import and use database-meta constants (paths, providers) in database.ts
- [x] Task 2: Replace extractProvider() with database-meta's extractProviderFromSchema/Config + normalizePrismaProvider
- [x] Task 3: Replace provider validation with isSupportedProvider and getProviderData
- [x] Task 4: Replace generator output resolution with parseGeneratorOutput + resolveGeneratorOutput
- [x] Task 5: Replace helper validation with isValidPrismaClientHelper
- [x] Task 6: Use databaseScriptCatalog and recommendedScripts for seed/scripts checks
- [x] Task 7: Use providerData for SQLite-specific checks

### Phase 2: Environment Checks Refactor
- [x] Task 8: Use providerPlaceholders for DATABASE_URL format validation in env.ts
- [x] Task 9: Use providerData for protocol validation per provider

### Phase 3: Scripts Checks Refactor
- [x] Task 10: Replace hardcoded Prisma scripts with databaseScriptCatalog + recommendedScripts

### Phase 4: AST-Based Fixes
- [x] Task 11: Add AST-based fix for Prisma schema provider (database:provider)
- [x] Task 12: Add AST-based fix for generator output path (database:prisma-client)
- [x] Task 13: Add AST-based fix for helper file creation (database:helper-file)

### Phase 5: Verification & Cleanup
- [x] Task 14: Run all doctor tests and verify behavior unchanged
- [x] Task 15: Build package and verify no TypeScript errors
- [x] Task 16: Remove dead code (unused local functions)

## Checkpoints

### Checkpoint: After Phase 1 (Tasks 1-7) ✅ COMPLETE
- [x] All database checks pass existing tests
- [x] No TypeScript errors in database.ts
- [x] Provider detection works for all 7 providers
- [x] Generator output resolution matches generator behavior

### Checkpoint: After Phase 2-3 (Tasks 8-10) ✅ COMPLETE
- [x] Env and scripts checks pass existing tests
- [x] DATABASE_URL validation uses provider-specific placeholders

### Checkpoint: After Phase 4 (Tasks 11-13)
- [ ] AST-based fixes apply correctly
- [ ] Formatting preserved in modified files

### Checkpoint: Complete (Tasks 14-16)
- [ ] All 318 tests pass
- [ ] Build succeeds
- [ ] No unused imports or dead code

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking change in provider detection logic | High | Run existing tests after each task; database-meta has 318 passing tests |
| AST modifications don't preserve formatting | Medium | Use magicast which is designed for this; test on real files |
| Missing edge cases in database-meta functions | Low | database-meta functions are battle-tested in generators |
| Tests fail due to behavior changes | Medium | Compare test outputs before/after; update tests if expectations change |

## Open Questions
- Should we add new check types enabled by database-meta (e.g., version classification)?
- Should project.ts also use database-meta for .gitignore patterns?

---

## Task Tracking (tasks/todo.md)