/**
 * POSIX-shell session-capture script body (RFC 0019) — pure template.
 * Catalog stays the SSOT for known agent names / markers; this module only
 * packages the shell. Keeps "what is an agent" out of the same file as
 * "how we package POSIX."
 */

export interface TrackSessionScriptParams {
  marker: string;
  /** `$HOME`-relative hooks dir, e.g. `.silo/agent-hooks`. */
  hooksDirRel: string;
  /** Space-separated argv0 basenames the walk recognizes. */
  knownNames: string;
}

/**
 * Build the shared POSIX-shell session-capture script. One script serves every
 * agent — the walk logic is agent-independent; the per-agent tag arrives as
 * `$1`. See RFC 0019.
 */
export function renderTrackSessionScript(
  params: TrackSessionScriptParams,
): string {
  const { marker, hooksDirRel, knownNames } = params;
  return [
    "#!/bin/sh",
    "# Silo session tracking (getsilo.dev) — records which agent session is",
    "# running in a terminal so Silo can offer an exact resume command.",
    "# Safe to inspect. Managed by Silo; see Settings > Agents.",
    `# Marker: ${marker}`,
    'agent="$1"',
    "payload=$(cat | tr '\\n' ' ')",
    "",
    "# Extract the session id (both key spellings) via parameter expansion —",
    "# no sed, no regex backslashes; session ids are UUIDs so this is safe.",
    "sid=",
    'case "$payload" in',
    "  *'\"session_id\"'*) rest=${payload#*'\"session_id\"'} ;;",
    "  *'\"sessionId\"'*)  rest=${payload#*'\"sessionId\"'} ;;",
    "  *) rest= ;;",
    "esac",
    'if [ -n "$rest" ]; then',
    "  rest=${rest#*'\"'}     # drop through the value's opening quote",
    "  sid=${rest%%'\"'*}     # value is up to the next quote",
    "fi",
    '[ -n "$sid" ] || exit 0  # nothing to record without a session id',
    "",
    "# Forward-compat seam (RFC 0020): Silo-spawned agents inherit",
    "# $SILO_TERMINAL_ID and can be matched directly, skipping the walk.",
    "# Structured env-var-first so 0020 slots in additively; empty today.",
    'if [ -n "$SILO_TERMINAL_ID" ]; then',
    "  : # RFC 0020 fills this in (write a terminal-id-keyed event, then exit).",
    "fi",
    "",
    "# An agent that runs this hook from INSIDE its own process (pi, whose hooks",
    "# are TypeScript extensions rather than shell commands) already knows its",
    "# pid and passes it directly — the walk is pure downside there, since its",
    "# argv0 is 'node' and its short name would only ever match by substring.",
    'if [ -n "$SILO_AGENT_PID" ]; then',
    "  target=$SILO_AGENT_PID",
    "else",
    "",
    "# Walk parents from our PPID to the real agent process, then take its pgid.",
    "# Prefer an EXACT argv0-basename match ($exact) over a mere substring match",
    "# ($sub). Cursor runs the hook from a setpgrp worker whose argv references",
    "# the cursor-agent path (so it substring-matches) but whose basename is not",
    "# an agent — stopping there yields the worker's own pgid, not the terminal's",
    "# foreground group (confirmed live: worker pgid 99940 vs cursor-agent 98143).",
    "# Exact-first climbs past that worker to cursor-agent; substring stays as the",
    "# fallback for node-wrapped agents whose argv0 is 'node' (Claude/Copilot).",
    `KNOWN="${knownNames}"`,
    "pid=$PPID; exact=; sub=",
    "i=0",
    'while [ "$i" -lt 12 ] && [ "${pid:-0}" -gt 1 ]; do',
    '  args=$(ps -p "$pid" -o args= 2>/dev/null)',
    '  [ -n "$args" ] || break',
    "  base=${args%% *}; base=${base##*/}",
    "  for k in $KNOWN; do",
    '    [ "$base" = "$k" ] && { exact=$pid; break; }',
    "  done",
    '  [ -n "$exact" ] && break',
    '  if [ -z "$sub" ]; then',
    "    for k in $KNOWN; do",
    '      case "$args" in *"$k"*) sub=$pid; break ;; esac',
    "    done",
    "  fi",
    "  pid=$(ps -p \"$pid\" -o ppid= 2>/dev/null | tr -d ' ')",
    "  i=$((i + 1))",
    "done",
    "target=${exact:-${sub:-$PPID}}",
    "fi",
    "",
    "pgid=$(ps -p \"$target\" -o pgid= 2>/dev/null | tr -d ' ')",
    '[ -n "$pgid" ] || exit 0',
    "",
    `dir="$HOME/${hooksDirRel}"; mkdir -p "$dir"`,
    "ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    'printf \'{"pid":%s,"sessionId":"%s","agent":"%s","timestamp":"%s"}\\n\' \\',
    '  "$pgid" "$sid" "$agent" "$ts" >> "$dir/events.jsonl"',
    "",
  ].join("\n");
}
