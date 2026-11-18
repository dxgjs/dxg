# Project State

_Last reviewed against the code: 2026-11-18 · Version: 0.1.0 (first npm release pending)_

DXG is a command-line tool (`@dxgjs/cli`) built on nine supporting libraries that live in this monorepo. Today it automates one thing, setting up a database with Prisma ORM in an existing project, and it can diagnose and repair the result.

## Commands

| Command | What it does |
| --- | --- |
| `dxg add db` (alias `dxg add database`) | Sets up Prisma ORM in an existing project |
| `dxg doctor` | Diagnoses a DXG project and, with `--fix`, repairs its configuration |

Global options: `--non-interactive`, `--dry-run`, `--force`. See the [CLI README](../apps/cli/README.md) for the full option list.

### `dxg add db`

- **Providers:** `sqlite`, `postgresql`, `mysql`, `sqlserver`, `cockroachdb`, `planetscale`, `prismapostgres`.
- **Prisma version:** pinned in `@dxgjs/database-meta` (currently 7.10.0).
- **Project awareness:** detects the framework (Next.js app/pages, Vite, Astro, React Router), the language (TypeScript or JavaScript), the package manager and Tailwind (detection only).
- **Dependency installation:** goes through an installer that tells "the install exited 0" apart from "the project is operational", and pre-approves native build scripts (for example `better-sqlite3`) for pnpm, npm and Yarn Berry.
- **Database setup:** for SQLite, `prisma db push` is run for you; for server providers DXG does not touch the database and migrations are left to you.
- **Safe by default:** idempotent (a second run changes nothing), supports `--dry-run`, and refuses to overwrite conflicting files unless `--force` is given.

### `dxg doctor`

Sixteen checks in four categories (select them with `--category`):

| Category | Checks |
| --- | --- |
| `env` | `database-url`, `database-url-format`, `dotenv-exists`, `no-secrets-in-git` |
| `project` | `gitignore`, `package-json` |
| `database` | `connectivity`, `helper-file`, `prisma-client`, `prisma-config`, `prisma-schema`, `provider`, `seed-config`, `sqlite-db-file` |
| `scripts` | `package-json-scripts`, `prisma-scripts` |

Exit codes: `0` ok, `1` issues found, `2` invalid usage.

## Packages

Nine public libraries and one CLI, all under the `@dxgjs` scope: `ast`, `database-meta`, `doctor`, `errors`, `fs`, `generators`, `prompts`, `templates`, `workspace`, plus `@dxgjs/cli`. Two private packages (`tooling/eslint-config`, `tooling/typescript-config`) hold shared configuration. See [`architecture/PACKAGES.md`](architecture/PACKAGES.md).

## Quality gates

- `pnpm check` runs lint, typecheck and unit tests for every package through Turborepo. `pnpm check:ci` does the same with `CI=true`, like GitHub Actions.
- The end-to-end suite (`pnpm --filter @dxgjs/cli test:e2e`) performs real installs with npm, pnpm, Yarn classic, Yarn Berry and Bun. It needs network access and is not part of `pnpm check` or of CI.
- CI (`.github/workflows/ci.yml`) runs `pnpm build` then `pnpm check` on Ubuntu, Windows and macOS with Node 22 and 26.

## Releases

Versions and changelogs are managed with changesets, one version per package (independent versioning). All libraries are published as public packages. The first release (`0.1.0` for every package) has not been published yet.

## Not part of the project

- **Other generators.** `init`, `tailwind` and `auth` were considered earlier but are not part of DXG: the only generator is `database`.
- **A generator registry.** `dxg add` resolves generators from a fixed map in `apps/cli/src/commands/add.ts`.
- **Rollback or transactions.** A failed run is not rolled back. Use `--dry-run` first and rely on idempotence to re-run safely.

## Known environment constraints

- **Yarn Berry on Node 24.15.0.** An upstream Node.js bug ([yarnpkg/berry#7065](https://github.com/yarnpkg/berry/issues/7065)) causes `EBADF` errors. Use Node 22 or 26, as the CI matrix does.
- **TLS certificate mismatches** on `registry.npmjs.org` and `registry.yarnpkg.com` happen on some runners. The CI workflow points npm at `https://registry.npmmirror.com` as a workaround. Make sure `npm config get registry` returns the official registry before publishing.
- **`better-sqlite3` on Windows** needs the Visual Studio C++ build tools when no prebuilt binary matches.
