/**
 * Shared logger for the `silo:extension-host` Output channel.
 *
 * Imported (and thus created) before any extension activates so the channel
 * appears first in the Output panel dropdown — ahead of `silo:application`
 * and any `ext:*` channels.
 * @internal
 */
import { createHostChannel } from "./output-store";

export const extHostLog = createHostChannel(
  "silo:extension-host",
  "Extension Host",
);
