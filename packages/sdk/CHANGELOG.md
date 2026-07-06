# @silo-code/sdk

## [0.22.0](https://github.com/silo-code/silo/compare/sdk-v0.21.0...sdk-v0.22.0) (2026-07-05)


### Features

* **sdk:** add non-breaking Part B surface (docs, terminal, fs, exec, search, net) ([#168](https://github.com/silo-code/silo/issues/168)) ([ec2ab1c](https://github.com/silo-code/silo/commit/ec2ab1c1ee0c9daafbfa93b97a20d839989a7e49))

## [0.21.0](https://github.com/silo-code/silo/compare/sdk-v0.20.0...sdk-v0.21.0) (2026-07-02)


### Features

* **sdk:** breaking-change cleanup batch + active-terminal tracking ([#161](https://github.com/silo-code/silo/issues/161)) ([421ea20](https://github.com/silo-code/silo/commit/421ea20897e551a7898a057599c4b56954fef586))

## [0.20.0](https://github.com/silo-code/silo/compare/sdk-v0.19.1...sdk-v0.20.0) (2026-06-29)


### Features

* **output:** add Output panel with ctx.log API and grouped channel selector ([#142](https://github.com/silo-code/silo/issues/142)) ([52d1848](https://github.com/silo-code/silo/commit/52d184872c00b165ce8cc94297f5bedb80ada839))

## [0.19.1](https://github.com/silo-code/silo/compare/sdk-v0.19.0...sdk-v0.19.1) (2026-06-29)


### Bug Fixes

* **focus:** restore correct panel focus and cursor position on workspace switch ([#137](https://github.com/silo-code/silo/issues/137)) ([b33b918](https://github.com/silo-code/silo/commit/b33b9185ffa26e6eaa6570227dc887a95b30c370))

## [0.19.0](https://github.com/silo-code/silo/compare/sdk-v0.18.0...sdk-v0.19.0) (2026-06-28)


### Features

* add Help menu with About, Updates, and links on all platforms ([#132](https://github.com/silo-code/silo/issues/132)) ([5198393](https://github.com/silo-code/silo/commit/519839313a88113eccea1cbff43881e4dde73237))
* store left/right panel collapse state per workspace ([#136](https://github.com/silo-code/silo/issues/136)) ([66b8645](https://github.com/silo-code/silo/commit/66b86457f2153b65c6bf9e401060986583ee1746))

## [0.18.0](https://github.com/silo-code/silo/compare/sdk-v0.17.0...sdk-v0.18.0) (2026-06-28)


### Features

* add ctx.system (OS, arch, Silo version) to extension context ([#127](https://github.com/silo-code/silo/issues/127)) ([9ac6e32](https://github.com/silo-code/silo/commit/9ac6e3212605237e111d88405c17d9a3460d2836))

## [0.17.0](https://github.com/silo-code/silo/compare/sdk-v0.16.0...sdk-v0.17.0) (2026-06-28)


### Features

* add ctx.processes (workspace process observability) ([#124](https://github.com/silo-code/silo/issues/124)) ([0565004](https://github.com/silo-code/silo/commit/056500428ec47b2a68bbb614e082b82c6bb355f3))
* make side-panel visibility per-workspace ([#121](https://github.com/silo-code/silo/issues/121)) ([1836be5](https://github.com/silo-code/silo/commit/1836be518052db11e40838f7b22e57b8b087b8d9))

## [0.16.0](https://github.com/silo-code/silo/compare/sdk-v0.15.0...sdk-v0.16.0) (2026-06-28)


### Features

* add ctx.storage (global + workspace scopes) ([#118](https://github.com/silo-code/silo/issues/118)) ([7dc8122](https://github.com/silo-code/silo/commit/7dc81225b69df709d565824c1c2af826878a010c))

## [0.15.0](https://github.com/silo-code/silo/compare/sdk-v0.14.0...sdk-v0.15.0) (2026-06-26)


### Features

* **workspaces:** add extension badge API, replace uptime with badges ([#102](https://github.com/silo-code/silo/issues/102)) ([e8ab637](https://github.com/silo-code/silo/commit/e8ab6375240278dcc6b6f6fe169f96dde4eafcd7))

## [0.14.0](https://github.com/silo-code/silo/compare/sdk-v0.13.0...sdk-v0.14.0) (2026-06-26)


### Features

* **terminal:** auto-recover terminals after reboot with buffer replay ([#98](https://github.com/silo-code/silo/issues/98)) ([b3a25ee](https://github.com/silo-code/silo/commit/b3a25ee2ff517f8f3cc0ca14b9b07b52f0969abe))

## [0.13.0](https://github.com/silo-code/silo/compare/sdk-v0.12.0...sdk-v0.13.0) (2026-06-25)


### Features

* **workspaces:** add registerSection API for extension-contributed workspace row components ([#95](https://github.com/silo-code/silo/issues/95)) ([2c42024](https://github.com/silo-code/silo/commit/2c42024712d8c1a5506f27369393453ea5bbfb27))

## [0.12.0](https://github.com/silo-code/silo/compare/sdk-v0.11.0...sdk-v0.12.0) (2026-06-25)


### Features

* **terminal-monitor:** auto-detect agent status via OSC sequences ([#89](https://github.com/silo-code/silo/issues/89)) ([ec80887](https://github.com/silo-code/silo/commit/ec80887dba5a669682d7b3b67e0debd4245f59db))

## [0.11.0](https://github.com/silo-code/silo/compare/sdk-v0.10.1...sdk-v0.11.0) (2026-06-24)


### Features

* **search:** multi-folder workspace search ([#80](https://github.com/silo-code/silo/issues/80)) ([8d5c588](https://github.com/silo-code/silo/commit/8d5c588cc5cc3c523008085c1467bd4724421c9b))

## [0.10.1](https://github.com/silo-code/silo/compare/sdk-v0.10.0...sdk-v0.10.1) (2026-06-23)


### Bug Fixes

* **layout:** remove 36px titlebar gap on Linux and Windows ([#72](https://github.com/silo-code/silo/issues/72)) ([00f51ed](https://github.com/silo-code/silo/commit/00f51ed442c0eb49ffa4ceabf00ba016cc4f7d40))

## [0.10.0](https://github.com/silo-code/silo/compare/sdk-v0.9.0...sdk-v0.10.0) (2026-06-23)


### Features

* **sdk:** workspace & terminal decoration APIs + terminal-monitor example ([#70](https://github.com/silo-code/silo/issues/70)) ([910e8a4](https://github.com/silo-code/silo/commit/910e8a40d68551eef7c2595e37d8cdc49d76aeb3))
* **settings:** move Keyboard Shortcuts to first in settings rail ([#71](https://github.com/silo-code/silo/issues/71)) ([bd6cd62](https://github.com/silo-code/silo/commit/bd6cd6204d16afc9cdccfc8e9dea7caad198e72c))

## [0.9.0](https://github.com/silo-code/silo/compare/sdk-v0.8.0...sdk-v0.9.0) (2026-06-21)


### Features

* **extensions:** add Built-in badge to extension list items ([#63](https://github.com/silo-code/silo/issues/63)) ([36ffb6a](https://github.com/silo-code/silo/commit/36ffb6aa7f33a3d0f955db6792ddc1f5273e0486))
* **extensions:** list first-party built-ins (branded, disable-only) ([13f5ee7](https://github.com/silo-code/silo/commit/13f5ee742e7a79f37c6f5795109e57bdfa65ef64))
* **layout:** make side-dock visibility and widths global, not per-workspace ([#7](https://github.com/silo-code/silo/issues/7)) ([6daa05f](https://github.com/silo-code/silo/commit/6daa05fe66c0b8904e45ea18832cab2c9cfda39e))
* **sdk:** promote Tooltip to public SDK surface (0.7.0) ([#58](https://github.com/silo-code/silo/issues/58)) ([042dedc](https://github.com/silo-code/silo/commit/042dedc2ff2fe1912c8cc26c6608b1191804f9a5))
* **search:** file-search side panel + ctx.search ([#29](https://github.com/silo-code/silo/issues/29)) ([184ae98](https://github.com/silo-code/silo/commit/184ae986cb5ae42c65f196bc76c77bebeb4d9ad4))
* **statusbar:** custom tooltips on all status bar items + kbd-badge accelerators ([#37](https://github.com/silo-code/silo/issues/37)) ([bef147b](https://github.com/silo-code/silo/commit/bef147b6f77516f449aef3b28d2746bed56294b4))
* **web-viewer:** local web viewer extension + ctx.net HTTP client ([#61](https://github.com/silo-code/silo/issues/61)) ([319a31c](https://github.com/silo-code/silo/commit/319a31c051b0220c7543c29cc56162f9e04e8495))


### Bug Fixes

* **docs:** update documentation links to silo.dev and improve pre-commit pnpm resolution ([#4](https://github.com/silo-code/silo/issues/4)) ([b280ce3](https://github.com/silo-code/silo/commit/b280ce38b1e196b011afd964d24da351376fd542))

## 0.6.0

### Minor Changes

- 33c28ed: First publishable release of the public extension SDK. `@silo-code/sdk` now ships
  a real build (`dist/` with JS + bundled `.d.ts` declarations) so external
  extension authors can `npm i -D @silo-code/sdk` and compile against the types,
  with the example extensions consuming it as a real dependency.
