/**
 * Updating one entry of a list of **pending requests** — the open permission
 * requests and questions the Chat panel is showing.
 *
 * One rule, and it is the whole reason this is a function rather than an
 * inline `.map`: an entry is addressed by its **key**, never by object
 * identity. Two updates can run from a single handler — picking an option both
 * clears the typed answer and moves the selection — and the first one replaces
 * the entry it touched, so a second `q === pending` check compares against an
 * object that is no longer in the list and matches nothing. The update is
 * dropped silently, with no error and no re-render to hint at it. That bug
 * shipped once already: every radio but "Other" was unclickable, because
 * "Other" happened to be the one path whose first update was the one that
 * mattered.
 */

/** Anything the panel holds in a keyed pending list. */
export interface Keyed {
  readonly key: string;
}

/**
 * Replace the entry with this key, leaving every other entry **identical** —
 * same object, so React skips re-rendering the rows that did not change.
 *
 * A key that is not in the list is not an error: the request may have been
 * answered and retired between the render that bound the handler and the click
 * that fired it. Dropping the edit is the correct outcome there — the thing it
 * would have edited is gone.
 */
export function patchByKey<T extends Keyed>(
  list: readonly T[],
  key: string,
  patch: (entry: T) => T,
): T[] {
  return list.map((entry) => (entry.key === key ? patch(entry) : entry));
}

/** Drop the entry with this key — a request that has been answered. */
export function removeByKey<T extends Keyed>(
  list: readonly T[],
  key: string,
): T[] {
  return list.filter((entry) => entry.key !== key);
}
