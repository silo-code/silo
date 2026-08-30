import { useEffect, useState } from "react";
import { NoWorkspaceError, PathDeniedError } from "@silo-code/sdk";
import type {
  Extension,
  ExtensionContext,
  FileChangeEvent,
} from "@silo-code/sdk";

/**
 * Storage Demo — a live demonstration of `ctx.storage.globalDir()` /
 * `workspaceDir()` (RFC 0032): the filesystem counterpart to `ctx.storage`'s
 * key/value bags.
 *
 * **Declares no permissions at all** — that's the point. Every operation below
 * goes through `ctx.files` against a path returned by `globalDir()` or
 * `workspaceDir()`, with no `fs:read`/`fs:write` in the manifest. Installing
 * this extension shows no consent prompt, because it never asks for anything;
 * its own storage directory is inside its sandbox unconditionally.
 *
 * What each section proves:
 *   1. Paths       — the real on-disk locations, identity-keyed and per-extension.
 *   2. Global dir  — write/read/list/delete with zero permissions declared.
 *   3. Workspace dir — same, scoped to the active workspace; `NoWorkspaceError`
 *      (not `PathDeniedError`) when none is open.
 *   4. Sandbox boundary — the lift stops exactly at these two directories: a
 *      write to an unrelated path is still denied (proves R4 — nothing else
 *      widened) and a *sibling* path that merely shares the directory's string
 *      prefix is still denied (proves R3's containment test).
 *   5. Watch — a live event log on `<globalDir>/cache`, a subfolder name the
 *      host's workspace-watcher noise filter would normally drop silently
 *      (RFC 0032 R8). Writing there and seeing the event land is the proof.
 */

const STYLE_ID = "silo-storage-demo-styles";
const STYLES = `
.stordemo-scroll { height: 100%; overflow-y: auto; font-family: var(--silo-font-ui); }
.stordemo-section {
  padding: 10px 12px;
  border-bottom: 1px solid var(--silo-color-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stordemo-title {
  font-size: var(--silo-font-size-sm);
  font-weight: 600;
  color: var(--silo-color-text-hi);
}
.stordemo-tag { color: var(--silo-color-text-lo); font-weight: 400; }
.stordemo-blurb { font-size: var(--silo-font-size-sm); color: var(--silo-color-text-lo); }
.stordemo-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.stordemo-btn {
  font-family: var(--silo-font-ui);
  font-size: var(--silo-font-size-sm);
  color: var(--silo-button-text);
  background: var(--silo-button-bg);
  border: 1px solid var(--silo-color-border);
  border-radius: var(--silo-radius-md);
  padding: 4px 10px;
  cursor: pointer;
}
.stordemo-btn:hover { background: var(--silo-button-bg-hover); }
.stordemo-btn:disabled { opacity: 0.6; cursor: default; }
.stordemo-out {
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
.stordemo-path {
  font-family: var(--silo-font-mono);
  font-size: var(--silo-font-size-sm);
  color: var(--silo-color-text);
  word-break: break-all;
}
.stordemo-ok { color: var(--silo-color-success, #4caf7d); }
.stordemo-warn { color: var(--silo-color-danger, #e5836b); }
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

/** Format any thrown value, naming the specific error class when it matters. */
function fmtError(err: unknown): string {
  if (err instanceof NoWorkspaceError)
    return `NoWorkspaceError: ${err.message}`;
  if (err instanceof PathDeniedError) return `PathDeniedError: ${err.message}`;
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

interface Action {
  label: string;
  run: () => Promise<string>;
}

function Section({
  title,
  tag,
  blurb,
  actions,
  extra,
}: {
  title: string;
  tag: string;
  blurb: string;
  actions: Action[];
  extra?: React.ReactNode;
}) {
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const run = (action: Action) => {
    setBusy(true);
    setOut("running…");
    action
      .run()
      .then(setOut)
      .catch((e) => setOut(fmtError(e)))
      .finally(() => setBusy(false));
  };
  return (
    <div className="stordemo-section">
      <div className="stordemo-title">
        {title} <span className="stordemo-tag">· {tag}</span>
      </div>
      <div className="stordemo-blurb">{blurb}</div>
      <div className="stordemo-buttons">
        {actions.map((a) => (
          <button
            key={a.label}
            className="stordemo-btn"
            disabled={busy}
            onClick={() => run(a)}
          >
            {a.label}
          </button>
        ))}
      </div>
      {extra}
      {out && <pre className="stordemo-out">{out}</pre>}
    </div>
  );
}

/** Section 1 — resolve and display both directories' real on-disk paths. */
function PathsSection({ ctx }: { ctx: ExtensionContext }) {
  const [globalPath, setGlobalPath] = useState<string>("(not resolved yet)");
  const [wsPath, setWsPath] = useState<string>("(not resolved yet)");

  const refresh = () => {
    ctx.storage
      .globalDir()
      .then(setGlobalPath)
      .catch((e) => setGlobalPath(fmtError(e)));
    ctx.storage
      .workspaceDir()
      .then(setWsPath)
      .catch((e) => setWsPath(fmtError(e)));
  };
  useEffect(refresh, [ctx]);

  return (
    <div className="stordemo-section">
      <div className="stordemo-title">
        Paths{" "}
        <span className="stordemo-tag">
          · ctx.storage.globalDir / workspaceDir
        </span>
      </div>
      <div className="stordemo-blurb">
        The real, identity-keyed on-disk directories this extension owns.
        Compare against{" "}
        <code>
          ~/.config/silo[-&lt;identity&gt;]/extension-storage/silo.storage-demo/
        </code>{" "}
        in a terminal — outside Silo entirely — to confirm they match.
      </div>
      <div className="stordemo-buttons">
        <button className="stordemo-btn" onClick={refresh}>
          Refresh paths
        </button>
      </div>
      <div className="stordemo-path">global: {globalPath}</div>
      <div className="stordemo-path">workspace: {wsPath}</div>
    </div>
  );
}

/** List a directory's entries as a compact multi-line summary, or "(empty)". */
async function listSummary(
  ctx: ExtensionContext,
  dir: string,
): Promise<string> {
  const entries = await ctx.files.readDir(dir);
  if (entries.length === 0) return "(empty)";
  return entries
    .map((e) => `${e.isDir ? "d" : "f"} ${e.name} (${e.size}B)`)
    .join("\n");
}

/** Sections 2 & 3 — write/read/list/delete against one storage scope. */
function ScopeSection({
  ctx,
  title,
  tag,
  blurb,
  getDir,
}: {
  ctx: ExtensionContext;
  title: string;
  tag: string;
  blurb: string;
  getDir: () => Promise<string>;
}) {
  const fileName = "notes.log";

  const actions: Action[] = [
    {
      label: "Append a line",
      run: async () => {
        const dir = await getDir();
        const path = `${dir}/${fileName}`;
        const existing = (await ctx.files.pathExists(path))
          ? await ctx.files.readText(path)
          : "";
        const line = `${new Date().toISOString()} — hello from Storage Demo\n`;
        await ctx.files.writeText(path, existing + line);
        return `wrote to ${path} (no fs:write declared — allowed because it's this extension's own directory)`;
      },
    },
    {
      label: "Read file",
      run: async () => {
        const dir = await getDir();
        const path = `${dir}/${fileName}`;
        if (!(await ctx.files.pathExists(path)))
          return "(no file yet — append a line first)";
        return await ctx.files.readText(path);
      },
    },
    {
      label: "List directory",
      run: async () => {
        const dir = await getDir();
        return await listSummary(ctx, dir);
      },
    },
    {
      label: "Delete file",
      run: async () => {
        const dir = await getDir();
        const path = `${dir}/${fileName}`;
        if (!(await ctx.files.pathExists(path))) return "(nothing to delete)";
        await ctx.files.delete(path);
        return `deleted ${path}`;
      },
    },
  ];

  return <Section title={title} tag={tag} blurb={blurb} actions={actions} />;
}

/** Section 4 — the sandbox boundary: what the lift does and doesn't cover. */
function BoundarySection({ ctx }: { ctx: ExtensionContext }) {
  const actions: Action[] = [
    {
      label: "Write outside any storage dir (expect denied)",
      run: async () => {
        const home = await ctx.system.homeDir();
        const path = `${home}/silo-storage-demo-outside.probe`;
        try {
          await ctx.files.writeText(path, "should not land");
          return `⚠️ UNEXPECTEDLY allowed — ${path}. This extension declares no fs:write; report a bug.`;
        } catch (err) {
          return `✅ correctly blocked — ${fmtError(err)}`;
        }
      },
    },
    {
      label: "Write to a sibling that shares the dir's prefix (expect denied)",
      run: async () => {
        const dir = await ctx.storage.globalDir();
        // e.g. ".../silo.storage-demo/global" → ".../silo.storage-demo/global-evil"
        const sibling = `${dir}-evil/probe.txt`;
        try {
          await ctx.files.writeText(sibling, "should not land");
          return `⚠️ UNEXPECTEDLY allowed — ${sibling}. Prefix containment is broken; report a bug.`;
        } catch (err) {
          return `✅ correctly blocked — ${fmtError(err)}`;
        }
      },
    },
    {
      label:
        'Run a command with cwd in the storage dir (expect denied — needs "process")',
      run: async () => {
        const dir = await ctx.storage.globalDir();
        try {
          await ctx.process.exec("pwd", [], { cwd: dir });
          return `⚠️ UNEXPECTEDLY allowed — the ctx.files lift must not reach ctx.process. Report a bug.`;
        } catch (err) {
          return `✅ correctly blocked — ${fmtError(err)} (the storage lift widens ctx.files only, not process)`;
        }
      },
    },
  ];
  return (
    <Section
      title="Sandbox boundary"
      tag="R3 / R4"
      blurb="This extension's storage directories are inside its ctx.files sandbox — nothing else is. Every check below should report ✅."
      actions={actions}
    />
  );
}

/** Section 5 — watch a `cache/` subfolder inside the global dir; log live events. */
function WatchSection({ ctx }: { ctx: ExtensionContext }) {
  const [watching, setWatching] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [dispose, setDispose] = useState<(() => void) | null>(null);

  const startWatch = async () => {
    const global = await ctx.storage.globalDir();
    const cacheDir = `${global}/cache`;
    await ctx.files.createDir(cacheDir);
    const handle = ctx.files.watch(cacheDir, (e: FileChangeEvent) => {
      setEvents((prev) =>
        [
          `${new Date().toLocaleTimeString()} ${e.kind}: ${e.paths.join(", ")}`,
          ...prev,
        ].slice(0, 8),
      );
    });
    setDispose(() => () => handle.dispose());
    setWatching(true);
  };

  const stopWatch = () => {
    dispose?.();
    setDispose(null);
    setWatching(false);
  };

  const writeToCache = async () => {
    const global = await ctx.storage.globalDir();
    const cacheDir = `${global}/cache`;
    await ctx.files.createDir(cacheDir);
    await ctx.files.writeText(
      `${cacheDir}/probe-${Date.now()}.txt`,
      "watch me",
    );
  };

  useEffect(() => () => dispose?.(), [dispose]);

  return (
    <div className="stordemo-section">
      <div className="stordemo-title">
        Watch a <code>cache/</code> subfolder{" "}
        <span className="stordemo-tag">· R8</span>
      </div>
      <div className="stordemo-blurb">
        A workspace watch silently drops events under <code>node_modules/</code>
        , <code>dist/</code>, <code>cache/</code>, etc. — the project-tree noise
        filter. Inside an extension's own storage directory that filter is off,
        so a subfolder named <code>cache/</code> still delivers events. Start
        watching, then write a file — an event should appear below.
      </div>
      <div className="stordemo-buttons">
        <button
          className="stordemo-btn"
          disabled={watching}
          onClick={() => void startWatch()}
        >
          Start watching {"<globalDir>/cache"}
        </button>
        <button
          className="stordemo-btn"
          disabled={!watching}
          onClick={stopWatch}
        >
          Stop watching
        </button>
        <button
          className="stordemo-btn"
          disabled={!watching}
          onClick={() => void writeToCache()}
        >
          Write a file to cache/
        </button>
      </div>
      <pre className="stordemo-out">
        {events.length ? events.join("\n") : "(no events yet)"}
      </pre>
    </div>
  );
}

function StorageDemo({ ctx }: { ctx: ExtensionContext }) {
  return (
    <div className="stordemo-scroll">
      <PathsSection ctx={ctx} />
      <ScopeSection
        ctx={ctx}
        title="Global storage"
        tag="ctx.storage.globalDir()"
        blurb="Shared across every workspace. Created on first call; no fs:* permission needed."
        getDir={() => ctx.storage.globalDir()}
      />
      <ScopeSection
        ctx={ctx}
        title="Workspace storage"
        tag="ctx.storage.workspaceDir()"
        blurb="Scoped to the active workspace. With none open this rejects with NoWorkspaceError — try it."
        getDir={() => ctx.storage.workspaceDir()}
      />
      <BoundarySection ctx={ctx} />
      <WatchSection ctx={ctx} />
    </div>
  );
}

const PANEL_ID = "storage-demo";
const OPEN_COMMAND = "silo.storage-demo.open";

export const extension: Extension = {
  id: "silo.storage-demo",
  activate(ctx) {
    injectStyles();
    ctx.registerSidePanel({
      id: PANEL_ID,
      location: "right",
      title: "Storage Demo",
      order: 65,
      lazyMount: true,
      component: () => <StorageDemo ctx={ctx} />,
    });
    ctx.registerCommand({
      id: OPEN_COMMAND,
      label: "Open Storage Demo",
      run: () => ctx.layout.revealSidePanel(PANEL_ID),
    });
  },
  deactivate() {
    removeStyles();
  },
};
