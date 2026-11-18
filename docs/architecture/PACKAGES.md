# DXG Packages

All packages are published under the `@dxgjs` scope, are ESM only, require Node.js >= 22.13 and are versioned independently. Libraries are pre-1.0: their APIs are used by the CLI and may change between minor versions. Each entry lists what a package is for, what it exposes (see [`PUBLIC-API.md`](PUBLIC-API.md)), what it depends on and who uses it. The dependency graph is in [`DEPENDENCIES.md`](DEPENDENCIES.md).

## Application

### `@dxgjs/cli` (`apps/cli`)
- **Purpose:** the `dxg` command.
- **Commands:** `dxg add db|database`, `dxg doctor`.
- **Depends on:** `doctor`, `errors`, `fs`, `generators`, `prompts`, `templates`, `workspace`.
- **Surface:** the `dxg` binary only. There is no programmatic API.

## Libraries

### `@dxgjs/errors`
- **Purpose:** structured error hierarchy. `DXGError` carries hints, a documentation URL, a recovery action and a cause.
- **Surface:** `DXGError` and its specialized subclasses, `isDXGError`, `formatError`, `formatDXGError`, `formatErrorJSON`.
- **Depends on:** nothing. **Used by:** `cli`, `database-meta`, `doctor`, `generators`.

### `@dxgjs/fs`
- **Purpose:** filesystem and process abstraction: file operations, globbing, JSON helpers, command execution and package-manager detection.
- **Surface:** `@dxgjs/fs` and the in-memory `@dxgjs/fs/testing` helper for tests.
- **Depends on:** nothing internal. **Used by:** `cli`, `database-meta`, `doctor`, `generators`, `templates`, `workspace`.

### `@dxgjs/prompts`
- **Purpose:** interactive prompts, built on `@clack/prompts` with DXG styling.
- **Surface:** `prompt`, `spinner` and the re-exported `text`, `confirm`, `select`, `multiselect`, `intro`, `outro`, `note`, `cancel`, `isCancel`.
- **Depends on:** nothing internal. **Used by:** `cli`, `doctor`, `generators`.

### `@dxgjs/ast`
- **Purpose:** edits configuration and source files while preserving formatting and comments (built on Magicast and JSON5).
- **Surface:** `@dxgjs/ast` (also split into `@dxgjs/ast/json` and `@dxgjs/ast/ts-injection`).
- **Depends on:** nothing internal. **Used by:** `doctor`.

### `@dxgjs/workspace`
- **Purpose:** detects the workspace and the project: framework, language, package manager, Tailwind styling, capabilities and `package.json`.
- **Surface:** `detectProjectAwareness`, `detectWorkspace` and their types.
- **Depends on:** `fs`. **Used by:** `cli`, `doctor`, `generators`.

### `@dxgjs/templates`
- **Purpose:** minimal template rendering: `{{key}}` placeholders replaced from a data object.
- **Surface:** `render`.
- **Depends on:** `fs`. **Used by:** `cli`, `generators`.

### `@dxgjs/database-meta`
- **Purpose:** shared database knowledge: supported providers, paths, recommended scripts, the pinned Prisma version and validation helpers.
- **Surface:** providers, paths, scripts, Prisma version and import helpers, validation (see the API reference).
- **Depends on:** `errors`, `fs`. **Used by:** `doctor`, `generators`.

### `@dxgjs/generators`
- **Purpose:** the generator model and the database generator, including the dependency-installation engine used by generators.
- **Surface:** `databaseGenerator` (also the default export), the `Generator` and `GeneratorContext` types and the installer helpers.
- **Depends on:** `database-meta`, `errors`, `fs`, `prompts`, `templates`, `workspace`. **Used by:** `cli`.

### `@dxgjs/doctor`
- **Purpose:** diagnostic checks, report rendering and automatic fixes behind `dxg doctor`.
- **Surface:** the check registry and runner, fix helpers, renderers and exit-code utilities.
- **Depends on:** `ast`, `database-meta`, `errors`, `fs`, `prompts`, `workspace`. **Used by:** `cli`.

## Private tooling

| Package | Purpose |
| --- | --- |
| `@dxgjs/eslint-config` | Shared ESLint configuration |
| `@dxgjs/typescript-config` | Shared TypeScript configuration |
