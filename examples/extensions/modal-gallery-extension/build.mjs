import { build } from "esbuild";

// Build a single-file ESM bundle. `react`, `react/jsx-runtime`, and `@silo-code/sdk`
// are EXTERNAL — the Silo host resolves them to its own instances at load time,
// so the extension shares one React (hooks work) and one SDK (same services).
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
