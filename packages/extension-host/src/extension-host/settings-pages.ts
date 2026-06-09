import { Registry } from "./registry";
import type { SettingsPage } from "@silo-code/sdk";

export const settingsPageRegistry = new Registry<SettingsPage>();

/**
 * The rail group that holds the Extensions manager page and every settings page
 * contributed by a non-core extension. The host forces non-core pages into this
 * group (see `createContext`'s `registerSettingsPage`) so a contributed page
 * can't scatter itself among the core groups.
 * @internal
 */
export const EXTENSIONS_SETTINGS_GROUP = "5_extensions";
