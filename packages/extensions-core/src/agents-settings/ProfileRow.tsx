/**
 * One Agent Profile row on the Profiles tab (RFC 0033 R13): label · command
 * (monospace) · agent icon + name · config directory when set · a
 * resume-status badge · a `⋮` menu (Edit / Duplicate / Move up / Move down /
 * Delete).
 */
import type { ExtensionContext, MenuEntry } from "@silo-code/sdk";
import { AgentIconGlyph, Badge, IconButton, ListRow } from "@silo-code/sdk";
import type { AgentProfile } from "@silo-code/extension-host/internal";

function DotsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="3" r="1.4" fill="currentColor" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
      <circle cx="8" cy="13" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function ProfileRow({
  ctx,
  profile,
  colorScheme,
  index,
  count,
  bestEffortResume,
  onEdit,
  onDuplicate,
  onMove,
  onDelete,
  onOpenSessions,
}: {
  ctx: ExtensionContext;
  profile: AgentProfile;
  colorScheme: "dark" | "light";
  index: number;
  count: number;
  /** Resolved agent has no installed session hook — resume is best-effort. */
  bestEffortResume: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
  onOpenSessions: () => void;
}) {
  const agent = ctx.agents
    .catalog()
    .find((a) => a.id === profile.assumedAgentId);

  function openMenu(at: { x: number; y: number }) {
    const items: MenuEntry[] = [
      { label: "Edit…", run: onEdit },
      { label: "Duplicate", run: onDuplicate },
      { type: "separator" },
      {
        label: "Move up",
        disabled: index === 0,
        run: () => onMove(-1),
      },
      {
        label: "Move down",
        disabled: index === count - 1,
        run: () => onMove(1),
      },
      { type: "separator" },
      { label: "Delete…", run: onDelete },
    ];
    void ctx.ui.showMenu({ items, at });
  }

  return (
    <ListRow
      leading={
        <AgentIconGlyph
          icon={agent?.icon}
          mode="color"
          colorScheme={colorScheme}
          className="apf-row-icon"
        />
      }
      trailing={
        <>
          {profile.configDir && (
            <Badge size="sm" tone="neutral">
              {shortDir(profile.configDir)}
            </Badge>
          )}
          {bestEffortResume && (
            <button
              type="button"
              className="apf-badge-button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenSessions();
              }}
            >
              <Badge tone="warn">Best-effort resume</Badge>
            </button>
          )}
          <IconButton
            size="sm"
            aria-label={`${profile.label} actions`}
            onClick={(e) => {
              e.stopPropagation();
              openMenu({ x: e.clientX, y: e.clientY });
            }}
          >
            <DotsIcon />
          </IconButton>
        </>
      }
      onActivate={onEdit}
    >
      <span className="apf-row-main">
        <span className="apf-row-label">{profile.label}</span>
        <code className="apf-row-cmd">{profile.command}</code>
        {agent && <span className="apf-row-agent">{agent.displayName}</span>}
      </span>
    </ListRow>
  );
}

function shortDir(dir: string): string {
  const parts = dir.split("/");
  return parts[parts.length - 1] || dir;
}
