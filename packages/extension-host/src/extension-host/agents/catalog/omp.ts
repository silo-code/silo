/**
 * OMP (Oh My Pi, https://omp.sh) — a pi fork with its own binary, config home,
 * settings format, and resume syntax (RFC 0037).
 *
 * It gets its own module for the same reason pi does (ADR 0042 decision 2):
 * non-trivial runtime quirks that deserve an obvious home rather than a thin
 * object inline in `agent-catalog.ts`. Like every other agent module, it takes
 * catalog-owned constants as `deps` parameters rather than importing them, so
 * there is no runtime import cycle back into the catalog.
 *
 * **What it shares with pi, and what it doesn't.** OMP kept pi's extension
 * API, so Silo's session hook is the same installed TypeScript extension (ADR
 * 0041) rendered from the same template — see `pi-extension-template.ts`.
 * Everything a catalog entry actually records differs: the binary (`omp`, run
 * by Bun rather than node), the config home (`~/.omp/agent`), the settings
 * format (YAML), the resume flag (`--resume`, where pi's is `--session`), and
 * the OSC 0 title grammar. That is why it is a row of its own rather than an
 * alias — an alias would install Silo's hook into `~/.pi/`, offer
 * `pi --session <id>` for an OMP session, and show pi's name and icon.
 *
 * **The two things easy to get wrong**, both covered by tests:
 *
 * 1. This entry must sit **before** `pi` in `AGENT_CATALOG`. pi's
 *    `pi-coding-agent` process-args marker matches inside OMP's own
 *    `@oh-my-pi/pi-coding-agent` package path, and only catalog order breaks
 *    that tie.
 * 2. `detectOmpTitle`, not `detectPiTitle`. Both titles lead with `π`, but
 *    OMP's separator carries run state and pi's is a literal `" - "`. The two
 *    detectors are disjoint by construction and asserted so in both
 *    directions.
 */

import { detectOmpTitle, OMP_TITLE_PREFIX } from "../agent-osc-detectors";
import {
  renderPiTrackSessionExtension,
  type PiExtensionAgentDeps,
} from "./pi-extension-template";
import type { AgentDefinition } from "../agent-catalog";

/**
 * The package OMP's generated extension imports its types from. Type-only, so
 * it is erased before OMP's jiti loader ever sees it — but it should still
 * name the package actually installed for OMP, which is what its own bundled
 * `examples/extensions/*.ts` import. (pi's upstream
 * `@earendil-works/pi-coding-agent` also resolves at runtime thanks to OMP's
 * legacy shims, but it is not what an OMP user has on disk.)
 */
const OMP_TYPE_IMPORT = "@oh-my-pi/pi-coding-agent";

/** OMP's full catalog entry. A factory, not a plain object, so it can take
 * `deps` as parameters instead of importing them (see the module doc). Takes
 * the same shape pi's factory does — both render the shared extension
 * template, so both need `trackScriptRel`. */
export function buildOmpAgentDefinition(
  deps: PiExtensionAgentDeps,
): AgentDefinition {
  const { marker, trackScriptRel, buildHookCommand } = deps;
  return {
    id: "omp",
    // Upstream brands the project "Oh My Pi" and the CLI "omp"; the uppercase
    // wordmark is what its own docs and TUI use for the product.
    displayName: "OMP",
    // `omp` on PATH is a Bun script (`#!/usr/bin/env bun`), so the foreground
    // process reports as `bun` and this name is reached through
    // `agentByProcessArgs`'s interpreter pass (argv0 `bun`, script basename
    // `omp`) rather than by argv0 directly. Confirmed live 2026-09-04:
    // `comm=bun`, `args=bun /Users/…/.bun/bin/omp`.
    leaderNames: ["omp"],
    // OMP resolves PI_CODING_AGENT_DIR (pi's variable, kept by the fork) to
    // `~/.omp/agent`, and re-exports it into the environment at runtime. The
    // hook `configPath` below sits inside it.
    configDirEnvVar: "PI_CODING_AGENT_DIR",
    // Confirmed live in a real PTY (2026-09-04, omp 18.1.10): `omp "say hello
    // and nothing else"` took the message positionally, started the turn, and
    // stayed in the TUI — its `[MESSAGES...]` argument is an opening message
    // for the interactive session, exactly pi's shape.
    promptDelivery: { kind: "argv" },
    // Redundant once the tab shows OMP's own icon. Only the brand is stripped,
    // not the state separator that follows it — the icon says *who*, the
    // separator says *what it is doing*. When the user asks for status glyphs
    // to be hidden too, `stripAgentStatusMarkers` removes the separator.
    titleIdentityPrefix: OMP_TITLE_PREFIX,
    // One detector, carrying both identity and run state. OMP's OSC 9;4
    // progress is deliberately NOT read — see `contract`.
    activityDetectors: [detectOmpTitle],
    resume: {
      kind: "hook",
      installStrategy: "pi-extension",
      // Same strategy as pi, different path: `pi-extension` is path-driven, so
      // OMP's install writes only this file and never touches `~/.pi/`.
      configPath: ".omp/agent/extensions/silo-track-session.ts",
      hookEvent: "session_start",
      marker,
      buildCommand: () => buildHookCommand("omp"),
      buildFileContents: () =>
        renderPiTrackSessionExtension({
          marker,
          trackScriptRel,
          agentId: "omp",
          displayName: "OMP",
          // "an OMP session" — the name is said with a leading vowel sound
          // even though it is spelled with a consonant.
          indefiniteArticle: "an",
          typeImportSpecifier: OMP_TYPE_IMPORT,
        }),
      // Confirmed live (2026-09-04, omp 18.1.10): OMP itself prints "Resume
      // this session with omp --resume <uuid>" as it exits, and `--help`
      // documents `-r, --resume=<value>` as "Resume a session (by ID prefix,
      // path, or picker if omitted)". Note this is the OPPOSITE of pi, whose
      // `-r`/`--resume` only opens the picker and whose exact form is
      // `--session <id>`.
      buildResumeCommand: (sessionId) => `omp --resume ${sessionId}`,
      postInstallNote:
        "OMP loads extensions at startup, so restart any omp session you " +
        "already have open.",
    },
    docsUrl: "https://getsilo.dev/guide/agent-sessions#omp",
    runtime: {
      // OMP emits OSC 133 message-zone wrappers the same way pi does; once its
      // identity is stamped, that noise must not be read as shell activity.
      suppressShellIntegrationWhenIdentified: true,
      // `detectOmpTitle` carries `agentId: "omp"`, so a title alone names the
      // terminal — the only identity source available on Windows, where there
      // is no foreground argv and no hook install.
      identityFromDetection: true,
      // Read by `agentByProcessArgs`'s package-path pass, for an install
      // invoked through the package file rather than the `omp` shim. Both are
      // needed and both are exercised by tests: `includesPathMarker` takes the
      // first `indexOf` hit and treats `@` as an identifier character, so
      // inside `@oh-my-pi/pi-coding-agent` the bare `oh-my-pi` is rejected for
      // its preceding `@` and only the scoped marker fires; `oh-my-pi` is what
      // matches an unscoped or vendored path.
      processArgsMarkers: ["oh-my-pi", "@oh-my-pi/pi-coding-agent"],
    },
    // No `extraSettingsToggle` on purpose. pi declares one because its only
    // activity signal (OSC 9;4) is off by default. OMP's title state is ON by
    // default, so a row would surface a strictly worse, redundant signal — and
    // it could not be written anyway: `AgentExtraSettingsToggle` reads and
    // writes JSON, while OMP's settings are YAML. See `contract`.
    contract:
      "OMP (Oh My Pi) is a fork of pi that keeps pi's TypeScript extension " +
      "API and diverges on nearly everything else. CONFIRMED live against " +
      "omp 18.1.10 (2026-09-04) via a real PTY capture, a `ps` poll of the " +
      "running process, and OMP's own shipped sources. (1) BINARY: `omp` on " +
      "PATH is a Bun script (`#!/usr/bin/env bun`); `ps` reports comm=`bun` " +
      "and args=`bun /Users/…/.bun/bin/omp`, so identification goes through " +
      "the interpreter pass in agentByProcessArgs, which requires " +
      "noteForeground to treat `bun` as a script interpreter (ADR 0051). " +
      "(2) CONFIG HOME: ~/.omp/agent, which OMP resolves " +
      "PI_CODING_AGENT_DIR to and re-exports; `--profile <name>` (env " +
      "aliases OMP_PROFILE / PI_PROFILE) isolates auth, sessions, settings " +
      "and caches under ~/.omp/profiles/<name>/agent. (3) SETTINGS ARE " +
      "YAML: ~/.omp/agent/config.yml. ~/.omp/agent/settings.json is a " +
      "LEGACY path OMP migrates from exactly once and then renames to " +
      "settings.json.bak — writing it would be silently undone. This is why " +
      "OMP declares no extraSettingsToggle: that mechanism reads and writes " +
      "JSON. (4) ACTIVITY comes from the OSC 0 title, whose separator IS the " +
      "run state: `π > label` idle, `π <braille frame> label` working (ten " +
      "frames at 80ms), `π ! label` blocked on the user, `π : label` " +
      "working on Windows/ConPTY (a static colon — OMP runs no title " +
      "spinner there), and `π: label` when the state separator is disabled. " +
      "`label` is the generated session name, else the cwd basename; with " +
      "no label the separator trails the brand (`π >`). Gated by " +
      "`tui.titleState`, which DEFAULTS TRUE — turning it off leaves OMP " +
      "identified and exactly resumable but never lit up as busy. (5) OSC " +
      "9;4 progress EXISTS but Silo deliberately does not read it: OMP gates " +
      "it behind `terminal.showProgress` (NOT pi's " +
      "`terminal.showTerminalProgress`), which defaults false and lives in " +
      "the YAML config, while the title above needs no setup and says more. " +
      "(6) TITLE DISJOINTNESS: OMP cannot emit pi's `π - ` — `-` is not one " +
      "of its separators — so detectOmpTitle and detectPiTitle never both " +
      "fire, and neither can stamp the other's id on any platform. (7) " +
      "MARKER COLLISION: pi's `pi-coding-agent` marker matches inside OMP's " +
      "own `@oh-my-pi/pi-coding-agent` package path (a `/` is a valid " +
      "boundary), so this entry MUST precede pi in AGENT_CATALOG; a test " +
      "pins the order. (8) HOOK: extensions are TypeScript modules " +
      "auto-loaded from ~/.omp/agent/extensions/*.ts with a default factory " +
      '`(pi: ExtensionAPI) => void`; `pi.on("session_start", handler)` ' +
      "fires with a ctx exposing `sessionManager.getSessionId()` and `cwd` " +
      "(ExtensionContext.sessionManager is a ReadonlySessionManager that " +
      "includes getSessionId). Node built-ins are available and TypeScript " +
      "loads through jiti with no build step, so the type-only import is " +
      "erased at runtime. Because the extension runs inside OMP's own " +
      "process it passes SILO_AGENT_PID and the capture script skips its " +
      "parent walk. VERIFIED END-TO-END in-app 2026-09-06: Silo's installed " +
      "extension loads from ~/.omp/agent/extensions/, session_start fires at " +
      "startup, getSessionId() returns a UUIDv7, and the event reaches " +
      "~/.silo/agent-hooks/events.jsonl tagged omp. Note extensions did NOT " +
      "load from a bare `--profile` or scratch PI_CODING_AGENT_DIR during " +
      "testing, so verify against a real, configured agent dir. (9) RESUME: " +
      "`omp --resume <id>` — OMP prints exactly that line on exit, and the " +
      "command Silo offers was CONFIRMED to resume a real session in-app " +
      "(2026-09-06). Sessions are stored as " +
      "~/.omp/agent/sessions/<slugified-cwd>/<timestamp>_<uuid>.jsonl and " +
      "OMP keeps NO live pid registry, so the session-file resume path " +
      "(Grok's) does not apply. CAVEAT: OMP persists sessions LAZILY — " +
      "getSessionId() returns an id from startup, but the .jsonl is only " +
      "written once the session has history, so a session that never took a " +
      "turn yields a resume command that resolves to nothing. pi has the " +
      "same shape; not special-cased here. (10) OPENING PROMPT: `omp [MESSAGES...]` " +
      "takes a prompt positionally and stays interactive.",
    upstreamRefs: [
      "https://omp.sh",
      "https://github.com/can1357/oh-my-pi",
      "https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent",
      // The two sources Silo's contract actually depends on, both shipped
      // inside the package: `src/utils/title-generator.ts`
      // (buildTerminalTitleWithState — the title grammar above) and
      // `src/config/settings-schema.ts` (`tui.titleState`,
      // `terminal.showProgress` and their defaults).
    ],
    lastVerified: "2026-09-04",
    verifiedAgainstVersion: "omp@18.1.10",
  };
}
