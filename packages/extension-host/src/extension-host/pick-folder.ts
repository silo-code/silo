import { createRoot } from "react-dom/client";
import { createElement, useState } from "react";
import { store } from "../state/store";

/**
 * Returns the workspace's primary folder immediately when there's only one.
 * When multiple folders exist, shows a small modal and resolves with the
 * user's choice (or null if dismissed).
 */
export function pickWorkspaceFolder(wsId: string): Promise<string | null> {
  const ws = store.workspaces[wsId];
  if (!ws) return Promise.resolve(null);

  const allFolders = [ws.folder, ...(ws.extraFolders ?? [])];
  if (allFolders.length === 1) return Promise.resolve(allFolders[0]);

  return new Promise((resolve) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    function cleanup(result: string | null) {
      root.unmount();
      document.body.removeChild(container);
      resolve(result);
    }

    root.render(
      createElement(FolderPickerModal, {
        folders: allFolders,
        onPick: cleanup,
      }),
    );
  });
}

function FolderPickerModal({
  folders,
  onPick,
}: {
  folders: string[];
  onPick: (folder: string | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  function baseName(p: string) {
    return p.split("/").filter(Boolean).pop() ?? p;
  }

  return createElement(
    "div",
    {
      style: {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      },
      onMouseDown: () => onPick(null),
    },
    createElement(
      "div",
      {
        style: {
          background: "var(--silo-color-bg-hover)",
          border: "1px solid var(--silo-color-border-strong)",
          borderRadius: "var(--silo-radius-md)",
          padding: "16px",
          width: 320,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          fontFamily: "var(--silo-font-ui)",
          display: "flex",
          flexDirection: "column" as const,
          gap: 8,
        },
        onMouseDown: (e: MouseEvent) => e.stopPropagation(),
      },
      createElement(
        "div",
        {
          style: {
            fontWeight: 600,
            fontSize: "var(--silo-font-size-base)",
            color: "var(--silo-color-text-hi)",
            marginBottom: 4,
          },
        },
        "Choose a folder",
      ),
      ...folders.map((folder) =>
        createElement(
          "button",
          {
            key: folder,
            onMouseEnter: () => setHovered(folder),
            onMouseLeave: () => setHovered(null),
            onMouseDown: (e: MouseEvent) => {
              e.stopPropagation();
              onPick(folder);
            },
            style: {
              display: "flex",
              flexDirection: "column" as const,
              alignItems: "flex-start",
              gap: 2,
              padding: "8px 10px",
              background:
                hovered === folder
                  ? "var(--silo-color-button-bg)"
                  : "transparent",
              border: "1px solid var(--silo-color-border)",
              borderRadius: "var(--silo-radius-sm)",
              cursor: "pointer",
              textAlign: "left" as const,
              width: "100%",
            },
          },
          createElement(
            "span",
            {
              style: {
                fontWeight: 600,
                color: "var(--silo-color-text-hi)",
                fontSize: "var(--silo-font-size-sm)",
              },
            },
            baseName(folder),
          ),
          createElement(
            "span",
            {
              style: {
                color: "var(--silo-color-text-lo)",
                fontSize: "calc(var(--silo-font-size-sm) - 1px)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                width: "100%",
                direction: "rtl",
              },
            },
            folder,
          ),
        ),
      ),
    ),
  );
}
