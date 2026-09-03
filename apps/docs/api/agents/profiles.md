# ctx.agents.profiles <Badge type="warning" text="beta" />

Read the user's **Agent Profiles** and start one — optionally with an opening
prompt. A profile is the user's own named recipe for launching a coding agent
(a label, a command line like `claude-work`, and an optional config directory
for running a second account), defined on **Settings → Agents → Profiles**.

```ts
ctx.agents.profiles: AgentProfilesService
```

A profile is a way to _start_ a terminal, not a way to talk to an agent. What
comes up is a PTY running a real agent CLI, exactly as if the user had typed
the command themselves — there is no agent-agnostic messaging layer here, and
there is not meant to be one. Talking to an agent that is already running is
out of scope.

There is deliberately no `pick()` — build one from `list()` and
[`ctx.ui.showMenu`](/api/ui/) — and no `get()`, which is `list().find()`.

## Example

### Let the user pick a profile and start it on a task

```ts
function startOn(ctx: ExtensionContext, profileId: string): void {
  const result = ctx.agents.profiles.launch({
    profileId,
    prompt: "Fix the failing test in src/foo.test.ts",
  });
  if (result.ok) {
    ctx.ui.notify("info", `Started in terminal ${result.terminalId}.`);
  } else {
    ctx.ui.notify("warn", `Couldn't start it: ${result.refusal}`);
  }
}

export const extension: Extension = {
  id: "my.start-task",
  activate(ctx) {
    ctx.subscriptions.push(
      ctx.registerCommand({
        id: "my.startTask",
        label: "My: Start a task",
        run: () => {
          const profiles = ctx.agents.profiles.list();
          if (profiles.length === 0) {
            ctx.ui.notify(
              "warn",
              "No agent profiles yet — add one in Settings → Agents.",
            );
            return;
          }
          void ctx.ui.showMenu({
            items: profiles.map((p) => ({
              label: p.isDefault ? `${p.label} (default)` : p.label,
              run: () => startOn(ctx, p.id),
            })),
          });
        },
      }),
    );
  },
};
```

### Only offer a prompt where one is possible

Whether an agent can take an opening prompt is a **static** fact about that
agent, not about a particular launch — so `list()` tells you up front and you
never have to discover it from a refusal:

```ts
const promptable = ctx.agents.profiles.list().filter((p) => p.acceptsPrompt);
```

### Start an agent without stealing the user's place

`activate` defaults to `true` (activate the workspace, focus the new terminal).
Pass `false` to launch quietly — including into a background workspace, which
spawns its session eagerly since no panel will mount to do it:

```ts
ctx.agents.profiles.launch({
  workspaceId: someOtherWorkspaceId,
  prompt: "Run the migration and report what changed",
  activate: false,
});
```

## Opening prompts

The prompt is delivered as a **literal**. Silo composes it into the launch line
so the shell cannot interpret it — `$HOME`, backticks, `$(…)`, quotes,
backslashes and newlines all arrive as text and execute nothing. You do not
need to escape anything.

If Silo cannot deliver a prompt exactly, it **refuses** rather than mangling or
silently dropping it: nothing is typed, no terminal is created, and `launch()`
returns the reason.

| Refusal             | Meaning                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `no-agent`          | The profile matches no agent Silo knows, so there is no way to tell how its CLI takes a prompt |
| `agent-takes-none`  | That agent has no way to accept an opening prompt while staying interactive                    |
| `unsupported-shell` | Silo has no exact quoting rule for the shell this terminal would run — bash, zsh and fish work |
| `too-large`         | Over the 16 KiB limit. An opening instruction, not a file transfer                             |
| `no-profile`        | The named profile does not exist, or there are none at all                                     |
| `no-workspace`      | The named workspace does not exist, or none is open                                            |

Two things worth knowing before you put text in a prompt:

- **It is visible.** The composed line is typed into the user's own interactive
  shell, so it appears in scrollback and enters shell history exactly as if
  they had typed it. That is the product's model — a launch is something the
  user can see, edit, and re-run — so don't put a secret in one.
- **It is an _opening_ prompt.** It rides the launch line of a new terminal.
  There is no way to send a second prompt to an agent that is already running.

## See also

- [`AgentProfilesService`](/api/types/interfaces/AgentProfilesService)
- [`AgentProfileSummary`](/api/types/interfaces/AgentProfileSummary)
- [`LaunchAgentProfileOptions`](/api/types/interfaces/LaunchAgentProfileOptions)
- [`LaunchAgentProfileResult`](/api/types/type-aliases/LaunchAgentProfileResult)
- [`PromptRefusal`](/api/types/type-aliases/PromptRefusal)
- [`ctx.agents`](/api/agents/) — activity and resume identity for a running agent
- [`ctx.terminals`](/api/state/terminals) — the terminal a launch creates
- [Using agents with Silo](/guide/agent-sessions)
