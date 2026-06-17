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
} from "../services/tauri-fs";
import {
  loadExtension,
  unloadExtension,
  isLoaded,
  needsReload,
} from "./extension-loader";
import {
  isBuiltin,
  enableBuiltin,
  disableBuiltin,
  builtinRows,
} from "./builtins-registry";
import type { Disposable, Permission } from "@silo-code/sdk";
import type { ReactiveService } from "@silo-code/sdk";

/** The capability vocabulary the host understands in `silo.permissions`. */
const KNOWN_PERMISSIONS: readonly Permission[] = [
  "fs:read",
  "fs:write",
  "process",
  "network",
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
}

export interface ExtensionManagerState {
  extensions: readonly InstalledExtension[];
}

export interface ExtensionManager extends ReactiveService<ExtensionManagerState> {
  /** Install from a source folder (copied into the extensions dir), then load. */
  installFromFolder(srcDir: string): Promise<void>;
  /** Unload (if loaded), delete the folder, and drop the record. Rejects for built-ins. */
  uninstall(id: string): Promise<void>;
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
   */
  installFromNpm(
    packageName: string,
    requestConsent: (preview: ManifestPreview) => Promise<boolean>,
  ): Promise<void>;
  /**
   * Download a `.tgz` tarball from any URL, extract it, show the permissions
   * consent dialog via `requestConsent`, and install if granted. Covers GitHub
   * release assets and any direct tarball URL.
   *
   * The tarball must contain a `package.json` with a `silo.*` manifest at its
   * root or under a `package/` prefix (the npm standard layout).
   */
  installFromUrl(
    url: string,
    requestConsent: (preview: ManifestPreview) => Promise<boolean>,
  ): Promise<void>;
}

/** A peek at an extension about to be installed, for the consent prompt. */
export interface ManifestPreview {
  id: string;
  name: string;
  permissions: readonly Permission[];
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
  return { id, name, version, description, publisher, main, permissions };
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
    return parsed;
  } catch {
    return { version: REGISTRY_VERSION, extensions: [] };
  }
}

async function writeInstalledFile(file: InstalledFile): Promise<void> {
  const path = `${await extensionsRoot()}/installed.json`;
  await fsWriteText(path, JSON.stringify(file, null, 2));
}

// ---- reactive state ----------------------------------------------------------

let cached: ExtensionManagerState = Object.freeze({ extensions: [] });
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
  const rows: InstalledExtension[] = [];
  for (const rec of file.extensions) {
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
    });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  cached = Object.freeze({ extensions: rows });
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

/** Extract the tarball from `url` into a unique temp dir, return the staging dir path. */
async function stageFromUrl(url: string): Promise<string> {
  const tmp = await tempDir();
  const stagingDir = `${tmp}silo-install-${Date.now()}`;
  await fsCreateDir(stagingDir);
  await invoke("download_extract", { url, destDir: stagingDir });
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

    async installFromFolder(srcDir) {
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
      await upsertRecord((file) => {
        const existing = file.extensions.find((e) => e.id === manifest.id);
        if (existing) {
          existing.enabled = true;
          existing.permissions = manifest.permissions;
        } else
          file.extensions.push({
            id: manifest.id,
            dir: manifest.id,
            enabled: true,
            permissions: manifest.permissions,
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

    async uninstall(id) {
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
      await refresh();
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
      const file = await readInstalledFile();
      const root = await extensionsRoot();
      for (const rec of file.extensions) {
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
        }
      }
      await refresh();
    },

    async previewInstall(srcDir) {
      const manifest = await readManifest(srcDir.replace(/\/+$/, ""));
      return {
        id: manifest.id,
        name: manifest.name,
        permissions: manifest.permissions,
      };
    },

    async installFromNpm(packageName, requestConsent) {
      const tarballUrl = await resolveNpmTarball(packageName);
      await service!.installFromUrl(tarballUrl, requestConsent);
    },

    async installFromUrl(url, requestConsent) {
      const stagingDir = await stageFromUrl(url);
      try {
        const pkgRoot = await findPackageRoot(stagingDir);
        const preview = await service!.previewInstall(pkgRoot);
        const granted = await requestConsent(preview);
        if (!granted) return;
        await service!.installFromFolder(pkgRoot);
      } finally {
        await fsDelete(stagingDir).catch(() => {});
      }
    },
  };
  return service;
}
