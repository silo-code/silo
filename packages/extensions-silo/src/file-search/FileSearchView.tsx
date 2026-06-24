import { useEffect, useRef, useState } from "react";
import type {
  ExtensionContext,
  ExtensionStorage,
  SearchFileResult,
  SearchMatch,
  SearchResponse,
  Workspace,
} from "@silo-code/sdk";
import { Tooltip } from "@silo-code/sdk";
import {
  buildSearchOptions,
  summarize,
  EMPTY_UI_STATE,
  type SearchUiState,
  type WorkspaceViewCache,
} from "./search-model";
import { SearchResults } from "./SearchResults";
import { ICON_CHEV_DOWN, ICON_CHEV_UP } from "./search-icons";
import { onSearchRequest, takePendingSearch } from "./search-bus";

const DEBOUNCE_MS = 250;

/** Toggle button for a search modifier (case / word / regex). */
function Toggle({
  on,
  label,
  title,
  onClick,
}: {
  on: boolean;
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`fsearch-toggle${on ? " on" : ""}`}
      aria-pressed={on}
      title={title}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function FileSearchView({
  ctx,
  workspace,
  storage,
  paused,
  savedState,
  onSaveState,
}: {
  ctx: ExtensionContext;
  workspace: Workspace;
  storage: ExtensionStorage;
  paused: boolean;
  savedState: WorkspaceViewCache | null;
  onSaveState: (state: WorkspaceViewCache) => void;
}) {
  // ui (query + toggles) is persisted per workspace so each workspace remembers
  // its own search independently across sessions.
  const uiKey = `ui.${workspace.id}`;
  const [ui, setUi] = useState<SearchUiState>(() =>
    storage.get<SearchUiState>(uiKey, EMPTY_UI_STATE),
  );
  const [response, setResponse] = useState<SearchResponse | null>(
    () => savedState?.response ?? null,
  );
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => savedState?.collapsed ?? new Set(),
  );

  const allFolders = [workspace.folder, ...(workspace.extraFolders ?? [])];
  const isMultiFolder = allFolders.length > 1;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const folderMenuRef = useRef<HTMLDivElement | null>(null);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  // Monotonic token so a slow earlier search can't overwrite a newer result.
  const runIdRef = useRef(0);
  // Skip the very first search run when we're restoring saved results so the
  // workspace switch doesn't wipe and re-fetch what was already there.
  const skipInitialRef = useRef(savedState?.response != null);
  // Always-current snapshot used by the unmount cleanup (avoids stale closure).
  const snapshotRef = useRef<WorkspaceViewCache>({
    response: savedState?.response ?? null,
    collapsed: savedState?.collapsed ?? new Set(),
    scrollTop: savedState?.scrollTop ?? 0,
  });
  snapshotRef.current = {
    response,
    collapsed,
    scrollTop: resultsRef.current?.scrollTop ?? snapshotRef.current.scrollTop,
  };

  const patch = (next: Partial<SearchUiState>) =>
    setUi((prev) => {
      const merged = { ...prev, ...next };
      storage.set(uiKey, merged);
      return merged;
    });

  function toggleFolder(folder: string) {
    const current = ui.enabledFolders ?? allFolders;
    const next = current.includes(folder)
      ? current.filter((f) => f !== folder)
      : [...current, folder];
    // If all folders are enabled, normalize back to null (meaning "all").
    patch({ enabledFolders: next.length === allFolders.length ? null : next });
  }

  // Save state when unmounting (workspace switch) so it can be restored next time.
  useEffect(
    () => () => {
      onSaveState({
        ...snapshotRef.current,
        scrollTop:
          resultsRef.current?.scrollTop ?? snapshotRef.current.scrollTop,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Close the folder dropdown when clicking outside it.
  useEffect(() => {
    if (!folderMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!folderMenuRef.current?.contains(e.target as Node)) {
        setFolderMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [folderMenuOpen]);

  // Restore scroll position after the saved results paint on mount.
  useEffect(() => {
    if (savedState?.scrollTop && resultsRef.current) {
      resultsRef.current.scrollTop = savedState.scrollTop;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced search whenever the query/options change (and the panel is shown).
  useEffect(() => {
    const query = ui.query;
    if (paused) return;
    // First run after mount with saved results: show them as-is, don't re-fetch.
    if (skipInitialRef.current) {
      skipInitialRef.current = false;
      return;
    }
    if (query.trim() === "") {
      setResponse(null);
      setError(null);
      setSearching(false);
      return;
    }
    const runId = ++runIdRef.current;
    setSearching(true);
    const timer = setTimeout(() => {
      ctx.search
        .search(query, buildSearchOptions(ui, allFolders))
        .then((res) => {
          if (runId !== runIdRef.current) return;
          setResponse(res);
          setError(null);
        })
        .catch((err: unknown) => {
          if (runId !== runIdRef.current) return;
          setResponse(null);
          setError(String(err));
        })
        .finally(() => {
          if (runId === runIdRef.current) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ui.query,
    ui.caseSensitive,
    ui.wholeWord,
    ui.regex,
    ui.includes,
    ui.excludes,
    ui.enabledFolders,
    // Use join so the effect fires when folder list identity changes.
    allFolders.join("\0"),
    paused,
  ]);

  // "Find in Files" (Cmd+Shift+F): seed the query from the editor/terminal
  // selection and focus the box. Consume a pending request on mount (the panel
  // may have been lazy-mounted by the reveal) and subscribe for live requests.
  useEffect(() => {
    const apply = (req: { query?: string }) => {
      if (req.query != null && req.query !== "") patch({ query: req.query });
      // Defer focus so revealSidePanel's state update has been committed and the
      // panel is visible before the browser processes the focus request.
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.select();
        }
      });
    };
    const pendingReq = takePendingSearch();
    if (pendingReq) apply(pendingReq);
    const sub = onSearchRequest(apply);
    return () => sub.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleFile(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function openMatch(file: SearchFileResult, match: SearchMatch) {
    const range = match.ranges[0];
    const column = range ? range[0] + 1 : 1;
    const endColumn = range ? range[1] + 1 : undefined;
    const root = file.root ?? workspace.folder;
    ctx.editors.open(`${root}/${file.path}`, {
      workspaceId: workspace.id,
      preview: true,
      selection: {
        line: match.line,
        column,
        endLine: match.line,
        endColumn,
      },
    });
  }

  const files = response?.files ?? [];

  const folderTriggerText =
    ui.enabledFolders == null
      ? "All folders"
      : ui.enabledFolders
          .filter((f) => allFolders.includes(f))
          .map((f) => f.split("/").pop() ?? f)
          .join(", ") || "All folders";

  return (
    <div className="fsearch-view">
      <div className="fsearch-controls">
        <div className="fsearch-input-row">
          <input
            ref={inputRef}
            type="text"
            className="fsearch-input"
            placeholder="Search"
            value={ui.query}
            spellCheck={false}
            onChange={(e) => patch({ query: e.target.value })}
          />
          <div className="fsearch-toggles">
            <Toggle
              on={ui.caseSensitive}
              label="Aa"
              title="Match Case"
              onClick={() => patch({ caseSensitive: !ui.caseSensitive })}
            />
            <Toggle
              on={ui.wholeWord}
              label="ab"
              title="Match Whole Word"
              onClick={() => patch({ wholeWord: !ui.wholeWord })}
            />
            <Toggle
              on={ui.regex}
              label=".*"
              title="Use Regular Expression"
              onClick={() => patch({ regex: !ui.regex })}
            />
          </div>
        </div>
        <label className="fsearch-field-label">files to include</label>
        <input
          type="text"
          className="fsearch-input fsearch-glob"
          placeholder="e.g. *.ts, src/**"
          value={ui.includes}
          spellCheck={false}
          onChange={(e) => patch({ includes: e.target.value })}
        />
        <label className="fsearch-field-label">files to exclude</label>
        <input
          type="text"
          className="fsearch-input fsearch-glob"
          placeholder="e.g. **/dist/**"
          value={ui.excludes}
          spellCheck={false}
          onChange={(e) => patch({ excludes: e.target.value })}
        />
        {isMultiFolder && (
          <>
            <label className="fsearch-field-label">folders to search</label>
            <div
              ref={folderMenuRef}
              className={`fsearch-folder-dropdown${folderMenuOpen ? " open" : ""}`}
            >
              <Tooltip content={folderTriggerText}>
                <button
                  type="button"
                  className={`fsearch-folder-trigger${ui.enabledFolders != null ? " filtered" : ""}`}
                  onClick={() => setFolderMenuOpen((o) => !o)}
                  aria-haspopup="listbox"
                  aria-expanded={folderMenuOpen}
                >
                  <span className="fsearch-folder-trigger-label">
                    {folderTriggerText}
                  </span>
                  <span className="fsearch-folder-chevron" aria-hidden>
                    {folderMenuOpen ? ICON_CHEV_UP : ICON_CHEV_DOWN}
                  </span>
                </button>
              </Tooltip>
              {folderMenuOpen && (
                <div className="fsearch-folder-menu" role="listbox">
                  {allFolders.map((f) => {
                    const name = f.split("/").pop() ?? f;
                    const enabled =
                      ui.enabledFolders == null ||
                      ui.enabledFolders.includes(f);
                    return (
                      <Tooltip key={f} content={f}>
                        <label
                          key={f}
                          className="fsearch-folder-item"
                          role="option"
                          aria-selected={enabled}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => toggleFolder(f)}
                          />
                          <span>{name}</span>
                        </label>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {error ? (
        <div className="fsearch-status fsearch-error">{error}</div>
      ) : ui.query.trim() === "" ? null : searching && !response ? (
        <div className="fsearch-status">Searching…</div>
      ) : response ? (
        <>
          <div className="fsearch-status">
            {summarize(response.totalMatches, files.length, response.truncated)}
          </div>
          <div className="fsearch-results" ref={resultsRef}>
            <SearchResults
              files={files}
              isMultiFolder={isMultiFolder}
              collapsed={collapsed}
              onToggleFile={toggleFile}
              onOpenMatch={openMatch}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
