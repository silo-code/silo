// Integration test (Layer 2): drives the REAL running app over the automation
// RPC — real WKWebView + dockview + the host's focus plumbing. This is the
// regression contract for keyboard navigation on `feat/keyboard-focus-nav`: the
// user-standpoint behavior documented in `docs/keyboard-navigation.md`, asserted
// end-to-end so the planned `useFocusGroup` refactor (RFC 0012) can't silently
// regress it. The pure focus logic is covered by unit tests (`use-focus-group`
// incl. its shared index math, the rendered `Menu` guard, `side-pane-focus`, …);
// this layer pins that the wiring actually behaves that way in the live WebView.
//
// Requires the dev app running (`pnpm dev`); SKIPS otherwise, so `pnpm test` and
// CI stay green without one. `pnpm --filter silo test:it` is the command that
// expects a live app. Focus-sensitive: WebKit only reliably moves DOM focus
// (the programmatic focus the region cycle / roving list drive) while the window
// is frontmost, so — like `focus-handoff.it.test.ts` — the suite gates on
// `foreground()` and SKIPS when the window isn't visible + frontmost. A human
// keeping the Silo window in front still exercises it.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SiloAutomation } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();
const canFocus = available && (await silo.foreground());

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    "[keyboard-nav.it] no dev app reachable on :7878 — skipping. " +
      "Run `pnpm dev` to exercise this suite.",
  );
} else if (!canFocus) {
  // eslint-disable-next-line no-console
  console.warn(
    "[keyboard-nav.it] app window not foregrounded — skipping. Bring the " +
      "Silo window to the front and keep it frontmost to exercise this suite.",
  );
}

/** One workspace row's state, read straight off the live `ul.ws-list` DOM. */
interface WsRow {
  i: number;
  name: string;
  /** The active workspace (`li.ws-item.active`). */
  active: boolean;
  /** The keyboard ring is showing on this row (`[data-focus-visible]`). */
  focused: boolean;
  /** This row is the live `document.activeElement`. */
  hasFocus: boolean;
}

// Read every workspace row's nav-relevant state in one round-trip. The ring is
// state-driven via the `data-focus-visible` attribute useFocusGroup sets (not the
// `:focus` pseudo — WebKit won't repaint it for programmatic focus), which the
// host's CSS styles into the ring — so we assert on the attribute's presence.
const WS_ROWS_EXPR = `JSON.stringify(
  Array.from(document.querySelectorAll("ul.ws-list li.ws-item")).map((li, i) => ({
    i,
    name: (li.querySelector(".ws-name") || {}).textContent || "",
    active: li.classList.contains("active"),
    focused: li.hasAttribute("data-focus-visible"),
    hasFocus: li === document.activeElement,
  }))
)`;

// The open menu tree (root + any submenu share the `[data-silo-menu]` marker),
// with each row's label and whether it's the highlighted (`.active`) row.
const MENU_EXPR = `(() => {
  const m = document.querySelector("[data-silo-menu]");
  return JSON.stringify({
    open: !!m,
    items: m
      ? Array.from(m.querySelectorAll(".silo-menu-item")).map((it) => ({
          label: (it.querySelector(".silo-menu-label") || {}).textContent || "",
          active: it.classList.contains("active"),
        }))
      : [],
  });
})()`;

describe.skipIf(!canFocus)("keyboard navigation", () => {
  let priorActive: string | null;
  let folderA: string;
  let folderB: string;
  let wsA: string;
  let wsB: string;
  let editorBPanelId: string;

  const wsRows = async (): Promise<WsRow[]> =>
    JSON.parse(await silo.eval<string>(WS_ROWS_EXPR));
  const menuState = async (): Promise<{
    open: boolean;
    items: { label: string; active: boolean }[];
  }> => JSON.parse(await silo.eval<string>(MENU_EXPR));

  const focusedRow = async (): Promise<WsRow | undefined> =>
    (await wsRows()).find((r) => r.hasFocus);

  // The roving tabstop — the single `li.ws-item[tabindex="0"]` — and whether it
  // currently sits on the active row. When the list isn't focused the panel
  // parks the tabstop on the active workspace, but that's a state effect that
  // runs a tick AFTER a workspace switch, so we wait for it before cycling in.
  const rovingIsOnActive = (): Promise<boolean> =>
    silo.eval<boolean>(
      'document.querySelector(`ul.ws-list li.ws-item[tabindex="0"]`)?.classList.contains("active") ?? false',
    );

  // Enter the left dock the way a user does — via the region cycle
  // (Cmd+Alt+,/Cmd+Alt+. → `core.focusPreviousDock`). wsB is made active up front
  // so the landing row is deterministic (a prior test may have switched the
  // active workspace). We blur to a neutral spot so the cycle pivots on the
  // center and steps center → left, wait for the tabstop to re-park on the
  // active row, then cycle in — the region cycle drives DOM focus onto that row
  // (programmatic focus, which is exactly what makes the state-driven ring
  // necessary). Polled throughout because WebView focus settles a frame or two
  // after each step.
  async function enterWorkspaceList(): Promise<WsRow> {
    await silo.activateWorkspace(wsB);
    // A real workspace switch starts an editor focus-retry (PanelPane re-grabs
    // focus frame-by-frame for ~330ms to win dockview's shuffle). Let that frame
    // cap elapse before cycling in — otherwise it yanks focus back to the center
    // editor right after the region cycle lands it on the row. A user naturally
    // waits between switching workspaces and cycling docks; the test makes that
    // explicit. See use-focus-retry.ts (DEFAULT_CAP).
    await new Promise((r) => setTimeout(r, 450));
    await silo.eval(
      "document.activeElement && document.activeElement.blur && document.activeElement.blur()",
    );
    await expect
      .poll(rovingIsOnActive, { timeout: 3000, interval: 50 })
      .toBe(true);
    await expect
      .poll(
        async () => {
          if (await focusedRow()) return true;
          await silo.exec("core.focusPreviousDock");
          return !!(await focusedRow());
        },
        { timeout: 4000, interval: 100 },
      )
      .toBe(true);
    return (await focusedRow())!;
  }

  // Park focus on the row named `name` so a later step (ContextMenu key, Enter)
  // acts on it. Arrow-key *movement* is covered by its own test; here we just
  // need the row focused, so we focus it directly and re-try until it sticks —
  // robust to the odd dropped programmatic focus in the WebView. (Focusing a row
  // sets the panel's roving index to it, exactly as an arrow landing would.)
  async function navigateTo(name: string): Promise<WsRow> {
    const focusByName = `(() => {
      const li = Array.from(document.querySelectorAll("ul.ws-list li.ws-item"))
        .find((li) => ((li.querySelector(".ws-name") || {}).textContent) === ${JSON.stringify(name)});
      if (li) li.focus();
      return !!li;
    })()`;
    await expect
      .poll(
        async () => {
          const cur = await focusedRow();
          if (cur?.name === name) return name;
          await silo.eval(focusByName);
          return (await focusedRow())?.name ?? null;
        },
        { timeout: 5000, interval: 80 },
      )
      .toBe(name);
    return (await focusedRow())!;
  }

  beforeAll(async () => {
    priorActive = (await silo.listWorkspaces()).active;
    folderA = await mkdtemp(join(tmpdir(), "silo-knav-a-"));
    folderB = await mkdtemp(join(tmpdir(), "silo-knav-b-"));
    await writeFile(join(folderA, "a.txt"), "alpha\n");
    await writeFile(join(folderB, "b.txt"), "bravo\n");
    wsA = (await silo.openWorkspace(folderA, "knav-a")).id;
    await silo.openFile(join(folderA, "a.txt"));
    wsB = (await silo.openWorkspace(folderB, "knav-b")).id;
    // wsB needs an open editor so the Tab handoff has a center cursor to land on.
    editorBPanelId = (await silo.openFile(join(folderB, "b.txt"))).panelId;
    // Make the workspaces panel the active left panel before driving it.
    await silo.showSidePanel("workspaces");
  });

  afterAll(async () => {
    // Leave no trace: remove both sandbox workspaces, restore the prior active
    // one, and delete the temp folders (mirrors focus-handoff.it teardown).
    if (wsA) await silo.deleteWorkspace(wsA);
    if (wsB) await silo.deleteWorkspace(wsB);
    if (priorActive) await silo.activateWorkspace(priorActive);
    await rm(folderA, { recursive: true, force: true });
    await rm(folderB, { recursive: true, force: true });
  });

  it("region-cycles into the list, landing on the active row with the ring", async () => {
    await enterWorkspaceList();
    // The roving tabstop parks on the active workspace, so the cycle lands there
    // with the ring lit (and on exactly one row) — one Tab stop, ready for the
    // arrows. The ring is the `.focused` class, set a tick after focus lands.
    await expect
      .poll(
        async () => {
          const rows = await wsRows();
          const f = rows.find((r) => r.hasFocus);
          return {
            active: f?.active ?? false,
            ring: f?.focused ?? false,
            ringCount: rows.filter((r) => r.focused).length,
          };
        },
        { timeout: 3000, interval: 50 },
      )
      .toEqual({ active: true, ring: true, ringCount: 1 });
  });

  it("moves the focused row with Arrow/Home/End, wrapping at the ends", async () => {
    const start = await enterWorkspaceList();
    const n = (await wsRows()).length;
    expect(n).toBeGreaterThanOrEqual(2);

    // Drive a key, then wait for focus to settle on the expected row — and assert
    // the ring rides along on exactly that row.
    const press = async (key: string, expected: number) => {
      await silo.key(key);
      await expect
        .poll(async () => (await focusedRow())?.i ?? null, {
          timeout: 2000,
          interval: 50,
        })
        .toBe(expected);
      const rows = await wsRows();
      const f = rows.find((r) => r.hasFocus)!;
      expect(f.focused).toBe(true);
      expect(rows.filter((r) => r.focused)).toHaveLength(1);
    };

    await press("ArrowDown", (start.i + 1) % n); // next, wrapping
    await press("ArrowUp", start.i); // back to start
    await press("Home", 0); // jump to the first row
    await press("ArrowUp", n - 1); // Up from the first row wraps to the last
    await press("End", n - 1); // jump to the last row
  });

  it("activates the focused workspace on Enter", async () => {
    await enterWorkspaceList();
    await navigateTo("knav-a");
    await silo.key("Enter");
    await expect
      .poll(async () => (await silo.listWorkspaces()).active, {
        timeout: 2000,
        interval: 50,
      })
      .toBe(wsA);
  });

  it("hands Tab off from the dock to the center editor", async () => {
    // The list is one Tab stop, the per-row close (×) is out of tab order, and
    // the Navigator's header toolbar is entry-chrome (skipped by region entry,
    // not by Tab) but comes BEFORE the list in DOM order — so the list's roving
    // row is the dock's last tabbable. Tab from there hands off to the center
    // (skipping the splitter + dock chrome) — the cursor, ready to type.
    await enterWorkspaceList();
    await silo.key("Tab");
    await expect
      .poll(
        async () =>
          silo.eval<boolean>(
            '!!(document.activeElement && document.activeElement.closest(".center-body"))',
          ),
        { timeout: 3000, interval: 50 },
      )
      .toBe(true);
  });

  // Open the focused row's context menu with the ContextMenu key, retrying until
  // the menu is actually up (the keydown + portal mount settle a frame later).
  async function openRowMenu(): Promise<void> {
    await expect
      .poll(
        async () => {
          if ((await menuState()).open) return true;
          await silo.key("ContextMenu");
          return (await menuState()).open;
        },
        { timeout: 3000, interval: 80 },
      )
      .toBe(true);
  }

  it("opens the row context menu with the ContextMenu key and navigates it", async () => {
    await enterWorkspaceList();
    await navigateTo("knav-a");
    await openRowMenu();

    // It opens with at least its two rows and the first one highlighted.
    let menu = await menuState();
    expect(menu.items.length).toBeGreaterThanOrEqual(2);
    expect(menu.items[0].active).toBe(true);

    // Arrow moves the highlight to the next row.
    await silo.key("ArrowDown");
    await expect
      .poll(
        async () => (await menuState()).items.findIndex((it) => it.active),
        {
          timeout: 2000,
          interval: 50,
        },
      )
      .toBe(1);
    menu = await menuState();
    expect(menu.items[0].active).toBe(false);

    // Esc closes the menu and restores focus to the opener row (no side effect).
    await silo.key("Escape");
    await expect
      .poll(async () => (await menuState()).open, {
        timeout: 2000,
        interval: 50,
      })
      .toBe(false);
    await expect
      .poll(async () => (await focusedRow())?.name ?? null, {
        timeout: 2000,
        interval: 50,
      })
      .toBe("knav-a");
  });

  it("runs the highlighted menu item on Enter and closes the menu", async () => {
    // Kept last: this Enter runs `Close` on the knav-a sandbox row (closing it),
    // which afterAll tears down anyway — so it can't disturb earlier assertions.
    await enterWorkspaceList();
    await navigateTo("knav-a");
    await openRowMenu();
    // Move to the "Close" row, then run it.
    await silo.key("ArrowDown");
    await expect
      .poll(
        async () => (await menuState()).items.find((it) => it.active)?.label,
        { timeout: 2000, interval: 50 },
      )
      .toBe("Close");
    await silo.key("Enter");
    // The menu closes on selection, and the row's workspace is no longer open.
    await expect
      .poll(async () => (await menuState()).open, {
        timeout: 2000,
        interval: 50,
      })
      .toBe(false);
    await expect
      .poll(async () => (await wsRows()).some((r) => r.name === "knav-a"), {
        timeout: 2000,
        interval: 50,
      })
      .toBe(false);
  });

  it("status bar: region-cycle entry shows the ring; a pointer click does not", async () => {
    // Start from a clean, out-of-bar state so the ring we observe is set by THIS
    // region-cycle entry (not left over from a prior step).
    await silo.eval(
      "document.activeElement && document.activeElement.blur && document.activeElement.blur()",
    );
    // The bar's focused item carries data-focus-visible when keyboard-driven (the
    // app-wide ring marker the host's CSS draws) — unified with useFocusGroup.
    const ringInBar = (): Promise<boolean> =>
      silo.eval<boolean>(
        '!!document.querySelector(".status-bar [data-focus-visible]")',
      );
    const inBar = (): Promise<boolean> =>
      silo.eval<boolean>(
        '!!(document.activeElement && document.activeElement.closest(".status-bar"))',
      );
    // Region-cycle forward until focus lands in the status bar.
    await expect
      .poll(
        async () => {
          if (await inBar()) return true;
          await silo.exec("core.focusNextDock");
          return inBar();
        },
        { timeout: 4000, interval: 100 },
      )
      .toBe(true);
    // Entering the bar by keyboard lights the ring on the focused item.
    await expect.poll(ringInBar, { timeout: 2000, interval: 50 }).toBe(true);

    // Keyboard-only: focusing an item via the mouse shows NO ring (pointer origin
    // suppresses it). Blur first so .focus() genuinely moves focus and fires the
    // focusin the controller reads — then the real pointerdown→focus order.
    await silo.eval(`(() => {
      const bar = document.querySelector(".status-bar");
      const item = bar.querySelector("button:not([disabled])");
      item.blur();
      item.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      item.focus();
      return true;
    })()`);
    await expect.poll(ringInBar, { timeout: 2000, interval: 50 }).toBe(false);
  });

  it("Tab off the last status-bar item hands off to the left dock (no empty body stop)", async () => {
    // Regression for the empty tab stop: tabbing past the last status item used
    // to land on <body> (the WebKit DOM-wrap stop) before reaching the left dock.
    // The region handoff now wraps it straight to the left dock's content.
    const focusedLast = await silo.eval<boolean>(`(() => {
      const bar = document.querySelector(".status-bar");
      const items = bar.querySelectorAll(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      const last = items[items.length - 1];
      if (!last) return false;
      last.focus();
      return document.activeElement === last;
    })()`);
    expect(focusedLast).toBe(true);

    await silo.key("Tab");
    // Focus jumps straight into the left dock — not <body>, not nowhere.
    await expect
      .poll(
        async () =>
          silo.eval<boolean>(
            '!!(document.activeElement && document.activeElement.closest(`.side-pane[data-location="left"]`))',
          ),
        { timeout: 3000, interval: 50 },
      )
      .toBe(true);
  });

  it("restores the same center tab (editor vs terminal) on re-entry across a split", async () => {
    // Regression for center re-entry: with an editor and a terminal in a split,
    // leaving the center and returning (region cycle) must restore the GROUP you
    // left — not the first visible textarea (which an always-visible xterm wins).
    await silo.activateWorkspace(wsB);
    const term = await silo.openTerminal(); // editor + terminal in one group…
    await silo.splitActivePanel("right"); // …now two groups, side by side.

    // Region-cycle out of the center and back.
    const leaveAndReturn = async () => {
      await silo.exec("core.focusNextDock");
      await expect
        .poll(
          async () =>
            silo.eval<boolean>(
              "!!(document.activeElement && document.activeElement.closest(`.center-body`))",
            ),
          { timeout: 2000, interval: 50 },
        )
        .toBe(false); // left the center
      await silo.exec("core.focusPreviousDock");
    };

    // Leave from the EDITOR group → return restores the editor.
    await silo.activatePanel(editorBPanelId);
    await expect
      .poll(async () => (await silo.activeElement())?.inMonaco ?? false, {
        timeout: 3000,
        interval: 50,
      })
      .toBe(true);
    await leaveAndReturn();
    await expect
      .poll(async () => (await silo.activeElement())?.inMonaco ?? false, {
        timeout: 3000,
        interval: 50,
      })
      .toBe(true);

    // Leave from the TERMINAL group → return restores the terminal.
    await silo.activatePanel(term.panelId);
    await expect
      .poll(async () => (await silo.activeElement())?.inXterm ?? false, {
        timeout: 3000,
        interval: 50,
      })
      .toBe(true);
    await leaveAndReturn();
    await expect
      .poll(async () => (await silo.activeElement())?.inXterm ?? false, {
        timeout: 3000,
        interval: 50,
      })
      .toBe(true);
  });

  it("region-cycles onto a markdown preview's scroll view, not its chrome", async () => {
    // A no-cursor center view (markdown preview) must be entered on its own
    // scrollable content (arrows scroll, Tab cycles its links), not the tab-bar
    // chrome — and the view switcher / group-add `+` are out of the Tab order.
    // Runs in its own single-panel workspace so the active editor / view switcher
    // are unambiguous (other tests leave wsB split with several panels).
    const folder = await mkdtemp(join(tmpdir(), "silo-knav-md-"));
    await writeFile(
      join(folder, "doc.md"),
      `# Title\n\n${"lorem ipsum\n\n".repeat(40)}[a link](https://example.com)\n`,
    );
    const wsMd = (await silo.openWorkspace(folder, "knav-md")).id;
    try {
      const md = await silo.openFile(join(folder, "doc.md"));
      // Switch to Preview — the view switcher is mouse-only now (tabIndex -1) but
      // still clickable. Re-click each tick until the preview mounts (the switcher
      // renders a frame after the editor opens).
      await expect
        .poll(
          async () => {
            if (
              await silo.eval<boolean>(
                '!!document.querySelector(".markdown-preview")',
              )
            )
              return true;
            await silo.eval(`(() => {
              const b = Array.from(
                document.querySelectorAll(".view-switcher-seg__btn"),
              ).find((el) => (el.textContent || "").trim() === "Preview");
              if (b) b.dispatchEvent(new MouseEvent("click", { bubbles: true }));
            })()`);
            return silo.eval<boolean>(
              '!!document.querySelector(".markdown-preview")',
            );
          },
          { timeout: 4000, interval: 100 },
        )
        .toBe(true);

      // The preview's scroll view is the focusable content; chrome is not tabbable.
      expect(
        await silo.eval<string | null>(
          'document.querySelector(".markdown-preview").getAttribute("tabindex")',
        ),
      ).toBe("0");
      expect(
        await silo.eval<string | null>(
          'document.querySelector(".view-switcher-seg__btn").getAttribute("tabindex")',
        ),
      ).toBe("-1");
      expect(
        await silo.eval<string | null>(
          'document.querySelector(".group-add-btn")?.getAttribute("tabindex") ?? null',
        ),
      ).toBe("-1");

      // Region-cycle into the center → focus lands on the preview view itself.
      await silo.activatePanel(md.panelId);
      await silo.eval(
        "document.activeElement && document.activeElement.blur && document.activeElement.blur()",
      );
      await silo.exec("core.focusNextDock");
      await silo.exec("core.focusPreviousDock");
      await expect
        .poll(
          async () =>
            silo.eval<boolean>(
              "!!(document.activeElement && document.activeElement.classList && document.activeElement.classList.contains(`markdown-preview`))",
            ),
          { timeout: 3000, interval: 50 },
        )
        .toBe(true);
    } finally {
      await silo.deleteWorkspace(wsMd);
      await rm(folder, { recursive: true, force: true });
    }
  });
});
