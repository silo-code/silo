import { useEffect } from "react";
import {
  AppShell,
  Shortcuts,
  SettingsSheet,
  ModalHost,
  Toasts,
  Menus,
  ThemeInjector,
  ErrorBoundary,
  reloadCustomThemes,
} from "@silo-code/extension-host";

export default function App() {
  useEffect(() => {
    reloadCustomThemes().catch(console.error);
  }, []);

  return (
    <ErrorBoundary name="app">
      <ThemeInjector />
      <Shortcuts />
      <AppShell />
      <SettingsSheet />
      <ModalHost />
      <Toasts />
      <Menus />
    </ErrorBoundary>
  );
}
