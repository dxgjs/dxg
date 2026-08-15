# DXG Plugin System

This document describes the architecture of the plugin system that allows extending DXG functionalities without modifying the core. It remains conceptual; no implementation is provided.

## Objective
Allow third-party developers to create npm packages (e.g., `@acme/dxg-plugin-tailwind`) that integrate easily with DXG by adding:
- New CLI commands
- New generators
- Additional templates
- Lifecycle hooks
- Custom AI providers
- Terminal extensions (panels, components, themes)
All while maintaining secure isolation (sandbox) and avoiding dependency conflicts.

## Plugin Discovery
At CLI startup (or when a `dxg plugin …` command is invoked), DXG searches for plugins via two mechanisms:
1. **Naming convention**: any locally installed or workspace package whose name starts with `dxg-plugin-` (e.g., `dxg-plugin-myfeature`, `@scope/dxg-plugin-foo`) is considered a candidate.
2. **Explicit field in `package.json`**: any package possessing the field `"dxg-plugin": true` is also recognized, regardless of its name.

This dual approach allows flexibility: plugins can follow the naming convention for automatic discovery, or simply indicate their intention via the boolean field.

The search is limited to the project's working directory (and optionally to workspaces configured via `pnpm-workspace.yaml`) to avoid loading unwanted global plugins.

## Loading and Sandboxing
Each candidate plugin is loaded in a **sandboxed** environment to limit its access solely to APIs exposed by DXG. Two strategies are envisaged:
- **Dynamic ESM with `importAttributes`**: the package is imported as an ES module with a restricted `global` object (no access to `process`, `require`, etc.) and only the exports declared by the plugin are visible.
- **VM2 or equivalent**: for stronger isolation, the plugin code is executed in a virtual context where only explicitly authorized functions are injected.

The sandbox ensures the plugin cannot perform dangerous operations (arbitrary file system read/write, unauthorized network access, main process modification) without going through DXG APIs that can apply their own controls (e.g., path validation, quotas).

### APIs Exposed to Plugins (in the sandbox)
From the plugin context, the following functions are available:

| Function | Description |
|----------|-------------|
| `registerCommand(descriptor: CommandDescriptor) => void` | Registers a new command available via `dxg <command>`. |
| `registerGenerator(descriptor: GeneratorDescriptor) => void` | Registers a new generator usable via `dxg generate <name>`. |
| `registerHook(descriptor: HookDescriptor) => void` | Registers a hook that will be called at a predetermined lifecycle point. |
| `registerAIProvider(descriptor: AIProviderDescriptor) => void` | Registers a new AI provider usable by the AI orchestrator. |
| `registerTerminalExtension(descriptor: TerminalExtensionDescriptor) => void` | Registers a terminal extension (e.g., a new panel type or rendering component). |
| `getCoreServices() => { logger: Logger; config: Config; fs: FS; ... }` | Provides read-only access to certain core services (logger, config, fs, etc.) allowing the plugin to accomplish its tasks without requiring direct dependencies. |
| `getPluginContext() => PluginContext` | Returns metadata about the plugin itself (name, version, installation directory). |

Each of these APIs performs input validation and, if applicable, capability verification (e.g., a plugin attempting to register a command must provide a unique name and a functional handler).

## Extension Points Registration

### Commands
A command descriptor has the form:
```ts
interface CommandDescriptor {
  name: string;                   // command name (e.g., "add-tailwind")
  description: string;            // help text displayed in `dxg help`
  handler: (args: string[], context: PluginContext) => Promise<void>; // command logic
  options?: OptionDescriptor[];   // option definitions (flags) usable by a commander.js or yargs parser
}
```
The CLI's command system (likely based on a library like `commander.js` or `oclif`) merges built-in commands with those registered by plugins, ensuring name uniqueness.

### Generators
A generator descriptor resembles:
```ts
interface GeneratorDescriptor {
  name: string;                                 // name used in `dxg generate <name>`
  description: string;                          // help text
  prompts?: PromptDescriptor[] | PromptFunction; // either a static list of prompts, or a function returning prompts based on previous answers
  template: string | TemplateSource;            // path to template file or inline template string
  outputPathResolver?: (answers: Record<string, any>) => string; // function returning destination path relative to cwd
  postProcess?: (files: string[], answers: Record<string, any>) => Promise<void>; // optional step after writing (formatting, lint via AI)
}
```
The generator uses the `@dxgjs/templates` template engine and the `@dxgjs/prompts` prompt system from the core (provided via services or directly if the plugin declares these dependencies as peer).

### Hooks
A hook descriptor has:
```ts
interface HookDescriptor {
  event: string;                                 // event name (e.g., "pre:generate", "post:update", "plugin:load")
  handler: (context: PluginContext) => Promise<void>; // async function to execute
  priority?: number;                             // execution order when multiple hooks on same event (lower value = earlier)
}
```
Common events are defined by the core and documented so plugins know when to subscribe.

### AI Providers
An AI provider descriptor must implement the following interface:
```ts
interface AIProviderDescriptor {
  name: string;                                  // unique identifier (e.g., "acme-llama")
  factory: () => AIProvider;                     // function returning an instance conforming to the core AIProvider interface
  // The AIProvider interface (defined in @dxgjs/ai) is:
  //   complete(prompt: string, opts?: AIOptions): Promise<string>;
  //   stream(prompt: string, opts?: AIOptions): AsyncIterable<string>;
  //   embed(text: string): Promise<number[]>;
}
```
Once registered, the provider appears in the orchestrator's registry and can be selected by name or set as default provider in the configuration.

### Terminal Extensions
A terminal extension descriptor could resemble:
```ts
interface TerminalExtensionDescriptor {
  name: string;                                  // unique extension name
  component: TerminalComponent;                  // rendering component (depends on @dxgjs/terminal rendering API)
  // TerminalComponent could be a class implementing a `render(buffer: TerminalBuffer) => void` method
  // or an object describing a new rendering element (panel, custom table, etc.)
  placement?: 'sidebar' | 'modal' | 'inline';    // where the extension should appear by default
  activation?: { event: string; condition?: (context: PluginContext) => boolean }; // when the extension should be activated
}
```
The core terminal system must provide an extension point where plugins can insert their components (e.g., a sidebar panel registry displayed when the terminal is in "split" mode).

## Lifecycle Management
When the CLI starts:
1. It discovers candidate plugins.
2. For each plugin, it creates a sandbox.
3. It executes the plugin's entry point (named export `manifest` or initialization function) which calls the registration functions above.
4. It collects all registered extensions and integrates them into the appropriate systems (command, generator, hook, AI, terminal).
5. In case of error during loading (syntactically invalid, prohibited API call, timeout), the plugin is marked as failed, a message is logged, but the CLI continues to function without this plugin.

The CLI also provides a `dxg plugin list` command to display loaded plugins with their status, and `dxg plugin reload <name>` to reload a particular plugin (useful during development).

## Version Compatibility
Plugins declare peer dependencies toward the DXG packages they use (e.g., `"peerDependencies": { "@dxgjs/templates": "^1.0.0", "@dxgjs/prompts": "^1.0.0" }`). The plugin system checks at load time that the versions satisfy the peer constraints (using the same logic as the package manager). If a required version is missing or incompatible, the plugin will not be loaded and a warning will be displayed.

This approach allows plugins to evolve independently of the core as long as they respect the exposed interfaces. When a backward-compatible change is made in a DXG package (e.g., adding an optional parameter to a function), existing plugins continue to function. Breaking changes will trigger a major version bump of the DXG package, obliging plugins to update their peerDependencies.

## Plugin Configuration
A plugin can expose optional configuration via a `dxgPluginConfig` field in the consumer project's `package.json` or via a dedicated configuration file (`dxg-plugin.<name>.json`). The DXG core provides a function `getPluginConfig(name: string) => Promise<any>` that the plugin can call (via core services) to retrieve its specific configuration.

This configuration allows adjusting the plugin's behavior without requiring a new version (e.g., changing colors of a theme provided by the plugin, enabling/disabling a feature, specifying an API key for an external AI provider).

## Security and Best Practices
- **Principle of least privilege**: the sandbox provides only the strictly necessary APIs. No direct access to `process.env`, `require`, or the file system outside the working directory is offered.
- **Input validation**: all registration functions perform validation (e.g., non-empty command names, functional handlers, correct prompt schemas) before registering the extension.
- **Error isolation**: if a plugin's handler throws an exception, it is caught and logged without crashing the main CLI (errors are reported to the caller as a gentle promise rejection).
- **Dependency auditing**: plugins are encouraged to audit their own dependencies to avoid introducing vulnerabilities transmitted via DXG.
- **Reporting**: plugins must avoid using `console.log` directly; they should instead use the logger service provided via `getCoreServices().logger` so their messages are uniformly formatted and respect the global verbosity level.

## Example Plugin Structure
```text
my-dxg-plugin/
├── package.json          // contains "name": "@acme/dxg-plugin-foo", "dxg-plugin": true, "peerDependencies": {...}
├── src/
│   └── index.ts          // entry point that registers extensions
├── templates/            // template files used by the plugin's generators
│   └── component.hbs
└── README.md
```

`src/index.ts` could contain:
```ts
import { registerCommand, registerGenerator } from '@dxgjs/plugins/api'; // provided via the sandbox

registerCommand({
  name: 'add-foo',
  description: 'Adds a foo feature to the project',
  handler: async (args, ctx) => {
    // use core services
    const fs = ctx.getCoreServices().fs;
    const logger = ctx.getCoreServices().logger;
    await fs.writeFile('foo.txt', 'Hello from plugin');
    logger.info('Plugin foo installed successfully');
  }
});

registerGenerator({
  name: 'foo-component',
  description: 'Generates a React foo component',
  template: await ctx.getCoreServices().fs.readFile('./templates/component.hbs', 'utf-8'),
  prompts: [
    { type: 'input', name: 'name', message: 'Component name' },
    { type: 'confirm', name: 'withHooks', message: 'Include hooks?', default: false }
  ],
  outputPathResolver: (answers) => `src/components/${answers.name}.jsx`,
  postProcess: async (files, answers) => {
    // optionally call @dxgjs/ai to improve generated code
  }
});
```

Once installed in a DXG project (`npm i -D @acme/dxg-plugin-foo`), this plugin will be discovered at the next CLI startup and can be invoked via:
- `dxg add-foo`
- `dxg generate foo-component`

## Summary of Decisions Made
- **Discovery based on naming convention + `dxg-plugin:true` field**.
- **Mandatory sandboxing** to guarantee security.
- **Clearly separated registration APIs** (commands, generators, hooks, AI providers, terminal extensions).
- **Lifecycle management** (discovery, loading, registration, integration, reloading).
- **Version compatibility via peerDependencies** and verification at load time.
- **External configuration** via project's `package.json` or dedicated files.
- **Security best practices** (least privilege, validation, error isolation).

These choices ensure an extensible, safe, and pleasant plugin system for both plugin developers and DXG consumers.

---

---