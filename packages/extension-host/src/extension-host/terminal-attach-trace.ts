import { invoke } from "@tauri-apps/api/core";
import { createHostChannel } from "./output-store";

/**
 * Durable attach/restore tracing for dogfood (RFC 0026).
 *
 * Every event is written to:
 * 1. the `silo:terminals` Output channel (live in-session)
 * 2. `terminal.log` via `terminal_diag_log` (survives UI restart)
 *
 * Keep field names stable — grepping `ui_attach_gone` / `ui_init_miss` in
 * `~/Library/Application Support/com.silo.desktop.dev/logs/terminal.log` is the
 * post-mortem path.
 */

const terminalsChannel = createHostChannel("silo:terminals", "Terminals");

/** UI-side lifecycle events (Rust uses host_* / attach / create without ui_). */
export type TerminalAttachTraceEvent =
  | "ui_init_miss"
  | "ui_attach_start"
  | "ui_spawn_start"
  | "ui_attach_ok"
  | "ui_spawn_ok"
  | "ui_attach_fail"
  | "ui_attach_gone"
  | "ui_recreate"
  | "ui_init_cancelled"
  /** Data-client EOF while session-host may still be alive — remount to reattach. */
  | "ui_reconnect"
  /** Reconnect budget exhausted; painting the permanent exited overlay. */
  | "ui_reconnect_give_up";

export type TraceFieldValue = string | number | boolean | null | undefined;

/**
 * Flatten fields to a greppable `key=value` detail line (skip null/undefined).
 * Values with spaces are JSON-stringified.
 */
export function formatTraceDetail(
  fields: Record<string, TraceFieldValue>,
): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(fields)) {
    if (raw === undefined || raw === null) continue;
    const value =
      typeof raw === "string" && /[\s=]/.test(raw)
        ? JSON.stringify(raw)
        : String(raw);
    parts.push(`${key}=${value}`);
  }
  return parts.join(" ");
}

export function formatTraceMessage(
  event: TerminalAttachTraceEvent,
  detail: string,
): string {
  return detail ? `${event} ${detail}` : event;
}

/**
 * Log one attach/restore decision. Fire-and-forget to disk — never await from
 * the attach hot path (a stalled diag write must not block restore).
 */
export function logTerminalAttachTrace(
  event: TerminalAttachTraceEvent,
  fields: Record<string, TraceFieldValue> = {},
): void {
  const detail = formatTraceDetail(fields);
  const message = formatTraceMessage(event, detail);
  const data = { event, ...fields };
  if (
    event === "ui_init_miss" ||
    event === "ui_attach_fail" ||
    event === "ui_attach_gone"
  ) {
    terminalsChannel.error(message, data);
  } else {
    terminalsChannel.info(message, data);
  }
  void invoke("terminal_diag_log", { event, detail }).catch(() => {
    /* diag must never break attach */
  });
}
