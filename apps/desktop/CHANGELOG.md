# Changelog

## [0.6.0](https://github.com/silo-code/silo/compare/silo-v0.5.0...silo-v0.6.0) (2026-06-05)


### Features

* monorepo migration — pnpm workspace, @silo-code/* packages, app → apps/desktop ([#13](https://github.com/silo-code/silo/issues/13)) ([34f35b1](https://github.com/silo-code/silo/commit/34f35b10ecab7ad5734d2080ee30d626375ba119))

## [0.5.0](https://github.com/silo-code/silo/compare/silo-v0.4.0...silo-v0.5.0) (2026-06-04)


### Features

* **extensions:** runtime third-party extension install/load + manager UI ([ccc591d](https://github.com/silo-code/silo/commit/ccc591dc26cc9b050ca197bb97f37a2d84b0356f))
* **keybindings:** render shortcuts as text abbreviations ([04bd7a0](https://github.com/silo-code/silo/commit/04bd7a06c45764c6b8b220df03da2b0244a20e31))
* **keyboard:** dock/area focus navigation and scoped tab cycling ([5d142d6](https://github.com/silo-code/silo/commit/5d142d6aa12845117befa07a9e9ad7c1c9b42ead))
* **statusbar:** enlarge status bar text, icons, and height ([faf19c2](https://github.com/silo-code/silo/commit/faf19c25961a78b78604de16fd0a4e1c28f80946))
* **terminal:** reflect OSC title sequences in the tab name ([538926e](https://github.com/silo-code/silo/commit/538926e242b2f1ce8197dc8a999bcc499dca4dc5))
* **workspaces:** cmd+tab-style switcher popup for workspace cycling ([199849e](https://github.com/silo-code/silo/commit/199849e85f4ffe17d64c2c638be27751757dac2e))
* **workspaces:** render cycle popup bottom-up so Cmd+` walks the highlight upward ([ad61520](https://github.com/silo-code/silo/commit/ad6152086bdef49596840625135d4991e6ce685c))


### Bug Fixes

* **extensions:** validate manifest id/main to prevent path traversal ([65d2b93](https://github.com/silo-code/silo/commit/65d2b935c117441a5c8f0c8a4fbe3fef511faac9))
* **file-explorer:** reload expanded folders on fs change via live ref ([7f771c4](https://github.com/silo-code/silo/commit/7f771c497d28821cda3d507146f84943bbdc66c9))

## [0.4.0](https://github.com/silo-code/silo/compare/silo-v0.3.0...silo-v0.4.0) (2026-06-03)


### Features

* **about:** use Silo brand icon + workspace-driven slogan ([f39be3f](https://github.com/silo-code/silo/commit/f39be3f66941119b312f8d59d6ea8d803c21f9fc))
* **automation:** faithful ctx.terminals paths in the dev bridge ([a5367d4](https://github.com/silo-code/silo/commit/a5367d4c7417bba5f60a151a7f30863d95e7d585))
* **core.about:** move about to core tier on @silo-code/sdk/internal (silo 6→5) ([37a5cbe](https://github.com/silo-code/silo/commit/37a5cbe097dcb67db9d8e897ab7fcbf112e52da3))
* **ctx.dnd:** first-class drag-and-drop primitive; file-explorer → 0 ([be156e6](https://github.com/silo-code/silo/commit/be156e6b2e1733b9bda12f8337bc999c3f7d9025))
* **ctx.ui:** ship slice 1 — native pickers + notify toasts ([fb1a9a1](https://github.com/silo-code/silo/commit/fb1a9a17026a8bf2cd87a6486203121f49e45260))
* **extensions:** two-barrel SDK + two-track allowlist ratchet ([bd637ec](https://github.com/silo-code/silo/commit/bd637ecc6fbfa9920c38ff241718527541123848))
* **menu:** cascading submenus + workspace add-menu ([8663700](https://github.com/silo-code/silo/commit/8663700ccda0eb3d33b156de21e0ef784625bcc6))
* **menus:** unify every menu on one themeable ctx.ui.showMenu primitive ([f68232f](https://github.com/silo-code/silo/commit/f68232fd8b71f18ca2c8240a6fa94178f3e1438c))
* **modals:** host-owned modal system (ctx.ui.confirm/prompt + SDK &lt;Modal&gt;) ([0df770a](https://github.com/silo-code/silo/commit/0df770a36079ee2c2dce47ebc0d2069688cb4b06))
* **sdk:** useServiceState + WorkspaceService.get; converge reactive reads ([1f8525c](https://github.com/silo-code/silo/commit/1f8525cbd88eda63fc46be02daf54de42de44510))
* **terminal:** add ctx.terminals; terminal is a core DockKind like the editor ([4c9c46c](https://github.com/silo-code/silo/commit/4c9c46ca04b62e933e22cc3a3987f59927a963ee))
* **terminal:** rename a terminal via right-click on its tab ([5c2cbb0](https://github.com/silo-code/silo/commit/5c2cbb0fb31d707be4d32ff174cebf66461d8689))
* **theme:** darken dark-theme status bars for panel contrast ([bef624f](https://github.com/silo-code/silo/commit/bef624fe1a937c421d0011a33504c648b24ba949))
* **theme:** enforce Tier A in extension CSS + ship token docs ([c499967](https://github.com/silo-code/silo/commit/c499967409bc79e516c6be2d43fcb21d4b7b0c2e))
* **theme:** themeable status-bar hover (--silo-statusbar-bg-hover) ([d0b02d5](https://github.com/silo-code/silo/commit/d0b02d5233d8117ce5d8dd9605b28b590622995d))
* **ui:** global silo-button system, workspace status item, modal plan ([b829331](https://github.com/silo-code/silo/commit/b8293313f7f241c9a6161439b225ef455fe8f358))


### Bug Fixes

* **ci:** pass -R to gh in release trigger so it works without a checkout ([e7ed63b](https://github.com/silo-code/silo/commit/e7ed63b459a0b0d1e14a04f7185641b9d14c06ba))
* **ci:** pass -R to gh in release trigger so it works without a checkout ([#8](https://github.com/silo-code/silo/issues/8)) ([2216359](https://github.com/silo-code/silo/commit/221635991c378c57469c3f51f103d1d2dc169f38))
* **editor:** fold diff into core.editor as a mode ([#4](https://github.com/silo-code/silo/issues/4)) ([#10](https://github.com/silo-code/silo/issues/10)) ([7422336](https://github.com/silo-code/silo/commit/74223362d4a53be74fa8a2181582d29aed2e2be5))
* **editor:** keep right-click menu open when editor was unfocused ([ac1ab6d](https://github.com/silo-code/silo/commit/ac1ab6d937d91c892fa94be4bc970059ac0e3cd3))
* **editor:** live-update open diff tabs when the file changes on disk ([0240e3f](https://github.com/silo-code/silo/commit/0240e3f55181a9b3032aaa62c1ba7084161084fd))

## [0.3.0](https://github.com/silo-code/silo/compare/silo-v0.2.0...silo-v0.3.0) (2026-06-02)


### Features

* **automation:** add dev screenshot RPC op for visual verification ([45c5a8c](https://github.com/silo-code/silo/commit/45c5a8c91d077645109bee1402752d6b8b571d0c))
* **automation:** add showSidePanel op + eval client + fs-watch it-tests ([e44877f](https://github.com/silo-code/silo/commit/e44877f37aa16460f52657f10ab213452dd3b5bb))
* **diff:** add breadcrumb bar to the diff viewer ([694c5b6](https://github.com/silo-code/silo/commit/694c5b67609426c87d972535888346cefdbe7c1e))
* **extensions:** add ctx.files filesystem primitive ([5e24f8b](https://github.com/silo-code/silo/commit/5e24f8b807ddb7dd5d0bde5a933e8a2317e72485))
* **extensions:** add ctx.theme + registerThemePreset; themes become a contribution point ([1d66970](https://github.com/silo-code/silo/commit/1d66970ea0c5f0fe78908509593b77e53e7ac5fe))
* **process:** add ctx.process.exec one-shot subprocess primitive ([6dc3cd6](https://github.com/silo-code/silo/commit/6dc3cd611ddd1ea6d62f640c8d5c2c6555355b60))
* **sdk:** add @silo-code/sdk path alias for the public extension surface ([17d014e](https://github.com/silo-code/silo/commit/17d014ed65147e324fbf3f68602bc48b899873df))
* **workspaces:** add macOS cmd+tab-style workspace cycling ([d57fccd](https://github.com/silo-code/silo/commit/d57fccd2b421e7177bfe9418b381d8ee5815a605))


### Bug Fixes

* **automation:** gate the dev RPC by request guard, drop the env switch ([1428f8f](https://github.com/silo-code/silo/commit/1428f8f2e10789c642bef0d605ad6ae5ad258f22))
* **editor:** diff font now matches the text editor (converge the per-surface delta) ([245c8ba](https://github.com/silo-code/silo/commit/245c8babc14b466a4a340fb708d79f34301cfc14))
* **focus:** robust editor/terminal focus handoff + dev automation test layer ([591f904](https://github.com/silo-code/silo/commit/591f904228bc59346e383408afc0ed2bcbc8d9fc))
* **keybindings:** surface registerKeybinding defaults in the shortcuts UI ([007728b](https://github.com/silo-code/silo/commit/007728b95973ac44bd44f6aa9ee7fbca09a5fbf2))
* **theme:** route automation bridge through ensureMonaco to unify the monaco instance ([5213985](https://github.com/silo-code/silo/commit/52139851eadc5ec76065828405671c06ad97bbfc))
* **ui:** add hover and active feedback for tab close buttons ([d4b3f17](https://github.com/silo-code/silo/commit/d4b3f171efa784e8cc0e6ba4ce0c7dde7d5b8603))
* **ui:** align vertical split divider flush with the lower panel ([926691e](https://github.com/silo-code/silo/commit/926691ee6e5bf3235b7142c190109fde821957de))
* **ui:** bump Empty Workspace watermark font sizes ([b4bf7fa](https://github.com/silo-code/silo/commit/b4bf7faa8ff362c719442adc815c326db883c27b))


### Performance Improvements

* **extensions:** ref-count ctx.files watchers by path ([9a26e0e](https://github.com/silo-code/silo/commit/9a26e0e34908a155f6998a10a1471d3c76a43daa))

## [0.2.0](https://github.com/silo-code/silo/compare/silo-v0.1.0...silo-v0.2.0) (2026-05-31)


### Features

* cmd-click file paths in terminal to open in editor ([85a2499](https://github.com/silo-code/silo/commit/85a24997f5fd9b659761010bf0e248122c2a1688))
* **config:** user-editable config under ~/.config/silo ([2880345](https://github.com/silo-code/silo/commit/2880345db6dc2adba0ef075066e13185813c4821))
* core-menu extension + when-clause scoping ([4d3f2a2](https://github.com/silo-code/silo/commit/4d3f2a2b58cec669325792b3201adf723afe63a2))
* **dist:** installable + auto-updatable app, dev/stable split, release pipeline ([63df7da](https://github.com/silo-code/silo/commit/63df7dafd7ed8ed918452c391c78c817a96044fc))
* dock panel kinds as extensions (terminal, editor, diff) ([8845e74](https://github.com/silo-code/silo/commit/8845e7404054b13f6afc6e5c6bf78c19c9433436))
* drag to reorder workspace rows ([27a6b21](https://github.com/silo-code/silo/commit/27a6b21e04180a60bb077b154057a8b73132a407))
* drag-and-drop files from explorer into editor/terminal panes ([35b6a90](https://github.com/silo-code/silo/commit/35b6a9017ccd142aee61e9c1ffb1d114b654b226))
* extension storage API + UI state persistence ([4ba2f4c](https://github.com/silo-code/silo/commit/4ba2f4cb1ea3c3feb77042fe28f70e320415d75e))
* extension system foundation — viewers, commands, menus ([7a793c6](https://github.com/silo-code/silo/commit/7a793c61d6f1dcdeed35a9af70e9b55ede3bebef))
* **extensions:** add ctx.editors; relocate open* off ctx.workspaces ([44885c6](https://github.com/silo-code/silo/commit/44885c60a2bb3028999c60f7ad8594c34f2c9a2a))
* **extensions:** ctx.process + the inter-extension API mechanism ([43cb5c9](https://github.com/silo-code/silo/commit/43cb5c9123fb556b0516ec2b75da60d1195418b4))
* **extensions:** file-type registry and untitled buffer routing ([3cf486d](https://github.com/silo-code/silo/commit/3cf486d007be76a317184fcb7e942f798a323723))
* **extensions:** keymap foundation — keybindings.json overrides + unified dispatch ([f5b5af5](https://github.com/silo-code/silo/commit/f5b5af5c68212bd3d9de361e56efa3df610e15fc))
* **extensions:** status-item + layout SDK; panel toggles as an extension ([6326852](https://github.com/silo-code/silo/commit/6326852044f78968bbfaa826a05c6ccc8a009189))
* **extensions:** workspace.openFile entry point; theme selector as a status item ([08fde16](https://github.com/silo-code/silo/commit/08fde160a5757faf9b6e828cf152e8d4a3226296))
* file explorer with context menus, keyboard nav, and drag-drop ([3cd01b0](https://github.com/silo-code/silo/commit/3cd01b02783977574558ea399d632c2bf899190f))
* file path breadcrumb above editors ([2488d94](https://github.com/silo-code/silo/commit/2488d9403aa180ff813bfaaf86d54cf07dd7863f))
* git push button in the git panel ([8253978](https://github.com/silo-code/silo/commit/8253978537e8b0c1020a8479cb84372348c28f86))
* hover-reveal overlay scrollbar for side panels ([d9bf534](https://github.com/silo-code/silo/commit/d9bf5349d17c1b5fb5b0d4ecd9e5bac42036bf8c))
* middle-click to close editor tabs (XerroTab) ([bc1871c](https://github.com/silo-code/silo/commit/bc1871cc3177f538b9d4492696a7624a3b4bfba4))
* mirror tmux status line into terminal tab title ([abb1ebf](https://github.com/silo-code/silo/commit/abb1ebf2feb66c6b497d0303a2ea683e10f29bee))
* multi-folder workspaces ([a07c995](https://github.com/silo-code/silo/commit/a07c9957a0c641313a7bb4bcf09fffa55633a1b0))
* open new files in a file group, not the focused terminal ([61a9d37](https://github.com/silo-code/silo/commit/61a9d379e310b5d01d5825801aecfd3bc489af08))
* persist file tree expanded state across restarts ([f68b208](https://github.com/silo-code/silo/commit/f68b208be550ea4c68f911fa506969f0ccc10ad5))
* persist side panel state per workspace ([69d348a](https://github.com/silo-code/silo/commit/69d348aa97a1916b05ed2c0f904c4417d88d8676))
* preview tabs (VS Code-style single-click open) ([b90cfe0](https://github.com/silo-code/silo/commit/b90cfe077d5749384add277032dc0c86846ab247))
* reload editor when open file changes on disk ([4e8d9f6](https://github.com/silo-code/silo/commit/4e8d9f6394fa512e8569a74f8c4c93207e2ecffd))
* semantic theme variable system with custom theme editor ([827e8bf](https://github.com/silo-code/silo/commit/827e8bfd1b61e3678c633a2ac6aa0427a5fbf25a))
* **settings:** add an "About Silo" settings page ([904aaf6](https://github.com/silo-code/silo/commit/904aaf6dc7f904cd67baf378b140467dc840daf2))
* **settings:** add global Editor (Monaco) settings panel ([8a1eb08](https://github.com/silo-code/silo/commit/8a1eb080a86265c25a361e6eb16237364f767985))
* **settings:** Keyboard Shortcuts settings page ([d03e70b](https://github.com/silo-code/silo/commit/d03e70bccad40a61be79d3d67b952a59ea21334c))
* **settings:** modal Settings shell + registerSettingsPage contribution point ([ce8e9cf](https://github.com/silo-code/silo/commit/ce8e9cf0efcd9def4f447e364e99838505585355))
* shift-to-paste mode for file and tab drags ([3be0edb](https://github.com/silo-code/silo/commit/3be0edbe2b8363408b1897a0b2b6d59212ac94c3))
* show terminal status under workspace name ([3bbf559](https://github.com/silo-code/silo/commit/3bbf559978f992f5b7d79dd0a341452726f1db2b))
* show workspace age and parent path in workspace list ([32e4cc3](https://github.com/silo-code/silo/commit/32e4cc30514e92df2d532d6ac1e13696b835d7a5))
* side panel tab drag-to-reorder, cross-column drag, and vertical split ([f877249](https://github.com/silo-code/silo/commit/f8772490030f51ef4f1dcdb269b5f6a28d43b305))
* side-panel contribution point, both columns now tabbed ([feb1433](https://github.com/silo-code/silo/commit/feb143386d28a88c329c9b1e8d4fa890fd75a98f))
* **terminal:** enable Kitty Keyboard Protocol for modifier key support ([1afba70](https://github.com/silo-code/silo/commit/1afba70c120fac8da8fbe9dd569164a6f0a05012))
* **terminal:** persistent session handles, signal-kill, liveness detection ([477d355](https://github.com/silo-code/silo/commit/477d355047369e2f2c3e98f18bfa35d8204ef33a))
* **terminal:** remove debug logging from TauriTerminalClient ([9bced84](https://github.com/silo-code/silo/commit/9bced845ff6b826f3fc87dc7667795d91beed34c))
* **terminal:** standalone Tauri backend with portable-pty + abduco ([466522a](https://github.com/silo-code/silo/commit/466522a932dc2cb548de135b090677e93c6d64d1))
* **terminal:** standalone terminals with persistent scrollback ([dc5b962](https://github.com/silo-code/silo/commit/dc5b9626a52e2b8e74dde5ad6c8612138eae3e03))
* **terminal:** swap TerminalPanel transport to Tauri invoke + tauriTerminalClient ([6ed5af7](https://github.com/silo-code/silo/commit/6ed5af70ddd178d510c7b47a228c2de0e5a2ad8b))
* unified HTML context menus across terminal, workspaces, and tab bar ([05819ae](https://github.com/silo-code/silo/commit/05819ae6e2c7c247a5b776e90f88e461fe2ddf3c))
* untitled buffers, workspace icon, empty-state actions ([7686c5d](https://github.com/silo-code/silo/commit/7686c5de89151cd30c76d46ef9088cfe638bcb5d))


### Bug Fixes

* call deleteTerminal on panel unmount to clean up sessions ([3d6dfcc](https://github.com/silo-code/silo/commit/3d6dfcc341d5ecc172459fc2b845912394eb861e))
* center empty workspace screen and style action links ([8e07e2c](https://github.com/silo-code/silo/commit/8e07e2c9c26c7cb68f890ed48bba4767a014c9a0))
* **config:** create ~/.config/silo via Rust-backed fs (plugin-fs scope can't see dotdirs) ([3db12c2](https://github.com/silo-code/silo/commit/3db12c27d46916733f0180353496fb9259eaec0c))
* connect back to abduco session and send exit to kill it ([8d3b418](https://github.com/silo-code/silo/commit/8d3b4181207ecdc27c28898bfb0e681b18ac09fc))
* detect abduco by file existence instead of --version ([6077352](https://github.com/silo-code/silo/commit/6077352c34f1063c6af4e1265d371bf04ca27530))
* **editor:** tame Monaco diagnostics and hide broken semantic actions ([813da9f](https://github.com/silo-code/silo/commit/813da9fe31bcd761f89fa9ecb457bd8c120f529c))
* **file-explorer:** disable input autocapitalize and add empty-area context menu ([7716a83](https://github.com/silo-code/silo/commit/7716a83426636c7e5160ef0fe3a12268a088a8fb))
* **git-explorer:** move collapsed hook above early return ([768b629](https://github.com/silo-code/silo/commit/768b6291b0c53c89d4ac7a5ba9979a3a619aa51c))
* **git-explorer:** section header is a div, not a nested button ([73eda40](https://github.com/silo-code/silo/commit/73eda40a6f708c4a7b5c55c2cf02927680dd8133))
* import Emitter trait for emit method ([6446b41](https://github.com/silo-code/silo/commit/6446b41b5cce025f86b61967f0e877822c7dff8e))
* improve theme swatch color accuracy in status bar ([773d13d](https://github.com/silo-code/silo/commit/773d13daf5e8e94a84b831cc9bcaf6338dd78f61))
* make main window draggable from the top strip ([3ee3cbe](https://github.com/silo-code/silo/commit/3ee3cbe23048cd2b8153d1c4dc7548b3f9681759))
* **menus:** dismiss context menus on first outside click ([ff3381c](https://github.com/silo-code/silo/commit/ff3381c9a677e969fe5d40e8d599f820f1cfef8b))
* prevent drag interruption during panel resize ([98f79c5](https://github.com/silo-code/silo/commit/98f79c513f6fbfe4962acea8cff679a9c58c97a3))
* properly kill abduco sessions on terminal delete ([de4a379](https://github.com/silo-code/silo/commit/de4a3796967be7a74940221b10f7bcdf21bd6766))
* remove invalid abduco -k flag (abduco has no kill option) ([5cedafe](https://github.com/silo-code/silo/commit/5cedafeaa441e151d686e53dcaa3af81f525c3a9))
* render dirty-tab indicator as a styled span ([3c06314](https://github.com/silo-code/silo/commit/3c06314e44f6219d2640f617e417414b645d75af))
* replace HTML5 DnD with pointer events for side panel tab dragging ([16cd5c1](https://github.com/silo-code/silo/commit/16cd5c105c81bb044f2cbbff0d80339c9ad35531))
* route Cmd+S through menu accelerator, not Monaco command ([e8bf6c1](https://github.com/silo-code/silo/commit/e8bf6c1aab5119c981c6ed460ff23bccac8799d0))
* send Ctrl+D (EOF) to properly terminate shell on kill ([205138a](https://github.com/silo-code/silo/commit/205138a3eee2c3bcc345c20b69efd9af1d2557d8))
* **settings:** reserve right gutter so page content clears the close button ([e574fee](https://github.com/silo-code/silo/commit/e574feeefb60d9c7109db9c8a3b33f183164abfa))
* **settings:** use real theme tokens so the modal is opaque ([7384733](https://github.com/silo-code/silo/commit/73847334682236e4b179219041df6c0932f5002d))
* show drag border full height for left panel resize handle ([ffde18f](https://github.com/silo-code/silo/commit/ffde18fecf1b871f1df6aa56b9076e1f89ed2650))
* show spinner during git refresh and push ([db0fc24](https://github.com/silo-code/silo/commit/db0fc249f83f07c3726e079bd0645bf24f3a6f7e))
* **tabs:** repair dirty indicator styling and route dirty state through panel params ([5954b3a](https://github.com/silo-code/silo/commit/5954b3a7b72cbdcd4fde93a727179d7e7e7a2445))
* **terminal:** auto-resize on both create and restore ([6d413d6](https://github.com/silo-code/silo/commit/6d413d66a3602e87f4f1240e1d64f3b5696de8b6))
* **terminal:** auto-resize terminal on initialization for proper Claude Code rendering ([ac3331a](https://github.com/silo-code/silo/commit/ac3331aefb8415380da9985e1fa8f937e1a41feb))
* **terminal:** implement terminal_resize to send SIGWINCH to shell ([8612076](https://github.com/silo-code/silo/commit/8612076dd5d0d192852c48bda84a72d3a0e4a12b))
* **terminal:** intercept Shift+Enter at keyboard level and send ESC+newline ([d0b56c5](https://github.com/silo-code/silo/commit/d0b56c5bbb037e293f8ea246a87b173f51d7440b))
* **terminal:** keep sessions off abduco's alt screen so restore is stable ([2c4868b](https://github.com/silo-code/silo/commit/2c4868bb1e0d1bedac3356f196bf9c3307e94888))
* **terminal:** make Shift+Enter send ESC+newline like Alt+Enter does ([1d9f407](https://github.com/silo-code/silo/commit/1d9f4072ad8dc77c10e6afa4472e7d7a9d470661))
* **terminal:** move keyboard handler inside init where sessionId is available ([b98ff1e](https://github.com/silo-code/silo/commit/b98ff1e55244f60b1a19d8aa86e6101dcfd91bd0))
* **terminal:** replace Channel with emit for Tauri v2 IPC ([0920701](https://github.com/silo-code/silo/commit/09207017b2079cd6111fb0fcf47ff2fa60cc1cc5))
* **terminal:** restore reader/writer fields for I/O, keep master for resize ([b27f108](https://github.com/silo-code/silo/commit/b27f108f193ea0819502a1cb31584269245ff8e4))
* **terminal:** send only ESC for Shift+Enter, let xterm send newline ([a2a8978](https://github.com/silo-code/silo/commit/a2a89781501e1c46def21d3c2c5d8d66567d11cb))
* use camelCase parameter names for Tauri v2 IPC ([8c1ea46](https://github.com/silo-code/silo/commit/8c1ea46121c70a7c0b34791ba928850e57437cb9))
* use cwd parameter when spawning terminal ([e31e3b3](https://github.com/silo-code/silo/commit/e31e3b348fc5a555cb859c0d085cec9f3b6e0566))
