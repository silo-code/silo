# ACP recon probes

`recon-2026-09-09.mjs` — the §4.6 recon for
[`docs/acp-process-ownership.md`](../../docs/acp-process-ownership.md). Speaks
newline-delimited JSON-RPC to an ACP agent over piped stdio, no deps.

```
node recon-2026-09-09.mjs                 # all agents
node recon-2026-09-09.mjs claude,cursor   # a subset
ACP_REAL_CONFIG=1 node recon-2026-09-09.mjs claude   # use ~/.claude, not an isolated config dir
ACP_STDERR=1 node recon-2026-09-09.mjs pi            # surface the child's stderr
```

Covers: full capability dump, `session/list` / `session/close`, `session/load`
on a live session, and Spike D asserting transcript **content** replays (plant a
passphrase → SIGKILL → respawn → load → read the `session/update`s → ask for it
back). Results distilled into `acp-process-ownership.md` §5.
