/**
 * Client for the Silo Extension Registry (RFC 0014) — the static JSON index
 * at `registry.getsilo.dev`. The registry is data, not a service: this module
 * fetches `index.json` (ETag-cached, so steady-state polls are 304s), resolves
 * ids to digest-pinned tarballs for {@link ExtensionManager.installFromRegistry},
 * and diffs installed versions against the index for update checking.
 *
 * Exposed only via `@silo-code/extension-host/internal` (core-tier).
 *
 * @internal
 */
import type { Permission } from "@silo-code/sdk";
import type { InstalledExtension } from "./extension-manager";

/** The official registry. Federated/private registries (P3) are other base URLs. */
export const DEFAULT_REGISTRY_URL = "https://registry.getsilo.dev";

/**
 * The registry base URL in effect: the `silo.registryUrl` localStorage key
 * overrides the default (a dev/testing hatch — point the app at a local
 * `build-index` output; multi-registry settings are the real mechanism, P3).
 */
export function registryBaseUrl(): string {
  try {
    return localStorage.getItem("silo.registryUrl") ?? DEFAULT_REGISTRY_URL;
  } catch {
    return DEFAULT_REGISTRY_URL;
  }
}

/** The pinned, installable release of an extension, as recorded at ingest. */
export interface RegistryVersionInfo {
  version: string;
  tarballUrl: string;
  /** Availability fallback copy (P2 mirror); null until mirrored. */
  mirrorUrl: string | null;
  /** The digest pinned at ingest — verified before install. */
  sha256: string;
  size: number;
  engine: string | null;
  permissions: Permission[];
  provenance: "attested" | "none";
  publishedAt: string;
}

/** One extension in the registry index. */
export interface RegistryExtension {
  id: string;
  description: string;
  categories: string[];
  /** The bound GitHub repo (`owner/name`) — identity, per the namespace rule. */
  repo: string;
  /** `unavailable`/`removed` = the upstream repo or assets have gone away. */
  status: "active" | "unavailable" | "removed";
  /** Newest non-yanked version; null when nothing has been released yet. */
  latest: RegistryVersionInfo | null;
  totalDownloads: number;
  /** Registry-relative path of the version-pinned README (markdown). */
  readme: string;
  /** Registry-relative path of the full version-history record. */
  detail: string;
}

export interface RegistryIndex {
  schemaVersion: number;
  name: string;
  generatedAt: string;
  extensions: RegistryExtension[];
}

/** An available update for an installed registry-sourced extension. */
export interface RegistryUpdate {
  id: string;
  name: string;
  installedVersion: string;
  latestVersion: string;
  /**
   * The new version requests permissions beyond the granted set — the update
   * will re-prompt for consent (see `updateNeedsConsent`).
   */
  widensPermissions: boolean;
}

/**
 * Parse and defensively validate a fetched index. Malformed entries are
 * dropped rather than failing the whole catalog — one bad record must not
 * take Browse down.
 */
export function parseRegistryIndex(raw: unknown): RegistryIndex {
  const obj = raw as Partial<RegistryIndex> | null;
  if (!obj || typeof obj !== "object" || !Array.isArray(obj.extensions)) {
    throw new Error("registry index is malformed (no extensions array)");
  }
  const extensions: RegistryExtension[] = [];
  for (const e of obj.extensions as Partial<RegistryExtension>[]) {
    if (
      typeof e?.id !== "string" ||
      typeof e.description !== "string" ||
      typeof e.repo !== "string" ||
      !Array.isArray(e.categories)
    ) {
      continue;
    }
    const l = e.latest as Partial<RegistryVersionInfo> | null | undefined;
    const latest =
      l &&
      typeof l.version === "string" &&
      typeof l.tarballUrl === "string" &&
      typeof l.sha256 === "string"
        ? ({
            version: l.version,
            tarballUrl: l.tarballUrl,
            mirrorUrl: typeof l.mirrorUrl === "string" ? l.mirrorUrl : null,
            sha256: l.sha256,
            size: typeof l.size === "number" ? l.size : 0,
            engine: typeof l.engine === "string" ? l.engine : null,
            permissions: Array.isArray(l.permissions)
              ? (l.permissions as Permission[])
              : [],
            provenance: l.provenance === "attested" ? "attested" : "none",
            publishedAt: typeof l.publishedAt === "string" ? l.publishedAt : "",
          } satisfies RegistryVersionInfo)
        : null;
    extensions.push({
      id: e.id,
      description: e.description,
      categories: e.categories.filter(
        (c): c is string => typeof c === "string",
      ),
      repo: e.repo,
      status:
        e.status === "unavailable" || e.status === "removed"
          ? e.status
          : "active",
      latest,
      totalDownloads:
        typeof e.totalDownloads === "number" ? e.totalDownloads : 0,
      readme: typeof e.readme === "string" ? e.readme : `/readme/${e.id}.md`,
      detail: typeof e.detail === "string" ? e.detail : `/ext/${e.id}.json`,
    });
  }
  return {
    schemaVersion:
      typeof obj.schemaVersion === "number" ? obj.schemaVersion : 1,
    name: typeof obj.name === "string" ? obj.name : "registry",
    generatedAt: typeof obj.generatedAt === "string" ? obj.generatedAt : "",
    extensions,
  };
}

// ETag cache per base URL: steady-state re-fetches are zero-body 304s.
const cache = new Map<string, { etag: string | null; index: RegistryIndex }>();

/** Fetch (or revalidate) the registry index. */
export async function fetchRegistryIndex(
  baseUrl: string = registryBaseUrl(),
): Promise<RegistryIndex> {
  const cached = cache.get(baseUrl);
  const headers: Record<string, string> = {};
  if (cached?.etag) headers["if-none-match"] = cached.etag;

  const resp = await fetch(`${baseUrl}/index.json`, { headers });
  if (resp.status === 304 && cached) return cached.index;
  if (!resp.ok) {
    throw new Error(`registry ${baseUrl} → HTTP ${resp.status}`);
  }
  const index = parseRegistryIndex(await resp.json());
  cache.set(baseUrl, { etag: resp.headers.get("etag"), index });
  return index;
}

/** Test hook: drop the ETag cache. @internal */
export function clearRegistryCache(): void {
  cache.clear();
}

/** Absolute URL of an extension's README on the registry. */
export function registryReadmeUrl(
  ext: Pick<RegistryExtension, "readme">,
  baseUrl: string = registryBaseUrl(),
): string {
  return `${baseUrl}${ext.readme}`;
}

/**
 * Resolve an id to its installable release: the pinned tarball URL + digest.
 * Throws with a user-facing message when the extension is unknown, has no
 * release, or has been removed from the registry.
 */
export function resolveRegistryInstall(
  index: RegistryIndex,
  id: string,
): { url: string; sha256: string; version: string } {
  const ext = index.extensions.find((e) => e.id === id);
  if (!ext) {
    throw new Error(`"${id}" is not in the registry.`);
  }
  if (ext.status === "removed") {
    throw new Error(`"${id}" has been removed from the registry.`);
  }
  if (!ext.latest) {
    throw new Error(`"${id}" has no published release yet.`);
  }
  // Prefer the publisher's asset; fall back to the registry mirror when the
  // upstream has gone away (both carry the same pinned digest).
  const url =
    ext.status === "unavailable" && ext.latest.mirrorUrl
      ? ext.latest.mirrorUrl
      : ext.latest.tarballUrl;
  return { url, sha256: ext.latest.sha256, version: ext.latest.version };
}

/**
 * Compare exact semver strings (`x.y.z` with optional prerelease); prereleases
 * sort before their release. Non-semver input falls back to string compare.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(v);
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return a.localeCompare(b);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d;
  }
  const [preA, preB] = [pa[4], pb[4]];
  if (preA === preB) return 0;
  if (preA === undefined) return 1;
  if (preB === undefined) return -1;
  return preA.localeCompare(preB);
}

/**
 * Diff installed registry-sourced extensions against the index. Only rows
 * installed from the registry are considered (folder/URL installs have no
 * upstream; npm installs re-resolve through npm in `update()`).
 */
export function findUpdates(
  extensions: readonly InstalledExtension[],
  index: RegistryIndex,
): RegistryUpdate[] {
  const updates: RegistryUpdate[] = [];
  for (const ext of extensions) {
    if (ext.source?.kind !== "registry") continue;
    const entry = index.extensions.find((e) => e.id === ext.id);
    const latest = entry?.latest;
    if (!latest) continue;
    if (compareVersions(latest.version, ext.version) <= 0) continue;
    updates.push({
      id: ext.id,
      name: ext.name,
      installedVersion: ext.version,
      latestVersion: latest.version,
      widensPermissions: latest.permissions.some(
        (p) => !ext.permissions.includes(p),
      ),
    });
  }
  return updates;
}
