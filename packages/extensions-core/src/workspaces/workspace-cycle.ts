import type { ExtensionContext } from "@silo-code/sdk";
import { setSwitcherSession } from "./workspace-switcher-session";

/**
 * macOS Cmd+Tab-style workspace cycling — a **module of core.workspaces** (it
 * was its own extension; folded in per ctx-domains.md, since core.workspaces is
 * a pure view/UX layer over the ctx.workspaces primitive, so there's no second
 * API to publish — cycling is just another behavior of the workspaces feature).
 *
 * Bindings (Cmd+Tab itself is reserved by macOS for app switching, so the chord
 * is Cmd+`, the OS convention for cycling windows *within* an app):
 *   - Cmd+`        → move the highlight toward the most-recently-used workspace
 *   - Cmd+Shift+`  → move it the other way
 *   - Esc          → cancel the session, switching nothing
 *
 * The interaction mirrors Cmd+Tab exactly: holding Cmd shows a popup (rendered
 * by the status item off `workspace-switcher-session`) and tapping ` walks the
 * highlight through the list; the workspace only actually **activates when Cmd
 * is released**. A quick tap-and-release therefore flips to the previous
 * workspace, while holding and tapping reaches progressively older ones.
 *
 * Ordering is **most-recently-used (MRU)**. The list is frozen for the duration
 * of a session (while Cmd is held) and the MRU is only re-promoted on release —
 * without that, every press would re-promote the landed workspace and you could
 * never reach past the top two.
 *
 * The keybinding registry is keydown-only, so the chord rides the normal
 * (rebindable) registry while a small keyup listener bounds the session and
 * commits the switch on release. All disposables register on
 * `ctx.subscriptions`, so this tears down with core.workspaces.
 */
export function registerWorkspaceCycle(ctx: ExtensionContext): void {
  // MRU stack of open workspace ids, most-recent first.
  let mru: string[] = [];
  // The MRU snapshot captured at session start; null when no session active.
  let frozen: string[] | null = null;
  let pointer = 0;
  // Whether a cmd/ctrl modifier is currently held — lets a no-modifier
  // invocation (e.g. a future command palette) commit immediately.
  let modifierDown = false;

  function activeId(): string | null {
    return ctx.workspaces.getState().activeId;
  }

  function moveToFront(id: string): void {
    mru = [id, ...mru.filter((x) => x !== id)];
  }

  // Seed the MRU from open workspaces, most-recently-opened first, with the
  // active workspace forced to the front.
  function seed(): void {
    const { open, activeId: active } = ctx.workspaces.getState();
    mru = [...open]
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
      .map((ws) => ws.id);
    if (active) moveToFront(active);
  }
  seed();

  // Keep MRU membership in sync with the set of open workspaces, and promote
  // the active workspace whenever it changes outside a cycle session (normal
  // sidebar click / open / close). During a session we deliberately do NOT
  // reorder — that is what lets holding the modifier reach older workspaces.
  const sub = ctx.workspaces.subscribe((s) => {
    const openIds = new Set(s.open.map((ws) => ws.id));
    mru = mru.filter((id) => openIds.has(id));
    for (const ws of s.open) if (!mru.includes(ws.id)) mru.push(ws.id);
    if (!frozen && s.activeId) moveToFront(s.activeId);
  });
  ctx.subscriptions.push(sub);

  // Reflect the frozen list + current highlight into the popup store. Names are
  // resolved live so a rename mid-session still reads correctly.
  function publishSession(): void {
    if (!frozen) {
      setSwitcherSession(null);
      return;
    }
    const all = ctx.workspaces.getState().all;
    const nameOf = (id: string) => all.find((w) => w.id === id)?.name ?? id;
    setSwitcherSession({
      entries: frozen.map((id) => ({ id, name: nameOf(id) })),
      selectedId: frozen[pointer],
    });
  }

  // End the session by activating the highlighted workspace (the Cmd-release
  // moment — this is the only place cycling actually switches), then re-promote
  // it to the front of the MRU for next time.
  function commit(): void {
    if (frozen) {
      const target = frozen[pointer];
      if (target && target !== activeId()) ctx.workspaces.activate(target);
    }
    const active = activeId();
    if (active) moveToFront(active);
    frozen = null;
    setSwitcherSession(null);
  }

  // End the session switching nothing (Esc, or focus lost with no choice made).
  function cancel(): void {
    frozen = null;
    setSwitcherSession(null);
  }

  function step(dir: 1 | -1): void {
    if (!frozen) {
      frozen = [...mru];
      const idx = frozen.indexOf(activeId() ?? "");
      pointer = idx === -1 ? 0 : idx;
    }
    if (frozen.length < 2) {
      frozen = null;
      return;
    }
    pointer = (pointer + dir + frozen.length) % frozen.length;
    publishSession();
    // Invoked without a held modifier (no release to wait for) → commit now.
    if (!modifierDown) commit();
  }

  ctx.subscriptions.push(
    ctx.registerCommand({
      id: "workspace.cycleForward",
      label: "Cycle to Next Workspace (Most Recent)",
      run: () => step(1),
    }),
  );
  ctx.subscriptions.push(
    ctx.registerCommand({
      id: "workspace.cycleBackward",
      label: "Cycle to Previous Workspace (Most Recent)",
      run: () => step(-1),
    }),
  );

  // ` and ~ are the same physical key; the keymap parses ` → Backquote and
  // matches Shift exactly, so forward is the unshifted Cmd+` and backward is
  // Cmd+Shift+` (which is literally Cmd+~) — mirroring macOS window cycling.
  ctx.subscriptions.push(
    ctx.registerKeybinding({
      id: "workspace.cycleForward.key",
      key: "cmd+`",
      command: "workspace.cycleForward",
    }),
  );
  ctx.subscriptions.push(
    ctx.registerKeybinding({
      id: "workspace.cycleBackward.key",
      key: "cmd+shift+`",
      command: "workspace.cycleBackward",
    }),
  );

  // The chord keydown is handled by the keybinding registry; these listeners
  // track the hold modifier, cancel on Esc, and commit the switch on release.
  // Esc is handled in the capture phase so it pre-empts any other Escape
  // handler (and is swallowed) while the switcher is up.
  function onKeyDown(e: KeyboardEvent): void {
    modifierDown = e.metaKey || e.ctrlKey;
    if (frozen && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  }
  function onKeyUp(e: KeyboardEvent): void {
    modifierDown = e.metaKey || e.ctrlKey;
    if (frozen && !modifierDown) commit();
  }
  function onBlur(): void {
    // OS-level cmd-tab away mid-cycle: drop the session without switching.
    if (frozen) cancel();
  }
  window.addEventListener("keydown", onKeyDown, true);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  ctx.subscriptions.push({
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    },
  });
}
