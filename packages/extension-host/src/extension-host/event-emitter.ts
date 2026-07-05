import type { Disposable, Event } from "@silo-code/sdk";

// The host-side counterpart to the SDK's `Event<T>` type. An extension never
// constructs one of these — it only ever receives the `.event` face (an
// `Event<T>`) through `ctx`. The host owns the emitter and calls `.fire(e)`.
//
// This is the single, shared implementation of the subscribe/emit shape; new
// host events should use it rather than hand-rolling another `Set<listener>`
// (the older `subscribe*`/`invalidate*` registries predate it).

/**
 * A typed event emitter. Expose `emitter.event` as the public `Event<T>` on a
 * service, and call `emitter.fire(value)` from the host when the event occurs.
 *
 * @internal
 */
export class EventEmitter<T> {
  private readonly listeners = new Set<(e: T) => void>();

  /**
   * The subscribable face of this emitter — hand this out as the service's
   * `Event<T>` member. Calling it registers a listener and returns a
   * {@link Disposable} that removes it.
   */
  readonly event: Event<T> = (listener) => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  /** Deliver `value` to every current listener. */
  fire(value: T): void {
    // Snapshot so a listener that (un)subscribes during dispatch can't mutate
    // the set we're iterating.
    for (const listener of [...this.listeners]) listener(value);
  }

  /** Drop all listeners (e.g. on teardown). */
  dispose(): void {
    this.listeners.clear();
  }
}
