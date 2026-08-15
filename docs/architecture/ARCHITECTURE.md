# DXG Architecture

## Vision
DXG is a complete ecosystem of developer tools, designed to be modular, extensible, and adapted to the needs of modern teams. It draws inspiration from projects such as Angular CLI, Nx, Turborepo, Biome, Bun, Tailwind CSS, Prisma, Vite, and Expo, offering a consistent experience from project initialization to deployment, including code generation, configuration management, AI integration, and much more.

## Architectural Principles
1. **Single Responsibility**: Each package has only one reason to exist.
2. **No "God Packages"**: Avoid monolithic packages that become difficult to maintain.
3. **Clear Boundaries**: Dependencies follow a hierarchical direction (high-level to low-level) without cycles.
4. **Extensibility via Plugins**: A plugin system allows adding functionality without touching the core.
5. **AI Orchestration**: Artificial intelligence is treated as an orchestration layer supporting multiple providers.
6. **Premium Terminal**: Terminal rendering is separated from business logic to provide a rich, testable experience.
7. **Independent Versioning**: Each package is versioned separately according to SemVer.
8. **Open‑source Friendly**: Designed to easily accept external contributions.

## System Limits
- **DXG Ecosystem**: The entirety consisting of all packages, the CLI, tools, documentation, and examples.
- **DXG CLI**: A specific application within the ecosystem, providing the main command-line interface.
The boundaries are defined such that the CLI depends on the ecosystem packages, but the reverse is not true.

## Main Layers
1. **Orchestration Layer**: CLI, generators, artificial intelligence.
2. **Infrastructure Layer**: File system, repository work (git), package manager management, environment variables, configuration.
3. **Processing Layer**: Validation, logging, types.
4. **Presentation Layer**: Terminal, interactive prompts.
5. **Extension Layer**: Plugin system, template registry.

## Package Philosophy
Each package solves a well-defined problem. For example:
- `@dxgjs/terminal` only handles terminal rendering and interface management.
- `@dxgjs/logger` only handles structured logging.
- `@dxgjs/core` provides only a dependency injection container and a minimal event bus.
This approach avoids creating multi-responsibility packages and facilitates replacement or updating of individual components.

## Dependencies Philosophy
- Dependencies flow from specific to generic (e.g., CLI → workspace → fs).
- No low-level package depends on a high-level package (e.g., fs does not depend on CLI).
- The core package remains minimal: it depends only on the logger (for its own traces) and on validation (for validating injection options).
- Cycles are forbidden and will be detected during continuous integration.

## Extensibility Strategy
Extensibility is primarily achieved through the plugin system. Plugins can register:
- New CLI commands
- New generators
- Template models
- Lifecycle hooks
- AI providers
- Terminal extensions (panels, components)
Plugins are loaded in a sandboxed environment to ensure security.

## Long‑Term Evolution
The ecosystem is designed to accommodate new feature categories (e.g., cloud services, integrated testing tools, CI/CD pipelines) without altering the foundations. Each new domain can be introduced as one or more packages, possibly accompanied by an example plugin. Independent versioning allows fixing bugs or adding features in a package without forcing an update of the entire ecosystem.