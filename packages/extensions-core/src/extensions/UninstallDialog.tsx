import { useState } from "react";
import { Button, CheckboxRow, ModalActions } from "@silo-code/sdk";
import type { UiService } from "@silo-code/sdk";
import type { ExtensionDataInfo } from "@silo-code/extension-host/internal";
import {
  formatDataSummary,
  resolveUninstallOutcome,
  type UninstallOutcome,
} from "./uninstall-model";

// The uninstall confirm when an extension has stored data (RFC 0032). Plain
// `ctx.ui.confirm` has no room for the opt-in delete checkbox, so this uses
// public `ctx.ui.showModal` for the chrome and the SDK kit for the content
// (ADR 0026) — nothing host-internal, so a third-party extension can copy the
// pattern verbatim.
//
// The box is **unchecked** by default: keeping a user's files is the safe
// default, and a reinstall gets them back.

function UninstallDialogContent({
  name,
  info,
  close,
}: {
  name: string;
  info: ExtensionDataInfo;
  close: (result?: UninstallOutcome) => void;
}) {
  const [deleteData, setDeleteData] = useState(false);

  return (
    <>
      <div className="silo-modal-body">
        The {name} extension will be removed from Silo.
      </div>
      <div className="silo-modal-body">
        Any user data for this extension is kept unless you want it removed.
      </div>
      <CheckboxRow
        label={`Also delete its data (${formatDataSummary(info)})`}
        checked={deleteData}
        onChange={setDeleteData}
      />
      <ModalActions>
        <Button
          type="button"
          onClick={() => close(resolveUninstallOutcome("cancel", deleteData))}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() =>
            close(resolveUninstallOutcome("uninstall", deleteData))
          }
          autoFocus
        >
          Uninstall
        </Button>
      </ModalActions>
    </>
  );
}

/**
 * Ask whether to uninstall `name`, and whether to delete its stored data.
 * Dismissing (Escape/backdrop) is a cancel — nothing is uninstalled and
 * nothing is deleted, even if the box was checked.
 */
export async function confirmUninstallWithData(
  ui: UiService,
  name: string,
  info: ExtensionDataInfo,
): Promise<UninstallOutcome> {
  const result = await ui.showModal<UninstallOutcome>(
    (close) => <UninstallDialogContent name={name} info={info} close={close} />,
    {
      title: `Uninstall ${name}?`,
      size: "sm",
      ariaLabel: `Uninstall ${name}`,
      dismissible: true,
    },
  );
  return result ?? resolveUninstallOutcome(undefined, false);
}
