import { useEffect, useRef, useState } from "react";
import type {
  ExtensionContext,
  ExtensionStorage,
  SearchFileResult,
  SearchMatch,
  SearchResponse,
  Workspace,
} from "@silo-code/sdk";
import {
  buildSearchOptions,
  summarize,
  EMPTY_UI_STATE,
  type SearchUiState,
} from "./search-model";
import { SearchResults } from "./SearchResults";
import { onSearchRequest, takePendingSearch } from "./search-bus";

const UI_STATE_KEY = "ui";
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
}: {
  ctx: ExtensionContext;
  workspace: Workspace;
  storage: ExtensionStorage;
  paused: boolean;
}) {
  const [ui, setUi] = useState<SearchUiState>(() =>
    storage.get<SearchUiState>(UI_STATE_KEY, EMPTY_UI_STATE),
  );
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  const inputRef = useRef<HTMLInputElement | null>(null);
  // Monotonic token so a slow earlier search can't overwrite a newer result.
  const runIdRef = useRef(0);

  const patch = (next: Partial<SearchUiState>) =>
    setUi((prev) => {
      const merged = { ...prev, ...next };
      storage.set(UI_STATE_KEY, merged);
      return merged;
    });

  const folder = workspace.folder;

  // Debounced search whenever the query/options change (and the panel is shown).
  useEffect(() => {
    const query = ui.query;
    if (paused) return;
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
        .search(query, buildSearchOptions(ui, folder))
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
    folder,
    paused,
  ]);

  // "Find in Files" (Cmd+Shift+F): seed the query from the editor/terminal
  // selection and focus the box. Consume a pending request on mount (the panel
  // may have been lazy-mounted by the reveal) and subscribe for live requests.
  useEffect(() => {
    const apply = (req: { query?: string }) => {
      if (req.query != null && req.query !== "") patch({ query: req.query });
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
      }
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
    ctx.editors.open(`${folder}/${file.path}`, {
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
          <SearchResults
            files={files}
            collapsed={collapsed}
            onToggleFile={toggleFile}
            onOpenMatch={openMatch}
          />
        </>
      ) : null}
    </div>
  );
}
