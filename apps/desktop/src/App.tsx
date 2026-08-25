import { useEffect } from "react";
import {
  AppShell,
  Shortcuts,
  SettingsSheet,
  ModalHost,
  SheetDialogHost,
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
      <SheetDialogHost />
      <Toasts />
      <Menus />
    </ErrorBoundary>
  );
}
