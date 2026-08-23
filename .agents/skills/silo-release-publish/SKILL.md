---
name: silo-release-publish
description: Publish a drafted Silo app release on GitHub — verify the draft's assets, expand its notes to cover every unpublished version back to the last public one, flip it to public, and confirm the updater picks it up. Use when asked to publish/ship a release, "did we ever publish X", or when a release tweet or announcement needs to match what users can actually install.
tools: Bash, Read, Write
---

# Publishing a Silo release

Silo app releases land as **drafts** on purpose — a soak-test checkpoint before
they go public (see `apps/docs/guide/release-channels.md`). Publishing is a
separate, manual step, and it is the moment the release becomes real: GitHub's
"Latest" slot, the website download button, the docs download links, and every
existing install's auto-updater all follow `/releases/latest` immediately.

Because drafts accumulate silently, the version you're asked to publish is
often **not** one version ahead of what users are running. Always establish the
gap before writing notes.

> Package releases (`sdk-*`, `git-api-*`) are **pre-releases** and are published
> by CI. This skill is only for `silo-v*` app releases.

## 1. Establish the gap

```sh
gh release list --limit 10
gh api repos/silo-code/silo/releases --jq '.[] | select(.draft==false) | select(.tag_name|startswith("silo-")) | .tag_name' | head -3
```

The first published `silo-v*` tag is what users are actually on. Every draft
between it and the one you're publishing is a version whose changes ship
silently unless you fold them into the notes.

## 2. Verify the draft is complete

```sh
gh release view silo-vX.Y.Z --json name,isDraft,isPrerelease,tagName,assets \
  --jq '"draft:\(.isDraft) pre:\(.isPrerelease)", (.assets[] | "\(.name)  \(.size)  \(.state)")'
```

Do not publish unless **all** of these are present and `uploaded`:

- `latest.json` — the updater manifest
- macOS: `Silo_X.Y.Z_aarch64.dmg`, `Silo_X.Y.Z_x64.dmg`, `Silo_aarch64.app.tar.gz`(+`.sig`), `Silo_x64.app.tar.gz`(+`.sig`)
- Windows: `Silo_X.Y.Z_x64-setup.exe`(+`.sig`), `Silo_X.Y.Z_x64_en-US.msi`(+`.sig`)
- Linux: `Silo_X.Y.Z_amd64.AppImage`(+`.sig`), `Silo_X.Y.Z_amd64.deb`(+`.sig`), `Silo-X.Y.Z-1.x86_64.rpm`(+`.sig`)

A missing `.sig` means the updater will reject the build for that platform — stop
and investigate rather than publishing a partial release.

Confirm `latest.json` names the version you expect:

```sh
gh api -H "Accept: application/octet-stream" \
  "$(gh release view silo-vX.Y.Z --json assets --jq '.assets[]|select(.name=="latest.json")|.apiUrl')" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])"
```

## 3. Expand the notes to cover the gap

release-please writes each draft's body from that version's commits alone. When
intermediate drafts were never published, that body understates the release —
users jumping several versions would see only the last one's changes.

Build the body from the changelog, which already has every section in the right
format. Prepend a callout naming the gap, keep the target version's own body,
then append each skipped version's section verbatim:

```sh
{
  echo "> **This is the first public release since vA.B.C.** It also includes everything from vD.E.F and vG.H.I, whose builds were never published. All of those changes are listed below."
  echo
  gh release view silo-vX.Y.Z --json body --jq .body
  echo
  # every changelog section from the newest skipped version down to (not incl.) the last published one
  awk '/^## \[D\.E\.F\]/,/^## \[A\.B\.C\]/' apps/desktop/CHANGELOG.md | sed '$d'
} > /tmp/notes.md
```

Read the result before applying it — check the callout names the right versions
and the `awk` range didn't clip or duplicate a section. Skip the callout entirely
when there is no gap (the previous version is already public).

## 4. Publish

```sh
gh release edit silo-vX.Y.Z --notes-file /tmp/notes.md --draft=false --latest -R silo-code/silo
```

`--latest` is explicit on purpose: it guarantees the app release takes the
"Latest" slot rather than a package pre-release.

## 5. Confirm it went live

```sh
gh release view silo-vX.Y.Z --json isDraft,isPrerelease,publishedAt
gh api repos/silo-code/silo/releases/latest --jq .tag_name
curl -sL https://github.com/silo-code/silo/releases/latest/download/latest.json \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])"
```

All three must agree on the version you just published. The last one is the
actual updater endpoint — if it still reports the old version, existing installs
will not see the update.

## What publishing does _not_ fix

- **The in-app update prompt** renders the `notes` field baked into the signed
  `latest.json` asset, which still holds only the target version's own notes.
  Expanding the GitHub body does not change it. Say so when reporting the
  publish; only re-upload that asset if the user asks.
- **Older drafts stay drafts.** They're harmless, but the version history will
  have gaps. Offer to publish them as backfill; don't do it unprompted.

## Reporting back

Lead with the release URL and confirmation that the updater endpoint serves the
new version. Then name what's still outstanding — the in-app prompt's notes, any
remaining drafts. If a release announcement or tweet is in flight, check it
still matches: the "what's new" story is everything since the last **published**
version, not since the last tag.
