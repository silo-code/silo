import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Drift check for `docs/architecture.md`'s package table. That document is
// deliberately limited to structure the build already enforces, and the package
// graph is the load-bearing half of it: which packages exist, which workspace
// packages each depends on, and which ones publish. All three are facts in
// `package.json` files, so a stale row is detectable rather than a thing someone
// has to notice.
//
// What is NOT asserted: the "Owns" column and every prose section. Those are
// human judgment and the test has no opinion about them.
//
// Runs in the docs package alongside `doc-indexes.sync.test.ts`, and like it
// reads the repo-root tree rather than anything under `apps/docs`.

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const DOC = "docs/architecture.md";

interface Pkg {
  /** Directory relative to the repo root, e.g. `packages/sdk`. */
  path: string;
  /** The `name` field — the key used in the table's first column. */
  name: string;
  /** Workspace dependency names, sorted. */
  workspaceDeps: string[];
  published: boolean;
}

/** Every workspace package, per `pnpm-workspace.yaml`'s globs. */
function workspacePackages(): Pkg[] {
  const dirs = ["apps", "packages"].flatMap((parent) =>
    readdirSync(`${REPO_ROOT}/${parent}`)
      .map((name) => `${parent}/${name}`)
      .filter((path) => existsSync(`${REPO_ROOT}/${path}/package.json`)),
  );

  return dirs
    .map((path) => {
      const pkg = JSON.parse(
        readFileSync(`${REPO_ROOT}/${path}/package.json`, "utf8"),
      ) as {
        name: string;
        private?: boolean;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        peerDependencies?: Record<string, string>;
      };

      // A workspace dep can be declared in any of the three buckets:
      // `git-api` keeps `@silo-code/sdk` as a peer (+ dev) rather than a
      // runtime dependency, and that is still an edge in the graph.
      const declared = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
        ...pkg.peerDependencies,
      };

      return {
        path,
        name: pkg.name,
        workspaceDeps: Object.keys(declared)
          .filter((dep) => dep.startsWith("@silo-code/"))
          .sort(),
        published: pkg.private !== true,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

interface Row {
  name: string;
  path: string;
  deps: string[];
  published: boolean;
}

/** Parse the package table out of the document. */
function tableRows(): Row[] {
  const text = readFileSync(`${REPO_ROOT}/${DOC}`, "utf8");
  const section = /## Packages\n([\s\S]*?)\n### /.exec(text)?.[1];
  if (!section) throw new Error(`${DOC}: no "## Packages" table found`);

  return (
    section
      .split("\n")
      .filter((line) => line.startsWith("|"))
      // Drop the header and the `| --- |` separator.
      .filter(
        (line) => !/^\|[\s-]+\|/.test(line) && !/\|\s*Package\s*\|/.test(line),
      )
      .map((line) => {
        const cells = line
          .split("|")
          .slice(1, -1)
          .map((cell) => cell.trim());
        const [name, path, , deps, published] = cells;
        return {
          // Cells are written as `` `@silo-code/sdk` `` — strip the backticks.
          name: name!.replaceAll("`", ""),
          path: path!.replaceAll("`", ""),
          deps:
            deps === "—"
              ? []
              : deps!
                  .replaceAll("`", "")
                  .replace(/\s*\(peer\)/g, "")
                  .split(",")
                  .map((dep) => `@silo-code/${dep.trim()}`)
                  .sort(),
          published: published === "yes",
        };
      })
  );
}

describe("docs/architecture.md package table", () => {
  const packages = workspacePackages();
  const rows = tableRows();

  it("lists every workspace package, and no others", () => {
    expect(rows.map((row) => row.path).sort()).toEqual(
      packages.map((pkg) => pkg.path).sort(),
    );
  });

  it("names each package as its package.json does", () => {
    const byPath = new Map(rows.map((row) => [row.path, row]));
    for (const pkg of packages) {
      // `create-silo-extension` is unscoped; the row carries the bare name.
      expect(byPath.get(pkg.path)?.name, pkg.path).toBe(pkg.name);
    }
  });

  it("records each package's workspace dependency edges", () => {
    const byPath = new Map(rows.map((row) => [row.path, row]));
    for (const pkg of packages) {
      expect(byPath.get(pkg.path)?.deps, pkg.path).toEqual(pkg.workspaceDeps);
    }
  });

  it("marks exactly the packages that publish", () => {
    const byPath = new Map(rows.map((row) => [row.path, row]));
    for (const pkg of packages) {
      expect(byPath.get(pkg.path)?.published, pkg.path).toBe(pkg.published);
    }
  });
});
