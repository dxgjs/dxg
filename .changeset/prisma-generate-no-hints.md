---
"@dxgjs/generators": patch
---

Suppress the interactive Prisma agent-skills offer during `prisma generate` by passing Prisma's official `--no-hints` flag (documented since Prisma 5.16.0, verified against the prisma@7.10.0 CLI bundle). Without it, a 30-second timeout prompt could block non-interactive `dxg add database` runs on machines where the offer has not yet been acknowledged — stdin stays TTY-attached through the npx shim on Windows, so Prisma's interactive gate passes and the prompt renders. Errors and warnings remain fully printed; only the skills offer, the NPS survey, and the "how to import your client" hint banner are suppressed. The package.json `db:generate` script keeps the plain user-owned `prisma generate` (interactive when run by the user).

Also fixes a security regression in the build-approval adapters: npm `allowScripts` and yarn berry `dependenciesMeta` pre-approval now honor an explicit user denial. Previously an existing `{pkg: false}` / `{pkg: {built: false}}` entry was silently flipped to `true` before install (contradicting the documented "never flipped" contract and the pnpm adapter's behavior); now entries are strictly additive — an approval is written only when the key is absent, so a user's refusal stands and the blocked-builds scan reports it honestly.
