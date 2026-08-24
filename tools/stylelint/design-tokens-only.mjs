import stylelint from "stylelint";

const {
  createPlugin,
  utils: { report, ruleMessages },
} = stylelint;

// CSS analog of the ESLint boundary ratchet (eslint.config.js). Mechanizes the
// theming contract's stylelint rule: an extension's CSS may consume only the
// **design tokens** — never a component token (`--silo-content-*`,
// `--silo-statusbar-*`, …), an internal token (`--silo-internal-*`), or an
// undeclared/typo'd `--silo-*` name.
// See docs/architecture-audit/theming-contract.md › Enforcement.
//
// Scope: only `--silo-*` references are host tokens and thus in scope. A non-
// silo custom property (an extension's own `--foo`, dockview's `--dv-*`, …) is
// not a host token and is ignored — Decision 1's prefix is exactly what lets us
// tell them apart.
//
// RATCHET: existing violations are baselined in stylelint-suppressions.json via
// stylelint's native suppressions feature (the CSS twin of eslint
// --suppress-all; same JSON shape as eslint-suppressions.json). Plain
// `stylelint` reads it and fails only on NEW violations. Regenerate after
// burning some down with `npm run lint:css:baseline`. The baseline total is the
// burn-down metric, target 0.

export const ruleName = "silo/extension-design-tokens-only";

const messages = ruleMessages(ruleName, {
  rejected: (prop) =>
    `"${prop}" is not a design token — extensions must not consume it ` +
    `(theming-contract.md). Style against a design token (--silo-color-*, ` +
    `--silo-font*, --silo-radius-*, --silo-button-*) instead.`,
});

// The public, extension-consumable token set (theming-contract.md › design tokens).
export const DESIGN_TOKENS = new Set([
  // generic colors
  "--silo-color-bg",
  "--silo-color-bg-hover",
  "--silo-color-bg-active",
  "--silo-color-text",
  "--silo-color-text-hi",
  "--silo-color-text-lo",
  "--silo-color-accent",
  "--silo-color-accent-2",
  "--silo-color-border",
  "--silo-color-border-strong",
  "--silo-color-ok",
  "--silo-color-warn",
  "--silo-color-err",
  "--silo-color-input-bg",
  "--silo-color-input-text",
  "--silo-color-input-border",
  "--silo-color-button-bg",
  "--silo-color-button-text",
  // toolbar surface — panel header bars (breadcrumb, view-switcher, web viewer, etc.)
  "--silo-color-toolbar-bg",
  "--silo-color-toolbar-text",
  "--silo-color-toolbar-text-disabled",
  "--silo-color-toolbar-input-bg",
  // content surface — shared viewport background/foreground for viewer extensions
  "--silo-color-content-bg",
  "--silo-color-content-text",
  // font families + size scale + radius scale
  "--silo-font-ui",
  "--silo-font-mono",
  "--silo-font-size-base",
  "--silo-font-size-sm",
  "--silo-font-size-chrome",
  "--silo-radius-sm",
  "--silo-radius-md",
  // button treatment (design token — consumable + overridable)
  "--silo-button-bg",
  "--silo-button-text",
  "--silo-button-border",
  "--silo-button-primary-bg",
  "--silo-button-primary-text",
  "--silo-button-danger-bg",
  "--silo-button-danger-text",
  // list-surface treatment (candidate; legal ahead of adoption)
  "--silo-list-radius",
  "--silo-list-inset",
  "--silo-list-hover-bg",
  "--silo-list-active-bg",
  "--silo-list-active-outline",
]);

// Owner-consumption allowance: a chrome component may consume the component-token
// family it itself renders — that's not reaching into someone else's chrome, it
// IS the owner styling its own. Keyed by source path → allowed token prefixes.
// This mirrors the ESLint trust tiers (core.* may reach `@silo-code/sdk/internal`):
// here the owning component may reach its own component-token family, while a
// non-owner consuming it (e.g. image-viewer wanting the editor bg) still fails.
// Keep this table tight — only genuine ownership, never a convenience grant.
const OWNERSHIP = [
  {
    // `--silo-content-text` is the shared content-body text (the editor's and
    // the terminal's foreground — read by monaco-setup / xterm-theme), distinct
    // from the chrome's `--silo-color-text`; both content components own it.
    dir: "/extensions-core/src/editor/",
    families: ["--silo-content-editor-", "--silo-content-text"],
  },
  {
    dir: "/extensions-core/src/terminal/",
    families: ["--silo-content-terminal-", "--silo-content-text"],
  },
];

const VAR_REF = /var\(\s*(--silo-[\w-]+)/g;

const rule = (primary) => (root, result) => {
  if (!primary) return;
  const file = root.source?.input?.file ?? "";
  const owner = OWNERSHIP.find((o) => file.includes(o.dir));
  root.walkDecls((decl) => {
    // A `--silo-*: …` definition is not a consumption; the property name is
    // decl.prop, so scanning only decl.value never flags a token's own def.
    let m;
    VAR_REF.lastIndex = 0;
    while ((m = VAR_REF.exec(decl.value)) !== null) {
      const prop = m[1];
      if (DESIGN_TOKENS.has(prop)) continue;
      // The owning component may consume its own component-token family.
      if (owner && owner.families.some((fam) => prop.startsWith(fam))) continue;
      report({
        message: messages.rejected(prop),
        node: decl,
        result,
        ruleName,
        word: prop,
      });
    }
  });
};

rule.ruleName = ruleName;
rule.messages = messages;

export default createPlugin(ruleName, rule);
