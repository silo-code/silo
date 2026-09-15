# Requirements — 0046. Generic dock-panel tabs

## R1 — A dock panel tab has a context menu

Right-clicking any dock panel tab opens a menu, built by the host from the panel's
identity alone. Editor and terminal tabs keep the menus they have today.

### Acceptance criteria

- [ ] Right-clicking a Chat panel tab opens a menu (today: nothing happens).
- [ ] The menu is suppressed when it would be empty — a transient panel kind with no
      contributions and no rename shows no menu rather than an empty one.
- [ ] Editor tab and terminal tab menus are unchanged.
- [ ] The menu works from the tab-overflow popup, targeting the right panel.

## R2 — Extensions can contribute to a panel tab menu

`registerContextMenuItem` accepts a `"panel/tab"` surface, and contributed items appear
below the host's own, separated.

### Acceptance criteria

- [ ] `registerContextMenuItem({ surface: "panel/tab", … })` compiles against the
      published SDK types and its item appears on panel tabs.
- [ ] The menu context carries `{ panelId, kindId, workspaceId, params }`, letting a
      contribution scope itself to one kind with `when`.
- [ ] `params` handed to a contribution is a copy — mutating it cannot corrupt the
      live dockview params object.
- [ ] An unscoped contribution appears on every panel tab; this is documented, not a
      bug.

## R3 — A recorded panel tab can be renamed

A renamable panel's tab menu offers "Rename…", and the chosen name survives everything
the panel itself does to its title, plus an app restart.

### Acceptance criteria

- [ ] "Rename…" appears for a kind with `persistence: "recorded"`, and not for a
      transient kind.
- [ ] A kind may set `renamable: false` to opt out, or `renamable: true` to opt in
      without being recorded (in which case the name lasts only for the session).
- [ ] After renaming a Chat tab, an agent-driven title update does **not** overwrite
      the chosen name.
- [ ] The name survives an app restart.
- [ ] Submitting an empty name clears the override and the tab reverts to the panel's
      own title; the prompt offers "Reset" only when an override is set.
- [ ] A third-party panel kind gets all of this without declaring anything beyond
      `persistence: "recorded"`.

## R4 — A Chat session starts in a chosen workspace folder

Starting a Chat-armed Agent Profile in a multi-root workspace prompts for the folder,
exactly as starting a Terminal-armed one does, and the session runs there.

### Acceptance criteria

- [ ] With one folder, no prompt appears (the picker short-circuits).
- [ ] With two or more folders, the prompt appears for both entry points: the center
      dock's `+` menu and `core.newAgent.<id>`.
- [ ] Dismissing the prompt opens no panel and reports no error.
- [ ] The agent process runs in the chosen folder, and the panel's file picker and
      path resolution use it.
- [ ] The folder survives a restart — the restored session resumes in the same folder.
- [ ] Switching workspaces while a session is mid-turn does not tear the session down
      (the regression guarded by the comment at `AcpChatPanel.tsx:670`).
- [ ] An empty working folder is never persisted.

## Out of scope

- **Renaming the agent session.** A renamed tab does not change the session's name in
  the Agents navigator or in dormant-session lists — those label from the
  agent-reported title (`AgentInfo.title` / `chatState[id].title`). Tab name and
  session name are deliberately separate; reaching one into the other would couple host
  chrome to chat internals.
- **Changing a panel's working folder after creation.** Terminals don't offer it.
- **Rename for editor tabs.** An editor tab's label is its filename.
- **A folder indicator in the Chat panel chrome.** Worth doing once folders can differ
  per panel, but it's a separate design question about panel chrome.
