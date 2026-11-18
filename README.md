# DXG

DXG is a command-line interface for generating project scaffolding. This repository is its monorepo.

## Using DXG

You do not need to clone this repository to use DXG:

```bash
npx @dxgjs/cli
# or
pnpm dlx @dxgjs/cli
```

DXG sets up a database with Prisma ORM (`dxg add db`) and diagnoses and repairs the result (`dxg doctor`). Usage and options are documented in the [CLI README](./apps/cli/README.md).

## Repository layout

| Path | Package | Description |
| --- | --- | --- |
| `apps/cli` | `@dxgjs/cli` | The `dxg` command-line interface |
| `packages/ast` | `@dxgjs/ast` | AST manipulation utilities (Magicast) preserving formatting and comments |
| `packages/database-meta` | `@dxgjs/database-meta` | Shared database metadata: providers, recommended scripts, path conventions |
| `packages/doctor` | `@dxgjs/doctor` | Diagnostic and repair tool for DXG projects |
| `packages/errors` | `@dxgjs/errors` | Error hierarchy and formatting utilities |
| `packages/fs` | `@dxgjs/fs` | Filesystem abstraction layer |
| `packages/generators` | `@dxgjs/generators` | Generator system and templates |
| `packages/prompts` | `@dxgjs/prompts` | Interactive prompt system |
| `packages/templates` | `@dxgjs/templates` | Template engine |
| `packages/workspace` | `@dxgjs/workspace` | Workspace detection utilities |
| `tooling/*` | `@dxgjs/eslint-config`, `@dxgjs/typescript-config` | Shared lint and TypeScript configuration |

The packages are built with [tsup](https://tsup.egoist.dev), orchestrated by [Turborepo](https://turborepo.dev) and tested with [Vitest](https://vitest.dev).

## Getting started

Requirements:

- Node.js >= 22.13
- pnpm 11.18.0 (see the `packageManager` field in [`package.json`](./package.json))

```bash
pnpm install
pnpm build
pnpm check
```

`pnpm check` runs lint, typecheck and unit tests for every package.

## Testing

Unit tests are fully offline and run with `pnpm test` (or as part of `pnpm check`).

The end-to-end suite performs real installs with real package managers, so it needs network access and the package managers installed locally. It is deliberately separate and never runs as part of `pnpm test`:

```bash
pnpm --filter @dxgjs/cli test:e2e
```

### Reproducing CI locally

CI runs `pnpm build` then `pnpm check` on Ubuntu, Windows and macOS with Node 22 and 26 (see [`ci.yml`](./.github/workflows/ci.yml)).

GitHub Actions always sets `CI=true`, which changes the behavior of some code paths (for example, the database generator skips interactive prompts). To catch CI-only failures before pushing, run:

```bash
pnpm check:ci
```

## Versioning and releases

Versions and changelogs are managed with [changesets](https://github.com/changesets/changesets). If your change affects a published package, add a changeset:

```bash
pnpm changeset
```

See [`.changeset/README.md`](./.changeset/README.md) for details.

## Documentation

- [`docs/PROJECT-STATE.md`](./docs/PROJECT-STATE.md) – what DXG does today, quality gates and known constraints
- [`docs/architecture/ARCHITECTURE.md`](./docs/architecture/ARCHITECTURE.md) – layers, principles and how commands run
- [`docs/architecture/MONOREPO.md`](./docs/architecture/MONOREPO.md) – repository layout, tooling and scripts
- [`docs/architecture/DEPENDENCIES.md`](./docs/architecture/DEPENDENCIES.md) – the dependency graph
- [`docs/architecture/PACKAGES.md`](./docs/architecture/PACKAGES.md) – what each package is for
- [`docs/architecture/PUBLIC-API.md`](./docs/architecture/PUBLIC-API.md) – the exported API of each library

## License

MIT
