import { describe, it, expect } from "vitest";
import {
  announcementFrom,
  createWorkingCheckoutTracker,
} from "./working-checkout";
import type { AgentSessionUpdate } from "@silo-code/sdk";

const ROOT = "/Users/dev/Projects/app";
const WORKTREE = `${ROOT}/.claude/worktrees/bugfix`;
const SIBLING = "/Users/dev/Projects/app-color-update";

const ENTER_TEXT = (dir: string) =>
  `Created worktree at ${dir} on branch worktree-bugfix. The session is now ` +
  `working in the worktree. Use ExitWorktree to leave mid-session, or exit ` +
  `the session to be prompted.`;

const block = (text: string) =>
  [{ type: "content", content: { type: "text", text } }] as never;

function call(
  id: string,
  fields: Record<string, unknown>,
  kind: "tool_call" | "tool_call_update" = "tool_call",
): AgentSessionUpdate {
  return {
    kind,
    toolCall: { toolCallId: id, ...fields },
  } as AgentSessionUpdate;
}

/** The wire shape: title on the opening call, result on a later update that
 *  repeats no title. */
function enter(id: string, dir: string): AgentSessionUpdate[] {
  return [
    call(id, { title: "EnterWorktree", kind: "other" }),
    call(id, { content: block(ENTER_TEXT(dir)) }, "tool_call_update"),
  ];
}

function exit(id: string): AgentSessionUpdate[] {
  return [
    call(id, { title: "ExitWorktree", kind: "other" }),
    call(
      id,
      { content: block(`Exited and removed worktree at ${WORKTREE}.`) },
      "tool_call_update",
    ),
  ];
}

function track(root: string, updates: AgentSessionUpdate[]) {
  const t = createWorkingCheckoutTracker(root);
  for (const u of updates) t.observe(u);
  return t.announcedCheckout();
}

describe("announcementFrom", () => {
  it("reads the path out of an EnterWorktree result", () => {
    expect(announcementFrom("EnterWorktree", block(ENTER_TEXT(WORKTREE)))).toBe(
      WORKTREE,
    );
  });

  it("is null for ExitWorktree, on the name alone", () => {
    expect(announcementFrom("ExitWorktree", undefined)).toBeNull();
    // The path it reports is the one being *left* — parsing it would point at
    // a directory that has just been removed.
    expect(
      announcementFrom(
        "ExitWorktree",
        block(`Exited and removed worktree at ${WORKTREE}.`),
      ),
    ).toBeNull();
  });

  it("does not match the sentence quoted in another tool's output", () => {
    expect(
      announcementFrom("Bash", block(ENTER_TEXT(WORKTREE))),
    ).toBeUndefined();
  });

  it("is undefined when the message cannot be parsed", () => {
    expect(
      announcementFrom("EnterWorktree", block("Switched worktrees.")),
    ).toBeUndefined();
  });

  it("is undefined for an ordinary tool", () => {
    expect(announcementFrom("Edit", block("done"))).toBeUndefined();
    expect(announcementFrom(undefined, undefined)).toBeUndefined();
  });
});

describe("createWorkingCheckoutTracker", () => {
  it("reports an announced worktree before any file is touched", () => {
    expect(track(ROOT, enter("c1", WORKTREE))).toBe(WORKTREE);
  });

  it("honours an announced path outside the session root", () => {
    // `git worktree add ../name` is the idiomatic layout, and the agent named
    // the destination explicitly.
    expect(track(ROOT, enter("c1", SIBLING))).toBe(SIBLING);
  });

  it("reports nothing for a session that never announced a move", () => {
    expect(
      track(ROOT, [
        call("e1", {
          title: "Edit",
          kind: "edit",
          locations: [{ path: `${ROOT}/a.ts` }],
        }),
        call("e2", { title: "Bash", kind: "execute" }),
      ]),
    ).toBeNull();
  });

  it("returns to the session root after ExitWorktree", () => {
    expect(track(ROOT, [...enter("c1", WORKTREE), ...exit("c2")])).toBeNull();
  });

  it("takes the most recent of several moves", () => {
    const second = `${ROOT}/.claude/worktrees/second`;
    expect(
      track(ROOT, [
        ...enter("c1", WORKTREE),
        ...exit("c2"),
        ...enter("c3", second),
      ]),
    ).toBe(second);
  });

  it("reports nothing when the announced path is the session root itself", () => {
    expect(track(ROOT, enter("c1", ROOT))).toBeNull();
  });

  it("ignores updates that are not tool calls", () => {
    expect(
      track(ROOT, [
        { kind: "agent_message_chunk", text: "hi" } as AgentSessionUpdate,
      ]),
    ).toBeNull();
  });

  it("ignores a tool call with no id", () => {
    expect(
      track(ROOT, [{ kind: "tool_call", toolCall: {} } as AgentSessionUpdate]),
    ).toBeNull();
  });
});
