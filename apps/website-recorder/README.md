# `@silo-code/website-recorder` — vignette authoring

NLE-style tool for recording homepage feature clips. Depends on
`@silo-code/website` for `DemoWorkspace` + scenes.

## Commands

```bash
# Open the recorder UI
pnpm --filter @silo-code/website-recorder recorder
# → http://127.0.0.1:5180/recorder.html

# Headless capture (writes into apps/website/src/assets/)
pnpm --filter @silo-code/website-recorder capture:feature-git

# Unit tests
pnpm --filter @silo-code/website-recorder test
```

## Workflow

1. Author workspace folders under `apps/website/src/workspaces/<id>/`
2. Declare a scene in `apps/website/src/demo-scenes.ts`
3. Add a preset in `src/vignette-recorder/presets.ts`
4. Record In→Out; download WebM/poster or run a capture script
