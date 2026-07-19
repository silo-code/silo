import { useState, type ReactNode } from "react";
import type {
  Extension,
  ExtensionContext,
  InlineEditValidation,
} from "@silo-code/sdk";
import {
  AddRow,
  Badge,
  Button,
  Callout,
  CheckboxRow,
  EmptyState,
  IconButton,
  InlineEdit,
  Input,
  List,
  ListRow,
  ModalActions,
  RadioCard,
  RadioGroup,
  SearchInput,
  Section,
  SegmentedTabs,
  Select,
  SettingRow,
  Switch,
  TabPanel,
  Tabs,
  Textarea,
  Tooltip,
} from "@silo-code/sdk";

/* -------------------------------------------------------------------------- */
/* Modal Gallery — live tour of every RFC 0016 kit component. Tabs mirror the  */
/* design-docs grouping so "docs page ↔ gallery tab" is a 1:1 map. Demos are   */
/* interactive (switches toggle, search filters, InlineEdit saves) so they     */
/* double as the screenshot source for apps/docs/design/.                      */
/* -------------------------------------------------------------------------- */

const OPEN_COMMAND = "silo.modal-gallery.open";
const STYLE_ID = "silo-modal-gallery-styles";

const STYLES = `
.mg-body {
  display: flex;
  flex-direction: column;
  gap: 0;
  height: min(70vh, 640px);
  min-height: 420px;
}
.mg-tab-slot {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.mg-tab-slot .silo-tab-panel {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.mg-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.mg-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.mg-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.mg-label {
  font-size: var(--silo-font-size-sm);
  color: var(--silo-color-text-lo);
  margin: 0 0 6px;
}
.mg-note {
  font-size: var(--silo-font-size-sm);
  color: var(--silo-color-text-lo);
  margin: 0;
}
.mg-narrow {
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mg-status {
  font-size: var(--silo-font-size-sm);
  color: var(--silo-color-ok);
}
.mg-demo-modal {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 520px;
  padding: 14px;
  background: var(--silo-color-bg);
  border: 1px solid var(--silo-color-border-strong);
  border-radius: var(--silo-radius-md);
}
.mg-demo-modal-title {
  font-weight: 600;
  font-size: calc(var(--silo-font-size-base) + 2px);
  color: var(--silo-color-text-hi);
}
.mg-demo-modal-body {
  font-size: var(--silo-font-size-sm);
  color: var(--silo-color-text-lo);
  line-height: 1.45;
}
.mg-demo-modals {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
`;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = STYLES;
  document.head.appendChild(el);
}

function removeStyles(): void {
  document.getElementById(STYLE_ID)?.remove();
}

/* ---- icons (inline SVGs; same shapes as the design-docs demos) ------------ */

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M13 4.5A5.5 5.5 0 1 0 14 8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M13 2v3h-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoreIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="3" r="1.3" fill="currentColor" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" />
      <circle cx="8" cy="13" r="1.3" fill="currentColor" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 4a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 8.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M11 11l3 3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ---- gallery tabs (mirror apps/docs/design/components/) ------------------- */

type GalleryTab =
  | "buttons"
  | "text"
  | "selection"
  | "tabs"
  | "lists"
  | "badges"
  | "feedback"
  | "structure";

const GALLERY_TABS: { id: GalleryTab; label: string }[] = [
  { id: "buttons", label: "Buttons" },
  { id: "text", label: "Text inputs" },
  { id: "selection", label: "Selection controls" },
  { id: "tabs", label: "Tabs" },
  { id: "lists", label: "Lists" },
  { id: "badges", label: "Badges" },
  { id: "feedback", label: "Feedback" },
  { id: "structure", label: "Structure" },
];

const BRANCHES = [
  "main",
  "feat/workspace-status-badges",
  "fix/terminal-scrollback-restore",
  "fix/windows-caption-color",
  "feat/context-menu-contributions",
  "chore/upgrade-esbuild-0-21",
  "fix/double-focus-ring-inputs",
  "feat/registry-install-channel",
];

const FOLDERS = [
  {
    name: "servicetitan-contactcenter",
    path: "/Users/dweaver/Projects/ai/xerro-agent/repos/servicetitan-contactcenter",
    primary: true,
  },
  {
    name: "limit-console-logs-to-kibana",
    path: "/Users/dweaver/Projects/ai/xerro-agent/projects/limit-console-logs",
    primary: false,
  },
  {
    name: "xerro-edit",
    path: "/Users/dweaver/Projects/ai/xerro-agent/projects/xerro-edit",
    primary: false,
  },
];

function validateWorkspaceName(raw: string): InlineEditValidation {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Name is required." };
  if (value.length > 48)
    return { ok: false, error: "Keep it under 48 characters." };
  return { ok: true, value };
}

function DemoBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="mg-label">{title}</p>
      {children}
    </div>
  );
}

/* ---- per-tab panels ------------------------------------------------------- */

function ButtonsPanel() {
  const [clicks, setClicks] = useState(0);
  return (
    <div className="mg-stack">
      <DemoBlock title="Button — variants, sizes, disabled">
        <div className="mg-row">
          <Button onClick={() => setClicks((n) => n + 1)}>Cancel</Button>
          <Button variant="primary" onClick={() => setClicks((n) => n + 1)}>
            Save
          </Button>
          <Button variant="danger" onClick={() => setClicks((n) => n + 1)}>
            Delete
          </Button>
          <Button size="sm" onClick={() => setClicks((n) => n + 1)}>
            Compact
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="danger" disabled>
            Disabled danger
          </Button>
        </div>
        {clicks > 0 && (
          <p className="mg-note" style={{ marginTop: 8 }}>
            Clicked {clicks} time{clicks === 1 ? "" : "s"}
          </p>
        )}
      </DemoBlock>

      <DemoBlock title="IconButton — normal + sm (with Tooltip)">
        <div className="mg-row">
          <Tooltip content="Close">
            <IconButton
              aria-label="Close"
              onClick={() => setClicks((n) => n + 1)}
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
          <Tooltip content="Refresh">
            <IconButton
              aria-label="Refresh"
              onClick={() => setClicks((n) => n + 1)}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip content="More options">
            <IconButton
              aria-label="More options"
              onClick={() => setClicks((n) => n + 1)}
            >
              <MoreIcon />
            </IconButton>
          </Tooltip>
          <span style={{ width: 14 }} />
          <Tooltip content="Close (small)">
            <IconButton
              size="sm"
              aria-label="Close (small)"
              onClick={() => setClicks((n) => n + 1)}
            >
              <CloseIcon size={13} />
            </IconButton>
          </Tooltip>
          <Tooltip content="More options (small)">
            <IconButton
              size="sm"
              aria-label="More options (small)"
              onClick={() => setClicks((n) => n + 1)}
            >
              <MoreIcon size={14} />
            </IconButton>
          </Tooltip>
        </div>
      </DemoBlock>
    </div>
  );
}

function TextInputsPanel() {
  const [name, setName] = useState("Silo Development");
  const [notes, setNotes] = useState(
    "Working the webphone reliability fixes. Kibana access via the staging VPN only.",
  );
  const [query, setQuery] = useState("");
  const [wsName, setWsName] = useState("Silo Development");
  const [description, setDescription] = useState(
    "Primary workspace for the Silo desktop app.",
  );

  const filtered = BRANCHES.filter((b) =>
    b.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="mg-stack">
      <DemoBlock title="Input">
        <div className="mg-narrow">
          <Input
            block
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Workspace name"
          />
        </div>
      </DemoBlock>

      <DemoBlock title="Textarea">
        <div className="mg-narrow">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes…"
            rows={3}
          />
        </div>
      </DemoBlock>

      <DemoBlock title="SearchInput — filters the branch list below">
        <div className="mg-narrow">
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Filter branches…"
          />
          {filtered.length === 0 ? (
            <EmptyState
              icon={<SearchGlyph />}
              title="No matching branches"
              description="Try a different filter."
              action={
                <Button size="sm" onClick={() => setQuery("")}>
                  Clear filter
                </Button>
              }
            />
          ) : (
            <div className="silo-scroll" style={{ maxHeight: 160 }}>
              <List aria-label="Branches">
                {filtered.map((branch, i) => (
                  <ListRow
                    key={branch}
                    selected={i === 0 && query === ""}
                    trailing={
                      branch === "main" ? (
                        <Badge tone="accent">current</Badge>
                      ) : undefined
                    }
                  >
                    {branch}
                  </ListRow>
                ))}
              </List>
            </div>
          )}
        </div>
      </DemoBlock>

      <DemoBlock title="InlineEdit — click the pencil; Esc cancels, Enter saves">
        <div className="mg-narrow">
          <InlineEdit
            value={wsName}
            onSave={setWsName}
            validate={validateWorkspaceName}
            aria-label="Rename workspace"
          />
          <InlineEdit
            multiline
            value={description}
            onSave={setDescription}
            aria-label="Edit description"
          />
        </div>
      </DemoBlock>
    </div>
  );
}

function SelectionPanel() {
  const [formatOnSave, setFormatOnSave] = useState(true);
  const [wordWrap, setWordWrap] = useState(false);
  const [cursorStyle, setCursorStyle] = useState("block");
  const [onlyCheckedOut, setOnlyCheckedOut] = useState(true);
  const [monitorTags, setMonitorTags] = useState(false);
  const [finishedMode, setFinishedMode] = useState("clear");

  return (
    <div className="mg-stack">
      <DemoBlock title="Switch — on / off / disabled">
        <div className="mg-row">
          <Switch
            checked={formatOnSave}
            onChange={setFormatOnSave}
            aria-label="Format on save"
          />
          <span className="mg-note">
            Format on save · {formatOnSave ? "on" : "off"}
          </span>
          <Switch
            checked={wordWrap}
            onChange={setWordWrap}
            aria-label="Word wrap"
          />
          <span className="mg-note">Word wrap · {wordWrap ? "on" : "off"}</span>
          <Switch
            checked={false}
            onChange={() => {}}
            disabled
            aria-label="Disabled switch"
          />
          <span className="mg-note">Disabled</span>
        </div>
      </DemoBlock>

      <DemoBlock title="Select">
        <div className="mg-row">
          <Select
            value={cursorStyle}
            onChange={(e) => setCursorStyle(e.target.value)}
            aria-label="Cursor style"
          >
            <option value="block">Block</option>
            <option value="bar">Bar</option>
            <option value="underline">Underline</option>
          </Select>
          <span className="mg-note">Cursor style → {cursorStyle}</span>
        </div>
      </DemoBlock>

      <DemoBlock title="CheckboxRow">
        <div className="mg-narrow">
          <CheckboxRow
            label="Only monitor the checked-out branch"
            checked={onlyCheckedOut}
            onChange={setOnlyCheckedOut}
          />
          <CheckboxRow
            label="Also watch tags"
            checked={monitorTags}
            onChange={setMonitorTags}
          />
          <CheckboxRow
            label="Disabled option"
            checked={false}
            onChange={() => {}}
            disabled
          />
        </div>
      </DemoBlock>

      <DemoBlock title="RadioGroup / RadioCard">
        <div className="mg-narrow">
          <RadioGroup value={finishedMode} onChange={setFinishedMode}>
            <RadioCard
              value="clear"
              title="Clear the finished indicator"
              description="Viewing the terminal acknowledges the run — the green check disappears."
            />
            <RadioCard
              value="keep"
              title="Keep it until the next run"
              description="Viewing changes nothing."
            />
          </RadioGroup>
          <p className="mg-note">Selected → {finishedMode}</p>
        </div>
      </DemoBlock>
    </div>
  );
}

function TabsPanel() {
  const [pageTab, setPageTab] = useState<"panels" | "statusBar" | "options">(
    "panels",
  );
  const [mode, setMode] = useState<"browse" | "installed">("browse");

  const pageCopy: Record<typeof pageTab, string> = {
    panels: "Memory · Donut chart of used, cache, and free memory.",
    statusBar:
      "Git branch · Shows the checked-out branch for the active folder.",
    options: "Refresh interval · How often the panel samples process stats.",
  };

  return (
    <div className="mg-stack">
      <DemoBlock title="Tabs / TabPanel — page-level strip">
        <div className="mg-narrow">
          <Tabs
            tabs={[
              { id: "panels", label: "Side Panels" },
              { id: "statusBar", label: "Status Bar" },
              { id: "options", label: "Options" },
            ]}
            active={pageTab}
            onSelect={setPageTab}
          />
          <TabPanel>{pageCopy[pageTab]}</TabPanel>
        </div>
      </DemoBlock>

      <DemoBlock title="SegmentedTabs — compact inline mode toggle">
        <div className="mg-row">
          <SegmentedTabs
            tabs={[
              { id: "browse", label: "Browse" },
              { id: "installed", label: "Installed" },
            ]}
            active={mode}
            onSelect={setMode}
          />
          <span className="mg-note">
            Showing {mode === "browse" ? "registry catalog" : "local installs"}
          </span>
        </div>
      </DemoBlock>
    </div>
  );
}

function ListsPanel() {
  const [selected, setSelected] = useState(0);
  const [folders, setFolders] = useState(FOLDERS);
  const [query, setQuery] = useState("");

  const visible = folders.filter((f) =>
    f.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="mg-stack">
      <DemoBlock title="List / ListRow — selection, truncate end vs start, trailing">
        <div className="mg-narrow">
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Filter folders…"
          />
          <List
            aria-label="Workspace folders"
            onActivate={(index) => setSelected(index)}
          >
            {visible.map((folder, index) => (
              <ListRow
                key={folder.path}
                selected={index === selected}
                leading={<FolderIcon />}
                trailing={
                  folder.primary ? (
                    <Badge tone="accent">primary</Badge>
                  ) : (
                    <Tooltip content="More options">
                      <IconButton size="sm" aria-label="More options">
                        <MoreIcon size={14} />
                      </IconButton>
                    </Tooltip>
                  )
                }
                truncate={folder.name === "xerro-edit" ? "start" : "end"}
                onSelect={() => setSelected(index)}
              >
                {folder.name === "xerro-edit" ? folder.path : folder.name}
              </ListRow>
            ))}
          </List>
          <AddRow
            onClick={() => {
              const next = {
                name: `worktree-${folders.length + 1}`,
                path: `/tmp/silo-worktrees/worktree-${folders.length + 1}`,
                primary: false,
              };
              setFolders((prev) => [...prev, next]);
              setSelected(folders.length);
            }}
          >
            Add Folder…
          </AddRow>
          <p className="mg-note">
            Selected row {selected + 1} of {visible.length}
            {query ? ` (filtered from ${folders.length})` : ""}
          </p>
        </div>
      </DemoBlock>
    </div>
  );
}

function BadgesPanel() {
  return (
    <div className="mg-stack">
      <DemoBlock title="Badge — every tone">
        <div className="mg-row">
          <Badge>primary</Badge>
          <Badge tone="accent">current</Badge>
          <Badge tone="ok">Installed</Badge>
          <Badge tone="warn">Update available</Badge>
          <Badge tone="err">error</Badge>
          <Badge tone="outline">Silo</Badge>
        </div>
      </DemoBlock>

      <DemoBlock title="Badge — arbitrary color (identity / group swatches)">
        <div className="mg-row">
          <Badge color="#e06c75">Frontend</Badge>
          <Badge color="#61afef">Backend</Badge>
          <Badge color="#98c379">Infra</Badge>
        </div>
      </DemoBlock>

      <DemoBlock title="On a ListRow trailing slot">
        <div className="mg-narrow">
          <List aria-label="Sessions">
            <ListRow
              selected
              trailing={
                <>
                  <Badge tone="ok">running</Badge>
                  <Badge tone="outline">agent</Badge>
                </>
              }
            >
              Agent Monitor
            </ListRow>
            <ListRow trailing={<Badge tone="warn">idle</Badge>}>
              Build watcher
            </ListRow>
            <ListRow trailing={<Badge tone="err">failed</Badge>}>
              pre-commit hook
            </ListRow>
          </List>
        </div>
      </DemoBlock>
    </div>
  );
}

function FeedbackPanel() {
  const [showEmpty, setShowEmpty] = useState(false);

  return (
    <div className="mg-stack">
      <DemoBlock title="EmptyState — ok vs neutral">
        <div className="mg-row" style={{ alignItems: "stretch", gap: 24 }}>
          <EmptyState
            tone="ok"
            icon={<CheckIcon />}
            title="All workflows passing"
            description="No failures or active runs on this repo."
          />
          <EmptyState
            icon={<SearchGlyph />}
            title="No matching branches"
            description="Try a different filter."
            action={
              <Button size="sm" onClick={() => setShowEmpty(true)}>
                Clear filter
              </Button>
            }
          />
        </div>
        {showEmpty && (
          <p className="mg-status" style={{ marginTop: 8 }}>
            Cleared — showing all 8 branches again.
          </p>
        )}
      </DemoBlock>

      <DemoBlock title="Callout — quiet explanatory copy (no tone)">
        <Callout>
          Opening a worktree adds it as another folder in this workspace — its
          files, terminals, and Git panel appear alongside your current ones.
          Closing a view leaves the worktree untouched on disk.
        </Callout>
      </DemoBlock>
    </div>
  );
}

function StructurePanel({ close }: { close: () => void }) {
  const [formatOnSave, setFormatOnSave] = useState(true);
  const [tabSize, setTabSize] = useState("2");
  const [scrollBranch, setScrollBranch] = useState(0);

  return (
    <div className="mg-stack">
      <DemoBlock title="Section + SettingRow">
        <Section
          label="Formatting"
          accessory={
            <Badge tone="neutral">{formatOnSave ? "on" : "off"}</Badge>
          }
        >
          <SettingRow
            label="Format on save"
            hint="Run Format Document before writing to disk."
          >
            <Switch
              checked={formatOnSave}
              onChange={setFormatOnSave}
              aria-label="Format on save"
            />
          </SettingRow>
          <SettingRow label="Tab size" hint="Spaces per indentation level.">
            <Select
              value={tabSize}
              onChange={(e) => setTabSize(e.target.value)}
              aria-label="Tab size"
            >
              <option value="2">2</option>
              <option value="4">4</option>
              <option value="8">8</option>
            </Select>
          </SettingRow>
          <SettingRow
            label="GitHub CLI status"
            hint="Authentication is detected from the gh CLI."
          >
            <span
              className="mg-status"
              style={{ display: "inline-flex", gap: 4, alignItems: "center" }}
            >
              <CheckIcon />
              Authenticated
            </span>
          </SettingRow>
        </Section>
      </DemoBlock>

      <DemoBlock title="Scroll area (.silo-scroll) over a List">
        <div className="mg-narrow">
          <div className="silo-scroll" style={{ maxHeight: 150 }}>
            <List aria-label="Branches">
              {BRANCHES.map((branch, i) => (
                <ListRow
                  key={branch}
                  selected={i === scrollBranch}
                  trailing={
                    branch === "main" ? (
                      <Badge tone="accent">current</Badge>
                    ) : undefined
                  }
                  onSelect={() => setScrollBranch(i)}
                >
                  {branch}
                </ListRow>
              ))}
            </List>
          </div>
        </div>
      </DemoBlock>

      <DemoBlock title="ModalActions — standard footer + start slot">
        <div className="mg-demo-modals">
          <div className="mg-demo-modal">
            <div className="mg-demo-modal-title">Group Properties</div>
            <Input block value="Frontend" readOnly />
            <ModalActions>
              <Button onClick={close}>Cancel</Button>
              <Button variant="primary" onClick={close}>
                Create
              </Button>
            </ModalActions>
          </div>
          <div className="mg-demo-modal">
            <div className="mg-demo-modal-title">
              Processes — All Workspaces
            </div>
            <p className="mg-demo-modal-body">
              Select a process, then end it or jump to its terminal.
            </p>
            <ModalActions start="6 sessions · 6 procs">
              <Button onClick={close}>Go to Terminal</Button>
              <Button variant="danger" onClick={close}>
                End Task
              </Button>
            </ModalActions>
          </div>
          <div className="mg-demo-modal">
            <div className="mg-demo-modal-title">Branches</div>
            <p className="mg-demo-modal-body">
              Fetch updates, or create a branch from the start slot.
            </p>
            <ModalActions
              start={
                <Button size="sm" onClick={() => setScrollBranch(0)}>
                  + Create branch
                </Button>
              }
            >
              <Button onClick={close}>Fetch</Button>
            </ModalActions>
          </div>
        </div>
      </DemoBlock>
    </div>
  );
}

/* ---- modal root ----------------------------------------------------------- */

function GalleryModal({ close }: { close: () => void }) {
  const [tab, setTab] = useState<GalleryTab>("buttons");

  return (
    <div className="mg-body">
      <Tabs tabs={GALLERY_TABS} active={tab} onSelect={setTab} />
      <div className="mg-tab-slot">
        <TabPanel>
          <div className="mg-panel silo-scroll">
            {tab === "buttons" && <ButtonsPanel />}
            {tab === "text" && <TextInputsPanel />}
            {tab === "selection" && <SelectionPanel />}
            {tab === "tabs" && <TabsPanel />}
            {tab === "lists" && <ListsPanel />}
            {tab === "badges" && <BadgesPanel />}
            {tab === "feedback" && <FeedbackPanel />}
            {tab === "structure" && <StructurePanel close={close} />}
          </div>
        </TabPanel>
      </div>
      <ModalActions start="RFC 0016 · modal design system">
        <Button onClick={close}>Close</Button>
      </ModalActions>
    </div>
  );
}

function openGallery(ctx: ExtensionContext) {
  return ctx.ui.showModal((close) => <GalleryModal close={() => close()} />, {
    title: "Modal design system",
    dismissible: true,
    size: "lg",
  });
}

export const extension: Extension = {
  id: "silo.modal-gallery",
  activate(ctx) {
    injectStyles();
    ctx.registerCommand({
      id: OPEN_COMMAND,
      label: "Modal Gallery",
      run: () => openGallery(ctx),
    });
    ctx.registerMenuItem({
      id: "modal-gallery.view",
      menu: "window",
      command: OPEN_COMMAND,
      group: "9_dev",
    });
    ctx.registerKeybinding({
      id: "modal-gallery.open",
      key: "cmd+shift+g",
      command: OPEN_COMMAND,
    });
  },
  deactivate() {
    removeStyles();
  },
};
