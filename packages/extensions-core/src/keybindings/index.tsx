import { useEffect, useReducer, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { DotsThreeVertical } from "@phosphor-icons/react";
import type { Extension, ExtensionContext, MenuEntry } from "@silo-code/sdk";
import { IconButton, SearchInput, Section, Tooltip } from "@silo-code/sdk";
import {
  commandRegistry,
  keybindingRegistry,
  displayKey,
  effectiveKey,
  defaultKey,
  getUserBindings,
  saveUserBindings,
  keybindingsPath,
  menuFor,
  onKeymapChange,
  overrideKey,
  isRemoved,
  setKeybindingCaptureActive,
} from "@silo-code/extension-host/internal";
import {
  bindingsAfterRemove,
  bindingsAfterReset,
  bindingsAfterSet,
  commandMatchesQuery,
  conflictingCommands,
  groupCommands,
  parseCaptureKeydown,
  rowState,
} from "./keybindings-model";
import "./KeybindingsPage.css";

const STARTER = `// Keyboard shortcuts — your overrides win over the defaults.
// Examples:
//   { "key": "cmd+j", "command": "view.toggleLeftPanel" }
//   { "key": "cmd+alt+]", "command": "-view.toggleRightPanel" }  // unbind a default
[]
`;

type CaptureState =
  | { kind: "idle" }
  | { kind: "capturing"; commandId: string }
  | {
      kind: "confirming";
      commandId: string;
      chord: string;
      reassignFrom: string[];
    };

async function openKeybindingsFile(ctx: ExtensionContext): Promise<void> {
  const path = await keybindingsPath();
  if (!(await ctx.files.pathExists(path))) {
    await ctx.files.writeText(path, STARTER);
  }
  ctx.editors.open(path);
  ctx.executeCommand("settings.close");
}

function makePage(ctx: ExtensionContext) {
  return function KeybindingsPage() {
    const [, force] = useReducer((x: number) => x + 1, 0);
    const [query, setQuery] = useState("");
    const [capture, setCapture] = useState<CaptureState>({ kind: "idle" });
    const captureRef = useRef(capture);
    captureRef.current = capture;

    // Re-render when commands, keybindings, or the keymap (overrides) change.
    useEffect(() => {
      const d1 = commandRegistry.onChange(force);
      const d2 = onKeymapChange(force);
      const d3 = keybindingRegistry.onChange(force);
      return () => {
        d1.dispose();
        d2.dispose();
        d3.dispose();
      };
    }, []);

    // Capture / reassign-confirm key handling. Suppresses command dispatch for
    // the duration so the pressed chord is captured instead of executed.
    useEffect(() => {
      const active = capture.kind !== "idle";
      setKeybindingCaptureActive(active);
      if (!active) return;

      function onKeyDown(e: KeyboardEvent) {
        const state = captureRef.current;
        if (state.kind === "idle") return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const parsed = parseCaptureKeydown(e, {
          confirming: state.kind === "confirming",
        });
        if (parsed.kind === "ignore") return;
        if (parsed.kind === "cancel") {
          setCapture({ kind: "idle" });
          return;
        }
        if (parsed.kind === "confirm" && state.kind === "confirming") {
          void commitBinding(state.commandId, state.chord, state.reassignFrom);
          return;
        }
        if (parsed.kind === "chord") {
          const entries = commandRegistry.list().map((c) => ({
            command: c.id,
            effectiveKey: effectiveKey(c.id),
          }));
          const reassignFrom = conflictingCommands(
            parsed.key,
            state.commandId,
            entries,
          );
          if (reassignFrom.length > 0) {
            setCapture({
              kind: "confirming",
              commandId: state.commandId,
              chord: parsed.key,
              reassignFrom,
            });
            return;
          }
          void commitBinding(state.commandId, parsed.key, []);
        }
      }

      function onPointerDown(e: PointerEvent) {
        const t = e.target;
        if (t instanceof Element && t.closest(".kb-key-btn")) return;
        setCapture({ kind: "idle" });
      }

      function onFocusIn(e: FocusEvent) {
        const t = e.target;
        if (t instanceof Element && t.closest(".kb-key-btn")) return;
        setCapture({ kind: "idle" });
      }

      window.addEventListener("keydown", onKeyDown, { capture: true });
      window.addEventListener("pointerdown", onPointerDown, { capture: true });
      window.addEventListener("focusin", onFocusIn, { capture: true });
      return () => {
        window.removeEventListener("keydown", onKeyDown, { capture: true });
        window.removeEventListener("pointerdown", onPointerDown, {
          capture: true,
        });
        window.removeEventListener("focusin", onFocusIn, { capture: true });
        setKeybindingCaptureActive(false);
      };
    }, [capture.kind]);

    async function commitBinding(
      commandId: string,
      key: string,
      reassignFrom: string[],
    ) {
      const defaults = new Map<string, string>();
      for (const c of commandRegistry.list()) {
        const d = defaultKey(c.id);
        if (d) defaults.set(c.id, d);
      }
      const next = bindingsAfterSet(
        getUserBindings(),
        commandId,
        key,
        reassignFrom,
        defaults,
      );
      try {
        await saveUserBindings(next);
      } catch (err) {
        console.error("[keybindings] save failed", err);
        ctx.ui.notify("error", "Could not save keybinding");
      }
      setCapture({ kind: "idle" });
    }

    async function resetBinding(commandId: string) {
      try {
        await saveUserBindings(
          bindingsAfterReset(getUserBindings(), commandId),
        );
      } catch (err) {
        console.error("[keybindings] reset failed", err);
        ctx.ui.notify("error", "Could not reset keybinding");
      }
    }

    async function removeBinding(commandId: string) {
      try {
        await saveUserBindings(
          bindingsAfterRemove(getUserBindings(), commandId),
        );
      } catch (err) {
        console.error("[keybindings] remove failed", err);
        ctx.ui.notify("error", "Could not remove keybinding");
      }
    }

    function openPageMenu(anchor: HTMLElement) {
      const items: MenuEntry[] = [
        {
          label: "Edit keybindings.json",
          run: () => void openKeybindingsFile(ctx),
        },
      ];
      void ctx.ui.showMenu({ items, anchor, align: "end" });
    }

    function openRowMenu(commandId: string, e: ReactMouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      const state = rowState({
        unbound: isRemoved(commandId),
        overrideKey: overrideKey(commandId),
        defaultKey: defaultKey(commandId),
        effectiveKey: effectiveKey(commandId),
      });
      const items: MenuEntry[] = [
        {
          label: "Change Keybinding…",
          run: () => setCapture({ kind: "capturing", commandId }),
        },
        {
          label: "Reset Keybinding",
          disabled: state !== "override" && state !== "unbound",
          run: () => void resetBinding(commandId),
        },
        {
          label: "Remove Keybinding",
          disabled: state === "unbound" || state === "none",
          run: () => void removeBinding(commandId),
        },
      ];
      void ctx.ui.showMenu({
        items,
        at: { x: e.clientX, y: e.clientY },
      });
    }

    const rows = commandRegistry
      .list()
      .filter((c) => {
        const eff = effectiveKey(c.id);
        return commandMatchesQuery(query, c, {
          effective: eff,
          display: eff ? displayKey(eff) : undefined,
        });
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    const sortedGroups = groupCommands(rows, menuFor);

    return (
      <div className="es-page">
        <div className="es-header">
          <h2>Keyboard Shortcuts</h2>
          <Tooltip content="More options">
            <IconButton
              aria-label="More options"
              onClick={(e) => openPageMenu(e.currentTarget)}
            >
              <DotsThreeVertical size={16} weight="bold" />
            </IconButton>
          </Tooltip>
        </div>
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search commands or keys…"
          autoFocus
        />
        <div className="es-scroll silo-scroll">
          {sortedGroups.map(([group, cmds]) => (
            <Section key={group} label={group}>
              {cmds.map((c) => {
                const eff = effectiveKey(c.id);
                const state = rowState({
                  unbound: isRemoved(c.id),
                  overrideKey: overrideKey(c.id),
                  defaultKey: defaultKey(c.id),
                  effectiveKey: eff,
                });
                const isCapturing =
                  capture.kind === "capturing" && capture.commandId === c.id;
                const isConfirming =
                  capture.kind === "confirming" && capture.commandId === c.id;
                const reassignLabel =
                  isConfirming && capture.kind === "confirming"
                    ? (commandRegistry.get(capture.reassignFrom[0])?.label ??
                      capture.reassignFrom[0])
                    : "";
                const reassignExtra =
                  isConfirming &&
                  capture.kind === "confirming" &&
                  capture.reassignFrom.length > 1
                    ? ` +${capture.reassignFrom.length - 1}`
                    : "";

                let keyContent: ReactNode;
                let keyClass = "kb-key-btn";
                if (isConfirming) {
                  keyClass += " kb-key-btn-confirm";
                  keyContent = (
                    <span className="kb-capture-hint">
                      Used by {reassignLabel}
                      {reassignExtra}. Enter to reassign, Esc to cancel.
                    </span>
                  );
                } else if (isCapturing) {
                  keyClass += " kb-key-btn-capture";
                  keyContent = (
                    <span className="kb-capture-hint">
                      Press desired key combination…
                    </span>
                  );
                } else if (eff) {
                  keyClass +=
                    state === "override" ? " kb-key-btn-override" : "";
                  keyContent = <kbd className="kb-key">{displayKey(eff)}</kbd>;
                } else if (state === "unbound") {
                  keyClass += " kb-key-btn-unbound";
                  keyContent = (
                    <span className="kb-unbound" title="Unbound">
                      —
                    </span>
                  );
                } else {
                  keyClass += " kb-key-btn-empty";
                  keyContent = <span className="kb-unbound">—</span>;
                }

                return (
                  <div
                    key={c.id}
                    className="kb-row"
                    onContextMenu={(e) => openRowMenu(c.id, e)}
                  >
                    <div className="kb-cmd">
                      <span className="kb-label">{c.label}</span>
                      <span className="kb-id">{c.id}</span>
                    </div>
                    <button
                      type="button"
                      className={keyClass}
                      aria-label={
                        isCapturing || isConfirming
                          ? `Capture keybinding for ${c.label}`
                          : `Change keybinding for ${c.label}`
                      }
                      onClick={() =>
                        setCapture({ kind: "capturing", commandId: c.id })
                      }
                      ref={(el) => {
                        if (
                          el &&
                          (isCapturing || isConfirming) &&
                          document.activeElement !== el
                        ) {
                          el.focus();
                        }
                      }}
                    >
                      {keyContent}
                    </button>
                  </div>
                );
              })}
            </Section>
          ))}
          {rows.length === 0 && (
            <div className="kb-empty">No commands match “{query}”.</div>
          )}
        </div>
      </div>
    );
  };
}

export const extension: Extension = {
  id: "core.keybindings",
  activate(ctx) {
    ctx.registerSettingsPage({
      id: "keybindings",
      title: "Keyboard Shortcuts",
      group: "1_general",
      order: 0,
      component: makePage(ctx),
    });
  },
};
