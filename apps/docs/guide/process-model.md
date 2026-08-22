# Silo's process model

If you open Activity Monitor (macOS) or Task Manager (Windows) and filter for
**Silo**, you will usually see **more than one process**. That is normal — Silo
is not a single monolithic app like a simple text editor.

This page explains what those processes are and when you might need to worry.

## Why more than one process?

Silo splits work across a few cooperating pieces:

| Piece               | What it does                                                                            |
| ------------------- | --------------------------------------------------------------------------------------- |
| **Main app**        | The window, menus, and keyboard shortcuts                                               |
| **UI (webview)**    | Everything you see — panels, editors, file tree, terminal panes                         |
| **Browser helpers** | GPU, network, and other standard webview plumbing                                       |
| **Session hosts**   | The backend for each **live terminal** — your shell, an agent, `npm run dev`, and so on |

The important Silo-specific part: **terminals keep running in the background**
when you switch workspaces. The UI can hide a terminal tab; the shell keeps going
until you close that terminal or quit Silo. That is why you may see several
**session-host** processes even when you are only looking at one workspace.

## What you see on macOS (Activity Monitor)

Names vary slightly by macOS version, but a typical install looks like this:

| Process name                    | What it is                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Silo** (with the app icon)    | The main app — owns the window and coordinates everything else.                                                                                  |
| **`tauri://localhost`**         | The embedded UI. Most of Silo's interactive work happens here. Often the highest CPU user when the UI is busy or terminals are streaming output. |
| **Silo Graphics and Media**     | GPU helper for the UI (including terminal rendering).                                                                                            |
| **Silo Networking**             | Network helper (extension updates, GitHub, and other online features).                                                                           |
| **AutoFill (Silo)**             | WebKit autofill helper. Harmless; usually idle.                                                                                                  |
| **`silo`** (lowercase, no icon) | One **session host** per live terminal backend.                                                                                                  |

You may also see **`com.apple.WebKit.WebContent`** in some views; on recent macOS
versions Activity Monitor often labels the UI as **`tauri://localhost`** instead.

### Counting the lowercase `silo` rows

Rough rule of thumb:

```
number of lowercase silo rows ≈ number of live terminal sessions
```

Background workspaces count — if you keep five workspaces open and each has an
active terminal, expect **about five** session hosts, plus the main app and UI
processes.

Those session hosts are **intentional**, not leaks. They let you switch
workspaces instantly without killing agents or dev servers mid-run.

## Windows

On Windows the same idea applies, but names differ — **Silo.exe** for the main
app, and **WebView2** / **msedgewebview2** for the UI. You may see extra Silo
processes for the same reason: **one per live terminal session**.

## CPU and memory — what is normal?

**Idle Silo** (one workspace, nothing streaming in a terminal): UI CPU is usually
**under ~1–2%**. The main **Silo** process stays low too.

**Active use** (agents streaming output, large file trees, many panels): the UI
and graphics helpers can rise — that is expected while work is happening.

**Many session hosts at ~0% CPU** with an occasional bump: normal. They wake
when their terminal receives or sends data.

### When to look closer

| Symptom                                                | What to try                                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| **Many more `silo` rows than you have open terminals** | Stale sessions from a crash or long uptime. Quit Silo completely and relaunch, or restart your Mac.                           |
| **Sustained high CPU with idle terminals**             | Often a runaway process _inside_ a terminal (not Silo itself). Check the terminal pane for a stuck command or runaway script. |

## Related reading

- **[Workspaces](/guide/workspaces)** — why background workspaces keep terminals
  alive.
- **[Using agents](/guide/agent-sessions)** — agents run in those persistent
  terminal sessions.
