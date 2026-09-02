/**
 * The Agent Profile editor (RFC 0033 R14) — a host `Modal` (ADR 0018) whose
 * content is SDK kit fields (ADR 0026). Opened from the Profiles tab for a new
 * profile, an edit, or a duplicate. Saving mutates host state directly and
 * closes; Cancel discards every edit.
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
  profileCommandId,
  renameRetiresBinding,
  overrideKey,
  isRemoved,
  displayKey,
  type AgentProfile,
} from "@silo-code/extension-host/internal";

// These fields are literal text — labels, ids, and shell commands — so the
// browser/OS must not "helpfully" capitalize, autocorrect, or squiggle them.
const RAW_TEXT_INPUT = {
  autoCapitalize: "off",
  autoCorrect: "off",
  autoComplete: "off",
  spellCheck: false,
} as const;

interface EditorState {
  label: string;
  id: string;
  idEdited: boolean;
  command: string;
  /** `""` = auto-detect; otherwise an explicit catalog agent id. */
  agentOverride: string;
  configDir: string;
}

function initialState(seed?: Partial<AgentProfile>): EditorState {
  return {
    label: seed?.label ?? "",
    id: seed?.id ?? "",
    idEdited: seed != null && seed.id != null,
    command: seed?.command ?? "",
    agentOverride: seed?.assumedAgentId ?? "",
    configDir: seed?.configDir ?? "",
  };
}

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
  const [s, setS] = useState<EditorState>(() =>
    initialState(profile ?? initial),
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

  // The catalog agent in effect: an explicit override wins, else a match on
  // the command text, else the stored `assumedAgentId`.
  const resolvedAgentId =
    s.agentOverride ||
    fallbackAgentForCommand(s.command) ||
    profile?.assumedAgentId ||
    undefined;
  const envVar = configDirEnvVarForAgent(resolvedAgentId);
  const resolvedAgentKnown = resolvedAgentId != null;

  // id tracks the label until the user edits the id field.
  const idValue = s.idEdited ? s.id : slugifyProfileId(s.label);

  useEffect(() => {
    if (focusConfigDir) configDirRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const launchLine = useMemo(
    () =>
      buildLaunchLine(
        { command: s.command, configDir: s.configDir || undefined },
        envVar,
      ),
    [s.command, s.configDir, envVar],
  );

  async function save() {
    const draft = { id: idValue, label: s.label, command: s.command };
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
    if (
      editingId &&
      renameRetiresBinding(editingId, nextId, hasUserBinding)
    ) {
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
      // Expand ~ now, once — never at launch time.
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
        command: s.command.trim(),
        ...(configDir ? { configDir } : {}),
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

      <Section label="Command">
        <Input
          block
          value={s.command}
          onChange={(e) => setS((p) => ({ ...p, command: e.target.value }))}
          placeholder="claude-work"
          {...RAW_TEXT_INPUT}
        />
        <span className="apf-field-hint">
          Typed into an interactive shell — an alias, function, or
          version-manager shim all work.
        </span>
        {errors.command && (
          <span className="apf-field-err">{errors.command}</span>
        )}
      </Section>

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

      {envVar ? (
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

      <div className="apf-launch">
        <span className="apf-launch-label">Silo will type</span>
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
