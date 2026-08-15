export type Status = "working" | "waiting" | "ready";
export type PanelKind =
  | "navigator"
  | "files"
  | "search"
  | "git"
  | "system"
  | "prs"
  | "issues"
  | "todos";
export type Side = "left" | "right";

export type SidePanel = {
  id: string;
  label: string;
  kind: PanelKind;
  count?: number;
};

/** One line of a unified diff shown under a `"tool"` entry. */
export type DiffLine = {
  kind: "ctx" | "add" | "del";
  text: string;
  ln?: number;
};

/** One row of a `"subagents"` entry's tree — mirrors a real Task-tool sub-agent line. */
export type SubAgentRow = {
  label: string;
  toolUses?: number;
  tokens?: string;
  state: "running" | "done";
  detail?: string;
};

/** One checklist row of a `"tasklist"` entry. */
export type TaskListItem = { text: string; done?: boolean };

type SimpleEntryType =
  | "command"
  | "output"
  | "success"
  | "error"
  | "agent-text"
  | "status"
  | "heading"
  | "shell";
// A mapped type over the literal union, rather than one `{ type: A | B | … }` arm,
// so each kind stays its own discriminated member (`Extract`/narrowing on `type`
// needs a single literal per member, not a member whose `type` is itself a union).
type SimpleEntry = {
  [K in SimpleEntryType]: { type: K; text: string; delayMs?: number };
}[SimpleEntryType];

/**
 * One entry in a terminal's scripted output. `delayMs` is the reveal delay
 * after the previous entry (including the first — an unset first entry falls
 * back to `TERMINAL_DEFAULT_DELAY_MS`, so a terminal can linger on its banner
 * before "typing" its opening command by giving entry 0 a large `delayMs`).
 * The simple text kinds (`command`/`output`/`success`/`error`/`agent-text`/
 * `status`/`heading`/`shell`) render as one line; the rest render richer
 * Claude Code UI — a tool call with an optional diff, a table, a running
 * sub-agent tree, or a checklist-style task list.
 */
export type TerminalEntry =
  | SimpleEntry
  | { type: "list"; items: string[]; ordered?: boolean; delayMs?: number }
  | {
      type: "tool";
      text: string;
      detail?: string;
      diff?: DiffLine[];
      delayMs?: number;
    }
  | { type: "table"; headers: string[]; rows: string[][]; delayMs?: number }
  | {
      type: "subagents";
      lead?: string;
      agents: SubAgentRow[];
      note?: string;
      delayMs?: number;
    }
  | {
      type: "tasklist";
      title?: string;
      meta?: string;
      items: TaskListItem[];
      more?: number;
      delayMs?: number;
    };

/** Banner metadata for an `"agent"` terminal — the persistent header a real Claude Code session opens with. */
export type AgentMeta = {
  agentId: string;
  agentName: string;
  version?: string;
  model?: string;
  plan?: string;
  cwd?: string;
  mcpWarning?: string;
};

/**
 * Resolved content for one terminal dock tab. `"agent"` represents a coding-agent
 * CLI session (e.g. Claude Code) and carries metadata about which agent it is,
 * mirroring the shape of the real SDK's `AgentInfo` (agentId/agentName).
 * `loopPauseMs` controls how long the terminal sits idle once its entries are
 * fully revealed before it clears and restarts — a short pause reads as a
 * quick loop, a long one reads as the agent finishing and going idle for a while.
 * Set `loop: false` for a session that should play once and stay at its final
 * state, like a dev server that starts and then just sits there running.
 */
type TerminalLogBase = {
  entries: TerminalEntry[];
  loopPauseMs?: number;
  loop?: boolean;
};

export type TerminalLog =
  | ({ kind: "shell" } & TerminalLogBase)
  | ({ kind: "agent"; agent: AgentMeta } & TerminalLogBase);

/** Raw, on-disk shape of a workspace's `terminals/*.json` reference before the loader resolves it. */
export type TabConfig = { id: string; label: string; terminal: string };

/** A live-preview center dock — fake browser chrome around an inline HTML
 *  document (`html`) shown via iframe srcDoc. `url` is only the address-bar label. */
export type WebviewConfig = {
  url: string;
  /** Full HTML document rendered into the preview iframe via srcDoc. */
  html: string;
  /**
   * Viewport width, in CSS px, the page renders at before being scaled to fit the pane.
   * Narrower means the page reads larger in the preview. Keep it above the site's
   * desktop breakpoint (commonly 768px) or it will lay out as mobile. Defaults to 900.
   */
  viewportWidth?: number;
};

/** Raw, on-disk shape of one center dock. `tabs` (terminal) or `webview` is present depending on `kind`; `editor` needs neither — its content is the workspace's `files`. */
export type DockConfigRaw = {
  id: string;
  kind: "terminal" | "editor" | "webview";
  activeTab?: string;
  tabs?: TabConfig[];
  /** On disk the webview has no `html` — the loader inlines it from the bundle. */
  webview?: Omit<WebviewConfig, "html">;
  /** Share of the center column's width, in percent. Omit to fall back to the CSS default for this `kind`. */
  size?: number;
};

/** Git's per-file status letter, mirroring the git-explorer panel's `statusGlyph` — `U` is untracked. */
export type ChangeStatus = "M" | "A" | "D" | "R" | "C" | "U";

export type ChangeItem = {
  status: ChangeStatus;
  /** Repo-relative path. The panel splits this into a bold file name and a dim parent directory. */
  path: string;
  /** Staged files list under their own "Staged Changes" section, above "Changes". */
  staged?: boolean;
};
/** Issue state, mirroring the github-issues panel's `deriveIssueState` — it picks the row's leading icon and its color. */
export type IssueState = "open" | "closed-completed" | "closed-not-planned";

/** A GitHub label. `color` is a bare hex triplet (no `#`), exactly as the API returns it — the chip's text color is derived from it for contrast. */
export type IssueLabel = { name: string; color: string };

export type IssueItem = {
  number: number;
  title: string;
  author: string;
  /** Defaults to `"open"`. */
  state?: IssueState;
  /** Only the first two are shown; the rest collapse into a `+N` chip. */
  labels?: IssueLabel[];
  /** Rendered as one chip — the first login, plus `+N` for the rest. */
  assignees?: string[];
  /** Pre-formatted elapsed time since the last update, e.g. `"1d ago"`. */
  updated: string;
};
/** Review state of a PR, mirroring the github-prs panel's `deriveReviewState` — it picks the row's leading icon and its color. */
export type PrReviewState =
  | "open"
  | "approved"
  | "changes-requested"
  | "review-required"
  | "draft"
  | "merged";

/** Rolled-up CI state, mirroring the github-prs panel's `summarizeChecks` — it picks the row's trailing indicator. */
export type PrChecksState = "passing" | "failing" | "pending";

export type PrItem = {
  number: number;
  title: string;
  author: string;
  /** Defaults to `"open"`. */
  review?: PrReviewState;
  checks?: PrChecksState;
  /** Number of failing checks. The real panel only prints the count when more than one check failed. */
  failing?: number;
  conflicts?: boolean;
  /** Only the first two are shown; the rest collapse into a `+N` chip. */
  labels?: string[];
  /** Pre-formatted elapsed time since the last update, e.g. `"35m ago"`. */
  updated: string;
};

/** One failed run row in the GitHub Actions modal. Only failures are modeled — the modal is a failure-alert surface, not a full run history. */
export type WorkflowRun = {
  id: number;
  name: string;
  /** The worktree/branch chip shown on the run row, e.g. `"worktree-CCPE-1156"`. */
  branchTag: string;
  /** Pre-formatted elapsed time since the run finished, e.g. `"29m ago"`. */
  ago: string;
  prNumber?: number;
};

/** The GitHub Actions status-bar item and its modal's authored state for a workspace. Presence of this field (with a non-empty `runs`) is what puts the workspace into its failed-CI look — the footer badge and the Navigator row's alert line both derive from it. */
export type GithubActionsConfig = {
  repo: string;
  branch: string;
  /** Pre-formatted, e.g. `"just now"`. */
  updatedLabel: string;
  runs: WorkflowRun[];
};
/** One file's hits in the Search panel. `matches` are raw source lines — the panel highlights the query and clamps long lines itself, like the real file-search does. */
export type SearchFileResult = { path: string; matches: string[] };

/** The Search panel's authored state: the query, its glob filters and toggles, and the results it produced. */
export type SearchConfig = {
  query: string;
  includes?: string;
  excludes?: string;
  /** Match Case (`Aa`). */
  caseSensitive?: boolean;
  /** Match Whole Word (`ab`). */
  wholeWord?: boolean;
  /** Use Regular Expression (`.*`). */
  regex?: boolean;
  files: SearchFileResult[];
};

/** One slice of the System panel's memory donut. Colors come from the extension's own palette, keyed by label. */
export type MemorySegment = { label: string; gb: number };

/** One session row in the System panel's Processes card. */
export type ProcessRow = {
  title: string;
  /** Descendant count — a row with children shows a chevron and a `(N)` suffix. */
  childCount?: number;
  /** The session leader's command, shown in its own column (e.g. `claude`, `cursor-agent`). */
  leader?: string;
  cpu: number;
  memoryMb: number;
  /** Sitting at a shell prompt — renders the `idle` pill instead of a leader name. */
  idle?: boolean;
};

/** The System panel's authored state — one card each for Memory, CPU and Processes. */
export type SystemConfig = {
  /** Total is the sum of every segment; used is everything but `Free`. */
  memory: MemorySegment[];
  cpu: { user: number; sys: number };
  /** `procs` counts every process including descendants, so it's authored rather than derived from `rows`. */
  processes: { procs: number; rows: ProcessRow[] };
};

/** Raw, on-disk shape of a workspace's `config.json`. */
export type WorkspaceConfig = {
  id: string;
  /** Explicit Navigator/load order — not filesystem or alphabetical, since folder names shouldn't dictate demo pacing. */
  order: number;
  name: string;
  path: string;
  branch: string;
  /** Commits ahead of the upstream — the header's ↑ count. Defaults to 0. */
  ahead?: number;
  /** Commits behind the upstream — the header's ↓ count. Defaults to 0. */
  behind?: number;
  color: string;
  status: Status;
  summary: string;
  panels: Record<Side, SidePanel[]>;
  splitPanels?: Partial<Record<Side, SidePanel[]>>;
  activePanels: Record<Side, string>;
  activeSplitPanels?: Partial<Record<Side, string>>;
  /** Height of a side column's *upper* pane, in percent, when that side is split. The lower pane takes the rest. Omit to fall back to the CSS default. */
  splitSize?: Partial<Record<Side, number>>;
  collapsed: Record<Side, boolean>;
  files: string[];
  activeFile: string;
  changes: ChangeItem[];
  issues: IssueItem[];
  prs: PrItem[];
  system: SystemConfig;
  search: SearchConfig;
  docks: DockConfigRaw[];
  /** Omit for a workspace with a clean CI history — see `GithubActionsConfig`. */
  githubActions?: GithubActionsConfig;
};

/** A terminal dock tab with its `terminal` file reference resolved to real content. */
export type DockTab = { id: string; label: string; log: TerminalLog };
export type DockConfig = {
  id: string;
  kind: "terminal" | "editor" | "webview";
  activeTab?: string;
  tabs?: DockTab[];
  webview?: WebviewConfig;
  size?: number;
};

/** A workspace with every `files`/`terminals` reference resolved to real, loader-provided content. */
export type Workspace = {
  id: string;
  name: string;
  path: string;
  branch: string;
  /** Commits ahead of the upstream — the header's ↑ count. Defaults to 0. */
  ahead?: number;
  /** Commits behind the upstream — the header's ↓ count. Defaults to 0. */
  behind?: number;
  color: string;
  status: Status;
  summary: string;
  panels: Record<Side, SidePanel[]>;
  splitPanels?: Partial<Record<Side, SidePanel[]>>;
  activePanels: Record<Side, string>;
  activeSplitPanels?: Partial<Record<Side, string>>;
  splitSize?: Partial<Record<Side, number>>;
  collapsed: Record<Side, boolean>;
  files: string[];
  fileContents: Record<string, string>;
  activeFile: string;
  changes: ChangeItem[];
  issues: IssueItem[];
  prs: PrItem[];
  system: SystemConfig;
  search: SearchConfig;
  docks: DockConfig[];
  githubActions?: GithubActionsConfig;
};

export { baseWorkspaces } from "./workspace-loader";

export type DemoScriptClickStep = {
  afterMs: number;
  /** CSS selector for the real element to click, resolved inside .demo-wrap. */
  selector: string;
  /** Pause between the cursor arriving and the click firing, in ms. Defaults to the standard settle delay — raise it for a step that should read as a deliberate hover before the click. */
  holdMs?: number;
};

/** Non-pointer steps for one-off record vignettes (not used by the hero loop). */
export type DemoScriptActionStep = {
  afterMs: number;
  action:
    | "show-worktree-toast"
    | "hide-worktree-toast"
    | "reveal-todos-panel"
    | "start-claude-terminal"
    | "reveal-codex-tab";
};

export type DemoScriptStep = DemoScriptClickStep | DemoScriptActionStep;

export function isDemoScriptClickStep(
  step: DemoScriptStep,
): step is DemoScriptClickStep {
  return "selector" in step;
}

/**
 * The scripted opening pass for the homepage demo. Each step glides the
 * cursor to a real, already-clickable element and dispatches an untrusted
 * click on it, so playback can never drift out of sync with the UI it's
 * demonstrating. The first real (trusted) pointer interaction pauses this
 * sequence and leaves the visitor in control.
 */
export const demoScript: DemoScriptStep[] = [
  { afterMs: 2200, selector: '[data-demo-target="panel:issues"]' },
  { afterMs: 2200, selector: '[data-demo-target="panel:git"]' },
  { afterMs: 2200, selector: '[data-demo-target="workspace:docs"]' },
  { afterMs: 2600, selector: '[data-demo-target="workspace:api"]' },
  { afterMs: 2200, selector: '[data-demo-target="panel:system"]' },
  { afterMs: 2600, selector: '[data-demo-target="add-workspace"]' },
  { afterMs: 900, selector: '[data-demo-target="open-workspace:mobile"]' },
  // The view list (silo-code/silo ADR 0038) puts every view one click away —
  // no menu to open first, so this is a single click straight onto the
  // Agents row rather than the two-step "open the dropdown, then pick" it
  // used to be.
  { afterMs: 2400, selector: '[data-demo-target="nav-view:agents"]' },
  // Click through a few agents from different workspaces so a visitor sees
  // the Agents view isn't just a status list — each row jumps you straight
  // into that agent's workspace. Paced slower than the panel-switching steps
  // above so there's time to actually register each terminal before the next.
  // Ends on website:cursor ("add a dark mode toggle to the navbar") so the
  // loop closes back on the same agent the demo opened on.
  { afterMs: 2800, selector: '[data-demo-target="agent-row:docs:claude"]' },
  { afterMs: 2800, selector: '[data-demo-target="agent-row:api:claude"]' },
  { afterMs: 2800, selector: '[data-demo-target="agent-row:website:cursor"]' },
  { afterMs: 2400, selector: '[data-demo-target="nav-view:workspaces"]' },
  // Close the workspace opened mid-demo so the loop hands back the same
  // three-workspace list (website/docs/api) it started with.
  { afterMs: 1400, selector: '[data-demo-target="close-workspace:mobile"]' },
  // Finish on the failed-CI story: a deliberate hover (holdMs) on the
  // status-bar item before the click, so it reads as a considered click
  // rather than another quick tap, then a beat to take in the modal before
  // it's dismissed via its own close button.
  {
    afterMs: 2000,
    selector: '[data-demo-target="status-actions"]',
    holdMs: 1650,
  },
  { afterMs: 2800, selector: '[data-demo-target="close-github-actions"]' },
];

/**
 * A cropped Navigator vignette: slow workspace switching only.
 * Cursor lands on website, glides to docs → click, api → click, back to
 * website → click, then ends.
 */
export const navigatorDemoScript: DemoScriptStep[] = [
  {
    afterMs: 600,
    selector: '[data-demo-target="workspace:website"]',
    // Enter from top + short linger on the active row.
    holdMs: 1700,
  },
  {
    afterMs: 400,
    selector: '[data-demo-target="workspace:docs"]',
    holdMs: 1800,
  },
  {
    afterMs: 400,
    selector: '[data-demo-target="workspace:api"]',
    holdMs: 1800,
  },
  {
    afterMs: 400,
    selector: '[data-demo-target="workspace:website"]',
    holdMs: 1800,
  },
];

/**
 * One-off vignette for recording the Git worktree-detect toast — not part of
 * the homepage hero loop. Use the local vignette recorder:
 * `pnpm --filter @silo-code/website-recorder recorder` → /recorder.html
 * (preset “Git · worktree toast”), or `capture:feature-git` for a headless run.
 *
 * Assumes the active workspace already has the Git panel on the right
 * (website does). Toast at 4s; cursor enters from the top at 6s, lands on
 * “Add to workspace”, and clicks at 8s.
 */
export const worktreeToastRecordScript: DemoScriptStep[] = [
  { afterMs: 4000, action: "show-worktree-toast" },
  {
    afterMs: 2000,
    selector: '[data-demo-target="worktree-toast-add"]',
    // 1s glide from top + 1s hover, then click at t=8s.
    holdMs: 2000,
  },
];

/**
 * One-off vignette for recording the extensions story — Claude builds a TODOs
 * side panel from `TODOS.md`. Not part of the homepage hero loop.
 * Recorder: `pnpm --filter @silo-code/website-recorder recorder` → preset
 * “Extensions · TODOs panel” (`extensionTodosScene`).
 *
 * The scene starts already on `extension-demo` (own layout in that folder's
 * config.json). This script only waits for the one-shot Claude transcript,
 * then reveals the TODOs rail tab.
 */
/**
 * Extensions vignette orchestration. In the recorder, terminals are driven by
 * the playhead — Play starts Claude; scrubbing revisits mid-transcript.
 * After the Claude log finishes (~7.4s), reveal the TODOs rail tab so you can
 * add a zoom toward that panel on the timeline.
 */
export const extensionTodosRecordScript: DemoScriptStep[] = [
  { afterMs: 7_800, action: "reveal-todos-panel" },
];

/**
 * Terminals-first vignette: Cursor scrolls continuously (~16s), Claude joins
 * at 5s, Codex starts on the left at 12s.
 */
export const terminalsFirstRecordScript: DemoScriptStep[] = [
  { afterMs: 5_000, action: "start-claude-terminal" },
  { afterMs: 7_000, action: "reveal-codex-tab" },
];

/** One row in the Settings → Extensions Browse list. */
export type RegistryEntry = {
  id: string;
  name: string;
  version: string;
  description: string;
  /** `"installed"` gets the green Installed badge, `"update-available"` the warn badge plus an Update button. */
  state: "installed" | "update-available" | "not-installed";
  permissions?: string[];
  /** Shown in place of the download count when the build didn't come from the registry. */
  installedFrom?: string;
  downloads?: number;
  categories: string[];
};

/** The Settings dialog's page rail. Only `Extensions` is selectable in the prototype — the rest are inert labels. */
export const SETTINGS_PAGES = [
  { id: "keyboard-shortcuts", title: "Keyboard Shortcuts" },
  { id: "editor", title: "Editor" },
  { id: "terminal", title: "Terminal" },
  { id: "layout", title: "Layout" },
  { id: "extensions", title: "Extensions", group: "extensions" },
  { id: "agent-monitor", title: "Agent Monitor" },
  { id: "system-monitor", title: "System Monitor" },
  { id: "github-actions", title: "GitHub Actions" },
  { id: "github-prs", title: "GitHub Pull Requests" },
  { id: "agents", title: "Agents", group: "agents" },
  { id: "about", title: "About Silo", group: "about" },
];

/** Category pills above the Browse list. `all` is rendered separately and starts active. */
export const REGISTRY_CATEGORIES = [
  "agent-tools",
  "docs",
  "editor",
  "integration",
  "monitoring",
  "productivity",
  "side-panel",
  "status-bar",
  "webview",
];

/**
 * The extension registry as the Browse tab shows it. Two entries carry an
 * available update, which is what lights the status bar's gear indicator.
 */
export const REGISTRY_ENTRIES: RegistryEntry[] = [
  {
    id: "silo.agent-monitor",
    name: "Agent Monitor",
    version: "0.2.3",
    state: "update-available",
    categories: ["agent-tools", "side-panel"],
    description:
      "At-a-glance agent status in the Workspaces panel: rows for coding agents that are working or finished and need attention, cleared when you view the terminal.",
    installedFrom: "a folder",
  },
  {
    id: "silo.docs-panel",
    name: "Documents Side Panel",
    version: "0.1.5",
    state: "installed",
    permissions: ["fs:read"],
    categories: ["docs", "side-panel"],
    description:
      "Browse and preview markdown documentation from configurable folder roots.",
    installedFrom: "a folder",
  },
  {
    id: "silo.follow-ups",
    name: "Follow-ups",
    version: "0.2.1",
    state: "update-available",
    categories: ["productivity", "editor"],
    description:
      "Mark editor and terminal tabs to come back to later — toolbar Flag toggle, tab chip, and a Workspaces panel rollup.",
    installedFrom: "a folder",
  },
  {
    id: "silo.github-actions",
    name: "GitHub Actions",
    version: "0.1.19",
    state: "installed",
    permissions: ["process"],
    categories: ["integration", "status-bar"],
    description:
      "Monitor GitHub Actions workflow runs across workspace repos — status bar, workspace badges, and failure notifications.",
    installedFrom: "a folder",
  },
  {
    id: "silo.github-issues",
    name: "GitHub Issues",
    version: "0.1.2",
    state: "installed",
    permissions: ["process"],
    categories: ["integration", "side-panel"],
    description:
      "GitHub issues for workspace repos in a side panel — status, labels, assignees, and drill-in details, with quick copy for handing work to an agent.",
    installedFrom: "a folder",
  },
  {
    id: "silo.github-prs",
    name: "GitHub Pull Requests",
    version: "0.1.13",
    state: "installed",
    permissions: ["process"],
    categories: ["integration", "side-panel"],
    description:
      "Review pull requests without leaving Silo — list, diff, comments, and merge, scoped to the workspace's repo.",
    installedFrom: "a folder",
  },
  {
    id: "silo.local-web-viewer",
    name: "Local Web Viewer",
    version: "0.1.5",
    state: "installed",
    categories: ["webview"],
    description:
      "Open a local dev server in a dock pane and keep it live while you edit.",
    installedFrom: "a folder",
  },
  {
    id: "silo.system-monitor",
    name: "System Monitor",
    version: "0.3.0",
    state: "installed",
    permissions: ["process"],
    categories: ["monitoring", "side-panel"],
    description:
      "Memory, CPU and per-session process usage for the machine and the workspace's terminals.",
    installedFrom: "a folder",
  },
  {
    id: "acme.todo-tree",
    name: "Todo Tree",
    version: "0.4.2",
    state: "not-installed",
    permissions: ["fs:read"],
    categories: ["productivity", "side-panel"],
    description:
      "Collect TODO / FIXME / HACK comments across the workspace into a browsable tree.",
    downloads: 4812,
  },
  {
    id: "acme.rest-client",
    name: "REST Client",
    version: "1.2.0",
    state: "not-installed",
    permissions: ["net"],
    categories: ["editor", "productivity"],
    description:
      "Send HTTP requests from a .http file and read the response in a dock pane.",
    downloads: 3190,
  },
  {
    id: "acme.env-switcher",
    name: "Env Switcher",
    version: "0.3.1",
    state: "not-installed",
    permissions: ["fs:read", "fs:write"],
    categories: ["productivity", "status-bar"],
    description:
      "Swap .env files per workspace from the status bar, with a guard against committing the active one.",
    downloads: 1744,
  },
  {
    id: "acme.docker-panel",
    name: "Docker Panel",
    version: "0.6.0",
    state: "not-installed",
    permissions: ["process"],
    categories: ["monitoring", "side-panel"],
    description:
      "List, start, stop and tail logs for the containers a workspace's compose file defines.",
    downloads: 9021,
  },
  {
    id: "acme.markdown-slides",
    name: "Markdown Slides",
    version: "0.2.4",
    state: "not-installed",
    categories: ["docs", "webview"],
    description:
      "Present a markdown file as slides in a dock pane, with live reload as you edit.",
    downloads: 653,
  },
];
