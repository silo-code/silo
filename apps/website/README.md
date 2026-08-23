# `@silo-code/website` — Silo marketing homepage

React homepage mounted by VitePress on `https://getsilo.dev/`. Copy, SEO helpers,
interactive demo engine, and feature vignette assets live here.

## Commands

```bash
# Standalone homepage preview
pnpm --filter @silo-code/website dev

# Unit tests
pnpm --filter @silo-code/website test
```

Docs consume this package:

- `@silo-code/website` — `mountHomepage` (theme `Layout.vue`)
- `@silo-code/website/seo` — Open Graph / JSON-LD (`transformHead`)
- `@silo-code/website/copy` — shared marketing strings
- `@silo-code/website/demo` — demo engine (used by `@silo-code/website-recorder`)

## Feature clips

Story-section WebM/PNG files live in `src/assets/` and are Vite-imported by
`App.tsx`. Re-capture with `@silo-code/website-recorder` (see that package’s
README). OG social image: `apps/docs/public/img/home/og-v2.png` — the filename
is versioned on purpose: X/Twitter caches social cards by URL for ~7 days and
no longer offers a manual refresh, so bump the suffix whenever the art
changes.
