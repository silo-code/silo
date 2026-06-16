# Changelog

## [0.4.0](https://github.com/silo-code/silo/compare/silo-v0.3.0...silo-v0.4.0) (2026-06-16)


### Features

* **cli:** `silo <path>` opens/activates a workspace or file from the terminal ([#32](https://github.com/silo-code/silo/issues/32)) ([171a879](https://github.com/silo-code/silo/commit/171a879d583bbc70122c5298161f85acf7675454))
* **focus:** app-wide keyboard focus ring for standalone controls ([#25](https://github.com/silo-code/silo/issues/25)) ([edd58a1](https://github.com/silo-code/silo/commit/edd58a1454128f72ba42280c32139f8c7fa16986))
* **git:** Git panel branch management + keyboard tab navigation ([#23](https://github.com/silo-code/silo/issues/23)) ([8087570](https://github.com/silo-code/silo/commit/8087570b0ae199909663f9b490645c49a59c9267))
* **git:** pull button + background autofetch in the Git panel ([#24](https://github.com/silo-code/silo/issues/24)) ([4e89b74](https://github.com/silo-code/silo/commit/4e89b7497c09330049f181328d32e5a580ef5ccb))
* **git:** rework the panel header — publish button, click-to-sync, ⋯ menu ([#26](https://github.com/silo-code/silo/issues/26)) ([f2da2e1](https://github.com/silo-code/silo/commit/f2da2e13831aa0eefebad2cefe5177e49817e78b))
* **search:** file-search side panel + ctx.search ([#29](https://github.com/silo-code/silo/issues/29)) ([184ae98](https://github.com/silo-code/silo/commit/184ae986cb5ae42c65f196bc76c77bebeb4d9ad4))
* Switch-branches modal — close button + keyboard list navigation ([#27](https://github.com/silo-code/silo/issues/27)) ([5d968d1](https://github.com/silo-code/silo/commit/5d968d155bba11f9b42261c32f259f0588c0ee6d))
* **updates:** add core.updates status-bar update indicator ([#20](https://github.com/silo-code/silo/issues/20)) ([b7e97c8](https://github.com/silo-code/silo/commit/b7e97c8f72c923f89fc483c1ed9da2a0e0cbcd78))


### Bug Fixes

* **focus:** round the keyboard focus ring + stop edge clipping ([#28](https://github.com/silo-code/silo/issues/28)) ([28899b4](https://github.com/silo-code/silo/commit/28899b4f5d4656d1b036efb8b70d8b5102985456))

## [0.3.0](https://github.com/silo-code/silo/compare/silo-v0.2.0...silo-v0.3.0) (2026-06-12)


### Features

* **side-dock:** toggle side-panel visibility from the tab context menu ([#19](https://github.com/silo-code/silo/issues/19)) ([db56c70](https://github.com/silo-code/silo/commit/db56c706a470dade7346897dd3ee9bf5bbd8cb75))
* **terminal:** find/search overlay (Cmd+F) ([#15](https://github.com/silo-code/silo/issues/15)) ([900a678](https://github.com/silo-code/silo/commit/900a6784d24782e5a2c9799867dc2038e55c6d5c))


### Bug Fixes

* **release:** sync Cargo.lock to released version + stop it drifting each release ([#18](https://github.com/silo-code/silo/issues/18)) ([0173abf](https://github.com/silo-code/silo/commit/0173abfaf2b53a810b217edb1e31d6852987e809))
* **ui:** tighten terminal breadcrumb gap and fix tab + menu alignment ([#17](https://github.com/silo-code/silo/issues/17)) ([0f5a135](https://github.com/silo-code/silo/commit/0f5a135b52fdfb1fab94e8beaec189775cf35f3c))

## [0.2.0](https://github.com/silo-code/silo/compare/silo-v0.1.0...silo-v0.2.0) (2026-06-11)


### Features

* **editor:** persist unsaved edits across restart (hot exit) ([#10](https://github.com/silo-code/silo/issues/10)) ([fd00c2b](https://github.com/silo-code/silo/commit/fd00c2b403fce0720a48af2d3332da6125a168d7))
* **extensions:** list first-party built-ins (branded, disable-only) ([13f5ee7](https://github.com/silo-code/silo/commit/13f5ee742e7a79f37c6f5795109e57bdfa65ef64))
* **layout:** make side-dock visibility and widths global, not per-workspace ([#7](https://github.com/silo-code/silo/issues/7)) ([6daa05f](https://github.com/silo-code/silo/commit/6daa05fe66c0b8904e45ea18832cab2c9cfda39e))
* **layout:** roomier caption bar + double-click to zoom ([#11](https://github.com/silo-code/silo/issues/11)) ([56b3e4c](https://github.com/silo-code/silo/commit/56b3e4cfd40314a34e726ce986f077f10a3076b4))
* **storage:** per-workspace files in an identity-keyed config root ([#6](https://github.com/silo-code/silo/issues/6)) ([f088170](https://github.com/silo-code/silo/commit/f088170cc5d8c454d6ed6d1bccad1eee2d90254a))


### Bug Fixes

* **ci:** root release-please at repo root so all commits count ([#9](https://github.com/silo-code/silo/issues/9)) ([4bf6b4e](https://github.com/silo-code/silo/commit/4bf6b4e4a4a83312b8a395147dc852455279ca95))
* **docs:** update documentation links to silo.dev and improve pre-commit pnpm resolution ([#4](https://github.com/silo-code/silo/issues/4)) ([b280ce3](https://github.com/silo-code/silo/commit/b280ce38b1e196b011afd964d24da351376fd542))
* **editor:** free Cmd+Alt+[/] for side-dock toggles when Monaco has focus ([#8](https://github.com/silo-code/silo/issues/8)) ([8100fe2](https://github.com/silo-code/silo/commit/8100fe2459fca9035eac59b20d58678a04b665a4))
* **layout:** match side-dock resize border to center dock ([#5](https://github.com/silo-code/silo/issues/5)) ([f45a599](https://github.com/silo-code/silo/commit/f45a599f72618c193d16bd16490fbe4438de968e))
* **terminal:** store runtime state in app-data dir, not ~/.app-editor ([#3](https://github.com/silo-code/silo/issues/3)) ([e5f80f9](https://github.com/silo-code/silo/commit/e5f80f91fda0187089e14ca1a8f799662fd09d69))
* **themes:** meld active tab into content for Gruvbox/Tokyo ([#12](https://github.com/silo-code/silo/issues/12)) ([f065393](https://github.com/silo-code/silo/commit/f065393e2727b8a7623c085f469f40d735f32df5))

## 0.1.0 (2026-06-10)

Initial public release.

Silo is a local-first, terminal-first code editor built to run many workspaces at
once and switch between them instantly without losing state — each workspace keeps
its terminals, panels, and layout alive in the background. Built with Tauri, React,
and TypeScript around a small stable core and a public extension SDK
([`@silo-code/sdk`](https://www.npmjs.com/package/@silo-code/sdk)); first-party
features (editor, terminal, git, themes, file explorer) ship as extensions on the
same primitives third-party extensions use.
