// Cmd/Ctrl+click on a file path in terminal output opens it in the editor.
// Path parsing lives in {@link ./terminal-link-match}; this module builds
// xterm `ILink`s around those spans. The actual "open"/hover behavior is
// injected by the panel (which owns store + editor access + the shared link
// policy) via the callbacks below.
import { Terminal as XTerm, type ILink } from "@xterm/xterm";
import { homeDir } from "@silo-code/extension-host/internal";
import {
  isLinkActivationClick,
  type TerminalLinkRange,
} from "./terminal-link-policy";
import { matchFilePaths, type FilePathSpan } from "./terminal-link-match";

export { FILE_PATH_RE, matchFilePaths } from "./terminal-link-match";

let cachedHomeDir: string | null = null;
export function getHomeDir(): Promise<string> {
  if (cachedHomeDir) return Promise.resolve(cachedHomeDir);
  return homeDir().then((h) => {
    cachedHomeDir = h.replace(/\/$/, "");
    return cachedHomeDir;
  });
}

interface LogicalLine {
  text: string;
  startY: number; // 1-based, matches xterm range coords
}

function collectLogicalLine(
  term: XTerm,
  bufferLineNumber: number,
): LogicalLine | null {
  const buf = term.buffer.active;
  let y = bufferLineNumber - 1;
  if (y < 0 || y >= buf.length) return null;
  while (y > 0 && buf.getLine(y)?.isWrapped) y--;
  let text = "";
  for (let i = y; i < buf.length; i++) {
    const line = buf.getLine(i);
    if (!line) break;
    if (i > y && !line.isWrapped) break;
    text += line.translateToString(false);
  }
  return { text, startY: y + 1 };
}

export interface FileLinkCallbacks {
  isMac: boolean;
  onActivate: (matchText: string) => void;
  onHover: (event: MouseEvent, text: string, range: TerminalLinkRange) => void;
  onLeave: () => void;
  /** The longest reading of a span that exists on disk (RFC 0066). Only
   *  called for a span a space might continue, and only for the line under
   *  the pointer — xterm asks for links one line at a time, which is what
   *  keeps this off every line the shell ever wrote. */
  verify?: (line: string, span: FilePathSpan) => Promise<string>;
}

export async function findFileLinks(
  term: XTerm,
  bufferLineNumber: number,
  callbacks: FileLinkCallbacks,
): Promise<ILink[] | undefined> {
  const logical = collectLogicalLine(term, bufferLineNumber);
  if (!logical) return undefined;
  const cols = term.cols;
  const links: ILink[] = [];
  // How far the last link reached. A verified span swallows whatever the
  // cut-short reading left behind it — the second, bogus link on the same
  // path — so anything starting inside it is dropped.
  let coveredTo = 0;
  for (const span of matchFilePaths(logical.text)) {
    if (span.index < coveredTo) continue;
    // The span as written may stop short of the real path — `~/Blog
    // Posts/a.md` reads as `~/Blog` until the filesystem says otherwise. The
    // link's range has to cover the whole thing, so this resolves *before*
    // the link is built rather than correcting it at activation time.
    const verified =
      callbacks.verify && span.href === span.text
        ? await callbacks.verify(logical.text, span)
        : span.text;
    const match =
      verified.length > span.text.length
        ? { ...span, text: verified, href: verified }
        : span;
    const startOffset = match.index;
    const endOffsetIncl = startOffset + match.text.length - 1;
    coveredTo = startOffset + match.text.length;
    const range: TerminalLinkRange = {
      start: {
        x: (startOffset % cols) + 1,
        y: logical.startY + Math.floor(startOffset / cols),
      },
      end: {
        x: (endOffsetIncl % cols) + 1,
        y: logical.startY + Math.floor(endOffsetIncl / cols),
      },
    };
    links.push({
      range,
      text: match.text,
      activate: (event) => {
        if (!isLinkActivationClick(event, callbacks.isMac)) return;
        // `match.href`, not xterm's `text`: an escaped space is written `\ `
        // and opened as a space.
        callbacks.onActivate(match.href);
      },
      hover: (event, text) => callbacks.onHover(event, text, range),
      leave: () => callbacks.onLeave(),
    });
  }
  return links.length ? links : undefined;
}
