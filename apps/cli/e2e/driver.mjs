#!/usr/bin/env node
/* global process, console */
/**
 * Programmatic E2E driver — runs the REAL database generator (built
 * dist, no mocks) with explicit answers inside a real project directory.
 *
 * Used for scenarios the CLI cannot drive non-interactively: it exposes
 * no --helper-path / --database-scripts flags, and Clack prompts cannot
 * run without a TTY. This is the "équivalent direct" the E2E plan
 * allows (§5.4): it mirrors what apps/cli's prepareContext + add action
 * do, including the Phase 1 package-manager unification.
 *
 * Usage: node driver.mjs <projectDir> <jsonAnswers>
 * Exit codes: 0 success, 1 generator failure, 3 no package manager detected.
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");
const distOf = (name) =>
  pathToFileURL(path.join(repoRoot, "packages", name, "dist", "index.js")).href;

// The BUILT workspace packages, by absolute file URL — the temp project
// has no node_modules for DXG itself; resolution goes through each
// package's own node_modules (pnpm workspace links).
const [workspace, generators, fs, templates, logger] = await Promise.all([
  import(distOf("workspace")),
  import(distOf("generators")),
  import(distOf("fs")),
  import(distOf("templates")),
  import(distOf("logger")),
]);

const projectDir = process.argv[2];
if (!projectDir) {
  console.error("driver: missing <projectDir> argument");
  process.exit(3);
}
const answers = JSON.parse(process.argv[3] ?? "{}");

const agent = await generators.detectPackageManagerAgent(projectDir);
if (!agent) {
  console.error("driver: no package manager agent detected");
  process.exit(3);
}
const awareness = await workspace.detectProjectAwareness(projectDir);

// Mirrors apps/cli prepareContext (Phase 1): ONE agent detection drives
// both the installer and the awareness's coarse display name.
const context = {
  logger: new logger.Logger({ minLevel: "info" }),
  fs,
  templates: { render: templates.render },
  awareness: {
    ...awareness,
    packageManager: agent === "yarn@berry" ? "yarn" : agent,
  },
  installer: generators.createDependencyInstaller({ agent, fs }),
  dryRun: false,
  force: answers.force === true,
  nonInteractive: true,
};

process.chdir(projectDir);
try {
  await generators.databaseGenerator.run(answers, context);
  process.exit(0);
} catch (error) {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  process.exit(1);
}
