import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import react from "@vitejs/plugin-react";
import {
  SITE_DESCRIPTION as HOME_DESCRIPTION,
  buildHomepageSeoHead,
} from "@silo-code/website/seo";
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
  ["registerNavigatorView", "register-navigator-view"],
  ["registerStatusItem", "register-status-item"],
  ["registerCommand", "register-command"],
  ["registerKeybinding", "register-keybinding"],
  ["registerMenuItem", "register-menu-item"],
  ["registerContextMenuItem", "register-context-menu-item"],
  ["registerToolbarItem", "register-toolbar-item"],
  ["registerFileType", "register-file-type"],
  ["registerDockPanelKind", "register-dock-panel-kind"],
  ["registerSettingsPage", "register-settings-page"],
  ["registerThemePreset", "register-theme-preset"],
].map(([name, slug]) => ({
  text: `ctx.${name}`,
  link: `/api/registration/${slug}`,
}));

// The Design System section — the extension-builder-facing reference for the
// shared component kit (RFC 0016). Modal-scoped today; panels/status bar later.
const designSidebar = [
  { text: "Overview", link: "/design/" },
  { text: "Surfaces", link: "/design/surfaces" },
  { text: "Principles & best practices", link: "/design/principles" },
  { text: "Typography", link: "/design/typography" },
  {
    text: "Components",
    collapsed: false,
    items: [
      { text: "Buttons", link: "/design/components/buttons" },
      { text: "Text inputs", link: "/design/components/text-inputs" },
      {
        text: "Selection controls",
        link: "/design/components/selection-controls",
      },
      { text: "Tabs", link: "/design/components/tabs" },
      { text: "Lists", link: "/design/components/lists" },
      { text: "Badges", link: "/design/components/badges" },
      { text: "Activity", link: "/design/components/activity" },
      { text: "Feedback", link: "/design/components/feedback" },
      { text: "Structure", link: "/design/components/structure" },
    ],
  },
  { text: "Building modals (guide)", link: "/guide/building-modals" },
  { text: "Design tokens", link: "/api/theming" },
];

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
      { text: "ctx.storage", link: "/api/storage/" },
      { text: "ctx.files", link: "/api/files/" },
      { text: "ctx.process", link: "/api/process/" },
      { text: "ctx.processes", link: "/api/processes/" },
      { text: "ctx.agents", link: "/api/agents/" },
      { text: "ctx.search", link: "/api/search/" },
      { text: "ctx.theme", link: "/api/theme/" },
      { text: "ctx.dnd", link: "/api/dnd/" },
      { text: "ctx.ui", link: "/api/ui/" },
      { text: "ctx.net", link: "/api/net/" },
      { text: "ctx.system", link: "/api/system/" },
      { text: "ctx.webview", link: "/api/webview/" },
    ],
  },
  {
    text: "Chrome",
    collapsed: false,
    items: [{ text: "Tab adornments", link: "/api/state/tab-adornments" }],
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
      { text: "path (path utilities)", link: "/api/other/path" },
      { text: "Event<T>", link: "/api/other/event" },
    ],
  },
  { text: "Design tokens", link: "/api/theming" },
  { text: "Stability & versioning", link: "/reference/stability" },
  { text: "SDK changelog", link: "/api/sdk-changelog" },
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
    // Align site-wide default description with the marketing homepage.
    description: HOME_DESCRIPTION,
    // Served from the custom domain https://getsilo.dev/ (root).
    base: "/",
    // Dark-only, site-wide — no toggle. (Independent of the Design System
    // pages' own .silo-demo theme picker, which keeps working regardless —
    // see theme/Layout.vue.)
    appearance: "force-dark",
    cleanUrls: true,
    lastUpdated: true,
    sitemap: {
      hostname: "https://getsilo.dev",
    },
    // Homepage Open Graph / Twitter / canonical / JSON-LD — kept out of
    // index.md frontmatter so one shared module owns the social + schema tags.
    transformHead({ pageData }) {
      if (pageData.relativePath !== "index.md") return [];
      return buildHomepageSeoHead();
    },
    head: [
      // Favicon set, generated from the shipping app-icon art
      // (apps/desktop/src-tauri/icon-source-square.png).
      ["link", { rel: "icon", href: "/favicon.ico", sizes: "any" }],
      [
        "link",
        {
          rel: "icon",
          type: "image/png",
          sizes: "32x32",
          href: "/favicon-32x32.png",
        },
      ],
      [
        "link",
        {
          rel: "icon",
          type: "image/png",
          sizes: "16x16",
          href: "/favicon-16x16.png",
        },
      ],
      [
        "link",
        {
          rel: "apple-touch-icon",
          sizes: "180x180",
          href: "/apple-touch-icon.png",
        },
      ],
      // GoatCounter analytics (privacy-friendly, no cookies) —
      // dashboard at https://silo.goatcounter.com/
      [
        "script",
        {
          "data-goatcounter": "https://silo.goatcounter.com/count",
          async: "",
          src: "//gc.zgo.at/count.js",
        },
      ],
      // Applies a stored Design System demo theme (see
      // theme/silo-demos.css + theme/Layout.vue's THEMES list) before first
      // paint, so returning visitors don't see a flash of Light. An unknown
      // or missing value is a no-op — silo-demos.css's unprefixed rules are
      // already Light.
      [
        "script",
        {},
        `(function(){try{var t=localStorage.getItem("silo-demo-theme");if(t)document.documentElement.setAttribute("data-silo-demo-theme",t);}catch(e){}})();`,
      ],
    ],
    // api-intro.md is TypeDoc's readme source (merged into /api/index.md); it is
    // not a standalone page, so keep VitePress from rendering/link-checking it.
    srcExclude: ["api-intro.md"],

    themeConfig: {
      nav: [
        {
          text: "Download",
          link: "https://github.com/silo-code/silo/releases/latest",
        },
        { text: "Changelog", link: "/changelog" },
        { text: "Guides", link: "/guide/" },
        { text: "Design", link: "/design/" },
        { text: "API Reference", link: "/api/" },
        {
          text: "Extensions",
          link: "https://extensions.getsilo.dev",
        },
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
              { text: "Using agents", link: "/guide/agent-sessions" },
              { text: "The `silo` command", link: "/guide/cli" },
              { text: "Release channels", link: "/guide/release-channels" },
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
                  { text: "Building modals", link: "/guide/building-modals" },
                  { text: "Styling your extension", link: "/guide/styling" },
                  {
                    text: "Workspace status & badges",
                    link: "/guide/workspace-status",
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
                  {
                    text: "Extension checklist",
                    link: "/guide/extension-checklist",
                  },
                ],
              },
            ],
          },
        ],
        "/design/": designSidebar,
        "/api/": apiSidebar,
        "/reference/": apiSidebar,
        "/roadmap": [
          { text: "Roadmap & API status", link: "/roadmap" },
          {
            text: "Architecture deep dives",
            items: [
              {
                text: "Agent system (RFCs 18–20)",
                link: "/roadmap/agent-system",
              },
            ],
          },
        ],
      },

      outline: { level: [2, 3] },

      // The GitHub icon lives in the nav bar as a live star-count badge
      // (theme/GitHubStars.vue, wired in via Layout.vue's nav-bar-content-after
      // slot) instead of a plain socialLinks icon.

      search: { provider: "local" },
    },

    // React marketing homepage (@silo-code/website) mounts on `/`
    // via theme/Layout.vue. Keep React off the VitePress SSR graph.
    vite: {
      plugins: [react()],
      optimizeDeps: {
        include: [
          "react",
          "react-dom",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
          "react-dom/client",
        ],
      },
      ssr: {
        noExternal: ["@silo-code/website"],
      },
    },
  }),
);
