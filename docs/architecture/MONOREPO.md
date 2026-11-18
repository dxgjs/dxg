# DXG Monorepo Structure

## Layout

```
dxg/
├── .changeset/              # Changesets configuration and pending release notes
├── .github/workflows/       # CI (ci.yml)
├── apps/
│   └── cli/                 # @dxgjs/cli: the `dxg` command
├── docs/                    # Project state, architecture, vision
├── packages/
│   ├── ast/                 # @dxgjs/ast
│   ├── database-meta/       # @dxgjs/database-meta
│   ├── doctor/              # @dxgjs/doctor
│   ├── errors/              # @dxgjs/errors
│   ├── fs/                  # @dxgjs/fs
│   ├── generators/          # @dxgjs/generators
│   ├── prompts/             # @dxgjs/prompts
│   ├── templates/           # @dxgjs/templates
│   └── workspace/           # @dxgjs/workspace
├── tooling/
│   ├── eslint-config/       # @dxgjs/eslint-config (private)
│   └── typescript-config/   # @dxgjs/typescript-config (private)
├── LICENSE
├── README.md
├── package.json             # Root scripts
├── pnpm-lock.yaml
├── pnpm-workspace.yaml      # Workspaces: apps/*, packages/*, tooling/*
└── turbo.json               # Turborepo task pipeline
```

## Tooling

| Concern | Tool |
| --- | --- |
| Package management and workspaces | pnpm (version pinned in `packageManager`) |
| Task orchestration and caching | Turborepo |
| Build | tsup (ESM output in `dist/`) |
| Tests | Vitest |
| Lint and types | ESLint with the shared `@dxgjs/eslint-config`, TypeScript with `@dxgjs/typescript-config` |
| Versioning and publishing | Changesets |

## Root scripts

| Script | What it does |
| --- | --- |
| `pnpm build` | Builds every package |
| `pnpm lint`, `pnpm typecheck`, `pnpm test` | Runs one kind of check everywhere |
| `pnpm check` | Lint, typecheck and unit tests for every package |
| `pnpm check:ci` | `build` then `check`, with `CI=true` as on GitHub Actions |
| `pnpm changeset` | Creates a changeset describing a change |

The end-to-end suite is separate: `pnpm --filter @dxgjs/cli test:e2e`.

## Conventions

- Internal dependencies use the `workspace:*` protocol; pnpm replaces it with the real version when publishing.
- Published packages ship only `dist/` (plus `README.md`, `LICENSE` and `package.json`), declare `engines.node >= 22.13` and rebuild with a `prepack` script.
- Each package is versioned independently, and all libraries are published as public packages under the `@dxgjs` scope.
- The two `tooling/*` packages are private and never published.
