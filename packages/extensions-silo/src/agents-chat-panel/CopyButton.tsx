/**
 * The transcript's one copy button — a user message's, a fenced block's.
 *
 * Copying is silent: the clipboard gives no sign it took anything, so the
 * button answers for it by flipping to a check for a moment. That
 * confirmation is the whole reason this is a shared component rather than an
 * `onClick` at each site — a second copy affordance that stayed silent would
 * read as the broken one.
 *
 * The idle glyph is the caller's, since the sites differ (a plain `Copy`
 * in a code block's gutter, the outline→fill hover stack on a message);
 * the copied glyph is deliberately not, so the confirmation looks the same
 * wherever it fires.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "@phosphor-icons/react";
import { IconButton, Tooltip, type IconButtonVariant } from "@silo-code/sdk";

/** How long the check stays up. Long enough to notice, short enough that a
 *  second copy of the same thing still feels like it did something. */
const COPIED_MS = 1500;

export function CopyButton({
  text,
  label = "Copy",
  tooltip,
  variant = "normal",
  className,
  idle,
}: {
  /** What lands on the clipboard. */
  text: string;
  /** Accessible name — the icon is the only visual. */
  label?: string;
  /** When set, the hover hint; becomes "Copied" while the check is up. */
  tooltip?: string;
  variant?: IconButtonVariant;
  className?: string;
  /** Glyph shown when not confirming. Defaults to a plain `Copy`. */
  idle?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  // Cleared on unmount so a row scrolled out mid-confirmation doesn't set
  // state on a gone component.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const button = (
    <IconButton
      size="sm"
      variant={variant}
      className={className}
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), COPIED_MS);
      }}
    >
      {copied ? (
        <Check size="1em" weight="bold" aria-hidden="true" />
      ) : (
        (idle ?? <Copy size="1em" aria-hidden="true" />)
      )}
    </IconButton>
  );

  return tooltip === undefined ? (
    button
  ) : (
    <Tooltip content={copied ? "Copied" : tooltip}>{button}</Tooltip>
  );
}
