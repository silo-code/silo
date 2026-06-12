// The terminal find overlay (Cmd+F / Ctrl+F). Thin glue around xterm's
// SearchAddon and the pure helpers in terminal-search.ts. Mounted by
// TerminalPanel only while the terminal is "ready".
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ArrowDown, X } from "@phosphor-icons/react";
import type { SearchAddon } from "@xterm/addon-search";
import {
  buildSearchOptions,
  formatMatchCount,
  rgbToHex,
  blendOver,
  isLightColor,
  DEFAULT_SEARCH_FLAGS,
  MONACO_FIND_COLORS,
  type DecorationColors,
  type SearchFlags,
} from "./terminal-search";
import "./TerminalSearch.css";

const isMac = navigator.platform.toUpperCase().includes("MAC");

// The terminal surface color (#RRGGBB) the match highlights are painted over —
// needed to pre-blend the translucent orange (the WebGL renderer ignores alpha)
// and to pick the light/dark active-match fill. Falls back to the dark surface.
function terminalSurface(host: HTMLElement): string {
  return rgbToHex(getComputedStyle(host).backgroundColor) ?? "#0f1115";
}

const DARK_DEFAULT: DecorationColors = {
  match: blendOver(MONACO_FIND_COLORS.matchHighlight, "#0f1115"),
  activeMatch: MONACO_FIND_COLORS.activeDark,
  ruler: MONACO_FIND_COLORS.ruler,
};

interface Props {
  addon: SearchAddon;
  /** The terminal container — used to resolve theme colors for decorations. */
  host: HTMLElement | null;
  /** Seed query (the terminal's current selection, if any). */
  initialQuery: string;
  onClose: () => void;
  /** Return focus to the xterm instance (called on close). */
  onFocusTerminal: () => void;
}

export function TerminalSearch({
  addon,
  host,
  initialQuery,
  onClose,
  onFocusTerminal,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [flags, setFlags] = useState<SearchFlags>(DEFAULT_SEARCH_FLAGS);
  const [results, setResults] = useState<{
    resultIndex: number;
    resultCount: number;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Decoration colors mirror Monaco's find palette (translucent orange for all
  // matches, a neutral fill for the active one), pre-blended/picked for the
  // terminal's surface so terminal search looks identical to the editor.
  // Re-resolved if the host (hence theme) changes.
  const decoRef = useRef<DecorationColors>(DARK_DEFAULT);
  useEffect(() => {
    if (!host) return;
    const surface = terminalSurface(host);
    decoRef.current = {
      match: blendOver(MONACO_FIND_COLORS.matchHighlight, surface),
      activeMatch: isLightColor(surface)
        ? MONACO_FIND_COLORS.activeLight
        : MONACO_FIND_COLORS.activeDark,
      ruler: MONACO_FIND_COLORS.ruler,
    };
  }, [host]);

  // Run a search. dir: +1 next, -1 previous, 0 incremental (typing).
  const run = useCallback(
    (q: string, dir: -1 | 0 | 1) => {
      if (!q) {
        addon.clearDecorations();
        setResults(null);
        return;
      }
      const opts = buildSearchOptions(flags, decoRef.current, dir === 0);
      if (dir < 0) addon.findPrevious(q, opts);
      else addon.findNext(q, opts);
    },
    [addon, flags],
  );

  // The match count rides on onDidChangeResults, which only fires while
  // decorations are enabled (buildSearchOptions always enables them).
  useEffect(() => {
    const sub = addon.onDidChangeResults((e) => setResults(e));
    return () => sub.dispose();
  }, [addon]);

  // Focus + select the input on mount so the user can type immediately.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Re-search whenever the query or a match-mode flag changes (incremental).
  useEffect(() => {
    run(query, 0);
  }, [query, flags, run]);

  const close = useCallback(() => {
    addon.clearDecorations();
    onClose();
    onFocusTerminal();
  }, [addon, onClose, onFocusTerminal]);

  // Step to the next/previous match and keep keyboard focus in the input so
  // Enter / Shift+Enter keep working after a button click.
  const step = useCallback(
    (dir: -1 | 1) => {
      run(query, dir);
      inputRef.current?.focus();
    },
    [run, query],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      step(e.shiftKey ? -1 : 1);
    } else if (
      (isMac ? e.metaKey : e.ctrlKey) &&
      (e.key === "f" || e.key === "F")
    ) {
      // Re-pressing the find shortcut while open just reselects the query.
      e.preventDefault();
      e.currentTarget.select();
    }
  }

  function toggle(k: keyof SearchFlags) {
    setFlags((f) => ({ ...f, [k]: !f[k] }));
    inputRef.current?.focus();
  }

  const label = formatMatchCount(query, results);
  const noMatch = label === "No results";

  return (
    <div className="terminal-search" role="search">
      <div
        className={`terminal-search__field${noMatch ? " terminal-search__field--nomatch" : ""}`}
      >
        <input
          ref={inputRef}
          className="terminal-search__input"
          type="text"
          placeholder="Find"
          value={query}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
        />
        <div className="terminal-search__toggles">
          <button
            type="button"
            className={`terminal-search__toggle${flags.caseSensitive ? " is-on" : ""}`}
            title="Match Case"
            aria-label="Match Case"
            aria-pressed={flags.caseSensitive}
            onClick={() => toggle("caseSensitive")}
          >
            Aa
          </button>
          <button
            type="button"
            className={`terminal-search__toggle terminal-search__toggle--word${flags.wholeWord ? " is-on" : ""}`}
            title="Match Whole Word"
            aria-label="Match Whole Word"
            aria-pressed={flags.wholeWord}
            onClick={() => toggle("wholeWord")}
          >
            ab
          </button>
          <button
            type="button"
            className={`terminal-search__toggle${flags.regex ? " is-on" : ""}`}
            title="Use Regular Expression"
            aria-label="Use Regular Expression"
            aria-pressed={flags.regex}
            onClick={() => toggle("regex")}
          >
            .*
          </button>
        </div>
      </div>
      <span className="terminal-search__count">{label}</span>
      <button
        type="button"
        className="terminal-search__btn"
        title="Previous Match (⇧⏎)"
        aria-label="Previous Match"
        onClick={() => step(-1)}
      >
        <ArrowUp size={16} weight="bold" />
      </button>
      <button
        type="button"
        className="terminal-search__btn"
        title="Next Match (⏎)"
        aria-label="Next Match"
        onClick={() => step(1)}
      >
        <ArrowDown size={16} weight="bold" />
      </button>
      <button
        type="button"
        className="terminal-search__btn"
        title="Close (Esc)"
        aria-label="Close"
        onClick={close}
      >
        <X size={16} weight="bold" />
      </button>
    </div>
  );
}
