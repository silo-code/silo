import { useEffect, useState } from "react";
import {
  ArrowsClockwise,
  DotsThreeVertical,
  Folder,
  LinkSimple,
  Package,
  SealCheck,
  Storefront,
} from "@phosphor-icons/react";
import type { ExtensionContext, MenuEntry } from "@silo-code/sdk";
import { useServiceState } from "@silo-code/sdk";
import {
  getExtensionManager,
  fetchRegistryIndex,
  type InstallSource,
  type InstalledExtension,
  type ManifestPreview,
  type RegistryExtension,
  type RegistryUpdate,
} from "@silo-code/extension-host/internal";
import { PermissionConsent } from "./PermissionConsent";
import {
  describeSource,
  filterExtensions,
  hasBuiltins,
  showsReloadHint,
  showsUpdateAction,
} from "./extensions-list-model";
import {
  browseInstallState,
  filterRegistry,
  isInstallable,
  registryCategories,
} from "./browse-model";
import { ExtensionDetail } from "./ExtensionDetail";
import "./ExtensionsPage.css";

const mgr = getExtensionManager();

// The label prefix ("Folder: ", "URL: ", …) is redundant once the kind is
// legible at a glance — an icon says the same thing in less width, leaving
// more room for the (often long) path/URL/id itself.
const SOURCE_ICON: Record<InstallSource["kind"], typeof Folder> = {
  folder: Folder,
  url: LinkSimple,
  npm: Package,
  registry: Storefront,
};

/** Which pane the page is showing. Browse (the registry) is the landing view. */
type View =
  | { kind: "browse" }
  | { kind: "installed" }
  | { kind: "detail"; id: string; from: "browse" | "installed" };

type RegistryState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: RegistryExtension[] };

/**
 * Factory: the Extensions settings page closes over `ctx` so it can drive the
 * native folder picker, confirm dialogs, and toasts. The registry Browse view
 * is the primary surface (RFC 0014); folder/URL/npm installs live behind the
 * page-level overflow menu.
 */
export function makeExtensionsPage(ctx: ExtensionContext) {
  return function ExtensionsPage() {
    const { extensions } = useServiceState(mgr);
    const [busy, setBusy] = useState<string | null>(null);
    const [view, setView] = useState<View>({ kind: "browse" });
    const [query, setQuery] = useState("");
    const [browseQuery, setBrowseQuery] = useState("");
    const [category, setCategory] = useState("");
    const [showBuiltins, setShowBuiltins] = useState(false);
    const [registry, setRegistry] = useState<RegistryState>({
      status: "loading",
    });
    const [updates, setUpdates] = useState<RegistryUpdate[]>([]);

    // One index fetch feeds both the catalog and the update check; the fetch
    // is ETag-conditional so re-opening the page is a zero-body 304.
    async function loadRegistry() {
      setRegistry({ status: "loading" });
      try {
        const index = await fetchRegistryIndex();
        setRegistry({ status: "ready", entries: index.extensions });
        setUpdates(await mgr.checkUpdates());
      } catch (err) {
        setRegistry({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    useEffect(() => {
      void loadRegistry();
    }, []);

    const visible = filterExtensions(extensions, { query, showBuiltins });
    const builtinsPresent = hasBuiltins(extensions);
    const catalog =
      registry.status === "ready"
        ? filterRegistry(registry.entries, { query: browseQuery, category })
        : [];

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
      if (preview.permissions.length === 0 && preview.engineCompatible)
        return true;
      return (
        (await ctx.ui.showModal<boolean>(
          (close) => (
            <PermissionConsent
              name={preview.name}
              permissions={preview.permissions}
              engine={preview.engine}
              hostVersion={preview.hostVersion}
              engineCompatible={preview.engineCompatible}
              onCancel={() => close(false)}
              onGrant={() => close(true)}
            />
          ),
          {
            size: "md",
            dismissible: true,
            ariaLabel: `${preview.name} is requesting access`,
          },
        )) ?? false
      );
    }

    function installFromRegistry(id: string) {
      void run(id, async () => {
        await mgr.installFromRegistry(id, requestConsent);
        setUpdates(await mgr.checkUpdates().catch(() => []));
        ctx.ui.notify("info", `Installed ${id}`);
      });
    }

    async function installFromRemote() {
      const value = (
        await ctx.ui.prompt({
          title: "Install from URL or npm",
          placeholder: "npm package name or tarball URL…",
        })
      )?.trim();
      if (!value) return;
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

    async function installFromFolder() {
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

    function update(ext: Pick<InstalledExtension, "id" | "name">) {
      void run(ext.id, async () => {
        await mgr.update(ext.id, requestConsent);
        setUpdates(await mgr.checkUpdates().catch(() => []));
        ctx.ui.notify("info", `Updated ${ext.name}`);
      });
    }

    function updateAll() {
      void run("update-all", async () => {
        // Sequential on purpose: each update may pop a consent modal, and two
        // in-flight file swaps racing each other helps nobody.
        for (const u of updates) {
          await mgr.update(u.id, requestConsent);
        }
        setUpdates(await mgr.checkUpdates().catch(() => []));
        ctx.ui.notify("info", "Extensions updated");
      });
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

    // Folder/URL/npm installs are the secondary path (RFC 0014): still fully
    // supported, but tucked behind the page-level overflow instead of owning
    // header real estate.
    function openPageMenu(anchor: HTMLElement) {
      const items: MenuEntry[] = [
        { label: "Install from folder…", run: () => void installFromFolder() },
        {
          label: "Install from URL or npm…",
          run: () => void installFromRemote(),
        },
        { type: "separator" },
        { label: "Check for updates", run: () => void loadRegistry() },
      ];
      void ctx.ui.showMenu({ items, anchor, align: "end" });
    }

    function openRowMenu(ext: InstalledExtension, anchor: HTMLElement) {
      const items: MenuEntry[] = [];
      if (showsUpdateAction(ext)) {
        items.push({
          label: "Reload",
          icon: <ArrowsClockwise size={14} />,
          run: () => update(ext),
        });
      }
      items.push({
        label: ext.enabled ? "Disable" : "Enable",
        run: () => toggle(ext),
      });
      if (!ext.builtin) {
        items.push({ type: "separator" });
        items.push({
          label: "Uninstall",
          danger: true,
          run: () => uninstall(ext),
        });
      }
      void ctx.ui.showMenu({ items, anchor, align: "end" });
    }

    // ---- detail drill-in ----------------------------------------------------

    if (view.kind === "detail") {
      const installedExt = extensions.find((e) => e.id === view.id);
      const registryEntry =
        registry.status === "ready"
          ? registry.entries.find((e) => e.id === view.id)
          : undefined;
      return (
        <div className="ext-page">
          <ExtensionDetail
            ctx={ctx}
            id={view.id}
            installed={installedExt}
            registryEntry={registryEntry}
            update={updates.find((u) => u.id === view.id)}
            busy={busy !== null}
            onBack={() => setView({ kind: view.from })}
            onInstall={() => installFromRegistry(view.id)}
            onUpdate={() => installedExt && update(installedExt)}
            onToggle={() => installedExt && toggle(installedExt)}
            onUninstall={() => installedExt && void uninstall(installedExt)}
          />
        </div>
      );
    }

    // ---- list views ---------------------------------------------------------

    return (
      <div className="ext-page">
        <div className="ext-header">
          <h2>Extensions</h2>
          <div className="ext-header-actions">
            <div className="ext-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={view.kind === "browse"}
                className={`ext-tab${view.kind === "browse" ? " ext-tab-active" : ""}`}
                onClick={() => setView({ kind: "browse" })}
              >
                Browse
              </button>
              <button
                role="tab"
                aria-selected={view.kind === "installed"}
                className={`ext-tab${view.kind === "installed" ? " ext-tab-active" : ""}`}
                onClick={() => setView({ kind: "installed" })}
              >
                Installed
                {updates.length > 0 && (
                  <span className="ext-update-count">{updates.length}</span>
                )}
              </button>
            </div>
            <button
              className="ext-btn ext-btn-icon"
              onClick={(e) => openPageMenu(e.currentTarget)}
              title="More install options"
            >
              <DotsThreeVertical size={16} weight="bold" />
            </button>
          </div>
        </div>

        {view.kind === "browse" ? (
          <>
            <input
              className="ext-search"
              type="text"
              placeholder="Search the extension registry…"
              value={browseQuery}
              onChange={(e) => setBrowseQuery(e.target.value)}
            />
            {registry.status === "ready" && (
              <div className="ext-cats">
                <button
                  className={`ext-cat${category === "" ? " ext-cat-active" : ""}`}
                  onClick={() => setCategory("")}
                >
                  all
                </button>
                {registryCategories(registry.entries).map((c) => (
                  <button
                    key={c}
                    className={`ext-cat${category === c ? " ext-cat-active" : ""}`}
                    onClick={() => setCategory(category === c ? "" : c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
            {registry.status === "loading" ? (
              <div className="ext-empty">Loading the extension registry…</div>
            ) : registry.status === "error" ? (
              <div className="ext-empty">
                Couldn&rsquo;t reach the extension registry: {registry.message}{" "}
                <button className="ext-btn" onClick={() => void loadRegistry()}>
                  Retry
                </button>
              </div>
            ) : catalog.length === 0 ? (
              <div className="ext-empty">No extensions match.</div>
            ) : (
              <div className="ext-list">
                {catalog.map((entry) => {
                  const state = browseInstallState(entry, extensions, updates);
                  const installedExt = extensions.find(
                    (e) => e.id === entry.id,
                  );
                  const upd = updates.find((u) => u.id === entry.id);
                  return (
                    <div
                      key={entry.id}
                      className="ext-row ext-row-click"
                      onClick={() =>
                        setView({
                          kind: "detail",
                          id: entry.id,
                          from: "browse",
                        })
                      }
                    >
                      <div className="ext-row-top">
                        <div className="ext-row-text">
                          <span className="ext-label">
                            {entry.name}
                            {(() => {
                              const dot = entry.id.indexOf(".");
                              const publisher =
                                dot > 0 ? entry.id.slice(0, dot) : null;
                              return publisher ? (
                                <span className="ext-brand">
                                  {publisher[0].toUpperCase() +
                                    publisher.slice(1)}
                                </span>
                              ) : null;
                            })()}
                            {entry.latest && (
                              <span className="ext-version">
                                v{entry.latest.version}
                              </span>
                            )}
                            {entry.latest?.provenance === "attested" && (
                              <span
                                className="ext-badge-verified"
                                title="Build provenance verified"
                              >
                                <SealCheck size={12} weight="fill" /> verified
                              </span>
                            )}
                            {state === "installed" && (
                              <span className="ext-badge-builtin">
                                Installed
                              </span>
                            )}
                            {state === "update-available" && (
                              <span className="ext-badge">
                                update available
                              </span>
                            )}
                          </span>
                          <span className="ext-hint">{entry.description}</span>
                          <span className="ext-hint">
                            {entry.id}
                            {" · "}
                            {entry.latest?.permissions.length
                              ? `permissions: ${entry.latest.permissions.join(", ")}`
                              : "no permissions"}
                            {" · "}
                            {entry.totalDownloads} downloads
                          </span>
                        </div>
                        <div className="ext-actions">
                          {state === "not-installed" &&
                            isInstallable(entry) && (
                              <button
                                className="ext-btn"
                                disabled={busy === entry.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  installFromRegistry(entry.id);
                                }}
                              >
                                Install
                              </button>
                            )}
                          {upd && installedExt && (
                            <button
                              className="ext-btn"
                              disabled={busy === entry.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                update(installedExt);
                              }}
                            >
                              Update
                            </button>
                          )}
                          {installedExt && (
                            <button
                              className="ext-btn ext-row-btn ext-btn-icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRowMenu(installedExt, e.currentTarget);
                              }}
                              disabled={busy === entry.id}
                              title="Extension actions"
                            >
                              <DotsThreeVertical size={16} weight="bold" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="ext-installed-bar">
              {extensions.length > 0 && (
                <input
                  className="ext-search"
                  type="text"
                  placeholder="Search installed extensions…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
              {builtinsPresent && (
                <label className="ext-toggle">
                  <input
                    type="checkbox"
                    checked={showBuiltins}
                    onChange={(e) => setShowBuiltins(e.target.checked)}
                  />
                  Show built-in
                </label>
              )}
              {updates.length > 0 && (
                <button
                  className="ext-btn"
                  onClick={updateAll}
                  disabled={busy !== null}
                >
                  Update all ({updates.length})
                </button>
              )}
            </div>

            {extensions.length === 0 ? (
              <div className="ext-empty">
                No extensions installed yet — find one in <b>Browse</b>.
              </div>
            ) : visible.length === 0 ? (
              <div className="ext-empty">No extensions match “{query}”.</div>
            ) : (
              <div className="ext-list">
                {visible.map((ext) => {
                  const upd = updates.find((u) => u.id === ext.id);
                  return (
                    <div
                      key={ext.id}
                      className="ext-row ext-row-click"
                      onClick={() =>
                        setView({
                          kind: "detail",
                          id: ext.id,
                          from: "installed",
                        })
                      }
                    >
                      <div className="ext-row-top">
                        <div className="ext-row-text">
                          <span className="ext-label">
                            {ext.name}
                            <span className="ext-brand">{ext.publisher}</span>
                            {ext.builtin && (
                              <span className="ext-badge-builtin">
                                Built-in
                              </span>
                            )}
                            <span className="ext-version">v{ext.version}</span>
                            {!ext.enabled && (
                              <span className="ext-badge">disabled</span>
                            )}
                          </span>
                          <span className="ext-hint">
                            {ext.description ?? ext.id}
                          </span>
                          {upd && (
                            <span className="ext-hint">
                              Update available: v{upd.latestVersion}
                              {upd.widensPermissions &&
                                " (requests new permissions)"}
                            </span>
                          )}
                          {showsReloadHint(ext) && (
                            <span className="ext-hint ext-hint-warn">
                              Reload the window to finish disabling this
                              extension.
                            </span>
                          )}
                          {!ext.engineCompatible && (
                            <span className="ext-hint ext-hint-warn">
                              Needs Silo {ext.engine} — you&rsquo;re on{" "}
                              {ext.hostVersion}. Update Silo to use this
                              extension.
                            </span>
                          )}
                        </div>
                        <div className="ext-actions">
                          {upd && (
                            <button
                              className="ext-btn"
                              disabled={busy === ext.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                update(ext);
                              }}
                            >
                              Update
                            </button>
                          )}
                          <button
                            className="ext-btn ext-row-btn ext-btn-icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              openRowMenu(ext, e.currentTarget);
                            }}
                            disabled={busy === ext.id}
                            title="Extension actions"
                          >
                            <DotsThreeVertical size={16} weight="bold" />
                          </button>
                        </div>
                      </div>
                      {ext.source &&
                        (() => {
                          const SourceIcon = SOURCE_ICON[ext.source.kind];
                          return (
                            <span
                              className="ext-hint ext-source"
                              title={describeSource(ext.source)}
                            >
                              <SourceIcon size={12} />
                              <span className="ext-source-value">
                                {ext.source.value}
                              </span>
                            </span>
                          );
                        })()}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  };
}
