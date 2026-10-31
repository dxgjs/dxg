export default {
  entry: ["src/index.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ["esm"],
  external: ["@dxgjs/database-meta", "@dxgjs/errors", "@dxgjs/fs", "@dxgjs/logger", "@dxgjs/prompts", "@dxgjs/workspace"],
};