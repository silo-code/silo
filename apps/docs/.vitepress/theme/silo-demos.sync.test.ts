import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * silo-demos.css hand-mirrors the `.silo-*` component rules from the host's
 * components.css so the docs' live `.silo-demo` previews render with the same
 * declarations the real app ships (e.g. the badges page at
 * /design/components/badges). There is no build-time link between the two
 * files, so a component-CSS change that isn't hand-copied here silently
 * drifts — see the badge contrast bug (silo-badge-neutral never got its
 * color-mix contrast fix, and silo-badge-sm was missing outright).
 *
 * This test parses both files and fails on two kinds of drift:
 *  - a selector present in both files whose declarations differ (unless
 *    listed in KNOWN_DIVERGENCES below, with a reason)
 *  - a MIRRORED_FAMILIES prefix (e.g. "silo-badge") where the host has a
 *    selector the docs file is missing entirely
 */

const HOST_CSS = fileURLToPath(
  new URL(
    "../../../../packages/extension-host/src/layout/components.css",
    import.meta.url,
  ),
);
const DOCS_CSS = fileURLToPath(new URL("./silo-demos.css", import.meta.url));
const DOCS_PREFIX = ".silo-demo ";

/**
 * Component-class families where the docs file intends to mirror *every*
 * variant, not just the ones already referenced by a demo — so an added
 * variant (like `.silo-badge-sm`) can't go unmirrored just because no demo
 * page happens to use it yet. Add a prefix here when a new component section
 * is mirrored into silo-demos.css.
 */
const MIRRORED_FAMILIES = [".silo-badge", ".silo-activity"];

/**
 * Selector -> properties allowed to differ between the two files, with why.
 * Only for real, intentional divergences (a runtime-only feature the static
 * demo can't reproduce, or docs-only layout). Never use this to silence a
 * value that should actually match — fix the CSS instead.
 */
const KNOWN_DIVERGENCES: Record<string, Record<string, string>> = {
  ".silo-activity-working": {
    animation:
      "docs renames the keyframes to silo-demo-* to avoid colliding with global page styles",
    "animation-delay":
      "host desyncs multiple dots via a per-instance --silo-activity-jitter set inline in JS; the static demo shows one canonical instance",
  },
  ".silo-activity-ready": {
    animation:
      "docs renames the keyframes to silo-demo-* to avoid colliding with global page styles",
    "animation-delay":
      "host desyncs multiple dots via a per-instance --silo-activity-jitter set inline in JS; the static demo shows one canonical instance",
  },
  ".silo-activity-working::before": {
    animation:
      "docs renames the keyframes to silo-demo-* to avoid colliding with global page styles",
    "animation-delay":
      "host desyncs multiple dots via a per-instance --silo-activity-jitter set inline in JS; the static demo shows one canonical instance",
  },
  ".silo-activity-working::after": {
    animation:
      "docs renames the keyframes to silo-demo-* to avoid colliding with global page styles",
    "animation-delay":
      "host desyncs multiple dots via a per-instance --silo-activity-jitter set inline in JS; the static demo shows one canonical instance",
  },
  ".silo-search-input": {
    width:
      "docs bounds the demo's width since it isn't inside the app's real flex-constrained toolbar",
    "max-width":
      "docs bounds the demo's width since it isn't inside the app's real flex-constrained toolbar",
  },
};

type Rules = Map<string, Map<string, string>>;

function parseCss(text: string, stripPrefix?: string): Rules {
  const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rules = new Map();
  let i = 0;
  const n = withoutComments.length;

  while (i < n) {
    const brace = withoutComments.indexOf("{", i);
    if (brace === -1) break;
    const selectorText = withoutComments.slice(i, brace).trim();

    let depth = 1;
    let j = brace + 1;
    while (j < n && depth > 0) {
      if (withoutComments[j] === "{") depth++;
      else if (withoutComments[j] === "}") depth--;
      j++;
    }
    const body = withoutComments.slice(brace + 1, j - 1);
    i = j;

    // Skip at-rules (@keyframes, @media, ...) — nested rules, not flat
    // declarations, and out of scope for this declaration-level check.
    if (selectorText.startsWith("@")) continue;

    for (const rawSelector of selectorText.split(",")) {
      let selector = rawSelector.trim();
      if (!selector) continue;
      if (stripPrefix) {
        if (!selector.startsWith(stripPrefix)) continue;
        selector = selector.slice(stripPrefix.length).trim();
      }
      const declarations = parseDeclarations(body);
      // The same selector can recur (e.g. silo-demos.css reopens `.silo-demo`
      // for the Activity token block) — merge like the real cascade would,
      // don't let a later reopen silently wipe an earlier rule's properties.
      const existing = rules.get(selector);
      if (existing) {
        for (const [prop, value] of declarations) existing.set(prop, value);
      } else {
        rules.set(selector, declarations);
      }
    }
  }
  return rules;
}

function parseDeclarations(body: string): Map<string, string> {
  const declarations = new Map<string, string>();
  let depth = 0;
  let start = 0;
  for (let k = 0; k <= body.length; k++) {
    const ch = body[k];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if ((ch === ";" && depth === 0) || k === body.length) {
      const decl = body.slice(start, k).trim();
      start = k + 1;
      if (!decl) continue;
      const colon = decl.indexOf(":");
      if (colon === -1) continue;
      const prop = decl.slice(0, colon).trim();
      const value = decl
        .slice(colon + 1)
        .trim()
        .replace(/\s+/g, " ");
      declarations.set(prop, value);
    }
  }
  return declarations;
}

/**
 * Second surface: the docs' per-preset token *values* (the hex literals in
 * each `html[data-silo-demo-theme="…"] .silo-demo` block) hand-mirror the
 * real theme resolution — theme.css's `:root`/`[data-theme="light"]` base,
 * overridden by each preset's own `vars` from presets.ts (Dark/Light) or
 * extensions-silo/theme-presets/index.ts (everything else). Confirmed against
 * ThemeInjector.tsx: at runtime a preset's `vars` land in a `:root{}` style
 * tag appended after theme.css, so — same specificity, later in the cascade —
 * they win only for the keys they set and fall through to theme.css's
 * `[data-theme]` block for everything else. A preset's own `vars` table is
 * NOT layered on top of another preset's overrides (e.g. Gruvbox Dark does
 * not inherit core Dark's extra overrides), only on the raw theme.css base.
 */

const THEME_CSS = fileURLToPath(
  new URL(
    "../../../../packages/extension-host/src/layout/theme.css",
    import.meta.url,
  ),
);
const CORE_PRESETS_TS = fileURLToPath(
  new URL(
    "../../../../packages/extension-host/src/layout/presets.ts",
    import.meta.url,
  ),
);
const SILO_PRESETS_TS = fileURLToPath(
  new URL(
    "../../../../packages/extensions-silo/src/theme-presets/index.ts",
    import.meta.url,
  ),
);

/** Tokens the docs demo intentionally computes on its own modal-content
 * scale rather than mirroring — documented in the file header comment. */
const PRESET_IGNORE = new Set([
  "--silo-font-size-base",
  "--silo-font-size-sm",
  "--silo-font-size-chrome",
]);

interface PresetSource {
  id: string;
  base: "dark" | "light";
  vars: Map<string, string>;
}

function sliceBalanced(text: string, openIndex: number): string {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }
  throw new Error(`unbalanced braces from index ${openIndex}`);
}

function parsePresetVars(body: string): Map<string, string> {
  const vars = new Map<string, string>();
  const re = /"(--[\w-]+)":\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) vars.set(m[1], m[2].trim());
  return vars;
}

/** Parses `{ id: "…", base: "dark" | "light", ..., vars: { … } }` preset
 * object literals out of presets.ts / theme-presets/index.ts. Locates each
 * object's own brace-balanced span rather than assuming field order, so it's
 * unbothered by the doc comments some preset objects carry. */
function extractPresets(source: string): PresetSource[] {
  const presets: PresetSource[] = [];
  const idRe = /\{\s*id:\s*"([\w-]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = idRe.exec(source))) {
    const objText = sliceBalanced(source, m.index);
    const baseMatch = /base:\s*"(dark|light)"/.exec(objText);
    const varsIdx = objText.indexOf("vars:");
    if (!baseMatch || varsIdx === -1) continue;
    const varsBraceStart = objText.indexOf("{", varsIdx);
    const varsBody = sliceBalanced(objText, varsBraceStart).slice(1, -1);
    presets.push({
      id: m[1],
      base: baseMatch[1] as "dark" | "light",
      vars: parsePresetVars(varsBody),
    });
  }
  return presets;
}

function resolvePreset(
  base: "dark" | "light",
  presetVars: Map<string, string>,
  rootVars: Map<string, string>,
  lightVars: Map<string, string>,
): Map<string, string> {
  const resolved = new Map(rootVars);
  if (base === "light") for (const [k, v] of lightVars) resolved.set(k, v);
  for (const [k, v] of presetVars) resolved.set(k, v);
  return resolved;
}

describe("silo-demos.css theme-preset tokens mirror theme.css + preset tables", () => {
  const themeRules = parseCss(readFileSync(THEME_CSS, "utf8"));
  const rootVars = themeRules.get(":root") ?? new Map();
  const lightVars = themeRules.get('[data-theme="light"]') ?? new Map();

  const presets = [
    ...extractPresets(readFileSync(CORE_PRESETS_TS, "utf8")),
    ...extractPresets(readFileSync(SILO_PRESETS_TS, "utf8")),
  ];

  const docsAllRules = parseCss(readFileSync(DOCS_CSS, "utf8"));
  const docsLightVars = docsAllRules.get(".silo-demo") ?? new Map();

  it("finds theme.css base tokens, docs base tokens, and every preset", () => {
    expect(rootVars.size).toBeGreaterThan(0);
    expect(lightVars.size).toBeGreaterThan(0);
    expect(docsLightVars.size).toBeGreaterThan(0);
    expect(presets.length).toBeGreaterThanOrEqual(8);
  });

  it.each(presets.map((p) => p.id))(
    "resolves %s the same way the app does",
    (id) => {
      const preset = presets.find((p) => p.id === id)!;
      const sourceResolved = resolvePreset(
        preset.base,
        preset.vars,
        rootVars,
        lightVars,
      );

      const docsOverrides =
        id === "light"
          ? new Map<string, string>()
          : (docsAllRules.get(
              `html[data-silo-demo-theme="${id}"] .silo-demo`,
            ) ?? new Map());
      const docsResolved = new Map(docsLightVars);
      for (const [k, v] of docsOverrides) docsResolved.set(k, v);

      const failures: string[] = [];
      for (const [prop, docsValue] of docsResolved) {
        if (PRESET_IGNORE.has(prop)) continue;
        const sourceValue = sourceResolved.get(prop);
        if (sourceValue === undefined) continue; // docs-only derived token (e.g. --silo-button-hover-bg formula)
        if (sourceValue.replace(/\s+/g, "") !== docsValue.replace(/\s+/g, "")) {
          failures.push(`${prop}: source="${sourceValue}" docs="${docsValue}"`);
        }
      }

      expect(
        failures,
        `silo-demos.css's "${id}" preset block has drifted from the resolved theme.css + preset vars:\n` +
          failures.join("\n"),
      ).toEqual([]);
    },
  );
});

describe("silo-demos.css mirrors components.css", () => {
  const hostRules = parseCss(readFileSync(HOST_CSS, "utf8"));
  const docsRules = parseCss(readFileSync(DOCS_CSS, "utf8"), DOCS_PREFIX);

  it("has host and docs CSS files to compare", () => {
    expect(hostRules.size).toBeGreaterThan(0);
    expect(docsRules.size).toBeGreaterThan(0);
  });

  it("agrees on declarations for every selector shared with the host", () => {
    const failures: string[] = [];

    for (const [selector, hostDecls] of hostRules) {
      const docsDecls = docsRules.get(selector);
      if (!docsDecls) continue; // not mirrored — fine, docs has plenty of host-only chrome it never demos

      const allowed = KNOWN_DIVERGENCES[selector] ?? {};
      const props = new Set([...hostDecls.keys(), ...docsDecls.keys()]);
      for (const prop of props) {
        if (prop in allowed) continue;
        const hostValue = hostDecls.get(prop);
        const docsValue = docsDecls.get(prop);
        if (hostValue !== docsValue) {
          failures.push(
            `${selector} { ${prop} }: host="${hostValue ?? "(absent)"}" docs="${docsValue ?? "(absent)"}"`,
          );
        }
      }
    }

    expect(
      failures,
      `silo-demos.css has drifted from components.css. Either update the docs rule to match, ` +
        `or if the difference is intentional add it to KNOWN_DIVERGENCES with a reason:\n` +
        failures.join("\n"),
    ).toEqual([]);
  });

  it.each(MIRRORED_FAMILIES)(
    "mirrors every host selector in the %s family",
    (prefix) => {
      const familyPattern = new RegExp(
        `^${prefix.replace(".", "\\.")}(-[a-z0-9-]+)?(::?[a-z-]+)?(\\[[^\\]]+\\])?$`,
      );
      const missing: string[] = [];
      for (const selector of hostRules.keys()) {
        if (!familyPattern.test(selector)) continue;
        if (!docsRules.has(selector)) missing.push(selector);
      }
      expect(
        missing,
        `silo-demos.css is missing selectors from the ${prefix} family that exist in components.css:\n` +
          missing.join("\n"),
      ).toEqual([]);
    },
  );
});
