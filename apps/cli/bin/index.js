#!/usr/bin/env node

// Entry point for the DXG CLI binary
// This file is intentionally kept as plain JS to avoid
// any compilation step before Node can execute it.
// eslint-env node
/* global console, process */

// A spawned bin is always a real execution, never a unit-test import:
// strip the Vitest marker a parent process (vitest workers, test tooling)
// may have leaked into this child's environment, so dist's !VITEST guard —
// meant for direct module imports in unit tests — never swallows the run.
delete process.env.VITEST;

import("../dist/index.js").catch((err) => {
  console.error("Failed to start DXG CLI:", err.message);
  process.exit(1);
});
