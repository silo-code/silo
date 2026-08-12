// tsc (with moduleResolution "bundler", used for authoring so the rest of the
// monorepo can resolve `@silo-code/sdk` straight to `src/`) emits relative
// import/export specifiers with no file extension, e.g.
// `export { PathDeniedError } from "./permissions";`. Bundlers resolve that
// fine, but it's invalid under Node's native ESM resolver — which is exactly
// what runs when a published dependent (an extension's own `vitest`/`node`
// run, not the app's bundler) loads this package directly. Node requires an
// explicit extension on relative specifiers in a `"type": "module"` package.
//
// Rather than authoring with explicit `.js` extensions on `.ts` sources (which
// `moduleResolution: "bundler"` doesn't require and most of this monorepo
// doesn't use), this postbuild step rewrites the emitted `dist/**/*.js` and
// `dist/**/*.d.ts` in place, appending the resolved extension to every
// relative specifier that's missing one.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = resolve(fileURLToPath(import.meta.url), "..", "..", "dist");

// Matches the specifier inside `import ... from "SPEC"`, `export ... from
// "SPEC"`, and `export * from "SPEC"` (the `[^'"]*` gap covers `type`, `*`,
// braces, and default bindings — anything between the keyword and `from`).
const STATIC_SPEC_RE =
  /((?:import|export)[^'"]*from\s+["'])(\.\.?\/[^"']+)(["'])/g;
const DYNAMIC_SPEC_RE = /(import\(\s*["'])(\.\.?\/[^"']+)(["']\s*\))/g;

function existsFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".d.ts"))
      out.push(full);
  }
  return out;
}

function resolveSpecifier(fromFile, spec) {
  // Relative specifiers in this package's source are never extensionless by
  // accident past this point — if one already has an extension, leave it.
  if (/\.(js|json|mjs|cjs)$/.test(spec)) return spec;
  const base = resolve(dirname(fromFile), spec);
  if (existsFile(`${base}.js`)) return `${spec}.js`;
  if (existsFile(join(base, "index.js"))) return `${spec}/index.js`;
  throw new Error(
    `fix-esm-extensions: cannot resolve relative specifier "${spec}" from ${fromFile}`,
  );
}

let changed = 0;
for (const file of walk(distDir)) {
  const src = readFileSync(file, "utf8");
  const fixed = src
    .replace(
      STATIC_SPEC_RE,
      (m, pre, spec, post) => `${pre}${resolveSpecifier(file, spec)}${post}`,
    )
    .replace(
      DYNAMIC_SPEC_RE,
      (m, pre, spec, post) => `${pre}${resolveSpecifier(file, spec)}${post}`,
    );
  if (fixed !== src) {
    writeFileSync(file, fixed);
    changed++;
  }
}

console.log(`fix-esm-extensions: rewrote ${changed} file(s) in dist/`);
