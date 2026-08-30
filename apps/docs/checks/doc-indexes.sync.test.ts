import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Drift check for the two governance indexes: `docs/proposals/README.md`
// (RFCs) and `docs/decisions/README.md` (ADRs). Both carry a hand-maintained
// table, and a new document is easy to land without adding its row — the index
// then quietly stops being the list of what exists.
//
// This asserts the table and the directory agree on: which documents exist,
// where each row links, the `created` / `date` in the frontmatter, and the
// `status`. Titles are left to humans — the index deliberately shortens some.
//
// Runs in the docs package because it is a docs-consistency check; it reads the
// repo-root `docs/` tree rather than anything under `apps/docs`.

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface DocEntry {
  /** `0032` — the index key. */
  number: string;
  /** Path the index row must link to, relative to the README. */
  link: string;
  status: string;
  date: string;
}

interface IndexRow {
  number: string;
  link: string;
  status: string;
  date: string;
}

function frontmatter(text: string, field: string): string | undefined {
  return new RegExp(`^${field}:\\s*(\\S+)`, "m").exec(text)?.[1];
}

/** Every numbered document in `dir`, including planning packages. */
function docEntries(dir: string): DocEntry[] {
  return readdirSync(`${REPO_ROOT}/${dir}`)
    .filter((name) => /^\d{4}-/.test(name))
    .sort()
    .map((name) => {
      // A proposal expanded into a planning package is a directory; its
      // frontmatter lives in `proposal.md` and the index links there.
      const isPackage = statSync(`${REPO_ROOT}/${dir}/${name}`).isDirectory();
      const link = isPackage ? `./${name}/proposal.md` : `./${name}`;
      const file = isPackage ? `${dir}/${name}/proposal.md` : `${dir}/${name}`;
      const text = readFileSync(`${REPO_ROOT}/${file}`, "utf8");
      return {
        number: name.slice(0, 4),
        link,
        // ADRs use `date:`, proposals use `created:`.
        date: frontmatter(text, "created") ?? frontmatter(text, "date") ?? "",
        status: frontmatter(text, "status") ?? "",
      };
    });
}

/** The `| [NNNN](link) | Title | date | status |` rows of a README's index. */
function indexRows(dir: string): IndexRow[] {
  const readme = readFileSync(`${REPO_ROOT}/${dir}/README.md`, "utf8");
  const rows: IndexRow[] = [];
  for (const line of readme.split("\n")) {
    const link = /^\|\s*\[(\d{4})\]\(([^)]+)\)/.exec(line);
    if (!link) continue;
    const cells = line
      .split("|")
      .map((cell) => cell.trim())
      .filter((cell, i, all) => i !== 0 && i !== all.length - 1);
    rows.push({
      number: link[1],
      link: link[2],
      date: cells[cells.length - 2] ?? "",
      status: cells[cells.length - 1] ?? "",
    });
  }
  return rows;
}

describe.each([
  ["docs/proposals", "RFC"],
  ["docs/decisions", "ADR"],
])("%s/README.md index", (dir, label) => {
  const entries = docEntries(dir);
  const rows = indexRows(dir);
  const byNumber = new Map(rows.map((row) => [row.number, row]));

  it(`lists every ${label}`, () => {
    const missing = entries
      .filter((entry) => !byNumber.has(entry.number))
      .map(
        (entry) =>
          `| [${entry.number}](${entry.link}) | <title> | ${entry.date} | ${entry.status} |`,
      );
    expect(
      missing,
      `Add the missing row(s) to ${dir}/README.md:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("has no rows for documents that don't exist", () => {
    const numbers = new Set(entries.map((entry) => entry.number));
    expect(
      rows.filter((row) => !numbers.has(row.number)).map((r) => r.number),
    ).toEqual([]);
  });

  it.each(entries)("$number links to the document", (entry) => {
    expect(byNumber.get(entry.number)?.link).toBe(entry.link);
  });

  it.each(entries)("$number matches its frontmatter", (entry) => {
    const row = byNumber.get(entry.number);
    if (!row) return; // reported by the "lists every" case above
    expect(row.date).toBe(entry.date);
    // The index shortens `superseded-by: NNNN` to `superseded`, so a prefix
    // counts — anything else is drift.
    expect(
      entry.status.startsWith(row.status),
      `${dir}/${entry.number}: frontmatter says "${entry.status}", index says "${row.status}"`,
    ).toBe(true);
  });
});
