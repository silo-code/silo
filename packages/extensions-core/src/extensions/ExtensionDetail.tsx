import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { ArrowLeft, SealCheck } from "@phosphor-icons/react";
import type { ExtensionContext } from "@silo-code/sdk";
import {
  getExtensionManager,
  registryReadmeUrl,
  type InstalledExtension,
  type RegistryExtension,
  type RegistryUpdate,
} from "@silo-code/extension-host/internal";
import { describeSource, localInstallSource } from "./extensions-list-model";
import { SOURCE_ICON, sourceOriginLabel } from "./source-meta";

const mgr = getExtensionManager();

export interface ExtensionDetailProps {
  ctx: ExtensionContext;
  /** The id being shown; at least one of the two records below exists. */
  id: string;
  registryEntry?: RegistryExtension;
  installed?: InstalledExtension;
  update?: RegistryUpdate;
  busy: boolean;
  onBack: () => void;
  onInstall: () => void;
  onUpdate: () => void;
  onToggle: () => void;
  onUninstall: () => void;
}

/**
 * Drill-in detail for one extension — works for both worlds: a registry entry
 * (Browse), an installed extension, or both at once. Shows the header facts,
 * the action that makes sense for the current state, and the README (the
 * local copy for installed extensions, the registry's version-pinned copy
 * otherwise).
 */
export function ExtensionDetail({
  ctx,
  id,
  registryEntry,
  installed,
  update,
  busy,
  onBack,
  onInstall,
  onUpdate,
  onToggle,
  onUninstall,
}: ExtensionDetailProps) {
  const [readme, setReadme] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setReadme(undefined);
    const load = async (): Promise<string | null> => {
      if (installed) return mgr.readInstalledReadme(id);
      if (registryEntry) {
        const resp = await fetch(registryReadmeUrl(registryEntry));
        return resp.ok ? resp.text() : null;
      }
      return null;
    };
    load()
      .then((text) => {
        if (!cancelled) setReadme(text);
      })
      .catch(() => {
        if (!cancelled) setReadme(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, installed !== undefined, registryEntry !== undefined]);

  const name = installed?.name ?? registryEntry?.name ?? id;
  const description = installed?.description ?? registryEntry?.description;
  const version = installed?.version ?? registryEntry?.latest?.version;
  const permissions =
    installed?.permissions ?? registryEntry?.latest?.permissions ?? [];
  const attested = registryEntry?.latest?.provenance === "attested";
  const repo = registryEntry?.repo;
  // Installed from a folder/URL/npm rather than the registry — call the origin
  // out explicitly (and drop the registry download count, which isn't this build).
  const localSource = localInstallSource(installed);

  return (
    <div className="ext-detail">
      <button className="ext-btn ext-detail-back" onClick={onBack}>
        <ArrowLeft size={13} /> Extensions
      </button>

      <div className="ext-detail-head">
        <div className="ext-detail-title">
          <span className="ext-label">
            {name}
            <span className="ext-brand">
              {installed?.publisher ?? id.split(".")[0]}
            </span>
            {version && <span className="ext-version">v{version}</span>}
            {installed?.builtin && (
              <span className="ext-badge-builtin">Built-in</span>
            )}
            {installed && !installed.enabled && (
              <span className="ext-badge">disabled</span>
            )}
            {attested && (
              <span
                className="ext-badge-verified"
                title="Build provenance verified: this package was built from its repo by CI"
              >
                <SealCheck size={12} weight="fill" /> verified build
              </span>
            )}
          </span>
          {description && <span className="ext-hint">{description}</span>}
          {registryEntry?.status === "unavailable" && (
            <span className="ext-hint ext-hint-warn">
              The source repository is no longer reachable — installed copies
              keep working, but updates may fail.
            </span>
          )}
        </div>

        <div className="ext-actions">
          {!installed && registryEntry?.latest && (
            <button className="ext-btn" onClick={onInstall} disabled={busy}>
              Install
            </button>
          )}
          {installed && update && (
            <button className="ext-btn" onClick={onUpdate} disabled={busy}>
              Update to v{update.latestVersion}
            </button>
          )}
          {installed && (
            <button className="ext-btn" onClick={onToggle} disabled={busy}>
              {installed.enabled ? "Disable" : "Enable"}
            </button>
          )}
          {installed && !installed.builtin && (
            <button className="ext-btn" onClick={onUninstall} disabled={busy}>
              Uninstall
            </button>
          )}
        </div>
      </div>

      <div className="ext-detail-meta">
        <span className="ext-hint">
          Permissions:{" "}
          {permissions.length > 0 ? permissions.join(", ") : "none"}
        </span>
        {update?.widensPermissions && (
          <span className="ext-hint ext-hint-warn">
            The update requests new permissions — you&rsquo;ll be asked to
            approve them.
          </span>
        )}
        {registryEntry && (
          <span className="ext-hint">
            {!localSource && `${registryEntry.totalDownloads} downloads · `}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                void ctx.ui.openExternal(`https://github.com/${repo}`);
              }}
            >
              {repo}
            </a>
          </span>
        )}
      </div>

      {localSource &&
        (() => {
          const SourceIcon = SOURCE_ICON[localSource.kind];
          return (
            <div
              className="ext-source-callout"
              title={describeSource(localSource)}
            >
              <SourceIcon size={16} weight="bold" />
              <div className="ext-source-callout-text">
                <span className="ext-source-callout-title">
                  Installed from {sourceOriginLabel(localSource.kind)}
                </span>
                <span className="ext-source-callout-value">
                  {localSource.value}
                </span>
              </div>
            </div>
          );
        })()}

      <div className="ext-detail-readme silo-scroll">
        {readme === undefined ? (
          <span className="ext-hint">Loading README…</span>
        ) : readme === null ? (
          <span className="ext-hint">No README available.</span>
        ) : (
          <Markdown
            components={{
              // READMEs are untrusted: raw HTML is already not rendered by
              // react-markdown; links route through the host's opener rather
              // than navigating the webview.
              a: ({ href, children }) => (
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    if (href) void ctx.ui.openExternal(href);
                  }}
                >
                  {children}
                </a>
              ),
              img: ({ src, alt }) =>
                typeof src === "string" && /^https?:\/\//.test(src) ? (
                  <img src={src} alt={alt ?? ""} />
                ) : null,
            }}
          >
            {readme}
          </Markdown>
        )}
      </div>
    </div>
  );
}
