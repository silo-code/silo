import type { ComponentType } from "react";
import * as Phosphor from "@phosphor-icons/react";
import type { IconProps, IconWeight } from "@phosphor-icons/react";
import type { PhosphorIconName } from "@silo-code/sdk";

/** Non-icon exports on the Phosphor barrel — never treat these as glyphs. */
const NON_ICONS = new Set(["IconContext", "IconBase", "SSR", "default"]);

type PhosphorIconComponent = ComponentType<IconProps>;

/**
 * Resolve a {@link PhosphorIconName} to a Phosphor icon component, or `null`
 * when the name is unknown / not an icon export.
 */
export function resolvePhosphorIcon(
  name: PhosphorIconName,
): PhosphorIconComponent | null {
  if (!name || NON_ICONS.has(name)) return null;
  const candidate = (Phosphor as Record<string, unknown>)[name];
  if (candidate == null) return null;
  // forwardRef components are objects with $$typeof; function components too.
  if (typeof candidate === "function") {
    return candidate as PhosphorIconComponent;
  }
  if (typeof candidate === "object" && "$$typeof" in (candidate as object)) {
    return candidate as PhosphorIconComponent;
  }
  return null;
}

function PhosphorNamedIcon({
  name,
  weight,
}: {
  name: PhosphorIconName;
  weight: IconWeight;
}) {
  const Icon = resolvePhosphorIcon(name);
  if (!Icon) return null;
  return <Icon weight={weight} size="1em" aria-hidden />;
}

/**
 * Toolbar chrome: bold, 1em (tracks `--silo-font-size-base` / UI zoom).
 */
export function PhosphorToolbarIcon({ name }: { name: PhosphorIconName }) {
  return <PhosphorNamedIcon name={name} weight="bold" />;
}

/**
 * Tab decoration chrome: regular weight by default; `filled: true` uses
 * Phosphor fill. Pass `weight` to override (e.g. host animated presets).
 * Size tracks 1em / UI zoom.
 */
export function PhosphorTabDecorationIcon({
  name,
  filled = false,
  weight,
}: {
  name: PhosphorIconName;
  filled?: boolean;
  weight?: IconWeight;
}) {
  return (
    <PhosphorNamedIcon
      name={name}
      weight={weight ?? (filled ? "fill" : "regular")}
    />
  );
}
