---
"@dxgjs/generators": minor
---

Add an interactive database scripts phase to the `database` generator. After the database setup (provider, dependencies, Prisma init), `dxg add database` now asks which `db:*` scripts should land in the project's package.json: Recommended (db:generate, db:push, db:studio), Customize (Clack multiselect over the provider-appropriate catalogue), or Skip. Existing scripts and an existing `prisma.seed` config are never overwritten or duplicated; re-runs are idempotent. PlanetScale never offers `db:migrate` (unsupported on Vitess). Non-interactive, dry-run and CI runs default to the recommended set.

Selecting `db:seed` (customize only) makes seeding work end-to-end immediately: DXG adds the `db:seed` script, generates a `prisma/seed.ts` skeleton importing the shared Prisma Client, adds `tsx` (the seed runner) to devDependencies, and configures `migrations.seed: "tsx prisma/seed.ts"` inside the existing `migrations` block of `prisma7.config.ts` — the only place Prisma 7's `db seed` reads the seed command. The rest of the Prisma-owned config (comments, imports, `process.env["DATABASE_URL"]` datasource) is preserved byte-for-byte; package.json never receives a `prisma.seed` field. An existing user-defined `migrations.seed` is preserved and reported as a conflict unless `--force` is passed.
