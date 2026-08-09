import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Surfaces the release-please-generated CHANGELOG.md files as VitePress
// pages. Not committed (see apps/docs/.gitignore) — regenerated on every
// docs build so it's always current with the source of truth.
const docsRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repoRoot = path.resolve(docsRoot, "../..");

const pages = [
  {
    source: path.join(repoRoot, "apps/desktop/CHANGELOG.md"),
    dest: path.join(docsRoot, "changelog.md"),
  },
  {
    source: path.join(repoRoot, "packages/sdk/CHANGELOG.md"),
    dest: path.join(docsRoot, "api/sdk-changelog.md"),
  },
];

for (const { source, dest } of pages) {
  const body = readFileSync(source, "utf8");
  writeFileSync(dest, `---\noutline: false\n---\n\n${body}`);
}
