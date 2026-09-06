/**
 * Pi: the first catalog entry with non-trivial runtime quirks, so it gets its
 * own module (ADR 0042 decision 2) instead of a thin object inline in
 * `agent-catalog.ts` alongside Claude/Codex/Cursor/Copilot/Grok.
 *
 * `buildPiAgentDefinition` takes catalog-owned constants (the hook marker,
 * the shared script's path, `buildHookCommand`) as parameters rather than
 * importing them, the same way `renderPiTrackSessionExtension` takes its
 * inputs as params — `agent-catalog.ts` stays the SSOT for that data (see
 * `agent-hook-script.ts`'s docstring for the same rule applied to the shared
 * capture script) and this module has no runtime import back into it, so
 * there's no import cycle between the catalog and its own agent modules.
 *
 * Pi's session-capture hook is a TypeScript **extension**, not a shell
 * command in a JSON config — the template, its constraints, and why that
 * trade is worth making live in `catalog/pi-extension-template.ts` and ADR
 * 0041. OMP (RFC 0037) emits the same template with its own agent tag, which
 * is why it sits in a shared module rather than here.
 */

import {
  detectPiTitle,
  detectCopilotCLI,
  PI_TITLE_PREFIX,
} from "../agent-osc-detectors";
import {
  renderPiTrackSessionExtension,
  type PiExtensionAgentDeps,
} from "./pi-extension-template";
import type { AgentDefinition } from "../agent-catalog";

/** Pi's full catalog entry. A factory, not a plain object, so it can take
 * `deps` as parameters instead of importing them (see the module doc). */
export function buildPiAgentDefinition(
  deps: PiExtensionAgentDeps,
): AgentDefinition {
  const { marker, trackScriptRel, buildHookCommand } = deps;
  return {
    id: "pi",
    // Lowercase on purpose: upstream brands it "pi" (pi.dev), and the repo
    // already labels a pi-kind terminal "pi agent".
    displayName: "pi",
    // `pi` on PATH is a symlink to the package's `dist/cli.js`, which carries
    // a `#!/usr/bin/env node` shebang — so the foreground process reports as
    // node-wrapped, exactly like Claude and Copilot.
    leaderNames: ["pi"],
    // RFC 0033 recon (2026-08-31): PI_CODING_AGENT_DIR moves both config and
    // credentials (`auth.json`) — source resolves it as
    // `process.env.PI_CODING_AGENT_DIR ?? ~/.pi/agent`. The hook `configPath`
    // (`.pi/agent/extensions/silo-track-session.ts`) sits inside it.
    configDirEnvVar: "PI_CODING_AGENT_DIR",
    // RFC 0033 phase-3 recon (2026-09-02, macOS, pi 0.84.3): `pi "<prompt>"`
    // answered and stayed in the TUI — its positional `[messages...]` is an
    // opening message for the interactive session.
    promptDelivery: { kind: "argv" },
    // Redundant once the tab shows pi's own icon — same literal detectPiTitle
    // matches on, reused rather than duplicated.
    titleIdentityPrefix: PI_TITLE_PREFIX,
    // Pi emits the same OSC 9;4 progress protocol Copilot does (`4;3` on turn
    // start, `4;0` on turn end), so it shares that detector rather than
    // getting a near-identical copy. Its OSC 0 title ("π - <session> - <cwd>")
    // encodes no status, and its TUI spinner is the *generic* braille frame
    // set, which is far too common in raw output to match safely — the
    // progress protocol is the only trustworthy signal it has.
    activityDetectors: [detectPiTitle, detectCopilotCLI],
    resume: {
      kind: "hook",
      installStrategy: "pi-extension",
      // Not a config file: pi has no shell-command hook mechanism, so this is
      // a Silo-owned TypeScript extension that pi auto-loads from its global
      // extensions directory. Created wholesale on install, deleted on
      // uninstall (like Copilot's dedicated file, never a merge target).
      configPath: ".pi/agent/extensions/silo-track-session.ts",
      hookEvent: "session_start",
      marker,
      // What the extension spawns — the same shared capture script every
      // other agent runs. The pi installer templates it as an argv inside
      // `buildFileContents` below rather than as a shell string, but the
      // command being run is exactly this.
      buildCommand: () => buildHookCommand("pi"),
      buildFileContents: () =>
        renderPiTrackSessionExtension({
          marker,
          trackScriptRel,
          agentId: "pi",
        }),
      // Confirmed live (2026-08-22, pi 0.84.2): `pi --session <id>` accepts a
      // full or partial session UUID, resolving the current project's
      // sessions first and then globally. It is also how pi itself relaunches
      // a session internally. `-r`/`--resume` exists but only opens the
      // interactive picker, so it is NOT the exact-resume syntax.
      buildResumeCommand: (sessionId) => `pi --session ${sessionId}`,
      postInstallNote:
        "Pi loads extensions at startup, so restart any pi session you " +
        "already have open. Use “Terminal progress” below for live " +
        "working/idle status in Silo.",
    },
    docsUrl: "https://getsilo.dev/guide/agent-sessions#pi",
    runtime: {
      // Already generic in agents-service.ts's applyDetection (gated on
      // `entry?.state.agentId`, not an agent-id check) — declared here so the
      // catalog entry states the fact this policy documents, not to select
      // new code paths. See ADR 0042 decision 3 / the phase-2 implementation
      // note.
      suppressShellIntegrationWhenIdentified: true,
      // Already generic in detectPiTitle itself (identity: true,
      // agentId: "pi" on the DetectionResult it returns) — same as Copilot's
      // title detector. Declared here for the same audit-trail reason.
      identityFromDetection: true,
      // The one field agentByProcessArgs actually reads — replaces what used
      // to be two string literals inline in that function.
      processArgsMarkers: ["pi-coding-agent", "@earendil-works/pi"],
    },
    // ADR 0042 phase 4b: Settings → Agents renders this row generically off
    // `row.agent.extraSettingsToggle` — no `agent.id === "pi"` branch in
    // index.tsx. isEnabled/setEnabled are owned here (not imported from
    // extensions-core) because extension-host must not depend on it.
    extraSettingsToggle: {
      label: "Terminal progress",
      hint:
        "Emit OSC 9;4 progress so Silo can show pi working/idle. Restart " +
        "pi after changing.",
      settingsPathRel: ".pi/agent/settings.json",
      isEnabled: (settings) => {
        const terminal = settings.terminal as
          | { showTerminalProgress?: boolean }
          | undefined;
        return terminal?.showTerminalProgress ?? false;
      },
      setEnabled: (settings, enabled) => ({
        ...settings,
        terminal: {
          ...((settings.terminal as object | undefined) ?? {}),
          showTerminalProgress: enabled,
        },
      }),
    },
    contract:
      "Pi is the one supported agent with no shell-command hook mechanism: " +
      "its hooks are TypeScript extensions auto-loaded from " +
      "~/.pi/agent/extensions/*.ts (global, no trust step — only " +
      "project-local .pi/extensions requires project trust). CONFIRMED live " +
      "against pi 0.84.2 (2026-08-22): (1) an extension is a module with a " +
      "default factory `(pi: ExtensionAPI) => void` that subscribes via " +
      '`pi.on("session_start", handler)`; the event fires with reason ' +
      "startup/reload/new/resume/fork and the handler's ctx exposes " +
      "`sessionManager.getSessionId()` (a UUID) and `cwd`; (2) node " +
      "built-ins (node:child_process, node:os, node:path) are available to " +
      "extensions, and TypeScript is loaded through jiti with no build " +
      "step, so the type-only import in Silo's extension is erased at " +
      "runtime; (3) `pi --session <id>` resumes by full or partial session " +
      "UUID (project-scoped first, then global) — `-r` only opens the " +
      "picker; (4) sessions are stored as " +
      "~/.pi/agent/sessions/<slugified-cwd>/<timestamp>_<uuid>.jsonl and pi " +
      "keeps NO live pid registry, which is why the session-file resume " +
      "path (Grok's) does not apply here. Because the extension runs inside " +
      "pi's own process, it passes pi's pid to the capture script via " +
      "SILO_AGENT_PID and the script skips its parent walk — the walk would " +
      "be actively wrong for a two-character agent name matched by " +
      "substring. Activity detection: pi emits OSC 9;4;3 at turn start and " +
      "OSC 9;4;0 at turn end (the ConEmu progress protocol, via its TUI's " +
      "setProgress), which is the same signal Copilot uses, BUT only when " +
      "`terminal.showTerminalProgress` is true in ~/.pi/agent/settings.json " +
      "and that DEFAULTS TO FALSE (same situation as Cursor's " +
      "showStatusIndicators). With it off, a pi terminal is still " +
      "identified as an agent and still gets exact resume; it just never " +
      "lights up as busy. Pi also emits OSC 133 A/B/C zones around " +
      "messages, which the generic shell-integration fallback reads as " +
      '`source: "shell"` — useful noise, not agent identity. ' +
      "RFC 0033 phase-3 recon (2026-09-02, pi 0.84.3): `pi [options] [--] " +
      "[@files...] [messages...]` takes an opening prompt POSITIONALLY and " +
      'stays interactive — run in a real PTY, `pi "say hello"` answered ' +
      '"hello" and was still at its composer 45s later, so `promptDelivery` ' +
      "is { kind: 'argv' }. NOTE the hook/session findings above were " +
      "confirmed at 0.84.2 and were not re-run at 0.84.3.",
    upstreamRefs: [
      "https://pi.dev",
      "https://www.npmjs.com/package/@earendil-works/pi-coding-agent",
      // The package ships its own docs — docs/extensions.md (the extension
      // API and session_start payload) and docs/sessions.md (--session
      // semantics) are the two Silo's contract depends on.
    ],
    lastVerified: "2026-09-02",
    verifiedAgainstVersion: "pi@0.84.3",
  };
}
