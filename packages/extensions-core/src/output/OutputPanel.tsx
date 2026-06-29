import { useEffect, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import type { IDockviewPanelProps } from "dockview";
import { Tooltip } from "@silo-code/sdk";
import { X, ArrowLineDown } from "@phosphor-icons/react";
import {
  outputStore,
  clearChannel,
  type OutputEntry,
} from "@silo-code/extension-host/internal";
import {
  filterEntries,
  formatTimestamp,
  channelOptions,
  type OutputFilter,
} from "./output-model";
import "./OutputPanel.css";

export function OutputPanel(_props: IDockviewPanelProps) {
  const snap = useSnapshot(outputStore);
  const { host, builtinExtensions, extensions } = channelOptions(
    snap.channels as typeof outputStore.channels,
    snap.order as string[],
  );

  const [selectedKey, setSelectedKey] = useState<string>("silo:notifications");
  const [filter, setFilter] = useState<OutputFilter>({
    level: "all",
    search: "",
  });
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="output-panel">
      <div className="output-toolbar">
        <select
          className="output-channel-select"
          value={activeKey}
          onChange={(e) => setSelectedKey(e.target.value)}
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
      <div className="output-list" ref={scrollRef}>
        {filtered.length === 0 ? (
          <div className="output-empty">No entries.</div>
        ) : (
          filtered.map((entry) => (
            <div
              key={entry.id}
              className="output-entry"
              data-level={entry.level}
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
                    : JSON.stringify(entry.data)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
