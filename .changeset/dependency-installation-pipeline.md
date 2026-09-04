---
"@dxgjs/generators": minor
"@dxgjs/cli": minor
---

Add a robust dependency-installation pipeline to the generators, handling package-manager build-script policies (pnpm 11 allowBuilds, npm 12 allowScripts, yarn berry dependenciesMeta), native addons, and post-install verification. `dxg add database` now declares a data-driven `DependencyPlan` (what to install, what needs a build approval, what is approval-only) and hands it to a new `DependencyInstaller` bound to the detected agent, so the generator never branches on the package manager.

The installer pre-writes the plan's build approvals BEFORE the first install command (pnpm 11 fails with a hard exit otherwise), resolves every command through @antfu/ni with `programmatic: true` (no hidden prompts), captures output to classify failures (build-script-blocked / 404 / native-build-failed) with per-remedy suggestions, and scans even successful installs for silently-blocked build scripts (npm 12 and bun exit 0 with a warning). bun and yarn classic write nothing: writing bun's `trustedDependencies` would REPLACE its default-trusted list.

After install, the database generator verifies the artifacts that make the project operational, not the exit code: the better-sqlite3 native binding (with per-manager approve/rebuild suggestions when missing) and the generated Prisma client. `@prisma/engines` is pre-approved but never installed by name (it arrives transitively via prisma). A mis-resolution guard rewrites `prisma generate` to a literal `npx prisma@7 generate` when the resolver returns an install-shaped command.

New test suites cover the full subprocess-faked chain: failure classification against the real signatures of all four managers, idempotent YAML/JSON approval writers, installer batching/pre-approval/failure normalization, and real @antfu/ni resolution (no mocks) pinning the observed command shapes for npm, pnpm, yarn v1, yarn berry and bun.
