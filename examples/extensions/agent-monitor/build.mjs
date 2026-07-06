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

// Sync to every installed location so "Reload" in the Extensions page picks
// up the new bundle without a full reinstall.
const installTargets = [
  `${homedir()}/.config/silo-dev/extensions/silo.agent-monitor/dist/index.js`,
  `${homedir()}/.config/silo/extensions/silo.agent-monitor/dist/index.js`,
];
for (const target of installTargets) {
  if (existsSync(target)) {
    copyFileSync("dist/index.js", target);
    console.log(`  synced → ${target.replace(homedir(), "~")}`);
  }
}
