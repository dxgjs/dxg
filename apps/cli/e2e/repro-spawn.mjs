/* global process, console */
/**
 * One-off E2E debugging experiment — replicates runNode's exact
 * execFile spawn (piped stdio, same env) OUTSIDE vitest, in a fresh
 * bootstrapped temp project, to isolate the E2E harness from the CLI.
 */
import { exec, execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const REPO = "d:/Programmation/NEXT JS 2026/dxg";

const dir = mkdtempSync(path.join(tmpdir(), "dxg-repro-"));
writeFileSync(
  path.join(dir, "package.json"),
  JSON.stringify({ name: "repro", version: "0.0.0", private: true }, null, 2),
  "utf8",
);
console.log("PROJECT:", dir);
const boot = await execAsync("npm install", { cwd: dir, timeout: 300000 });
console.log("BOOTSTRAP_OK", boot.stderr.slice(-200));

const t0 = Date.now();
execFile(
  process.execPath,
  [
    `${REPO}/apps/cli/bin/index.js`,
    "add",
    "database",
    "--provider",
    "postgresql",
    "--non-interactive",
  ],
  {
    cwd: dir,
    timeout: 300000,
    maxBuffer: 40 * 1024 * 1024,
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
  },
  (error, stdout, stderr) => {
    console.log("MS:", Date.now() - t0);
    console.log("ERROR:", error === null ? null : `${error.message} (code=${error.code})`);
    console.log("STDOUT_LEN:", String(stdout).length);
    console.log("STDOUT_TAIL:", JSON.stringify(String(stdout).slice(-1200)));
    console.log("STDERR_TAIL:", JSON.stringify(String(stderr).slice(-1200)));
  },
);
