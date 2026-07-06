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

// Sync to the dev install so "Reload" in the Extensions page picks up the
// new bundle without a full reinstall. Prod (~/.config/silo/) is intentionally
// excluded — reinstall there manually via "Install from folder".
const devTarget = `${homedir()}/.config/silo-dev/extensions/silo.agent-monitor/dist/index.js`;
if (existsSync(devTarget)) {
  copyFileSync("dist/index.js", devTarget);
  console.log(`  synced → ${devTarget.replace(homedir(), "~")}`);
}
