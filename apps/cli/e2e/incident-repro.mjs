/* global process, console */
/**
 * Incident repro — runs the CURRENT dist's mergeAllowBuildsBlock against
 * the EXACT committed bytes of my-app's pnpm-workspace.yaml (the state
 * DXG saw before the duplicating write). Byte-exact: git show, no edits.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const gen = await import(
  pathToFileURL(
    "d:/Programmation/NEXT JS 2026/dxg/packages/generators/dist/index.js",
  ).href
);

const committed = execFileSync(
  "git",
  [
    "-C",
    "D:/Programmation/NEXT JS 2026/JUNIOR/my-app",
    "show",
    "83fb361:pnpm-workspace.yaml",
  ],
  { encoding: "utf8", maxBuffer: 1024 * 1024 },
);

console.log("=== COMMITTED BYTES (JSON escaped) ===");
console.log(JSON.stringify(committed));
console.log("=== HEX FIRST 32 BYTES ===");
console.log(Buffer.from(committed, "utf8").subarray(0, 32).toString("hex"));

const merge = gen.mergeAllowBuildsBlock;
if (typeof merge !== "function") {
  console.error("mergeAllowBuildsBlock not exported from dist:", Object.keys(gen).join(", "));
  process.exit(3);
}

const result = merge(committed, ["prisma", "@prisma/engines"]);
console.log("=== RESULT ===");
console.log(JSON.stringify(result));
console.log("=== CHANGED? ===", result !== committed);
if (result !== committed) {
  console.log("=== DIFF (committed -> merged) ===");
  const a = committed.split("\n");
  const b = result.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      console.log(`L${i + 1} committed=${JSON.stringify(a[i])} merged=${JSON.stringify(b[i])}`);
    }
  }
}
