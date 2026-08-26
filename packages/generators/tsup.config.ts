import { copy } from "esbuild-plugin-copy";

export default {
  entry: ["src/index.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ["esm"],
  esbuildPlugins: [
    copy({
      assets: {
        from: ["./src/**/*.tmpl"],
        to: ["./"],
      },
    }),
  ],
};
