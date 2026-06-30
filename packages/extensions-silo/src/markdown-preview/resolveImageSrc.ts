// Pure logic for resolving markdown image srcs — kept out of React so it's unit-testable.
import { resolveFilePath } from "./links";

const EXTERNAL = /^https?:/i;

export function isExternalImageUrl(src: string): boolean {
  return EXTERNAL.test(src);
}

/**
 * Given an image `src` from markdown and the path of the markdown file, return
 * the absolute local filesystem path to load — or `null` if the src is external,
 * unresolvable, or an unsupported scheme (data:, //, etc.).
 */
export function resolveLocalImagePath(
  src: string,
  filePath: string | null,
): string | null {
  if (!src) return null;
  if (isExternalImageUrl(src)) return null;
  // Protocol-relative and data URIs can't map to a local file.
  if (src.startsWith("//") || src.startsWith("data:")) return null;
  // Drop ?query and #fragment before handing off to the filesystem resolver.
  const stripped = src.split(/[?#]/, 1)[0];
  return resolveFilePath(stripped, filePath);
}
