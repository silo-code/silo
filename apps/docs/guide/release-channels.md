# Release channels

Silo ships two channels: **Stable** and **Nightly**. You can install both on
the same machine and run them side-by-side — they are completely separate
applications and share no data by default.

## Stable

The default. Stable releases go through the full release cycle — conventional
commits feed a version-bump PR, maintainers review and merge it, and the tag
triggers a signed build. New stable releases land roughly monthly.

Download from the [GitHub Releases](https://github.com/silo-code/silo/releases/latest) page.

## Nightly

Built automatically from `main` every day at 3am UTC. Nightly is for developers
and early adopters who want the latest features before they reach stable — it
may be unstable or contain incomplete work.

- **App name:** Silo Nightly
- **Version format:** `0.x.y-nightly.YYYYMMDD.githash`
- **macOS identifier:** `com.silo.desktop.nightly` (separate `.app`, separate Spotlight entry)
- **Data directory:** `~/.config/silo-nightly/` (isolated from stable's `~/.config/silo/`)
- **Updater:** nightly checks for nightly updates — it will never update you to a stable release

Download the latest nightly from the
[nightly release](https://github.com/silo-code/silo/releases/tag/nightly).

## Data isolation

The two channels are fully isolated by default. Settings, workspaces, themes,
keybindings, and terminal sessions in stable are not visible in nightly, and
vice versa.

| Resource | Stable | Nightly |
|---|---|---|
| Config (workspaces, settings) | `~/.config/silo/` | `~/.config/silo-nightly/` |
| App state (terminal sessions) | `~/Library/Application Support/com.silo.desktop/` | `~/Library/Application Support/com.silo.desktop.nightly/` |
| Updates | Monthly stable releases | Daily nightly builds |

## Sharing workspaces between channels

If you regularly switch between stable and nightly and don't want to maintain two
separate workspace lists, you can point nightly at stable's config directory:

```sh
SILO_CONFIG_DIR=~/.config/silo /Applications/Silo\ Nightly.app/Contents/MacOS/Silo\ Nightly
```

When `SILO_CONFIG_DIR` is set, nightly reads and writes workspaces, themes, and
keybindings from that path instead of its own. Terminal sessions remain separate
regardless — nightly sessions never appear in stable.

::: warning
Use this only if you understand the risk: a nightly build that ships a
workspace-schema change will upgrade the config files that stable also reads.
This is safe for most day-to-day use but could cause stable to behave
unexpectedly if a nightly build introduces an incompatible change.
:::

## Reporting nightly issues

When filing a bug against a nightly build, include the full version string
(`Silo Nightly > About` or `silo --version`) — the `nightly.YYYYMMDD.githash`
suffix pins the exact commit so maintainers can reproduce it.
