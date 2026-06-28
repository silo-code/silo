# Changelog

## [0.16.0](https://github.com/silo-code/silo/compare/silo-v0.15.0...silo-v0.16.0) (2026-06-28)


### Features

* add ctx.processes (workspace process observability) ([#124](https://github.com/silo-code/silo/issues/124)) ([0565004](https://github.com/silo-code/silo/commit/056500428ec47b2a68bbb614e082b82c6bb355f3))
* add ctx.system (OS, arch, Silo version) to extension context ([#127](https://github.com/silo-code/silo/issues/127)) ([9ac6e32](https://github.com/silo-code/silo/commit/9ac6e3212605237e111d88405c17d9a3460d2836))
* make side-panel visibility per-workspace ([#121](https://github.com/silo-code/silo/issues/121)) ([1836be5](https://github.com/silo-code/silo/commit/1836be518052db11e40838f7b22e57b8b087b8d9))

## [0.15.0](https://github.com/silo-code/silo/compare/silo-v0.14.0...silo-v0.15.0) (2026-06-28)


### Features

* add ctx.storage (global + workspace scopes) ([#118](https://github.com/silo-code/silo/issues/118)) ([7dc8122](https://github.com/silo-code/silo/commit/7dc81225b69df709d565824c1c2af826878a010c))

## [0.14.0](https://github.com/silo-code/silo/compare/silo-v0.13.0...silo-v0.14.0) (2026-06-26)


### Features

* **terminal:** add configurable scroll speed settings ([#104](https://github.com/silo-code/silo/issues/104)) ([bd69f9e](https://github.com/silo-code/silo/commit/bd69f9ecedeaf5f5a75569e769cf3f107fc5cb95))
* **terminal:** auto-recover terminals after reboot with buffer replay ([#98](https://github.com/silo-code/silo/issues/98)) ([b3a25ee](https://github.com/silo-code/silo/commit/b3a25ee2ff517f8f3cc0ca14b9b07b52f0969abe))
* **terminal:** font family and size settings ([#101](https://github.com/silo-code/silo/issues/101)) ([3773b8f](https://github.com/silo-code/silo/commit/3773b8fc8b2a96915d80a0c02166a943331303c4))
* **workspaces:** add extension badge API, replace uptime with badges ([#102](https://github.com/silo-code/silo/issues/102)) ([e8ab637](https://github.com/silo-code/silo/commit/e8ab6375240278dcc6b6f6fe169f96dde4eafcd7))


### Bug Fixes

* **git:** left-align branch name in single-root panel ([#105](https://github.com/silo-code/silo/issues/105)) ([96f4c58](https://github.com/silo-code/silo/commit/96f4c588a99b72bb7b2158a7006c64b2b708f90a))
* **terminal:** disable bell sound on copy/BEL sequences ([#100](https://github.com/silo-code/silo/issues/100)) ([7f92102](https://github.com/silo-code/silo/commit/7f92102e9edf05f0c3bea2f55bfaae9aaaadb0da))

## [0.13.0](https://github.com/silo-code/silo/compare/silo-v0.12.0...silo-v0.13.0) (2026-06-26)


### Features

* **terminal:** add configurable scroll speed settings ([#104](https://github.com/silo-code/silo/issues/104)) ([bd69f9e](https://github.com/silo-code/silo/commit/bd69f9ecedeaf5f5a75569e769cf3f107fc5cb95))
* **terminal:** auto-recover terminals after reboot with buffer replay ([#98](https://github.com/silo-code/silo/issues/98)) ([b3a25ee](https://github.com/silo-code/silo/commit/b3a25ee2ff517f8f3cc0ca14b9b07b52f0969abe))
* **terminal:** font family and size settings ([#101](https://github.com/silo-code/silo/issues/101)) ([3773b8f](https://github.com/silo-code/silo/commit/3773b8fc8b2a96915d80a0c02166a943331303c4))
* **workspaces:** add extension badge API, replace uptime with badges ([#102](https://github.com/silo-code/silo/issues/102)) ([e8ab637](https://github.com/silo-code/silo/commit/e8ab6375240278dcc6b6f6fe169f96dde4eafcd7))
* **workspaces:** add registerSection API for extension-contributed workspace row components ([#95](https://github.com/silo-code/silo/issues/95)) ([2c42024](https://github.com/silo-code/silo/commit/2c42024712d8c1a5506f27369393453ea5bbfb27))


### Bug Fixes

* **git:** left-align branch name in single-root panel ([#105](https://github.com/silo-code/silo/issues/105)) ([96f4c58](https://github.com/silo-code/silo/commit/96f4c588a99b72bb7b2158a7006c64b2b708f90a))
* **git:** truncate branch name in single-root mode ([#93](https://github.com/silo-code/silo/issues/93)) ([9eed912](https://github.com/silo-code/silo/commit/9eed912fd860016c441c77f4f9d6545ff5d266e5))
* **terminal:** disable bell sound on copy/BEL sequences ([#100](https://github.com/silo-code/silo/issues/100)) ([7f92102](https://github.com/silo-code/silo/commit/7f92102e9edf05f0c3bea2f55bfaae9aaaadb0da))

## [0.13.0](https://github.com/silo-code/silo/compare/silo-v0.12.0...silo-v0.13.0) (2026-06-26)


### Features

* **terminal:** auto-recover terminals after reboot with buffer replay ([#98](https://github.com/silo-code/silo/issues/98)) ([b3a25ee](https://github.com/silo-code/silo/commit/b3a25ee2ff517f8f3cc0ca14b9b07b52f0969abe))
* **workspaces:** add registerSection API for extension-contributed workspace row components ([#95](https://github.com/silo-code/silo/issues/95)) ([2c42024](https://github.com/silo-code/silo/commit/2c42024712d8c1a5506f27369393453ea5bbfb27))


### Bug Fixes

* **git:** truncate branch name in single-root mode ([#93](https://github.com/silo-code/silo/issues/93)) ([9eed912](https://github.com/silo-code/silo/commit/9eed912fd860016c441c77f4f9d6545ff5d266e5))

## [0.13.0](https://github.com/silo-code/silo/compare/silo-v0.12.0...silo-v0.13.0) (2026-06-25)


### Features

* **workspaces:** add registerSection API for extension-contributed workspace row components ([#95](https://github.com/silo-code/silo/issues/95)) ([2c42024](https://github.com/silo-code/silo/commit/2c42024712d8c1a5506f27369393453ea5bbfb27))


### Bug Fixes

* **git:** truncate branch name in single-root mode ([#93](https://github.com/silo-code/silo/issues/93)) ([9eed912](https://github.com/silo-code/silo/commit/9eed912fd860016c441c77f4f9d6545ff5d266e5))

## [0.12.0](https://github.com/silo-code/silo/compare/silo-v0.11.0...silo-v0.12.0) (2026-06-25)


### Features

* **terminal-monitor:** auto-detect agent status via OSC sequences ([#89](https://github.com/silo-code/silo/issues/89)) ([ec80887](https://github.com/silo-code/silo/commit/ec80887dba5a669682d7b3b67e0debd4245f59db))


### Bug Fixes

* **git:** split multi-root header into two rows with truncation ([#92](https://github.com/silo-code/silo/issues/92)) ([0e2ea33](https://github.com/silo-code/silo/commit/0e2ea3369301ebaff949d34b58217dc016c21da1))

## [0.11.0](https://github.com/silo-code/silo/compare/silo-v0.10.0...silo-v0.11.0) (2026-06-25)


### Features

* **terminal:** add Windows ConPTY backend ([#85](https://github.com/silo-code/silo/issues/85)) ([1751a3f](https://github.com/silo-code/silo/commit/1751a3f7153c54b6d18180ce907859217109c9bb))
* **windows:** sync caption bar and title-bar theme with app colors ([#86](https://github.com/silo-code/silo/issues/86)) ([28a6db7](https://github.com/silo-code/silo/commit/28a6db7f7604f0dcdb7ba48d9e4bfd5f138eadc8))


### Bug Fixes

* **windows:** normalize path separators to forward slashes throughout ([#83](https://github.com/silo-code/silo/issues/83)) ([8ad0860](https://github.com/silo-code/silo/commit/8ad08605b0b1737852759478eb499f34fe7a575a))

## [0.10.0](https://github.com/silo-code/silo/compare/silo-v0.9.0...silo-v0.10.0) (2026-06-24)


### Features

* **ci:** enable Linux and Windows release builds; mark as experimental ([a4d73dc](https://github.com/silo-code/silo/commit/a4d73dcafb6da36bc83d686b955ad3ae773409c5))
* **dnd:** handle multi-file drops in terminal, editor, and file tree ([#77](https://github.com/silo-code/silo/issues/77)) ([79994af](https://github.com/silo-code/silo/commit/79994afcaa2a233f2b8e5a6ff098b8b675e59d68))
* **dnd:** native Finder file drag-and-drop via WKWebView swizzle ([#76](https://github.com/silo-code/silo/issues/76)) ([1fe952e](https://github.com/silo-code/silo/commit/1fe952e84c723d715e27fad38df00ecf95310fbc))
* **extensions:** add dev-only reload button for installed extensions ([#69](https://github.com/silo-code/silo/issues/69)) ([a08953f](https://github.com/silo-code/silo/commit/a08953fdf3047d1d824f4c354da143a03c17caee))
* **sdk:** workspace & terminal decoration APIs + terminal-monitor example ([#70](https://github.com/silo-code/silo/issues/70)) ([910e8a4](https://github.com/silo-code/silo/commit/910e8a40d68551eef7c2595e37d8cdc49d76aeb3))
* **search:** multi-folder workspace search ([#80](https://github.com/silo-code/silo/issues/80)) ([8d5c588](https://github.com/silo-code/silo/commit/8d5c588cc5cc3c523008085c1467bd4724421c9b))
* **settings:** move Keyboard Shortcuts to first in settings rail ([#71](https://github.com/silo-code/silo/issues/71)) ([bd6cd62](https://github.com/silo-code/silo/commit/bd6cd6204d16afc9cdccfc8e9dea7caad198e72c))


### Bug Fixes

* **layout:** remove 36px titlebar gap on Linux and Windows ([#72](https://github.com/silo-code/silo/issues/72)) ([00f51ed](https://github.com/silo-code/silo/commit/00f51ed442c0eb49ffa4ceabf00ba016cc4f7d40))

## [0.9.0](https://github.com/silo-code/silo/compare/silo-v0.8.0...silo-v0.9.0) (2026-06-21)


### Features

* **extensions:** add Built-in badge to extension list items ([#63](https://github.com/silo-code/silo/issues/63)) ([36ffb6a](https://github.com/silo-code/silo/commit/36ffb6aa7f33a3d0f955db6792ddc1f5273e0486))
* **markdown-preview:** render frontmatter as a styled metadata block ([#65](https://github.com/silo-code/silo/issues/65)) ([22331a6](https://github.com/silo-code/silo/commit/22331a6b31335a4c3f0bfcfd923940bedcd1c7a8))
* **web-viewer:** local web viewer extension + ctx.net HTTP client ([#61](https://github.com/silo-code/silo/issues/61)) ([319a31c](https://github.com/silo-code/silo/commit/319a31c051b0220c7543c29cc56162f9e04e8495))


### Bug Fixes

* **markdown-preview:** use border-strong token so dividers are visible in dark theme ([#64](https://github.com/silo-code/silo/issues/64)) ([6abcf12](https://github.com/silo-code/silo/commit/6abcf12466da3ea45d66e83e5876d81b7f43f305)), closes [#59](https://github.com/silo-code/silo/issues/59)
* **release:** scope installer trigger to app only; correct SDK manifest ([b4ca2f1](https://github.com/silo-code/silo/commit/b4ca2f1351e5e343e5eb969db17365487a29102e))

## [0.8.0](https://github.com/silo-code/silo/compare/silo-v0.7.1...silo-v0.8.0) (2026-06-19)


### Features

* **error-handling:** error boundaries to prevent blank screen on render errors ([#55](https://github.com/silo-code/silo/issues/55)) ([198f8c0](https://github.com/silo-code/silo/commit/198f8c0219ad18ef1549c39a4a2f7d01772799cd))
* **sdk:** promote Tooltip to public SDK surface (0.7.0) ([#58](https://github.com/silo-code/silo/issues/58)) ([042dedc](https://github.com/silo-code/silo/commit/042dedc2ff2fe1912c8cc26c6608b1191804f9a5))

## [0.7.1](https://github.com/silo-code/silo/compare/silo-v0.7.0...silo-v0.7.1) (2026-06-19)


### Bug Fixes

* **icon:** align CFBundleIconFile with AppIcon naming to match macOS 26 convention ([7386484](https://github.com/silo-code/silo/commit/73864841dd89e684cf4a8a3e8b4449e08f8eca3f))
* **icon:** white background with black text for dock visibility ([9c80ca7](https://github.com/silo-code/silo/commit/9c80ca75c41c72d6889ba8b43fd79b1c2e8c08ed))
* **modal:** disable auto-capitalize/correct/spellcheck on prompt input ([14bc1d9](https://github.com/silo-code/silo/commit/14bc1d99db448b43ba4893eea1ba99dcbffef3b2))

## [0.7.0](https://github.com/silo-code/silo/compare/silo-v0.6.4...silo-v0.7.0) (2026-06-18)


### Features

* **icon:** add Liquid Glass .icon + Assets.car for macOS Tahoe squircle jail fix ([bde52a5](https://github.com/silo-code/silo/commit/bde52a5f2a8f29c6a17f073e4c52281137a67b95))
* **icon:** add Liquid Glass Assets.car for dev build (squircle jail fix) ([8a4be34](https://github.com/silo-code/silo/commit/8a4be34ce0abd348b5c53b1a3ce74361bc8f1362))


### Bug Fixes

* **icon:** remove infoPlistValues (not in Tauri v2 schema), recompile dev Assets.car as AppIcon ([57d709b](https://github.com/silo-code/silo/commit/57d709b5a550a2e19a459b66078724f9097f97cc))
* **icon:** restore dev badge on dev icon source with squircle format ([a36d906](https://github.com/silo-code/silo/commit/a36d906e96f9214b44352207656e47a32acbd1d2))

## [0.6.4](https://github.com/silo-code/silo/compare/silo-v0.6.3...silo-v0.6.4) (2026-06-18)


### Bug Fixes

* **icon:** use squircle-masked source with transparent corners for correct dock size ([aaae589](https://github.com/silo-code/silo/commit/aaae5899dc8868e08da63c8a7e6e3a44081b46a6))

## [0.6.3](https://github.com/silo-code/silo/compare/silo-v0.6.2...silo-v0.6.3) (2026-06-18)


### Bug Fixes

* **icon:** use fully opaque icon source, let macOS apply squircle mask ([90d0c53](https://github.com/silo-code/silo/commit/90d0c5340b48cbc462f29b95fa2d4b6c1a3ec271))

## [0.6.2](https://github.com/silo-code/silo/compare/silo-v0.6.1...silo-v0.6.2) (2026-06-18)


### Bug Fixes

* **icon:** refine prod icon — edge-to-edge squircle with balanced text padding ([a8fd60e](https://github.com/silo-code/silo/commit/a8fd60ee13f218e249fb826c04384f949f2ccd18))

## [0.6.1](https://github.com/silo-code/silo/compare/silo-v0.6.0...silo-v0.6.1) (2026-06-18)


### Bug Fixes

* **icon:** fix prod icon transparency, sizing, and corner radius ([2599832](https://github.com/silo-code/silo/commit/2599832cdfe0a4704968bad81197ffa4939de796))
* **tooltip:** dismiss tooltip on pointer down ([#48](https://github.com/silo-code/silo/issues/48)) ([66812bd](https://github.com/silo-code/silo/commit/66812bd0937df76357f79c27edef721baf30d204))

## [0.6.0](https://github.com/silo-code/silo/compare/silo-v0.5.0...silo-v0.6.0) (2026-06-18)


### Features

* **extensions:** silo install/uninstall CLI, npx scaffold, npm/URL install, sharing guide ([#45](https://github.com/silo-code/silo/issues/45)) ([ce00181](https://github.com/silo-code/silo/commit/ce00181cfff08a5db56596d89c096ecbaf4d8bf5))


### Bug Fixes

* **ci:** retry DMG upload on 404 to handle parallel-job race condition ([692b3e5](https://github.com/silo-code/silo/commit/692b3e559b817e545b04909f76bd4b03c9879ae3))

## [0.5.0](https://github.com/silo-code/silo/compare/silo-v0.4.0...silo-v0.5.0) (2026-06-17)


### Features

* **editor:** show strikethrough tab when an open file is deleted ([#33](https://github.com/silo-code/silo/issues/33)) ([ff83468](https://github.com/silo-code/silo/commit/ff83468a27ae6a2c8b8e19b0ef9f116067b2aa35))
* **file-search:** focus without selection, per-workspace state, badge contrast ([#36](https://github.com/silo-code/silo/issues/36)) ([a7f5beb](https://github.com/silo-code/silo/commit/a7f5beb680eebab210357b7865f569bf6db4c4ae))
* **statusbar:** custom tooltips on all status bar items + kbd-badge accelerators ([#37](https://github.com/silo-code/silo/issues/37)) ([bef147b](https://github.com/silo-code/silo/commit/bef147b6f77516f449aef3b28d2746bed56294b4))
* **tabs:** restyle overflow menu to match Silo context menus ([#35](https://github.com/silo-code/silo/issues/35)) ([5b47e78](https://github.com/silo-code/silo/commit/5b47e780d849755d8274b2ad739ea2c0c9c872e9))

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
