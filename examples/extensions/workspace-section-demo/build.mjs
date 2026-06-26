import { build } from "esbuild";

await build({
  entryPoints: ["src/index.tsx"],
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  minify: false,
  external: ["react", "react/jsx-runtime", "@silo-code/sdk"],
  logLevel: "info",
});
