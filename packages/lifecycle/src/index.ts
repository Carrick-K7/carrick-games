import type { Game, GameHost } from '@carrick/game-sdk/game';
import type { GameModule } from '@carrick/game-sdk/catalog';

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

export const LOCAL_INPUT_PREPARATION_PROTOCOL = 'carrick-local-input-preparation' as const;

/** Pure release-module opt-in, not catalog metadata or a claim that input is ready. */
export interface LocalInputPreparationDeclaration {
  readonly protocol: typeof LOCAL_INPUT_PREPARATION_PROTOCOL;
  readonly version: 1;
  readonly kind: 'files';
}

export interface LocalInputPreparationModule extends GameModule {
  readonly localInputPreparation?: LocalInputPreparationDeclaration;
}

/** Host-owned public canvas status: data-game-preparation-protocol/version/kind
 * identify negotiation; data-game-preparation='awaiting-input' and
 * data-game-preparation-input identify only a currently accepted receipt.
 * Games must not manufacture these markers. Absence is NOT readiness.
 */
export interface LocalInputPreparationStatus extends LocalInputPreparationDeclaration {
  readonly state: 'awaiting-input';
  readonly inputId: string;
}

export interface LocalInputPreparationAttempt {
  /** True only when this attempt and its originally bound input are accepted now.
   * A rejected overlay/visibility check requires an explicit later report; it is
   * never a queued claim that resources will eventually become ready.
   */
  report(state: 'awaiting-input'): boolean;
}

export interface LocalInputPreparationCapability extends LocalInputPreparationDeclaration {
  /** Bind an existing, uniquely identified file input BEFORE asynchronous work.
   * The game must actually validate its required release resources before report.
   * This capability never grants VM, storage or persistent-writer authority.
   */
  begin(inputId: string): LocalInputPreparationAttempt;
}

export interface LocalInputPreparationGameHost extends LifecycleGameHost {
  readonly preparation?: LocalInputPreparationCapability;
}

export function isLocalInputPreparationDeclaration(value: unknown): value is LocalInputPreparationDeclaration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(fields).length !== 3) return false;
  // Read data descriptors only: a declaration must not execute getters.
  return fields.protocol?.value === LOCAL_INPUT_PREPARATION_PROTOCOL
    && fields.version?.value === 1 && fields.kind?.value === 'files';
}

/** Missing means legacy. Present-but-invalid/unknown must fail preflight, never
 * downgrade to legacy readiness or receive an unnegotiated host capability.
 */
export function readLocalInputPreparation(module: unknown): LocalInputPreparationDeclaration | undefined {
  if (!module || (typeof module !== 'object' && typeof module !== 'function')) throw new Error('Invalid game module');
  const field = Object.getOwnPropertyDescriptor(module, 'localInputPreparation');
  if (!field) {
    if ('localInputPreparation' in module) throw new Error('Inherited local-input preparation declaration');
    return undefined;
  }
  if (!('value' in field) || !isLocalInputPreparationDeclaration(field.value)) {
    throw new Error('Unsupported local-input preparation declaration');
  }
  return Object.freeze({ protocol: LOCAL_INPUT_PREPARATION_PROTOCOL, version: 1, kind: 'files' });
}

/** Both protocols are required; preparation is not a replacement for safe close. */
export function hasLocalInputPreparation(host: GameHost): host is LocalInputPreparationGameHost & {
  readonly lifecycle: GameLifecycleCapability;
  readonly preparation: LocalInputPreparationCapability;
} {
  if (!hasGameLifecycle(host)) return false;
  const capability = (host as LocalInputPreparationGameHost).preparation;
  return capability !== null && typeof capability === 'object'
    && capability.protocol === LOCAL_INPUT_PREPARATION_PROTOCOL
    && capability.version === 1 && capability.kind === 'files'
    && typeof capability.begin === 'function';
}
