import { useLayoutEffect, useRef, useState } from "react";
import {
  createGroup,
  renameGroup,
  setGroupColor,
} from "@silo-code/extension-host/internal";
import {
  Button,
  Input,
  ModalActions,
  Section,
  type ExtensionContext,
} from "@silo-code/sdk";
import { resolveGroupProps, type GroupDraft } from "./group-properties-model";

// Accepts both the mutable type and valtio's readonly snapshot form.
export interface GroupSnapshot {
  id: string;
  name: string;
  color?: string;
  collapsed: boolean;
  workspaceOrder: readonly string[] | string[];
  closedAt?: string | null;
}

type Swatch = { label: string; value: string | undefined };

const PALETTE: Swatch[] = [
  { label: "None", value: undefined },
  { label: "Red", value: "#e06c75" },
  { label: "Orange", value: "#e09070" },
  { label: "Yellow", value: "#e5c07b" },
  { label: "Green", value: "#98c379" },
  { label: "Teal", value: "#56b6c2" },
  { label: "Blue", value: "#61afef" },
  { label: "Purple", value: "#c678dd" },
  { label: "Pink", value: "#ff7eb6" },
];

// A second row of neutral shades. These are theme-relative: each mixes the
// theme's ink (`--ws-group-neutral-ink`) into its background, so a shade renders
// dark on a light theme and light on a dark theme — it inverts automatically,
// and works for custom themes too (they carry a light/dark base). The ink var is
// defined per-theme in WorkspacesPanel.css (a brighter token on dark themes, so
// the tints read lighter there). The stored value is the color-mix() string
// itself, resolved against whatever theme is active when it paints.
const neutral = (pct: number): string =>
  `color-mix(in srgb, var(--ws-group-neutral-ink) ${pct}%, var(--silo-color-bg))`;

// Just the two extremes of the neutral ramp — a faint tint and a strong one.
// (Both invert per theme, so "faint"/"strong" describes the wash weight, not a
// fixed light/dark value.)
const GREYSCALE: Swatch[] = [
  { label: "Gray faint", value: neutral(40) },
  { label: "Gray strong", value: neutral(100) },
];

function GroupPropertiesContent({
  mode,
  initial,
  onCancel,
  onSave,
  onPreviewColor,
}: {
  mode: "create" | "edit";
  initial: GroupDraft;
  onCancel: () => void;
  onSave: (changes: GroupDraft) => void;
  /** Edit mode only: called on every swatch click so the group in the
      Navigator repaints live. The caller reverts if the modal is cancelled. */
  onPreviewColor?: (color: string | undefined) => void;
}) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState<string | undefined>(initial.color);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  const { canSubmit, changes } = resolveGroupProps(mode, initial, {
    name,
    color,
  });

  function commit() {
    if (canSubmit) onSave(changes);
    else onCancel();
  }

  function renderSwatch(entry: Swatch) {
    const isNone = entry.value === undefined;
    const classes = [
      "ws-group-swatch",
      isNone ? "ws-group-swatch--none" : "",
      color === entry.value ? "selected" : "",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <button
        key={entry.value ?? "__none__"}
        type="button"
        className={classes}
        style={entry.value ? { background: entry.value } : undefined}
        aria-label={entry.label}
        aria-pressed={color === entry.value}
        onClick={() => {
          setColor(entry.value);
          onPreviewColor?.(entry.value);
        }}
      />
    );
  }

  return (
    <form
      className="ws-props-form"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <Section label="Name">
        <Input
          id="group-prop-name"
          ref={nameRef}
          block
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Group name"
        />
      </Section>

      <Section label="Color">
        <div className="ws-group-palette">{PALETTE.map(renderSwatch)}</div>
        <div className="ws-group-palette ws-group-palette--offset">
          {GREYSCALE.map(renderSwatch)}
        </div>
      </Section>

      <ModalActions>
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          {mode === "create" ? "Create" : "Save"}
        </Button>
      </ModalActions>
    </form>
  );
}

export async function openGroupProperties(
  ctx: ExtensionContext,
  group: GroupSnapshot,
): Promise<void> {
  const changes = await ctx.ui.showModal<GroupDraft>(
    (close) => (
      <GroupPropertiesContent
        mode="edit"
        initial={{ name: group.name, color: group.color }}
        onCancel={() => close()}
        onSave={(c) => close(c)}
        onPreviewColor={(c) => setGroupColor(group.id, c)}
      />
    ),
    { title: "Group Properties", size: "sm" },
  );
  if (changes) {
    if (changes.name !== group.name) renameGroup(group.id, changes.name);
    // The color was already applied live by the preview; this reconciles the
    // final value (and is a no-op when they match).
    if (changes.color !== group.color) setGroupColor(group.id, changes.color);
  } else {
    // Cancelled or dismissed — undo whatever the preview left behind.
    setGroupColor(group.id, group.color);
  }
}

export async function openNewGroup(ctx: ExtensionContext): Promise<void> {
  const changes = await ctx.ui.showModal<GroupDraft>(
    (close) => (
      <GroupPropertiesContent
        mode="create"
        initial={{ name: "", color: undefined }}
        onCancel={() => close()}
        onSave={(c) => close(c)}
      />
    ),
    { title: "New Group", size: "sm" },
  );
  if (changes) createGroup(changes.name, changes.color);
}
