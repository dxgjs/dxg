#!/usr/bin/env node

// Entry point for the DXG CLI binary
// This file is intentionally kept as plain JS to avoid
// any compilation step before Node can execute it.
// eslint-env node
/* global console, process */

import("../dist/index.js").catch((err) => {
  console.error("Failed to start DXG CLI:", err.message);
  process.exit(1);
});
