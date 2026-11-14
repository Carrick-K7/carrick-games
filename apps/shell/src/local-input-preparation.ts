import type { GameLifecycleState, LocalInputPreparationAttempt } from '@carrick/lifecycle';

export interface LocalInputReceipt {
  readonly state: 'awaiting-input';
  readonly inputId: string;
}

export interface PreparationEnvironment<Input extends object> {
  /** Current host, no newer selection/close in progress. */
  ownsCurrentIntent(): boolean;
  intent(): number;
  /** Identity lookup only; begin may bind a temporarily disabled/hidden input. */
  resolveInput(inputId: string): Input | null;
  isInteractive(input: Input): boolean;
  loading(): void;
  changed(receipt: LocalInputReceipt | undefined): void;
}

interface Attempt<Input> { epoch: number; intent: number; inputId: string; input: Input | null }
const refusedAttempt: LocalInputPreparationAttempt = Object.freeze({ report: () => false });

/** Pure per-host state machine. DOM inspection and public markers remain Shell
 * responsibilities. It never turns a previously refused report into readiness.
 */
export class LocalInputPreparationController<Input extends object> {
  private epoch = 0;
  private current: Attempt<Input> | undefined;
  private receipt: LocalInputReceipt | undefined;
  private failed = false;
  private revoked = false;
  private presentationPaused = false;

  constructor(private readonly environment: PreparationEnvironment<Input>) {}

  begin(inputId: string): LocalInputPreparationAttempt {
    if (!this.usable()) return refusedAttempt;
    this.invalidate();
    const attempt: Attempt<Input> = {
      epoch: this.epoch, intent: this.environment.intent(), inputId,
      input: typeof inputId === 'string' && inputId.length > 0 && inputId.length <= 200 && !/[\s\0]/.test(inputId)
        ? this.environment.resolveInput(inputId) : null,
    };
    this.current = attempt;
    this.environment.loading();
    return Object.freeze({ report: (state: 'awaiting-input') => this.report(attempt, state) });
  }

  /** Every lifecycle report, including repeated loading, fences old attempts. */
  lifecycle(state: GameLifecycleState): void {
    if (state === 'failed') this.failed = true;
    this.invalidate();
  }

  navigation(): void { this.invalidate(); }

  get boundInput(): Input | null { return this.current?.input ?? null; }
  get acceptedReceipt(): LocalInputReceipt | undefined { return this.receipt; }

  /** Removal is a lifetime boundary even if the same node is reinserted before
   * the next observation (an ABA detach/reinsert must not revive an attempt).
   */
  inputRemoved(input: Input): void { if (this.current?.input === input) this.invalidate(); }

  /** Shell overlays suspend presentation, not the bound attempt. The game must
   * explicitly re-report after its own input UI becomes interactive again.
   */
  setPresentationPaused(paused: boolean): void {
    this.presentationPaused = paused;
    if (paused) this.publish(undefined);
  }

  /** Mutation/resize checks only revoke receipts. No automatic ready transition. */
  refresh(): void {
    const attempt = this.current;
    if (!attempt) return;
    if (!this.live(attempt)) { this.invalidate(); return; }
    if (this.receipt && (this.presentationPaused || !this.environment.isInteractive(attempt.input!))) this.publish(undefined);
  }

  revoke(): void { this.revoked = true; this.invalidate(); }

  private usable(): boolean { return !this.revoked && !this.failed && this.environment.ownsCurrentIntent(); }

  private live(attempt: Attempt<Input>): boolean {
    return this.usable() && this.current === attempt && this.epoch === attempt.epoch
      && this.environment.intent() === attempt.intent && attempt.input !== null
      && this.environment.resolveInput(attempt.inputId) === attempt.input;
  }

  private report(attempt: Attempt<Input>, state: 'awaiting-input'): boolean {
    // A stale attempt must not revoke a newer attempt's successful receipt.
    if (this.current !== attempt || this.epoch !== attempt.epoch) return false;
    if (!this.live(attempt)) { this.invalidate(); return false; }
    if (state !== 'awaiting-input' || this.presentationPaused || !this.environment.isInteractive(attempt.input!)) {
      this.publish(undefined); return false;
    }
    this.publish({ state: 'awaiting-input', inputId: attempt.inputId });
    return true;
  }

  private invalidate(): void {
    ++this.epoch;
    this.current = undefined;
    this.publish(undefined);
  }

  private publish(receipt: LocalInputReceipt | undefined): void {
    if (this.receipt?.inputId === receipt?.inputId && this.receipt?.state === receipt?.state) return;
    this.receipt = receipt;
    this.environment.changed(receipt);
  }
}
