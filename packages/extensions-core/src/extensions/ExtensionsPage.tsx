import { useState, useRef } from "react";
import type { ExtensionContext } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";
import {
  getExtensionManager,
  type InstalledExtension,
  type ManifestPreview,
} from "@silo-code/extension-host/internal";
import { PermissionConsent } from "./PermissionConsent";
import {
  filterExtensions,
  hasBuiltins,
  showsReloadHint,
} from "./extensions-list-model";
import "./ExtensionsPage.css";

const mgr = getExtensionManager();

/**
 * Factory: the Extensions settings page closes over `ctx` so it can drive the
 * native folder picker, confirm dialogs, and toasts. Structure mirrors the
 * Editor / Keyboard Shortcuts pages (header + flat list).
 */
export function makeExtensionsPage(ctx: ExtensionContext) {
  return function ExtensionsPage() {
    const { extensions } = useServiceState(mgr);
    const [busy, setBusy] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [showBuiltins, setShowBuiltins] = useState(false);

    const visible = filterExtensions(extensions, { query, showBuiltins });
    const builtinsPresent = hasBuiltins(extensions);
    const [installInput, setInstallInput] = useState("");
    const installInputRef = useRef<HTMLInputElement>(null);

    async function run(key: string, fn: () => Promise<void>) {
      setBusy(key);
      try {
        await fn();
      } catch (err) {
        ctx.ui.notify(
          "error",
          err instanceof Error ? err.message : String(err),
        );
      } finally {
        setBusy(null);
      }
    }

    async function requestConsent(preview: ManifestPreview): Promise<boolean> {
      if (preview.permissions.length === 0) return true;
      return (
        (await ctx.ui.showModal<boolean>(
          (close) => (
            <PermissionConsent
              name={preview.name}
              permissions={preview.permissions}
              onCancel={() => close(false)}
              onGrant={() => close(true)}
            />
          ),
          {
            size: "lg",
            dismissible: true,
            ariaLabel: `${preview.name} is requesting access`,
          },
        )) ?? false
      );
    }

    async function installFromRemote() {
      const value = installInput.trim();
      if (!value) return;
      setInstallInput("");
      const isUrl = value.startsWith("http://") || value.startsWith("https://");
      await run("install", async () => {
        if (isUrl) {
          await mgr.installFromUrl(value, requestConsent);
        } else {
          await mgr.installFromNpm(value, requestConsent);
        }
        ctx.ui.notify("info", "Extension installed");
      });
    }

    async function install() {
      const folder = await ctx.ui.pickFolder();
      if (!folder) return;
      const preview = await mgr.previewInstall(folder).catch((err) => {
        ctx.ui.notify(
          "error",
          err instanceof Error ? err.message : String(err),
        );
        return null;
      });
      if (!preview) return;
      if (!(await requestConsent(preview))) return;
      await run("install", async () => {
        await mgr.installFromFolder(folder);
        ctx.ui.notify("info", "Extension installed");
      });
    }

    function toggle(ext: InstalledExtension) {
      void run(ext.id, () =>
        ext.enabled ? mgr.disable(ext.id) : mgr.enable(ext.id),
      );
    }

    async function uninstall(ext: InstalledExtension) {
      const ok = await ctx.ui.confirm({
        title: `Uninstall ${ext.name}?`,
        body: "Its files will be removed from disk.",
        confirmLabel: "Uninstall",
        danger: true,
      });
      if (!ok) return;
      void run(ext.id, async () => {
        await mgr.uninstall(ext.id);
        ctx.ui.notify("info", `Uninstalled ${ext.name}`);
      });
    }

    return (
      <div className="ext-page">
        <div className="ext-header">
          <h2>Extensions</h2>
          <div className="ext-header-actions">
            {builtinsPresent && (
              <label className="ext-toggle">
                <input
                  type="checkbox"
                  checked={showBuiltins}
                  onChange={(e) => setShowBuiltins(e.target.checked)}
                />
                Show built-in extensions
              </label>
            )}
            <button
              className="ext-btn"
              onClick={install}
              disabled={busy === "install"}
            >
              Install from folder…
            </button>
          </div>
        </div>

        <div className="ext-install-remote">
          <input
            ref={installInputRef}
            className="ext-install-input"
            type="text"
            placeholder="npm package name or tarball URL…"
            value={installInput}
            onChange={(e) => setInstallInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void installFromRemote();
            }}
            disabled={busy === "install"}
          />
          <button
            className="ext-btn"
            onClick={() => void installFromRemote()}
            disabled={busy === "install" || !installInput.trim()}
          >
            Install
          </button>
        </div>

        {extensions.length > 0 && (
          <input
            className="ext-search"
            type="text"
            placeholder="Search extensions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        )}

        {extensions.length === 0 ? (
          <div className="ext-empty">
            No extensions installed. Use <b>Install from folder…</b> to add one.
          </div>
        ) : visible.length === 0 ? (
          <div className="ext-empty">No extensions match “{query}”.</div>
        ) : (
          <div className="ext-list">
            {visible.map((ext) => (
              <div key={ext.id} className="ext-row">
                <div className="ext-row-text">
                  <span className="ext-label">
                    {ext.name}
                    <span className="ext-brand">{ext.publisher}</span>
                    <span className="ext-version">v{ext.version}</span>
                    {!ext.enabled && (
                      <span className="ext-badge">disabled</span>
                    )}
                  </span>
                  <span className="ext-hint">{ext.description ?? ext.id}</span>
                  {showsReloadHint(ext) && (
                    <span className="ext-hint ext-hint-warn">
                      Reload the window to finish disabling this extension.
                    </span>
                  )}
                </div>
                <div className="ext-actions">
                  <button
                    className="ext-btn"
                    onClick={() => toggle(ext)}
                    disabled={busy === ext.id}
                  >
                    {ext.enabled ? "Disable" : "Enable"}
                  </button>
                  {!ext.builtin && (
                    <button
                      className="ext-btn ext-btn-danger"
                      onClick={() => uninstall(ext)}
                      disabled={busy === ext.id}
                    >
                      Uninstall
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };
}
