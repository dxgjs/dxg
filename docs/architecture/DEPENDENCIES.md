# DXG Dependency Graph

## Overview
The DXG monorepo dependency graph is designed to be **acyclic** and **layered**: dependencies flow from high-level packages (which orchestrate or present) to low-level packages (which provide low-coupling primitives). No low-level package depends on a high-level package, thus avoiding circular dependencies and unwanted coupling.

## Layers (from bottom to top)

### Layer 1 – Fundamentals (no internal dependency or only towards logging/validation for their own operations)
- `@dxgjs/fs` – Portable file system
- `@dxgjs/json` – Advanced JSON manipulation
- `@dxgjs/env` – Loading environment variables
- `@dxgjs/validation` – Validation schemas
- `@dxgjs/logger` – Structured logging (may depend on `@dxgjs/validation` to validate its options, but generally no internal dependency)
> Note: these packages are fundamentally independent; they may depend on each other if the need is justified (e.g., `@dxgjs/env` uses `@dxgjs/fs` to read `.env` files), but no dependency creates a cycle.

### Layer 2 – Infrastructures (relies on Layer 1)
- `@dxgjs/package-manager` – Unified npm/Yarn/pnpm/Bun interface → depends on `@dxgjs/fs`, `@dxgjs/env`, `@dxgjs/validation`, `@dxgjs/logger`
- `@dxgjs/node` – Node/Bun/Deno utilities → depends on `@dxgjs/fs`, `@dxgjs/env`, `@dxgjs/validation`, `@dxgjs/logger`
- `@dxgjs/git` – Git abstraction → depends on `@dxgjs/fs`, `@dxgjs/validation`, `@dxgjs/logger`
- `@dxgjs/workspace` – Workspace detection → depends on `@dxgjs/fs`, `@dxgjs/json`, `@dxgjs/validation`, `@dxgjs/logger`

### Layer 3 – Core and shared services
- `@dxgjs/core` – DI container + event bus → depends on `@dxgjs/logger` (for its own traces) and `@dxgjs/validation` (to validate DI registrations and event schemas)
> The core does **not** depend on infrastructure or high-level packages; it remains a neutral foundation.

### Layer 4 – Presentation and interaction
- `@dxgjs/terminal` – Premium terminal rendering → depends on `@dxgjs/logger` (to log rendering events) and `@dxgjs/core` (optional, to access services via DI if needed)
- `@dxgjs/prompts` – Interactive prompts → depends on `@dxgjs/terminal` (for display and input capture), `@dxgjs/validation` (to validate responses if a schema is provided), `@dxgjs/logger` (optional)
> Note: `@dxgjs/prompts` depends on `@dxgjs/terminal` but **not** the reverse – the terminal does not know about prompts, preserving separation of concerns.

### Layer 5 – Orchestration and generation
- `@dxgjs/templates` – Template engine → depends on `@dxgjs/fs` (loading template files), `@dxgjs/validation` (data validation if schema), `@dxgjs/logger` (optional)
- `@dxgjs/generators` – Guided scaffolding → depends on `@dxgjs/prompts` (collecting responses), `@dxgjs/templates` (rendering), `@dxgjs/fs` (writing files), `@dxgjs/logger`, `@dxgjs/validation`, **optionally** `@dxgjs/ai` (for AI-assisted generation or revision)
- `@dxgjs/ai` – AI orchestration → depends on `@dxgjs/core` (DI/event bus), `@dxgjs/validation` (prompt/variable schemas), `@dxgjs/logger`, `@dxgjs/fs` (reading context), `@dxgjs/json` (JSON manipulation of context)
- `@dxgjs/updater` – Update checking → depends on `@dxgjs/fs`, `@dxgjs/logger`, `@dxgjs/validation`, `@dxgjs/json`

### Layer 6 – Extensibility
- `@dxgjs/plugins` – Plugin system → depends on `@dxgjs/core` (DI/event bus to provide services to plugins), `@dxgjs/logger`, `@dxgjs/validation` (manifest validation), `@dxgjs/fs` (loading plugin package from disk if necessary)
> Plugins themselves may declare dependencies towards any DXG package (e.g., a plugin adding a generator depends on `@dxgjs/generators`), but this remains in their own `package.json` and does not affect the base monorepo dependency graph.

### Layer 7 – Final applications
- `apps/cli` – Main command-line interface → depends on practically all the packages above according to the implemented commands (e.g., `dxg generate` depends on `@dxgjs/generators`, `dxg ai` depends on `@dxgjs/ai`, `dxg update` depends on `@dxgjs/updater`, etc.)
- `apps/studio` and `apps/playground` (future) – similar, depend on the packages necessary for their functionality.

## Principle Verification

1. **No circular dependencies**: By following the stratification above, no dependency points to an equal or lower layer (in terms of abstraction); all go from high to low or stay within the same layer when dealing with utility dependencies.

2. **Low-level packages never depend on the CLI**: The CLI does not appear anywhere in the dependencies of packages (neither in `packages/` nor in `tooling/`), only in `apps/cli`. Thus, `@dxgjs/fs`, `@dxgjs/logger`, `@dxgjs/core`, etc. remain independent of the CLI.

3. **The terminal does not depend on CLI business logic**: `@dxgjs/terminal` depends only on `@dxgjs/logger` and possibly `@dxgjs/core`. It has no dependency towards `@dxgjs/generators`, `@dxgjs/ai`, `@dxgjs/workspace`, etc. – the logic of what to display remains in the caller (CLI, plugin, etc.).

4. **The logger does not depend on terminal rendering**: `@dxgjs/logger` depends at most on `@dxgjs/validation` (to validate its options) and possibly `@dxgjs/fs` (if a file transport is used). It does not know `@dxgjs/terminal`.

5. **The core remains minimal**: As mentioned, `@dxgjs/core` depends only on `@dxgjs/logger` (for its own traces) and `@dxgjs/validation` (to validate DI registrations and event schemas). It imports no high-level package.

6. **High-level packages may depend on low-level packages, but not the reverse**: Verified in the stratification – e.g., `@dxgjs/generators` (high) depends on `@dxgjs/fs` (low); the reverse does not exist.

## Simplified Representation (dependency arrows)

```
[Layer 7 – Apps]
      ↑
[Layer 6 – Plugins]
      ↑
[Layer 5 – Orchestration]
      ↑
[Layer 4 – Presentation]
      ↑
[Layer 3 – Core]
      ↑
[Layer 2 – Infra]
      ↑
[Layer 1 – Fundamentals]
```

Each "depends on" arrow points to a lower or equal layer (in the case of dependencies within the same layer).

## Development Implications
- Any new dependency introduction must respect this stratification; otherwise, CI should detect a cycle via `madge` or `depcruft` and block the merge.
- Low-level packages are widely reusable and can be published independently with a minimal surface.
- High-level packages (like `@dxgjs/ai` or `@dxgjs/generators`) are more specific and can evolve rapidly without impacting the foundations.

## Rejected / Alternatives Considered
- **A single utilities package** grouping `fs`, `json`, `env`, `validation` would have created an unnecessary "god package" and would have tied together otherwise independent concerns.
- **Making the core depend on all infrastructures** would have made the core heavy and introduced cycle risks (e.g., core → fs → logger → core if logger depended on core for some reason).
- **Allowing lateral dependencies within the same layer** only when clearly justified and acyclic.