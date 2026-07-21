// Cmd/Ctrl+click on a file path in terminal output opens it in the editor.
// This module is pure parsing: it finds path-like spans in a logical terminal
// line and builds xterm `ILink`s. The actual "open"/hover behavior is injected
// by the panel (which owns store + editor access + the shared link policy)
// via the callbacks below.
import { Terminal as XTerm, type ILink } from "@xterm/xterm";
import { homeDir } from "@silo-code/extension-host/internal";
import {
  isLinkActivationClick,
  type TerminalLinkRange,
} from "./terminal-link-policy";

// Two alternatives:
//   1. Explicit-prefix paths — `~/...`, `/abs/...`, `./rel/...`, `../rel/...`.
//   2. Bare relative paths — `word/word/.../file.ext`. The trailing
//      `.ext` requirement keeps random `1/2` style noise out.
// Either form can carry an optional `:LINE` or `:LINE:COL` suffix.
// Trailing sentence punctuation is stripped after the match so
// `see /etc/hosts.` doesn't include the dot.
export const FILE_PATH_RE =
  /(?<![A-Za-z0-9_.:/])(?:(?:~|\.{1,2})?\/[A-Za-z0-9_./\-@+]+|[A-Za-z0-9_\-@+]+\/[A-Za-z0-9_./\-@+]*\.[A-Za-z0-9_\-@+]+)(?::\d+(?::\d+)?)?/g;
const TRAILING_PUNCT_RE = /[.,;:)\]}>'"]+$/;

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
}

export function findFileLinks(
  term: XTerm,
  bufferLineNumber: number,
  callbacks: FileLinkCallbacks,
): ILink[] | undefined {
  const logical = collectLogicalLine(term, bufferLineNumber);
  if (!logical) return undefined;
  const cols = term.cols;
  const links: ILink[] = [];
  FILE_PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FILE_PATH_RE.exec(logical.text)) !== null) {
    let matchText = m[0];
    const trailing = matchText.match(TRAILING_PUNCT_RE);
    if (trailing) matchText = matchText.slice(0, -trailing[0].length);
    if (!matchText) continue;
    const startOffset = m.index;
    const endOffsetIncl = startOffset + matchText.length - 1;
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
      text: matchText,
      activate: (event, text) => {
        if (!isLinkActivationClick(event, callbacks.isMac)) return;
        callbacks.onActivate(text);
      },
      hover: (event, text) => callbacks.onHover(event, text, range),
      leave: () => callbacks.onLeave(),
    });
  }
  return links.length ? links : undefined;
}
