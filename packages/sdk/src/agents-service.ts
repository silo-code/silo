import type { Disposable } from "./types";
import type { TabActivityBinder, TabIconBinder } from "./tab-adornment";

// `ctx.agents` — host-computed coding-agent activity and resume-identity
// observability. See RFC 0018 (docs/proposals/0018-ctx-agents-surface.md).
// Detection is fully sealed inside the host implementation — there is no
// registration API for detectors or resume-hint resolvers. Extensions only
// ever read this surface.

/**
 * What a terminal's agent is currently doing, as classified by the host from
 * OSC/output signals. `"none"` means no agent activity has been observed
 * (including plain, non-agent shells). `"idle"` means the agent finished its
 * last turn and is waiting for the next input — this is purely a fact about
 * the agent itself, independent of whether anyone is looking at the
 * terminal; see {@link AgentInfo.needsAttention} for the separate "has a
 * human seen this" signal (an earlier design conflated the two into a
 * `"waiting"`/`"done"` split on `activity` itself — dropped once it turned
 * out to carry no information `needsAttention` didn't already have).
 * `"dead"` is distinct from a merely `stale` restored state — see
 * {@link AgentInfo.stale} — and means the terminal's backend was confirmed
 * gone (no daemon to reattach to) after an unclean shutdown; nothing will
 * arrive to resolve this on its own.
 *
 * @category Core Types
 * @public
 * @beta
 */
export type AgentActivity = "none" | "working" | "idle" | "error" | "dead";

/**
 * Which kind of **Agent Session** an {@link AgentInfo} describes (RFC 0038):
 *
 * - `"terminal"` — the agent runs in a PTY and draws its own TUI; Silo
 *   *infers* what it is doing from OSC/output signals, and its identity comes
 *   from detection (ADR 0028).
 * - `"chat"` — the agent is an Agent Client Protocol child speaking structured
 *   JSON-RPC over piped stdio; it *reports* what it is doing and declares its
 *   identity at `initialize`, and Silo renders the conversation.
 *
 * `ctx.agents` reports **one shape regardless of kind** — the promise is
 * observation parity, not capability parity. Most consumers never need to
 * branch on this; use {@link AgentsService.reveal} to bring a session into
 * view without knowing which kind it is.
 *
 * @category Core Types
 * @public
 * @beta
 */
export type AgentSessionKind = "terminal" | "chat";

/**
 * Live agent-activity and resume-identity state for one **Agent Session**
 * (RFC 0038), computed once by the host and shared across every subscriber —
 * never recomputed per-extension. Returned by {@link AgentsService.getState}
 * and {@link AgentsService.getByTerminalId}; delivered to
 * {@link AgentsService.subscribe} listeners on every change.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentInfo {
  /**
   * Stable id for this Agent Session — the key {@link AgentsService.reveal},
   * {@link AgentsService.resume}, and {@link AgentsService.acknowledge} take.
   * For a Terminal session this is the terminal record id; for a Chat session
   * it is the session handle's id. Prefer this over
   * {@link AgentInfo.terminalId} for anything that should not care which kind
   * of session it is.
   */
  readonly id: string;
  /**
   * The terminal record id backing this session, when there is one — the same
   * id {@link AgentsService.getByTerminalId} and `ctx.terminals` take.
   * Present for every `kind: "terminal"` session; absent for a `kind: "chat"`
   * session, which has no PTY. A consumer that needs a terminal-tab id should
   * check {@link AgentInfo.kind} first, or use {@link AgentsService.reveal}.
   */
  readonly terminalId?: string;
  /** The workspace this session belongs to. */
  readonly workspaceId: string;
  /**
   * The session's display label — host-computed, the same string for either
   * kind, and the one a consumer should render. A status row, a navigator row
   * and the session's own dock tab all showing this field is what keeps them
   * from drifting.
   *
   * It is a three-step fallback, and the two kinds are exact parallels:
   *
   * | step               | Terminal                            | Chat                              |
   * | ------------------ | ----------------------------------- | --------------------------------- |
   * | the agent's words  | the OSC window title                | `session_info_update.title`       |
   * | the user's name    | `TerminalRecord.customName`   | *(no rename gesture yet)*         |
   * | fallback           | the terminal's derived name         | declared agent name → profile label |
   *
   * The user's name wins where they set one; otherwise the agent's own words
   * win, with agent **status markers stripped** (Claude's spinner, Cursor's
   * trailing ` - Working …`) — the status is already structured state on this
   * same record, so repeating it in the label is noise.
   *
   * Not every agent volunteers a title, and whether a given one does is its
   * own choice — and its adapter's, version to version. A session that never
   * gets one sits on the fallback, exactly as a terminal tab does for a CLI
   * that writes no OSC title. Silo does not paper over that by inventing a
   * summary from the first prompt.
   */
  readonly title: string;
  /**
   * Which kind of Agent Session this is — `"terminal"` or `"chat"`. See
   * {@link AgentSessionKind}. `ctx.agents` reports the same fields for both;
   * this exists for the rare consumer that genuinely needs a PTY tab id or a
   * transcript panel.
   *
   * (This field was the vestigial `TerminalKind` before RFC 0038 — always
   * `"shell"` and read by nothing — and carries the session discriminator
   * now.)
   */
  readonly kind: AgentSessionKind;
  /**
   * Whether this terminal currently hosts an agent — true if it was created
   * as one, or an agent-specific signal was observed in it (e.g. typing
   * `claude` into a plain shell).
   */
  readonly isAgent: boolean;
  /** Current classified activity. */
  readonly activity: AgentActivity;
  /**
   * Sticky "finished, go look" flag: set when the agent goes idle in a
   * terminal that wasn't the active one at that moment, and cleared only by
   * {@link AgentsService.acknowledge}. Never set at all if the terminal
   * *was* already active the instant the agent went idle — being watched
   * live counts as already seen, no acknowledgment needed.
   */
  readonly needsAttention: boolean;
  /** ISO timestamp of when `needsAttention` was set; undefined when not pending. */
  readonly attentionSince?: string;
  /** ISO timestamp of when the current `"working"` phase started; undefined otherwise. */
  readonly workingSince?: string;
  /**
   * Soft, time-gap-based, **self-clearing** signal: this restored `working`/
   * `needsAttention` duration followed a gap long enough that it can't be
   * fully trusted — the agent may have finished without it being observed.
   * The next live signal clears it automatically. Distinct from
   * `activity === "dead"`, which is a hard, structural, non-self-resolving
   * fact — see {@link AgentActivity}.
   */
  readonly stale: boolean;
  /**
   * Exact session identifier for the agent running in this terminal, when one
   * could be determined. Present only when an opt-in `SessionStart` hook has
   * reported it (see the Settings → Agents page); absent otherwise — Silo
   * never *infers* a session id by directory/recency, since that can silently
   * resolve to the wrong session. Populated live once the hook fires (not
   * deferred to death), then persisted, so a consumer reacting to
   * `activity === "dead"` can read it back.
   */
  readonly sessionId?: string;
  /**
   * A ready-to-show (and copy/paste) resume hint. Either an exact
   * `"claude --resume 01abc..."` (when {@link AgentInfo.sessionId} was
   * resolved via a hook) or an honest, session-id-less
   * `"was running claude in ~/foo"` note (when it wasn't). Attached the first
   * time the terminal's agent is detected and persisted, so it is available
   * both live and at `activity === "dead"`.
   */
  readonly resumeCommand?: string;
  /**
   * Whether this session can be resumed **through Silo** — i.e. whether
   * {@link AgentsService.resume} will do something for this id.
   *
   * - Terminal session: `true` once an exact session id was resolved (a
   *   Settings → Agents hook, or an agent's native session file), which is
   *   also when {@link AgentInfo.resumeCommand} becomes exact rather than an
   *   honest note. `resume()` is still a no-op for a Terminal session in this
   *   release — the user runs `resumeCommand` themselves; the flag is the
   *   forward-looking capability signal RFC 0038 replaces the shell-string
   *   `resumeCommand` contract with.
   * - Chat session: `true` when the agent advertises `session/load`, so a
   *   fresh process can reload the transcript after the old one died.
   */
  readonly canResume: boolean;
  /**
   * Human-readable agent name, e.g. `"Claude Code"` or `"Codex CLI"`. Tells
   * you *which* agent CLI is running in this terminal, independent of
   * whether an exact session id was ever resolved — populated as soon as a
   * known agent leader is detected at all (same moment
   * {@link AgentInfo.resumeCommand} is first attached), not deferred until
   * {@link AgentInfo.sessionId} is available.
   */
  readonly agentName?: string;
  /**
   * Stable catalog key for the agent, e.g. `"claude"` or `"codex"` — unlike
   * {@link AgentInfo.agentName} (a display string meant for showing to the
   * user), this is meant for an extension's own code to switch or compare
   * on, and won't change if the display name is ever reworded. Populated at
   * the same moment and lifecycle as `agentName`.
   */
  readonly agentId?: string;
}

/**
 * A Catalog Agent's brand mark — SVG path data plus the two theme-dependent
 * hexes. Consumed by {@link AgentIconGlyph}; a single hex cannot have enough
 * contrast against both a light and a dark tab strip, so `"color"` mode picks
 * `hexLight` / `hexDark` by the host's active base.
 *
 * @category Consumer Services
 * @public
 */
export interface AgentIcon {
  /** Display name, for the glyph's accessible label. */
  title: string;
  /** The brand's color against a light background, no leading `#`. */
  hexLight: string;
  /** The brand's color against a dark background, no leading `#`. */
  hexDark: string;
  /** SVG path data, `viewBox="0 0 24 24"`. */
  path: string;
  /** Set when the source path assumes `fill-rule: evenodd`; omit for the SVG
   *  default (`nonzero`). */
  fillRule?: "evenodd";
  /** A second path (same viewBox) layered on {@link AgentIcon.path} at 40%
   *  opacity, for a genuinely duotone mark (OpenCode's frame + inner panel). */
  accentPath?: string;
  /** `fill-rule` for {@link AgentIcon.accentPath}, independent of `fillRule`. */
  accentFillRule?: "evenodd";
}

/**
 * How {@link AgentIconGlyph} renders: `"none"` draws nothing, `"color"` tints
 * with the brand hex, `"monotone"` inherits `currentColor`.
 *
 * @category Consumer Services
 * @public
 */
export type AgentIconMode = "none" | "color" | "monotone";

/**
 * One Catalog Agent as an extension may read it through
 * {@link AgentsService.catalog}. Read-only — detection stays sealed (ADR 0028)
 * and there is no way to register into the catalog.
 *
 * @category Consumer Services
 * @public
 */
export interface CatalogAgentSummary {
  readonly id: string;
  readonly displayName: string;
  readonly icon?: AgentIcon;
}

/**
 * One **Agent Profile** as an extension may read it through
 * {@link AgentProfilesService.list} — a named recipe for starting a coding
 * agent in a terminal, defined by the user on Settings → Agents → Profiles.
 * Deliberately a summary, never the host's own profile record: the command
 * line, its config directory, and every other launch detail stay host-owned
 * (RFC 0033).
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentProfileSummary {
  /** Stable id — pass it to {@link AgentProfilesService.launch}. */
  readonly id: string;
  /** The user's own name for this profile, e.g. `"Claude (work)"`. Show this;
   *  never show or parse the id. */
  readonly label: string;
  /** True for the single profile marked default, which is what `launch()`
   *  starts when no `profileId` is given. False for every profile when the
   *  user has not chosen one. */
  readonly isDefault: boolean;
  /**
   * Whether this profile's agent can be given an **opening prompt**. A static
   * fact about the agent, not about any particular launch — so a picker can
   * grey out or annotate a profile up front instead of discovering
   * `"agent-takes-none"` after the user has already typed one.
   */
  readonly acceptsPrompt: boolean;
  /**
   * Which **interface** this profile starts the agent through — the profile's
   * `launch` arm, expressed in the same {@link AgentSessionKind} vocabulary
   * `AgentInfo.kind` uses (RFC 0038):
   *
   * - `"terminal"` — {@link AgentProfilesService.launch} runs it in a PTY and
   *   the agent draws its own TUI.
   * - `"chat"` — {@link AgentSessionsService.connect} speaks the Agent Client
   *   Protocol to it and *you* render the conversation.
   *
   * The two are driven through different services, so a picker must filter on
   * this rather than offer every profile to both: `launch()`ing a Chat profile
   * and `connect()`ing a Terminal profile both fail, and the user should never
   * be offered a profile that cannot work in the surface they are looking at.
   */
  readonly interface: AgentSessionKind;
}

/**
 * Why an opening prompt could not be delivered. Silo refuses rather than
 * approximating: a prompt it cannot quote exactly is never typed, and no agent
 * is started without the prompt the caller asked for.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export type PromptRefusal =
  /** The profile matches no agent Silo knows, so there is no way to tell how
   *  its CLI takes a prompt. The user can fix this by setting the agent on the
   *  profile. */
  | "no-agent"
  /** The profile's agent has no way to accept an opening prompt while staying
   *  interactive. Check {@link AgentProfileSummary.acceptsPrompt} first to
   *  avoid offering a prompt for such a profile at all. */
  | "agent-takes-none"
  /** Silo has no exact quoting rule for the shell this terminal would run and
   *  will not guess one. bash, zsh, and fish are supported. */
  | "unsupported-shell"
  /**
   * The prompt exceeds Silo's 2 KiB limit — roughly a page of prose.
   *
   * The ceiling is low because the prompt is *typed* into the user's shell,
   * and a shell with syntax highlighting or autosuggestions cannot reliably
   * consume more than a few KiB in one go. Silo refuses well short of where
   * delivery starts failing, because a truncated prompt would reach the agent
   * looking complete. Trim it and retry.
   */
  | "too-large";

/**
 * Options for {@link AgentProfilesService.launch}. Every field is optional —
 * a bare `launch()` starts the default profile in the active workspace.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface LaunchAgentProfileOptions {
  /** Which profile to start. Defaults to the one marked default, else the
   *  first — the same profile the built-in "New Agent" command uses. */
  profileId?: string;
  /** Which workspace to start it in. Defaults to the active one. A
   *  background workspace works: the session is spawned eagerly, since no
   *  panel will mount to do it. */
  workspaceId?: string;
  /** Working directory for the new terminal. Defaults to the workspace folder. */
  cwd?: string;
  /**
   * An opening prompt to hand the agent on its launch line.
   *
   * The text is delivered as a literal — it is never interpreted by the
   * shell, so `$HOME`, backticks, quotes, and newlines are all safe. If Silo
   * cannot deliver it exactly, the launch is **refused** rather than mangled
   * or silently dropped: nothing is typed, no terminal is created, and
   * `launch()` returns the reason.
   *
   * Keep it to an opening instruction. The limit is **2 KiB** — about a page —
   * and anything longer is refused with `"too-large"`; see that member for
   * why the ceiling is where it is.
   *
   * The composed line is typed into the user's own interactive shell, so it
   * appears in scrollback and in shell history exactly as if they had typed
   * it. Don't put a secret in one.
   */
  prompt?: string;
  /**
   * Activate the target workspace and focus the new terminal. Defaults to
   * `true`. Pass `false` to start an agent without stealing the user's place.
   */
  activate?: boolean;
}

/**
 * What {@link AgentProfilesService.launch} did. A **result**, never a throw:
 * every foreseeable reason a launch cannot happen is a value you can branch
 * on and report to your own user.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export type LaunchAgentProfileResult =
  | {
      readonly ok: true;
      /** The created terminal's record id — the same id
       *  {@link AgentsService.getByTerminalId} and `ctx.terminals` take. */
      readonly terminalId: string;
    }
  | {
      readonly ok: false;
      /** Why nothing was launched. `"no-profile"` — the named profile does
       *  not exist, or there are no profiles at all. `"no-workspace"` — the
       *  named workspace does not exist, or none is open. Otherwise one of the
       *  {@link PromptRefusal} reasons. */
      readonly refusal: PromptRefusal | "no-profile" | "no-workspace";
    };

/**
 * Read the user's **Agent Profiles** and start one, optionally with an opening
 * prompt — exposed as `ctx.agents.profiles` (RFC 0033).
 *
 * A profile is a way to *start* a terminal, not a way to talk to an agent:
 * what comes up is a PTY running a real agent CLI, exactly as if the user had
 * typed the command themselves. There is no agent-agnostic messaging layer
 * here and there is not meant to be one.
 *
 * There is deliberately no `pick()` — build one from `list()` and
 * `ctx.ui.showMenu`, which is the shared chrome — and no `get()`, which is
 * `list().find()`.
 *
 * @example
 * ```ts
 * // Let the user choose a profile, then start it on a task.
 * const profiles = ctx.agents.profiles.list();
 * const chosen = await ctx.ui.showMenu(
 *   profiles.map((p) => ({ id: p.id, label: p.label })),
 * );
 * if (chosen) {
 *   const result = ctx.agents.profiles.launch({
 *     profileId: chosen,
 *     prompt: "Fix the failing test in src/foo.test.ts",
 *   });
 *   if (!result.ok) ctx.ui.notify("warn", `Couldn't start it: ${result.refusal}`);
 * }
 * ```
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentProfilesService {
  /**
   * Every Agent Profile the user has defined, in the order they appear in
   * Settings. The returned array is **read-only and deeply frozen**; it is
   * recomputed when the profile list changes, not on every call.
   */
  list(): readonly AgentProfileSummary[];
  /**
   * Start a profile in a terminal. Returns the created terminal's id, or a
   * typed refusal — see {@link LaunchAgentProfileResult}.
   *
   * A refused prompt creates nothing at all: no terminal record, no workspace
   * activation, no focus change.
   */
  launch(options?: LaunchAgentProfileOptions): LaunchAgentProfileResult;
}

/**
 * One block of an outgoing prompt turn for a **Chat session**
 * ({@link AgentSessionHandle.prompt}). Structured content, never a shell
 * string — the entire quoting/escaping risk surface of a Terminal session's
 * opening prompt (RFC 0033 phase 3) does not exist here.
 *
 * - `"text"` — a run of plain text. `$HOME`, backticks, quotes and newlines
 *   are all literal.
 * - `"resource_link"` — a pointer to a file (or other URI) the agent may read
 *   if it chooses. `uri` is typically a `file://` path inside the workspace.
 *
 * Images and embedded binary context are deferred — the agent advertises what
 * it accepts at connect time, and this union grows behind that.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export type AgentPromptBlock =
  | { readonly type: "text"; readonly text: string }
  | {
      readonly type: "resource_link";
      readonly uri: string;
      /** A short display name for the link; defaults to the last path segment. */
      readonly name?: string;
    };

/**
 * Why a prompt turn ended, straight from the agent's Agent Client Protocol
 * stop reason. `"end_turn"` is the normal completion; `"max_tokens"` /
 * `"max_turn_requests"` are budget cutoffs; `"refusal"` means the agent
 * declined the request; `"cancelled"` follows {@link AgentSessionHandle.cancel}.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export type AgentStopReason =
  | "end_turn"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";

/**
 * What {@link AgentSessionHandle.prompt} resolves to. A prompt that cannot be
 * delivered — the connection dropped, the agent errored mid-turn — **rejects**
 * instead, with the agent's own message where there is one.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentPromptResult {
  readonly stopReason: AgentStopReason;
}

/**
 * One piece of agent-authored content — the Agent Client Protocol content
 * block, which appears both in a streamed message chunk
 * ({@link AgentSessionUpdate.content}) and inside a tool call's output
 * ({@link AgentToolCallContent.content}).
 *
 * **`type` is deliberately a `string`, not a union.** The protocol names
 * `"text"`, `"image"`, `"audio"`, `"resource_link"` and `"resource"`, and a
 * vendor may add its own; the same tolerance rule the rest of this surface
 * follows applies — render the types you know and **name, rather than drop**,
 * one you do not, so a transcript never silently loses a block.
 *
 * Every field but `type` is optional because which ones arrive depends on the
 * type _and_ the agent: only `"text"` blocks were seen from Cursor
 * (2026.09.02) and `claude-agent-acp` (0.75.1) in the 2026-09-08 probe, so
 * treat the rest as modelled-but-unverified and check before you read.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentContentBlock {
  /** The protocol's block type — `"text"`, `"image"`, `"audio"`,
   *  `"resource_link"`, `"resource"`, or a vendor's own. */
  readonly type: string;
  /** The text, for a `"text"` block. */
  readonly text?: string;
  /** MIME type, for an `"image"` / `"audio"` / `"resource_link"` block. */
  readonly mimeType?: string;
  /** Where the content lives, for a `"resource_link"` (or an image given by
   *  reference rather than inline). Typically a `file://` URI. */
  readonly uri?: string;
  /** A short display name, for a `"resource_link"`. */
  readonly name?: string;
}

/**
 * One block of a tool call's content — what the agent wants shown _inside_ the
 * tool row. The protocol wraps each in a `{ type }` envelope, and the three it
 * names are `"content"` (an {@link AgentContentBlock}), `"diff"` (a file edit)
 * and `"terminal"` (output streaming into an agent-side terminal).
 *
 * `type` is a `string` for the usual reason: tolerate what you do not know.
 * The remaining fields are the union's arms flattened, so check `type` before
 * reading them.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentToolCallContent {
  /** `"content"`, `"diff"`, `"terminal"`, or a vendor's own. */
  readonly type: string;
  /** The content block, when `type` is `"content"`. */
  readonly content?: AgentContentBlock;
  /** The file being edited, when `type` is `"diff"`. */
  readonly path?: string;
  /** The file's contents before the edit, when `type` is `"diff"`. Absent for
   *  a file the agent is creating — `claude-agent-acp` 0.75.1 sends `null`
   *  there, which arrives here as `undefined`. */
  readonly oldText?: string;
  /** The file's contents after the edit, when `type` is `"diff"`. */
  readonly newText?: string;
  /** The agent-side terminal this call is streaming into, when `type` is
   *  `"terminal"`. Silo declines `terminal/*` today, so a consumer can name the
   *  block but cannot read its output. */
  readonly terminalId?: string;
}

/**
 * A file (and optionally a line) a tool call touches — the protocol's
 * `locations`, which is how an agent says "this call is about _this_ file"
 * independently of its title. A Chat UI can turn these into "open the file"
 * affordances.
 *
 * Both agents probed on 2026-09-08 send it; only `claude-agent-acp` 0.75.1 was
 * seen sending `line`.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentToolCallLocation {
  /** Absolute path to the file. */
  readonly path: string;
  /** 1-based line the call is focused on, when the agent named one. */
  readonly line?: number;
}

/**
 * One tool call an agent is making, carried by a `tool_call` (the call opening)
 * or a `tool_call_update` (a change to one already open) — see
 * {@link AgentSessionUpdate.toolCall}.
 *
 * **Both kinds map to this same type, so only {@link toolCallId} is
 * guaranteed.** A `tool_call` typically carries `title`, `kind` and `status`;
 * a `tool_call_update` carries **only the fields that changed** (in the
 * 2026-09-08 probe, most updates were `{ toolCallId, status }` alone). So a
 * consumer keys rows by {@link toolCallId} and patches the fields that are
 * present — never overwrite a title with `undefined`.
 *
 * A `tool_call_update` for a call whose opening `tool_call` never arrived is a
 * real shape; render it rather than dropping it.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentToolCall {
  /** The call's id — stable across its `tool_call` and every
   *  `tool_call_update`, and the same id an
   *  {@link AgentPermissionRequest.toolCallId} refers to. */
  readonly toolCallId: string;
  /** Human-readable label, e.g. `"Read notes.md"`. Present on the opening
   *  `tool_call`, and on an update only when it changed — agents do relabel a
   *  call as it progresses. */
  readonly title?: string;
  /** The protocol's coarse category: `"read"`, `"edit"`, `"delete"`,
   *  `"move"`, `"search"`, `"execute"`, `"think"`, `"fetch"`,
   *  `"switch_mode"`, `"other"`, or a vendor's own. Tolerate unknown values;
   *  do not switch exhaustively. */
  readonly kind?: string;
  /** `"pending"`, `"in_progress"`, `"completed"`, `"failed"`, or a vendor's
   *  own. Not every agent walks the whole ladder — `claude-agent-acp` 0.75.1
   *  went `pending` → `completed` with no `in_progress`. */
  readonly status?: string;
  /** What to show inside the row. Absent on an update that changed something
   *  else — treat that as "unchanged", not "now empty". */
  readonly content?: readonly AgentToolCallContent[];
  /** The files this call touches. */
  readonly locations?: readonly AgentToolCallLocation[];
  /** The arguments the agent passed to its own tool, exactly as it sent them.
   *  **Vendor-shaped by definition** — the protocol places no schema on it, so
   *  it is typed `unknown`: narrow it yourself, and expect a different shape
   *  from each agent. */
  readonly rawInput?: unknown;
  /** The tool's own result, same caveat as {@link rawInput}. */
  readonly rawOutput?: unknown;
}

/**
 * One row of the agent's plan — the protocol's `plan` update entry.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentPlanEntry {
  /** What the step is, in the agent's words. */
  readonly content: string;
  /** `"pending"`, `"in_progress"`, `"completed"`, or a vendor's own. */
  readonly status?: string;
  /** `"high"`, `"medium"`, `"low"`, or a vendor's own, when the agent ranked
   *  the step. */
  readonly priority?: string;
}

/**
 * One `session/update` notification from a **Chat session**, lightly
 * normalized. The Agent Client Protocol streams a turn as a sequence of these:
 * assistant text, agent "thinking", tool-call rows, plan updates, and more.
 *
 * **A consumer must tolerate `kind` values it does not recognize** — agents
 * emit different subsets and vendors add their own (recon §3). Switch on the
 * kinds you render and ignore the rest; never treat an unknown kind as an
 * error.
 *
 * Everything a Chat UI must draw to render a transcript is a modelled field:
 * {@link text} / {@link content} for the message kinds, {@link toolCall} for
 * `tool_call` and `tool_call_update`, {@link plan} for `plan`. {@link raw} is
 * for what is deliberately left out — see its own note.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentSessionUpdate {
  /**
   * The Agent Client Protocol `sessionUpdate` discriminator, e.g.
   * `"agent_message_chunk"`, `"agent_thought_chunk"`, `"tool_call"`,
   * `"tool_call_update"`, `"plan"`, `"available_commands_update"`.
   */
  readonly kind: string;
  /**
   * Text payload for the streaming-text kinds (`agent_message_chunk`,
   * `agent_thought_chunk`, `user_message_chunk`); `undefined` for every other
   * kind — and also for a text kind whose block is not text, in which case
   * read {@link content}.
   */
  readonly text?: string;
  /**
   * The whole content block a streaming-text kind carried, of which
   * {@link text} is the `"text"` shorthand. Read it when you want to render an
   * image or a resource link an agent sent as a message rather than dropping
   * it. `undefined` for every non-message kind.
   */
  readonly content?: AgentContentBlock;
  /**
   * Stable id for the run of chunks this update belongs to. Consecutive
   * same-kind chunks share one — **synthesized by Silo when the agent omits
   * `messageId`**, which real agents do (recon Finding 7), so a consumer can
   * group a streamed sentence into one bubble without minting ids itself.
   */
  readonly messageId?: string;
  /**
   * The tool call, for `kind` `"tool_call"` and `"tool_call_update"`;
   * `undefined` otherwise. Key rows by {@link AgentToolCall.toolCallId} and
   * patch in place — an update carries only what changed.
   */
  readonly toolCall?: AgentToolCall;
  /**
   * The agent's plan **in full**, for `kind` `"plan"`; `undefined` otherwise.
   * The agent reissues the entire list every time, so replace the plan you are
   * showing rather than appending to it. May be empty.
   */
  readonly plan?: readonly AgentPlanEntry[];
  /**
   * The raw Agent Client Protocol `update` object — the **escape hatch**, for
   * the kinds and fields this surface does not model.
   *
   * What is deliberately not modelled, and why: `available_commands_update`
   * (an agent's slash commands — a menu, not a transcript row),
   * `usage_update` (token counts, which no agent reports the same way),
   * `current_mode_update` (already surfaced as
   * {@link AgentSessionConfigOption.currentValue}), `session_info_update`
   * (already surfaced as {@link AgentInfo.title}), and vendor extensions such
   * as `claude-agent-acp`'s `_meta`. None is needed to draw a transcript; all
   * are readable here.
   *
   * **`raw` tracks the protocol, not this SDK's semver.** A field inside it can
   * change shape, or vanish, when an agent or its adapter changes — no SDK
   * major required, and that has already happened three times inside one sprint.
   * Read it defensively, and if you find yourself needing it for something
   * every Chat UI must render, that is a gap in this surface worth reporting.
   * Treat it as read-only.
   */
  readonly raw: Readonly<Record<string, unknown>>;
}

/**
 * One choice offered by an {@link AgentPermissionRequest} — pass its
 * {@link AgentPermissionOption.optionId} to {@link AgentPermissionRequest.respond}.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentPermissionOption {
  readonly optionId: string;
  /** Label to show on the button, e.g. `"Allow"`, `"Allow for this session"`,
   *  `"Reject"`. */
  readonly name: string;
  /** The protocol's coarse category for the option, e.g. `"allow_once"`,
   *  `"allow_always"`, `"reject_once"` — for styling a set of buttons
   *  consistently. Tolerate unknown values. */
  readonly kind: string;
}

/**
 * The agent is **blocked on the user**: it wants permission to run a tool and
 * the turn will not proceed until {@link AgentPermissionRequest.respond} is
 * called. Delivered to {@link AgentSessionHandle.onPermission}.
 *
 * **This is not a safety boundary.** An agent routes a request through here
 * only if it chooses to; nothing stops it touching the filesystem directly
 * (recon Finding 1). Do not present this as Silo gating the agent's actions.
 *
 * If no `onPermission` listener is registered, Silo answers `cancelled` on the
 * extension's behalf so the agent is never left hanging.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentPermissionRequest {
  /** The tool call this permission is for — the same id as the matching
   *  {@link AgentToolCall.toolCallId} in the update stream. */
  readonly toolCallId: string;
  /** A human-readable description of what the agent wants to do. */
  readonly title: string;
  /** The choices to present. Always at least one; order is the agent's. */
  readonly options: readonly AgentPermissionOption[];
  /**
   * The call the agent is asking to make, when it sent one — the protocol's
   * `toolCall` params, the same shape the update stream carries. It is how a
   * Chat UI can show the diff **before** the user answers rather than only the
   * title; `claude-agent-acp` 0.75.1 sends a full one including `content`.
   */
  readonly toolCall?: AgentToolCall;
  /** The raw Agent Client Protocol `session/request_permission` params. */
  readonly raw: Readonly<Record<string, unknown>>;
  /**
   * Answer the request with one of {@link AgentPermissionRequest.options}.
   * Idempotent — the first call wins, later calls are ignored. Passing an
   * `optionId` that is not in `options` answers `cancelled`.
   */
  respond(optionId: string): void;
}

/**
 * One selectable value inside an {@link AgentSessionConfigOption}.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentSessionConfigChoice {
  /** The value to pass to {@link AgentSessionHandle.setConfigOption}. */
  readonly value: string;
  /** Label to show, e.g. `"Claude Sonnet"`, `"Plan"`. */
  readonly name: string;
  /** A longer explanation, when the agent gave one. */
  readonly description?: string;
}

/**
 * One session-level control the agent advertised at connect — the Agent Client
 * Protocol `session/new` `configOptions` list (recon 2026-09-08). It is
 * **self-describing and subsumes** the older `modes` / `models` fields: Cursor
 * advertises a `"mode"` entry and a `"model"` entry, Claude a single `"mode"`
 * entry (its permission mode), and a vendor may add its own.
 *
 * The write path is **generic too**:
 * {@link AgentSessionHandle.setConfigOption} goes through the protocol's
 * `session/set_config_option`, so a category Silo has never heard of still
 * works — Claude's `"thought_level"` (Effort) has no typed method anywhere in
 * the protocol and sets fine. Silo keeps `session/set_mode` /
 * `session/set_model` only as a fallback for an agent that does not implement
 * the generic setter.
 *
 * Render one control per entry and **skip an entry whose {@link type} you do
 * not recognise** — the same tolerance rule {@link AgentSessionUpdate} follows
 * for unknown `kind`s. Do not assume every advertised entry is settable: an
 * adapter may list an id its own handler rejects, so treat a failed
 * {@link AgentSessionHandle.setConfigOption} as "stop offering this one".
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentSessionConfigOption {
  /** Stable id — pass it to {@link AgentSessionHandle.setConfigOption}. */
  readonly id: string;
  /** Label for the control, e.g. `"Mode"`, `"Model"`. */
  readonly name: string;
  /** A longer explanation, when the agent gave one. */
  readonly description?: string;
  /**
   * The protocol category that decides how a write is delivered — `"mode"`,
   * `"model"`, or a vendor's own. {@link AgentSessionHandle.setConfigOption}
   * rejects a category with no verified writer.
   */
  readonly category: string;
  /**
   * The control shape. Only `"select"` is modelled today; treat any other
   * value as "do not render".
   */
  readonly type: string;
  /**
   * The currently-selected {@link AgentSessionConfigChoice.value}. Kept
   * current when the agent moves it itself (an ACP `current_mode_update`), so
   * a bound control always reflects reality — subscribe with
   * {@link AgentSessionHandle.onConfigOptionsChanged}.
   */
  readonly currentValue: string;
  /** The choices, in the agent's order. */
  readonly options: readonly AgentSessionConfigChoice[];
}

/**
 * A live handle to one **Chat session** (RFC 0038) — an Agent Client Protocol
 * child Silo spawned from a user-authored Chat profile, speaking structured
 * JSON-RPC over piped stdio. Returned by {@link AgentSessionsService.connect}.
 *
 * The same session shows up in {@link AgentsService.getState} as an
 * {@link AgentInfo} with `kind: "chat"` and this handle's {@link id} — so the
 * Agents navigator, attention badges and status all work for it exactly as for
 * a Terminal session, with no extra wiring.
 *
 * Drive one turn at a time: call {@link prompt}, await its
 * {@link AgentPromptResult}, then prompt again.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentSessionHandle {
  /**
   * This session's {@link AgentInfo.id} — the key {@link AgentsService.reveal},
   * {@link AgentsService.resume} and {@link AgentsService.acknowledge} take.
   * Stable across a {@link AgentsService.resume}.
   */
  readonly id: string;
  /** The user's asserted catalog agent id for the profile, if any — the same
   *  value that selects the profile's `+`-menu icon. */
  readonly agentId?: string;
  /** Display name for the agent: what it declared at connect (`initialize`),
   *  falling back to the profile label when it declared none (recon Finding 4). */
  readonly agentName: string;
  /**
   * Whether the agent advertises `session/load`, i.e. whether
   * {@link AgentsService.resume} can bring this conversation back after the
   * process dies. Mirrors {@link AgentInfo.canResume}.
   */
  readonly canResume: boolean;
  /**
   * Send a prompt turn and resolve when it ends. Content is structured blocks,
   * never a shell string. Rejects if the turn cannot be completed (connection
   * lost, agent error) — with the agent's message where it gave one.
   */
  prompt(blocks: readonly AgentPromptBlock[]): Promise<AgentPromptResult>;
  /**
   * Ask the agent to stop the current turn (Agent Client Protocol
   * `session/cancel`). The in-flight {@link prompt} promise then resolves with
   * `stopReason: "cancelled"` rather than rejecting.
   */
  cancel(): void;
  /**
   * Subscribe to the turn's {@link AgentSessionUpdate} stream — streaming text,
   * tool calls, plans. Fires only between {@link prompt} and its resolution,
   * plus a replay of prior turns right after {@link AgentsService.resume}.
   * Returns a {@link Disposable}.
   */
  onUpdate(listener: (update: AgentSessionUpdate) => void): Disposable;
  /**
   * Subscribe to {@link AgentPermissionRequest}s. Returns a {@link Disposable}.
   * With at least one listener registered, answering is your responsibility;
   * with none, Silo answers `cancelled`.
   */
  onPermission(listener: (request: AgentPermissionRequest) => void): Disposable;
  /**
   * The session-level controls the agent advertised at connect — mode, model,
   * and whatever else it offers, each a self-describing
   * {@link AgentSessionConfigOption}. Empty when it advertised none.
   *
   * This is a **live snapshot**: {@link setConfigOption} and a mode the agent
   * changes itself both update it in place. Subscribe with
   * {@link onConfigOptionsChanged} and re-read.
   */
  readonly configOptions: readonly AgentSessionConfigOption[];
  /**
   * Change one advertised control. `id` names an entry in
   * {@link configOptions}; `value` is one of that entry's
   * {@link AgentSessionConfigChoice.value}s.
   *
   * Works for **any** category the agent advertises, including ones Silo has
   * never heard of — the host writes through the protocol's generic
   * `session/set_config_option`, falling back to the typed
   * `session/set_mode` / `session/set_model` only for an agent that does not
   * implement it.
   *
   * Rejects, with nothing written, on an unknown `id` or a `value` outside
   * that entry's options — and with the agent's own message when the agent
   * refuses (an adapter may advertise an entry its own handler does not know).
   * A rejection is a signal to stop offering that control.
   *
   * Resolves once the agent has acknowledged the change. {@link configOptions}
   * is then replaced from the agent's own updated list — setting one option can
   * move another — and {@link onConfigOptionsChanged} fires just before it
   * resolves.
   */
  setConfigOption(id: string, value: string): Promise<void>;
  /**
   * Fires whenever {@link configOptions} changes — a {@link setConfigOption}
   * landing, or the agent moving a value on its own (an ACP
   * `current_mode_update`). Re-read {@link configOptions} from the handle.
   * Returns a {@link Disposable}.
   */
  onConfigOptionsChanged(listener: () => void): Disposable;
  /**
   * Tear the session down: kill the agent process and drop it from
   * {@link AgentsService.getState}. Idempotent. The process is a piped child of
   * Silo — it does **not** survive this, and closing the workspace or quitting
   * the app reaps it the same way.
   */
  dispose(): void;
}

/**
 * Options for {@link AgentSessionsService.connect}.
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentSessionConnectOptions {
  /** Working directory for the agent. Defaults to the workspace folder. */
  cwd?: string;
  /** Which workspace the session belongs to (for
   *  {@link AgentInfo.workspaceId} and `reveal`). Defaults to the active one. */
  workspaceId?: string;
  /**
   * How to bring **your** UI for this session into view. Silo calls this from
   * {@link AgentsService.reveal} — after activating the session's workspace —
   * so a kind-agnostic caller (the Agents navigator, a notification, a
   * command) can focus a Chat session's transcript without knowing that a
   * transcript is what it is.
   *
   * Implement it with whatever "come to the front" means for your surface: a
   * dock panel calls `api.setActive()` on its own `DockPanelApi`, a side
   * panel reveals itself through `ctx.layout`. Called on the main thread,
   * possibly more than once; keep it cheap and idempotent, and expect it after
   * an `await` — capture the handle you need in a ref rather than closing over
   * render-scoped state.
   *
   * Omit it and `reveal(id)` still activates the workspace, which is all Silo
   * can honestly do for a session whose UI it does not own.
   */
  reveal?: () => void;
}

/**
 * Connect to a **Chat session** and drive it — exposed as
 * `ctx.agents.sessions` (RFC 0038 phase 2). The counterpart to
 * {@link AgentProfilesService} for the `chat` launch arm: where `profiles`
 * *starts a terminal and walks away*, this *holds a live connection* an
 * extension can prompt, watch and cancel.
 *
 * **Sourced from user-authored profiles only.** There is deliberately no
 * "connect to this command" — an extension cannot point Silo at an arbitrary
 * binary to spawn with pipes. The user defines a Chat profile on
 * Settings → Agents; an extension names it.
 *
 * Needs the **`"agents"` {@link Permission}**, declared in the extension's
 * `silo.permissions` and granted at install: {@link connect} throws without it.
 *
 * @example
 * ```ts
 * const session = await ctx.agents.sessions.connect("claude-chat");
 * const off = session.onUpdate((u) => {
 *   if (u.kind === "agent_message_chunk") appendToTranscript(u.messageId, u.text);
 * });
 * const result = await session.prompt([{ type: "text", text: "Explain this repo." }]);
 * ctx.log.info(`turn ended: ${result.stopReason}`);
 * ctx.subscriptions.push(off, { dispose: () => session.dispose() });
 * ```
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentSessionsService {
  /**
   * Spawn the agent for the named Chat profile, run the Agent Client Protocol
   * `initialize` + `session/new` handshake, and resolve with a live
   * {@link AgentSessionHandle}.
   *
   * Rejects when: the extension lacks the `"agents"` permission; no profile has
   * that id; the profile is a Terminal profile, not a Chat one; there is no
   * target workspace; the agent needs authentication (its `session/new`
   * failed); or the agent reported a startup error (the rejection carries its
   * message).
   *
   * @param profileId — an {@link AgentProfileSummary.id} whose profile uses the
   * `chat` launch arm.
   */
  connect(
    profileId: string,
    options?: AgentSessionConnectOptions,
  ): Promise<AgentSessionHandle>;
}

/**
 * Host-computed coding-agent observability — exposed as
 * {@link ExtensionContext.agents}. Detection (what OSC/output signals mean
 * for a given agent) and resume-hint resolution are both sealed inside the
 * host implementation; there is no registration API. Mirrors
 * {@link ProcessesService} in shape: one shared, canonical answer, not
 * something each extension recomputes — reads are unscoped, and
 * {@link AgentsService.acknowledge} is the one deliberately scoped mutation,
 * the same pattern {@link ProcessesService.kill} establishes.
 *
 * @example
 * ```ts
 * const sub = ctx.agents.subscribe((agents) => {
 *   const dead = agents.find((a) => a.activity === "dead");
 *   if (dead) ctx.ui.notify("info", dead.resumeCommand ?? "An agent session ended.");
 * });
 * ctx.subscriptions.push(sub);
 * ```
 *
 * @category Consumer Services
 * @public
 * @beta
 */
export interface AgentsService {
  /**
   * Current {@link AgentInfo} for every tracked terminal in the active
   * workspace. Pass `{ allWorkspaces: true }` for every loaded workspace
   * instead.
   */
  getState(options?: { allWorkspaces?: boolean }): AgentInfo[];
  /** Look up {@link AgentInfo} for a specific terminal tab by its record id.
   *  Only ever resolves a `kind: "terminal"` session — use
   *  {@link AgentsService.getState} and match on {@link AgentInfo.id} to find a
   *  Chat session. */
  getByTerminalId(terminalId: string): AgentInfo | undefined;
  /**
   * Subscribe to changes in the active workspace's agent state. Pass
   * `{ allWorkspaces: true }` to be notified across every loaded workspace
   * instead. Returns a {@link Disposable} that cancels the subscription.
   */
  subscribe(
    listener: (state: AgentInfo[]) => void,
    options?: { allWorkspaces?: boolean },
  ): Disposable;
  /**
   * Acknowledge a finished run: clears {@link AgentInfo.needsAttention} (and
   * its `attentionSince` timestamp). A no-op if the terminal wasn't pending
   * attention. Doesn't touch `activity` — `"idle"` already correctly
   * describes the agent both before and after acknowledgment; only whether
   * a human has seen it changes.
   *
   * Deliberately **not** wired to focus automatically by the host — whether
   * *viewing* a terminal should count as acknowledging it is a per-consumer
   * policy call this method leaves to you, not a fixed rule `ctx.agents`
   * imposes. Call it from wherever your own UI decides a run has been seen —
   * typically `ctx.terminals.subscribeActive`, but it doesn't have to be.
   *
   * @example
   * ```ts
   * // Acknowledge whenever the user actually looks at the terminal.
   * ctx.subscriptions.push(
   *   ctx.terminals.subscribeActive((terminalId) => {
   *     if (terminalId) ctx.agents.acknowledge(terminalId);
   *   }),
   * );
   * ```
   *
   * @param id — an {@link AgentInfo.id}. A terminal record id is one (every
   * Terminal session's `id` equals its `terminalId`), so existing callers
   * passing a terminal id keep working; a Chat session's id works too.
   */
  acknowledge(id: string): void;
  /**
   * The Agent Session the user is currently **looking at** — the one whose
   * surface is the active tab — or `null` when the active tab is not an agent
   * at all (an editor, a settings page, nothing).
   *
   * Kind-agnostic by construction: a terminal tab reports its Terminal
   * session, and a dock panel that declared
   * `DockPanelApi.setAgentSession` reports its Chat session. That is
   * what lets one consumer implement "clear the badge for the session I'm
   * watching" or "hide the row for the session I'm already looking at" without
   * knowing which kind it got.
   *
   * @example
   * ```ts
   * // Hide the status row for whatever the user is already watching.
   * const watching = ctx.agents.getActive();
   * const rows = ctx.agents.getState().filter((a) => a.id !== watching);
   * ```
   */
  getActive(): string | null;
  /**
   * Subscribe to changes in {@link AgentsService.getActive} — fired with the
   * new value (or `null`) whenever the active surface moves. Returns a
   * {@link Disposable} that cancels the subscription.
   */
  subscribeActive(listener: (id: string | null) => void): Disposable;
  /**
   * Bind a provider of **activity badges** for Agent Session tabs — the
   * host-owned `Activity` chrome (spinner / ready / warn / error) on the
   * trailing edge of a tab.
   *
   * The binder's `provide` is handed an {@link AgentInfo.id}, and the host
   * routes the result to whichever tab is showing that session: a terminal tab
   * for a Terminal session, or the dock panel that declared
   * `DockPanelApi.setAgentSession` for a Chat session. One binder,
   * both kinds — which is the point: the `ctx.terminals` equivalent takes a
   * *terminal* id, so an extension literally could not badge a Chat session.
   *
   * `provide` is called synchronously for every visible tab during render.
   * Keep it a lookup: no allocation, no async, no work proportional to the
   * number of sessions.
   *
   * @example
   * ```ts
   * ctx.subscriptions.push(
   *   ctx.agents.bindActivity({
   *     id: "my-ext.agent-badge",
   *     provide(agentSessionId) {
   *       const info = ctx.agents
   *         .getState({ allWorkspaces: true })
   *         .find((a) => a.id === agentSessionId);
   *       if (info?.activity !== "working") return null;
   *       return { activity: "working", tooltip: "Agent working" };
   *     },
   *   }),
   * );
   * ```
   */
  bindActivity(binder: TabActivityBinder): Disposable;
  /**
   * Bind a provider of **leading icons** for Agent Session tabs — a brand mark
   * so a tab running an agent is identifiable at a glance. Same routing and
   * same synchronous-`provide` contract as
   * {@link AgentsService.bindActivity}.
   *
   * Return `null` for "no icon". Take care that a component which renders
   * nothing produces `null` here rather than a truthy element descriptor, or
   * the host reserves tab space for an icon that never appears.
   */
  bindIcon(binder: TabIconBinder): Disposable;
  /**
   * Re-query every bound {@link AgentsService.bindActivity} /
   * {@link AgentsService.bindIcon} provider. Call it when something *outside*
   * the agent snapshot changed what a provider would return — a setting, the
   * active theme — since the host cannot know about those.
   */
  invalidateAdornments(): void;
  /**
   * End an Agent Session, either kind: close its terminal tab, or close the
   * dock panel that declared `DockPanelApi.setAgentSession` for it
   * (which reaps the agent process as the panel unmounts).
   *
   * A no-op for an unknown id, or for a Chat session with no panel mounted —
   * Silo will not kill a connection whose UI it cannot account for.
   *
   * @param id — an {@link AgentInfo.id}.
   */
  close(id: string): void;
  /**
   * Bring an Agent Session into view: focus its terminal tab if it is a
   * Terminal session, or its transcript panel if it is a Chat session —
   * activating the owning workspace first. The caller does not need to know
   * which kind it is, which is the whole point of the verb (RFC 0038): a
   * consumer holding an {@link AgentInfo.id} should never have to branch to
   * `ctx.terminals.focus` vs. some chat-panel API.
   *
   * A no-op for an unknown id, or when the session's backing surface is gone
   * (a closed terminal, a disposed panel).
   *
   * @param id — an {@link AgentInfo.id}.
   */
  reveal(id: string): void;
  /**
   * Resume a session **through Silo**, when {@link AgentInfo.canResume} is
   * `true`.
   *
   * - Chat session: spawn a fresh agent process and `session/load` the
   *   persisted id, so the transcript and context come back after the old
   *   process died. Then {@link AgentsService.reveal} it.
   * - Terminal session: currently a no-op — a dead PTY cannot be re-run in
   *   place, and the resume path stays "the user runs
   *   {@link AgentInfo.resumeCommand}". Present on the surface so a
   *   kind-agnostic consumer can call it unconditionally once Chat sessions
   *   ship (RFC 0038 phase 4).
   *
   * A no-op for an unknown id or one whose `canResume` is `false`.
   *
   * @param id — an {@link AgentInfo.id}.
   */
  resume(id: string): void;
  /**
   * Every coding agent Silo knows about, as read-only
   * {@link CatalogAgentSummary} records. Detection stays sealed (ADR 0028) —
   * there is no way to register into this list.
   *
   * The returned array is **memoized and deeply frozen**: it is read inside
   * tab-icon rendering (`ctx.terminals.bindIcon`), so a fresh allocation per
   * call would be a per-render cost and a mutable one a correctness hazard.
   *
   * @category Consumer Services
   * @public
   */
  catalog(): readonly CatalogAgentSummary[];
  /**
   * The user's **Agent Profiles** — read them, and start one, optionally with
   * an opening prompt. See {@link AgentProfilesService}.
   *
   * @category Consumer Services
   * @public
   * @beta
   */
  readonly profiles: AgentProfilesService;
  /**
   * Connect to and drive a **Chat session** — a user-authored `chat` profile
   * spawned as an Agent Client Protocol child (RFC 0038 phase 2). See
   * {@link AgentSessionsService}. Needs the `"agents"` {@link Permission}:
   * every `connect()` throws without it.
   *
   * @category Consumer Services
   * @public
   * @beta
   */
  readonly sessions: AgentSessionsService;
}
