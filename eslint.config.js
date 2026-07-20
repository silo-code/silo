import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

// Architectural boundary enforcement — NOT style linting. Repo-root flat config
// for the whole workspace (apps/** + packages/**).
//
// THE MODEL CHANGED WITH THE MONOREPO:
// the import boundary is now enforced FIRST by package visibility — each
// package's `dependencies` decide what it can resolve. @silo-code/extensions-silo
// depends only on @silo-code/sdk, so a silo.* extension physically cannot import
// the privileged @silo-code/extension-host/internal surface (or any other
// extension package); @silo-code/extensions-core depends on @silo-code/extension-host,
// so it can. The old cross-tier path-glob rules (NO_REACH_INTO_BUILTINS,
// folder-escape) and the eslint-suppressions.json ratchet retired with the move
// — the git-explorer↔git type seam they baselined is now a legitimate
// intra-package import inside @silo-code/extensions-silo.
//
// What package structure CAN'T express, and so stays here:
//   1. Platform ban — extensions get filesystem/process/etc. through ctx, never
//      raw @tauri-apps/* or node:* (node: is always resolvable, so deps can't
//      gate it). Excludes test files.
//   2. silo.* may not import the host package at all (belt-and-suspenders over
//      the dependency graph; makes intent explicit at the import site).
//   3. Host-internal leaf layering — state/ and services/ are the bottom of the
//      host's dependency graph and must not import "up" or sideways.
// (The CSS half — design-token-only extension CSS — is the stylelint rule in
// stylelint.config.js, run per extension package.)
//
// NOT restricted, on purpose: the host importing the public SDK component kit
// (RFC 0016 / ADR 0026 — Button, List, ModalActions, …) from @silo-code/sdk.
// The SDK is a leaf and host → SDK is the normal acyclic direction, same as the
// host's existing SDK *type* imports. There is no internal fork of the kit; the
// host and bundled extensions consume the one public source directly. Host
// chrome (the <Modal> shell, settings rail, status-bar container) stays bespoke
// and component-token-styled — that's an architecture convention (ADR 0026's
// chrome line), not an import rule.

// Raw platform access is host-only.
const EXTENSION_NO_PLATFORM = {
  group: ["@tauri-apps/*", "@tauri-apps/**", "node:*", "node:**"],
  message:
    "Extensions must not import raw platform APIs (@tauri-apps/*, node:*). " +
    "These are privileged host access — route through the ctx primitives " +
    "(files/process/…) on @silo-code/sdk, or @silo-code/extension-host/internal " +
    "for core.*.",
};

// silo.* ships independently: public @silo-code/sdk only, never the host package.
const SILO_NO_HOST = {
  group: ["@silo-code/extension-host", "@silo-code/extension-host/**"],
  message:
    "silo.* extensions ship independently and may import only the public " +
    "@silo-code/sdk — never the host package or its privileged " +
    "@silo-code/extension-host/internal surface. (Enforced first by the package " +
    "dependency graph: @silo-code/extensions-silo does not depend on the host.)",
};

// Host-internal leaf layering: state/ and services/ are the bottom leaves of the
// host's dependency graph. They must not import out (no relative escape).
const LEAF_NO_IMPORTS_OUT = {
  group: ["../*", "../**"],
  message:
    "state/ and services/ are leaf layers of the host — they must not import " +
    "from other layers. Keep the host's dependency graph one-way and acyclic.",
};

export default [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "apps/desktop/src-tauri/**",
      // The docs site has its own toolchain (VitePress + generated TypeDoc).
      "apps/docs/**",
      // Example extensions are self-contained mini-projects with their own
      // toolchain (own tsconfig/build, @silo-code/sdk as an external).
      "examples/**",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    // Don't flag the codebase's existing disable directives (react-hooks,
    // no-console, no-eval in the automation bridge/tests) as "unused" — those
    // rules are intentionally off here (this config enforces boundaries only).
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module",
      },
    },
    // react-hooks is registered only so the codebase's pre-existing
    // `eslint-disable react-hooks/*` comments resolve to a known rule. Its
    // rules stay OFF — this config enforces boundaries and nothing else.
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  // Both extension tiers: the platform ban. Test files are exempt — they
  // legitimately use node: for setup and aren't shipped extension code.
  {
    files: ["packages/extensions-core/src/**/*.{ts,tsx}"],
    ignores: ["packages/extensions-core/src/**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [EXTENSION_NO_PLATFORM] }],
    },
  },
  {
    files: ["packages/extensions-silo/src/**/*.{ts,tsx}"],
    ignores: ["packages/extensions-silo/src/**/*.{test,spec}.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [EXTENSION_NO_PLATFORM, SILO_NO_HOST] },
      ],
    },
  },
  // Host leaves: lock them as the bottom of the host's dependency graph.
  {
    files: [
      "packages/extension-host/src/state/**/*.{ts,tsx}",
      "packages/extension-host/src/services/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": ["error", { patterns: [LEAF_NO_IMPORTS_OUT] }],
    },
  },
];
