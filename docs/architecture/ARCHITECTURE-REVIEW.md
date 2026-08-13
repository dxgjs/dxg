# Architecture Review – DXG

This document captures a second‑pass evaluation of the initial architecture proposal, focusing on **YAGNI**, **over‑engineering risks**, and the **necessity** of each proposed building block. The goal is to decide what to **KEEP NOW**, what to **DEFER**, what to **REMOVE/MERGE**, what belongs to **FUTURE**, and what **REQUIRES HUMAN DECISION** before proceeding.

---

## 1. Package Count

The original proposal listed **19 public packages** under the `@dxgjs` scope:

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

## 2. Public vs Internal Packages

All packages above are currently marked **public** (published to npm).  
We examined whether any should be **internal** (only usable within the monorepo) or whether any genuinely distinct concerns justify a public package.

| Package | Public? | Rationale for Public | Consideration for Internal |
|---------|---------|----------------------|----------------------------|
| terminal | Yes | Provides a premium rendering layer that consumers (CLI, plugins) will import directly. | – |
| logger   | Yes | Structured logging is a cross‑cutting concern; many applications consume it. | – |
| workspace| Yes | Workspace detection is useful for tooling and generators; external tools may want to reuse it. | – |
| git      | Yes | Portable Git abstraction is a common utility; other JS tools could benefit. | – |
| fs       | Yes | Filesystem abstraction is a fundamental utility; many packages need it. | – |
| config   | Yes | Configuration loading/merge/validation is a generic need. | – |
| validation| Yes | Schema validation (Zod‑like) is widely useful; exposing it encourages reuse. | – |
| package-manager| Yes | Unified interface over npm/yarn/pnpm/bun is a helpful utility for scripts and plugins. | – |
| node     | Yes | Node‑runtime helpers (`.nvmrc`, engines, binary resolution) are useful beyond DXG. | – |
| json     | Yes | Deep‑merge, patch, traversal utilities are generic; many projects need them. | – |
| env      | Yes | Dotenv loading with masking is a common need; separating from config avoids coupling. | – |
| core     | Yes | DI container and typed event bus are low‑level primitives that many packages consume. | – |
| ai       | Yes | Orchestration layer is a higher‑level feature, but exposing it lets plugins and generators leverage AI easily. | Could be internal if we defer advanced agents (see §4). |
| templates| Yes | Template engine (Handlebars‑like) is a generic utility; many scaffolding tools need it. | – |
| generators| Yes | Scaffolding guided by prompts is a core DXG feature; consumers will call `dxg generate`. | – |
| updater  | Yes | Update checking is a typical CLI concern; exposing it lets alternative CLIs reuse it. | – |
| plugins  | Yes | Plugin system is the main extension mechanism; must be public for third‑party plugins. | – |
| prompts  | Yes | Interactive prompts are a generic utility; many CLIs need them. | – |
| telemetry| Yes | Optional telemetry is a feature that products often expose as a package (opt‑in). | Could be internal if we decide telemetry belongs only to the CLI binary. |

**Conclusion**: All packages have a plausible public consumer base. None are obviously internal‑only, but we may **defer** publishing some low‑utility packages (json, env, node) until there is a demonstrated external demand (see §5).

---

## 3. @dxgjs/core – DI Container & Event Bus: Justified?

### Arguments **for**
- **Decoupling**: Allows high‑level packages (CLI, generators, AI) to depend on abstractions rather than concrete implementations (e.g., they can depend on a `Logger` token rather than `@dxgjs/logger` directly).
- **Testability**: Mocks or fakes can be injected easily in unit tests.
- **Lifecycle Management**: Provides a central place for `onInit`/`onShutdown` hooks, useful for gracefully starting/stopping background services (e.g., file watchers, telemetry).
- **Extensibility**: Plugins can register their own services (e.g., a custom logger or config provider) without needing to patch the core.

### Arguments **against** (over‑engineering)
- For a CLI‑first project, direct imports (`import { logger } from '@dxgjs/logger'`) are simple and sufficient for many packages.
- The added indirection may increase bundle size and cognitive overhead for newcomers.
- A basic service locator or reliance on ES module singletons could achieve similar decoupling with less boilerplate.

### Verdict
**KEEP NOW**, but with a **minimalist implementation**:
- Provide a very simple `Container` with `register(token, factory)` and `resolve(token)`.
- Provide a typed `EventBus` with `on(event, handler)` and `emit(event, data)`.
- Avoid advanced features like scopes, async factories, or middleware unless a concrete need arises.

If after initial usage we find the DI container adds little value, we can **re‑evaluate** (see **REQUIRES HUMAN DECISION** below).

---

## 4. Absence of a Global `@dxgjs/types`

We deliberately avoided a global types package to prevent:
- **Implicit coupling**: low‑level packages pulling in high‑level type definitions just to share an interface.
- **Versioning entanglement**: a change in a high‑level type would force a version bump of the global types package, affecting all dependents.

Instead we use:
- **Domain‑local types**: each package defines and exports the types that belong to its responsibility.
- **Internal contracts** (`tooling/types/` or a private `@dxgjs/_contracts` package) for truly cross‑domain, stable interfaces (e.g., plugin manifest, core event map, workspace result).

This approach follows the principle of “dependencies point towards more stable abstractions” and keeps the public npm surface lightweight.

**Verdict**: **KEEP NOW** – no change needed.

---

## 5. AI Architecture – What to Defer?

The original AI design included:
- Provider abstraction (`complete`, `stream`, `embed`)
- Prompt registry with versioning and schema validation
- Context builder (workspace, config, FS, env, terminal)
- Semantic cache with rate‑limiting, retry, fallback
- **Specialized agents**: Generator, Reviewer, Refactorer, Auditor, Planner

### YAGNI Assessment
- **Provider abstraction, prompt registry, context builder, cache, rate‑limiting** are **foundational** for any AI‑enabled CLI and provide immediate value (allowing swapping of models, prompt reuse, and reducing redundant calls). These should be **KEPT NOW**.
- **Specialized agents** (Reviewer, Refactorer, Auditor, Planner) add considerable complexity:
  - Each requires its own set of prompts, post‑processing logic, and potentially integration with linting/formatting tools.
  - Their value is realized only when users start asking DXG to perform code‑quality or security‑analysis tasks.
  - They increase the surface area that must be maintained and secured.

**Recommendation:**
- **KEEP NOW**: Provider abstraction, Prompt Registry, Context Builder, Semantic Cache, Rate‑limiter + retry + fallback, and a simple `execute(taskName, variables)` that renders a prompt and calls a provider.
- **DEFER**: The specialized agent implementations (Generator Agent, Reviewer Agent, Refactorer Agent, Auditor Agent, Planner Agent). These can be built later as separate packages (`@dxgjs/ai-generator`, `@dxgjs/ai-reviewer`, etc.) or as features within `@dxgjs/ai` once we have concrete use‑cases.

---

## 6. Plugin Architecture – What to Defer?

The plugin system described includes:
- Discovery via convention (`dxg-plugin-*`) or `package.json.dxg-plugin:true`
- Sandboxed loading (ESM dynamic with restricted global or VM2)
- Explicit registration API for:
  - Commands
  - Generators
  - Hooks
  - AI providers
  - Terminal extensions
- Manifest validation, lifecycle management, version compatibility via peerDependencies, reload capability.

### YAGNI Assessment
- **Discovery and basic registration (commands, generators, hooks)** are essential for extensibility from day one. A plugin that adds a new command or generator is the most common extension point.
- **Sandboxing** adds security but also complexity. For an early stage, we can assume plugin authors are trusted (or we can rely on npm's integrity guarantees) and defer sandboxing to a later version when we host untrusted plugins (e.g., a public plugin registry).
- **AI provider registration** and **terminal extensions** are advanced extension points that are unlikely to be needed in the first releases.
- **Manifest validation** using a full JSON‑schema engine (AJV) may be overkill; a lightweight custom validation could suffice initially.

**Recommendation:**
- **KEEP NOW**: Discovery, basic registration API for **commands**, **generators**, **hooks**, and a simple manifest loader (with basic required‑field checks). No sandboxing (load plugins as regular ES modules).
- **DEFER**: Sandboxing, AI provider registration, terminal extensions, detailed manifest validation (AJV), plugin reload command, and version‑compatibility peer checks. These can be added in a later iteration when the plugin ecosystem matures.

---

## 7. Low‑Level Packages: `@dxgjs/json`, `@dxgjs/env`, `@dxgjs/node` – Need to Be Independent?

These three packages provide utilities that are fairly generic and could be used by many projects. However, in the initial DXG CLI we may only need them internally.

| Package | Utility | Public Use‑Case | Consideration |
|---------|---------|----------------|---------------|
| json    | Deep‑merge, patch, traversal (jq‑like) | Useful for any tool manipulating JSON (e.g., config tools, generators). | Could be kept public; small and focused. |
| env     | Dotenv loading with masking | Common need for CLIs that read `.env` files. | Could be kept public; low overlap with config. |
| node    | `.nvmrc` resolution, engines check, binary resolution, runtime detection | Useful for tools that need to adapt to Node/Bun/Deno environments. | Could be kept public; but may be YAGNI if early CLI only targets Node. |

Given the principle of avoiding a “god package”, splitting them keeps each responsibility clear. However, we could **defer publishing** `@dxgjs/node` until we actually need to support Bun or Deno, and we could consider merging `@dxgjs/env` into `@dxgjs/config` (since env loading is a configuration source). Yet keeping them separate avoids coupling config loading to dotenv specifics.

**Verdict:**
- **KEEP NOW** `@dxgjs/json` and `@dxgjs/env` (they are small and likely useful).
- **DEFER** `@dxgjs/node` to a later version when we explicitly need multi‑runtime support (or if we detect a need for engines checks).  

If we later find that `json` and `env` are only used internally, we can move them to internal utilities, but for now we keep them public.

---

## 8. Versioning Strategy: Independent vs Coordinated

We proposed **independent SemVer per package** with automation via `changesets`. This allows:
- Precise updates (e.g., fix a bug in `@dxgjs/fs` without bumping `@dxgjs/ai`).
- Clear communication of impact (patch/minor/major).
- Flexibility for plugins that depend on specific ranges.

The downside is increased release overhead and the possibility of version sprawl.

### Alternatives Considered
- **Single coordinated version** for all `@dxgjs*` packages (like Babel or Jest used to do). Simpler releases but forces all packages to move together, even when only one changes.
- **Hybrid**: core packages versioned together, leaf packages independent.

Given our desire for long‑term maintainability and the fact that we expect many packages to evolve at different rates (e.g., `@dxgjs/terminal` may see frequent UI tweaks while `@dxgjs/fs` stays stable), **independent versioning** offers the best trade‑off.

**Verdict**: **KEEP NOW** independent SemVer with `changesets` (or an equivalent tool). We will keep the open question about the exact tool (changesets vs standard-version) as is.

---

## 9. YAGNI & Over‑Engineering Risks – Summary

| Area | Risk | Mitigation |
|------|------|------------|
| **Core DI/Event Bus** | Potential indirection without immediate benefit | Keep implementation minimal; revisit after first real‑world usage. |
| **AI Specialized Agents** | Over‑building for features not yet needed | Defer agents; keep only base orchestration. |
| **Plugin Sandboxing** | Early complexity & performance cost | Defer sandboxing; start with trusted‑plugin model. |
| **Low‑Level Packages (`node`)** | Possible unused package | Defer `@dxgjs/node`; keep `json` and `env`. |
| **Manifest Validation (AJV)** | Heavy dependency for simple checks | Defer full schema validation; use simple required‑field checks initially. |
| **Telemetry as Separate Package** | May be unnecessary if telemetry stays CLI‑only | Keep as public for now; can be internalized later if proven unused externally. |
| **Versioning Overhead** | More release automation needed | Accept overhead for flexibility; monitor and consider consolidating if pain appears. |

Overall, the architecture leans toward **modularity** but we have identified several **deferrables** to avoid over‑engineering the initial release.

---

## 10. Classification Table

| Item | Decision | Reasoning |
|------|----------|-----------|
| `@dxgjs/terminal` | KEEP NOW | Core to premium CLI experience. |
| `@dxgjs/logger` | KEEP NOW | Essential cross‑cutting concern. |
| `@dxgjs/workspace` | KEEP NOW | Needed for generators and CLI workspace‑aware commands. |
| `@dxgjs/git` | KEEP NOW | Portable Git abstraction is a common utility. |
| `@dxgjs/fs` | KEEP NOW | Fundamental filesystem abstraction. |
| `@dxgjs/config` | KEEP NOW | Generic configuration loading/merge/validation. |
| `@dxgjs/validation` | KEEP NOW | Widely useful schema validation. |
| `@dxgjs/package-manager` | KEEP NOW | Useful utility for scripts and plugins. |
| `@dxgjs/node` | DEFER | Multi‑runtime support not needed initially. |
| `@dxgjs/json` | KEEP NOW | Generic JSON utilities, small and focused. |
| `@dxgjs/env` | KEEP NOW | Dotenv loading with masking, frequent need. |
| `@dxgjs/core` | KEEP NOW (minimal) | DI/Event bus provides decoupling; keep implementation simple. |
| `@dxgjs/ai` (base orchestration) | KEEP NOW | Provider abstraction, prompt registry, context builder, cache, rate‑limiting are foundational. |
| `@dxgjs/ai` (specialized agents) | DEFER | Agents (generator, reviewer, refactorer, auditor, planner) add complexity without immediate need. |
| `@dxgjs/templates` | KEEP NOW | Template engine is a generic utility for scaffolding. |
| `@dxgjs/generators` | KEEP NOW | Core scaffotting feature of DXG. |
| `@dxgjs/updater` | KEEP NOW | Update checking is a standard CLI concern. |
| `@dxgjs/plugins` (basic discovery + command/generator/hook registration) | KEEP NOW | Essential extensibility mechanism. |
| `@dxgjs/plugins` (sandboxing, AI provider registration, terminal extensions, AJV validation, reload) | DEFER | Advanced plugin features can wait for a mature ecosystem. |
| `@dxgjs/prompts` | KEEP NOW | Interactive prompts are a generic CLI utility. |
| `@dxgjs/telemetry` | KEEP NOW | Optional telemetry is a common feature; can be internalized later if proven unused externally. |
| Independent SemVer per package (changesets) | KEEP NOW | Allows precise, flexible versioning. |
| Global `@dxgjs/types` package | REMOVE (already avoided) | Would cause unwanted coupling; domain‑local types preferred. |
| Sandboxed plugin loading | DEFER | Security can be deferred; start with trusted plugins. |
| AI specialized agents | DEFER | See above. |
| Plugin AI provider & terminal extensions | DEFER | See above. |
| Manifest validation with AJV | DEFER | Start with simple required‑field checks. |
| `@dxgjs/node` package | DEFER | See above. |

---

## 11. Open Questions Updated

The review does not resolve all open questions; they remain for future decision:

- Exact version bump automation tool (changesets vs standard-version) – still open.
- Default AI provider list ordering (Claude, GPT, Gemini, Fable) – still open.
- Specific theme syntax for terminal (JSON schema for themes) – still open.
- Precise set of built‑in prompts for AI orchestrator – still open.
- Level of detail for plugin manifest validation (use AJV vs custom) – still open (but we now lean toward custom simple validation for now).
- Need for `@dxgjs/node` – deferred, open for later.
- Whether to keep `@dxgjs/telemetry` as public or move it internal – deferred.

---

## 12. Required Human Decisions

Before proceeding to bootstrap the monorepo, the following items **require explicit approval**:

1. **Core DI/Event Bus** – Approve keeping a minimal DI container and typed event bus, or opt for a simpler service‑locator / direct import approach.
2. **AI Base Orchestration vs Full Agent Suite** – Confirm approval to keep only the base orchestration (provider abstraction, prompt registry, context builder, cache, rate‑limiter) and defer specialized agents.
3. **Plugin System Scope** – Confirm approval to start with basic discovery and registration for commands, generators, and hooks (no sandboxing, no AI/provider/terminal extensions, no AJV validation).
4. **Publication of Low‑Level Packages** – Approve publishing `@dxgjs/json` and `@dxgjs/env` now, and defer `@dxgjs/node`.
5. **Versioning Tool** – While still open, we need to choose either `changesets` or `standard-version` for the first release; a decision is required before setting up CI.

Please indicate your approval or requested changes for each of the five items above. Once approved, we can move to the **Bootstrap monorepo** phase (still no implementation).

---  
*End of review.*  
**Communication in French, logique de code en anglais – aucune ligne de code n’a été écrite.**  