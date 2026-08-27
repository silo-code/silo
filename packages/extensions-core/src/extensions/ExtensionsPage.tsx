import { useEffect, useState } from "react";
import { ArrowsClockwise, DotsThreeVertical } from "@phosphor-icons/react";
import { useSnapshot } from "valtio";
import type { ExtensionContext, MenuEntry } from "@silo-code/sdk";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  MenuButton,
  SearchInput,
  SegmentedTabs,
  Tooltip,
  useServiceState,
} from "@silo-code/sdk";
import {
  getExtensionManager,
  fetchRegistryIndex,
  SettingsHeaderActions,
  type InstalledExtension,
  type ManifestPreview,
  type RegistryExtension,
  type RegistryUpdate,
} from "@silo-code/extension-host/internal";
import { PermissionConsent } from "./PermissionConsent";
import {
  filterExtensions,
  localInstallSource,
  partitionBuiltins,
  showsReloadHint,
  showsUpdateAction,
} from "./extensions-list-model";
import {
  browseInstallState,
  filterRegistry,
  isInstallable,
  publisherOf,
  registryCategories,
} from "./browse-model";
import { ExtensionCard } from "./ExtensionCard";
import { extensionIconFor } from "./extension-icons";
import { sourceBadgeLabel } from "./source-meta";
import { ExtensionDetail } from "./ExtensionDetail";
import { extensionsOnboarding, markVisited } from "./extensions-onboarding";
import "./ExtensionsPage.css";

const mgr = getExtensionManager();

/**
 * The Settings-rail badge for the Extensions page (registered as
 * `SettingsPage.badge`): a "New" onboarding pill until the page is opened
 * once, then the update-count pill (mirroring Installed). Reads the manager's
 * reactive state directly rather than the page's own `updates` (which only
 * exists once this page has mounted and fetched the registry).
 */
export function ExtensionsRailBadge() {
  const { visited } = useSnapshot(extensionsOnboarding);
  const { availableUpdates } = useServiceState(mgr);
  if (!visited) {
    return <Badge tone="accent">New</Badge>;
  }
  if (availableUpdates.length === 0) return null;
  return <Badge tone="accent">{availableUpdates.length}</Badge>;
}

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
    const [registry, setRegistry] = useState<RegistryState>({
      status: "loading",
    });
    const [updates, setUpdates] = useState<RegistryUpdate[]>([]);

    // First mount clears the status-bar / rail onboarding indicators.
    useEffect(() => {
      markVisited(ctx.storage.global);
    }, [ctx.storage.global]);

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

    const visible = filterExtensions(extensions, { query });
    // Built-ins are always listed, in their own headed group below the user's
    // own installs, rather than behind a toggle that hid half of what's running.
    const groups = partitionBuiltins(visible);
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
        // `null` = the user declined the permission prompt. Nothing was
        // installed, so there's nothing to confirm — the toast used to fire
        // either way, reporting an install that didn't happen.
        const name = await mgr.installFromRegistry(id, requestConsent);
        if (!name) return;
        setUpdates(await mgr.checkUpdates().catch(() => []));
        ctx.ui.notify("info", `Installed ${name}`);
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
        const name = isUrl
          ? await mgr.installFromUrl(value, requestConsent)
          : await mgr.installFromNpm(value, requestConsent);
        if (!name) return;
        ctx.ui.notify("info", `Installed ${name}`);
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
        // Consent already happened above, so reaching here means it installed;
        // the preview is where the name comes from on this path.
        ctx.ui.notify("info", `Installed ${preview.name}`);
      });
    }

    function toggle(ext: InstalledExtension) {
      void run(ext.id, () =>
        ext.enabled ? mgr.disable(ext.id) : mgr.enable(ext.id),
      );
    }

    function update(ext: Pick<InstalledExtension, "id" | "name">) {
      void run(ext.id, async () => {
        // `null` = consent for the widened permissions was declined; nothing
        // was swapped, so don't claim it was updated.
        const name = await mgr.update(ext.id, requestConsent);
        if (!name) return;
        setUpdates(await mgr.checkUpdates().catch(() => []));
        ctx.ui.notify("info", `Updated ${name}`);
      });
    }

    function updateAll() {
      void run("update-all", async () => {
        // Sequential on purpose: each update may pop a consent modal, and two
        // in-flight file swaps racing each other helps nobody.
        let updated = 0;
        for (const u of updates) {
          // Declining one consent skips that extension without abandoning the
          // rest, so report the count that actually landed.
          if (await mgr.update(u.id, requestConsent)) updated += 1;
        }
        setUpdates(await mgr.checkUpdates().catch(() => []));
        if (updated === 0) return;
        ctx.ui.notify(
          "info",
          `Updated ${updated} extension${updated === 1 ? "" : "s"}`,
        );
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

    const listTab = view.kind;

    return (
      <>
        <SettingsHeaderActions>
          <SegmentedTabs
            tabs={[
              { id: "browse", label: "Browse" },
              {
                id: "installed",
                label:
                  updates.length > 0
                    ? `Installed (${updates.length})`
                    : "Installed",
              },
            ]}
            active={listTab}
            onSelect={(id) => setView({ kind: id })}
          />
          <Tooltip content="More install options">
            <IconButton
              size="sm"
              aria-label="More install options"
              onClick={(e) => openPageMenu(e.currentTarget)}
            >
              <DotsThreeVertical size={16} weight="bold" />
            </IconButton>
          </Tooltip>
        </SettingsHeaderActions>
        <div className="ext-page">
          {view.kind === "browse" ? (
            <>
              <div className="ext-list-bar">
                <SearchInput
                  value={browseQuery}
                  onValueChange={setBrowseQuery}
                  placeholder="Search the extension registry…"
                />
                {renderUpdateAll()}
              </div>
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
                <EmptyState title="Loading the extension registry…" />
              ) : registry.status === "error" ? (
                <EmptyState
                  title="Couldn't reach the extension registry"
                  description={registry.message}
                  action={
                    <Button onClick={() => void loadRegistry()}>Retry</Button>
                  }
                />
              ) : catalog.length === 0 ? (
                <EmptyState title="No extensions match." />
              ) : (
                <div className="ext-grid silo-scroll">
                  {catalog.map((entry) => {
                    const state = browseInstallState(
                      entry,
                      extensions,
                      updates,
                    );
                    const installedExt = extensions.find(
                      (e) => e.id === entry.id,
                    );
                    // A folder/URL/npm install of this id: note the origin in
                    // place of the registry download count (it's not this build).
                    const localSource = localInstallSource(installedExt);
                    const upd = updates.find((u) => u.id === entry.id);
                    return (
                      <ExtensionCard
                        key={entry.id}
                        name={entry.name}
                        icon={extensionIconFor(entry.id)}
                        publisher={publisherOf(entry.id)}
                        verified={entry.latest?.provenance === "attested"}
                        description={entry.description}
                        onOpenDetails={() =>
                          setView({
                            kind: "detail",
                            id: entry.id,
                            from: "browse",
                          })
                        }
                        badges={
                          <>
                            {entry.latest && (
                              <span className="ext-version">
                                v{entry.latest.version}
                              </span>
                            )}
                            {state === "update-available" && (
                              <Badge tone="warn">Update</Badge>
                            )}
                            {localSource ? (
                              <Badge tone="outline">
                                {sourceBadgeLabel(localSource.kind)}
                              </Badge>
                            ) : (
                              <span className="ext-card-meta">
                                <span className="ext-card-downloads">
                                  {entry.totalDownloads}
                                </span>{" "}
                                downloads
                              </span>
                            )}
                          </>
                        }
                        action={
                          upd && installedExt ? (
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={busy === entry.id}
                              onClick={() => update(installedExt)}
                            >
                              Update
                            </Button>
                          ) : state === "installed" ? (
                            // Not a button: there's nothing to do to an already
                            // installed extension from here. Styled like the
                            // Install it replaces so the grid keeps one rhythm.
                            <span className="ext-card-installed">
                              Installed
                            </span>
                          ) : state === "not-installed" &&
                            isInstallable(entry) ? (
                            <Button
                              size="sm"
                              disabled={busy === entry.id}
                              onClick={() => installFromRegistry(entry.id)}
                            >
                              Install
                            </Button>
                          ) : null
                        }
                        menu={
                          installedExt ? (
                            <MenuButton
                              size="sm"
                              label="More"
                              aria-label="Extension actions"
                              disabled={busy === entry.id}
                              onClick={(e) =>
                                openRowMenu(installedExt, e.currentTarget)
                              }
                            />
                          ) : null
                        }
                      />
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="ext-list-bar">
                {extensions.length > 0 && (
                  <SearchInput
                    value={query}
                    onValueChange={setQuery}
                    placeholder="Search installed extensions…"
                  />
                )}
                {renderUpdateAll()}
              </div>

              {extensions.length === 0 ? (
                <EmptyState
                  title="No extensions installed yet"
                  description="Find one in Browse."
                />
              ) : visible.length === 0 ? (
                <EmptyState title={`No extensions match “${query}”.`} />
              ) : (
                <div className="ext-groups silo-scroll">
                  {groups.installed.length > 0 && (
                    <div className="ext-grid">
                      {groups.installed.map(renderInstalledCard)}
                    </div>
                  )}
                  {groups.builtin.length > 0 && (
                    <>
                      <h3 className="ext-group-head">Built-in Extensions</h3>
                      <div className="ext-grid">
                        {groups.builtin.map(renderInstalledCard)}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </>
    );

    /**
     * "Update all", in the filter bar of *both* list tabs. Pending updates are
     * a fact about what's installed, not about which tab is open — the count
     * already rides the Installed tab label and the Settings rail badge from
     * either view, and `updateAll` never touches the catalog — so hiding the
     * action on Browse only meant seeing the count there with no way to act on
     * it. Renders nothing when there's nothing to update, which is the common
     * case on both tabs.
     */
    function renderUpdateAll() {
      if (updates.length === 0) return null;
      return (
        <Button variant="primary" onClick={updateAll} disabled={busy !== null}>
          Update all ({updates.length})
        </Button>
      );
    }

    // One card renderer for both groups — an installed extension looks the same
    // whether the user put it there or Silo ships it; only the heading above it
    // and its own Built-in badge say which.
    function renderInstalledCard(ext: InstalledExtension) {
      const upd = updates.find((u) => u.id === ext.id);
      // Folder/URL/npm origin, noted compactly; the full path lives in the
      // detail callout (registry installs need no note).
      const localSource = localInstallSource(ext);
      // Built-ins can't be uninstalled and the "Built-in" badge already says
      // they're present — an "Installed" pill on top is just noise. (Pulled
      // out of the `action` prop below and given its own boolean rather than
      // a `null` ternary branch: Prettier doesn't format a comment attached
      // to a bare `null` branch stably — each re-format further garbles it.)
      const showInstalledPill = !upd && !ext.builtin;
      return (
        <ExtensionCard
          key={ext.id}
          name={ext.name}
          icon={extensionIconFor(ext.id)}
          publisher={ext.publisher}
          description={ext.description}
          onOpenDetails={() =>
            setView({
              kind: "detail",
              id: ext.id,
              from: "installed",
            })
          }
          badges={
            <>
              <span className="ext-version">v{ext.version}</span>
              {ext.builtin && <Badge tone="outline">Built-in</Badge>}
              {!ext.enabled && <Badge tone="neutral">disabled</Badge>}
              {localSource && (
                <Badge tone="outline">
                  {sourceBadgeLabel(localSource.kind)}
                </Badge>
              )}
            </>
          }
          notes={
            <>
              {upd && (
                <span className="ext-hint">
                  Update available: v{upd.latestVersion}
                  {upd.widensPermissions && " (requests new permissions)"}
                </span>
              )}
              {showsReloadHint(ext) && (
                <span className="ext-hint ext-hint-warn">
                  Reload the window to finish disabling this extension.
                </span>
              )}
              {!ext.engineCompatible && (
                <span className="ext-hint ext-hint-warn">
                  Needs Silo {ext.engine} — you&rsquo;re on {ext.hostVersion}.
                  Update Silo to use this extension.
                </span>
              )}
            </>
          }
          action={
            upd ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy === ext.id}
                onClick={() => update(ext)}
              >
                Update
              </Button>
            ) : (
              showInstalledPill && (
                <span className="ext-card-installed">Installed</span>
              )
            )
          }
          menu={
            <MenuButton
              size="sm"
              label="More"
              aria-label="Extension actions"
              disabled={busy === ext.id}
              onClick={(e) => openRowMenu(ext, e.currentTarget)}
            />
          }
        />
      );
    }
  };
}
