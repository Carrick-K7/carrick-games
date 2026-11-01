import type { AwaitableDestroyGame } from '@carrick/lifecycle';

export class GameCloseError extends Error {
  constructor(readonly errors: readonly unknown[]) { super('Multiple game close operations failed'); }
}

type CloseResult = { ok: true } | { ok: false; error: unknown };

/** One Shell-owned close barrier. Intents can change while it is pending, but no
 * replacement may mount until the actual return value settles. No timeout can
 * turn an unacknowledged resource/persistence close into success.
 */
export class GameCloseGate {
  private pending: Promise<void> | undefined;
  private latest: Promise<CloseResult> | undefined;
  private readonly closed = new WeakMap<AwaitableDestroyGame, Promise<void>>();

  get isClosing(): boolean { return this.pending !== undefined; }

  wait(): Promise<void> { return this.pending ?? Promise.resolve(); }

  /** A selection owns failures that settle while it is still preflighting,
   * even if there is no longer a pending promise when it reaches teardown.
   * Only an explicit intent begun after settlement may try fresh navigation.
   */
  checkpoint(): () => Promise<void> {
    const previous = this.latest;
    const pending = this.pending !== undefined;
    return async () => {
      const latest = this.latest;
      if (latest && (pending || latest !== previous)) {
        const result = await latest;
        if (!result.ok) throw result.error;
      }
    };
  }

  close(instance: AwaitableDestroyGame | null, releaseStyles?: () => void): Promise<void> {
    if (instance && this.closed.has(instance)) return this.closed.get(instance)!;
    if (!instance && !releaseStyles) return this.wait();
    // Publish the barrier before invoking game code (including stop/destroy),
    // so synchronous re-entry cannot destroy twice or slip past the close.
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const pending = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
    this.pending = pending;
    // Retain an outcome, not an unobserved rejected promise. A checkpoint
    // rethrows the exact failure; this is not a global error suppressor.
    this.latest = pending.then(() => ({ ok: true as const }), error => ({ ok: false as const, error }));
    if (instance) this.closed.set(instance, pending);
    const finish = () => { if (this.pending === pending) this.pending = undefined; };
    void (async () => {
      const errors: unknown[] = [];
      try { instance?.stop(); } catch (error) { errors.push(error); }
      try {
        // Await assimilates foreign-realm promises and thenables as well as void.
        // stop failure must not prevent the one resource-disposal attempt.
        await instance?.destroy();
      } catch (error) { errors.push(error); }
      try { releaseStyles?.(); } catch (error) { errors.push(error); }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new GameCloseError(errors);
    })().then(() => { finish(); resolve(); }, error => { finish(); reject(error); });
    return pending;
  }
}
