import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import {
  Button,
  EmptyState,
  List,
  ListRow,
  ModalActions,
  SearchInput,
  type AgentSessionSummary,
} from "@silo-code/sdk";
import {
  filterSessionSummaries,
  relativeUpdatedAt,
  resumableSessions,
  sessionSummaryTitle,
} from "./resume-session-picker";

export interface ResumeSessionDialogProps {
  /** Fetches the live list — a thin wrapper over `handle.listSessions()`. */
  readonly listSessions: () => Promise<readonly AgentSessionSummary[]>;
  /** Excluded from the list — this panel's own current session. */
  readonly currentSessionId: string | undefined;
  /** Only sessions whose reported `cwd` matches this one are offered
   *  (Session Discovery is scoped to the panel's current folder). */
  readonly cwd: string;
  /** Settle the host modal: the picked summary, or `undefined` to cancel. */
  readonly close: (picked?: AgentSessionSummary) => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "loaded"; sessions: readonly AgentSessionSummary[] }
  | { status: "error"; message: string };

/**
 * Session Discovery (RFC 0051) — the `/resume` picker's content. Modeled on
 * `git-explorer`'s `BranchManager`: async-load a list, filter it with a
 * `SearchInput`, render `List`/`ListRow` rows with metadata, and settle the
 * host modal on `onSelect`.
 */
export function ResumeSessionDialog({
  listSessions,
  currentSessionId,
  cwd,
  close,
}: ResumeSessionDialogProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [reloadNonce, setReloadNonce] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // ↓ from the search box hands off to the list's own roving-tabindex item
  // (List/useFocusGroup then owns ↑/↓ + Enter from there) — same handoff
  // git-explorer's BranchManager uses for its branch/commit pickers.
  function handleSearchKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown") return;
    const item = listRef.current?.querySelector<HTMLElement>(
      '[data-focus-item][tabindex="0"]',
    );
    if (!item) return;
    e.preventDefault();
    item.focus();
  }

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    listSessions()
      .then((sessions) => {
        if (!cancelled) setState({ status: "loaded", sessions });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [listSessions, reloadNonce]);

  const visible = useMemo(() => {
    if (state.status !== "loaded") return [];
    return filterSessionSummaries(
      resumableSessions(state.sessions, currentSessionId, cwd),
      query,
    );
  }, [state, currentSessionId, cwd, query]);

  const now = Date.now();

  return (
    <div className="acp-chat-resume-picker">
      <div onKeyDown={handleSearchKeyDown}>
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Filter sessions…"
          autoFocus
        />
      </div>
      <div ref={listRef} className="acp-chat-resume-picker-list silo-scroll">
        {state.status === "loading" ? (
          <EmptyState title="Loading sessions…" />
        ) : state.status === "error" ? (
          <EmptyState title={state.message} />
        ) : visible.length === 0 ? (
          <EmptyState title="This agent hasn't reported any other sessions." />
        ) : (
          <List aria-label="Other sessions">
            {visible.map((s) => (
              <ListRow
                key={s.sessionId}
                leading={<ArrowsClockwise size={15} />}
                trailing={relativeUpdatedAt(s.updatedAt, now)}
                onSelect={() => close(s)}
              >
                {sessionSummaryTitle(s)}
              </ListRow>
            ))}
          </List>
        )}
      </div>
      <ModalActions
        start={
          state.status === "error" ? (
            <Button onClick={() => setReloadNonce((n) => n + 1)}>Retry</Button>
          ) : undefined
        }
      >
        <Button type="button" onClick={() => close()}>
          Cancel
        </Button>
      </ModalActions>
    </div>
  );
}
