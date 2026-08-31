# @silo-code/sdk

## [0.42.0](https://github.com/silo-code/silo/compare/sdk-v0.41.0...sdk-v0.42.0) (2026-08-31)


### Features

* **sdk:** add ctx.storage.globalDir()/workspaceDir() (RFC 0032) ([#458](https://github.com/silo-code/silo/issues/458)) ([041b475](https://github.com/silo-code/silo/commit/041b475ebb9bfc1bd7bfb2bde362b5c07434e15f))

## [0.41.0](https://github.com/silo-code/silo/compare/sdk-v0.40.2...sdk-v0.41.0) (2026-08-27)


### ⚠ BREAKING CHANGES

* **sdk:** SettingRow enabled/dependent for gated sub-settings ([#442](https://github.com/silo-code/silo/issues/442))

### Features

* **sdk:** SettingRow enabled/dependent for gated sub-settings ([#442](https://github.com/silo-code/silo/issues/442)) ([d88b579](https://github.com/silo-code/silo/commit/d88b5796ad39e8c514af299805cfdbb72d570994))
* **settings:** host-own settings page titles ([#444](https://github.com/silo-code/silo/issues/444)) ([48ad9b4](https://github.com/silo-code/silo/commit/48ad9b46f7ea3e82fca5e666df97897c5d74b641))

## [0.40.2](https://github.com/silo-code/silo/compare/sdk-v0.40.1...sdk-v0.40.2) (2026-08-25)


### Bug Fixes

* **terminal:** wire Cmd+K clear shortcut and persist buffer on clear ([#428](https://github.com/silo-code/silo/issues/428)) ([0df7363](https://github.com/silo-code/silo/commit/0df736378b136f91002d429cc69c5b9dfbd67f98))

## [0.40.1](https://github.com/silo-code/silo/compare/sdk-v0.40.0...sdk-v0.40.1) (2026-08-25)


### Bug Fixes

* **sdk:** pin Badge font sizes to absolute chrome tokens ([#424](https://github.com/silo-code/silo/issues/424)) ([8fc4fa0](https://github.com/silo-code/silo/commit/8fc4fa09c36d8bdb060ba0396c4b270223723f51))

## [0.40.0](https://github.com/silo-code/silo/compare/sdk-v0.39.0...sdk-v0.40.0) (2026-08-25)


### Features

* **sdk:** add openPanelSheet, homeDir, confirmWithDontShowAgain ([#423](https://github.com/silo-code/silo/issues/423)) ([2a942f2](https://github.com/silo-code/silo/commit/2a942f241c6e6f23981c2e0ee2a7ec86401121ae))
* **theming:** give form fields and primary buttons real contrast in dark themes ([#417](https://github.com/silo-code/silo/issues/417)) ([b942c5e](https://github.com/silo-code/silo/commit/b942c5eed732bf41ce25777673a5b1485988e9e9))

## [0.39.0](https://github.com/silo-code/silo/compare/sdk-v0.38.0...sdk-v0.39.0) (2026-08-24)


### Features

* **settings:** rebuild Settings on a new app-sheet surface ([#410](https://github.com/silo-code/silo/issues/410)) ([855bd28](https://github.com/silo-code/silo/commit/855bd28636cccc9fca009138fdd50f27ebd6667c))

## [0.38.0](https://github.com/silo-code/silo/compare/sdk-v0.37.1...sdk-v0.38.0) (2026-08-23)


### Features

* **terminal:** tell every terminal which tab and workspace it is ([#406](https://github.com/silo-code/silo/issues/406)) ([8d20d02](https://github.com/silo-code/silo/commit/8d20d02312aa9bc50d5f5a2334a1f4b638ec4355))

## [0.37.1](https://github.com/silo-code/silo/compare/sdk-v0.37.0...sdk-v0.37.1) (2026-08-23)


### Bug Fixes

* **layout:** ctx.log.show() actually selects the caller's Output channel ([#399](https://github.com/silo-code/silo/issues/399)) ([1ac907d](https://github.com/silo-code/silo/commit/1ac907d794a695dee4faea23e730214cffdaf7fe))

## [0.37.0](https://github.com/silo-code/silo/compare/sdk-v0.36.0...sdk-v0.37.0) (2026-08-21)


### Features

* **side-panels:** SideDock layout tree with free-form splits ([#388](https://github.com/silo-code/silo/issues/388)) ([a11492e](https://github.com/silo-code/silo/commit/a11492e50e9f12eb44412007a026ec3f101eec46))

## [0.36.0](https://github.com/silo-code/silo/compare/sdk-v0.35.1...sdk-v0.36.0) (2026-08-18)


### Features

* **terminal:** statusbar startup + session-host backpressure (phase 1–2) ([#368](https://github.com/silo-code/silo/issues/368)) ([87a340b](https://github.com/silo-code/silo/commit/87a340b6b52525c485a4a98c189d89e5b18d76a5))

## [0.35.1](https://github.com/silo-code/silo/compare/sdk-v0.35.0...sdk-v0.35.1) (2026-08-18)


### Bug Fixes

* **docs:** move the extension tutorial off the /guide/getting-started URL ([#369](https://github.com/silo-code/silo/issues/369)) ([ba91e37](https://github.com/silo-code/silo/commit/ba91e37020b5829174b3d579ce72926fcf59565e))

## [0.35.0](https://github.com/silo-code/silo/compare/sdk-v0.34.1...sdk-v0.35.0) (2026-08-14)


### Features

* **navigator:** list every view instead of hiding them in a dropdown ([#360](https://github.com/silo-code/silo/issues/360)) ([49b7478](https://github.com/silo-code/silo/commit/49b74781ac5e0c92fb280e8f0aa8f32a64cb8f80))

## [0.34.1](https://github.com/silo-code/silo/compare/sdk-v0.34.0...sdk-v0.34.1) (2026-08-12)


### Bug Fixes

* **agents:** detect Claude's new circle spinner and hide status glyphs in titles ([#345](https://github.com/silo-code/silo/issues/345)) ([a92f08c](https://github.com/silo-code/silo/commit/a92f08cc0522d6e35d8469dd8f22f66885790c13))

## [0.34.0](https://github.com/silo-code/silo/compare/sdk-v0.33.0...sdk-v0.34.0) (2026-08-06)


### Features

* **navigator:** turn Workspaces panel into contributed Navigator views ([#325](https://github.com/silo-code/silo/issues/325)) ([0d3b7f8](https://github.com/silo-code/silo/commit/0d3b7f81b593bba68467a1a9652d201daa72eeed))

## [0.33.0](https://github.com/silo-code/silo/compare/sdk-v0.32.0...sdk-v0.33.0) (2026-08-04)


### Features

* **sdk:** add whole-tab highlight adornment API ([#317](https://github.com/silo-code/silo/issues/317)) ([b98dd86](https://github.com/silo-code/silo/commit/b98dd86c035c7c52bd9bb0cd1591d7b52e6997fa))

## [0.32.0](https://github.com/silo-code/silo/compare/sdk-v0.31.0...sdk-v0.32.0) (2026-07-31)


### Features

* **sdk:** add Activity chrome and tab adornment APIs ([#310](https://github.com/silo-code/silo/issues/310)) ([78a82ae](https://github.com/silo-code/silo/commit/78a82ae2ea9866b176e03ba47c3064c7e35d6297))

## [0.31.0](https://github.com/silo-code/silo/compare/sdk-v0.30.0...sdk-v0.31.0) (2026-07-30)


### Features

* **agents:** ctx.agents surface with multi-agent detection, resume, and reboot recovery ([#299](https://github.com/silo-code/silo/issues/299)) ([d125828](https://github.com/silo-code/silo/commit/d1258287b8478cee4ac502407d481bd658150845))

## [0.30.0](https://github.com/silo-code/silo/compare/sdk-v0.29.1...sdk-v0.30.0) (2026-07-22)


### Features

* **terminals:** add terminal/link context-menu contribution surface ([#277](https://github.com/silo-code/silo/issues/277)) ([d1277b2](https://github.com/silo-code/silo/commit/d1277b2b10795132e4abcc86281ab22a0b34491d))

## [0.29.1](https://github.com/silo-code/silo/compare/sdk-v0.29.0...sdk-v0.29.1) (2026-07-20)


### Bug Fixes

* **markdown-preview:** render unsaved buffer instead of disk-only ([#271](https://github.com/silo-code/silo/issues/271)) ([2ae1db9](https://github.com/silo-code/silo/commit/2ae1db908cd9e6ce7180b1cb6b2050d3cae38860)), closes [#270](https://github.com/silo-code/silo/issues/270)

## [0.29.0](https://github.com/silo-code/silo/compare/sdk-v0.28.1...sdk-v0.29.0) (2026-07-19)


### Features

* **sdk:** modal design system — component kit, host tokens, and migrations (RFC 0016) ([#265](https://github.com/silo-code/silo/issues/265)) ([30c48f7](https://github.com/silo-code/silo/commit/30c48f7a6b0564185e68afe0a169233cb66cc6f6))

## [0.28.1](https://github.com/silo-code/silo/compare/sdk-v0.28.0...sdk-v0.28.1) (2026-07-18)


### Bug Fixes

* **diff:** scope git diffs to the file's workspace root ([#262](https://github.com/silo-code/silo/issues/262)) ([b5e2bef](https://github.com/silo-code/silo/commit/b5e2beff89c601be5d75bbd4fdba1c5a95e2c214))

## [0.28.0](https://github.com/silo-code/silo/compare/sdk-v0.27.1...sdk-v0.28.0) (2026-07-17)


### Features

* **sdk:** context-menu contribution types + registerContextMenuItem (RFC 0013) ([#249](https://github.com/silo-code/silo/issues/249)) ([0e28e7a](https://github.com/silo-code/silo/commit/0e28e7a2eaa6cd22cf706a025e44fd44b2fad909))
* **sdk:** workspace property page types + registerPropertyPage (RFC 0015) ([#251](https://github.com/silo-code/silo/issues/251)) ([5ef6439](https://github.com/silo-code/silo/commit/5ef6439114f4462f831b5dd01989a346aa2f6363)), closes [#243](https://github.com/silo-code/silo/issues/243)

## [0.27.1](https://github.com/silo-code/silo/compare/sdk-v0.27.0...sdk-v0.27.1) (2026-07-16)


### Bug Fixes

* **terminals:** keep PTYs on soft-close; reap them on workspace delete ([#234](https://github.com/silo-code/silo/issues/234)) ([b135229](https://github.com/silo-code/silo/commit/b135229ff78810e0911b3b88aa883111b228300c))

## [0.27.0](https://github.com/silo-code/silo/compare/sdk-v0.26.0...sdk-v0.27.0) (2026-07-15)


### Features

* **extensions:** surface pending extension updates in status bar, settings rail, and app menu ([#224](https://github.com/silo-code/silo/issues/224)) ([00e5911](https://github.com/silo-code/silo/commit/00e5911ff1c154f4b4cbda9e26f0276caf4e310c))

## 0.26.0

### Minor Changes

- 7dc8122: Add `ctx.storage` — persisted, per-extension key/value storage in two scopes
  (`ExtensionStorageScopes`): `global` (shared across all workspaces) and
  `workspace` (scoped to the active workspace). Both are `ExtensionStorage`
  namespaced to the extension id and usable from `activate()`.

  `ExtensionStorage` gains `keys()`, and `subscribe` is now namespace-scoped —
  it fires on a change within the namespace, on hydration, and (for `workspace`)
  when the active workspace changes.

- e444006: `ctx.processes` now reports which workspace each session belongs to and can
  aggregate across every loaded workspace, not just the active one:
  - New `ProcessInfo.workspaceId` field, kept in sync as a session's owning
    workspace changes (e.g. a terminal moves workspaces).
  - `getState({ allWorkspaces: true })` returns live sessions from every loaded
    workspace instead of just the active one.
  - `subscribe(listener, { allWorkspaces: true })` fires on changes anywhere,
    not just the active workspace.

## [0.25.1](https://github.com/silo-code/silo/compare/sdk-v0.25.0...sdk-v0.25.1) (2026-07-14)

### Bug Fixes

- **processes:** correct getState() docs, avoid redundant allWorkspaces scan ([#213](https://github.com/silo-code/silo/issues/213)) ([1fdcef3](https://github.com/silo-code/silo/commit/1fdcef3d5602e35dcb757837e85de11ef7846240))

## [0.25.0](https://github.com/silo-code/silo/compare/sdk-v0.24.0...sdk-v0.25.0) (2026-07-14)

### Features

- **dock:** show a tooltip with the full tab name when the label is truncated ([#208](https://github.com/silo-code/silo/issues/208)) ([978b3b4](https://github.com/silo-code/silo/commit/978b3b43f3c5f42bba35dfc9acb983ba254eb300))
- **processes:** host-built process trees via enableStats({ trees: true }) ([#212](https://github.com/silo-code/silo/issues/212)) ([812b41a](https://github.com/silo-code/silo/commit/812b41a51387a66bf2434eebc51b9f3ad1a4d174))

## [0.24.0](https://github.com/silo-code/silo/compare/sdk-v0.23.1...sdk-v0.24.0) (2026-07-12)

### Features

- **webview:** cross-origin iframe bridge + public SDK surface ([#189](https://github.com/silo-code/silo/issues/189)) ([fcf585a](https://github.com/silo-code/silo/commit/fcf585acd4899a7361e873518224eefcb3b87c82))

### Bug Fixes

- **webview-bridge:** re-handshake reliability, contentWindow instability, dock focus, sticky headers ([#191](https://github.com/silo-code/silo/issues/191)) ([fc58f28](https://github.com/silo-code/silo/commit/fc58f2833b4ef7a4dc50c2d5d11902e4fff83333))
- **webview-bridge:** security gate, Windows origin, pending-RPC cleanup, permission re-check ([#193](https://github.com/silo-code/silo/issues/193)) ([578f39b](https://github.com/silo-code/silo/commit/578f39b0f44ceca7dd623ee879c31601a7182591))

## [0.23.1](https://github.com/silo-code/silo/compare/sdk-v0.23.0...sdk-v0.23.1) (2026-07-07)

### Bug Fixes

- **sdk:** rewrite extensionless relative imports in the published dist ([#181](https://github.com/silo-code/silo/issues/181)) ([4f910ae](https://github.com/silo-code/silo/commit/4f910aefae3f90256800fab537f8a94b1c519d92))

## [0.23.0](https://github.com/silo-code/silo/compare/sdk-v0.22.0...sdk-v0.23.0) (2026-07-06)

### Features

- **sdk:** add ctx.terminals.subscribeOutput for raw PTY output access ([#174](https://github.com/silo-code/silo/issues/174)) ([8a16a9e](https://github.com/silo-code/silo/commit/8a16a9e4b1f4fab61af6d5feefcee168c7a6d461))

## [0.22.0](https://github.com/silo-code/silo/compare/sdk-v0.21.0...sdk-v0.22.0) (2026-07-05)

### Features

- **sdk:** add non-breaking Part B surface (docs, terminal, fs, exec, search, net) ([#168](https://github.com/silo-code/silo/issues/168)) ([ec2ab1c](https://github.com/silo-code/silo/commit/ec2ab1c1ee0c9daafbfa93b97a20d839989a7e49))

## [0.21.0](https://github.com/silo-code/silo/compare/sdk-v0.20.0...sdk-v0.21.0) (2026-07-02)

### Features

- **sdk:** breaking-change cleanup batch + active-terminal tracking ([#161](https://github.com/silo-code/silo/issues/161)) ([421ea20](https://github.com/silo-code/silo/commit/421ea20897e551a7898a057599c4b56954fef586))

## [0.20.0](https://github.com/silo-code/silo/compare/sdk-v0.19.1...sdk-v0.20.0) (2026-06-29)

### Features

- **output:** add Output panel with ctx.log API and grouped channel selector ([#142](https://github.com/silo-code/silo/issues/142)) ([52d1848](https://github.com/silo-code/silo/commit/52d184872c00b165ce8cc94297f5bedb80ada839))

## [0.19.1](https://github.com/silo-code/silo/compare/sdk-v0.19.0...sdk-v0.19.1) (2026-06-29)

### Bug Fixes

- **focus:** restore correct panel focus and cursor position on workspace switch ([#137](https://github.com/silo-code/silo/issues/137)) ([b33b918](https://github.com/silo-code/silo/commit/b33b9185ffa26e6eaa6570227dc887a95b30c370))

## [0.19.0](https://github.com/silo-code/silo/compare/sdk-v0.18.0...sdk-v0.19.0) (2026-06-28)

### Features

- add Help menu with About, Updates, and links on all platforms ([#132](https://github.com/silo-code/silo/issues/132)) ([5198393](https://github.com/silo-code/silo/commit/519839313a88113eccea1cbff43881e4dde73237))
- store left/right panel collapse state per workspace ([#136](https://github.com/silo-code/silo/issues/136)) ([66b8645](https://github.com/silo-code/silo/commit/66b86457f2153b65c6bf9e401060986583ee1746))

## [0.18.0](https://github.com/silo-code/silo/compare/sdk-v0.17.0...sdk-v0.18.0) (2026-06-28)

### Features

- add ctx.system (OS, arch, Silo version) to extension context ([#127](https://github.com/silo-code/silo/issues/127)) ([9ac6e32](https://github.com/silo-code/silo/commit/9ac6e3212605237e111d88405c17d9a3460d2836))

## [0.17.0](https://github.com/silo-code/silo/compare/sdk-v0.16.0...sdk-v0.17.0) (2026-06-28)

### Features

- add ctx.processes (workspace process observability) ([#124](https://github.com/silo-code/silo/issues/124)) ([0565004](https://github.com/silo-code/silo/commit/056500428ec47b2a68bbb614e082b82c6bb355f3))
- make side-panel visibility per-workspace ([#121](https://github.com/silo-code/silo/issues/121)) ([1836be5](https://github.com/silo-code/silo/commit/1836be518052db11e40838f7b22e57b8b087b8d9))

## [0.16.0](https://github.com/silo-code/silo/compare/sdk-v0.15.0...sdk-v0.16.0) (2026-06-28)

### Features

- add ctx.storage (global + workspace scopes) ([#118](https://github.com/silo-code/silo/issues/118)) ([7dc8122](https://github.com/silo-code/silo/commit/7dc81225b69df709d565824c1c2af826878a010c))

## [0.15.0](https://github.com/silo-code/silo/compare/sdk-v0.14.0...sdk-v0.15.0) (2026-06-26)

### Features

- **workspaces:** add extension badge API, replace uptime with badges ([#102](https://github.com/silo-code/silo/issues/102)) ([e8ab637](https://github.com/silo-code/silo/commit/e8ab6375240278dcc6b6f6fe169f96dde4eafcd7))

## [0.14.0](https://github.com/silo-code/silo/compare/sdk-v0.13.0...sdk-v0.14.0) (2026-06-26)

### Features

- **terminal:** auto-recover terminals after reboot with buffer replay ([#98](https://github.com/silo-code/silo/issues/98)) ([b3a25ee](https://github.com/silo-code/silo/commit/b3a25ee2ff517f8f3cc0ca14b9b07b52f0969abe))

## [0.13.0](https://github.com/silo-code/silo/compare/sdk-v0.12.0...sdk-v0.13.0) (2026-06-25)

### Features

- **workspaces:** add registerSection API for extension-contributed workspace row components ([#95](https://github.com/silo-code/silo/issues/95)) ([2c42024](https://github.com/silo-code/silo/commit/2c42024712d8c1a5506f27369393453ea5bbfb27))

## [0.12.0](https://github.com/silo-code/silo/compare/sdk-v0.11.0...sdk-v0.12.0) (2026-06-25)

### Features

- **terminal-monitor:** auto-detect agent status via OSC sequences ([#89](https://github.com/silo-code/silo/issues/89)) ([ec80887](https://github.com/silo-code/silo/commit/ec80887dba5a669682d7b3b67e0debd4245f59db))

## [0.11.0](https://github.com/silo-code/silo/compare/sdk-v0.10.1...sdk-v0.11.0) (2026-06-24)

### Features

- **search:** multi-folder workspace search ([#80](https://github.com/silo-code/silo/issues/80)) ([8d5c588](https://github.com/silo-code/silo/commit/8d5c588cc5cc3c523008085c1467bd4724421c9b))

## [0.10.1](https://github.com/silo-code/silo/compare/sdk-v0.10.0...sdk-v0.10.1) (2026-06-23)

### Bug Fixes

- **layout:** remove 36px titlebar gap on Linux and Windows ([#72](https://github.com/silo-code/silo/issues/72)) ([00f51ed](https://github.com/silo-code/silo/commit/00f51ed442c0eb49ffa4ceabf00ba016cc4f7d40))

## [0.10.0](https://github.com/silo-code/silo/compare/sdk-v0.9.0...sdk-v0.10.0) (2026-06-23)

### Features

- **sdk:** workspace & terminal decoration APIs + terminal-monitor example ([#70](https://github.com/silo-code/silo/issues/70)) ([910e8a4](https://github.com/silo-code/silo/commit/910e8a40d68551eef7c2595e37d8cdc49d76aeb3))
- **settings:** move Keyboard Shortcuts to first in settings rail ([#71](https://github.com/silo-code/silo/issues/71)) ([bd6cd62](https://github.com/silo-code/silo/commit/bd6cd6204d16afc9cdccfc8e9dea7caad198e72c))

## [0.9.0](https://github.com/silo-code/silo/compare/sdk-v0.8.0...sdk-v0.9.0) (2026-06-21)

### Features

- **extensions:** add Built-in badge to extension list items ([#63](https://github.com/silo-code/silo/issues/63)) ([36ffb6a](https://github.com/silo-code/silo/commit/36ffb6aa7f33a3d0f955db6792ddc1f5273e0486))
- **extensions:** list first-party built-ins (branded, disable-only) ([13f5ee7](https://github.com/silo-code/silo/commit/13f5ee742e7a79f37c6f5795109e57bdfa65ef64))
- **layout:** make side-dock visibility and widths global, not per-workspace ([#7](https://github.com/silo-code/silo/issues/7)) ([6daa05f](https://github.com/silo-code/silo/commit/6daa05fe66c0b8904e45ea18832cab2c9cfda39e))
- **sdk:** promote Tooltip to public SDK surface (0.7.0) ([#58](https://github.com/silo-code/silo/issues/58)) ([042dedc](https://github.com/silo-code/silo/commit/042dedc2ff2fe1912c8cc26c6608b1191804f9a5))
- **search:** file-search side panel + ctx.search ([#29](https://github.com/silo-code/silo/issues/29)) ([184ae98](https://github.com/silo-code/silo/commit/184ae986cb5ae42c65f196bc76c77bebeb4d9ad4))
- **statusbar:** custom tooltips on all status bar items + kbd-badge accelerators ([#37](https://github.com/silo-code/silo/issues/37)) ([bef147b](https://github.com/silo-code/silo/commit/bef147b6f77516f449aef3b28d2746bed56294b4))
- **web-viewer:** local web viewer extension + ctx.net HTTP client ([#61](https://github.com/silo-code/silo/issues/61)) ([319a31c](https://github.com/silo-code/silo/commit/319a31c051b0220c7543c29cc56162f9e04e8495))

### Bug Fixes

- **docs:** update documentation links to silo.dev and improve pre-commit pnpm resolution ([#4](https://github.com/silo-code/silo/issues/4)) ([b280ce3](https://github.com/silo-code/silo/commit/b280ce38b1e196b011afd964d24da351376fd542))

## 0.6.0

### Minor Changes

- 33c28ed: First publishable release of the public extension SDK. `@silo-code/sdk` now ships
  a real build (`dist/` with JS + bundled `.d.ts` declarations) so external
  extension authors can `npm i -D @silo-code/sdk` and compile against the types,
  with the example extensions consuming it as a real dependency.
