/**
 * The running-turn footer's ticking elapsed time (RFC 0043 finding 1) — the
 * one piece of the turn footer that is genuinely a component, not pure logic:
 * it re-renders on a 1s interval. The formatting itself is
 * {@link elapsedLabel}, in `transcript-model.ts` and unit-tested there.
 */

import { useEffect, useState } from "react";
import { elapsedLabel } from "./transcript-model";

export function LiveElapsed({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>{elapsedLabel(now - startedAt)}</>;
}
