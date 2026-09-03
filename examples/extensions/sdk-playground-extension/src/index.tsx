import { useEffect, useRef, useState } from "react";
import type { Extension, ExtensionContext } from "@silo-code/sdk";

/* -------------------------------------------------------------------------- */
/* SDK Playground — a live demo panel for the newest `ctx` APIs. Each section  */
/* exercises one item from the SDK-surface plan; press its button(s) and read   */
/* the result inline. Every call goes through the public `@silo-code/sdk`, so   */
/* this doubles as proof the surface actually works from a real extension.      */
/* -------------------------------------------------------------------------- */

const PANEL_ID = "sdk-playground";
const OPEN_COMMAND = "silo.sdk-playground.open";
const PROFILES_COMMAND = "silo.sdk-playground.agentProfiles";
const STYLE_ID = "silo-sdk-playground-styles";

// Consume only `--silo-*` design tokens so the panel themes correctly and
// scales with uiFontSize. (Runtime extensions inject their own <style>.)
const STYLES = `
.sdkpg-scroll { height: 100%; overflow-y: auto; font-family: var(--silo-font-ui); }
.sdkpg-section {
  padding: 10px 12px;
  border-bottom: 1px solid var(--silo-color-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sdkpg-title {
  font-size: var(--silo-font-size-sm);
  font-weight: 600;
  color: var(--silo-color-text-hi);
}
.sdkpg-tag { color: var(--silo-color-text-lo); font-weight: 400; }
.sdkpg-blurb { font-size: var(--silo-font-size-sm); color: var(--silo-color-text-lo); }
.sdkpg-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.sdkpg-btn {
  font-family: var(--silo-font-ui);
  font-size: var(--silo-font-size-sm);
  color: var(--silo-button-text);
  background: var(--silo-button-bg);
  border: 1px solid var(--silo-color-border);
  border-radius: var(--silo-radius-md);
  padding: 4px 10px;
  cursor: pointer;
}
.sdkpg-btn:hover { background: var(--silo-button-bg-hover); }
.sdkpg-out {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--silo-font-mono);
  font-size: var(--silo-font-size-sm);
  color: var(--silo-color-text);
  background: var(--silo-color-input-bg);
  border-radius: var(--silo-radius-md);
  padding: 6px 8px;
  min-height: 1.4em;
}
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}
function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

/** The active workspace folder, or null when none is open. */
function activeFolder(ctx: ExtensionContext): string | null {
  const ws = ctx.workspaces.getState();
  return ws.all.find((w) => w.id === ws.activeId)?.folder ?? null;
}

/** Format any thrown value for the output box (surfaces AbortError etc. by name). */
function fmtError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

interface Action {
  label: string;
  run: () => Promise<string>;
}

interface SectionDef {
  item: string;
  title: string;
  blurb: string;
  actions: Action[];
}

function Section({ def, extra }: { def: SectionDef; extra?: React.ReactNode }) {
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const runAction = (action: Action) => {
    setBusy(true);
    setOut("running…");
    action
      .run()
      .then(setOut)
      .catch((e) => setOut(fmtError(e)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="sdkpg-section">
      <div className="sdkpg-title">
        {def.title} <span className="sdkpg-tag">· {def.item}</span>
      </div>
      <div className="sdkpg-blurb">{def.blurb}</div>
      <div className="sdkpg-buttons">
        {def.actions.map((a) => (
          <button
            key={a.label}
            className="sdkpg-btn"
            disabled={busy}
            onClick={() => runAction(a)}
          >
            {a.label}
          </button>
        ))}
      </div>
      {extra}
      {out && <pre className="sdkpg-out">{out}</pre>}
    </div>
  );
}

function Playground({ ctx }: { ctx: ExtensionContext }) {
  // Shared across B7 buttons: the last terminal this panel created.
  const lastTerminal = useRef<string | null>(null);
  // Live onDidSave feed (B6).
  const [saves, setSaves] = useState<string[]>([]);
  useEffect(() => {
    const sub = ctx.editors.onDidSave((e) => {
      setSaves((prev) => [e.filePath, ...prev].slice(0, 5));
    });
    return () => sub.dispose();
  }, [ctx]);

  const sections: SectionDef[] = [
    {
      item: "B6",
      title: "Document access",
      blurb:
        "Read the focused editor's live text and dirty flag. onDidSave events stream below (save a file to see them).",
      actions: [
        {
          label: "Read active editor",
          run: async () => {
            const active = ctx.editors.getState().active;
            if (!active) return "No active editor — open a text file first.";
            const text = await ctx.editors.getText(active.editorId);
            if (text === undefined) return "Active tab is not text-backed.";
            const dirty = ctx.editors.isDirty(active.editorId);
            const preview = text.slice(0, 120);
            return `${dirty ? "(dirty) " : ""}${text.length} chars\n${preview}`;
          },
        },
      ],
    },
    {
      item: "B7",
      title: "Terminal",
      blurb:
        "Create a terminal, type a command into it (force-spawns the PTY), rename it, then close it.",
      actions: [
        {
          label: "Create + run echo",
          run: async () => {
            const t = ctx.terminals.create({});
            if (!t) return "No active workspace to create a terminal in.";
            lastTerminal.current = t.id;
            ctx.terminals.focus(t.id); // reveal the new tab
            // Type into it once its PTY has spawned. Sending the instant after
            // create() would race the tab's lazy mount and could land in a
            // hidden session, so wait a beat for the mounted session to exist.
            window.setTimeout(
              () =>
                ctx.terminals.sendText(t.id, "echo hello from sdk-playground"),
              700,
            );
            return `opened ${t.id} — running "echo …" in it`;
          },
        },
        {
          label: "Rename → demo",
          run: async () => {
            const id = lastTerminal.current;
            if (!id) return "Create one first.";
            ctx.terminals.rename(id, "demo");
            return `renamed ${id} → "demo"`;
          },
        },
        {
          label: "Close",
          run: async () => {
            const id = lastTerminal.current;
            if (!id) return "Create one first.";
            ctx.terminals.close(id);
            lastTerminal.current = null;
            return `closed ${id}`;
          },
        },
      ],
    },
    {
      item: "B8",
      title: "Files: writeBytes / stat / copy",
      blurb:
        "Write raw bytes, stat the file, copy it, read the copy back — then clean both up.",
      actions: [
        {
          label: "Round-trip bytes",
          run: async () => {
            const folder = activeFolder(ctx);
            if (!folder) return "No active workspace.";
            const p = `${folder}/.silo-playground-demo.bin`;
            const copy = `${p}.copy`;
            await ctx.files.writeBytes(p, new Uint8Array([83, 73, 76, 79]));
            const st = await ctx.files.stat(p);
            await ctx.files.copy(p, copy);
            const back = await ctx.files.readBytes(copy);
            const text = new TextDecoder().decode(new Uint8Array(back));
            await ctx.files.delete(p);
            await ctx.files.delete(copy);
            return `wrote 4 bytes · stat.size=${st?.size} · copy read back "${text}" · cleaned up`;
          },
        },
      ],
    },
    {
      item: "B9",
      title: "exec: env / timeout / abort",
      blurb:
        "Pass extra env, then prove a timeout and an AbortSignal both reject with AbortError (and kill the process).",
      actions: [
        {
          label: "env → printenv",
          run: async () => {
            const r = await ctx.process.exec("printenv", ["GREETING"], {
              env: { GREETING: "hello-from-b9" },
            });
            return `stdout="${r.stdout.trim()}" code=${r.code}`;
          },
        },
        {
          label: "timeout 500ms (sleep 5)",
          run: async () => {
            try {
              await ctx.process.exec("sleep", ["5"], { timeoutMs: 500 });
              return "did not time out?!";
            } catch (e) {
              return `rejected → ${fmtError(e)}`;
            }
          },
        },
        {
          label: "abort after 300ms",
          run: async () => {
            const c = new AbortController();
            setTimeout(() => c.abort(), 300);
            try {
              await ctx.process.exec("sleep", ["5"], { signal: c.signal });
              return "did not abort?!";
            } catch (e) {
              return `rejected → ${fmtError(e)}`;
            }
          },
        },
      ],
    },
    {
      item: "B11",
      title: "Cancellable search",
      blurb:
        "Run a content search, and prove an aborted search rejects with AbortError.",
      actions: [
        {
          label: "search 'function'",
          run: async () => {
            const res = await ctx.search.search("function", { maxResults: 50 });
            return `${res.totalMatches} matches in ${res.files.length} files${res.truncated ? " (truncated)" : ""}`;
          },
        },
        {
          label: "search + cancel",
          run: async () => {
            const c = new AbortController();
            const p = ctx.search.search("the", { signal: c.signal });
            c.abort();
            try {
              await p;
              return "not cancelled?!";
            } catch (e) {
              return `cancelled → ${fmtError(e)}`;
            }
          },
        },
      ],
    },
    {
      item: "RFC 0033",
      title: "Agent Profiles: list + launch with a prompt",
      blurb:
        "Read the user's Agent Profiles, then start one with an opening prompt. A prompt Silo can't quote exactly is refused as a typed value rather than mangled — so every button below reports what actually came back, including the refusals.",
      actions: [
        {
          label: "list()",
          run: async () => {
            const profiles = ctx.agents.profiles.list();
            if (profiles.length === 0)
              return "No profiles — add one in Settings → Agents → Profiles.";
            return profiles
              .map(
                (p) =>
                  `${p.id}${p.isDefault ? " (default)" : ""} — ${p.label}` +
                  `\n    acceptsPrompt: ${p.acceptsPrompt}`,
              )
              .join("\n");
          },
        },
        {
          label: "launch with a prompt",
          run: async () => {
            const target = ctx.agents.profiles
              .list()
              .find((p) => p.acceptsPrompt);
            if (!target)
              return "No profile whose agent can take an opening prompt.";
            // Deliberately full of things a shell would otherwise interpret —
            // the payload is quoted, never escaped, so all of it is literal.
            const result = ctx.agents.profiles.launch({
              profileId: target.id,
              prompt:
                "say hello and nothing else — literal test: $HOME `date` $(uname) 'quoted' \"double\"",
              activate: false,
            });
            return result.ok
              ? `launched ${target.id} → terminal ${result.terminalId}`
              : `refused: ${result.refusal}`;
          },
        },
        {
          label: "refusal: too-large",
          run: async () => {
            const result = ctx.agents.profiles.launch({
              prompt: "x".repeat(64 * 1024),
              activate: false,
            });
            return result.ok
              ? `unexpectedly launched ${result.terminalId}`
              : `refused: ${result.refusal}`;
          },
        },
        {
          label: "refusal: no-profile",
          run: async () => {
            const result = ctx.agents.profiles.launch({
              profileId: "definitely-not-a-profile",
              prompt: "hi",
              activate: false,
            });
            return result.ok
              ? `unexpectedly launched ${result.terminalId}`
              : `refused: ${result.refusal}`;
          },
        },
      ],
    },
    {
      item: "B14",
      title: "Binary fetch",
      blurb:
        "Download a binary body via ctx.net.fetchBytes (needs network access).",
      actions: [
        {
          label: "fetchBytes favicon",
          run: async () => {
            const r = await ctx.net.fetchBytes(
              "https://www.google.com/favicon.ico",
            );
            return `status=${r.status} · ${r.body.byteLength} bytes · type=${r.headers["content-type"] ?? "?"}`;
          },
        },
      ],
    },
  ];

  return (
    <div className="sdkpg-scroll">
      {sections.map((def) =>
        def.item === "B6" ? (
          <Section
            key={def.item}
            def={def}
            extra={
              <pre className="sdkpg-out">
                {saves.length
                  ? saves.map((f) => `saved: ${f}`).join("\n")
                  : "onDidSave: (save a file to see events)"}
              </pre>
            }
          />
        ) : (
          <Section key={def.item} def={def} />
        ),
      )}
    </div>
  );
}

export const extension: Extension = {
  id: "silo.sdk-playground",
  activate(ctx) {
    injectStyles();
    ctx.registerSidePanel({
      id: PANEL_ID,
      location: "right",
      title: "SDK Playground",
      order: 60,
      lazyMount: true,
      component: () => <Playground ctx={ctx} />,
    });
    ctx.registerCommand({
      id: OPEN_COMMAND,
      label: "Open SDK Playground",
      run: () => ctx.layout.revealSidePanel(PANEL_ID),
    });
    // The same `ctx.agents.profiles` battery the panel exposes as buttons, as
    // one command that writes its findings to this extension's Output channel.
    // Buttons need a human; this can be driven headlessly (by the dev
    // automation bridge, or a keybinding) and read back afterwards, which is
    // what makes the surface verifiable in the running app rather than only in
    // unit tests.
    ctx.registerCommand({
      id: PROFILES_COMMAND,
      label: "SDK Playground: exercise ctx.agents.profiles",
      run: () => {
        const profiles = ctx.agents.profiles.list();
        ctx.log.info(
          `list() → ${profiles.length} profile(s): ` +
            profiles
              .map(
                (p) =>
                  `${p.id}${p.isDefault ? "*" : ""}(acceptsPrompt=${p.acceptsPrompt})`,
              )
              .join(", "),
        );

        const tooLarge = ctx.agents.profiles.launch({
          prompt: "x".repeat(64 * 1024),
          activate: false,
        });
        ctx.log.info(`launch(oversized prompt) → ${JSON.stringify(tooLarge)}`);

        const missing = ctx.agents.profiles.launch({
          profileId: "definitely-not-a-profile",
          prompt: "hi",
          activate: false,
        });
        ctx.log.info(`launch(unknown profile) → ${JSON.stringify(missing)}`);

        const target = profiles.find((p) => p.acceptsPrompt);
        if (!target) {
          ctx.log.warn("no prompt-capable profile — skipping the real launch");
          return;
        }
        const launched = ctx.agents.profiles.launch({
          profileId: target.id,
          prompt:
            "say hello and nothing else — literal test: $HOME `date` $(uname) 'quoted' \"double\"",
          activate: false,
        });
        ctx.log.info(
          `launch(${target.id}, with prompt) → ${JSON.stringify(launched)}`,
        );
      },
    });
  },
  deactivate() {
    removeStyles();
  },
};
