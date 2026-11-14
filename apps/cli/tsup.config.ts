export default {
  entry: ["src/index.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ["esm"],
  external: [
    "@dxgjs/doctor",
    "@dxgjs/errors",
    "@dxgjs/fs",
    "@dxgjs/generators",
    "@dxgjs/prompts",
    "@dxgjs/templates",
    "@dxgjs/workspace",
    "commander",
    "picocolors",
  ],
};