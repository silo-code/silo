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
  // The host provides React and the SDK; `react-markdown` / `remark-gfm` are
  // this extension's own and get bundled in.
  external: ["react", "react/jsx-runtime", "@silo-code/sdk"],
  loader: { ".css": "text" },
  logLevel: "info",
});

// Sync to the dev-build's installed extension directory so "Reload" in the
// Extensions page picks up the new bundle without a full reinstall.
const installed = `${homedir()}/.config/silo-dev/extensions/silo.acp-chat/dist/index.js`;
if (existsSync(installed)) {
  copyFileSync("dist/index.js", installed);
  console.log(
    "  synced → ~/.config/silo-dev/extensions/silo.acp-chat/dist/index.js",
  );
}
