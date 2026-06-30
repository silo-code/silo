import { useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import type { IDockviewPanelProps } from "dockview";
import { Tooltip, type ExtensionContext } from "@silo-code/sdk";
import { X, ArrowLineDown, CopySimple } from "@phosphor-icons/react";
import {
  outputStore,
  clearChannel,
  type OutputEntry,
} from "@silo-code/extension-host/internal";
import {
  filterEntries,
  formatTimestamp,
  channelOptions,
  copyEntries,
  type OutputFilter,
} from "./output-model";
import "./OutputPanel.css";

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return "[unserializable]";
  }
}

interface OutputPanelProps extends IDockviewPanelProps {
  ctx: ExtensionContext;
}

export function OutputPanel({ ctx }: OutputPanelProps) {
  const snap = useSnapshot(outputStore);
  const { host, builtinExtensions, extensions } = channelOptions(
    snap.channels as typeof outputStore.channels,
    snap.order as string[],
  );

  const [selectedKey, setSelectedKey] = useState<string>(() =>
    ctx.storage.workspace.get("outputChannel", "silo:notifications"),
  );
  const [filter, setFilter] = useState<OutputFilter>({
    level: "all",
    search: "",
  });
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastClickedIdRef = useRef<number | null>(null);

  // Fall back to the first available channel if the selected one was disposed
  const activeKey = snap.channels[selectedKey]
    ? selectedKey
    : (host[0]?.key ?? builtinExtensions[0]?.key ?? extensions[0]?.key ?? "");

  const rawEntries = (snap.channels[activeKey]?.entries ??
    []) as readonly OutputEntry[];
  const filtered = filterEntries(rawEntries, filter);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filtered.length, autoScroll]);

  // Re-read selected channel when storage hydrates or the active workspace changes
  useEffect(() => {
    return ctx.storage.workspace.subscribe(() => {
      setSelectedKey(
        ctx.storage.workspace.get("outputChannel", "silo:notifications"),
      );
    });
  }, [ctx.storage.workspace]);

  // Clear selection when channel or filter changes
  useEffect(() => {
    setSelectedIds(new Set());
    lastClickedIdRef.current = null;
  }, [activeKey, filter.level, filter.search]);

  function handleRowClick(e: React.MouseEvent, entryId: number) {
    e.stopPropagation();
    if (e.shiftKey && lastClickedIdRef.current !== null) {
      const lastIdx = filtered.findIndex(
        (x) => x.id === lastClickedIdRef.current,
      );
      const thisIdx = filtered.findIndex((x) => x.id === entryId);
      if (lastIdx !== -1 && thisIdx !== -1) {
        const [lo, hi] =
          lastIdx < thisIdx ? [lastIdx, thisIdx] : [thisIdx, lastIdx];
        setSelectedIds(new Set(filtered.slice(lo, hi + 1).map((x) => x.id)));
      }
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(entryId)) next.delete(entryId);
        else next.add(entryId);
        return next;
      });
      lastClickedIdRef.current = entryId;
    } else {
      setSelectedIds((prev) =>
        prev.size === 1 && prev.has(entryId) ? new Set() : new Set([entryId]),
      );
      lastClickedIdRef.current = entryId;
    }
  }

  async function handleCopy() {
    const toCopy = filtered.filter((e) => selectedIds.has(e.id));
    if (toCopy.length === 0) return;
    await navigator.clipboard.writeText(copyEntries(toCopy));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "c" && selectedIds.size > 0) {
      e.preventDefault();
      void handleCopy();
    }
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    const hasCopyable = selectedIds.size > 0;
    void ctx.ui.showMenu({
      at: { x: e.clientX, y: e.clientY },
      toggle: false,
      items: [
        {
          label: hasCopyable
            ? `Copy ${selectedIds.size} row${selectedIds.size === 1 ? "" : "s"}`
            : "Copy",
          disabled: !hasCopyable,
          run: () => void handleCopy(),
        },
        { type: "separator" as const },
        {
          label: "Clear",
          disabled: !activeKey,
          run: () => {
            if (activeKey) clearChannel(activeKey);
          },
        },
      ],
    });
  }

  return (
    <div className="output-panel">
      <div className="output-toolbar">
        <select
          className="output-channel-select"
          value={activeKey}
          onChange={(e) => {
            setSelectedKey(e.target.value);
            ctx.storage.workspace.set("outputChannel", e.target.value);
          }}
          aria-label="Channel"
        >
          {host.map(({ key, displayName }) => (
            <option key={key} value={key}>
              {displayName}
            </option>
          ))}
          {builtinExtensions.length > 0 && (
            <optgroup label="Built-in Extensions">
              {builtinExtensions.map(({ key, displayName }) => (
                <option key={key} value={key}>
                  {displayName}
                </option>
              ))}
            </optgroup>
          )}
          {extensions.length > 0 && (
            <optgroup label="Extensions">
              {extensions.map(({ key, displayName }) => (
                <option key={key} value={key}>
                  {displayName}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <input
          className="output-search"
          type="search"
          placeholder="Filter..."
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
          aria-label="Filter entries"
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
        />
        <select
          className="output-level-select"
          value={filter.level}
          onChange={(e) =>
            setFilter((f) => ({
              ...f,
              level: e.target.value as OutputFilter["level"],
            }))
          }
          aria-label="Log level"
        >
          <option value="all">All Levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>
        <Tooltip content="Clear">
          <button
            className="output-icon-btn"
            onClick={() => activeKey && clearChannel(activeKey)}
            aria-label="Clear"
          >
            <X size={14} />
          </button>
        </Tooltip>
        <Tooltip
          content={
            selectedIds.size > 0
              ? `Copy ${selectedIds.size} row${selectedIds.size === 1 ? "" : "s"}`
              : "Copy selected rows (⌘C)"
          }
        >
          <button
            className="output-icon-btn"
            onClick={() => void handleCopy()}
            disabled={selectedIds.size === 0}
            aria-label="Copy selected rows"
          >
            <CopySimple size={14} />
          </button>
        </Tooltip>
        <Tooltip content={autoScroll ? "Auto-scroll on" : "Auto-scroll off"}>
          <button
            className={`output-icon-btn${autoScroll ? " on" : ""}`}
            onClick={() => setAutoScroll((v) => !v)}
            aria-pressed={autoScroll}
            aria-label="Toggle auto-scroll"
          >
            <ArrowLineDown size={14} />
          </button>
        </Tooltip>
      </div>
      <div
        className="output-list"
        ref={scrollRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onContextMenu={handleContextMenu}
        onClick={() => {
          setSelectedIds(new Set());
          lastClickedIdRef.current = null;
        }}
      >
        {filtered.length === 0 ? (
          <div className="output-empty">No entries.</div>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className={`output-entry${selectedIds.has(entry.id) ? " selected" : ""}`}
              data-level={entry.level}
              onClick={(e) => handleRowClick(e, entry.id)}
            >
              <div className="output-entry-line">
                <span className="output-ts">
                  {formatTimestamp(entry.timestamp)}
                </span>
                <span className="output-level">{entry.level}</span>
                <span className="output-msg">{entry.message}</span>
              </div>
              {entry.data !== undefined && (
                <div className="output-data">
                  {typeof entry.data === "string"
                    ? entry.data
                    : safeStringify(entry.data)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
