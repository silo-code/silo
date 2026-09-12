/**
 * The piped-stdio transport for a **Chat session** (RFC 0038): bridges the
 * `acp_*` Tauri commands (`apps/desktop/src-tauri/src/commands/acp.rs`) into a
 * pair of web streams carrying *parsed* JSON-RPC messages, which
 * `acp-jsonrpc.ts` layers a protocol client on.
 *
 * Lives in the host, never in an extension, because an extension may not
 * import `@tauri-apps/*` (the platform ban — see AGENTS.md). That is the
 * lasting split: the host owns the connection, an extension owns the UI, and
 * `ctx.agents.sessions` is the seam between them.
 *
 * `AcpStream` is `{ readable, writable }` over messages, not bytes: the Rust
 * side already delivers whole lines, so all this layer does is `JSON.parse`
 * inbound and `JSON.stringify` outbound.
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

/** One JSON-RPC message. Kept as `unknown`-ish rather than importing the SDK's
 * `AnyMessage` — the host has no reason to depend on the protocol package. */
export type AcpMessage = Record<string, unknown>;

/** The ACP SDK's `Stream`: web streams carrying parsed messages both ways. */
export interface AcpStream {
  readable: ReadableStream<AcpMessage>;
  writable: WritableStream<AcpMessage>;
}

/** The transport contract `acp-jsonrpc.ts` consumes. Structural, so a test
 *  can hand the client an in-memory pair instead of a real child process. */
export interface AcpTransportLike {
  connect(): Promise<AcpStream>;
  disconnect(): void;
  onClose?: (handler: () => void) => () => void;
  onError?: (handler: (err: Error) => void) => () => void;
}

export interface AcpTransportOptions {
  /** Binary to run, e.g. `"cursor-agent"`. Resolved on `PATH` — no shell. */
  command: string;
  /** Argument vector, e.g. `["acp"]`. Note this is argv, not a shell string:
   * ACP execs a pipe-connected child, so RFC 0033's "a command is a string so
   * aliases resolve" reasoning does not carry over. */
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Called for every stderr line, for diagnosing a connection that comes up
   * but never answers. */
  onStderr?: (line: string) => void;
  /**
   * Environment variables whose **effective** value the caller wants reported
   * back through {@link onEnvReport} — the explicit {@link env} override when
   * one was given, otherwise whatever Silo itself inherited.
   *
   * The case this exists for: an agent CLI reads its config directory, and
   * with it its *session store*, from an env var. Which store a Chat session
   * lands in is therefore decided by the environment Silo was launched from —
   * invisible, and different between a terminal launch and a Finder launch.
   * Recording what the child actually got is what lets a later restore address
   * the same store.
   */
  reportEnv?: string[];
  /** Effective values of {@link reportEnv}, delivered once per `connect()`. */
  onEnvReport?: (values: Readonly<Record<string, string>>) => void;
}

interface SpawnResult {
  connectionId: string;
  pid: number;
  envReport?: Record<string, string>;
}

interface AcpExit {
  code: number;
  stderr: string[];
}

/** Chunk kinds that stream text and are grouped into one bubble by `messageId`. */
const TEXT_CHUNKS = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "user_message_chunk",
]);

/** Kinds that render as their own block, so a text run either side of one
 * belongs in a separate bubble. Notably excludes `usage_update` and
 * `available_commands_update`, which arrive mid-stream and render nothing. */
const RUN_BREAKING = new Set(["tool_call", "tool_call_update", "plan"]);

/**
 * Give a streamed text chunk a stable `messageId` when the agent omits one.
 *
 * **`messageId` is optional in ACP and real agents skip it.** Cursor sends
 * `{ sessionUpdate, content }` and nothing else. A consumer that groups chunks
 * by id and falls back to a fresh uuid mints one *per chunk*, so a sentence
 * arrives as one message per token: the one-word-per-line transcript and the
 * shredded THOUGHT blocks are both this.
 *
 * Synthesizing the id here is the client's job, not a workaround: the spec
 * makes the field optional, so grouping consecutive same-kind chunks is what a
 * client is expected to do. A run ends when the kind changes or a rendered
 * block (tool call, plan) interrupts it, which is exactly where a new bubble
 * should start.
 */
export function makeChunkGrouper(): (msg: AcpMessage) => AcpMessage {
  let runKind: string | null = null;
  let runId: string | null = null;
  let seq = 0;

  return (msg) => {
    if (msg.method !== "session/update") return msg;
    const params = msg.params as
      | { update?: Record<string, unknown> }
      | undefined;
    const update = params?.update;
    if (!update) return msg;
    const kind = update.sessionUpdate as string | undefined;
    if (!kind) return msg;

    if (!TEXT_CHUNKS.has(kind)) {
      if (RUN_BREAKING.has(kind)) {
        runKind = null;
        runId = null;
      }
      return msg;
    }
    // An agent that *does* send ids is left completely alone.
    if (update.messageId !== undefined) {
      runKind = null;
      runId = null;
      return msg;
    }
    if (kind !== runKind || runId === null) {
      runKind = kind;
      runId = `silo-msg-${++seq}`;
    }
    return {
      ...msg,
      params: {
        ...(msg.params as object),
        update: { ...update, messageId: runId },
      },
    };
  };
}

export function createAcpTransport(
  options: AcpTransportOptions,
): AcpTransportLike {
  let connectionId: string | null = null;
  let unlisten: UnlistenFn[] = [];
  const groupChunks = makeChunkGrouper();
  const closeHandlers = new Set<() => void>();
  const errorHandlers = new Set<(err: Error) => void>();

  const teardown = () => {
    for (const un of unlisten) un();
    unlisten = [];
  };

  return {
    async connect(): Promise<AcpStream> {
      const spawned = await invoke<SpawnResult>("acp_spawn", {
        command: options.command,
        args: options.args ?? [],
        cwd: options.cwd,
        env: options.env ?? null,
        reportEnv: options.reportEnv ?? null,
      });
      connectionId = spawned.connectionId;
      if (options.onEnvReport) options.onEnvReport(spawned.envReport ?? {});

      let push: ((m: AcpMessage) => void) | null = null;
      let close: (() => void) | null = null;
      const readable = new ReadableStream<AcpMessage>({
        start(controller) {
          push = (m) => controller.enqueue(m);
          close = () => {
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          };
        },
      });

      // Subscribing happens after the spawn because the event names are keyed
      // on the id the spawn returns. Safe in practice — ACP is client-first, so
      // a well-behaved agent says nothing until `initialize` arrives — but a
      // real implementation should have the Rust side buffer until the first
      // subscriber attaches rather than rely on that.
      unlisten = await Promise.all([
        listen<string>(`acp_message:${spawned.connectionId}`, (e) => {
          let parsed: AcpMessage;
          try {
            parsed = JSON.parse(e.payload) as AcpMessage;
          } catch (err) {
            // A non-JSON line on stdout is a protocol violation, not a message.
            // Report it rather than tearing the connection down: agents do
            // occasionally print a banner before speaking.
            for (const h of errorHandlers)
              h(new Error(`non-JSON line from agent: ${String(err)}`));
            return;
          }
          push?.(groupChunks(parsed));
        }),
        listen<string>(`acp_stderr:${spawned.connectionId}`, (e) => {
          options.onStderr?.(e.payload);
        }),
        listen<AcpExit>(`acp_closed:${spawned.connectionId}`, (e) => {
          // The exit payload is the only post-mortem that survives: the Rust
          // side evicts the connection on exit, so `acp_stderr_tail` returns
          // "unknown connection" from here on (see docs/acp-recon.md).
          if (e.payload?.code !== 0) {
            const tail = (e.payload?.stderr ?? []).slice(-5).join("\n");
            for (const h of errorHandlers)
              h(
                new Error(
                  `agent exited with code ${e.payload?.code}${tail ? `:\n${tail}` : ""}`,
                ),
              );
          }
          close?.();
          connectionId = null;
          for (const h of closeHandlers) h();
          teardown();
        }),
      ]);

      const writable = new WritableStream<AcpMessage>({
        async write(message) {
          if (!connectionId) throw new Error("acp connection is closed");
          await invoke("acp_send", {
            connectionId,
            message: JSON.stringify(message),
          });
        },
      });

      return { readable, writable };
    },

    disconnect() {
      const id = connectionId;
      connectionId = null;
      teardown();
      if (id) void invoke("acp_close", { connectionId: id }).catch(() => {});
    },

    onClose(handler) {
      closeHandlers.add(handler);
      return () => closeHandlers.delete(handler);
    },

    onError(handler) {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    },
  };
}
