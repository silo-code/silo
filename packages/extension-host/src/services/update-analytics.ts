// Client-side leaf for update-choice analytics (ADR 0036) — extends the
// existing update-check analytics pipeline (ADR 0031) with the user's
// resulting choice. One fire-and-forget request per explicit user action
// (Install / Skip this version / Later), never a background/always-on SDK —
// see ADR 0036 "Alternatives considered" for why this doesn't reopen ADR
// 0031's rejection of client-side telemetry.
import { getIdentifier } from "@tauri-apps/api/app";

const UPDATE_SERVER_BASE = "https://updates.getsilo.dev";
const NIGHTLY_IDENTIFIER = "com.silo.desktop.nightly";

export type UpdateAction = "installed" | "skipped-version" | "skipped-later";

/** Best-effort; mirrors ADR 0031's fire-and-forget, never-block contract. */
export async function reportUpdateAction(
  action: UpdateAction,
  version: string,
): Promise<void> {
  try {
    const id = await getIdentifier();
    const channel = id === NIGHTLY_IDENTIFIER ? "nightly" : "stable";
    await fetch(
      `${UPDATE_SERVER_BASE}/update-action/${action}/${channel}/${encodeURIComponent(version)}`,
    );
  } catch {
    // fire-and-forget — never surfaces to the caller
  }
}
