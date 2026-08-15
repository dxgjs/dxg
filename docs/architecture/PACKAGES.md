# DXG Packages Catalog

Each package is described according to the following criteria:

- **package name**: npm name (scope @dxg)
- **purpose**: reason for the package's existence
- **responsibilities**: what the package does
- **public surface**: API exposed to consumers
- **internal responsibilities**: internal logic not exposed
- **allowed dependencies**: which other packages it may depend on
- **forbidden dependencies**: forbidden dependencies (to avoid cycles or undesirable couplings)
- **public or internal**: published on npm or reserved for internal monorepo use
- **exist now or later**: to be created immediately or in a later phase

---

## @dxgjs/terminal
- **purpose**: Offer a rich, customizable, and performant terminal rendering.
- **responsibilities**: Display management (text, colors, styles), layouts (flex-like), themes, animations, components (panels, tables, trees, spinners, progress bars, modals, tooltips), keyboard/mouse event capture, deferred rendering of dirty regions.
- **public surface**: Classes and functions to create a render tree (`Box`, `Text`, `Table`, `Tree`, `Spinner`, `ProgressBar`, `Panel`, `Modal`, `Tooltip`), methods to render (`render`, `clear`, `resize`), theme management (`setTheme`, `getTheme`), event handling (`onKeyPress`, `onMouseClick`).
- **internal responsibilities**: Layout calculation, screen buffer management, translation to ANSI/SIXEL sequences, focus management, render cache.
- **allowed dependencies**: `@dxgjs/logger` (to log rendering events), `@dxgjs/core` (to access services via DI/event bus if needed).
- **forbidden dependencies**: No high-level package (CLI, generators, AI, etc.), no package implementing business logic (workspace, git, config, etc.).
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/logger
- **purpose**: Provide a structured, configurable, and extensible logging system.
- **responsibilities**: Log levels (trace, debug, info, warn, error, fatal), formatters (JSON, pretty), transports (stdout, file, HTTP, webhook), context enrichment (trace-id, user-id, tags), dynamic filtering, file rotation (optional via transport).
- **public surface**: Methods (`log`, `trace`, `debug`, `info`, `warn`, `error`, `fatal`), instance creation with options (`createLogger`), methods to add/remove transports, set minimum level, enrich context.
- **internal responsibilities**: Transport management, message formatting, level-based filtering, optional buffering.
- **allowed dependencies**: `@dxgjs/validation` (to validate configuration options), `@dxgjs/core` (to publish log events if using the event bus).
- **forbidden dependencies**: No high-level package (terminal, CLI, AI, etc.) that would create coupling to presentation or business logic.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/workspace
- **purpose**: Detect project root, understand its structure (simple monorepo, pnpm, Nx, Turborepo, Lerna) and provide information about present projects/workspaces.
- **responsibilities**: Reading workspace definition files (`pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json`), analyzing the root `package.json`, resolving inter-project dependencies, returning a project tree with paths and their `package.json`.
- **public surface**: Async function `detectWorkspace(root?: string) => Promise<WorkspaceResult>`, interfaces `WorkspaceResult`, `WorkspaceProject`.
- **internal responsibilities**: Parsing configuration files, path resolution, handling edge cases (nested workspaces, non-standard workspaces).
- **allowed dependencies**: `@dxgjs/fs` (file system reading), `@dxgjs/json` (JSON parsing), `@dxgjs/logger`, `@dxgjs/validation` (workspace schema validation).
- **forbidden dependencies**: No package depending on application logic (CLI, generators, AI, terminal).
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/git
- **purpose**: Portable and typed abstraction of common Git operations.
- **responsibilities**: Execution of basic Git commands (`clone`, `pull`, `push`, `commit`, `add`, `reset`, `branch`, `tag`, `status`, `diff`, `log`, `show`, `submodule`), parsing output when useful, error handling (non-zero exit codes), support for GPG signatures and credential protocol.
- **public surface**: Typed methods corresponding to Git commands (e.g., `git.clone(url, dir) => Promise<void>`), result objects for status/diff, option management (e.g., `--depth`, `--branch`).
- **internal responsibilities**: Building process calls, managing stdout/stderr flow, transforming output into usable structures, authentication cache management.
- **allowed dependencies**: `@dxgjs/fs` (temporary file creation, directory existence verification), `@dxgjs/logger`, `@dxgjs/validation` (parameter validation).
- **forbidden dependencies**: No high-level package (CLI, workspace, AI, etc.) that would impose logic on when to call Git.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/fs
- **purpose**: Portable file system abstraction layer usable with different runtimes (Node, Bun, Deno future).
- **responsibilities**: Low-level operations: file reading/writing (`readFile`, `writeFile`), copy, deletion, moving, directory creation, directory reading (`readdir`), globbing (`glob`), change watching (`watch`), temporary directory creation (`mkdtemp`), symbolic link handling, existence checking (`exists`), permission management (mode).
- **public surface**: Async functions corresponding to the operations above, with options (e.g., encoding, mode, flag). Return of Buffers or strings depending on encoding.
- **internal responsibilities**: Runtime differences handling, path normalization, OS-specific error management.
- **allowed dependencies**: None (it's a fundamental package). May depend on `@dxgjs/logger` to trace its own operations if desired, but generally not necessary.
- **forbidden dependencies**: No high-level package (workflow, configuration, etc.) that would create coupling to business logic. In particular, must **not** depend on `@dxgjs/json` or `@dxgjs_config` — these treatments belong to specialized packages.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/config
- **purpose**: Load, merge, and validate configuration from multiple sources (files, environment variables, CLI arguments, default values).
- **responsibilities**: Define priority order (CLI > env > file > defaults), support multiple formats (JSON, YAML, TOML), internal reference resolution (`$ref`, similar to JSON Schema), file watching for hot reloading, validation according to a provided schema.
- **public surface**: Function `loadConfig(sources: ConfigSource[], schema?: Schema) => Promise<ConfigObject>`, methods to add sources, define a schema, enable watching.
- **internal responsibilities**: Reading and parsing different formats, merging according to priority, reference resolution, validation schema application, watch management (via chokidar or equivalent native).
- **allowed dependencies**: `@dxgjs/fs` (file reading), `@dxgjs/env` (environment variable reading), `@dxgjs/validation` (schema validation), `@dxgjs/json` (JSON object manipulation if needed), `@dxgjs/logger`.
- **forbidden dependencies**: No high-level package (CLI, generators, AI, etc.) that would dictate what configuration to load or how to use it.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/validation
- **purpose**: Data validation library inspired by Zod, providing composable schemas and clear error messages.
- **responsibilities**: Primitive type definitions (string, number, boolean, bigint, symbol, undefined, null, unknown, any), objects, arrays, tuples, unions, intersections, discriminated unions, refinements, transformations, detailed error management (path, received value, violated rule).
- **public surface**: Schema creation function (`z.object({...})`), chaining methods (`.refine(...)`, `.transform(...)`, `.superRefine(...)`), parsing method (`schema.parse(data) => typed data`), safe validation method (`schema.safeParse(data) => {success:boolean, data?:T, error?:ZodError}`).
- **internal responsibilities**: Recursive parsing implementation, error accumulation, optimization to avoid unnecessary cloning.
- **allowed dependencies**: None (fundamental package). May log its own operations via `@dxgjs/logger` if desired, but generally not necessary.
- **forbidden dependencies**: No high-level package (terminal, CLI, AI, etc.) that would create coupling to business logic.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/package-manager
- **purpose**: Unified interface above major JavaScript package managers (npm, Yarn, pnpm, Bun).
- **responsibilities**: Detection of the package manager in use (via lock file checks or environment variables), execution of common commands (`install`, `add`, `remove`, `list`, `outdated`, `run-script`, `exec`, `upgrade`, `why`), abstraction of flag name and behavior differences.
- **public surface**: `PackageManager` class with static methods (`detect() => PackageManagerInstance`) and instance methods corresponding to the operations above, returning typed results (e.g., `list() => Promise<Array<PackageInfo>>`).
- **internal responsibilities**: Building process calls specific to each manager, managing flow, parsing output when useful (e.g., `npm list --json` output).
- **allowed dependencies**: `@dxgjs/fs` (lock file existence verification), `@dxgjs/env` (reading variables like `npm_config_useragent`), `@dxgjs/logger`, `@dxgjs/validation` (package name and version verification).
- **forbidden dependencies**: No high-level package (CLI, generators, AI, etc.) that would assume a particular package manager.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/node
- **purpose**: Utilities related to the Node execution environment (and compatible with Bun/Deno when they involve similar functionalities).
- **responsibilities**: Reading `.nvmrc` file to determine desired Node version, comparing engine versions specified in `package.json` (`engines.node`), resolving the Node binary to use, providing helpers to check polyfill presence, detecting current runtime (Node vs Bun vs Deno).
- **public surface**: Functions such as `getNodeVersionFromNVMRC(path) => Promise<string|null>`, `satisfiesEngines(packageJsonPath, currentVersion) => Promise<boolean>`, `resolveNodeBinary() => Promise<string>`, `getRuntime() => Promise<'node'|'bun'|'deno'|'unknown'>`.
- **internal responsibilities**: File parsing, optional subprocess calls (`nvm`, `fnm`) if available, resolution error management.
- **allowed dependencies**: `@dxgjs/fs` (file system reading), `@dxgjs/env` (reading variables like `NVMRC`), `@dxgjs/logger`, `@dxgjs/validation` (semver validation).
- **forbidden dependencies**: No high-level package (CLI, AI, generators, etc.) that would assume a particular version or runtime.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/json
- **purpose**: Advanced and safe JSON object manipulation (deep-merge, patch, traversal, jq-like).
- **responsibilities**: Deep merge (`merge(target, source)`), JSON patch application (RFC 6902), object traversal with selector (`get(obj, path)`), update (`set(obj, path, value)`), deletion (`del(obj, path)`), recursive traversal (`walk(obj, callback)`), flattening and unflattening, deep comparison.
- **public surface**: Pure functions corresponding to the operations above, generally curried to facilitate composition. Return of new objects (immutability by default) unless otherwise indicated.
- **internal responsibilities**: Array handling, non-enumerable properties preservation, prototype preservation when desired, deep handling of dates, regular expressions, etc.
- **allowed dependencies**: None (fundamental package). May log via `@dxgjs/logger` if desired.
- **forbidden dependencies**: No high-level package (terminal, CLI, AI, etc.) that would create coupling to business logic.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/env
- **purpose**: Loading and expansion of environment variables from `.env`, `.env.local`, `.env.development`, etc., files, with secret masking.
- **responsibilities**: Reading one or more `.env` files according to priority, recursive expansion of references (`${VAR}`), providing a ready-to-use representation (key/value object), automatic masking of variables containing secret patterns (`password`, `secret`, `key`, `token`) in logs or errors.
- **public surface**: Function `loadEnv(options?: {cwd?: string; override?: boolean; mask?: RegExp[]}) => Promise<EnvMap>`, helper to mask values in an object (`maskSecrets(obj, mask)`).
- **internal responsibilities**: Dot-env spec compliant parsing, comment and empty line handling, safe expansion (avoid infinite loops), secret filtering.
- **allowed dependencies**: `@dxgjs/fs` (file reading), `@dxgjs/logger` (to log internal operations if needed), `@dxgjs/validation` (variable name validation if desired).
- **forbidden dependencies**: No high-level package (CLI, AI, generators, etc.) that would assume a particular environment variable format.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/core
- **purpose**: Lightweight core providing dependency injection primitives and typed inter-package communication via an event bus.
- **responsibilities**: Simple dependency injection container (registration of factories or instances, resolution by name or token), typed event bus allowing packages to subscribe to typed events and publish events, initialization/shutdown lifecycle management (hooks `onInit`, `onShutdown`).
- **public surface**: `Container` class with methods `register<T>(token: string, factory: () => T)` and `resolve<T>(token: string) => T`, `EventBus` class with methods `on<T>(event: string, handler: (data: T) => void)` and `emit<T>(event: string, data: T)`, possibly a combined facade `DXGCore` exposing both.
- **internal responsibilities**: Dependency registry management, circular dependency resolution (detection and error), event queue management if needed, cleanup on shutdown.
- **allowed dependencies**: `@dxgjs/logger` (to log core's internal operations), `@dxgjs/validation` (to validate dependency registrations or event schemas).
- **forbidden dependencies**: No package implementing high-level business logic (terminal, generators, AI, etc.) that would create undesirable coupling to the core. The core must remain agnostic.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/ai
- **purpose**: Artificial intelligence orchestration, supporting multiple providers and offering specialized agents.
- **responsibilities**: AI provider abstraction (Claude, GPT, Gemini, Fable, futures), versioned prompt registry, context construction from workspace, configuration, file system, etc., complex task planning (decomposition into subtasks, scheduling), specialized agents (code generator, reviewer, refactorer, auditor), semantic response caching, request rate management (rate-limiter) with exponential backoff, retry, and fallback between providers.
- **public surface**: `AIOrchestrator` class with methods like `execute(taskName: string, variables: Record<string,any>) => Promise<any>`, provider registration (`registerProvider(name, provider)`), prompt promise registration (`registerPrompt(name, template, schema)`), cache access (`getCacheStats()`).
- **internal responsibilities**: Context construction, provider selection, variable validation schema application, provider call with rendered prompt, potential post-treatment (code block extraction, formatting), cache management (key based on prompt+context+provider version hash), error handling and fallback.
- **allowed dependencies**: `@dxgjs/core` (DI/event bus to obtain services like logger or config), `@dxgjs/config` (loading API keys and model parameters), `@dxgjs/validation` (prompt schema and variable validation), `@dxgjs/logger` (AI call logging), `@dxgjs/fs` (possible context file reading), `@dxgjs/json` (JSON object manipulation if needed).
- **forbidden dependencies**: No high-level package that would dictate AI call logic (CLI, generators, etc.) except via the orchestrator's public interface.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/templates
- **purpose**: Lightweight and safe template engine for text generation from models and data.
- **responsibilities**: Syntax similar to Handlebars/EJS (expressions `{{variable}}`, blocks `{{#if}}`, `{{#each}}`, `{{#with}}`, predefined helpers), automatic escaping to avoid injections (XSS, command injection if used in scripts), layout and partial support, loading from file system or memory.
- **public surface**: Function `compile(templateString: string | TemplateSource) => TemplateFunction`, function `render(templateFn, data) => string`, methods to register helpers (`registerHelper(name, fn)`) and partials (`registerPartial(name, template)`).
- **internal responsibilities**: Template parsing into tree, efficient render function generation, compiled template cache management, escaping according to context (HTML, plain text, file path, etc.).
- **allowed dependencies**: `@dxgjs/fs` (template file reading if loaded from disk), `@dxgjs/logger` (to log compilation operations if needed), `@dxgjs/validation` (data validation if schema provided).
- **forbidden dependencies**: No high-level package (terminal, CLI, AI, generators) that would assume a particular template engine usage.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/generators
- **purpose**: Guided scaffolding by interactive prompts and template models.
- **responsibilities**: Generation process orchestration: information collection via prompts (`@dxgjs/prompts`), appropriate template selection, template rendering with collected data, resulting file writing via `@dxgjs/fs`, optionally applying post-generation transformations (formatting, lint) via tools or AI agents.
- **public surface**: Function `generate(generatorName: string, options?: {cwd?: string; promptsOverride?: any}) => Promise<GenerateResult>`, where `GenerateResult` contains created/modified file list and possibly warnings.
- **internal responsibilities**: Prompt flow management, template resolution (from generator package or from plugin), template engine call, secure file writing (avoid accidental overwrite without confirmation), optional integration with `@dxgjs/ai` for assisted generation or refactoring.
- **allowed dependencies**: `@dxgjs/prompts` (for interactive questions), `@dxgjs/templates` (for rendering), `@dxgjs/fs` (file writing), `@dxgjs/logger` (process logging), `@dxgjs/validation` (prompt response validation), `@dxgjs/ai` (optional, for AI-assisted generation or revision).
- **forbidden dependencies**: No package implementing high-level logic that should remain in the generator itself (e.g., no direct dependency on `@dxgjs/terminal` for display — the generator should return the result and let the decision-maker (CLI or plugin) choose how to display it).
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/updater
- **purpose**: Update availability checking, binary or package downloads, distribution channel management (stable, beta, nightly).
- **responsibilities**: Querying registries (npm, GitHub Releases, custom servers) for latest available version, comparison with current version per SemVer, download with progress display, integrity validation (checksum, GPG signature), archive extraction, temporary file cleanup.
- **public surface**: Function `checkForUpdates(currentVersion: string, channel?: 'stable'|'beta'|'nightly') => Promise<UpdateInfo | null>`, function `applyUpdate(updateInfo: UpdateInfo) => Promise<void>`, where `UpdateInfo` contains target version, download URL, checksums, etc.
- **internal responsibilities**: HTTP request construction, streaming download management, artifact validation, download cache management, potential plugin system integration for custom update strategies.
- **allowed dependencies**: `@dxgjs/fs` (temporary file writing and reading), `@dxgjs/logger` (update step logging), `@dxgjs/validation` (version number and registry response schema validation), `@dxgjs/json` (JSON response parsing from registries).
- **forbidden dependencies**: No high-level package (CLI, AI, generators, etc.) that would dictate when or how to update — the decision belongs to the application using the updater.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/plugins
- **purpose**: Discovery, loading, and secure management of external plugins.
- **responsibilities**: Plugin search in npm registry (packages with `dxg-plugin:true` field or following `dxg-plugin-*` convention), dynamic loading in a sandboxed environment (ESM with `importAttributes` or `vm2`), plugin manifest validation, extension points registration (commands, generators, hooks, AI providers, terminal extensions), plugin lifecycle management (activation, deactivation), provision of an API for plugins to access core services (logger, config, fs, etc.) via dependency injection.
- **public surface**: Function `loadPlugins(options?: {cwd?: string; allowUnsafe?: boolean}) => Promise<PluginLoadResult>`, classes allowing plugins to declare their manifest (`export const manifest: PluginManifest`), plugin API to register extensions (`registerCommand`, `registerGenerator`, `registerHook`, `registerAIProvider`, `registerTerminalExtension`).
- **internal responsibilities**: Plugin package resolution, sandbox creation with limited access to authorized APIs only, manifest export function call, manifest schema validation, internal extension registration, unloading and cleanup management.
- **allowed dependencies**: `@dxgjs/core` (to provide DI container and event bus to plugins), `@dxgjs/logger` (to log plugin loading), `@dxgjs/validation` (to validate plugin manifest), `@dxgjs/fs` (to verify plugin package existence on disk if loaded from local path).
- **forbidden dependencies**: No high-level package (terminal, CLI, AI, generators) that would create undesirable coupling to the plugin system from inside a plugin — plugins must depend only on abstractions provided by the core and packages they explicitly extend.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/prompts
- **purpose**: Terminal user interaction library, offering various interactive prompts.
- **responsibilities**: Prompt types: text input (`input`), confirmation (`confirm`), single selection (`select`), multiple selection (`checkbox`), autocompletion (`autocomplete`), password input (`password`). Each prompt returns a promise resolved with the entered value or rejected if user cancels (Ctrl+C, Esc). Theme support to harmonize appearance with `@dxgjs/terminal`, integrated answer validation, input masking (for passwords or sensitive inputs).
- **public surface**: Functions corresponding to each prompt type (`promptInput(message, options?)`, `promptConfirm(message, options?)`, `promptSelect(message, choices, options?)`, `promptCheckbox(message, choices, options?)`, `promptAutocomplete(message, suggestions, options?)`, `promptPassword(message, options?)`), each returning `Promise<string | string[] | boolean | void>` according to type.
- **internal responsibilities**: Keyboard event handling from terminal (via `@dxgjs/terminal` or event abstraction), option rendering, navigation management (arrows, enter, escape), dynamic display based on theme, input masking for passwords.
- **allowed dependencies**: `@dxgjs/terminal` (to display prompts and capture inputs if prompt engine is built on terminal), `@dxgjs/logger` (to log interactions if desired), `@dxgjs/validation` (to validate responses if a schema is provided).
- **forbidden dependencies**: No high-level package (CLI, generators, AI, etc.) that would dictate what to ask or how to interpret responses — prompt logic must remain pure and reusable.
- **public or internal**: Public
- **exist now or later**: Now

---

## @dxgjs/telemetry
- **purpose**: Optional and anonymized usage data collection to improve the product while respecting privacy.
- **responsibilities**: Generation of a stabilized anonymous identifier (UUID v4 stored or derived), periodic sending of a payload containing usage metrics (executed commands, success/failure, durations, package versions, operating system, CPU architecture) to a telemetry endpoint, respecting user consent (opt-in via configuration flag or environment variable), event batching to reduce request count, light encryption or obfuscation of sensitive data, Do-Not-Track compliance.
- **public surface**: Function `startTelemetry(options?: {endpoint?: string; intervalMs?: number; consentCallback?: () => Promise<boolean>}) => Promise<TelemetryController>`, controller methods to update consent, force sending, stop telemetry.
- **internal responsibilities**: Safe anonymous ID storage and generation, payload construction according to predefined schema, event queue management, timing and resend management on failure, sensitive data clearing before sending.
- **allowed dependencies**: `@dxgjs/fs` (anonymous ID disk storage), `@dxgjs/logger` (to log telemetry errors without revealing sensitive data), `@dxgjs/validation` (payload schema validation if needed), `@dxgjs/json` (payload serialization).
- **forbidden dependencies**: No high-level package (CLI, AI, generators, etc.) that would assume telemetry is always active or dictate what to collect — the decision to activate and payload definition remain in this package.
- **public or internal**: Public
- **exist now or later**: Now

---

## General Remarks and Challenges
- None of the packages listed above must be considered mandatory immediately; some could be introduced later according to real needs (e.g., `@dxgjs/updater` could await a first binary CLI version).
- The strict separation between `@dxgjs/terminal` and `@dxgjs/logger` is intentional: the terminal must **not** perform logging, and the logger must **not** know rendering concepts.
- The `@dxgjs/core` package is intentionally minimal; it must **not** extend to include configuration, validation, or templating logic — these responsibilities belong to their own dedicated packages.
- A global `@dxgjs/types` package is **not** created; types remain either in the concerned package, or in internal non-published contracts (see Type Architecture section below).
- If two packages were to be merged (e.g., `@dxgjs/env` and `@dxgjs/config` share loading responsibilities), we decided to keep them separate because environment loading is a distinct concern from multi-source, multi-format configuration resolution.
- A missing package could be `@dxgjs/errors` for a typed error hierarchy, but we estimate that errors can be modeled as simple objects enriched with context, and each package can define its own error types if necessary; a dedicated package would add indirection without clear benefit.
- The `@dxgjs/processus` package (subprocess life cycle management) is covered by `@dxgjs/fs` (temporary file creation) and by direct use of `child_process` in packages that need it (like `@dxgjs/git`, `@dxgjs/package-manager`); no additional abstraction is currently judged necessary.

---

## Type Architecture (where types live)

### @dxgjs/types (considered but rejected option)
We deliberately **avoided** creating a global `@dxgjs/js/types` package containing all ecosystem types. Such a package would tend to become a junk drawer and create undesirable couplings: a low-level package would end up depending on types defining high-level concepts simply to share an interface.

### Local Types (preferred)
- Each package defines its own types and interfaces strictly tied to its responsibilities.
  Example: `@dxgjs/terminal` defines `TerminalOptions`, `Theme`, `BoxProps`, etc.
  Example: `@dxgjs/validation` defines `Schema<T>`, `ParseResult<T>`, etc.
- This approach ensures types evolve with their package and consumers import only what they truly need.

### Internal Shared Contracts (non-published)
Only **stable and cross-domain** contracts are shared via an internal non-publishing mechanism (in `tooling/types/` or a private `@dxgjs/_contracts` package not published on npm). These contracts include:
- Plugin manifest interface (`PluginManifest`)
- Core event bus event types (`EventMap`)
- Context types transmitted between CLI operation steps (e.g., `CliContext`)
- Workspace detection result types (`WorkspaceResult`, `WorkspaceProject`)

These types are imported via relative paths (`../../tooling/types/...`) or via a type-only alias (no runtime code published). They are **not** bundled in npm distributions, thus avoiding internal API exposure to external consumers.

### Contents of @dxgjs/core
The `@dxgjs/core` package contains only:
- Dependency injection container (`Container`)
- Typed event bus (`EventBus`)
- Possibly a few very general utility types (`DXGToken<T>` to represent a DI registration, `ListenerFn`).
It **does not** contain:
- Specific configuration types
- Validation types
- Template types
- Terminal types
- Any other type belonging to a particular domain.

This restriction ensures the core remains truly agnostic and does not become a heterogeneous types dump.