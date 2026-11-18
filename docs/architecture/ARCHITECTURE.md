# DXG Architecture

DXG is a CLI built from small libraries. The CLI parses commands and wires everything together; features (generators, doctor) sit on top of domain knowledge and low-level foundations. Dependencies only point downwards.

## Layers

| Layer | Packages | Responsibility |
| --- | --- | --- |
| Application | `apps/cli` (`@dxgjs/cli`) | Parses arguments with Commander, builds the generator context, runs commands, prints errors |
| Features | `@dxgjs/generators`, `@dxgjs/doctor` | The database generator and its dependency-installation engine; the diagnostic checks and fixes |
| Domain knowledge | `@dxgjs/database-meta` | Providers, scripts, paths and Prisma version rules shared by the generator and the doctor |
| Foundations | `@dxgjs/fs`, `@dxgjs/workspace`, `@dxgjs/templates`, `@dxgjs/prompts`, `@dxgjs/errors`, `@dxgjs/ast` | Filesystem access, project detection, template rendering, interactive prompts, structured errors, formatting-preserving edits of `package.json`, `.gitignore` and TypeScript/JavaScript config files |

The exact dependency graph is in [`DEPENDENCIES.md`](DEPENDENCIES.md) and the role of each package in [`PACKAGES.md`](PACKAGES.md).

## Principles

1. **Single responsibility.** Each package has one reason to exist.
2. **One-way, acyclic dependencies.** The CLI depends on the libraries, never the reverse, and a package only depends on packages from a lower layer.
3. **Generators say what, the installer decides how.** A generator describes the dependencies it needs; the installation engine handles each package manager's specifics.
4. **Safe by default.** Generators are idempotent, `--dry-run` shows the changes without making them, conflicting files are only overwritten with `--force`, and `--non-interactive` makes runs scriptable.
5. **Structured errors.** Failures are `DXGError`s carrying hints, a documentation URL and a recovery action (`retry`, `reconfigure`, `manual-intervention`, `manual` or `abort`), and can be rendered as text or JSON.
6. **Independent versioning.** Each package is versioned separately with changesets.
7. **English only.** Code, comments, documentation and CLI output are written in English.

## How `dxg add db` runs

1. The CLI locates the project root and detects the project (framework, language, package manager, styling) through `@dxgjs/workspace`.
2. It builds a `GeneratorContext` and runs the generator in the project root.
3. The generator validates the provider before any prompt or side effect, inspects the existing Prisma state read-only, asks the missing questions (unless `--non-interactive`), then installs dependencies, initializes Prisma, reconciles `.env` and `.gitignore`, generates the Prisma Client and wires the `db:*` scripts. For SQLite it also runs `prisma db push`; for server providers, migrations are left to the user.
4. Any `DXGError` is formatted by `@dxgjs/errors` and the CLI exits with an error.

## The generator model

A generator is a plain object:

```ts
interface Generator {
  name: string;
  description: string;
  prompts: GeneratorPrompt[];
  run(answers: Record<string, unknown>, context: GeneratorContext): Promise<void>;
}
```

`GeneratorContext` gives it a filesystem interface (`pathExists`, `readFile`, `writeFile`, `stat`, `mkdir`, `readdir`, `readJson`, `writeJson`), the template renderer, the detected project (`awareness`), the `dryRun`, `force` and `nonInteractive` flags and an optional dependency installer. Generators are registered in a fixed map in the CLI; there is no dynamic registry.

## How `dxg doctor` runs

Checks are registered by category (`env`, `project`, `database`, `scripts`), each with an identifier such as `database:prisma-schema`. The runner executes the selected checks and the report is rendered as text or JSON. With `--fix`, fixable issues are previewed, confirmed (unless `--yes`) and applied. `--check-only` makes any issue produce exit code `1`, which suits CI.

## Extensibility

DXG has no plugin system today. Generators are resolved from a fixed map in `apps/cli/src/commands/add.ts`; doctor checks use a registry in `@dxgjs/doctor`.
