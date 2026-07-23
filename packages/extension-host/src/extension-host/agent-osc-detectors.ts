/**
 * Per-agent OSC detectors for `ctx.agents` (RFC 0017). Sealed inside the host
 * — there is no registration API (see the RFC's "Detection is sealed, not
 * pluggable"). Ported from `silo-extensions/agent-monitor`'s private
 * `osc-detectors.ts`, which proved this model out first.
 *
 * **Scope note**: only Claude Code and the generic shell-integration
 * fallback are implemented here. Cursor Agent, Codex CLI, and GitHub Copilot
 * CLI's detectors are known, documented follow-up work (ported the same way,
 * from the same source) — not yet done, so those agents currently show no
 * activity beyond `ctx.processes`-level `leader`/`cwd` facts.
 */

export interface DetectionResult {
  status: "working" | "waiting" | "done" | "error";
  source: "agent" | "shell";
  timer?: "schedule" | "clear";
}

const BRAILLE_START = 0x2800;
const BRAILLE_END = 0x28ff;
const CLAUDE_IDLE_CHAR = "✳";

export function detectClaudeCode(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 0) return null;
  const first = payload.charCodeAt(0);
  if (first >= BRAILLE_START && first <= BRAILLE_END) {
    return { status: "working", source: "agent", timer: "schedule" };
  }
  if (payload.startsWith(CLAUDE_IDLE_CHAR)) {
    return { status: "waiting", source: "agent", timer: "clear" };
  }
  return null;
}

const SHELL_COMMAND_RUNNING = "C";
const SHELL_PROMPT_START = "A";

export function detectShellIntegration(
  code: number,
  payload: string,
): DetectionResult | null {
  if (code !== 133) return null;
  if (payload === SHELL_COMMAND_RUNNING) {
    return { status: "working", source: "shell", timer: "schedule" };
  }
  if (payload.startsWith(SHELL_PROMPT_START) || payload.startsWith("D")) {
    return { status: "waiting", source: "shell", timer: "clear" };
  }
  return null;
}

/** Ordered dispatch — first non-null result wins. */
export const AGENT_DETECTORS = [detectClaudeCode, detectShellIntegration];

export function detectFromOsc(
  code: number,
  payload: string,
): DetectionResult | null {
  for (const detect of AGENT_DETECTORS) {
    const result = detect(code, payload);
    if (result) return result;
  }
  return null;
}
