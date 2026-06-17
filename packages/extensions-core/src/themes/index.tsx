import type { Extension, SidePanelProps } from "@silo-code/sdk";
import { ThemeEditorPanel } from "./ThemeEditorPanel";
import { ThemeStatusItem } from "./ThemeStatusItem";

export const extension: Extension = {
  id: "core.themes",
  activate(ctx) {
    // The theme domain service, injected into both UIs as a prop so they touch
    // the app only through ctx (never state/store, layout/presets, …).
    const theme = ctx.theme;

    ctx.registerSidePanel({
      id: "themes",
      location: "right",
      title: "Themes",
      component: (props: SidePanelProps) => (
        <ThemeEditorPanel
          active={props.active}
          storage={props.storage}
          hydrated={props.hydrated}
          theme={theme}
          files={ctx.files}
          ui={ctx.ui}
        />
      ),
      order: 10,
      lazyMount: true,
    });

    // The theme picker in the status bar. Negative priority places it left of
    // the panel-toggle buttons (priority 0).
    ctx.registerStatusItem({
      id: "theme-selector",
      alignment: "right",
      priority: -10,
      tooltip: "Change theme",
      component: () => <ThemeStatusItem theme={theme} ui={ctx.ui} />,
    });
  },
};
