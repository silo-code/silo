---
status: accepted
date: 2026-06-10
---

# 0022. On-disk storage layout: a three-tier config / app-state / runtime split

## Context

Silo writes several kinds of state to disk, and they had drifted across unrelated
roots with no stated rule: workspaces + global prefs in a single `app-state.json`
under the Tauri app-data dir; themes and keybindings under `~/.config/silo`; the
terminal session registry, scrollback buffers, and backend log in a legacy
`~/.app-editor` dotfile (since moved to the app-data dir); and PTY-host sockets
under `~/.config/silo/pty`. Going open source, where these live — and whether a
user can find, hand-edit, and back them up — is a public surface that deserves a
rule, not ad-hoc placement.

The forces:

- Some state is **user data** the user should be able to read, edit, and copy
  (workspaces, keybindings, themes, installed extensions).
- Some state is **app-managed**: it should survive a restart but isn't meant to be
  edited (terminal session registry, buffers, logs).
- Some state is **purely ephemeral** — meaningless once the process/login ends —
  and has OS-specific placement constraints (Unix socket paths are length-capped).

Cutting across all three: a dev build and a production install must not collide —
not just for opaque runtime state, but for workspaces too, because a workspace's
terminal `sessionId`s only resolve against its own build-identity's session
registry. So **every tier is keyed by build identity**; "Silo Dev" is a fully
separate install on disk.

## Decision

Place each on-disk artifact in one of three tiers by its nature — **every tier
keyed by build identity**:

1. **Config (user data)** → `~/.config/silo` for the production identity
   (`com.silo.desktop`), `~/.config/silo-<suffix>` for any other build
   (`~/.config/silo-dev` for "Silo Dev", `com.silo.desktop.dev`). Hand-editable,
   human-readable, inspectable/backup-able. The single resolver (`userConfigDir`)
   is identity-keyed, so **everything beneath it splits per build**. _Workspaces
   (one JSON file per workspace), keybindings, themes, installed extensions._
2. **Persistent app-state** → the OS app-data dir keyed by bundle identifier
   (`~/Library/Application Support/com.silo.desktop[.dev]` on macOS); survives app
   restart; not for hand-editing. _Terminal session registry, scrollback buffers,
   backend logs._
3. **Ephemeral runtime** → the OS runtime/temp dir (`$XDG_RUNTIME_DIR` on Linux,
   `$TMPDIR` on macOS, `/tmp` failing both), namespaced per identity via
   `SILO_PTY_NS`; recreatable, cleared with the process/login, and short enough to
   keep Unix socket paths under `sockaddr_un`'s ~104-byte limit. _PTY-host sockets
   and per-session daemon logs._

## Consequences

- A clear home for every artifact, and a test for new ones: _is it user data,
  app state, or runtime?_
- Workspaces become inspectable / backup-able / copyable files alongside themes and
  keybindings. Keying the config root by identity means a dev build and a prod
  install never share a workspace, theme, keybinding, or extension — so a
  workspace's terminal `sessionId`s always line up with the same build's session
  registry (tier 2) and PTY namespace (tier 3). No cross-build clobbering of the
  shared file, no orphaned daemons, no two-writers race. The cost is that the
  builds don't share config (set your theme/keybindings once per build) — a fair
  trade, and config is plain files you can copy between roots if you want.
- The one-time migration from the old monolithic app-data blob runs **per
  identity**: each build reads its own app-data legacy blob (the same identity
  Tauri's store already used) into its own config root. Because the roots are
  separate, dev and prod migrate independently and never contend.
- Sockets gain a narrow loss case: a detached session left idle past the
  runtime-dir reap window won't reattach (the daemon process _is_ the session; the
  socket is only its reconnect address). This already matches the Linux
  `$XDG_RUNTIME_DIR` contract, so it unifies the two platforms rather than adding
  a macOS-only quirk.
- [0010](./0010-persistent-process-sessions.md)'s persistent process sessions
  (tier 2) are why the split has to reach tier 1: workspaces embed references to
  them, so workspaces must be keyed by the same identity.

## Alternatives considered

- **One root for everything** (all app-data, or all `~/.config/silo`) — rejected:
  app-data buries user data under an OS identifier path users can't find, while
  `~/.config/silo` is the wrong home for ephemeral sockets (long path risks the
  `sun_path` limit) and for per-identity-isolated runtime state.
- **Two tiers (config vs app-data), sockets in app-data** — rejected: the macOS
  app-data base is long enough to risk overflowing the Unix socket path limit, and
  sockets are genuinely a third, ephemeral kind of state.

## References

- [0010](./0010-persistent-process-sessions.md) — persistent process sessions (the
  tier-2 / tier-3 state this governs).
- Terminal runtime state moved out of the legacy `~/.app-editor` dotfile into the
  identity-keyed app-data dir (2026). The workspace-storage move to
  `~/.config/silo` and the PTY-host socket relocation to the runtime dir landed
  alongside this ADR. The PTY-host daemon design RFC covers tier-3 socket/daemon
  lifetime.
