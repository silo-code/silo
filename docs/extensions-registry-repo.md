# The external `extensions-registry` repo

The git-backed extension catalog lives in
[`silo-code/extensions-registry`](https://github.com/silo-code/extensions-registry)
— **not** in this monorepo. Locally it's a sibling clone:
`../extensions-registry` (i.e. `projects/extensions-registry`). Design:
[RFC 0014](./proposals/0014-extension-registry.md).

## Two URLs, one repo

| URL                                                      | Audience           | What                                                                                                                      |
| -------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| [extensions.getsilo.dev](https://extensions.getsilo.dev) | Humans             | Catalog website (Astro site under `site/`) — browse, detail pages, [publish form](https://extensions.getsilo.dev/publish) |
| [registry.getsilo.dev](https://registry.getsilo.dev)     | App / CLI / agents | Static JSON index (GitHub Pages from `dist/`) — `index.json`, `/ext/<id>.json`, readmes, advisories, `llms.txt`           |

**The registry is data, not a service.** CI is the only writer; every write is a
commit (`git log` = audit log). The Silo app reads the data URL via
`DEFAULT_REGISTRY_URL` in
`packages/extension-host/src/extension-host/registry-client.ts`. Point humans at
the website; don't treat `registry.getsilo.dev` as a product landing page.

## How it relates to this monorepo

| Piece                        | Where                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Browse / install / update UI | This repo — Settings → Extensions (`ExtensionsPage`, `ExtensionManager.installFromRegistry` / `checkUpdates`) |
| Index schema + ingest + site | `extensions-registry`                                                                                         |
| Official community packages  | [`silo-extensions`](./silo-extensions-repo.md) — a **publisher**, not the catalog                             |
| Release packing action       | [`silo-code/publish-extension-action`](https://github.com/silo-code/publish-extension-action)                 |

Discovery for users and docs: **Browse in-app** or
[extensions.getsilo.dev](https://extensions.getsilo.dev). Do not send people to
clone `silo-extensions` just to install something that's already published.

## Publishing (steady state)

1. Register once — `extensions/<id>.json` via PR (website form pre-fills it). Id
   must be `<github-owner>.<name>`.
2. Cut a GitHub Release on the publisher repo with the `npm pack` `.tgz`
   (tags `vX.Y.Z` or `<name>@vX.Y.Z` for multi-extension repos). Ingest pins
   sha256 and rebuilds the index.

User-facing walkthrough:
[Sharing extensions](../apps/docs/guide/sharing-extensions.md#publish-to-the-silo-registry).

## Local work in that repo

Not part of this pnpm workspace. From `../extensions-registry`:

```sh
npm test
GITHUB_TOKEN=$(gh auth token) npm run ingest
npm run build          # → dist/ (what GitHub Pages serves)
cd site && npm run dev # Astro catalog against a freshly built index
```

## Still planned (don't document as shipped)

Private / team (federated) registries are RFC 0014 P3 — still `planned` on the
[roadmap](../apps/docs/roadmap.md#extension-distribution). P1 (public index +
site + in-app Browse / install / update) is stable.
