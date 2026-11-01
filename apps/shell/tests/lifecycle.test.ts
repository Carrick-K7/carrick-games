import { describe, expect, it, vi } from 'vitest';
import { runInNewContext } from 'node:vm';
import type { AwaitableDestroyGame } from '@carrick/lifecycle';
import { GameCloseError, GameCloseGate } from '../src/lifecycle';

function game(destroy: () => unknown, stop = vi.fn()) {
  return { stop, destroy: vi.fn(destroy) } as unknown as AwaitableDestroyGame;
}
function deferred() {
  let resolve!: () => void, reject!: (error: unknown) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('Shell close barrier', () => {
  it('stops immediately, destroys once, and retains exactly the old style lease until receipt', async () => {
    const gate = new GameCloseGate(), held = deferred(), styles = vi.fn();
    const old = game(() => held.promise);
    const close = gate.close(old, styles);
    expect(old.stop).toHaveBeenCalledOnce();
    expect(old.destroy).toHaveBeenCalledOnce();
    expect(gate.close(old, styles)).toBe(close);
    expect(gate.close(null)).toBe(close);
    expect(styles).not.toHaveBeenCalled();
    held.resolve(); await close;
    expect(styles).toHaveBeenCalledOnce();
    expect(gate.close(old, styles)).toBe(close);
    expect(old.destroy).toHaveBeenCalledOnce();
  });

  it.each(['resolve', 'reject'] as const)('assimilates cross-realm thenables: %s', async mode => {
    const gate = new GameCloseGate();
    const foreign = runInNewContext(`({ then(resolve, reject) { ${mode}(${mode === 'resolve' ? '' : "new Error('foreign failure')"}); } })`);
    expect(foreign instanceof Promise).toBe(false);
    const styles = vi.fn(), old = game(() => foreign);
    const close = gate.close(old, styles);
    if (mode === 'resolve') await close;
    else await expect(close).rejects.toThrow('foreign failure');
    expect(styles).toHaveBeenCalledOnce();
    await gate.wait();
  });

  it('assimilates a foreign Promise without instanceof checks', async () => {
    const foreign = runInNewContext('Promise.resolve()');
    expect(foreign instanceof Promise).toBe(false);
    await new GameCloseGate().close(game(() => foreign));
  });

  it.each(['throw', 'reject', 'getter'] as const)('propagates real destroy failure: %s', async mode => {
    const error = new Error('unacknowledged write'), styles = vi.fn(), gate = new GameCloseGate();
    const old = game(() => {
      if (mode === 'throw') throw error;
      if (mode === 'getter') return { get then() { throw error; } };
      return Promise.reject(error);
    });
    await expect(gate.close(old, styles)).rejects.toBe(error);
    expect(styles).toHaveBeenCalledOnce();
    expect(old.destroy).toHaveBeenCalledOnce();
    await gate.wait();
  });

  it('supports synchronous legacy destroy', async () => {
    const old = game(() => undefined), styles = vi.fn();
    await new GameCloseGate().close(old, styles);
    expect(old.stop).toHaveBeenCalledOnce(); expect(old.destroy).toHaveBeenCalledOnce();
    expect(styles).toHaveBeenCalledOnce();
  });

  it('publishes its barrier before reentrant game code runs', async () => {
    const gate = new GameCloseGate(), held = deferred(), styles = vi.fn();
    let reentered: Promise<void> | undefined;
    const old = game(() => { reentered = gate.close(old, styles); return held.promise; });
    const close = gate.close(old, styles);
    expect(reentered).toBe(close); expect(old.destroy).toHaveBeenCalledOnce();
    held.resolve(); await close; expect(styles).toHaveBeenCalledOnce();
  });

  it('drains held destroy after stop failure and preserves all real failures', async () => {
    const stopError = new Error('stop'), destroyError = new Error('destroy'), styleError = new Error('style');
    const gate = new GameCloseGate(), held = deferred();
    const old = game(() => held.promise, vi.fn(() => { throw stopError; }));
    const close = gate.close(old, () => { throw styleError; });
    expect(gate.close(null)).toBe(close);
    expect(old.destroy).toHaveBeenCalledOnce();
    let done = false;
    const observation = close.then(() => { done = true; }, error => { done = true; return error; });
    await Promise.resolve(); expect(done).toBe(false);
    held.reject(destroyError);
    const error = await observation;
    expect(error).toBeInstanceOf(GameCloseError);
    expect(error.errors).toEqual([stopError, destroyError, styleError]);
  });

  it('remembers a failure that settles before a pending selection finishes preflight', async () => {
    const gate = new GameCloseGate(), held = deferred(), error = new Error('write failed');
    const beforeClose = gate.checkpoint();
    const closed = gate.close(game(() => held.promise));
    const duringClose = gate.checkpoint();
    held.reject(error); await expect(closed).rejects.toBe(error);
    await gate.wait(); // No promise is pending now, but these intents own the failure.
    await expect(beforeClose()).rejects.toBe(error);
    await expect(duringClose()).rejects.toBe(error);
    await gate.checkpoint()(); // Only a fresh, post-failure explicit intent can recover.
  });

  it('still attempts destroy after stop fails, and never reports success', async () => {
    const error = new Error('stop failed');
    const old = game(() => undefined, vi.fn(() => { throw error; }));
    await expect(new GameCloseGate().close(old)).rejects.toBe(error);
    expect(old.destroy).toHaveBeenCalledOnce();
  });
});
