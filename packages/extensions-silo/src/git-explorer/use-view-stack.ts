import { useCallback, useEffect, useState } from "react";
import type { ExtensionStorage } from "@silo-code/sdk";
import {
  currentView,
  INITIAL_STACK,
  popView,
  pushView,
  restoreStack,
  serializeStack,
  type PanelView,
  type ViewStack,
} from "./view-stack";

/**
 * Drives one `GitView`'s internal list/detail navigation. Hydrates the stack
 * from `storage` once (per `storageKey` — a per-repo-root key, since a
 * multi-root workspace mounts one `GitView`/stack per folder), then persists
 * every push/pop back to it so a reload restores the same page.
 */
export function useViewStack(
  storage: ExtensionStorage,
  storageKey: string,
  hydrated: boolean,
) {
  const [stack, setStack] = useState<ViewStack>(INITIAL_STACK);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!hydrated || restored) return;
    setStack(restoreStack(storage.get(storageKey)));
    setRestored(true);
  }, [hydrated, restored, storage, storageKey]);

  const push = useCallback(
    (view: PanelView) => {
      setStack((s) => {
        const next = pushView(s, view);
        storage.set(storageKey, serializeStack(next));
        return next;
      });
    },
    [storage, storageKey],
  );

  const pop = useCallback(() => {
    setStack((s) => {
      const next = popView(s);
      storage.set(storageKey, serializeStack(next));
      return next;
    });
  }, [storage, storageKey]);

  return {
    view: currentView(stack),
    push,
    pop,
    canPop: stack.views.length > 1,
  };
}
