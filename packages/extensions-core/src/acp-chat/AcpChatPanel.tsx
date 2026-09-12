/**
 * **Spike (docs/acp-recon.md) — not a shipped surface.** A center-dock panel
 * that runs a real ACP agent and renders the conversation, to answer whether
 * an ACP RFC is worth the effort before any SDK surface is designed.
 *
 * What is deliberately borrowed vs. owned:
 *
 * - **Borrowed** (`@acp-components/react`, MIT, v0.1.0): the protocol client,
 *   the session/streaming/tool-call/permission state, and the transcript
 *   components. Re-implementing those is the expensive part and is not what
 *   this spike is trying to learn.
 * - **Owned**: the transport (Silo's own piped-stdio Rust commands, via the
 *   host's `createAcpTransport`), the chrome, and the theming bridge. Those
 *   are the parts a real implementation must own regardless.
 *
 * ## Chrome
 *
 * The panel wears **Silo's** chrome, not the library's: the same `Breadcrumb`
 * the terminal panel uses for its cwd line, and one composer box that holds
 * the prompt input and every per-turn control (harness, mode, model). The
 * library's own chat header and footer are hidden in CSS — its
 * `SessionConfigPanel` is re-rendered inside our composer box instead, so the
 * controls are where the user is already typing rather than in a separate
 * strip below.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { DockPanelProps, ExtensionContext } from "@silo-code/sdk";
import { createAcpTransport } from "@silo-code/extension-host/internal";
import {
  AcpProvider,
  ChatView,
  PermissionDialog,
  I18nProvider,
  SessionConfigPanel,
  useSessions,
  useConnectionStatus,
  type AgentConfig,
} from "@acp-components/react";
import { Breadcrumb } from "../editor/Breadcrumb";
import "@acp-components/react/styles.css";
import "./acp-theme.css";

export interface AcpChatPanelParams {
  /** Binary to run. Defaults to the one provider Spike A verified end to end. */
  command?: string;
  /** argv, not a shell string — ACP execs a pipe-connected child. */
  args?: string[];
  title?: string;
  /** Which harness this panel is bound to, so a restart restores the same one. */
  presetId?: string;
  /**
   * The agent's own session id, persisted so the conversation survives a
   * restart. The agent process does **not** survive — it is a piped child of
   * the app — but the agent keeps the transcript on its own side, so a fresh
   * process can `session/load` this id and the context comes back. Verified
   * against `claude-acp` and `cursor` by killing the process outright and
   * asking for a fact from before the kill (see docs/acp-recon.md, Spike D).
   */
  sessionId?: string;
}

/** Silo's active theme reduced to the light/dark axis the library understands. */
function resolveColorScheme(ctx: ExtensionContext): "dark" | "light" {
  try {
    return ctx.theme.resolve(ctx.theme.getState().activeId).colorScheme;
  } catch {
    // A custom theme that fails to resolve should not blank the panel.
    return "dark";
  }
}

/** Agents the spike offers. Hardcoded on purpose: profile integration is a
 * design question for the RFC, not something to guess at here. Both were
 * probed for real — see the recon doc's capability table. */
const PRESETS: Record<
  string,
  { label: string; command: string; args: string[] }
> = {
  cursor: { label: "Cursor", command: "cursor-agent", args: ["acp"] },
  claude: {
    label: "Claude",
    command: "npx",
    args: ["-y", "@agentclientprotocol/claude-agent-acp@0.75.1"],
  },
};

export function AcpChatPanel({
  api,
  params,
  ctx,
}: DockPanelProps<AcpChatPanelParams> & { ctx: ExtensionContext }) {
  const ws = ctx.workspaces.getState();
  const cwd = ws.all.find((w) => w.id === ws.activeId)?.folder ?? "";
  const [presetId, setPresetId] = useState<string>(
    () => params.presetId ?? "cursor",
  );
  const preset = PRESETS[presetId]!;
  const command = params.command ?? preset.command;
  const args = params.args ?? preset.args;
  const [stderr, setStderr] = useState<string[]>([]);

  // The library keeps its own light/dark palettes, and even though the CSS
  // above overrides every colour it defines, `theme` still drives the
  // `data-acp-theme` attribute that its own rules key on — so it has to agree
  // with Silo's active theme or any token we haven't mapped resolves against
  // the wrong side. Followed live: switching themes should not require
  // reopening the panel.
  const [colorScheme, setColorScheme] = useState<"dark" | "light">(() =>
    resolveColorScheme(ctx),
  );
  useEffect(() => {
    const sub = ctx.theme.subscribe(() =>
      setColorScheme(resolveColorScheme(ctx)),
    );
    return () => sub.dispose();
  }, [ctx]);

  // The live transport, so it can be torn down. Without this the agent
  // subprocess outlives the panel: closing the tab, switching providers, or
  // reloading the webview each leaked a `cursor-agent` (ten of them piled up
  // during one afternoon of iterating).
  const transportRef = useRef<{ disconnect(): void } | null>(null);
  useEffect(
    () => () => {
      transportRef.current?.disconnect();
      transportRef.current = null;
    },
    [],
  );

  // One transport per (agent, cwd). Rebuilding it on every render would spawn
  // a new agent process each time — the reason this is a memo and not a plain
  // call. `presetId` is in the key so switching providers reconnects.
  const agents: AgentConfig[] = useMemo(() => {
    // Switching providers replaces the transport; retire the old one first.
    transportRef.current?.disconnect();
    const transport = createAcpTransport({
      command,
      args,
      cwd,
      onStderr: (line) => setStderr((prev) => [...prev.slice(-40), line]),
    });
    transportRef.current = transport;
    return [
      {
        // Per-preset id, not a constant: the library keys connection and
        // session state by agent id, so reusing one id across harnesses left
        // the new connection wearing the old one's state.
        id: `silo-acp-${presetId}`,
        name: preset.label,
        // The host's transport is typed structurally so the host takes no
        // dependency on this PoC library; this cast is that seam. Narrower
        // than it looks — the shapes match except that the host types a
        // message as a plain object where the SDK types it as the
        // `AnyMessage` request/response/notification union.
        transport: {
          type: "custom",
          transport,
        } as unknown as AgentConfig["transport"],
      },
    ];
  }, [command, args, cwd, preset.label, presetId]);

  useEffect(() => {
    api.setTitle(params.title ?? `Agent: ${preset.label}`);
  }, [api, params.title, preset.label]);

  return (
    <div className="acp-chat-root">
      {/* Same crumbs the terminal panel shows, so an agent tab and a terminal
          tab read as the same kind of thing. */}
      <div className="acp-chat-toolbar">
        <Breadcrumb
          filePath={cwd || null}
          workspaceFolder={cwd}
          leafIcon="folder"
        />
      </div>
      <I18nProvider>
        {/* Keyed on the harness so switching tears the whole session subtree
            down and rebuilds it. Without this the provider kept the previous
            agent's connection state and `SessionHost`'s "already started"
            guard stayed set, so picking a different harness spawned nothing
            and left the dead session on screen. */}
        <AcpProvider
          key={presetId}
          agents={agents}
          defaultCwd={cwd}
          theme={colorScheme}
        >
          <SessionHost
            stderr={stderr}
            cwd={cwd}
            agentId={`silo-acp-${presetId}`}
            presetId={presetId}
            restoreSessionId={
              params.presetId === presetId ? params.sessionId : undefined
            }
            onSessionId={(id) =>
              api.updateParameters({ presetId, sessionId: id })
            }
            onPresetChange={(id) => {
              setStderr([]);
              // A session id belongs to the harness that issued it — drop it
              // when switching, or the new agent is handed a stranger's id.
              api.updateParameters({ presetId: id, sessionId: undefined });
              setPresetId(id);
            }}
          />
        </AcpProvider>
      </I18nProvider>
    </div>
  );
}

/**
 * Creates one session as soon as the agent connects, then renders it.
 *
 * Split out because `useSessions` / `useConnectionStatus` must run *inside*
 * `AcpProvider`, and because the connect→create→render sequence is the part
 * most likely to need iterating as the spike answers questions.
 */
function SessionHost({
  cwd,
  stderr,
  agentId,
  presetId,
  restoreSessionId,
  onSessionId,
  onPresetChange,
}: {
  cwd: string;
  stderr: string[];
  agentId: string;
  presetId: string;
  restoreSessionId?: string;
  onSessionId: (id: string) => void;
  onPresetChange: (id: string) => void;
}) {
  const { createSession, loadSession, activeSessionId, setActiveSession } =
    useSessions();
  const status = useConnectionStatus(agentId);
  const [error, setError] = useState<string | null>(null);
  // Guards against React 18 double-invoke and status churn spawning several
  // sessions against one connection.
  const started = useRef(false);

  useEffect(() => {
    if (!status.isConnected || started.current) return;
    started.current = true;

    // Restore before creating. The agent process died with the app, but the
    // agent keeps the transcript on its side, so loading the persisted id
    // brings the conversation back. Falling back to a new session on failure
    // matters: an id can be stale (history pruned, a different machine), and
    // a panel that refuses to open because an old session vanished would be
    // worse than one that quietly starts fresh.
    const restore = restoreSessionId
      ? loadSession(restoreSessionId as never, cwd).then(() => restoreSessionId)
      : Promise.reject(new Error("no session to restore"));

    restore
      .catch(() => createSession(agentId, cwd))
      .then((id) => {
        setActiveSession(id as never);
        onSessionId(id);
      })
      .catch((e: unknown) => setError(String(e)));
  }, [
    status.isConnected,
    createSession,
    loadSession,
    cwd,
    agentId,
    restoreSessionId,
    onSessionId,
    setActiveSession,
  ]);

  if (status.hasError || error) {
    return (
      <div className="acp-chat-notice">
        <div>Could not start the agent.</div>
        {error ? <pre>{error}</pre> : null}
        {stderr.length > 0 ? <pre>{stderr.slice(-10).join("\n")}</pre> : null}
      </div>
    );
  }

  if (!activeSessionId) {
    return (
      <div className="acp-chat-notice">
        {status.isConnecting || status.isConnected
          ? "Starting a session…"
          : "Connecting to the agent…"}
      </div>
    );
  }

  return (
    <div className="acp-chat-body">
      <ChatView sessionId={activeSessionId as never} />
      {/* The control strip, rendered *after* ChatView and pulled up into the
          composer's box by CSS. The library's own footer is hidden, so this is
          the single row of per-turn controls: which harness, then whatever
          that agent exposes (mode, model). */}
      <div className="acp-chat-controls">
        <select
          className="acp-chat-controls__harness"
          value={presetId}
          onChange={(e) => onPresetChange(e.target.value)}
          aria-label="Agent harness"
        >
          {Object.entries(PRESETS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.label}
            </option>
          ))}
        </select>
        <SessionConfigPanel sessionId={activeSessionId as never} />
      </div>
      {/* Finding 1 in the recon doc still applies — an agent is free to skip
          this and touch the filesystem directly, as Cursor did. */}
      <PermissionDialog sessionId={activeSessionId as never} />
    </div>
  );
}
