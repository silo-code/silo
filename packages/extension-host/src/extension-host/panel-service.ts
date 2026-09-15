import type { PanelService } from "@silo-code/sdk";
import { tabAdornmentMethodsFor } from "./tab-adornment-registry";

let service: PanelService | null = null;

/** @internal — host factory; extensions receive this as `ctx.panels`. */
export function getPanelService(): PanelService {
  if (service) return service;
  service = { ...tabAdornmentMethodsFor("panel") };
  return service;
}
