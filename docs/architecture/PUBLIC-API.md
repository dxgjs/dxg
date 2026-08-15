# DXG Public APIs (Conceptual)

This section conceptually describes the public APIs of the different DXG packages. No implementation is provided here; only the signatures, responsibilities, and consumers are explained.

Each entry indicates:
- **What the API does**
- **Which package owns it**
- **Who consumes it** (e.g. CLI, other packages, plugins)
- **Public or internal** (visibility outside the monorepo or only internal)

---

## @dxgjs/terminal

### `terminal.render(tree: RenderableNode, options?: RenderOptions) => void`
- **What it does**: Renders a terminal node tree (`Box`, `Text`, `Table`, etc.) in the real terminal, applying the active theme and updating only modified regions (deferred rendering).
- **Owned by**: `@dxgjs/terminal`
- **Consumers**: CLI (to display command results), interactive prompts (`@dxgjs/prompts`), plugin panels, code generation outputs, any component that wants to display rich content.
- **Public**: Yes

### `terminal.clear() => void`
- **What it does**: Completely clears the terminal screen and places the cursor in the top-left corner.
- **Owned by**: `@dxgjs/terminal`
- **Consumers**: CLI (before displaying a new view), prompts, welcome screens.
- **Public**: Yes

### `terminal.resize(width: number, height: number) => void`
- **What it does**: Informs the terminal of a console size change (typically triggered by a SIGWINCH event or via the terminal API).
- **Owned by**: `@dxgjs/terminal`
- **Consumers**: Internal terminal event handler, CLI to adapt layouts.
- **Public**: Yes (often used internally but exposed for advanced integrations)

### `terminal.onKeyPress(handler: (key: KeyEvent) => void) => () => void`
- **What it does**: Registers a callback for keyboard key events; returns an unsubscribe function.
- **Owned by**: `@dxgjs/terminal`
- **Consumers**: Interactive prompts, custom panels, plugins that want to add keyboard shortcuts.
- **Public**: Yes

### `terminal.getTheme() => Theme`
- **What it does**: Returns the currently active theme object (colors, border styles, line characters).
- **Owned by**: `@dxgjs/terminal`
- **Consumers**: Rendering components that need to know current colors, plugins wishing to adapt their appearance.
- **Public**: Yes

### `terminal.setTheme(theme: Theme) => void`
- **What it does**: Sets a new active theme; triggers a re-render of the current display.
- **Owned by**: `@dxgjs/terminal`
- **Consumers**: CLI (theme change via command), plugins, configuration files.
- **Public**: Yes

---

## @dxgjs/logger

### `logger.createLogger(options?: LoggerOptions) => LoggerInstance`
- **What it does**: Creates a new logger instance with the specified options (minimum level, formatters, transports, default context).
- **Owned by**: `@dxgjs/logger`
- **Consumers**: All packages that need to log (core, terminal, cli, generators, AI, etc.), plugins, applications.
- **Public**: Yes

### `loggerInstance.log(level: LogLevel, message: string, meta?: Record<string, any>) => void`
- **What it does**: Writes a log message at the specified level, enriching with optional context.
- **Owned by**: `@dxgjs/logger` (on the instance)
- **Consumers**: Internal package code.
- **Public**: Yes (via the returned instance)

### Convenience methods: `trace`, `debug`, `info`, `warn`, `error`, `fatal`
- **What they do**: Call `log` with the corresponding level.
- **Owned by**: `@dxgjs/logger`
- **Consumers**: All code.
- **Public**: Yes

### `loggerInstance.setLevel(level: LogLevel) => void`
- **What it does**: Dynamically changes the minimum log level for this instance.
- **Owned by**: `@dxgjs/logger`
- **Consumers**: CLI (`--verbose`/`--silent` option), programs that want to adjust verbosity at runtime.
- **Public**: Yes

### `loggerInstance.addTransport(transport: Transport) => void`
- **What it does**: Adds a new transport (e.g. file, HTTP, webhook) to the logger instance.
- **Owned by**: `@dxgjs/logger`
- **Consumers**: Applications that want to send logs to a file or external service.
- **Public**: Yes

---

## @dxgjs/workspace

### `workspace.detect(root?: string) => Promise<WorkspaceResult>`
- **What it does**: From an optional root directory (default: current working directory), detects if the project is a workspace (pnpm, Turborepo, Nx, Lerna, or simple monorepo) and returns the workspace root plus the list of present projects with their `package.json`.
- **Owned by**: `@dxgjs/workspace`
- **Consumers**: CLI (commands that work on the entire workspace, e.g. `dxg update --all`), generators that want to iterate over all packages, plugins that need to know project structure.
- **Public**: Yes

### Returned interfaces:
- `interface WorkspaceResult { root: string; projects: WorkspaceProject[]; }`
- `interface WorkspaceProject { name: string; path: string; packageJson: Record<string, any>; dependencies: Record<string, string>; }`
- **Owned by**: `@dxgjs/workspace`
- **Consumers**: Any consumer of the `detect` function.
- **Public**: Yes (the interfaces are public as they are returned by a public function)

---

## @dxgjs/git

### `git.clone(url: string, destination?: string, options?: CloneOptions) => Promise<void>`
- **What it does**: Clones a remote Git repository into the destination directory (or current directory if not specified).
- **Owned by**: `@dxgjs/git`
- **Consumers**: CLI (potential `dxg clone` command), updater that fetches sources, plugins that want to add a submodule.
- **Public**: Yes

### `git.pull(options?: PullOptions) => Promise<void>`
- **What it does**: Performs a `git pull` in the current working directory (or specified in options).
- **Owned by**: `@dxgjs/git`
- **Consumers**: CLI (command `dxg pull`), updater, release scripts.
- **Public**: Yes

### `git.push(options?: PushOptions) => Promise<void>`
- **What it does**: Performs a `git push`.
- **Owned by**: `@dxgjs/git`
- **Consumers**: CLI, release workflows.
- **Public**: Yes

### `git.commit(message: string, options?: CommitOptions) => Promise<string>` (returns the commit hash)
- **What it does**: Creates a commit with the given message and options (optional file addition, GPG signing).
- **Owned by**: `@dxgjs/git`
- **Consumers**: CLI (command `dxg commit`), plugins that want to automate commit after generation.
- **Public**: Yes

### `git.status() => Promise<GitStatusResult>`
- **What it does**: Returns the status of the working directory (modified, added, deleted files, current branch, etc.).
- **Owned by**: `@dxgjs/git`
- **Consumers**: CLI (command `dxg status`), plugins that want to check before acting.
- **Public**: Yes

### Other useful functions: `branch`, `tag`, `log`, `diff`, `show`, `submoduleUpdate`, `fetch`, `reset`
- **Owned by**: `@dxgjs/git`
- **Consumers**: CLI, plugins, automation scripts.
- **Public**: Yes

---

## @dxgjs/config

### `config.load(sources: ConfigSource[], schema?: Schema<any>) => Promise<ConfigObject>`
- **What it does**: Loads configuration from an ordered list of sources (JSON/YAML/TOML files, environment variables, CLI arguments, default values), merges them according to priority (CLI > env > file > defaults), then validates the result against the provided schema (if any).
- **Owned by**: `@dxgjs/config`
- **Consumers**: CLI (loading `dxg.config.json`), generators that want to read project configuration, plugins that need parameters, AI (to read API keys and model preferences).
- **Public**: Yes

### Interfaces
- `type ConfigSource = { type: 'file' | 'env' | 'cli' | 'default'; payload?: any; }`
- `interface ConfigObject extends Record<string, any>` – the typed result if a schema is provided, otherwise `Record<string, any>`.
- **Owned by**: `@dxgjs/config`
- **Consumers**: Any function that consumes the result of `load`.
- **Public**: Yes

### `config.watch(sources: ConfigSource[], callback: (newConfig: ConfigObject) => void) => () => void`
- **What it does**: Watches the specified configuration files and calls the callback when any changes (reload and re-validation).
- **Owned by**: `@dxgjs/config`
- **Consumers**: CLI (watch mode for development commands), plugins that want to react to hot config changes.
- **Public**: Yes

---

## @dxgjs/validation

### `validation.object<T extends Record<string, any>>(shape: { [K in keyof T]: Schema<T[K]> }) => Schema<T>`
- **What it does**: Creates a schema for an object with the specified fields.
- **Owned by**: `@dxgjs/validation`
- **Consumers**: All packages that want to validate configuration inputs, prompt responses, AI data, etc.
- **Public**: Yes

### `validation.string(options?: { minLength?: number; maxLength?: number; regex?: RegExp; }) => Schema<string>`
- **What it does**: Creates a schema for a string with optional constraints.
- **Owned by**: `@dxgjs/validation`
- **Consumers**: Package name, path, and prompt response validation.
- **Public**: Yes

### `validation.number(options?: { min?: number; max?: number; integer?: boolean; }) => Schema<number>`
- **What it does**: Creates a schema for a number.
- **Owned by**: `@dxgjs/validation`
- **Consumers**: Port, version, and counter validation.
- **Public**: Yes

### `validation.union<T extends Schema<any>[]>(schemas: T) => Schema<UnionType<T>>`
- **What it does**: Creates a schema that accepts one of the provided schemas.
- **Owned by**: `@dxgjs/validation`
- **Consumers**: When a field can be of several types (e.g. string or number).
- **Public**: Yes

### `validation.refine<T>(schema: Schema<T>, refinement: (value: T) => boolean, message?: string) => Schema<T>`
- **What it does**: Adds a custom assertion to an existing schema.
- **Owned by**: `@dxgjs/validation`
- **Consumers**: Conditional validation (e.g. "this number must be even").
- **Public**: Yes

### `schema.parse(data: unknown) => T` (and `schema.safeParse`)
- **What it does**: Validates `data` against the schema; throws a detailed error on failure or returns the typed value on success. `safeParse` returns an object `{ success: boolean; data?: T; error?: ValidationError }`.
- **Owned by**: `@dxgjs/validation` (on the schema instance returned by the factories above).
- **Consumers**: Any code that wants to guarantee input conformity.
- **Public**: Yes

---

## @dxgjs/package-manager

### `packageManager.detect() => Promise<PackageManagerInstance>`
- **What it does**: Determines which package manager is active in the current directory (by looking for `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb` or by checking environment variables).
- **Owned by**: `@dxgjs/package-manager`
- **Consumers**: CLI (before executing an installation), generators that want to add a dependency, updater that wants to check versions.
- **Public**: Yes

### Instance methods (examples):
- `install(options?: InstallOptions) => Promise<void>` – Installs dependencies according to the lockfile.
- `add(packageName: string, version?: string, options?: AddOptions) => Promise<void>` – Adds a dependency.
- `remove(packageName: string, options?: RemoveOptions) => Promise<void>` – Removes a dependency.
- `list(options?: ListOptions) => Promise<Array<PackageInfo>>` – Returns the list of installed packages.
- `outdated(options?: OutdatedOptions) => Promise<Array<OutdatedInfo>>` – Returns packages with a newer version available.
- `runScript(scriptName: string, args?: string[], options?: RunOptions) => Promise<void>` – Executes a script defined in `package.json`.
- **Owned by**: `@dxgjs/package-manager`
- **Consumers**: CLI (commands `dxg add`, `dxg remove`, `dxg update`), generators, updater, plugins.
- **Public**: Yes

### Return interfaces (example):
- `interface PackageInfo { name: string; version: string; dev: boolean; }`
- **Owned by**: `@dxgjs/package-manager`
- **Consumers**: Any function that consumes the result of `list` or `outdated`.
- **Public**: Yes

---

## @dxgjs/node

### `node.getRuntime() => Promise<'node' | 'bun' | 'deno' | 'unknown'>`
- **What it does**: Determines which JavaScript runtime is currently used.
- **Owned by**: `@dxgjs/node`
- **Consumers**: CLI (to display warnings or adapt behavior), generators that want to generate runtime-specific code, updater that wants to check compatibility.
- **Public**: Yes

### `node.resolveNodeBinary() => Promise<string>`
- **What it does**: Returns the full path to the Node binary to use (taking into account `.nvmrc`, `nvm`, `fnm` or the PATH).
- **Owned by**: `@dxgjs/node`
- **Consumers**: CLI (execution of Node subprocesses), updater that wants to download a specific Node binary.
- **Public**: Yes

### `node.satisfiesEngines(packageJsonPath: string, currentVersion: string) => Promise<boolean>`
- **What it does**: Checks if the current runtime version satisfies the `engines` field of the specified `package.json`.
- **Owned by**: `@dxgjs/node`
- **Consumers**: CLI (before executing a generator that depends on a specific Node version), plugins that want to check compatibility.
- **Public**: Yes

### `node.readNVMRC(filePath?: string) => Promise<string | null>`
- **What it does**: Reads the `.nvmrc` file and returns the specified version (or null if absent/invalid).
- **Owned by**: `@dxgjs/node`
- **Consumers**: Same usage as above.
- **Public**: Yes

---

## @dxgjs/env

### `env.load(options?: { cwd?: string; override?: boolean; mask?: RegExp[] }) => Promise<EnvMap>`
- **What it does**: Loads environment variables from `.env`, `.env.local`, `.env.development`, `.env.production` files (according to `NODE_ENV` value or mode) applying priority and expanding `${VAR}` references.
- **Owned by**: `@dxgjs/env`
- **Consumers**: CLI (initial configuration loading), config loader (to inject environment variables into the configuration hierarchy), generators that want to access variables during rendering, AI (to read API keys stored in .env).
- **Public**: Yes

### `env.maskSecrets(target: Record<string, any>, mask?: RegExp[]) => Record<string, any>`
- **What it does**: Returns a copy of the object where values matching the mask patterns (by default: `/(pass|secret|key|token|auth)/i`) are replaced with `"[SECRET]"`.
- **Owned by**: `@dxgjs/env`
- **Consumers**: Logger (to avoid writing secrets in clear text), any code that wants to safely display a configuration object.
- **Public**: Yes

---

## @dxgjs/core

### `core.container.register<T>(token: string, factory: () => T) => void`
- **What it does**: Registers a factory to create a dependency of type `T` associated with `token`. The factory is called lazily at resolution time.
- **Owned by**: `@dxgjs/core`
- **Consumers**: All packages that want to provide a service (e.g. logger, config, fs) to other packages via dependency injection.
- **Public**: Yes

### `core.container.resolve<T>(token: string) => T`
- **What it does**: Resolves and returns an instance of the dependency associated with `token` (by calling the factory if necessary).
- **Owned by**: `@dxgjs/core`
- **Consumers**: All packages that want to consume a service provided by another package.
- **Public**: Yes

### `core.eventBus.on<T>(event: string, handler: (data: T) => void) => () => void`
- **What it does**: Subscribes to a named event; returns an unsubscribe function.
- **Owned by**: `@dxgjs/core`
- **Consumers**: Packages that want to react to lifecycle events (e.g. `pre:generate`, `post:update`), plugins that want to extend behavior.
- **Public**: Yes

### `core.eventBus.emit<T>(event: string, data: T) => void`
- **What it does**: Publishes an event with associated data; all subscribers receive the call.
- **Owned by**: `@dxgjs/core`
- **Consumers**: Packages that want to notify of a state change.
- **Public**: Yes

---

## @dxgjs/ai

### `ai.orchestrator.execute(taskName: string, variables: Record<string, any>, options?: { provider?: string; temperature?: number; }) => Promise<any>`
- **What it does**: Executes a named AI task (e.g. "generate-component", "refactor-code", "audit-security") by building a prompt from a registered template, injecting variables, calling the selected provider (or the default), and returning the raw model result.
- **Owned by**: `@dxgjs/ai`
- **Consumers**: CLI (command `dxg ai`), generators that want AI-assisted generation or revision, plugins that want to offer AI features.
- **Public**: Yes

### `ai.orchestrator.registerProvider(name: string, provider: AIProvider) => void`
- **What it does**: Registers a new AI provider (must implement the `AIProvider` interface with `complete`, `stream`, `embed` methods).
- **Owned by**: `@dxgjs/ai`
- **Consumers**: Plugins that want to add support for a new model or private provider.
- **Public**: Yes

### `ai.orchestrator.registerPrompt(name: string, template: string, schema?: Schema<any>) => void`
- **What it does**: Registers a prompt template associated with a name and optionally a validation schema for variables.
- **Owned by**: `@dxgjs/ai`
- **Consumers**: Same as above; allows defining reusable prompts for different tasks.
- **Public**: Yes

### `ai.orchestrator.getCacheStats() => CacheStats`
- **What it does**: Returns statistics on the semantic cache (hit rate, number of entries, average size).
- **Owned by**: `@dxgjs/ai`
- **Consumers**: CLI (debug option), monitoring tools.
- **Public**: Yes

### Interfaces (example):
- `interface AIProvider { complete(prompt: string, opts?: AIOptions): Promise<string>; stream(prompt: string, opts?: AIOptions): AsyncIterable<string>; embed(text: string): Promise<number[]>; }`
- `interface CacheStats { hits: number; misses: number; hitRate: number; entryCount: number; }`
- **Owned by**: `@dxgjs/ai`
- **Consumers**: Anything that consumes the methods above.
- **Public**: Yes

---

## @dxgjs/templates

### `templates.compile(source: string | TemplateSource) => TemplateFunction`
- **What it does**: Compiles a template string (or a promise resolving to a string) into an efficient rendering function.
- **Owned by**: `@dxgjs/templates`
- **Consumers**: Generators (to render files from data), plugins that want to provide their own templates, any code that wants to generate dynamic text.
- **Public**: Yes

### `templates.render(fn: TemplateFunction, data: Record<string, any>) => string`
- **What it does**: Executes the compiled template function with the provided data, returning the resulting string.
- **Owned by**: `@dxgjs/templates`
- **Consumers**: Same as above.
- **Public**: Yes

### `templates.registerHelper(name: string, fn: HelperFunction) => void`
- **What it does**: Registers a helper usable in templates (`{{name arg1 arg2}}`).
- **Owned by**: `@dxgjs/templates`
- **Consumers**: Those who want to extend the template engine with custom functions (e.g. date formatting, uppercase conversion).
- **Public**: Yes

### `templates.registerPartial(name: string, template: string) => void`
- **What it does**: Registers a partial (a sub-template) that can be included with `{{> name}}`.
- **Owned by**: `@dxgjs/templates`
- **Consumers**: Same as above.
- **Public**: Yes

---

## @dxgjs/generators

### `generators.generate(name: string, options?: { cwd?: string; promptsOverride?: any; skipAi?: boolean }) => Promise<GenerateResult>`
- **What it does**: Launches the generation process for the generator identified by `name`: information gathering via prompts (unless `promptsOverride` is provided), template selection, rendering with data, file writing, optional AI revision or refactoring step (if `skipAi` is false and a provider is configured).
- **Owned by**: `@dxgjs/generators`
- **Consumers**: CLI (command `dxg generate`), plugins that want to offer their own generators, automation scripts that want to scaffold a new component or service.
- **Public**: Yes

### Result interface (example):
- `interface GenerateResult { created: string[]; modified: string[]; skipped: string[]; warnings: string[]; }`
- **Owned by**: `@dxgjs/generators`
- **Consumers**: Same as above.
- **Public**: Yes

### `generators.registerGenerator(name: string, factory: () => GeneratorInterface) => void`
- **What it does**: Allows a plugin to register a new generator that will become available via `dxg generate <name>`.
- **Owned by**: `@dxgjs/generators`
- **Consumers**: Plugins that want to extend scaffolding possibilities.
- **Public**: Yes

---

## @dxgjs/updater

### `updater.checkForUpdates(currentVersion: string, channel?: 'stable' | 'beta' | 'nightly') => Promise<UpdateInfo | null>`
- **What it does**: Queries the configured registry (npm, GitHub Releases, custom server) to determine if a newer version of DXG is available in the specified channel.
- **Owned by**: `@dxgjs/updater`
- **Consumers**: CLI (command `dxg update` or automatic check at startup), CI scripts that want to ensure using the latest version.
- **Public**: Yes

### `UpdateInfo` interface (example):
- `interface UpdateInfo { version: string; releaseNotes: string; tarballUrl: string; signature?: string; requiredNodeVersion?: string; }`
- **Owned by**: `@dxgjs/updater`
- **Consumers**: Same as above.
- **Public**: Yes

### `updater.applyUpdate(updateInfo: UpdateInfo) => Promise<void>`
- **What it does**: Downloads the specified artifact, verifies its integrity, optionally extracts the archive, replaces the current installation (or installs version side-by-side according to strategy).
- **Owned by**: `@dxgjs/updater`
- **Consumers**: Same as above (generally called after a positive `checkForUpdates`).
- **Public**: Yes

---

## @dxgjs/plugins

### `plugins.load(options?: { cwd?: string; allowUnsafe?: boolean }) => Promise<PluginLoadResult>`
- **What it does**: Searches in the specified directory (or cwd) for installed packages that declare themselves as DXG plugins (field `dxg-plugin:true` in `package.json` or following the `dxg-plugin-*` convention), loads them in a sandboxed environment, validates their manifest and registers their extensions (commands, generators, hooks, AI providers, terminal extensions).
- **Owned by**: `@dxgjs/plugins`
- **Consumers**: CLI (at startup, to activate installed plugins), development tools that want to reload plugins on the fly.
- **Public**: Yes

### `PluginLoadResult` interface (example):
- `interface PluginLoadResult { loaded: string[]; failed: Array<{ name: string; error: string }>; warnings: string[]; }`
- **Owned by**: `@dxgjs/plugins`
- **Consumers**: Same as above.
- **Public**: Yes

### Plugin APIs (exposed within the sandbox):
- `plugin.registerCommand(command: CommandDescriptor) => void`
- `plugin.registerGenerator(generator: GeneratorDescriptor) => void`
- `plugin.registerHook(hook: HookDescriptor) => void`
- `plugin.registerAIProvider(provider: AIProviderDescriptor) => void`
- `plugin.registerTerminalExtension(extension: TerminalExtensionDescriptor) => void`
- **Owned by**: `@dxgjs/plugins` (but called from within the plugin context)
- **Consumers**: The plugin code itself.
- **Public**: No (these functions are only accessible inside the plugin sandbox; they are not part of the public API published on npm).

---

## @dxgjs/prompts

### `prompts.input(message: string, options?: { default?: string; validate?: (input:string)=>boolean|Promise<boolean>; }) => Promise<string>`
- **What it does**: Displays a prompt asking for text input, returns the entered value when the user presses Enter.
- **Owned by**: `@dxgjs/prompts`
- **Consumers**: Generators (to gather parameters like component name), CLI (for simple interactions), plugins that want to ask a question to the user.
- **Public**: Yes

### `prompts.confirm(message: string, options?: { default?: boolean }) => Promise<boolean>`
- **What it does**: Asks for a yes/no confirmation; returns `true` for yes, `false` for no or cancellation.
- **Owned by**: `@dxgjs/prompts`
- **Consumers**: CLI (before destructive action), generators (to confirm file overwrite), plugins.
- **Public**: Yes

### `prompts.select(message: string, choices: Array<{ title: string; value: any; description?: string }>, options?: { default?: any }) => Promise<any>`
- **What it does**: Presents a list of options and returns the value associated with the user's selection.
- **Owned by**: `@dxgjs/prompts`
- **Consumers**: Generators (template selection), CLI (configuration choice), plugins.
- **Public**: Yes

### `prompts.checkbox(message: string, choices: same as select) => Promise<any[]>`
- **What it does**: Allows selecting zero, one, or multiple options.
- **Owned by**: `@dxgjs/prompts`
- **Consumers**: Generators (enable/disable features), CLI (multi-choice).
- **Public**: Yes

### `prompts.autocomplete(message: string, suggestions: (input:string)=>Promise<string[]>, options?: { default?: string }) => Promise<string>`
- **What it does**: Dynamic suggestion during input; the user can choose from propositions or type their own value.
- **Owned by**: `@dxgjs/prompts`
- **Consumers**: Generators (dependency name input with registry search), CLI (command input with history).
- **Public**: Yes

### `prompts.password(message: string, options?: { mask?: string }) => Promise<string>`
- **What it does**: Like `input` but masks typed characters (useful for passwords or API keys).
- **Owned by**: `@dxgjs/prompts`
- **Consumers**: CLI (request for AI provider API key), plugins that want to securely retrieve a secret.
- **Public**: Yes

---

## @dxgjs/telemetry

### `telemetry.start(options?: { endpoint?: string; intervalMs?: number; consentCallback?: () => Promise<boolean>; }) => Promise<TelemetryController>`
- **What it does**: Initializes telemetry collection; if consent is given (via `consentCallback` or opt-in configuration), begins gathering events periodically and sending them to the specified endpoint.
- **Owned by**: `@dxgjs/telemetry`
- **Consumers**: CLI (at startup, to activate telemetry if user has consented), tools that want to disable or reconfigure telemetry at runtime.
- **Public**: Yes

### `TelemetryController` interface (example):
- `interface TelemetryController { updateConsent(consent: boolean): void; forceFlush(): Promise<void>; stop(): Promise<void>; }`
- **Owned by**: `@dxgjs/telemetry`
- **Consumers**: Same as above.
- **Public**: Yes

### Example payload sent:
- `{ anonId: string; timestamp: number; os: string; arch: string; runtime: string; version: string; command: string; success: boolean; durationMs: number; }`
- **Owned by**: `@dxgjs/telemetry` (internally)
- **Consumers**: Telemetry backend service.
- **Public**: No (the payload is internal, but the start function is public)

---