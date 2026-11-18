# DXG Public API Reference

This is the exported surface of each library, as of version 0.1.0. The libraries are pre-1.0 and mainly serve the CLI, so these APIs may change between minor versions. For what each package is for, see [`PACKAGES.md`](PACKAGES.md).

`@dxgjs/cli` has no programmatic API: it only provides the `dxg` binary.

## `@dxgjs/errors`

- **`DXGError`**: base error. Options: `recoverable`, `hints`, `docsUrl`, `recoveryAction` (`retry`, `reconfigure`, `manual-intervention`, `manual` or `abort`) and `cause`.
- **Specialized errors:** `PrismaVersionConflictError`, `ProviderUnsupportedError`, `ProviderMismatchError`, `BuildBlockedError`, `TemplateMissingError`, `InstallerFailureError`, `ValidationError`, `GitError`, `SpawnError`.
- **`isDXGError(error)`**: type guard.
- **`formatError(error)`, `formatDXGError(error)`, `formatErrorJSON(error)`**: render an error as text or as a JSON-serializable object.

## `@dxgjs/fs`

- **File operations:** `readFile`, `writeFile`, `appendFile`, `copyFile`, `mkdir`, `rm`, `readdir`, `stat` (and the `*Sync` variants of the first seven), plus `pathExists` and `pathExistsSync`.
- **Paths:** `sep`, `join`, `dirname`, `relative`, `resolve`.
- **Globbing:** `glob`, `globSync` (built on `fast-glob`).
- **JSON:** `readJson<T>(filePath)` and `writeJson(filePath, data, options?)`.
- **`addPackageScripts(packageJson, projectRoot, dryRun, force, fsUtils, scriptsToAdd)`**: adds scripts to a `package.json`, honouring dry-run and force, and reports which scripts were added, skipped or in conflict.
- **`executeCommand(command, args?, options?)`**: runs a command (through execa) with a default timeout, and kills the whole process tree on timeout.
- **`detectPackageManager(startDir?, { withFallback?, stopDir? })`**: resolves to `"npm"`, `"pnpm"`, `"yarn"` or `"bun"`.
- **`@dxgjs/fs/testing`:** `createMemoryFS(files?)`, an in-memory filesystem for tests.

## `@dxgjs/prompts`

- **`prompt<T>(questions)`**: asks a list of `PromptQuestion`s (`input`, `confirm` or `select`, each with `name`, `message` and optional `default`, `initialValue`, `choices`, `validate`) and resolves to the answers.
- **`spinner(options?)`**: progress spinner.
- **Re-exported from `@clack/prompts`:** `text`, `confirm`, `select`, `multiselect`, `intro`, `outro`, `note`, `cancel`, `isCancel`.

## `@dxgjs/ast`

Edits files while preserving formatting, comments and key order. Also available as the sub-entries `@dxgjs/ast/json` and `@dxgjs/ast/ts-injection`.

- **JSON and `.gitignore`:** `createAstHandle`, `addNpmScript`, `addNpmScripts`, `ensureGitignoreEntry`, `ensureGitignoreEntries`.
- **TypeScript/JavaScript sources:** `ensureImport`, `ensureDefaultImport`, `ensureNamespaceImport`, `ensureExport`, `ensureDefaultExport`, `addPropertyToObject`, `removePropertyFromObject`, `findNode`, `findNodes`, `insertStatement`, `appendStatement`, `parseSourceFile`, `writeSourceFile`.

## `@dxgjs/workspace`

- **`detectWorkspace(root?)`**: resolves to `{ root, projects }`, where each project has `name`, `version?`, `location` and `workspaceDependencies`.
- **`detectProjectAwareness(projectPath)`**: resolves to a `ProjectAwareness` with `projectRoot`, `workspaceRoot`, `framework` (`next-app`, `next-pages`, `next`, `vite`, `astro`, `react-router` or `unknown`), `language` (`typescript` or `javascript`), `packageManager`, `styling` (Tailwind detection), `capabilities` (tests, linting, formatter, CI, Docker) and `packageJson`.

## `@dxgjs/templates`

- **`render(template, data)`**: replaces `{{key}}` placeholders with values from `data`. Placeholders whose key is missing are left unchanged. There are no helpers, partials or conditionals.

## `@dxgjs/database-meta`

- **Paths:** `SCHEMA_PATH`, `CONFIG_PATH`, `ENV_PATH`, `PRISMA_CONFIG_PATH`, `DEFAULT_GENERATOR_OUTPUT`, `DEFAULT_HELPER_PATH`.
- **Providers:** `SUPPORTED_PROVIDERS` (`sqlite`, `postgresql`, `mysql`, `sqlserver`, `cockroachdb`, `planetscale`, `prismapostgres`), `providerData`, `getProviderData`, `isSupportedProvider`, `normalizePrismaProvider`, `providersMatch`, `providerPlaceholders`, `extractProviderFromConfig`, `extractProviderFromSchema`.
- **Scripts:** `databaseScriptCatalog`, `providerScripts`, `recommendedScripts`, `resolveDatabaseScripts`, `SEED_SCRIPT_NAME`, `SEED_FILE_PATH`, `SEED_CONFIG_COMMAND`.
- **Prisma version and arguments:** `PRISMA_PINNED_VERSION`, `buildPrismaInitArgs`, `classifyPrismaVersion`, `declaredVersion`, `parseVersion`, `specName`, `schemaHasLegacyDatasource`.
- **Client helper and imports:** `resolveGeneratorOutput`, `parseGeneratorOutput`, `computeRelativeImport`, `computeFileImport`, `normalizeHelperPath`, `validateHelperPath`, `isValidPrismaClientHelper`.
- **Validation and normalization:** `validateDatabase`, `sanitizeEnvValue`, `normalizeContent`.

## `@dxgjs/generators`

- **`databaseGenerator`**: the database generator (also the default export).
- **Types:** `Generator` (`name`, `description`, `prompts`, `run(answers, context)`) and `GeneratorContext` (filesystem interface, template renderer, `awareness`, `dryRun`, `force`, `nonInteractive` and an optional `installer`).
- **Installer engine** (internal to the generators and exposed so the CLI can build the installer): `createDependencyInstaller`, `detectPackageManagerAgent`, `installerFailureHint`, `classifyInstallFailure`, the build-approval helpers (`applyPnpmAllowBuilds`, `applyNpmAllowScripts`, `applyYarnBerryDependenciesMeta`, `mergeAllowBuildsBlock`, `approvalPaths`, `withDlxBuildApprovals`) and the blocked-build detectors and parsers (`isBunBlockedPostinstall`, `isNativeBuildFailed`, `isNpmInstallScriptsWarning`, `isPackageNotFound`, `isPnpmIgnoredBuilds`, `isYarnDisabledBuildScripts`, `parseNpmBlockedScripts`, `parsePnpmIgnoredBuilds`, `scanBlockedBuilds`, `packageNameFromSpec`).

## `@dxgjs/doctor`

- **`runDoctor(ctx)`**: runs all default checks (or those of the selected categories) and returns an aggregated report.
- **Registry:** `registerCheck`, `registerAllChecks`, `registerEnvChecks`, `registerProjectChecks`, `registerDatabaseChecks`, `registerScriptsChecks`, `getAllChecks`, `getCheck`, `getChecksByCategory`, `getDefaultChecks`, `clearRegistry`.
- **Running checks:** `runCheck`, `runCategoryChecks`, `formatCheckId`.
- **Fixes:** `showFixPreview`, `confirmFixes`, `applyFixes`.
- **Rendering:** `renderReport`, `renderJson`, `renderCheckResult`, `showIntro`, `showOutro`, `withSpinner`.
- **Options and exit codes:** `validateDoctorOptions`, `validateKnownFlags`, `DoctorExitCode` (`OK` 0, `ISSUES_FOUND` 1, `INVALID_USAGE` 2), `determineExitCode`, `mapExitCode`.
