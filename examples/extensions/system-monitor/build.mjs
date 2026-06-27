import { build } from "esbuild";
import { copyFileSync, existsSync } from "fs";
import { homedir } from "os";

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
  loader: { ".css": "text" },
  logLevel: "info",
});

const installed = `${homedir()}/.config/silo-dev/extensions/example.system-monitor/dist/index.js`;
if (existsSync(installed)) {
  copyFileSync("dist/index.js", installed);
  console.log("  synced → " + installed);
}
