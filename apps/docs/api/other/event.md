# Event&lt;T&gt;

A subscribable event, modeled on VS Code's `Event<T>` convention: call it with a
listener and get back a [`Disposable`](/api/types/interfaces/Disposable) that
cancels the subscription. It's the shared shape for one-off, payload-carrying
notifications across the SDK (the first being
[`ctx.editors.onDidSave`](/api/editors/)).

```ts
import type { Event } from "@silo-code/sdk";
```

## Shape

```ts
type Event<T> = (listener: (e: T) => void) => Disposable;
```

A service exposes an event as a member typed `Event<T>`. You call it directly
with a listener; push the returned disposable onto `ctx.subscriptions` so it's
cleaned up when your extension deactivates.

## Example

```ts
export function activate(ctx: ExtensionContext) {
  ctx.subscriptions.push(
    ctx.editors.onDidSave(({ editorId, filePath }) => {
      ctx.log.info(`saved ${filePath}`);
    }),
  );
}
```

## Notes

- **Extensions never create emitters.** The matching emitter (`EventEmitter<T>`)
  lives in the extension host; only the subscribable `Event<T>` face is public.
  You consume events, you don't fire them.
- **Distinct from reactive state.** For "current value that changes over time"
  (active editor, workspace list, theme) use a service's `getState()` /
  `subscribe()` with [`useServiceState`](/api/types/functions/useServiceState).
  `Event<T>` is for discrete occurrences (a save happened), not observable state.
- **Distinct from the provider `subscribe*`/`invalidate*` pattern.** Those
  broadcast "re-query your provider" with no payload; an `Event<T>` delivers a
  typed payload describing what happened.

## Types

[`Event`](/api/types/type-aliases/Event)

## See also

[`ctx.editors.onDidSave`](/api/editors/) · [Roadmap](/roadmap)
