/**
 * Spawn a Chat profile's agent briefly and read whatever `configOptions`
 * `session/new` advertises — for the profile editor's Session defaults UI.
 *
 * The options are agent-specific and self-describing; Silo does not hard-code
 * schemas per provider.
 */

import type { AgentSessionConfigOption } from "@silo-code/sdk";
import type { AgentProfileLaunch } from "../../state/types";
import { createAcpTransport } from "./acp-transport";
import { createAcpClient, type AcpConfigOption } from "./acp-jsonrpc";

function toSdkConfigOptions(
  opts: readonly AcpConfigOption[],
): AgentSessionConfigOption[] {
  return opts.map((o) => ({
    id: o.id,
    name: o.name,
    ...(o.description ? { description: o.description } : {}),
    category: o.category,
    type: o.type,
    currentValue: o.currentValue,
    options: o.options.map((c) => ({
      value: c.value,
      name: c.name,
      ...(c.description ? { description: c.description } : {}),
    })),
  }));
}

export type ChatLaunchProbe = Pick<
  Extract<AgentProfileLaunch, { interface: "chat" }>,
  "command" | "args" | "env"
>;

/** How long a successful probe is reused before spawning the agent again. */
export const CHAT_CONFIG_PROBE_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * How long a probe may run before it is abandoned and its child killed.
 *
 * This is a hard requirement, not a nicety. A probe is the one place Silo
 * spawns an agent outside `acp-sessions-service`, so its child is not in
 * `chat-agent-registry` and **nothing else will ever reap it**. An agent that
 * starts but never answers `initialize` is a real failure mode — the transport
 * streams stderr precisely to diagnose it — and `AcpClient`'s requests have no
 * timeout of their own: the promise settles when the agent replies or the
 * transport closes, whichever comes first, and neither happens. Without this
 * bound the `finally` below is unreachable and the process lives until Silo
 * exits.
 *
 * Generous on purpose: `initialize` alone can take several seconds on a cold
 * agent, and a false failure here reads to the user as "this agent is broken".
 */
export const CHAT_CONFIG_PROBE_TIMEOUT_MS = 15 * 1000;

type ProbeCacheEntry = {
  options: readonly AgentSessionConfigOption[];
  expiresAt: number;
};

const probeCache = new Map<string, ProbeCacheEntry>();

/**
 * Drop every entry past its TTL. Expiry was previously checked only on read,
 * so an entry nobody looked at again outlived its TTL for the life of the app
 * — and a probe cache key embeds the launch line's `env`, which is where a
 * profile's API key lives. Pruning on write bounds both the map's growth and
 * how long those values are retained.
 */
function pruneExpiredProbes(now = Date.now()): void {
  for (const [key, entry] of probeCache) {
    if (entry.expiresAt <= now) probeCache.delete(key);
  }
}

/** Stable key for a launch line — cwd does not affect what options advertise. */
export function chatConfigProbeCacheKey(launch: ChatLaunchProbe): string {
  const env = launch.env ?? {};
  const sortedEnv = Object.fromEntries(
    Object.keys(env)
      .sort()
      .map((key) => [key, env[key]!]),
  );
  return JSON.stringify({
    command: launch.command,
    args: launch.args,
    env: sortedEnv,
  });
}

/** A still-fresh cached result, if any — for instant paint without a spinner. */
export function peekCachedChatConfigOptions(
  launch: ChatLaunchProbe,
  now = Date.now(),
): readonly AgentSessionConfigOption[] | undefined {
  const key = chatConfigProbeCacheKey(launch);
  const entry = probeCache.get(key);
  if (!entry || entry.expiresAt <= now) {
    if (entry) probeCache.delete(key);
    return undefined;
  }
  return entry.options;
}

/** @internal — tests only */
export function _resetChatConfigProbeCacheForTests(): void {
  probeCache.clear();
}

/** @internal — tests only: proves pruning actually evicts, not just hides. */
export function chatConfigProbeCacheSizeForTests(): number {
  return probeCache.size;
}

/**
 * Run `initialize` + `session/new` against a throwaway cwd and return the
 * agent's advertised config options. Always disposes the child process.
 *
 * Results are cached for {@link CHAT_CONFIG_PROBE_CACHE_TTL_MS} per launch
 * line so reopening the profile editor does not respawn the agent every time.
 */
export async function probeChatConfigOptions(
  launch: ChatLaunchProbe,
  cwd: string,
): Promise<readonly AgentSessionConfigOption[]> {
  const cached = peekCachedChatConfigOptions(launch);
  if (cached) return cached;

  const client = createAcpClient(
    createAcpTransport({
      command: launch.command,
      args: launch.args,
      cwd,
      env: launch.env,
    }),
    {
      onUpdate: () => {},
      onPermission: (_request, respond) => respond({ outcome: "cancelled" }),
      onClosed: () => {},
    },
  );
  // Two independent guarantees, deliberately not chained. The timer kills the
  // child (nothing else can — a probe's process is not in the registry), and
  // it *separately* rejects the race below so this function settles no matter
  // what disposing does to the in-flight request. Relying on `dispose()` alone
  // would work today — the client rejects pending requests when disposed — but
  // it makes a hung probe's bound depend on a detail two modules away.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      client.dispose();
      reject(
        new Error(
          `${launch.command} did not answer within ${Math.round(
            CHAT_CONFIG_PROBE_TIMEOUT_MS / 1000,
          )}s — no session options detected.`,
        ),
      );
    }, CHAT_CONFIG_PROBE_TIMEOUT_MS);
  });

  async function ask(): Promise<readonly AgentSessionConfigOption[]> {
    await client.initialize();
    const session = await client.newSession(cwd);
    return toSdkConfigOptions(session.configOptions ?? []);
  }

  try {
    const options = await Promise.race([ask(), timeout]);
    pruneExpiredProbes();
    probeCache.set(chatConfigProbeCacheKey(launch), {
      options,
      expiresAt: Date.now() + CHAT_CONFIG_PROBE_CACHE_TTL_MS,
    });
    return options;
  } finally {
    clearTimeout(timer);
    client.dispose();
  }
}
