import type { ReactNode } from "react";
import type { Permission } from "@silo-code/sdk";
import "./PermissionConsent.css";

/* Per-capability presentation: an icon, a short label, and one line of detail.
   Kept here (not in ExtensionsPage) so the consent dialog owns its own copy. */
const PERMISSION_META: Record<
  Permission,
  { label: string; detail: string; icon: ReactNode }
> = {
  "fs:read": {
    label: "Read files outside the workspace",
    detail: "Open and read files anywhere on your computer.",
    icon: <FileIcon />,
  },
  "fs:write": {
    label: "Write files outside the workspace",
    detail: "Create, modify, and delete files anywhere on your computer.",
    icon: <FileIcon />,
  },
  process: {
    label: "Run commands outside the workspace",
    detail: "Execute programs with a working directory anywhere.",
    icon: <TerminalIcon />,
  },
  network: {
    label: "Access the network",
    detail: "Make outbound connections to the internet.",
    icon: <GlobeIcon />,
  },
};

/**
 * The install-time consent dialog for an extension that requests capabilities
 * beyond the workspace. Rendered as the content of `ctx.ui.showModal` (the host
 * owns the card chrome); `onCancel` / `onGrant` settle it. A dedicated layout —
 * not `ctx.ui.confirm` — because a permission grant is a higher-stakes decision
 * than a yes/no prompt and reads better as an itemized list with an icon.
 */
export function PermissionConsent({
  name,
  permissions,
  onCancel,
  onGrant,
}: {
  name: string;
  permissions: readonly Permission[];
  onCancel: () => void;
  onGrant: () => void;
}) {
  return (
    <div className="perm-consent">
      <div className="perm-consent-head">
        <span className="perm-consent-shield">
          <ShieldIcon />
        </span>
        <div className="perm-consent-titles">
          <span className="perm-consent-title">{name}</span>
          <span className="perm-consent-sub">
            wants access beyond your workspace
          </span>
        </div>
      </div>

      <ul className="perm-consent-list">
        {permissions.map((p) => {
          const meta = PERMISSION_META[p];
          return (
            <li key={p} className="perm-consent-item">
              <span className="perm-consent-item-icon">{meta.icon}</span>
              <span className="perm-consent-item-text">
                <span className="perm-consent-item-label">{meta.label}</span>
                <span className="perm-consent-item-detail">{meta.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p className="perm-consent-note">
        Only install extensions you trust — granted capabilities run with the
        app&rsquo;s privileges.
      </p>

      <div className="perm-consent-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="silo-button-primary" onClick={onGrant}>
          Install &amp; grant
        </button>
      </div>
    </div>
  );
}

/* ── Icons (inline SVG, currentColor so they theme with the surrounding text) ── */

function ShieldIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2l8 3v6c0 5-3.4 8.6-8 11-4.6-2.4-8-6-8-11V5l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 17l5-5-5-5" />
      <path d="M13 18h6" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z" />
    </svg>
  );
}
