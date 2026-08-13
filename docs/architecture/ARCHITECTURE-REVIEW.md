# Architecture Review – DXG

This document captures the final architectural review after evaluating package boundaries, YAGNI principles, and concrete Phase 1 use cases. It reflects the decisions that will shape the initial DXG release.

---

## 1. Previous Proposal (Summary)

The initial architecture proposal listed 19 candidate public packages under the `@dxgjs` scope:

```
@dxgjs/terminal
@dxgjs/logger
@dxgjs/workspace
@dxgjs/git
@dxgjs/fs
@dxgjs/config
@dxgjs/validation
@dxgjs/package-manager
@dxgjs/node
@dxgjs/json
@dxgjs/env
@dxgjs/core
@dxgjs/ai
@dxgjs/templates
@dxgjs/generators
@dxgjs/updater
@dxgjs/plugins
@dxgjs/prompts
@dxgjs/telemetry
```

---

## 2. Second‑Pass / YAGNI Analysis

A deeper review considered whether each package was truly required for a usable Phase 1 DXG CLI, whether its responsibilities justified an independent public package, and whether alternatives (internal modules, existing libraries, deferral) were preferable. The analysis concluded that many packages could be deferred, merged, or kept internal, retaining only those with concrete Phase 1 consumers.

---

## 3. Final Phase 1 Decision

### �� 📦 PUBLIC PACKAGES (to be published under `@dxgjs`)

| Package | Reason for Inclusion (Phase 1) |
|---------|--------------------------------|
| **@dxgjs/terminal** | Required for any CLI to render output, progress, prompts, errors. Provides premium rendering (layouts, themes, spinners, tables, trees,modal, tooltip, input). |
| **@dxgjs/logger** | Cross‑cutting concern used by all packages; structured, configurable, transport‑agnostic logging is essential from day one. |
| **@dxgjs/workspace** | Needed for workspace‑aware commands (e.g., `dxg generate`, `dxg update` across a monorepo). Detects pnpm, Turborepo, Nx, Lerna, simple repo. |
| **@dxgjs/fs** | Fundamental filesystem abstraction (read/write, copy, glob, watch, tempdir) used by config, templates, generators, updater, etc. |
| **@dxgjs/config** | Minimal configuration loader: loads JSON files, merges with CLI args and environment variables, applies simple defaults. No YAML/TOML, watch mode, or `$ref` resolution unless a concrete Phase 1 need emerges. |
| **@dxgjs/templates** | Template engine (Handlebars/EJS‑like) used by the generator system to turn data into files. Provides helpers, partials, caching, and automatic escaping. Remains a thin abstraction over a proven engine (e.g., handlebars) rather than a proprietary engine. |
| **@dxgjs/generators** | Core scaffotting feature: orchestrates prompts, template rendering, and file writing. Commands like `dxg generate component` rely on this package. |
| **@dxgjs/prompts** | Interactive prompt library (input, confirm, select, autocomplete, password) used by generators to collect user data. Provides DXG‑specific theming, validation hooks, and masking; not just a thin wrapper over existing libraries. |

### �� 📦 INTERNAL MODULES (NOT published as npm packages)

| Module | Reason |
|--------|--------|
| **validation** | Schema validation can be delegated to an existing battle‑tested library (e.g., Zod, Yup) consumed directly where needed (config, prompts, AI). No separate `@dxgjs/validation` package. |
| **json** | JSON deep‑merge, patch, traversal utilities are small; can be implemented as a few helper functions or pulled from a lightweight utility (e.g., lodash/fp) when required. |
| **env** | Loading `.env` files with masking is handled directly within `@dxgjs/config` (as one configuration source) or via a direct dotenv call; no separate package needed. |
| **core** | For Phase 1 a DI container or event bus is not required. Packages collaborate via explicit function arguments or direct imports (e.g., `import { logger } from '@dxgjs/logger'`). Core will be introduced only if a concrete decoupling or plugin‑service need arises. |

### �� 📦 FUTURE PACKAGES (valid boundaries, deferred to later phases)

| Package | Deferral Reason |
|---------|-----------------|
| **@dxgjs/git** | Git operations (clone, pull, push, commit) are not needed for the minimal usable DXG (init, generate, basic config). |
| **@dxgjs/package-manager** | Unified interface over npm/Yarn/pnpm/Bun useful for install/update commands, which appear later. |
| **@dxgjs/node** | Node‑specific helpers (.nvmrc resolution, engine checks, runtime detection) only needed if multi‑runtime support or engine constraints are required. |
| **@dxgjs/ai** | AI orchestration (provider abstraction, prompt registry, context builder, cache, rate‑limiting, fallback, specialized agents) is deferred per instruction; not part of Phase 1 roadmap. |
| **@dxgjs/updater** | Update checking (querying registries, semver comparison, binary download) is a polish feature for later when DXG is distributed as a binary. |
| **@dxgjs/plugins** | Plugin system (discovery, registration, sandboxing) is valuable for extensibility but can be added once a stable set of built‑in commands/generators exists and community contributions are anticipated. |
| **@dxgjs/telemetry** | Optional, anonymised telemetry for product improvement is nice‑to‑have but not required for a functional CLI. |

---

## 4. TYPES

- **No global `@dxgjs/types` package.** Domain‑local types live inside their owning packages.
- **Shared, stable contracts** (e.g., plugin manifest, core event map, workspace result) are kept as internal TypeScript definitions in `tooling/types/` or a private `@dxgjs/_contracts` package (not published).
- **`tooling/typescript-config/`** contains only TS configuration for the monorepo; it is **not** a generic shared type package.

---

## 5. IMPORTANT ARCHITECTURAL DECISIONS (reflecting final review)

- **No public `@dxgjs/core` in Phase 1**; DI container and typed event bus are omitted unless a concrete requirement emerges later.
- **No public validation package.** Use an established validation library (e.g., Zod) directly where needed.
- **No separate public `json` package.** Treat JSON utilities as internal helpers.
- **No separate public `env` package.** Environment loading belongs to configuration loading concern; no need for an independent package.
- **AI is completely deferred from Phase 1.** All AI‑related work (providers, prompt registry, context, cache, agents) belongs to a future phase.
- **Plugins are completely deferred from Phase 1.** No public plugin API, discovery, or sandboxing in the initial release.
- **Git, package‑manager, node, updater, and telemetry** are future scope; they will not be bootstrapped during Phase 1.
- **Avoid YAGNI and premature abstraction.** Each retained package has a demonstrated Phase 1 consumer (see table above).
- **Phase 1 focuses on the core DXG CLI foundation:** terminal, logger, workspace, fs, config, templates, generators, prompts.

---

## 6. OPEN QUESTIONS (still unresolved, but do not affect Phase 1 package set)

- Exact version bump automation tool (`changesets` vs `standard-version`).
- Default AI provider list ordering (Claude, GPT, Gemini, Fable) – relevant only when AI phase begins.
- Specific theme syntax for terminal (JSON schema for themes) – to be defined when theming is expanded.
- Precise set of built‑in prompts for AI orchestrator – deferred.
- Level of detail for plugin manifest validation (use AJV vs custom simple checks) – deferred.
- Need for `@dxgjs/node` package – deferred.
- Whether to keep `@dxgjs/telemetry` as public or move it internal – deferred.
- Plugin sandboxing strategy (ESM dynamic vs VM2) – deferred.
- AI specialized agents (generator, reviewer, refactorer, auditor, planner) – deferred.
- Plugin AI provider and terminal extensions – deferred.
- Plugin reload command and version‑compatibility peer checks – deferred.

These questions will be addressed in later phases when the respective features are proposed.

---

## 7. FINAL PHASE 1 PACKAGE SET

```
@dxgjs/terminal
@dxgjs/logger
@dxgjs/workspace
@dxgjs/fs
@dxgjs/config
@dxgjs/templates
@dxgjs/generators
@dxgjs/prompts
```

All eight packages are **public** under the `@dxgjs` scope and will be published to npm.

---

## 8. FINAL HUMAN DECISIONS

**None** – the package‑boundary decisions for Phase 1 have been resolved through the reviews above. No further approval is required before proceeding to bootstrap the monorepo (implementationphase).

---  
*End of review.*  
*(Communication in French, logique de code en anglais – aucune ligne de code n’a été écrite.)*  