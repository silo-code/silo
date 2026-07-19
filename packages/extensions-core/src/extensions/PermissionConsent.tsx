import type { ReactNode } from "react";
import type { Permission } from "@silo-code/sdk";
import { Button, Callout, ModalActions } from "@silo-code/sdk";
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
  webview: {
    label: "Access embedded web content",
    detail:
      "Read, script, and screenshot pages shown in this extension's panels — including sites from other websites.",
    icon: <WindowIcon />,
  },
};

/**
 * The install-time consent dialog for an extension that requests capabilities
 * beyond the workspace, or that declares an engine version above the running
 * host. Rendered as the content of `ctx.ui.showModal`; `onCancel` / `onGrant`
 * settle it.
 */
export function PermissionConsent({
  name,
  permissions,
  engine,
  hostVersion,
  engineCompatible,
  onCancel,
  onGrant,
}: {
  name: string;
  permissions: readonly Permission[];
  engine?: string;
  hostVersion?: string;
  engineCompatible?: boolean;
  onCancel: () => void;
  onGrant: () => void;
}) {
  const hasPerms = permissions.length > 0;
  const incompatible = engineCompatible === false;

  return (
    <div className="perm-consent">
      <div className="perm-consent-head">
        <span className="perm-consent-shield">
          <ShieldIcon />
        </span>
        <div className="perm-consent-titles">
          <span className="perm-consent-title">{name}</span>
          {hasPerms && (
            <span className="perm-consent-sub">
              wants access beyond your workspace
            </span>
          )}
        </div>
      </div>

      {incompatible && (
        <div className="perm-consent-warn">
          <WarnIcon />
          <span>
            Requires Silo {engine} — you&rsquo;re on {hostVersion}. It may not
            work until you update Silo.
          </span>
        </div>
      )}

      {hasPerms && (
        <ul className="perm-consent-list">
          {permissions.map((p) => {
            const meta = PERMISSION_META[p];
            return (
              <li key={p} className="perm-consent-item">
                <span className="perm-consent-item-icon">{meta.icon}</span>
                <span className="perm-consent-item-text">
                  <span className="perm-consent-item-label">{meta.label}</span>
                  <span className="perm-consent-item-detail">
                    {meta.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {hasPerms && (
        <Callout>
          Only install extensions you trust — granted capabilities run with the
          app&rsquo;s privileges.
        </Callout>
      )}

      <ModalActions>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={onGrant}>
          {incompatible
            ? "Install anyway"
            : hasPerms
              ? "Install & grant"
              : "Install"}
        </Button>
      </ModalActions>
    </div>
  );
}

/* ── Icons (inline SVG, currentColor so they theme with the surrounding text) ── */

function WarnIcon() {
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
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

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

function WindowIcon() {
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
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
    </svg>
  );
}
