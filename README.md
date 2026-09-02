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
dxg               # Initialize a new project in the current directory
dxg add <generator>  # Add a generator to the current project
```

## Available Generators

- `init` – Create a new project with basic structure (package.json, tsconfig, src/index.ts, .gitignore)
- `tailwind` – Add Tailwind CSS v4 configuration
- `database` – Add database setup with Prisma ORM (SQLite, PostgreSQL, MySQL)
- `auth` – Add authentication support (better-auth, auth.js, clerk, lucia)

## Options

Common options (available on `dxg` and `dxg add <generator>`):

- `--non-interactive` – Do not prompt for input; fail if required values are missing
- `--dry-run` – Perform a dry run without making any changes
- `--force` – Force overwrite of conflicting files
- `--verbose` – Enable verbose logging
- `--quiet` – Suppress non-essential output
- `--provider <value>` – Specify provider (for database: sqlite|postgresql|mysql; for auth: better-auth|auth.js|clerk|lucia) — `dxg add` only

## Requirements

- Node.js >= 22.13
- Works with npm, pnpm, or Yarn (detected automatically)

## Documentation

For detailed documentation, see the `docs/` directory.

## License

MIT
