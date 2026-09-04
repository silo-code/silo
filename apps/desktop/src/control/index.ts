import { emit, listen } from "@tauri-apps/api/event";
import { createHostChannel } from "@silo-code/extension-host";
import { applyControlAgentRun } from "./agent-run-handler";
import { applyWsLive } from "./ws-live-handler";
import { fail, type ControlRequestEvent, type ControlResult } from "./types";

/**
 * The webview half of the Control API (RFC 0034).
 *
 * The host owns the socket, the envelope, and the allowlist; this owns the
 * handlers for the ops that need live app state. Requests arrive as
 * `control://request` events and are answered on `control://reply` with the
 * host's correlation id — the same round-trip pattern as the dev automation
 * bridge (ADR 0012), which is where the shape comes from.
 *
 * Registering also flips the host's **readiness** flag. That is what
 * `silo status` reports and what `--launch` waits on, so a request is never
 * delivered to an instance whose webview cannot yet answer it — and a wedged app
 * (`webview: "starting"` forever) is distinguishable from no app at all.
 *
 * The Control channel is a genuinely new subsystem with its own diagnostic
 * surface, so it gets its own Output channel rather than overloading
 * "Application". The host's own lifecycle lines (bind, refusal, takeover,
 * re-bind, per-request outcomes) arrive here as `control://log` and land in the
 * same place, so one channel tells the whole story.
 */
const log = createHostChannel("silo:control", "Control");

/** Every op this side answers. The host's `registry.rs` is the allowlist — this
 *  is the other half of it, and `control-registry.test.ts` asserts the two agree
 *  so an op cannot be registered with no handler or vice versa. */
export const HANDLERS: Record<
  string,
  (req: ControlRequestEvent) => ControlResult
> = {
  "ws.live": () => applyWsLive(),
  "agent.run": (req) =>
    applyControlAgentRun({
      cwd: req.cwd,
      profileId: str(req.args.profileId),
      ws: str(req.args.ws),
      prompt: str(req.args.prompt),
    }),
};

/** A wire argument as a string, or `undefined` for anything else. The host
 *  built these from argv, but a handler must not assume the shape it gets. */
function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Answer one request.
 *
 * A handler that throws would reach the caller as a five-second `timeout` — a
 * command failing as silence, which is the exact thing RFC 0034 exists to
 * remove. So a throw is converted to `internal` here, with the reason attached.
 */
export function dispatchControlRequest(
  req: ControlRequestEvent,
): ControlResult {
  const handler = HANDLERS[req.op];
  if (!handler) {
    // The host refuses unknown ops at its registry, so reaching this means the
    // two halves disagree — a bug in Silo, not in the caller's command.
    return fail("internal", `No webview handler for "${req.op}".`);
  }
  try {
    return handler(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`${req.op} threw: ${message}`);
    return fail("internal", `"${req.op}" failed: ${message}`);
  }
}

/** Send one answer back, carrying the host's correlation id verbatim. */
function reply(id: number, result: ControlResult): void {
  void emit(
    "control://reply",
    result.ok
      ? { id, data: result.data }
      : { id, error: { code: result.code, message: result.message } },
  );
}

/**
 * Wire the Control API into the running webview.
 *
 * Must run **after workspace hydration** — `ws.live` and `agent.run` both read
 * `store.workspaces`, and answering either against an unhydrated store would
 * report "no workspaces" to a caller that can act on it (see the boot chain in
 * `main.tsx`).
 */
export async function initControlHandler(): Promise<void> {
  await listen<{ level?: string; message?: string }>(
    "control://log",
    (event) => {
      const message = event.payload?.message;
      if (!message) return;
      if (event.payload?.level === "error") log.error(message);
      else if (event.payload?.level === "warn") log.warn(message);
      else log.info(message);
    },
  );

  await listen<ControlRequestEvent>("control://request", (event) => {
    const req = event.payload;
    if (!req) return;
    reply(req.id, dispatchControlRequest(req));
  });

  // Last: the host must not be told it can serve ops until the listener above
  // is actually attached.
  void emit("control://ready", true);
}
