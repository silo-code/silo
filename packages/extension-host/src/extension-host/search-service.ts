import { invoke } from "@tauri-apps/api/core";
import { store } from "../state/store";
import { PathDeniedError } from "@silo-code/sdk";
import { toAbsolute, withinRoots } from "./security/resolve-path";
import type { PathScope } from "./security/resolve-path";
import type { SearchService, SearchResponse } from "@silo-code/sdk";

// `ctx.search` — cross-file content search. The public contract lives in
// @silo-code/sdk (search-service.ts); this host implementation bridges the
// native `search_files` Tauri command (ripgrep's engine + the `.gitignore`-aware
// walker), defaulting the search root to the active workspace folder.

/** The active workspace's folder, or undefined when no workspace is open. */
function activeWorkspaceFolder(): string | undefined {
  const id = store.activeWorkspaceId;
  return id ? store.workspaces[id]?.folder : undefined;
}

let service: SearchService | null = null;

/** @internal — host factory; extensions receive this as `ctx.search`. */
export function getSearchService(): SearchService {
  if (service) return service;
  service = {
    search(query, options) {
      const cwds = options?.cwds ?? [];
      const cwd = options?.cwd ?? activeWorkspaceFolder();
      // Tauri command receives roots as a SearchRoots struct: cwds takes priority.
      if (cwds.length === 0 && cwd === undefined) {
        return Promise.reject(new PathDeniedError("", "No workspace is open"));
      }
      return invoke<SearchResponse>("search_files", {
        query,
        roots: { cwds, cwd: cwds.length === 0 ? cwd : undefined },
        options: {
          regex: options?.regex ?? false,
          caseSensitive: options?.caseSensitive ?? false,
          wholeWord: options?.wholeWord ?? false,
          includeGlobs: options?.includeGlobs ?? [],
          excludeGlobs: options?.excludeGlobs ?? [],
          maxResults: options?.maxResults ?? 0,
          maxFileSize: null,
        },
      });
    },
  };
  return service;
}

/**
 * Resolve and check a search root against `scope` — the workspace folder by
 * default; a `cwd` outside the workspace is allowed only with the `process`
 * capability. Throws {@link PathDeniedError} otherwise. Mirrors the cwd guard
 * the process service applies (search shells out to the same workspace tree).
 */
function guardCwd(scope: PathScope, cwd: string | undefined): string {
  const target = cwd ?? scope.roots[0];
  if (target === undefined) {
    throw new PathDeniedError(cwd ?? "", "No workspace is open");
  }
  if (scope.permissions.has("process")) return target;
  const abs = toAbsolute(scope.roots, target);
  if (abs !== null && withinRoots(scope.roots, abs)) return abs;
  throw new PathDeniedError(
    target,
    `Search root is outside the workspace (needs "process"): ${target}`,
  );
}

/**
 * Wrap a {@link SearchService} so its search root is scoped to the workspace
 * (lifted by the `process` capability). Trusted scopes return the base service
 * unchanged. Pure over `base` for testing.
 *
 * @internal
 */
export function scopeSearchService(
  base: SearchService,
  scope: PathScope,
): SearchService {
  if (scope.trusted) return base;
  return {
    search: async (query, options) => {
      const cwds = options?.cwds ?? [];
      if (cwds.length > 0) {
        const guardedCwds = cwds.map((c) => guardCwd(scope, c));
        return base.search(query, {
          ...options,
          cwds: guardedCwds,
          cwd: undefined,
        });
      }
      return base.search(query, {
        ...options,
        cwd: guardCwd(scope, options?.cwd),
      });
    },
  };
}

/** @internal — the per-extension scoped `ctx.search`. */
export function getScopedSearchService(scope: PathScope): SearchService {
  return scopeSearchService(getSearchService(), scope);
}
