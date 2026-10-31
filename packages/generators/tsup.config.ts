import { copy } from "esbuild-plugin-copy";

export default {
  entry: ["src/index.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ["esm"],
  external: ["@dxgjs/database-meta"],
  esbuildPlugins: [
    copy({
      assets: {
        from: ["./src/**/*.tmpl"],
        to: ["./"],
      },
    }),
  ],
};
