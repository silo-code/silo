import type { ReactNode } from "react";
import { PuzzlePiece, SealCheck } from "@phosphor-icons/react";
import { Tooltip } from "@silo-code/sdk";
import type { ExtensionIconSpec } from "./extension-icons";

// PROTOTYPE — the card the Extensions catalog is laid out in, replacing the
// full-width rows. One component for both Browse and Installed: the two differ
// only in which action and badges they hand in, and a marketplace that changed
// shape between "what you could have" and "what you have" would read as two
// unrelated screens.

/**
 * The extension's glyph on a tinted tile. Bundled extensions get one assigned
 * by id (extension-icons.ts); everything the user installed themselves falls
 * back to the same puzzle piece, since nothing in the manifest carries an icon
 * yet.
 *
 * The fallback is deliberately uniform rather than varied per id: a glyph or
 * color derived from hashing an id implies a distinction the data can't
 * actually back. It also stays on the neutral token surface rather than taking
 * a tint, so "we know this one" and "we don't" are legible at a glance.
 */
function ExtensionIcon({ icon }: { icon?: ExtensionIconSpec | null }) {
  if (!icon) {
    return (
      <span className="ext-card-icon" aria-hidden="true">
        <PuzzlePiece size="1.4em" weight="duotone" />
      </span>
    );
  }
  const Glyph = icon.glyph;
  return (
    // The tint is per-extension identity, so it comes in as an inline style
    // rather than a class — there's no themeable token for "this extension's
    // color", and inventing one class per extension would be worse.
    <span
      className="ext-card-icon ext-card-icon--tinted"
      style={{ background: icon.tint }}
      aria-hidden="true"
    >
      {/* `bold`, not the placeholder's `duotone`: duotone's second layer is a
          faded fill, which disappears against a saturated tile. */}
      <Glyph size="1.4em" weight="bold" />
    </span>
  );
}

export interface ExtensionCardProps {
  name: string;
  /** Glyph + tile fill; omit for the placeholder puzzle piece. */
  icon?: ExtensionIconSpec | null;
  /** Rendered as "by …" beside the name; omitted when unknown. */
  publisher?: string | null;
  /** Build provenance was verified — the seal beside the name. */
  verified?: boolean;
  description?: string;
  /**
   * Status pills (version, Built-in, disabled, update notes) shown along the
   * card's footer. Kept out of the name row so a long name doesn't compete
   * with them for the same line.
   */
  badges?: ReactNode;
  /** Warnings that need a full line of their own (reload / engine mismatch). */
  notes?: ReactNode;
  /** The primary control, top-right: Install / Update / an Installed pill. */
  action?: ReactNode;
  /** Overflow menu for an installed extension, in the footer. */
  menu?: ReactNode;
  /** Opens the detail view. */
  onOpenDetails: () => void;
}

export function ExtensionCard({
  name,
  icon,
  publisher,
  verified,
  description,
  badges,
  notes,
  action,
  menu,
  onOpenDetails,
}: ExtensionCardProps) {
  return (
    // The whole card opens details, as the full-width row did before it.
    // Interactive children stop propagation so the action button and the menu
    // don't also navigate.
    <div className="ext-card" onClick={onOpenDetails}>
      <div className="ext-card-top">
        <ExtensionIcon icon={icon} />
        {action && (
          <div
            className="ext-card-action"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            {action}
          </div>
        )}
      </div>

      <div className="ext-card-name">
        <span className="ext-card-title">{name}</span>
        {verified && (
          <Tooltip content="Build provenance verified">
            <span className="ext-card-seal">
              <SealCheck size={14} weight="fill" aria-label="Verified" />
            </span>
          </Tooltip>
        )}
        {publisher && <span className="ext-card-by">by {publisher}</span>}
      </div>

      {description && <p className="ext-card-desc">{description}</p>}

      {notes && <div className="ext-card-notes">{notes}</div>}

      <div className="ext-card-foot">
        <div className="ext-card-badges">{badges}</div>
        {menu && (
          <div
            className="ext-card-foot-actions"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            {menu}
          </div>
        )}
      </div>
    </div>
  );
}
