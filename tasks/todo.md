# Task List: Refactor @dxgjs/doctor to Leverage @dxgjs/database-meta and @dxgjs/ast

## Phase 1: Database Checks Refactor (Core)

### Task 1: Import and use database-meta constants in database.ts ✅ DONE
**Description:** Replace hardcoded paths and provider lists with imports from @dxgjs/database-meta
**Acceptance criteria:**
- [x] SCHEMA_PATH, PRISMA_CONFIG_PATH, DEFAULT_HELPER_PATH, DEFAULT_GENERATOR_OUTPUT imported from @dxgjs/database-meta
- [x] SUPPORTED_PROVIDERS imported and used instead of hardcoded array
- [x] findPrismaSchema and findPrismaConfig use imported constants
**Verification:**
- [x] Tests pass: `pnpm --filter @dxgjs/doctor test`
- [x] Build succeeds: `pnpm --filter @dxgjs/doctor build`
**Dependencies:** None
**Files:** `packages/doctor/src/checks/database.ts`
**Scope:** Small

### Task 2: Replace extractProvider() with database-meta functions ✅ DONE
**Description:** Use extractProviderFromSchema, extractProviderFromConfig, normalizePrismaProvider from database-meta
**Acceptance criteria:**
- [x] extractProvider() function replaced with database-meta functions
- [x] checkPrismaSchema, checkPrismaConfig, checkProvider use database-meta functions
- [x] Provider normalization handles "postgres" -> "postgresql"
**Verification:**
- [x] Tests pass: `pnpm --filter @dxgjs/doctor test`
- [x] Build succeeds
**Dependencies:** Task 1
**Files:** `packages/doctor/src/checks/database.ts`
**Scope:** Small

### Task 3: Replace provider validation with isSupportedProvider/getProviderData ✅ DONE
**Description:** Use database-meta's isSupportedProvider and getProviderData for validation
**Acceptance criteria:**
- [x] Hardcoded validProviders array removed
- [x] checkProvider uses isSupportedProvider()
- [x] Provider metadata (adapter, template, etc.) available via getProviderData()
**Verification:**
- [x] Tests pass
- [x] Build succeeds
**Dependencies:** Task 2
**Files:** `packages/doctor/src/checks/database.ts`
**Scope:** Small

### Task 4: Replace generator output resolution with parseGeneratorOutput + resolveGeneratorOutput ✅ DONE
**Description:** Use database-meta's schema utilities for generator output path resolution
**Acceptance criteria:**
- [x] parseGeneratorOutput() used to extract generator output from schema
- [x] resolveGeneratorOutput() used to resolve relative path
- [x] Logic matches generator behavior exactly
**Verification:**
- [x] Tests pass
- [x] Build succeeds
**Dependencies:** Task 1
**Files:** `packages/doctor/src/checks/database.ts`
**Scope:** Medium

### Task 5: Replace helper validation with isValidPrismaClientHelper ✅ DONE
**Description:** Use database-meta's isValidPrismaClientHelper for content validation
**Acceptance criteria:**
- [x] Custom regex validation removed
- [x] checkHelperFile uses isValidPrismaClientHelper()
- [x] Validation checks all 5 required patterns
**Verification:**
- [x] Tests pass
- [x] Build succeeds
**Dependencies:** Task 1
**Files:** `packages/doctor/src/checks/database.ts`
**Scope:** Small

### Task 6: Use databaseScriptCatalog and recommendedScripts for seed/scripts checks ✅ PARTIAL
**Description:** Replace hardcoded scripts with database-meta's script catalog
**Acceptance criteria:**
- [x] checkSeedConfig uses SEED_SCRIPT_NAME, SEED_CONFIG_COMMAND from database-meta
- [ ] Script validation uses databaseScriptCatalog (in scripts.ts - Task 10)
- [ ] recommendedScripts() used for provider-specific recommendations (in scripts.ts - Task 10)
**Verification:**
- [x] Tests pass
- [x] Build succeeds
**Dependencies:** Task 1
**Files:** `packages/doctor/src/checks/database.ts`, `packages/doctor/src/checks/scripts.ts`
**Scope:** Small

### Task 7: Use providerData for SQLite-specific checks ✅ DONE
**Description:** Replace hardcoded SQLite logic with providerData lookup
**Acceptance criteria:**
- [x] checkSqliteDbFile uses getProviderData("sqlite") to verify provider
- [x] SQLite-specific paths derived from provider data
**Verification:**
- [x] Tests pass
- [x] Build succeeds
**Dependencies:** Task 3
**Files:** `packages/doctor/src/checks/database.ts`
**Scope:** Small

## Phase 2: Environment Checks Refactor

### Task 8: Use providerPlaceholders for DATABASE_URL format validation ✅ DONE
**Description:** Replace hardcoded protocol validation with provider-specific placeholders
**Acceptance criteria:**
- [x] checkDatabaseUrlFormat imports providerPlaceholders
- [x] Validation uses provider-specific placeholder patterns
- [x] SQLite file: and postgresql:// etc. validated correctly
**Verification:**
- [x] Tests pass
- [x] Build succeeds
**Dependencies:** Task 1
**Files:** `packages/doctor/src/checks/env.ts`
**Scope:** Small

### Task 9: Use providerData for protocol validation per provider ✅ DONE
**Description:** Use provider metadata for DATABASE_URL protocol validation
**Acceptance criteria:**
- [x] Protocol validation derived from providerData
- [x] Connection string vs individual params handled per provider
**Verification:**
- [x] Tests pass
- [x] Build succeeds
**Dependencies:** Task 3, Task 8
**Files:** `packages/doctor/src/checks/env.ts`
**Scope:** Small

## Phase 3: Scripts Checks Refactor

### Task 10: Replace hardcoded Prisma scripts with databaseScriptCatalog ✅ DONE
**Description:** Use database-meta's script catalog instead of hardcoded object
**Acceptance criteria:**
- [x] requiredPrismaScripts object removed
- [x] checkPrismaScripts uses databaseScriptCatalog
- [x] recommendedScripts() used for filtering
- [x] SEED_SCRIPT_NAME used for optional seed script
**Verification:**
- [x] Tests pass
- [x] Build succeeds
**Dependencies:** Task 1
**Files:** `packages/doctor/src/checks/scripts.ts`
**Scope:** Small

## Phase 4: AST-Based Fixes

### Task 11: Add AST-based fix for Prisma schema provider ✅ DONE
**Description:** Use @dxgjs/ast to fix provider in schema.prisma
**Acceptance criteria:**
- [x] checkProvider returns fixable: true when provider missing
- [x] Fix uses parseSourceFile + addPropertyToObject/ensureImport
- [x] Formatting preserved in modified schema.prisma
**Verification:**
- [x] Tests pass
- [x] Manual test: run doctor fix on schema without provider
**Dependencies:** Task 2
**Files:** `packages/doctor/src/checks/database.ts`
**Scope:** Medium

### Task 12: Add AST-based fix for generator output path ✅ DONE
**Description:** Use @dxgjs/ast to add/fix generator output in schema.prisma
**Acceptance criteria:**
- [x] checkPrismaClient returns fixable: true when generator output missing
- [x] Fix uses parseSourceFile + addPropertyToObject on generator block
- [x] Uses DEFAULT_GENERATOR_OUTPUT from database-meta
**Verification:**
- [x] Tests pass
- [x] Manual test: run doctor fix on schema without generator output
**Dependencies:** Task 4
**Files:** `packages/doctor/src/checks/database.ts`
**Scope:** Medium

### Task 13: Add AST-based fix for helper file creation ✅ DONE
**Description:** Use @dxgjs/ast to create Prisma helper file from template
**Acceptance criteria:**
- [x] checkHelperFile returns fixable: true when helper missing
- [x] Fix uses createAstHandle + template from providerData
- [x] Helper file passes isValidPrismaClientHelper validation
**Verification:**
- [x] Tests pass
- [x] Manual test: run doctor fix on project without helper
**Dependencies:** Task 3, Task 5
**Files:** `packages/doctor/src/checks/database.ts`
**Scope:** Medium

## Phase 5: Verification & Cleanup

### Task 14: Run all doctor tests and verify behavior ✅ DONE
**Description:** Execute full test suite and verify no regressions
**Acceptance criteria:**
- [x] All existing tests pass
- [x] No new test failures
**Verification:**
- [x] `pnpm --filter @dxgjs/doctor test` passes
**Dependencies:** Tasks 1-13
**Files:** All
**Scope:** Small

### Task 15: Build package and verify no TypeScript errors ✅ DONE
**Description:** TypeScript compilation check
**Acceptance criteria:**
- [x] `pnpm --filter @dxgjs/doctor build` succeeds
- [x] No type errors
**Verification:**
- [x] Build output clean
**Dependencies:** Task 14
**Files:** All
**Scope:** Small

### Task 16: Remove dead code (unused local functions) ✅ DONE
**Description:** Clean up functions replaced by database-meta imports
**Acceptance criteria:**
- [x] Custom validation regexes removed (replaced by isValidPrismaClientHelper)
- [x] Hardcoded arrays removed (replaced by SUPPORTED_PROVIDERS, databaseScriptCatalog, etc.)
- [x] Note: extractProvider() and findHelperFile() kept as they wrap database-meta functions and have no direct replacement
**Verification:**
- [x] Build succeeds
- [x] No unused imports
**Dependencies:** Tasks 1-13
**Files:** `packages/doctor/src/checks/database.ts`, `packages/doctor/src/checks/env.ts`, `packages/doctor/src/checks/scripts.ts`
**Scope:** Small

## Checkpoints

### Checkpoint: After Phase 1 (Tasks 1-7) ✅ COMPLETE
- [x] All database checks pass existing tests
- [x] No TypeScript errors in database.ts
- [x] Provider detection works for all 7 providers
- [x] Generator output resolution matches generator behavior

### Checkpoint: After Phase 2-3 (Tasks 8-10) ✅ COMPLETE
- [x] Env checks pass existing tests
- [x] DATABASE_URL validation uses provider-specific placeholders
- [x] Scripts checks pass existing tests
- [x] Prisma scripts validation uses databaseScriptCatalog

### Checkpoint: After Phase 4 (Tasks 11-13) ✅ COMPLETE
- [x] AST-based fixes apply correctly
- [x] Formatting preserved in modified files

### Checkpoint: Complete (Tasks 14-16) ✅ COMPLETE
- [x] All tests pass
- [x] Build succeeds
- [x] No unused imports or dead code