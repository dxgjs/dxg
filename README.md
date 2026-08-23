# DXG CLI

DXG is a command-line interface for generating project scaffolding.

## Installation

You can use DXG directly via npx or pnpm without installing:

```bash
npx @dxgjs/cli init
pnpm dlx @dxgjs/cli init
```

To install globally:

```bash
npm i -g @dxgjs/cli
# or
pnpm add -g @dxgjs/cli
```

## Usage

```bash
dxg init          # Initialize a new project
dxg add <generator> [directory]  # Add a generator to a project
```

## Available Generators

- `init` – Create a new project with basic structure (package.json, tsconfig, src/index.ts, .gitignore)
- `tailwind` – Add Tailwind CSS v4 configuration
- `database` – Add database setup with Prisma ORM (SQLite, PostgreSQL, MySQL)
- `auth` – Add authentication support (better-auth, auth.js, clerk, lucia)

## Options

Common options (available on `dxg add <generator>`):

- `--non-interative` – Do not prompt for input; fail if required values are missing
- `--provider <value>` – Specify provider (for database: sqlite|postgresql|mysql; for auth: better-auth|auth.js|clerk|lucia)
- `--customise` – Customise Tailwind settings (content paths, theme, etc.)
- `--postcss` – Add additional PostCSS plugins (e.g., for minification)
- `--autoprefixer` – Support legacy browsers (IE11, older Android)
- `--install-deps` – Install dependencies after generation
- `--generate-config` – Generate example configuration file

## Requirements

- Node.js >= 22.13
- Works with npm, pnpm, or Yarn (detected automatically)

## Documentation

For detailed documentation, see the `docs/` directory.

## License

MIT
