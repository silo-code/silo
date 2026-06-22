import type {
  TerminalTabDecoration,
  TerminalTabDecorationProvider,
} from "@silo-code/sdk";

// Host-side registry for terminal tab decoration providers.
// Extensions register providers via ctx.terminals.registerTabDecoration().
// DockTab.tsx imports this registry directly (host-tier) to read decorations;
// extensions observe changes via ctx.terminals.subscribeTabDecorations().

const providers: TerminalTabDecorationProvider[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export const terminalTabDecorationRegistry = {
  register(provider: TerminalTabDecorationProvider): { dispose(): void } {
    providers.push(provider);
    notify();
    return {
      dispose() {
        const i = providers.indexOf(provider);
        if (i !== -1) providers.splice(i, 1);
        notify();
      },
    };
  },

  /** First non-null provider wins. */
  getTabDecoration(terminalId: string): TerminalTabDecoration | null {
    for (const p of providers) {
      const result = p.provide(terminalId);
      if (result !== null) return result;
    }
    return null;
  },

  invalidate(): void {
    notify();
  },

  subscribe(listener: () => void): { dispose(): void } {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
};
