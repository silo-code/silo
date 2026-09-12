/**
 * File attachments for a prompt turn (RFC 0038 Session 3.1).
 *
 * `AgentPromptBlock` already carries `{ type: "resource_link", uri, name }`, so
 * the SDK side is done — this is just the small pure glue between the file the
 * user picked (`ctx.ui.pickFile` hands back an absolute path) and that block.
 * Pure so it is unit-tested; the picker call and the chip UI stay in the
 * component.
 */

/** One file the user attached, staged until the next send. */
export interface Attachment {
  /** `file://` URI for the {@link AgentPromptBlock} `resource_link`. */
  readonly uri: string;
  /** Display name for the chip and the link — the last path segment. */
  readonly name: string;
}

/** Last path segment of an absolute POSIX/Windows path. */
export function basename(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const cut = trimmed.split(/[/\\]/).pop();
  return cut && cut.length > 0 ? cut : path;
}

/**
 * An absolute path as a `file://` URI. Deliberately minimal — the spike is
 * macOS/Linux, paths are already absolute (they come from the native picker),
 * and each segment is percent-encoded so a space or `#` in a filename survives.
 */
export function fileUri(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const withLeadingSlash = normalized.startsWith("/")
    ? normalized
    : `/${normalized}`;
  const encoded = withLeadingSlash
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `file://${encoded}`;
}

/** Turn a picked path into an {@link Attachment}. */
export function toAttachment(path: string): Attachment {
  return { uri: fileUri(path), name: basename(path) };
}
