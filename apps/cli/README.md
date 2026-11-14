# DXG CLI

DXG is a command-line interface for generating project scaffolding.

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
```

## Available Generators

- `db` – Add database setup with Prisma ORM (SQLite, PostgreSQL, MySQL, SQL Server, CockroachDB, PlanetScale, Prisma Postgres)
- `database` – Alias for `db`

## Options

### `dxg add db` (also works with `dxg add database`)

- `--provider <value>` – Specify database provider (sqlite|postgresql|mysql|sqlserver|cockroachdb|planetscale|prisma-postgres)
- `--non-interactive` – Do not prompt for input; fail if required values are missing
- `--dry-run` – Perform a dry run without making any changes
- `--force` – Force overwrite of conflicting files

### Global Options (available on `dxg` and `dxg add db`)

- `--non-interactive` – Do not prompt for input; fail if required values are missing
- `--dry-run` – Perform a dry run without making any changes
- `--force` – Force overwrite of conflicting files

## Requirements

- Node.js >= 22.13
- Works with npm, pnpm, or Yarn (detected automatically)

## Documentation

For detailed documentation, see the `docs/` directory.

## License

MIT