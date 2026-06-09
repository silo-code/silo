// Stylelint config — the CSS half of the architecture boundary. The single
// rule mechanizes the theming contract: an extension's CSS may consume only the
// public design tokens (see tools/stylelint/design-tokens-only.mjs and
// apps/docs/api/theming.md). Host chrome is exempt — it owns the tokens.
//
// Shared from the repo root so every package that ships extension CSS
// (@silo-code/extensions-core, @silo-code/extensions-silo) lints against the same
// rule via its own `lint` script (`stylelint "src/**/*.css"`). The extension
// import boundary itself is now enforced by package visibility (each package's
// dependencies); this design-token rule is the one boundary the package
// structure can't express.
export default {
  plugins: ["./tools/stylelint/design-tokens-only.mjs"],
  rules: {
    "silo/extension-design-tokens-only": true,
  },
};
