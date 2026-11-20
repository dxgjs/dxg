# DXG CLI

DXG is a command-line interface for generating project scaffolding. It currently sets up a database with Prisma ORM in an existing project (`dxg add db`) and can diagnose and repair the result (`dxg doctor`).

## Installation

You can use DXG directly via npx or pnpm without installing:

```bash
npx @dxgjs/cli
pnpm dlx @dxgjs/cli
```

To install globally:

```bash
npm i -g @dxgjs/cli
# or
pnpm add -g @dxgjs/cli
```

## Usage

```bash
dxg add db  # Add database setup with Prisma ORM
# or
dxg add database  # Alias, works identically

dxg doctor  # Diagnose your DXG project configuration
dxg doctor --fix  # ...and repair what can be repaired
```

## Available Generators

- `db` – Add database setup with Prisma ORM (SQLite, PostgreSQL, MySQL, SQL Server, CockroachDB, PlanetScale, Prisma Postgres)
- `database` – Alias for `db`

## Options

### `dxg add db` (also works with `dxg add database`)

- `--orm <type>` – ORM to use: `prisma` (default). `drizzle` is not available yet: selecting it exits with an error
- `--provider <value>` – Specify database provider (sqlite|postgresql|mysql|sqlserver|cockroachdb|planetscale|prismapostgres)
- `--non-interactive` – Do not prompt for input; fail if required values are missing
- `--dry-run` – Perform a dry run without making any changes
- `--force` – Force overwrite of conflicting files

### `dxg doctor`

Runs health checks on your project and, with `--fix`, repairs what can be repaired. Checks are grouped in four categories: `env`, `project`, `database` and `scripts`.

- `-c, --category <categories>` – Comma-separated list of categories to check (env, project, database, scripts)
- `--json` – Output results as JSON
- `--fix` – Attempt to automatically fix issues
- `-y, --yes` – Skip confirmation prompts for fixes
- `--dry-run` – Show what would be fixed without applying
- `--check-only` – Exit with code 1 if any issues are found (for CI)

Exit codes: `0` all checks passed (or only informational/warning results), `1` issues found, `2` invalid usage.

```bash
dxg doctor                          # Run all checks
dxg doctor --category env,project   # Run only some categories
dxg doctor --check-only             # CI-friendly: exit 1 on any issue
dxg doctor --json                   # Machine-readable output
```

### Global Options (available on `dxg`, `dxg add` and `dxg doctor`)

- `--non-interactive` – Do not prompt for input; fail if required values are missing
- `--dry-run` – Perform a dry run without making any changes
- `--force` – Force overwrite of conflicting files

## Requirements

- Node.js >= 22.13
- Works with npm, pnpm, Yarn (classic and Berry) or Bun (detected automatically)

## Documentation

For detailed documentation, see the [docs](https://github.com/dxgjs/dxg/tree/main/docs) directory on GitHub.

## License

MIT