import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Surfaces the release-please-generated CHANGELOG.md files as VitePress
// pages, plus a structured JSON copy of the desktop changelog for the in-app
// update modal. Not committed (see apps/docs/.gitignore) — regenerated on
// every docs build so it's always current with the source of truth.
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

// Additionally parse the desktop app's changelog into structured entries for
// the in-app update modal (core.updates, ADR 0036), served as static JSON at
// https://getsilo.dev/changelog.json. Only the desktop app's own changelog
// needs this — the SDK changelog has no in-app consumer.
const HEADER_RE =
  /^## \[(\d+\.\d+\.\d+)\]\([^)]*\)\s*\((\d{4}-\d{2}-\d{2})\)\s*$/gm;

function parseChangelogEntries(markdown) {
  const headers = [...markdown.matchAll(HEADER_RE)];
  return headers.map((header, i) => {
    const start = header.index + header[0].length;
    const end = i + 1 < headers.length ? headers[i + 1].index : markdown.length;
    return {
      version: header[1],
      date: header[2],
      body: markdown.slice(start, end).trim(),
    };
  });
}

const desktopChangelog = readFileSync(
  path.join(repoRoot, "apps/desktop/CHANGELOG.md"),
  "utf8",
);
writeFileSync(
  path.join(docsRoot, "public/changelog.json"),
  JSON.stringify(
    { schemaVersion: 1, entries: parseChangelogEntries(desktopChangelog) },
    null,
    2,
  ),
);
