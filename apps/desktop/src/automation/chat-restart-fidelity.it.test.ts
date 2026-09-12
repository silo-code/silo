// Integration test (Layer 2): a Chat session looks the same after a restart.
//
// The suite RFC 0042 needed and did not have. Every restart bug this sprint
// found — an agent missing from the navigator, a tab reverting to the profile
// label, a status resetting from "Ready · 11s" to "Idle · 2s", a tab losing its
// agent icon, a session declared unresumable because the app was relaunched
// from a different shell — was found by hand, one screenshot at a time, and
// each fix was verified by hand-driving the app again. That is why they kept
// coming back in pairs: a hand-driven check exercises one scenario, in one
// workspace, under whatever environment the driver happened to have.
//
// This drives the matrix instead: several Chat sessions, in several states,
// across two workspaces, snapshotted, carried through a **real quit and
// relaunch**, and diffed field by field.
//
// It restarts the dev app, so it is opt-in twice over:
//
//   SILO_IT_RESTART_APP=1 pnpm --filter silo exec vitest run \
//     src/automation/chat-restart-fidelity.it.test.ts
//
// and it needs a working Chat Agent Profile (a real agent, really logged in) —
// it uses the first one it finds and skips when there is none.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SiloAutomation, type AgentSnapshot } from "./client";

const silo = new SiloAutomation();
const available = await silo.available();
const restartAllowed = process.env.SILO_IT_RESTART_APP === "1";

// Which agent to exercise. Restore fidelity is Silo's job, not any one
// agent's, but *what an agent does on reconnect* varies wildly — one replays
// its transcript, another resumes silently, another has no memory of the
// session at all — so the suite is worth running against each Chat profile you
// have. `SILO_IT_CHAT_PROFILE=<profile id>` picks one; otherwise it uses the
// first Chat profile configured.
let chatProfileId = "";
if (available) {
  const { profiles } = await silo.agentProfiles();
  const wanted = process.env.SILO_IT_CHAT_PROFILE;
  const chat = profiles.filter((p) => p.launch?.interface === "chat");
  if (wanted) {
    chatProfileId = chat.find((p) => p.id === wanted)?.id ?? "";
    if (!chatProfileId) {
      // eslint-disable-next-line no-console
      console.warn(
        `[chat-restart-fidelity.it] no Chat profile "${wanted}" — have: ` +
          (chat.map((p) => p.id).join(", ") || "(none)"),
      );
    }
  } else {
    chatProfileId = chat[0]?.id ?? "";
  }
}

const runnable = available && restartAllowed && chatProfileId !== "";
if (available && !runnable) {
  // eslint-disable-next-line no-console
  console.warn(
    "[chat-restart-fidelity.it] skipping — " +
      (!restartAllowed
        ? "set SILO_IT_RESTART_APP=1 (this suite quits and relaunches the dev app)"
        : "no Chat Agent Profile configured"),
  );
}

/** Poll until `read` returns something truthy. `expect.poll` is only legal
 *  inside a test, and most of this suite's waiting happens in setup. */
async function waitFor<T>(
  read: () => Promise<T | undefined | false>,
  what: string,
  timeoutMs = 90_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value) return value as T;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** The fields a restart must not change. Everything else about an `AgentInfo`
 *  is derived from a live connection this session deliberately does not have
 *  yet — see `restoredActivity` for why `working` is the one status that is
 *  allowed to move. */
function identity(a: AgentSnapshot) {
  return {
    id: a.id,
    workspaceId: a.workspaceId,
    title: a.title,
    kind: a.kind,
    agentId: a.agentId,
    sessionId: a.sessionId,
    needsAttention: a.needsAttention,
    attentionSince: a.attentionSince,
  };
}

/** Every Chat session in the app — including the user's own, which this suite
 *  must never assert on: it can reconnect, retitle itself, or finish a turn
 *  while the suite is running, and none of that is the suite's business. Use
 *  {@link ownAgents} for assertions. */
async function chatAgents(): Promise<AgentSnapshot[]> {
  const { agents } = await silo.listAgents();
  return agents.filter((a) => a.kind === "chat");
}

/** Only the sessions this run created. */
function ownAgents(agents: AgentSnapshot[]): AgentSnapshot[] {
  const mine = new Set([unseen?.agentId, seen?.agentId].filter(Boolean));
  return agents.filter((a) => mine.has(a.id));
}

function byId(agents: AgentSnapshot[], id: string): AgentSnapshot | undefined {
  return agents.find((a) => a.id === id);
}

/** One agent's current snapshot, read fresh. */
async function byId2(id: string): Promise<AgentSnapshot | undefined> {
  return byId(await chatAgents(), id);
}

/**
 * Quit the dev app and bring it back, the way a user does — not a webview
 * reload. Everything in memory dies; only what is on disk decides what comes
 * back, which is the entire point of the suite.
 */
/** The pnpm workspace root — where `pnpm dev` is defined. The suite itself
 *  runs from `apps/desktop`, so spawning there would find no such script. */
function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const up = dirname(dir);
    if (up === dir)
      throw new Error("no pnpm-workspace.yaml above " + process.cwd());
    dir = up;
  }
}

async function restartApp(): Promise<void> {
  const { execSync } = await import("node:child_process");
  const pids = execSync("pgrep -f 'target/debug/silo$' || true")
    .toString()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  for (const pid of pids) {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      /* already gone */
    }
  }
  execSync("pkill -f 'pnpm dev' || true");
  execSync("pkill -f 'vite/bin/vite.js' || true");
  await new Promise((r) => setTimeout(r, 4000));

  // Wait for the dev server's port to actually free up — a relaunch that races
  // the old vite dies with "Port 1420 is already in use" and the suite would
  // blame the app for not coming back.
  for (let i = 0; i < 30; i++) {
    const busy = execSync("lsof -ti :1420 || true").toString().trim();
    if (!busy) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  relaunched = spawn("pnpm", ["dev"], {
    cwd: repoRoot(),
    detached: true,
    stdio: "ignore",
  });
  relaunched.unref();

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await silo.available()) {
      // The bridge answers before hydration finishes; give the store and the
      // extension host their turn, or the first snapshot reads an empty app.
      await new Promise((r) => setTimeout(r, 8000));
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("dev app did not come back within 180s");
}

let relaunched: ChildProcess | null = null;
const dirs: string[] = [];
const workspaces: string[] = [];
// Declared out here so `ownAgents` can filter on them.
let unseen: { panelId: string; agentId: string };
let seen: { panelId: string; agentId: string };

/** Open a Chat panel in the active workspace and wait for it to connect. */
async function openChat(workspaceId: string): Promise<{
  panelId: string;
  recordId: string;
  agentId: string;
}> {
  // Snapshot first: `exec` can have created the panel before the next read.
  const known = new Set(
    (await silo.listPanels(workspaceId)).panels.map((p) => p.id),
  );
  // The app answers `ping` before its extensions finish loading, and a
  // per-profile command that does not exist yet just reports `ran: false` —
  // which would otherwise show up as an unexplained timeout below.
  await waitFor(
    async () => (await silo.exec(`core.newAgent.${chatProfileId}`)).ran,
    `the ${chatProfileId} profile command to exist`,
    60_000,
  );
  const startedAt = Date.now();
  // A launch can be *queued* rather than run (the host defers it while the
  // extension host is still coming up), and a queued launch has been seen to
  // fire much later — or against whatever workspace is active by then. Ask
  // again rather than hanging on the first request; the panel that eventually
  // appears is the one this returns.
  const rec = await waitFor(
    async () => {
      const { panels } = await silo.listPanels(workspaceId);
      const found = panels.find(
        (p) => !known.has(p.id) && typeof p.state.sessionId === "string",
      );
      if (found) return found;
      if (
        (Date.now() - startedAt) % 30_000 < 600 &&
        Date.now() - startedAt > 25_000
      ) {
        await silo.exec(`core.newAgent.${chatProfileId}`);
      }
      return undefined;
    },
    "the new Chat panel to connect",
    120_000,
  );
  const recordId = rec.id;
  return {
    panelId: `${rec.kindId}:${rec.id}`,
    recordId,
    agentId: `chat:${String(rec.state.sessionId)}`,
  };
}

/** Send one prompt through the panel's own composer and wait for the turn to
 *  finish — the real path, not a synthesized `prompt()` call. */
async function promptActivePanel(text: string): Promise<void> {
  await silo.eval<string>(
    `(() => {
      const p = document.querySelector('.dock-host[data-active=true] .acp-chat');
      const ta = p.querySelector('textarea');
      const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      set.call(ta, ${JSON.stringify(text)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      [...p.querySelectorAll('button')].find(b => b.textContent.trim() === 'Send').click();
      return 'sent';
    })()`,
  );
}

describe.skipIf(!runnable)(
  `Chat sessions survive a restart unchanged [${chatProfileId}]`,
  () => {
    // Two workspaces: A holds the sessions, B is what the app comes back into —
    // so A's agents are only ever seen from persistence, never from a mounted
    // dock. That is the case the navigator used to show nothing for.
    let wsA = "";
    let wsB = "";
    let before: AgentSnapshot[] = [];

    beforeAll(async () => {
      const dirA = await mkdtemp(join(tmpdir(), "silo-restart-a-"));
      const dirB = await mkdtemp(join(tmpdir(), "silo-restart-b-"));
      dirs.push(dirA, dirB);

      const a = await silo.openWorkspace(dirA, "restart-fidelity-A");
      wsA = a.id;
      workspaces.push(wsA);
      await silo.activateWorkspace(wsA);

      // Session 1: prompt it and immediately look away, so its turn finishes
      // *unwitnessed* — the green "Ready" row, whose flag and elapsed time both
      // have to survive a restart.
      unseen = await openChat(wsA);
      await promptActivePanel(
        "Reply with exactly the word ALPHA and nothing else.",
      );

      // Session 2: a second conversation, prompted while the user is watching it
      // — so it settles acknowledged, with no attention flag. Two sessions in two
      // different states, which is the point: a restore has to keep them apart.
      seen = await openChat(wsA);
      await promptActivePanel(
        "Reply with exactly the word BETA and nothing else.",
      );

      // Wait for the *state the assertions are about* rather than a fixed sleep:
      // both turns finished and unseen, which is the "Ready" row a restart has to
      // bring back with its original timestamp.
      await waitFor(
        async () => {
          const a = await byId2(unseen.agentId);
          const b = await byId2(seen.agentId);
          return (
            a?.needsAttention === true &&
            b?.activity === "idle" &&
            b?.needsAttention === false
          );
        },
        "one turn to finish unseen and one acknowledged",
        180_000,
      );

      const b = await silo.openWorkspace(dirB, "restart-fidelity-B");
      wsB = b.id;
      workspaces.push(wsB);
      await silo.activateWorkspace(wsB);
      // Persistence is debounced. Nothing may be killed until what the restart
      // will read back has actually reached disk — otherwise the app comes back
      // into workspace A, mounts its panels, and the run measures a *connecting*
      // session instead of a remembered one.
      await new Promise((r) => setTimeout(r, 5000));

      before = ownAgents(await chatAgents());
    }, 300_000);

    afterAll(async () => {
      // Workspaces first, folders second, and only if the app actually took the
      // delete: a leftover panel whose cwd has been removed cannot spawn its
      // agent at all ("No such file or directory"), which looks exactly like a
      // product bug the next time anyone opens the app.
      let deleted = true;
      for (const id of workspaces) {
        try {
          await silo.deleteWorkspace(id);
        } catch {
          deleted = false;
        }
      }
      if (deleted)
        for (const d of dirs) await rm(d, { recursive: true, force: true });
      else
        // eslint-disable-next-line no-console
        console.warn(
          "[chat-restart-fidelity.it] app unreachable at teardown — left " +
            `${dirs.join(", ")} in place; delete the workspaces by hand.`,
        );
    }, 60_000);

    it("carries every session's identity and status across a real relaunch", async () => {
      const expected = before.map(identity);
      await restartApp();

      // The precondition the rest of the suite rests on: the app came back where
      // it was left. If it did not, workspace A's dock is mounted and its agents
      // are connecting — which is a different scenario, not a flaky one.
      const { active } = await silo.listWorkspaces();
      expect(active, "app did not restore the workspace it was left in").toBe(
        wsB,
      );

      const after = ownAgents(await chatAgents());
      if (process.env.SILO_IT_DEBUG === "1") {
        const { workspaces: all } = await silo.listWorkspaces();
        // eslint-disable-next-line no-console
        console.log(
          "[debug] wsA=%s wsB=%s\nworkspaces=%o\nbefore=%o\nafter=%o",
          wsA,
          wsB,
          all.map((w) => `${w.id}:${w.name}`),
          before.map(identity),
          after.map(identity),
        );
      }
      // Nothing was activated: workspace A's dock is not even mounted, so these
      // rows exist purely because the app remembered them.
      expect(
        after.map(identity).sort((x, y) => x.id.localeCompare(y.id)),
      ).toEqual(expected.sort((x, y) => x.id.localeCompare(y.id)));
    }, 300_000);

    it("lists them as dormant — remembered, not connected", async () => {
      const after = ownAgents(await chatAgents());
      for (const a of after) {
        expect(a.chatResumeState).toBe("dormant");
        // A dormant session has no process, so it can never be mid-turn.
        expect(a.activity).not.toBe("working");
      }
    });

    it("keeps each restored tab bound to its own agent, before any panel mounts", async () => {
      for (const s of [unseen, seen]) {
        const { agentSessionId } = await silo.panelAgentSession(s.panelId);
        expect(agentSessionId).toBe(s.agentId);
      }
    });

    it("reconnects to the same session — and the same store — when opened", async () => {
      await silo.activateWorkspace(wsA);
      await silo.activatePanel(unseen.panelId);

      await waitFor(
        async () => {
          const state = byId(
            await chatAgents(),
            unseen.agentId,
          )?.chatResumeState;
          return state !== undefined && state !== "dormant";
        },
        "the reopened session to reconnect",
        120_000,
      );

      const live = byId(await chatAgents(), unseen.agentId)!;
      // "journal-only" means the agent could not find the session it was told to
      // reconnect to. With the store pinned to where the session was created,
      // that must not happen to a session this same app made minutes ago.
      expect(live.chatResumeState).not.toBe("journal-only");
      expect(live.title).toBe(byId(before, unseen.agentId)!.title);
    }, 300_000);
  },
);
