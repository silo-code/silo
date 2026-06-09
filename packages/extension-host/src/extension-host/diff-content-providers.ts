import type { Disposable } from "@silo-code/sdk";
import type { DiffContentProvider } from "@silo-code/sdk";

// Registry of diff-content providers. A diff record stores a `providerId`; the
// host calls the matching provider on (re)mount to resolve the two sides. This
// is what keeps `core.editor` generic — it renders any two contents and never
// knows where they came from (git composes its own; see `silo.git`).

const providers = new Map<string, DiffContentProvider>();

/** Register a provider under `providerId`. Returns a Disposable that removes it. */
export function registerDiffContentProvider(
  providerId: string,
  provider: DiffContentProvider,
): Disposable {
  if (providers.has(providerId)) {
    throw new Error(`diff content provider already registered: ${providerId}`);
  }
  providers.set(providerId, provider);
  return {
    dispose() {
      if (providers.get(providerId) === provider) providers.delete(providerId);
    },
  };
}

/** Resolve the provider for `providerId`, or `undefined` if none is registered. */
export function getDiffContentProvider(
  providerId: string,
): DiffContentProvider | undefined {
  return providers.get(providerId);
}
