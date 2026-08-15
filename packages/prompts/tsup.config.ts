export default {
  entry: ["src/index.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ["esm"],
  outExtension: () => ({
    js: '.mjs',
  }),
  tsBuildInfoFile: ".tsbuildinfo",
};
