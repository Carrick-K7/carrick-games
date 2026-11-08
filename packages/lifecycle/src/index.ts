import type { Game, GameHost } from '@carrick/game-sdk/game';

/** Destroy revokes runtime/input ownership synchronously; completion acknowledges
 * resource disposal and durable writes. Rejection is failure, never a receipt.
 * No other API-1 method becomes asynchronous through this extension.
 */
export interface AwaitableDestroyGame extends Game {
  destroy(): void | Promise<void>;
}

export type GameLifecycleState = 'loading' | 'running' | 'stopped' | 'failed';

export interface GameLifecycleCapability {
  readonly protocol: 'carrick-game-lifecycle';
  readonly version: 1;
  readonly awaitsDestroy: true;
  /** Instance-scoped status, not progress, storage data or game-specific details.
   * A reporting game owns its async errors and must catch them before reporting.
   */
  report(state: GameLifecycleState): void;
}

/** Optional on API-1 hosts: metadata alone does not guarantee safe async close. */
export interface LifecycleGameHost extends GameHost {
  readonly lifecycle?: GameLifecycleCapability;
}

/** Check before acquiring resources that require an acknowledged close. Older
 * hosts may still call create(); the game must show its own compatibility page
 * without starting a persistent writer or silently substituting another mode.
 */
export function hasGameLifecycle(host: GameHost): host is LifecycleGameHost & { readonly lifecycle: GameLifecycleCapability } {
  const capability = (host as LifecycleGameHost).lifecycle;
  return capability !== null && typeof capability === 'object'
    && capability.protocol === 'carrick-game-lifecycle'
    && capability.version === 1 && capability.awaitsDestroy === true
    && typeof capability.report === 'function';
}
