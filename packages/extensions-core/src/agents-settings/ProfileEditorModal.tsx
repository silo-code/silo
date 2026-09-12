/**
 * The Agent Profile editor (RFC 0033 R14) — a host `Modal` (ADR 0018) whose
 * content is SDK kit fields (ADR 0026). Opened from the Profiles tab for a new
 * profile, an edit, or a duplicate. Saving mutates host state directly and
 * closes; Cancel discards every edit.
 *
 * ## Interface: Terminal or Chat (RFC 0038)
 *
 * A profile's `launch` is a discriminated union and the two arms are genuinely
 * different, not a shared shape with a flag:
 *
 * - **Terminal** — `command` is a **shell string** typed into an interactive
 *   login shell, so an alias, function or version-manager shim resolves. It
 *   may carry a `configDir` for a second account.
 * - **Chat** — `command` is an **executable path** and `args` an argv vector;
 *   Silo `exec`s a pipe-connected child and speaks the Agent Client Protocol
 *   to it. No shell is involved, so aliases do *not* resolve — which is
 *   exactly why the shape is a path plus args rather than one string.
 *
 * The choice appears only while the `chatAgents` setting is on. With it off
 * this editor behaves exactly as it did before RFC 0038: Terminal only, with
 * no extra control on screen.
 *
 * ## Why the two arms have different controls (Session 3.6)
 *
 * Terminal shows a **Command** text field and Chat shows an **Agent picker**,
 * and that asymmetry is the point rather than an inconsistency. A terminal
 * command must be free text because the value that works is a fact about the
 * *user's* shell — `claude-personal` is an alias only they can know. A Chat
 * command is `exec`'d with no shell, so only a resolvable file works, and the
 * one that works came out of recon in the catalog — so *Silo* is the one that
 * knows it, and nothing the user can type is more correct.
 *
 * So the Chat arm does not ask. Picking the agent composes the launch, the
 * "Silo will run" line shows what was composed, and **Custom…** reveals the
 * text fields for the case that genuinely is the user's own — a locally built
 * ACP server, which is the same authoring path a third party driving
 * `ctx.agents.sessions` needs. An agent with no verified ACP launch is left out
 * of the picker rather than offered with a warning.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ExtensionContext, MenuEntry } from "@silo-code/sdk";
import {
  AgentIconGlyph,
  Button,
  Callout,
  Input,
  MenuButton,
  ModalActions,
  RadioCard,
  RadioGroup,
  Section,
  useServiceState,
} from "@silo-code/sdk";
import {
  addAgentProfile,
  updateAgentProfile,
  getAgentProfiles,
  buildLaunchLine,
  expandTilde,
  slugifyProfileId,
  validateProfileDraft,
  draftIsValid,
  configDirEnvVarForAgent,
  fallbackAgentForCommand,
  profileAcceptsPrompt,
  profileCommandId,
  renameRetiresBinding,
  overrideKey,
  isRemoved,
  displayKey,
  getChatAgentsEnabled,
  chatExecPreview,
  chatLaunchForAgent,
  formatArgs,
  parseArgs,
  type AgentProfile,
} from "@silo-code/extension-host/internal";
import {
  activeCommand,
  editorStateFromProfile,
  launchFromEditorState,
  CHAT_CHOICE_CUSTOM,
  type ProfileEditorState,
} from "./profile-editor-model";

// These fields are literal text — labels, ids, and shell commands — so the
// browser/OS must not "helpfully" capitalize, autocorrect, or squiggle them.
const RAW_TEXT_INPUT = {
  autoCapitalize: "off",
  autoCorrect: "off",
  autoComplete: "off",
  spellCheck: false,
} as const;

export function ProfileEditorModal({
  ctx,
  profile,
  initial,
  focusConfigDir,
  close,
}: {
  ctx: ExtensionContext;
  /** The profile being **edited**. Undefined for a new profile. */
  profile?: AgentProfile;
  /** Prefill values for a **new** profile (Duplicate). Ignored when `profile`
   *  is set. */
  initial?: Partial<AgentProfile>;
  /** Duplicate opens with the config-directory field focused. */
  focusConfigDir?: boolean;
  close: () => void;
}) {
  const [s, setS] = useState<ProfileEditorState>(() =>
    editorStateFromProfile(profile ?? initial),
  );
  const [errors, setErrors] = useState<ReturnType<typeof validateProfileDraft>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  const configDirRef = useRef<HTMLInputElement | null>(null);
  const catalog = ctx.agents.catalog();
  const themeState = useServiceState(ctx.theme);
  const colorScheme = ctx.theme.resolve(themeState.activeId).base;

  const editingId = profile?.id;
  const existing = getAgentProfiles();
  // The arm's own command field. `s.terminalCommand` / `s.chatCommand` are
  // separate so switching Interface cannot hand a shell alias to `exec`.
  const command = activeCommand(s);
  const setCommand = (value: string) =>
    setS((p) =>
      p.interfaceKind === "chat"
        ? { ...p, chatCommand: value }
        : { ...p, terminalCommand: value },
    );

  // The catalog agent in effect: an explicit override wins, else a match on
  // the command text, else the stored `assumedAgentId`.
  const resolvedAgentId =
    s.agentOverride ||
    fallbackAgentForCommand(command) ||
    profile?.assumedAgentId ||
    undefined;
  const envVar = configDirEnvVarForAgent(resolvedAgentId);
  const resolvedAgentKnown = resolvedAgentId != null;

  // The Chat *choice* is gated on the setting; an existing Chat profile still
  // edits as one either way. Silently re-authoring someone's saved profile
  // into the other arm because a flag moved would be worse than showing them
  // fields they cannot currently create from scratch.
  const chatChoiceOffered = getChatAgentsEnabled();
  const isChat = s.interfaceKind === "chat";

  // The Chat arm's Agent picker: only agents with a recon-verified ACP launch,
  // plus Custom…. An agent without one (`grok`) is **left out**, not listed
  // with a warning — it stays a Terminal agent, and not offering it is
  // strictly better than explaining why saving it will fail at spawn.
  const chatAgents = useMemo(
    () => catalog.filter((a) => chatLaunchForAgent(a.id) !== undefined),
    [catalog],
  );
  const isCustomChat = isChat && s.chatChoice === CHAT_CHOICE_CUSTOM;
  // A new Chat profile before anything is picked: there is no launch to save,
  // and the Command field the generic validator complains about is not on
  // screen, so the prompt belongs on the picker instead.
  const chatNeedsPick = isChat && s.chatChoice === "";

  /** Pick a catalog agent for the Chat arm — this *is* authoring the launch. */
  const pickChatAgent = (agentId: string) => {
    const launch = chatLaunchForAgent(agentId);
    if (!launch) return;
    setS((p) => ({
      ...p,
      chatChoice: agentId,
      // The pick is also the agent assertion; there is no command text to
      // detect one from any more.
      agentOverride: agentId,
      chatCommand: launch.command,
      args: formatArgs(launch.args),
    }));
  };

  // R10: whether this profile could ever be given an **opening prompt** is a
  // static fact about the agent it resolves to, so it belongs here — where the
  // profile is authored — rather than only in a refusal at launch time.
  // Resolved through `profileAcceptsPrompt`, the same helper the launch path
  // uses, against the profile this editor *would save*, so the notice below
  // and an actual refusal can never disagree. Purely informational: a profile
  // that can't take one is still fully usable, and nothing new is persisted.
  // Terminal-arm only: an Opening Prompt rides a *launch line*. A Chat
  // session takes structured prompt turns instead, so the notion does not
  // apply and the notice below is suppressed rather than answered wrongly.
  const acceptsPrompt = profileAcceptsPrompt({
    assumedAgentId: resolvedAgentId,
    launch: { interface: "terminal", command: s.terminalCommand },
  });

  // id tracks the label until the user edits the id field.
  const idValue = s.idEdited ? s.id : slugifyProfileId(s.label);

  useEffect(() => {
    if (focusConfigDir) configDirRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const launchLine = useMemo(
    () =>
      isChat
        ? chatExecPreview(s.chatCommand, parseArgs(s.args))
        : buildLaunchLine(
            {
              command: s.terminalCommand,
              configDir: s.configDir || undefined,
            },
            envVar,
          ),
    [isChat, s.chatCommand, s.terminalCommand, s.args, s.configDir, envVar],
  );

  async function save() {
    const draft = { id: idValue, label: s.label, command };
    const errs = validateProfileDraft(draft, existing, editingId);
    setErrors(errs);
    if (!draftIsValid(errs)) return;

    // R7: renaming a profile's id retires its `core.newAgent.<id>` command, so
    // a user keybinding on the old id goes dead (it stays inert per R6, never
    // pruned). Warn before that happens — only for a real user binding, since
    // the per-profile commands declare no defaults.
    const nextId = idValue.trim();
    const hasUserBinding = (cmd: string) =>
      overrideKey(cmd) !== undefined || isRemoved(cmd);
    if (editingId && renameRetiresBinding(editingId, nextId, hasUserBinding)) {
      const oldKey = overrideKey(profileCommandId(editingId));
      const chord = oldKey ? ` (${displayKey(oldKey)})` : "";
      const ok = await ctx.ui.confirm({
        title: "Rename this profile?",
        body: `Its keyboard shortcut${chord} is bound to the old id “${editingId}” and will stop working. You can rebind it on the Keyboard Shortcuts page.`,
        confirmLabel: "Rename",
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      // Expand ~ now, once — never at launch time. Both arms take a config
      // directory; only the destination differs (`configDir` on a shell line
      // vs. an `env` entry for an `exec`'d child), so the tilde expansion and
      // the create-it-now offer are shared rather than reimplemented.
      let configDir = s.configDir.trim();
      if (configDir) {
        const home = await ctx.system.homeDir().catch(() => "");
        if (home) configDir = expandTilde(configDir, home);
        // Offer to create a missing directory (codex fails to bootstrap one).
        if (envVar && !(await ctx.files.pathExists(configDir))) {
          const ok = await ctx.ui.confirm({
            title: "Create config directory?",
            body: `${configDir} does not exist. Create it now?`,
            confirmLabel: "Create",
          });
          if (ok) await ctx.files.createDir(configDir);
        }
      }
      // A stored configDir only applies with a configDirEnvVar — drop it
      // otherwise (R3), rather than let it silently rot.
      if (!envVar) configDir = "";

      const next: AgentProfile = {
        id: idValue.trim(),
        label: s.label.trim(),
        launch: launchFromEditorState(s, configDir, envVar),
        ...(resolvedAgentId ? { assumedAgentId: resolvedAgentId } : {}),
      };

      if (editingId) updateAgentProfile(editingId, next);
      else addAgentProfile(next);
      close();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="silo-modal-form apf-editor">
      {/* Label and Id share a row: they are the profile's *name*, one idea in
          two fields, and the id is derived from the label until edited. */}
      <div className="apf-fieldrow">
        <Section label="Label">
          <Input
            block
            value={s.label}
            autoFocus={!focusConfigDir}
            onChange={(e) => setS((p) => ({ ...p, label: e.target.value }))}
            placeholder="Claude (work)"
            {...RAW_TEXT_INPUT}
          />
          {errors.label && (
            <span className="apf-field-err">{errors.label}</span>
          )}
        </Section>

        <Section label="Id">
          <Input
            block
            value={idValue}
            onChange={(e) =>
              setS((p) => ({ ...p, id: e.target.value, idEdited: true }))
            }
            placeholder="claude-work"
            {...RAW_TEXT_INPUT}
          />
          <span className="apf-field-hint">
            <code>silo agent run --profile &lt;id&gt;</code>
          </span>
          {errors.id && <span className="apf-field-err">{errors.id}</span>}
        </Section>
      </div>

      {chatChoiceOffered || isChat ? (
        <Section label="Interface">
          <RadioGroup
            value={s.interfaceKind}
            onChange={(value) =>
              setS((p) =>
                p.interfaceKind === value
                  ? p
                  : {
                      ...p,
                      interfaceKind: value === "chat" ? "chat" : "terminal",
                    },
              )
            }
          >
            <RadioCard
              value="terminal"
              title="Terminal"
              description="The agent runs in a Silo terminal and draws its own interface."
            />
            <RadioCard
              value="chat"
              title="Chat"
              description="Silo renders the conversation and can stream tool calls into a panel. Work in progress."
            />
          </RadioGroup>
        </Section>
      ) : null}

      {isChat ? (
        <Section label="Agent">
          <MenuButton
            variant="field"
            label={
              isCustomChat
                ? "Custom…"
                : s.chatChoice
                  ? (chatAgents.find((a) => a.id === s.chatChoice)
                      ?.displayName ?? s.chatChoice)
                  : "Choose an agent"
            }
            onClick={(e) => {
              const items: MenuEntry[] = [
                ...chatAgents.map(
                  (a): MenuEntry => ({
                    label: a.displayName,
                    checked: s.chatChoice === a.id,
                    icon: (
                      <AgentIconGlyph
                        icon={a.icon}
                        mode="color"
                        colorScheme={colorScheme}
                        className="apf-agent-icon"
                      />
                    ),
                    run: () => pickChatAgent(a.id),
                  }),
                ),
                { type: "separator" },
                {
                  label: "Custom…",
                  checked: isCustomChat,
                  run: () =>
                    setS((p) => ({ ...p, chatChoice: CHAT_CHOICE_CUSTOM })),
                },
              ];
              void ctx.ui.showMenu({ anchor: e.currentTarget, items });
            }}
          >
            <AgentIconGlyph
              icon={chatAgents.find((a) => a.id === s.chatChoice)?.icon}
              mode="color"
              colorScheme={colorScheme}
              className="apf-agent-icon"
            />
          </MenuButton>
          <span className="apf-field-hint">
            {isCustomChat
              ? "Point Silo at your own ACP server."
              : "Only agents Silo has a verified launch for."}
          </span>
          {chatNeedsPick && errors.command && (
            <span className="apf-field-err">
              Choose an agent, or Custom… to supply your own command.
            </span>
          )}
        </Section>
      ) : null}

      {!isChat || isCustomChat ? (
        <Section label="Command">
          <Input
            block
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder={isChat ? "/usr/local/bin/my-acp-agent" : "claude-work"}
            {...RAW_TEXT_INPUT}
          />
          <span className="apf-field-hint">
            {isChat
              ? "Resolved on PATH. No shell runs, so an alias will not work."
              : "Typed into an interactive shell, so an alias or shim works."}
          </span>
          {errors.command && !chatNeedsPick && (
            <span className="apf-field-err">{errors.command}</span>
          )}
        </Section>
      ) : null}

      {isCustomChat ? (
        <Section label="Arguments">
          <Input
            block
            value={s.args}
            onChange={(e) => setS((p) => ({ ...p, args: e.target.value }))}
            placeholder="acp"
            {...RAW_TEXT_INPUT}
          />
          <span className="apf-field-hint">
            Space-separated. Quote an argument that contains a space; nothing
            else is interpreted — <code>$HOME</code> and <code>*</code> are
            passed through literally.
          </span>
        </Section>
      ) : null}

      {isChat ? null : (
        <Section label="Agent">
          <MenuButton
            variant="field"
            label={
              s.agentOverride
                ? (catalog.find((a) => a.id === s.agentOverride)?.displayName ??
                  s.agentOverride)
                : "Auto-detect from the command"
            }
            onClick={(e) => {
              const items: MenuEntry[] = [
                {
                  label: "Auto-detect from the command",
                  checked: s.agentOverride === "",
                  run: () => setS((p) => ({ ...p, agentOverride: "" })),
                },
                ...catalog.map(
                  (a): MenuEntry => ({
                    label: a.displayName,
                    checked: s.agentOverride === a.id,
                    icon: (
                      <AgentIconGlyph
                        icon={a.icon}
                        mode="color"
                        colorScheme={colorScheme}
                        className="apf-agent-icon"
                      />
                    ),
                    run: () => setS((p) => ({ ...p, agentOverride: a.id })),
                  }),
                ),
              ];
              void ctx.ui.showMenu({ anchor: e.currentTarget, items });
            }}
          >
            <AgentIconGlyph
              icon={catalog.find((a) => a.id === resolvedAgentId)?.icon}
              mode="color"
              colorScheme={colorScheme}
              className="apf-agent-icon"
            />
          </MenuButton>
          {s.agentOverride === "" && resolvedAgentId && (
            <span className="apf-field-hint">
              Detected:{" "}
              {catalog.find((a) => a.id === resolvedAgentId)?.displayName}
            </span>
          )}
        </Section>
      )}

      {envVar && !chatNeedsPick ? (
        <Section label="Config directory">
          <Input
            ref={configDirRef}
            block
            value={s.configDir}
            onChange={(e) => setS((p) => ({ ...p, configDir: e.target.value }))}
            placeholder="~/.claude-work"
            {...RAW_TEXT_INPUT}
          />
          <span className="apf-field-hint">
            A separate account — sets <code>{envVar}</code>.
          </span>
        </Section>
      ) : isChat ? null : resolvedAgentKnown ? (
        s.configDir.trim() ? (
          <Callout>
            {catalog.find((a) => a.id === resolvedAgentId)?.displayName ??
              "This agent"}{" "}
            doesn’t support a separate config directory — the value you entered
            won’t be saved.
          </Callout>
        ) : null
      ) : (
        <span className="apf-field-hint">
          Choose an agent to set a config directory.
        </span>
      )}

      {!isChat && !acceptsPrompt && s.terminalCommand.trim() ? (
        <span className="apf-field-hint">
          {resolvedAgentKnown
            ? `${
                catalog.find((a) => a.id === resolvedAgentId)?.displayName ??
                "This agent"
              } can’t take an opening prompt.`
            : "Matches no known agent, so it can’t take an opening prompt."}
        </span>
      ) : null}

      <div className="apf-launch">
        <span className="apf-launch-label">
          {isChat ? "Silo will run" : "Silo will type"}
        </span>
        <div className="apf-launch-box">
          <code className="apf-launch-code">{launchLine || "…"}</code>
          <Button
            size="sm"
            disabled={!launchLine}
            onClick={() => void navigator.clipboard.writeText(launchLine)}
          >
            Copy
          </Button>
        </div>
      </div>

      <ModalActions>
        <Button onClick={close} disabled={saving}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </ModalActions>
    </div>
  );
}
