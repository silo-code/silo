/**
 * Minimum-version compatibility for `silo.engine`. The engine string declares a
 * floor (the lowest host version the extension supports); the host must be at or
 * above it. Upper bounds are intentionally ignored — the SDK is additive, so a
 * newer host always satisfies an older floor. @internal
 */

/**
 * Extract the first `x.y.z` numeric triple from an engine string like
 * `"^0.17.0"`, `"~0.17.0"`, `">=0.17.0"`, or bare `"0.17.0"`. Range operators
 * and pre-release suffixes are stripped; missing patch/minor segments default to
 * 0. Returns `null` when the input is absent, empty, or contains no digits.
 */
export function parseEngineFloor(
  engine: string | undefined,
): [number, number, number] | null {
  if (!engine) return null;
  // Strip leading range operators: ^, ~, >=, <=, >, <, =
  const stripped = engine.replace(/^[^0-9]*/, "");
  // Match the first x.y.z (or x.y or x) in what remains
  const m = stripped.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  const major = parseInt(m[1], 10);
  const minor = m[2] !== undefined ? parseInt(m[2], 10) : 0;
  const patch = m[3] !== undefined ? parseInt(m[3], 10) : 0;
  return [major, minor, patch];
}

/**
 * Compare two version triples. Returns negative when `a < b`, 0 when equal,
 * positive when `a > b`.
 */
export function compareVersions(
  a: [number, number, number],
  b: [number, number, number],
): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

/**
 * Returns `true` when `hostVersion` satisfies the `engine` floor, or when
 * there is no constraint. Pre-release suffixes on the host version (e.g.
 * `"0.18.0-beta.1"`) are ignored — only the numeric core is compared.
 */
export function isEngineCompatible(
  engine: string | undefined,
  hostVersion: string,
): boolean {
  const floor = parseEngineFloor(engine);
  if (!floor) return true; // no/garbage engine → no constraint
  const host = parseEngineFloor(hostVersion);
  if (!host) return true; // can't parse host version → don't warn
  return compareVersions(host, floor) >= 0;
}
