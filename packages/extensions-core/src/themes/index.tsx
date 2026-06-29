import type { Extension, SidePanelProps } from "@silo-code/sdk";
import { ThemeEditorPanel } from "./ThemeEditorPanel";
import { ThemeStatusItem } from "./ThemeStatusItem";

export const extension: Extension = {
  id: "core.themes",
  activate(ctx) {
    // The theme domain service, injected into both UIs as a prop so they touch
    // the app only through ctx (never state/store, layout/presets, …).
    const theme = ctx.theme;

    // Log theme changes to the Application output channel.
    let prevThemeId = theme.getState().activeId;
    ctx.subscriptions.push(
      theme.subscribe((state) => {
        if (state.activeId !== prevThemeId) {
          const preset = state.presets.find((p) => p.id === state.activeId);
          ctx.log.info(`Theme changed: ${preset?.name ?? state.activeId}`);
          prevThemeId = state.activeId;
        }
      }),
    );

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

    // The theme picker in the status bar. Right items sort descending so lower
    // priority = closer to right edge. -5 places it right of updates (-2) and
    // left of settings (-10) and panel-toggles (-20).
    ctx.registerStatusItem({
      id: "theme-selector",
      alignment: "right",
      priority: -5,
      tooltip: "Change theme",
      component: () => <ThemeStatusItem theme={theme} ui={ctx.ui} />,
    });
  },
};
