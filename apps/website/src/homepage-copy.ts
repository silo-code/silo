/** Shared marketing copy for the React homepage and the SSG SEO shell.
 *  Keep apps/docs/index.md's #silo-home shell in sync with these strings. */

export const SITE_NAME = "Silo";

export const SITE_DESCRIPTION =
  "One window — every project, every agent. Terminals, agents, and layout stay intact — switch between them instantly. 100% open source, free forever.";

export const EYEBROW = "FOR DEVELOPERS JUGGLING CODING AGENTS";

export const HEADLINE_LINE1 = "One window —";
export const HEADLINE_LINE2 = "every project, every agent";

export const INTRO_COPY =
  "Terminals, agents, and layout stay intact — switch between them instantly. 100% open source, free forever.";

export type HomeLink = {
  text: string;
  href: string;
  primary?: boolean;
  /** Optional brand glyph rendered before the label. */
  icon?: "platform" | "github";
};

export const DOWNLOAD_HREF =
  "https://github.com/silo-code/silo/releases/latest";

/** Hero CTAs only — mirrored in the SEO shell. */
export const HERO_ACTIONS: HomeLink[] = [
  {
    text: "Download",
    href: DOWNLOAD_HREF,
    primary: true,
    icon: "platform",
  },
  {
    text: "Star on GitHub",
    href: "https://github.com/silo-code/silo",
    icon: "github",
  },
];

/** Compact top nav for the React marketing header (text links only). */
export const NAV_LINKS: HomeLink[] = [
  { text: "Extensions", href: "https://extensions.getsilo.dev" },
  { text: "Docs", href: "/guide/" },
  { text: "Changelog", href: "/changelog" },
  { text: "GitHub", href: "https://github.com/silo-code/silo" },
];

/** Far-right nav CTA — same destination as the hero Download button. */
export const NAV_DOWNLOAD: HomeLink = {
  text: "Download",
  href: DOWNLOAD_HREF,
  primary: true,
  icon: "platform",
};

/** Below-fold zigzag story beats — label / headline / body (+ optional proof). */
export type StorySection = {
  id: string;
  label: string;
  title: string;
  body: string;
  /** Short supporting line (e.g. close/resurrect proof under Workspaces). */
  proof?: string;
  /** Placeholder caption until real screenshots land. */
  visualHint: string;
  /** Optional alt text when a screenshot is shown. */
  visualAlt?: string;
};

export const STORY_SECTIONS: StorySection[] = [
  {
    id: "workspaces",
    label: "Workspaces",
    title: "Each project a click away",
    body: "Switch with a keystroke. Terminals keep running, agents keep working, layout stays put — nothing reloads.",
    proof:
      "Close a workspace and come back weeks later; everything is still in its place.",
    visualHint: "Workspace dock — switch without reload",
    visualAlt:
      "Silo with website, docs, and api workspaces open — docs selected while Claude fixes broken links",
  },
  {
    id: "git",
    label: "Git",
    title: "Worktrees without leaving the workspace",
    body: "Create a worktree on a branch, open it alongside your main folder, remove it when you're done — the branch stays. Stage, commit, and manage worktrees from the same Git panel.",
    visualHint: "Git panel — manage worktrees",
    visualAlt:
      "Silo Git panel with a New worktree detected toast offering Add to workspace",
  },
  {
    id: "terminals",
    label: "Terminals",
    title: "Agents and terminals come first",
    body: "Most editors are file-first — the terminal is a drawer, the agent a side panel. Silo flips it: coding agents and terminals are the main surface; the editor shares the stage when you need it.",
    visualHint: "Agent + terminal tabs beside the editor",
    visualAlt:
      "Silo with Cursor and Claude agent terminals side by side in the api workspace",
  },
  {
    id: "extensions",
    label: "Extensions",
    title: "Build the tool this project needs",
    body: "Notice a friction, ask Claude to scaffold an extension, use it minutes later. Same public SDK the first-party features use — optional, uninstallable, shareable via the registry.",
    visualHint: "Agent-built extension → install",
    visualAlt:
      "Claude scaffolding a silo.todos side-panel extension from TODOS.md in Silo",
  },
];

/** Agent trust band — sits directly under the hero demo. */
export const AGENTS_TITLE = "Runs the agents you already use.";
export const AGENTS_LINE =
  "Claude, Cursor, Codex, Copilot, Grok, pi, OpenCode, and anything else that talks to a terminal.";

export type AgentIconId =
  | "claude"
  | "cursor"
  | "codex"
  | "copilot"
  | "grok"
  | "pi"
  | "opencode";

export type AgentBadge = {
  name: string;
  icon: AgentIconId;
};

export const AGENTS: AgentBadge[] = [
  { name: "Claude", icon: "claude" },
  { name: "Cursor", icon: "cursor" },
  { name: "Codex", icon: "codex" },
  { name: "Copilot", icon: "copilot" },
  { name: "Grok", icon: "grok" },
  { name: "pi", icon: "pi" },
  { name: "OpenCode", icon: "opencode" },
];

export const TRUST_TITLE = "100% open source. Free forever.";
export const TRUST_LINE =
  "MIT licensed. No account. No telemetry. Nothing to lose by trying it.";

export type FaqItem = {
  question: string;
  answer: string;
};

/** Accordion under the trust band — reinforces license/local-first and
 *  answers the objections that usually follow. */
export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is Silo really free?",
    answer:
      "Yes. MIT licensed, free forever — no subscription, no trial, no enterprise tier. Fork it, read the source, build on it.",
  },
  {
    question: "Do I need an account?",
    answer:
      "No. Download it and run. Everything stays on your machine — no cloud sync, no sign-in, no telemetry.",
  },
  {
    question: "How is this different from VS Code or Cursor?",
    answer:
      "Those are file-first editors built around one active workspace. Silo is built around many workspaces that stay alive at once — terminals, agents, and layout intact when you switch. You don't rebuild context every time you change projects.",
  },
  {
    question: "How is this different from agent orchestrators?",
    answer:
      "Orchestrators organize agent tasks (often one worktree per task). Silo organizes your whole project — agents, terminals, editors, panels — as a workspace you can switch, close, and resurrect. Worktrees are git tooling inside that model, not the unit of work.",
  },
  {
    question: "Is the editor as good as Zed or VS Code?",
    answer:
      "Not yet — and that's intentional honesty. The workspace layer is the point today. Editor and terminal keep improving in the open; you pick Silo so you never rebuild context, not for the best single-buffer editing.",
  },
];

export type FooterColumn = {
  title: string;
  links: HomeLink[];
};

/** Marketing footer columns (OpenAI-style: headers + stacked links). */
export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Silo",
    links: [
      { text: "Download", href: DOWNLOAD_HREF },
      { text: "Extensions", href: "https://extensions.getsilo.dev" },
      { text: "Roadmap", href: "/roadmap" },
      { text: "GitHub", href: "https://github.com/silo-code/silo" },
    ],
  },
  {
    title: "Docs",
    links: [
      { text: "Getting started", href: "/guide/" },
      { text: "API reference", href: "/api/" },
      { text: "Design system", href: "/design/" },
      { text: "Build with Claude", href: "/guide/claude-skill" },
    ],
  },
];

export type FooterSocial = {
  label: string;
  href: string;
  icon: "github" | "x";
};

export const FOOTER_SOCIAL: FooterSocial[] = [
  {
    label: "GitHub",
    href: "https://github.com/silo-code/silo",
    icon: "github",
  },
  { label: "X", href: "https://x.com/silo_code", icon: "x" },
];

export const FOOTER_COPYRIGHT = `Silo © ${new Date().getFullYear()}`;
export const FOOTER_LICENSE = {
  text: "MIT License",
  href: "https://github.com/silo-code/silo/blob/main/LICENSE",
};
