import { useEffect } from "react";
import {
  AppShell,
  Shortcuts,
  SettingsDialog,
  ModalHost,
  Toasts,
  Menus,
  ThemeInjector,
  reloadCustomThemes,
} from "@silo-code/extension-host";

export default function App() {
  useEffect(() => {
    reloadCustomThemes().catch(console.error);
  }, []);

  return (
    <>
      <ThemeInjector />
      <Shortcuts />
      <AppShell />
      <SettingsDialog />
      <ModalHost />
      <Toasts />
      <Menus />
    </>
  );
}
