import { useState } from "react";
import { Button, Input, Section, Switch } from "@silo-code/sdk";
import type { ExtensionContext } from "@silo-code/sdk";
import { Sheet } from "@silo-code/extension-host/internal";
import "./SheetLab.css";

// PROTOTYPE — the bench for feeling out the <Sheet> surface. Each button opens
// one permutation so the shapes can be compared and iterated on before any of
// it becomes SDK surface. The extension registers this panel in *both* docks:
// a dock-anchored sheet grows out of whichever dock its caller lives in, so
// having a bench on each side is how both directions get exercised.

/**
 * A dock-anchored sheet has no `side` — it inherits the caller's dock — so a
 * recipe only picks the anchor, the mode, and (for dock sheets) the width.
 */
type Recipe =
  | {
      key: string;
      label: string;
      hint: string;
      anchor: "app";
      align: "left" | "right" | "center";
    }
  | {
      key: string;
      label: string;
      hint: string;
      anchor: "dock";
      mode: "overlay" | "push";
    };

const RECIPES: Recipe[] = [
  {
    key: "app-left",
    label: "App sheet — left edge",
    hint: "Full height from the window's left edge, status bar included. 70% wide, max 1550px. The Settings replacement.",
    anchor: "app",
    align: "left",
  },
  {
    key: "app-right",
    label: "App sheet — right edge",
    hint: "The same thing mirrored, to see whether the left edge is actually the right call.",
    anchor: "app",
    align: "right",
  },
  {
    key: "app-center",
    label: "App sheet — centered",
    hint: "Floating in the middle of the window with the scrim on both sides. Still full height — a column rather than a card.",
    anchor: "app",
    align: "center",
  },
  {
    key: "dock-overlay",
    label: "Dock sheet — overlay",
    hint: "Grows out of this panel's own dock and sits on top of the center dock. Not modal: no scrim, no click-outside, and whatever still shows stays clickable.",
    anchor: "dock",
    mode: "overlay",
  },
  {
    key: "dock-push",
    label: "Dock sheet — push",
    hint: "The same sheet, but the center dock narrows to make room instead of being covered — nothing is hidden behind it.",
    anchor: "dock",
    mode: "push",
  },
];

function usesWidth(r: Recipe): boolean {
  return r.anchor === "dock";
}

function SheetContents({
  recipe,
  widthPx,
  onClose,
  ctx,
}: {
  recipe: Recipe;
  widthPx: number;
  onClose: () => void;
  ctx: ExtensionContext;
}) {
  return (
    <div className="sheet-lab-content">
      <p className="sheet-lab-hint">{recipe.hint}</p>
      <Section label="This sheet">
        <dl className="sheet-lab-facts">
          <dt>anchor</dt>
          <dd>{recipe.anchor}</dd>
          <dt>align</dt>
          <dd>
            {recipe.anchor === "app"
              ? recipe.align
              : "inherited from the calling dock"}
          </dd>
          <dt>mode</dt>
          <dd>{recipe.anchor === "app" ? "n/a" : recipe.mode}</dd>
          <dt>modal</dt>
          <dd>
            {recipe.anchor === "app"
              ? "yes — scrim, Escape, focus"
              : "no — the workbench beside it stays live"}
          </dd>
          <dt>width</dt>
          <dd>
            {usesWidth(recipe) ? `${widthPx}px` : "70% of window, max 1550px"}
          </dd>
        </dl>
      </Section>
      <Section label="Does it still behave?">
        <div className="sheet-lab-row">
          {/* A modal raised from inside the sheet must land *on top* of it —
              the reason --silo-z-sheet-base sits below --silo-z-modal-base. */}
          <Button
            onClick={() => {
              void ctx.ui.confirm({
                title: "Stacking check",
                body: "This dialog should sit above the sheet, not behind it.",
              });
            }}
          >
            Raise a confirm
          </Button>
          <Button onClick={() => ctx.ui.notify("info", "Toast from a sheet.")}>
            Raise a toast
          </Button>
        </div>
      </Section>
      <Section label="Scrolling">
        <ol className="sheet-lab-filler">
          {Array.from({ length: 40 }, (_, i) => (
            <li key={i}>
              Filler row {i + 1} — the body scrolls, the header doesn&rsquo;t.
            </li>
          ))}
        </ol>
      </Section>
      <div className="sheet-lab-row">
        <Button variant="primary" onClick={onClose}>
          Close sheet
        </Button>
      </div>
    </div>
  );
}

export function SheetLabPanel({
  ctx,
  panelId,
}: {
  ctx: ExtensionContext;
  panelId: string;
}) {
  const [open, setOpen] = useState<Recipe | null>(null);
  const [width, setWidth] = useState(520);
  const [dismissible, setDismissible] = useState(true);

  const close = () => setOpen(null);

  return (
    <div className="sheet-lab">
      <Section label="Open a sheet">
        <div className="sheet-lab-buttons">
          {RECIPES.map((r) => (
            <Button
              key={r.key}
              className="sheet-lab-btn"
              onClick={() => setOpen(r)}
            >
              {r.label}
            </Button>
          ))}
          {/* Exercises the public `ctx.layout.openPanelSheet` path (RFC 0029)
              — imperative, dock-only, and anchored to *this panel* by id
              rather than by where the call happens to run, so it opens on
              the right side/reveals this panel even from, say, a
              command-palette invocation. */}
          <Button
            className="sheet-lab-btn"
            onClick={() => {
              void ctx.layout.openPanelSheet(
                panelId,
                (imperativeClose) => (
                  <SheetContents
                    recipe={{
                      key: "imperative",
                      label: "Imperative — ctx.layout.openPanelSheet",
                      hint: "Opened via ctx.layout.openPanelSheet(panelId, render, opts) — the public SDK path. Side comes from this panel's own id, not from where the call runs.",
                      anchor: "dock",
                      mode: "overlay",
                    }}
                    widthPx={width}
                    ctx={ctx}
                    onClose={imperativeClose}
                  />
                ),
                {
                  title: "Imperative — ctx.layout.openPanelSheet",
                  width,
                  mode: "overlay",
                },
              );
            }}
          >
            Imperative — ctx.layout.openPanelSheet
          </Button>
        </div>
      </Section>

      <Section label="Knobs">
        <label className="sheet-lab-knob">
          <span>Dock sheet width (px)</span>
          <Input
            type="number"
            min={200}
            max={2000}
            step={20}
            value={String(width)}
            onChange={(e) => setWidth(Number(e.target.value) || 520)}
          />
        </label>
        <label className="sheet-lab-knob">
          {/* App sheets only — a dock sheet has no scrim to click and leaves
              Escape to whatever the user is actually typing into. */}
          <span>App sheet: Escape / scrim closes it</span>
          <Switch
            checked={dismissible}
            onChange={setDismissible}
            aria-label="Dismissible"
          />
        </label>
      </Section>

      {/* Two call sites rather than one with a spread: `anchor` discriminates
          the prop union, so each branch is what makes `side`-vs-`mode` legal. */}
      {open?.anchor === "app" && (
        <Sheet
          title={open.label}
          anchor="app"
          align={open.align}
          dismissible={dismissible}
          onClose={close}
        >
          <SheetContents
            recipe={open}
            widthPx={width}
            ctx={ctx}
            onClose={close}
          />
        </Sheet>
      )}
      {open?.anchor === "dock" && (
        <Sheet
          title={open.label}
          anchor="dock"
          mode={open.mode}
          width={width}
          onClose={close}
        >
          <SheetContents
            recipe={open}
            widthPx={width}
            ctx={ctx}
            onClose={close}
          />
        </Sheet>
      )}
    </div>
  );
}
