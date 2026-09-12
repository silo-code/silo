import { useCallback, useSyncExternalStore } from "react";
import type { DockPanelKind } from "@silo-code/sdk";
import { openMenu } from "../extension-host/menu-controller";
import {
  getPanelBreadcrumb,
  subscribePanelBreadcrumb,
} from "../extension-host/panel-chrome-registry";
import { Breadcrumb } from "./Breadcrumb";
import { ContributedToolbar } from "./ContributedToolbar";
import "./DockPanelChrome.css";

interface Props {
  panelId: string;
  kindId: string;
  workspaceId: string;
  params: Readonly<Record<string, unknown>>;
  toolbar: NonNullable<DockPanelKind["toolbar"]>;
}

/**
 * The host-drawn strip above a {@link DockPanelKind} that declares `toolbar`
 * (RFC 0039) — the same chrome an editor gets, drawn by the dock frame instead
 * of by the panel. The panel feeds the path crumbs through
 * `DockPanelApi.setBreadcrumb`; anything trailing arrives as
 * `registerToolbarItem({ surface: "panel" })` contributions, the same door a
 * first-party panel's own controls use.
 */
export function DockPanelChrome({
  panelId,
  kindId,
  workspaceId,
  params,
  toolbar,
}: Props) {
  const crumb = useSyncExternalStore(
    useCallback(
      (cb) => subscribePanelBreadcrumb(panelId, cb).dispose,
      [panelId],
    ),
    useCallback(() => getPanelBreadcrumb(panelId), [panelId]),
  );

  // Three states from the registry: a crumb to show, `null` (the panel hid its
  // crumbs — e.g. a "hide breadcrumbs" setting), or `undefined` (not declared
  // yet — a placeholder holds the strip's height so it does not jump when the
  // path arrives).
  const showCrumbs = toolbar.breadcrumb && crumb !== null;

  return (
    <div className="dock-panel-chrome">
      {showCrumbs ? (
        <Breadcrumb
          filePath={crumb?.filePath ?? null}
          workspaceFolder={crumb?.workspaceFolder}
          leafIcon={crumb?.leafIcon}
        />
      ) : null}
      <ContributedToolbar
        surface="panel"
        target={{ panelId, kindId, workspaceId, params }}
        showMenu={(opts) => openMenu(opts)}
      />
    </div>
  );
}
