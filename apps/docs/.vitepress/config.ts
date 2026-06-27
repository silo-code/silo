import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import typedocSidebar from "../api/types/typedoc-sidebar.json";

// The generated type reference is the LEAF layer (drill-down from the
// member pages). Its sidebar lists symbols twice — by our @category and by
// kind (Interfaces / Type Aliases); keep only the category sections.
const KIND_GROUPS = ["Interfaces", "Type Aliases", "Functions", "Variables"];
const typeReference = (typedocSidebar as { text: string }[]).filter(
  (section) => !KIND_GROUPS.includes(section.text),
);

// Hand-authored, member-centric navigation over `ctx` (the progressive layer).
const registration = [
  ["registerEditor", "register-editor"],
  ["registerSidePanel", "register-side-panel"],
  ["registerStatusItem", "register-status-item"],
  ["registerCommand", "register-command"],
  ["registerKeybinding", "register-keybinding"],
  ["registerMenuItem", "register-menu-item"],
  ["registerFileType", "register-file-type"],
  ["registerDockPanelKind", "register-dock-panel-kind"],
  ["registerSettingsPage", "register-settings-page"],
  ["registerThemePreset", "register-theme-preset"],
].map(([name, slug]) => ({
  text: `ctx.${name}`,
  link: `/api/registration/${slug}`,
}));

const apiSidebar = [
  { text: "Using ctx", link: "/api/" },
  { text: "Registration", collapsed: false, items: registration },
  {
    text: "Services",
    collapsed: false,
    items: [
      { text: "ctx.editors", link: "/api/editors/" },
      { text: "ctx.terminals", link: "/api/state/terminals" },
      { text: "ctx.workspaces", link: "/api/state/workspaces" },
      { text: "ctx.layout", link: "/api/state/layout" },
      { text: "ctx.files", link: "/api/files/" },
      { text: "ctx.process", link: "/api/process/" },
      { text: "ctx.search", link: "/api/search/" },
      { text: "ctx.theme", link: "/api/theme/" },
      { text: "ctx.dnd", link: "/api/dnd/" },
      { text: "ctx.ui", link: "/api/ui/" },
      { text: "ctx.net", link: "/api/net/" },
    ],
  },
  {
    text: "Other",
    collapsed: false,
    items: [
      { text: "ctx.executeCommand", link: "/api/other/execute-command" },
      { text: "ctx.getExtension", link: "/api/other/get-extension" },
      { text: "useServiceState", link: "/api/other/use-service-state" },
      { text: "useFocusGroup", link: "/api/other/use-focus-group" },
      { text: "Tooltip", link: "/api/other/tooltip" },
      {
        text: "focusGroupNextIndex",
        link: "/api/other/focus-group-next-index",
      },
    ],
  },
  { text: "Design tokens", link: "/api/theming" },
  { text: "Stability & versioning", link: "/reference/stability" },
  { text: "Type reference", collapsed: true, items: typeReference },
];

// Silo documentation site. Combines hand-written guides with the API reference
// generated from the SDK's TSDoc by TypeDoc (see ../typedoc.json) into
// apps/docs/api. Regenerate the reference with `pnpm docs:api`.
//
// This is the `@silo-code/docs` workspace app.
//
// `withMermaid` injects Mermaid's transitive deps (dayjs, cytoscape,
// cytoscape-cose-bilkent, @braintree/sanitize-url, debug) into Vite's
// `optimizeDeps.include` for the dev server to pre-bundle. Under pnpm those live
// in Mermaid's nested node_modules, unresolvable from this package's root — so
// they're declared as direct devDependencies here to surface them for the dev
// pre-bundle (otherwise `pnpm docs:dev` fails on dayjs's missing default export).
export default withMermaid(
  defineConfig({
    title: "Silo",
    description:
      "Terminal-first workspace manager built for the multi-agent workflow. Switch between projects like browser tabs — each tab is a full workspace with live terminals and preserved state.",
    // Served from the custom domain https://getsilo.dev/ (root).
    base: "/",
    cleanUrls: true,
    lastUpdated: true,
    // api-intro.md is TypeDoc's readme source (merged into /api/index.md); it is
    // not a standalone page, so keep VitePress from rendering/link-checking it.
    srcExclude: ["api-intro.md"],

    themeConfig: {
      nav: [
        {
          text: "Download",
          link: "https://github.com/silo-code/silo/releases/latest",
        },
        { text: "Guides", link: "/guide/" },
        { text: "API Reference", link: "/api/" },
        { text: "Roadmap", link: "/roadmap" },
      ],

      sidebar: {
        "/guide/": [
          { text: "Getting Started", link: "/guide/" },
          {
            text: "Using Silo",
            items: [
              { text: "Workspaces", link: "/guide/workspaces" },
              { text: "Side panels", link: "/guide/panels" },
              { text: "Extensions", link: "/guide/extensions" },
              { text: "The `silo` command", link: "/guide/cli" },
            ],
          },
          {
            text: "Building Extensions",
            items: [
              {
                text: "Foundations",
                items: [
                  {
                    text: "What is an extension?",
                    link: "/guide/what-is-an-extension",
                  },
                  {
                    text: "Your first extension",
                    link: "/guide/getting-started",
                  },
                  {
                    text: "Build with Claude Code",
                    link: "/guide/claude-skill",
                  },
                ],
              },
              {
                text: "UI & theming",
                items: [
                  { text: "Styling your extension", link: "/guide/styling" },
                  {
                    text: "Workspace decorations & badges",
                    link: "/guide/workspace-decorations",
                  },
                  {
                    text: "Keyboard navigation",
                    link: "/guide/keyboard-navigation",
                  },
                  { text: "Building a theme", link: "/guide/theming" },
                ],
              },
              {
                text: "Packaging & publishing",
                items: [
                  {
                    text: "Permissions & access",
                    link: "/guide/permissions",
                  },
                  {
                    text: "Publishing an extension",
                    link: "/guide/publishing-an-extension",
                  },
                  {
                    text: "Sharing extensions",
                    link: "/guide/sharing-extensions",
                  },
                ],
              },
            ],
          },
        ],
        "/api/": apiSidebar,
        "/reference/": apiSidebar,
      },

      outline: { level: [2, 3] },

      socialLinks: [
        { icon: "github", link: "https://github.com/silo-code/silo" },
      ],

      search: { provider: "local" },
    },
  }),
);
