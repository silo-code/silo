/**
 * The extension manager — the host-side service behind the "Extensions" settings
 * page. Owns the installed-extension registry on disk
 * (`~/.config/silo/extensions/installed.json`), the install/uninstall/enable/
 * disable operations, and load-on-startup. It is a {@link ReactiveService} so the
 * UI can `useServiceState` it.
 *
 * Exposed only via `@silo-code/extension-host/internal` (core-tier): loading and unloading
 * extensions is a privileged capability third-party extensions must not have.
 *
 * @internal
 */
import { tempDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { userConfigDir } from "../services/user-config";
import {
  fsReadText,
  fsWriteText,
  fsCopyDir,
  fsDelete,
  fsPathExists,
  fsCreateDir,
  fsRename,
} from "../services/tauri-fs";
import {
  loadExtension,
  unloadExtension,
  isLoaded,
  needsReload,
} from "./extension-loader";
import { reportError } from "./global-error-capture";
import {
  isBuiltin,
  enableBuiltin,
  disableBuiltin,
  builtinRows,
} from "./builtins-registry";
import {
  migrateDisabledBuiltins,
  isSupersededOnDiskId,
  SUPERSEDED_BUILTIN_IDS,
  SUPERSEDED_BUILTIN_TOAST_TITLES,
} from "../state/extension-id-migration";
import {
  deleteExtensionData,
  extensionDataExists,
  extensionDataInfo,
  initStorageRoot,
  renameExtensionData,
  type ExtensionDataInfo,
} from "./extension-storage-dirs";
import { extHostLog } from "./extension-host-logger";
import { pushToast } from "./ui-service";
import { appVersion } from "../services/tauri-app";
import { isEngineCompatible } from "./engine-compat";
import {
  fetchRegistryIndex,
  findUpdates,
  resolveRegistryInstall,
  type RegistryUpdate,
} from "./registry-client";
import type { Disposable, Permission } from "@silo-code/sdk";
import type { ReactiveService } from "@silo-code/sdk";

/** The capability vocabulary the host understands in `silo.permissions`. */
const KNOWN_PERMISSIONS: readonly Permission[] = [
  "fs:read",
  "fs:write",
  "process",
  "network",
  "webview",
];

/**
 * Validate a manifest's `silo.permissions`. Absent → none. Must be an array of
 * known {@link Permission} strings; an unknown or malformed entry rejects the
 * whole manifest (the user would otherwise consent to a capability the host
 * can't reason about). Deduplicated, order preserved.
 */
export function validateManifestPermissions(
  raw: unknown,
  sourceLabel: string,
): Permission[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`${sourceLabel}: silo.permissions must be an array`);
  }
  const out: Permission[] = [];
  for (const entry of raw) {
    if (
      typeof entry !== "string" ||
      !(KNOWN_PERMISSIONS as readonly string[]).includes(entry)
    ) {
      throw new Error(
        `${sourceLabel}: unknown permission ${JSON.stringify(entry)} (allowed: ${KNOWN_PERMISSIONS.join(", ")})`,
      );
    }
    if (!out.includes(entry as Permission)) out.push(entry as Permission);
  }
  return out;
}

/**
 * Where an install came from, persisted so {@link ExtensionManager.update} can
 * re-fetch the same package later without an uninstall/reinstall round-trip.
 */
export interface InstallSource {
  kind: "folder" | "url" | "npm" | "registry";
  /**
   * `folder`: absolute path to the source folder; `url`: the tarball URL;
   * `npm`: the original spec as typed (`"pkg"` or `"@scope/pkg@1.2.0"`), so an
   * unpinned spec re-resolves to latest on update while a pinned one stays
   * pinned; `registry`: the extension id, re-resolved against the registry
   * index (with its pinned digest) on update.
   */
  value: string;
}

/** One row in the manager's UI list. */
export interface InstalledExtension {
  /** The extension id (e.g. `"acme.hello"`). */
  id: string;
  /** Human-friendly name shown in the list. */
  name: string;
  /** Version string from the extension's manifest. */
  version: string;
  /** Optional one-line description. */
  description?: string;
  /**
   * Publisher/brand shown beside the name. `"Silo"` for built-ins; for
   * third-party extensions the `silo.publisher` manifest key, falling back to
   * the id's namespace (e.g. `"acme"` for `"acme.hello"`).
   */
  publisher: string;
  /** Whether the extension is enabled (loads on startup / is loaded now). */
  enabled: boolean;
  /** Whether it's currently loaded into the running host. */
  loaded: boolean;
  /**
   * A first-party built-in (`silo.*`). Built-ins can be disabled but never
   * uninstalled (no files on disk), so the UI hides the Uninstall action.
   */
  builtin: boolean;
  /**
   * The extension contributed a dock panel kind, which can't be unmounted from
   * an already-mounted dock — so disabling it needs a window reload to fully
   * take effect. The UI shows a hint when this is set.
   */
  reloadRequired?: boolean;
  /** Capabilities the user granted at install (from the manifest). */
  permissions: readonly Permission[];
  /** The `silo.engine` floor declared by the extension (e.g. `"^0.17.0"`). */
  engine?: string;
  /** The running Silo version at the time this row was built. */
  hostVersion: string;
  /**
   * `false` when the host version is below the extension's declared `engine`
   * floor. The extension is still installed and may partially work — this is a
   * warning, not a hard block.
   */
  engineCompatible: boolean;
  /**
   * Where the extension was installed from, when recorded. Absent for built-ins
   * and for records installed before source tracking existed — the UI hides the
   * Update action for those (a one-time reinstall records it).
   */
  source?: InstallSource;
}

export interface ExtensionManagerState {
  extensions: readonly InstalledExtension[];
  /**
   * Registry updates available for installed extensions, as of the last
   * {@link ExtensionManager.checkUpdates} call. Empty until the first check
   * (startup kicks one off; see `main.tsx`) — surfaces the same data the
   * Extensions page shows, reactively, so other UI (status bar, settings
   * rail) can indicate updates without polling the registry themselves.
   */
  availableUpdates: readonly RegistryUpdate[];
}

export interface ExtensionManager extends ReactiveService<ExtensionManagerState> {
  /**
   * Install from a source folder (copied into the extensions dir), then load.
   * `source` overrides the recorded {@link InstallSource} — the URL/npm paths
   * pass their true origin here so the temp staging dir is never recorded.
   */
  installFromFolder(srcDir: string, source?: InstallSource): Promise<void>;
  /**
   * Unload (if loaded), delete the folder, and drop the record. Rejects for
   * built-ins.
   *
   * The extension's **storage directory** (RFC 0032) is kept by default — a
   * `.jsonl` the user has been editing is not app state, and reinstalling
   * restores it. Pass `deleteData: true` (the opt-in checkbox on the uninstall
   * confirm) to remove it. A directory holding no files is removed either way:
   * there is nothing to lose and no reason to litter. Failing to delete the
   * data never fails the uninstall.
   */
  uninstall(id: string, opts?: { deleteData?: boolean }): Promise<void>;
  /**
   * File count + size of an extension's storage directory, for the uninstall
   * confirm. `null` when there is nothing a user could lose (absent, or no
   * files) — the UI then shows the plain confirm with no checkbox.
   */
  getDataInfo(id: string): Promise<ExtensionDataInfo | null>;
  /** Enable: load a third-party extension, or hot-enable a built-in. */
  enable(id: string): Promise<void>;
  /** Disable: unload a third-party extension, or hot-disable a built-in. */
  disable(id: string): Promise<void>;
  /** Load every enabled extension. Called once at startup after builtins. */
  loadInstalled(): Promise<void>;
  /**
   * Apply the persisted disabled-built-in set: hot-disable each one **without**
   * re-persisting (the choice is already on disk). Built-ins must be activated
   * synchronously before the first render, so the disable pass runs just after,
   * asynchronously. Called once at startup.
   */
  applyDisabledBuiltins(): Promise<void>;
  /** The set of built-in ids the user has disabled, persisted in `installed.json`. */
  readDisabledBuiltins(): Promise<ReadonlySet<string>>;
  /**
   * Read a source folder's manifest **without installing** — so the UI can show
   * the requested permissions and get consent before committing the install.
   */
  previewInstall(srcDir: string): Promise<ManifestPreview>;
  /**
   * Download a package from the npm registry by name (`"acme-tool"` or
   * `"@acme/silo-tool@1.2.0"`), extract it to a staging dir, show the
   * permissions consent dialog via `requestConsent`, and install if granted.
   *
   * The tarball is downloaded from the npm registry CDN. `requestConsent` is
   * called even when `permissions` is empty so the caller can show a summary
   * before committing — return `true` to proceed, `false` to abort.
   *
   * Resolves to the installed extension's display name, or `null` when the
   * user declined consent (see {@link ExtensionManager.installFromUrl}).
   */
  installFromNpm(
    packageName: string,
    requestConsent: (preview: ManifestPreview) => Promise<boolean>,
  ): Promise<string | null>;
  /**
   * Download a `.tgz` tarball from any URL, extract it, show the permissions
   * consent dialog via `requestConsent`, and install if granted. Covers GitHub
   * release assets and any direct tarball URL.
   *
   * The tarball must contain a `package.json` with a `silo.*` manifest at its
   * root or under a `package/` prefix (the npm standard layout).
   *
   * `source` overrides the recorded {@link InstallSource} (the npm path passes
   * the original package spec here instead of the resolved tarball URL).
   *
   * Resolves to the installed extension's **display name** on success, or
   * `null` when `requestConsent` declined and nothing was installed. Callers
   * need both halves: the name so a confirmation can say what was installed
   * rather than echo an id, and the null so declining doesn't get reported as
   * a successful install.
   */
  installFromUrl(
    url: string,
    requestConsent: (preview: ManifestPreview) => Promise<boolean>,
    source?: InstallSource,
    expectedSha256?: string,
  ): Promise<string | null>;
  /**
   * Install an extension by id from the Silo Extension Registry (RFC 0014):
   * resolve the id against the registry index, download the pinned tarball,
   * **verify its sha256 against the digest the registry recorded at ingest**
   * (a swapped or tampered asset fails before extraction), then run the
   * standard consent + install pipeline. Records `{ kind: "registry" }` as the
   * install source so updates re-resolve (and re-verify) through the index.
   *
   * Resolves to the installed extension's display name, or `null` when the
   * user declined consent (see {@link ExtensionManager.installFromUrl}).
   */
  installFromRegistry(
    id: string,
    requestConsent: (preview: ManifestPreview) => Promise<boolean>,
  ): Promise<string | null>;
  /**
   * Diff installed registry-sourced extensions against the registry index and
   * return the available updates. Cheap to poll: the index fetch is
   * ETag-conditional, so the steady state is a zero-body 304.
   */
  checkUpdates(): Promise<RegistryUpdate[]>;
  /**
   * The README.md shipped inside an installed extension's package (npm pack
   * always includes it), for the detail view. `null` when absent.
   */
  readInstalledReadme(id: string): Promise<string | null>;
  /**
   * Update an installed extension in place from its recorded
   * {@link InstallSource}: re-fetch the package (folder: re-copy; url/npm:
   * re-download), unload the running version, swap the files, and reload —
   * keeping the extension id and record so panel/dock state survives.
   *
   * Consent is re-requested via `requestConsent` **only** when the new manifest
   * widens the granted permission set or the engine floor is unmet (see
   * {@link updateNeedsConsent}); returning `false` aborts. If loading the new
   * version fails, the previous files, record, and running version are restored
   * and the original error is rethrown.
   *
   * Resolves to the updated extension's display name, or `null` when consent
   * was declined and nothing changed — so a caller doesn't report an update
   * that didn't happen.
   *
   * Rejects for built-ins and for records with no recorded source (installed
   * before source tracking — reinstall once from the original source).
   */
  update(
    id: string,
    requestConsent: (preview: ManifestPreview) => Promise<boolean>,
  ): Promise<string | null>;
}

/** A peek at an extension about to be installed, for the consent prompt. */
export interface ManifestPreview {
  id: string;
  name: string;
  permissions: readonly Permission[];
  /** The `silo.engine` floor declared by the manifest (e.g. `"^0.17.0"`). */
  engine?: string;
  /** The running Silo version, for messaging in the consent dialog. */
  hostVersion: string;
  /** `false` when the host is below the declared engine floor. */
  engineCompatible: boolean;
}

/** The on-disk manifest fields the host reads (a subset of package.json). */
interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** Publisher/brand (from the `silo.publisher` key); falls back to the id namespace. */
  publisher?: string;
  main: string;
  permissions: Permission[];
  /** Minimum host version floor declared by the extension (`silo.engine`). */
  engine?: string;
}

/**
 * A persisted record in installed.json. `dir` is relative to the extensions
 * root. `permissions` is the set the user consented to at install — the source
 * of truth at load time (so a later manifest edit can't silently widen access).
 */
interface InstalledRecord {
  id: string;
  dir: string;
  enabled: boolean;
  permissions?: Permission[];
  /** Where the install came from; absent on records from before source tracking. */
  source?: InstallSource;
}

interface InstalledFile {
  version: number;
  extensions: InstalledRecord[];
  /** Built-in ids the user has disabled (built-ins have no `extensions` record). */
  disabledBuiltins?: string[];
}

/** Brand for a third-party row: the declared publisher, else the id's namespace. */
function publisherFor(id: string, declared?: string): string {
  const trimmed = declared?.trim();
  if (trimmed) return trimmed;
  const ns = id.split(".")[0];
  return ns || id;
}

const REGISTRY_VERSION = 1;

async function extensionsRoot(): Promise<string> {
  return `${await userConfigDir()}/extensions`;
}

function parseManifest(
  pkgJson: string,
  sourceLabel: string,
): ExtensionManifest {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(pkgJson) as Record<string, unknown>;
  } catch {
    throw new Error(`${sourceLabel}: package.json is not valid JSON`);
  }
  const silo = (pkg.silo ?? {}) as Record<string, unknown>;
  const id = typeof silo.id === "string" ? silo.id : undefined;
  const main = typeof silo.main === "string" ? silo.main : undefined;
  if (!id || !main) {
    throw new Error(
      `${sourceLabel}: package.json must declare \`silo.id\` and \`silo.main\``,
    );
  }
  // `id` and `main` come from an untrusted package.json and are used to build
  // filesystem paths (`<extensionsRoot>/<id>/`, `<dir>/<main>`). Validate both so
  // a crafted manifest can't escape the extensions dir (path traversal). The id
  // charset (must start alphanumeric, no slashes) also can't be "." or "..".
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new Error(
      `${sourceLabel}: invalid silo.id "${id}" — use letters, digits, and . _ - (no slashes, must start alphanumeric)`,
    );
  }
  const mainSegments = main.split(/[\\/]+/);
  if (
    main.startsWith("/") ||
    /^[A-Za-z]:/.test(main) ||
    mainSegments.includes("..")
  ) {
    throw new Error(
      `${sourceLabel}: silo.main "${main}" must be a relative path inside the extension (no "..", not absolute)`,
    );
  }
  const name =
    (typeof pkg.displayName === "string" && pkg.displayName) ||
    (typeof pkg.name === "string" && pkg.name) ||
    id;
  const version = typeof pkg.version === "string" ? pkg.version : "0.0.0";
  const description =
    typeof pkg.description === "string" ? pkg.description : undefined;
  const publisher =
    typeof silo.publisher === "string" ? silo.publisher : undefined;
  const permissions = validateManifestPermissions(
    silo.permissions,
    sourceLabel,
  );
  const engine =
    typeof silo.engine === "string" && silo.engine ? silo.engine : undefined;
  return {
    id,
    name,
    version,
    description,
    publisher,
    main,
    permissions,
    engine,
  };
}

async function readManifest(dir: string): Promise<ExtensionManifest> {
  const text = await fsReadText(`${dir}/package.json`);
  return parseManifest(text, dir);
}

async function readInstalledFile(): Promise<InstalledFile> {
  const path = `${await extensionsRoot()}/installed.json`;
  if (!(await fsPathExists(path))) {
    return { version: REGISTRY_VERSION, extensions: [] };
  }
  try {
    const parsed = JSON.parse(await fsReadText(path)) as InstalledFile;
    if (!Array.isArray(parsed.extensions)) {
      return { version: REGISTRY_VERSION, extensions: [] };
    }
    const disabled = migrateDisabledBuiltins(parsed.disabledBuiltins);
    if (disabled.changed) {
      parsed.disabledBuiltins = disabled.ids;
      await writeInstalledFile(parsed);
    }
    return parsed;
  } catch {
    return { version: REGISTRY_VERSION, extensions: [] };
  }
}

async function writeInstalledFile(file: InstalledFile): Promise<void> {
  const path = `${await extensionsRoot()}/installed.json`;
  await fsWriteText(path, JSON.stringify(file, null, 2));
}

/**
 * Remove an on-disk third-party install whose id now matches a built-in (or was
 * superseded by one). Settings in `globalExtensionState` migrate separately.
 */
async function retireOnDiskInstall(id: string, dir: string): Promise<void> {
  if (isLoaded(id)) unloadExtension(id);
  const root = await extensionsRoot();
  const destDir = `${root}/${dir}`;
  if (await fsPathExists(destDir)) await fsDelete(destDir);
  await upsertRecord((file) => {
    file.extensions = file.extensions.filter((e) => e.id !== id);
  });
}

/**
 * Carry storage directories across every superseded extension id (RFC 0032 R7),
 * so the migration toast's "Your settings were kept" covers files too.
 *
 * Deliberately keyed on `SUPERSEDED_BUILTIN_IDS` rather than on the on-disk
 * install records being retired alongside it: a storage directory outlives its
 * install by design (uninstall keeps the data unless the user opts in), so a
 * user who uninstalled `oldId` before the built-in shipped has data but no
 * record. Gating on the record would orphan exactly that case.
 *
 * `renameExtensionData` is idempotent and refuses to clobber an existing
 * `<newId>`, so this is safe to run on every startup; the steady state is one
 * `fsPathExists` per mapping.
 */
async function migrateSupersededStorage(): Promise<void> {
  for (const [oldId, newId] of Object.entries(SUPERSEDED_BUILTIN_IDS)) {
    if (oldId === newId || !isBuiltin(newId)) continue;
    await renameExtensionData(oldId, newId).catch((err: unknown) => {
      extHostLog.warn(
        `Could not move extension storage from "${oldId}" to "${newId}"`,
        { error: err instanceof Error ? err.message : String(err) },
      );
    });
  }
}

/**
 * Decide what happens to an uninstalled extension's storage directory (R6).
 * The host never deletes a user's files on its own: with `deleteData` false the
 * directory survives and its path goes to the Output panel, because nothing
 * else in the product names it afterwards. A directory holding no files is
 * swept away regardless — there is nothing to lose.
 *
 * Every failure here is reported, never rethrown: the extension is already
 * uninstalled by this point, and failing the call would report a completed
 * operation as failed.
 */
async function handleStorageOnUninstall(
  id: string,
  deleteData: boolean,
): Promise<void> {
  try {
    if (deleteData) {
      const info = await extensionDataInfo(id);
      await deleteExtensionData(id);
      if (info) extHostLog.info(`Deleted extension data: ${info.path}`);
      return;
    }
    const info = await extensionDataInfo(id);
    if (info) {
      // A truncated walk has no trustworthy count — say so rather than
      // reporting the floor (0, when the depth cap stopped it) as fact.
      const count = info.truncated
        ? "contents not fully counted"
        : `${info.files} file(s)`;
      extHostLog.info(
        `Kept extension data for "${id}" — ${count} at ${info.path}`,
      );
      return;
    }
    // No files, but the directory may still be there (empty subfolders).
    if (await extensionDataExists(id)) await deleteExtensionData(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    extHostLog.error(`Extension data cleanup failed for "${id}"`, {
      error: message,
    });
    pushToast(
      "error",
      `${id} was uninstalled, but its stored data could not be removed: ${message}`,
      { title: "Extension data not removed" },
    );
  }
}

// ---- reactive state ----------------------------------------------------------

let cached: ExtensionManagerState = Object.freeze({
  extensions: [],
  availableUpdates: [],
});
const listeners = new Set<(s: ExtensionManagerState) => void>();

function emit(): void {
  for (const l of listeners) l(cached);
}

/**
 * Rebuild the snapshot from installed.json + each manifest. A record whose
 * folder/manifest can't be read is surfaced as a degraded row rather than
 * dropped, so the user can still uninstall it.
 */
async function refresh(): Promise<void> {
  const file = await readInstalledFile();
  const root = await extensionsRoot();
  const hostVersion = await appVersion().catch(() => "");
  const rows: InstalledExtension[] = [];
  for (const rec of file.extensions) {
    // A built-in with the same id owns the extension — skip the retired on-disk
    // row so Settings → Extensions never lists the id twice.
    if (isBuiltin(rec.id) || isSupersededOnDiskId(rec.id, isBuiltin)) continue;
    const dir = `${root}/${rec.dir}`;
    try {
      const m = await readManifest(dir);
      rows.push({
        id: rec.id,
        name: m.name,
        version: m.version,
        description: m.description,
        publisher: publisherFor(rec.id, m.publisher),
        enabled: rec.enabled,
        loaded: isLoaded(rec.id),
        builtin: false,
        reloadRequired: needsReload(rec.id) || undefined,
        permissions: rec.permissions ?? [],
        engine: m.engine,
        hostVersion,
        engineCompatible: isEngineCompatible(m.engine, hostVersion),
        source: rec.source,
      });
    } catch {
      rows.push({
        id: rec.id,
        name: rec.id,
        version: "—",
        description: "⚠ manifest unreadable",
        publisher: publisherFor(rec.id),
        enabled: rec.enabled,
        loaded: isLoaded(rec.id),
        builtin: false,
        reloadRequired: needsReload(rec.id) || undefined,
        permissions: rec.permissions ?? [],
        hostVersion,
        engineCompatible: true, // can't read manifest → no constraint to check
        source: rec.source,
      });
    }
  }
  // Merge the first-party built-in rows (silo.* only; core.* is excluded at the
  // source). Built-ins have no on-disk record or permissions; `loaded` mirrors
  // `enabled` (no disk/memory split).
  for (const b of builtinRows()) {
    rows.push({
      id: b.id,
      name: b.name,
      version: b.version,
      description: b.description,
      publisher: b.publisher,
      enabled: b.enabled,
      loaded: b.enabled,
      builtin: true,
      reloadRequired: b.reloadRequired || undefined,
      permissions: [],
      hostVersion,
      engineCompatible: true, // built-ins ship with the host, always compatible
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  // Preserve the last update check — a refresh (install/uninstall/enable/
  // disable) doesn't itself change what's available upstream.
  cached = Object.freeze({
    extensions: rows,
    availableUpdates: cached.availableUpdates,
  });
  emit();
}

async function upsertRecord(
  mutate: (file: InstalledFile) => void,
): Promise<void> {
  const file = await readInstalledFile();
  mutate(file);
  file.version = REGISTRY_VERSION;
  await writeInstalledFile(file);
}

/** Add/remove a built-in id from the persisted `disabledBuiltins` set. */
async function setBuiltinDisabled(
  id: string,
  disabled: boolean,
): Promise<void> {
  await upsertRecord((file) => {
    const set = new Set(file.disabledBuiltins ?? []);
    if (disabled) set.add(id);
    else set.delete(id);
    file.disabledBuiltins = [...set];
  });
}

/**
 * Whether an update must re-prompt for consent: only when the new manifest
 * widens the already-granted permission set, or the host no longer meets the
 * declared engine floor. Equal or narrowed permissions update silently.
 */
export function updateNeedsConsent(
  granted: readonly Permission[],
  preview: Pick<ManifestPreview, "permissions" | "engineCompatible">,
): boolean {
  return (
    !preview.engineCompatible ||
    preview.permissions.some((p) => !granted.includes(p))
  );
}

// ---- npm / URL install helpers -----------------------------------------------

/** Parse `"name"`, `"name@ver"`, or `"@scope/name@ver"` into a fetch URL and resolved tarball URL. */
export async function resolveNpmTarball(packageName: string): Promise<string> {
  // Split off optional @version suffix — careful not to split the leading @ of
  // a scoped package name. "@scope/pkg@1.0.0" → name="@scope/pkg", tag="1.0.0".
  let name = packageName;
  let tag: string | undefined;
  const atIdx = packageName.lastIndexOf("@");
  if (atIdx > 0) {
    name = packageName.slice(0, atIdx);
    tag = packageName.slice(atIdx + 1) || undefined;
  }

  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(name).replace(/%2F/g, "/")}`;
  const resp = await fetch(registryUrl);
  if (!resp.ok) {
    throw new Error(`npm registry error for "${name}": HTTP ${resp.status}`);
  }
  const meta = (await resp.json()) as {
    "dist-tags"?: Record<string, string>;
    versions?: Record<string, { dist: { tarball: string } }>;
  };

  const version = tag ?? meta["dist-tags"]?.["latest"];
  if (!version) throw new Error(`No version found for "${name}"`);

  const versionData = meta.versions?.[version];
  if (!versionData)
    throw new Error(`Version "${version}" not found for "${name}"`);

  return versionData.dist.tarball;
}

/**
 * Extract the tarball from `url` into a unique temp dir, return the staging dir
 * path. With `expectedSha256` (registry installs), the host verifies the
 * downloaded bytes against the pinned digest before extracting anything.
 */
async function stageFromUrl(
  url: string,
  expectedSha256?: string,
): Promise<string> {
  // `tempDir()`'s shape varies by platform: a trailing slash on macOS
  // (`/var/folders/…/T/`), none on Linux (`/tmp`), and a trailing backslash on
  // Windows (`C:\…\Temp\`). Normalize to a forward-slash path with no trailing
  // separator and join explicitly — the old `${tmp}silo-install-…` produced
  // `/tmpsilo-install-…` on Linux and failed every URL/npm/registry install
  // trying to mkdir at the filesystem root.
  const tmp = (await tempDir()).replace(/\\/g, "/").replace(/\/+$/, "");
  const stagingDir = `${tmp}/silo-install-${Date.now()}`;
  await fsCreateDir(stagingDir);
  await invoke("download_extract", {
    url,
    destDir: stagingDir,
    expectedSha256,
  });
  return stagingDir;
}

/**
 * Find the package root inside a staging dir. npm tarballs put files under
 * `package/`; other tarballs may put them directly at the root or in a single
 * named subdirectory. Returns the path that contains `package.json`.
 */
export async function findPackageRoot(stagingDir: string): Promise<string> {
  // 1. Standard npm layout: package/package.json
  const npmRoot = `${stagingDir}/package`;
  if (await fsPathExists(`${npmRoot}/package.json`)) return npmRoot;

  // 2. Flat layout: package.json at root
  if (await fsPathExists(`${stagingDir}/package.json`)) return stagingDir;

  throw new Error(
    `Could not find package.json in the downloaded archive — ` +
      `expected it at the root or under a "package/" subfolder.`,
  );
}

let service: ExtensionManager | null = null;

/** @internal — host singleton; the `core.extensions` UI consumes this. */
export function getExtensionManager(): ExtensionManager {
  if (service) return service;
  service = {
    getState: () => cached,
    subscribe(listener) {
      listeners.add(listener);
      const d: Disposable = {
        dispose: () => {
          listeners.delete(listener);
        },
      };
      return d;
    },

    async installFromFolder(srcDir, source) {
      const cleanedSrc = srcDir.replace(/\/+$/, "");
      const manifest = await readManifest(cleanedSrc);
      const root = await extensionsRoot();
      const destDir = `${root}/${manifest.id}`;
      // Overwrite any prior install of the same id (a reinstall/upgrade path).
      if (isLoaded(manifest.id)) unloadExtension(manifest.id);
      if (await fsPathExists(destDir)) await fsDelete(destDir);
      await fsCopyDir(cleanedSrc, destDir);

      // Persist the consented permissions as the granted set (the UI has
      // already prompted via previewInstall). On reinstall/upgrade, re-record
      // them from the new manifest — the user re-consented to install.
      const recordedSource: InstallSource = source ?? {
        kind: "folder",
        value: cleanedSrc,
      };
      await upsertRecord((file) => {
        const existing = file.extensions.find((e) => e.id === manifest.id);
        if (existing) {
          existing.enabled = true;
          existing.permissions = manifest.permissions;
          existing.source = recordedSource;
        } else
          file.extensions.push({
            id: manifest.id,
            dir: manifest.id,
            enabled: true,
            permissions: manifest.permissions,
            source: recordedSource,
          });
      });

      await loadExtension({
        id: manifest.id,
        dir: destDir,
        main: manifest.main,
        permissions: manifest.permissions,
      });
      await refresh();
    },

    async uninstall(id, opts) {
      // Built-ins live in the app bundle, not on disk — there's nothing to
      // remove, so the UI offers only disable. Guard the API too.
      if (isBuiltin(id)) {
        throw new Error(
          "Built-in extensions can't be uninstalled — disable it instead.",
        );
      }
      if (isLoaded(id)) unloadExtension(id);
      const root = await extensionsRoot();
      const destDir = `${root}/${id}`;
      if (await fsPathExists(destDir)) await fsDelete(destDir);
      await upsertRecord((file) => {
        file.extensions = file.extensions.filter((e) => e.id !== id);
      });
      // Storage directory, after the code is gone. Never rolls the uninstall
      // back — a half-uninstalled extension is worse than bytes left on disk.
      await handleStorageOnUninstall(id, opts?.deleteData ?? false);
      await refresh();
    },

    getDataInfo(id) {
      return extensionDataInfo(id);
    },

    async enable(id) {
      if (isBuiltin(id)) {
        enableBuiltin(id);
        await setBuiltinDisabled(id, false);
        await refresh();
        return;
      }
      const root = await extensionsRoot();
      const destDir = `${root}/${id}`;
      const manifest = await readManifest(destDir);
      // Re-enabling uses the permissions already consented to at install — never
      // the (possibly edited) manifest — so toggling can't silently widen access.
      const file = await readInstalledFile();
      const granted =
        file.extensions.find((e) => e.id === id)?.permissions ?? [];
      await loadExtension({
        id,
        dir: destDir,
        main: manifest.main,
        permissions: granted,
      });
      await upsertRecord((f) => {
        const rec = f.extensions.find((e) => e.id === id);
        if (rec) rec.enabled = true;
      });
      await refresh();
    },

    async disable(id) {
      if (isBuiltin(id)) {
        disableBuiltin(id);
        await setBuiltinDisabled(id, true);
        await refresh();
        return;
      }
      if (isLoaded(id)) unloadExtension(id);
      await upsertRecord((file) => {
        const rec = file.extensions.find((e) => e.id === id);
        if (rec) rec.enabled = false;
      });
      await refresh();
    },

    async applyDisabledBuiltins() {
      const file = await readInstalledFile();
      // Tear down the chosen built-ins (no re-persist — already recorded).
      for (const id of file.disabledBuiltins ?? []) disableBuiltin(id);
      await refresh();
    },

    async readDisabledBuiltins() {
      const file = await readInstalledFile();
      return new Set(file.disabledBuiltins ?? []);
    },

    async loadInstalled() {
      // Resolve the extension-storage root before any third-party extension
      // activates, so `PathScope.ownDirs` is populated from the first line of
      // `activate()` (R5). Already in flight from main.tsx; awaiting the shared
      // promise here is what makes the ordering a guarantee rather than a race.
      // A failure is already logged to Output — extensions still load, and
      // own-dir paths deny through the normal rules.
      await initStorageRoot().catch(() => {});
      const file = await readInstalledFile();
      const root = await extensionsRoot();
      // Transparent migration: a third-party install whose id is now built-in
      // is retired on disk instead of loaded alongside the in-process copy.
      const migrated: { oldId: string; newId: string }[] = [];
      for (const rec of file.extensions) {
        if (isBuiltin(rec.id) || isSupersededOnDiskId(rec.id, isBuiltin)) {
          await retireOnDiskInstall(rec.id, rec.dir);
          migrated.push({
            oldId: rec.id,
            newId: SUPERSEDED_BUILTIN_IDS[rec.id] ?? rec.id,
          });
        }
      }
      await migrateSupersededStorage();
      for (const { oldId, newId } of migrated) {
        const name = builtinRows().find((b) => b.id === newId)?.name ?? newId;
        const title =
          SUPERSEDED_BUILTIN_TOAST_TITLES[oldId] ?? `${name} is now built in`;
        pushToast(
          "info",
          "Your settings were kept; the separately installed copy was removed.",
          {
            title,
            dedupKey: `builtin-migrate:${newId}`,
          },
        );
      }
      const current = await readInstalledFile();
      for (const rec of current.extensions) {
        if (!rec.enabled) continue;
        try {
          const dir = `${root}/${rec.dir}`;
          const manifest = await readManifest(dir);
          await loadExtension({
            id: rec.id,
            dir,
            main: manifest.main,
            permissions: rec.permissions ?? [],
          });
        } catch (err) {
          console.error(`[extensions] failed to load ${rec.id}`, err);
          reportError(`Extension load failed: ${rec.id}`, {
            extensionId: rec.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      await refresh();
    },

    async previewInstall(srcDir) {
      const manifest = await readManifest(srcDir.replace(/\/+$/, ""));
      const hostVersion = await appVersion().catch(() => "");
      return {
        id: manifest.id,
        name: manifest.name,
        permissions: manifest.permissions,
        engine: manifest.engine,
        hostVersion,
        engineCompatible: isEngineCompatible(manifest.engine, hostVersion),
      };
    },

    async installFromNpm(packageName, requestConsent) {
      const tarballUrl = await resolveNpmTarball(packageName);
      // Record the original spec, not the resolved tarball URL — an unpinned
      // spec then re-resolves to the latest version on update.
      return service!.installFromUrl(tarballUrl, requestConsent, {
        kind: "npm",
        value: packageName,
      });
    },

    async installFromUrl(url, requestConsent, source, expectedSha256) {
      const stagingDir = await stageFromUrl(url, expectedSha256);
      try {
        const pkgRoot = await findPackageRoot(stagingDir);
        const preview = await service!.previewInstall(pkgRoot);
        const granted = await requestConsent(preview);
        // Declined: report it as such rather than as a silent success — the
        // caller has no other way to tell the two apart.
        if (!granted) return null;
        await service!.installFromFolder(
          pkgRoot,
          source ?? { kind: "url", value: url },
        );
        return preview.name;
      } finally {
        await fsDelete(stagingDir).catch(() => {});
      }
    },

    async installFromRegistry(id, requestConsent) {
      const index = await fetchRegistryIndex();
      const release = resolveRegistryInstall(index, id);
      return service!.installFromUrl(
        release.url,
        requestConsent,
        { kind: "registry", value: id },
        release.sha256,
      );
    },

    async checkUpdates() {
      const index = await fetchRegistryIndex();
      const availableUpdates = findUpdates(cached.extensions, index);
      cached = Object.freeze({ ...cached, availableUpdates });
      emit();
      return availableUpdates;
    },

    async readInstalledReadme(id) {
      const rec = (await readInstalledFile()).extensions.find(
        (e) => e.id === id,
      );
      if (!rec) return null;
      const root = await extensionsRoot();
      return fsReadText(`${root}/${rec.dir}/README.md`).catch(() => null);
    },

    async update(id, requestConsent) {
      if (isBuiltin(id)) {
        throw new Error("Built-in extensions update with the app.");
      }
      const rec = (await readInstalledFile()).extensions.find(
        (e) => e.id === id,
      );
      if (!rec) throw new Error(`${id} is not installed.`);
      if (!rec.source) {
        throw new Error(
          `${id} was installed before update support — reinstall it once from its original source to enable updates.`,
        );
      }

      // Resolve a fresh copy of the package from the recorded source.
      let stagingDir: string | null = null;
      let pkgRoot: string;
      if (rec.source.kind === "folder") {
        pkgRoot = rec.source.value.replace(/\/+$/, "");
        if (!(await fsPathExists(`${pkgRoot}/package.json`))) {
          throw new Error(`Source folder no longer exists: ${pkgRoot}`);
        }
      } else if (rec.source.kind === "registry") {
        // Re-resolve through the index so the update gets the current pinned
        // digest and is verified the same way the original install was.
        const release = resolveRegistryInstall(
          await fetchRegistryIndex(),
          rec.source.value,
        );
        stagingDir = await stageFromUrl(release.url, release.sha256);
        pkgRoot = await findPackageRoot(stagingDir);
      } else {
        const url =
          rec.source.kind === "npm"
            ? await resolveNpmTarball(rec.source.value)
            : rec.source.value;
        stagingDir = await stageFromUrl(url);
        pkgRoot = await findPackageRoot(stagingDir);
      }

      try {
        const preview = await service!.previewInstall(pkgRoot);
        if (preview.id !== id) {
          throw new Error(
            `Source now declares id "${preview.id}" — expected "${id}". Uninstall and install it fresh.`,
          );
        }
        if (
          updateNeedsConsent(rec.permissions ?? [], preview) &&
          !(await requestConsent(preview))
        ) {
          return null;
        }

        // In-place swap: park the old install as a backup so a failed load of
        // the new version can restore it. The "." prefix can't collide with an
        // extension dir (ids must start alphanumeric).
        const root = await extensionsRoot();
        const destDir = `${root}/${rec.dir}`;
        const backupDir = `${root}/.update-${id}`;
        const oldRecord: InstalledRecord = { ...rec };
        const wasEnabled = rec.enabled;
        if (isLoaded(id)) unloadExtension(id);
        if (await fsPathExists(backupDir)) await fsDelete(backupDir);
        await fsRename(destDir, backupDir);
        try {
          await fsCopyDir(pkgRoot, destDir);
          const manifest = await readManifest(destDir);
          await upsertRecord((f) => {
            const r = f.extensions.find((e) => e.id === id);
            if (r) {
              r.permissions = manifest.permissions;
              r.enabled = wasEnabled;
            }
          });
          if (wasEnabled) {
            await loadExtension({
              id,
              dir: destDir,
              main: manifest.main,
              permissions: manifest.permissions,
            });
          }
          await fsDelete(backupDir).catch(() => {});
        } catch (err) {
          // Restore files, then record, then the running version — best-effort
          // each, without masking the original failure.
          try {
            if (await fsPathExists(destDir)) await fsDelete(destDir);
            await fsRename(backupDir, destDir);
            await upsertRecord((f) => {
              const i = f.extensions.findIndex((e) => e.id === id);
              if (i >= 0) f.extensions[i] = oldRecord;
            });
            if (wasEnabled) {
              const old = await readManifest(destDir);
              // Reload with the previously granted set, not the manifest.
              await loadExtension({
                id,
                dir: destDir,
                main: old.main,
                permissions: oldRecord.permissions ?? [],
              });
            }
          } catch (restoreErr) {
            reportError(`Extension update rollback failed: ${id}`, {
              extensionId: id,
              error:
                restoreErr instanceof Error
                  ? restoreErr.message
                  : String(restoreErr),
            });
          }
          throw err;
        } finally {
          await refresh();
        }
        // Only reached when the swap above completed — every failure path
        // rethrows after rolling back.
        return preview.name;
      } finally {
        if (stagingDir) await fsDelete(stagingDir).catch(() => {});
      }
    },
  };
  return service;
}
