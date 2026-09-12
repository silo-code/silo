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
  formatArgs,
  parseArgs,
  suggestChatLaunch,
  matchesChatSuggestion,
  type AgentProfile,
} from "@silo-code/extension-host/internal";
import {
  activeCommand,
  editorStateFromProfile,
  launchFromEditorState,
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
        ? { ...p, chatCommand: value, chatLaunchEdited: true }
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
  const chatSuggestion = suggestChatLaunch(resolvedAgentId);

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

  // Prefill the Chat arm from the catalog for an agent that speaks the
  // protocol itself — those args are recon-verified, and expecting a user to
  // know `cursor-agent acp` is expecting them to have read the RFC. Stops as
  // soon as they type: their line is theirs, and a later change of agent must
  // not silently rewrite it.
  useEffect(() => {
    if (!isChat || s.chatLaunchEdited) return;
    if (chatSuggestion?.kind !== "builtin") return;
    const chatCommand = chatSuggestion.command;
    const args = formatArgs(chatSuggestion.args);
    setS((p) =>
      p.chatCommand === chatCommand && p.args === args
        ? p
        : { ...p, chatCommand, args },
    );
  }, [isChat, s.chatLaunchEdited, chatSuggestion]);

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
      // Expand ~ now, once — never at launch time. A Chat profile has no
      // config directory (the arm carries `env` instead), so none of this
      // applies to one.
      let configDir = isChat ? "" : s.configDir.trim();
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
        launch: launchFromEditorState(s, configDir),
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
      <Section label="Label">
        <Input
          block
          value={s.label}
          autoFocus={!focusConfigDir}
          onChange={(e) => setS((p) => ({ ...p, label: e.target.value }))}
          placeholder="Claude (work)"
          {...RAW_TEXT_INPUT}
        />
        {errors.label && <span className="apf-field-err">{errors.label}</span>}
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
          The value <code>silo agent run --profile &lt;id&gt;</code> takes.
        </span>
        {errors.id && <span className="apf-field-err">{errors.id}</span>}
      </Section>

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
                      // Re-arm the catalog prefill on the way into Chat; the
                      // user has not written this arm's line yet.
                      chatLaunchEdited: false,
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
          {isChat ? (
            <Callout>
              Chat agents are a <strong>work in progress</strong>. Expect rough
              edges: a conversation is not yet restored when Silo restarts,
              signing in has no guided flow, and an agent that needs a separate
              adapter is not fetched for you.
            </Callout>
          ) : null}
        </Section>
      ) : null}

      <Section label="Command">
        <Input
          block
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={isChat ? "cursor-agent" : "claude-work"}
          {...RAW_TEXT_INPUT}
        />
        <span className="apf-field-hint">
          {isChat
            ? "An executable resolved on PATH — no shell runs, so an alias or shell function will not work here."
            : "Typed into an interactive shell — an alias, function, or version-manager shim all work."}
        </span>
        {errors.command && (
          <span className="apf-field-err">{errors.command}</span>
        )}
      </Section>

      {isChat ? (
        <Section label="Arguments">
          <Input
            block
            value={s.args}
            onChange={(e) =>
              setS((p) => ({
                ...p,
                args: e.target.value,
                chatLaunchEdited: true,
              }))
            }
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
                run: () =>
                  setS((p) => ({
                    ...p,
                    agentOverride: "",
                    chatLaunchEdited: false,
                  })),
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
                  // A deliberate agent pick is a stronger signal than whatever
                  // is already in the command field, so it re-arms the catalog
                  // prefill. Without this, typing anything before choosing the
                  // agent disabled the suggestion permanently — which is how a
                  // Cursor Chat profile got saved as bare `cursor`.
                  run: () =>
                    setS((p) => ({
                      ...p,
                      agentOverride: a.id,
                      chatLaunchEdited: false,
                    })),
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

      {isChat ? null : envVar ? (
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
            Runs this profile against a separate account — <code>{envVar}</code>{" "}
            is set on the launch line.
          </span>
        </Section>
      ) : resolvedAgentKnown ? (
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
          Choose an agent above to set a config directory (for two-account
          setups).
        </span>
      )}

      {isChat &&
      chatSuggestion?.kind === "builtin" &&
      !matchesChatSuggestion(
        s.chatCommand,
        parseArgs(s.args),
        chatSuggestion,
      ) ? (
        <Callout>
          <div className="apf-suggest">
            <span>
              {catalog.find((a) => a.id === resolvedAgentId)?.displayName ??
                "This agent"}{" "}
              speaks the protocol as{" "}
              <code>
                {chatExecPreview(chatSuggestion.command, chatSuggestion.args)}
              </code>
              . That is the invocation Silo has verified.
            </span>
            <Button
              size="sm"
              onClick={() =>
                setS((p) => ({
                  ...p,
                  chatCommand: chatSuggestion.command,
                  args: formatArgs(chatSuggestion.args),
                  chatLaunchEdited: true,
                }))
              }
            >
              Use it
            </Button>
          </div>
        </Callout>
      ) : null}

      {isChat && chatSuggestion?.kind === "adapter" ? (
        <Callout>
          {catalog.find((a) => a.id === resolvedAgentId)?.displayName ??
            "This agent"}{" "}
          does not speak the protocol itself — it needs the{" "}
          <code>{chatSuggestion.adapter}</code> adapter as a separate process.
          Silo does not fetch or run one for you yet, so point Command and
          Arguments at an adapter you have already installed.
        </Callout>
      ) : null}

      {isChat && chatSuggestion?.kind === "none" ? (
        <Callout>
          {catalog.find((a) => a.id === resolvedAgentId)?.displayName ??
            "This agent"}{" "}
          has no Chat mode that Silo has been able to verify. Saving this is
          allowed, but connecting is likely to fail — use Terminal for it.
        </Callout>
      ) : null}

      {!isChat && !acceptsPrompt && s.terminalCommand.trim() ? (
        <span className="apf-field-hint">
          {resolvedAgentKnown
            ? `${
                catalog.find((a) => a.id === resolvedAgentId)?.displayName ??
                "This agent"
              } can’t be given an opening prompt — extensions that offer one will skip this profile.`
            : "This profile matches no known agent, so Silo can’t give it an opening prompt. Choose an agent above if you want that."}
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
