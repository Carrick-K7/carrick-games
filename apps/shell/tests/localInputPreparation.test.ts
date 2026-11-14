import { describe, expect, it, vi } from 'vitest';
import type { GameLifecycleState } from '@carrick/lifecycle';
import { LocalInputPreparationController, type LocalInputReceipt } from '../src/local-input-preparation';

function fixture() {
  const first = { interactive: true }, second = { interactive: true };
  const inputs = new Map<string, typeof first | null>([['files', first], ['other', second]]);
  let owns = true, intent = 1, receipt: LocalInputReceipt | undefined;
  const changed = vi.fn((value: LocalInputReceipt | undefined) => { receipt = value; });
  const loading = vi.fn();
  const controller = new LocalInputPreparationController({
    ownsCurrentIntent: () => owns, intent: () => intent,
    resolveInput: id => inputs.get(id) ?? null, isInteractive: input => input.interactive,
    loading, changed,
  });
  return { controller, inputs, first, second, loading, changed,
    get receipt() { return receipt; }, set owns(value: boolean) { owns = value; }, set intent(value: number) { intent = value; } };
}

describe('local-input preparation attempt ownership', () => {
  it('binds once, requires an explicit receipt, and never infers running', () => {
    const f = fixture(), attempt = f.controller.begin('files');
    expect(f.loading).toHaveBeenCalledOnce(); expect(f.receipt).toBeUndefined();
    expect(attempt.report('awaiting-input')).toBe(true);
    expect(f.receipt).toEqual({ state: 'awaiting-input', inputId: 'files' });
    expect(attempt.report('awaiting-input')).toBe(true);
    expect(f.changed).toHaveBeenCalledOnce();
  });

  it('may bind a noninteractive element but must explicitly report again once usable', () => {
    const f = fixture(); f.first.interactive = false;
    const attempt = f.controller.begin('files');
    expect(attempt.report('awaiting-input')).toBe(false);
    f.first.interactive = true; f.controller.refresh(); expect(f.receipt).toBeUndefined();
    expect(attempt.report('awaiting-input')).toBe(true);
    f.first.interactive = false; f.controller.refresh(); expect(f.receipt).toBeUndefined();
    f.first.interactive = true; f.controller.refresh(); expect(f.receipt).toBeUndefined();
    expect(attempt.report('awaiting-input')).toBe(true);
  });

  it('refuses overlay-time reports and requires explicit reporting after dismissal', () => {
    const f = fixture(), attempt = f.controller.begin('files');
    expect(attempt.report('awaiting-input')).toBe(true);
    f.controller.setPresentationPaused(true); expect(f.receipt).toBeUndefined();
    expect(attempt.report('awaiting-input')).toBe(false);
    f.controller.setPresentationPaused(false); f.controller.refresh(); expect(f.receipt).toBeUndefined();
    expect(attempt.report('awaiting-input')).toBe(true);
  });

  it('does not bind a later element when the input did not exist at begin', () => {
    const f = fixture(), attempt = f.controller.begin('later');
    f.inputs.set('later', f.first);
    expect(attempt.report('awaiting-input')).toBe(false); expect(f.receipt).toBeUndefined();
    expect(f.controller.begin('later').report('awaiting-input')).toBe(true);
  });

  it.each(['replacement', 'removed', 'duplicate'] as const)('fences a %s binding permanently, even if the old ID returns', reason => {
    const f = fixture(), attempt = f.controller.begin('files');
    expect(attempt.report('awaiting-input')).toBe(true);
    f.inputs.set('files', reason === 'replacement' ? f.second : null);
    f.controller.refresh(); expect(f.receipt).toBeUndefined();
    f.inputs.set('files', f.first);
    expect(attempt.report('awaiting-input')).toBe(false);
    expect(f.controller.begin('files').report('awaiting-input')).toBe(true);
  });

  it('does not revive an attempt after a synchronous remove/reinsert ABA', () => {
    const f = fixture(), attempt = f.controller.begin('files');
    expect(f.controller.boundInput).toBe(f.first);
    f.controller.inputRemoved(f.second); expect(attempt.report('awaiting-input')).toBe(true);
    f.controller.inputRemoved(f.first);
    expect(f.controller.boundInput).toBeNull(); expect(attempt.report('awaiting-input')).toBe(false);
    expect(f.controller.begin('files').report('awaiting-input')).toBe(true);
  });

  it('rejects same-id replacement before the first report too', () => {
    const f = fixture(), attempt = f.controller.begin('files');
    f.inputs.set('files', f.second);
    expect(attempt.report('awaiting-input')).toBe(false); expect(f.receipt).toBeUndefined();
  });

  it('old reports cannot clear or replace a newer attempt receipt', () => {
    const f = fixture(), old = f.controller.begin('files'), next = f.controller.begin('other');
    expect(next.report('awaiting-input')).toBe(true);
    expect(old.report('awaiting-input')).toBe(false);
    expect(f.receipt?.inputId).toBe('other');
  });

  it.each(['loading', 'running', 'stopped', 'failed'] as GameLifecycleState[])('%s invalidates every prior attempt and receipt', state => {
    const f = fixture(), attempt = f.controller.begin('files');
    expect(attempt.report('awaiting-input')).toBe(true);
    f.controller.lifecycle(state); expect(f.receipt).toBeUndefined();
    expect(attempt.report('awaiting-input')).toBe(false);
    expect(f.controller.begin('files').report('awaiting-input')).toBe(state !== 'failed');
  });

  it('failed is latched across later lifecycle calls, attempts and UI repair', () => {
    const f = fixture(); f.controller.begin('files').report('awaiting-input');
    f.controller.lifecycle('failed'); f.controller.lifecycle('stopped'); f.controller.lifecycle('loading');
    expect(f.controller.begin('files').report('awaiting-input')).toBe(false);
    expect(f.loading).toHaveBeenCalledOnce(); expect(f.receipt).toBeUndefined();
  });

  it('latches failure before notifying observers that might reenter begin', () => {
    const f = fixture(); f.controller.begin('files').report('awaiting-input');
    const observe = f.changed.getMockImplementation()!;
    f.changed.mockImplementationOnce(receipt => { observe(receipt); f.controller.begin('files'); });
    f.controller.lifecycle('failed');
    expect(f.loading).toHaveBeenCalledOnce(); expect(f.controller.acceptedReceipt).toBeUndefined();
  });

  it('navigation changes invalidate an old async report without a DOM change', () => {
    const f = fixture(), old = f.controller.begin('files');
    f.intent = 2;
    expect(old.report('awaiting-input')).toBe(false);
    const next = f.controller.begin('files'); expect(next.report('awaiting-input')).toBe(true);
    expect(old.report('awaiting-input')).toBe(false); expect(f.receipt?.inputId).toBe('files');
  });

  it('explicit navigation fences and ownership loss revoke receipts immediately', () => {
    const f = fixture(), old = f.controller.begin('files'); old.report('awaiting-input');
    f.controller.navigation(); expect(f.receipt).toBeUndefined(); expect(old.report('awaiting-input')).toBe(false);
    f.owns = false; expect(f.controller.begin('files').report('awaiting-input')).toBe(false);
    f.owns = true; f.controller.begin('files').report('awaiting-input'); f.owns = false;
    f.controller.refresh(); expect(f.receipt).toBeUndefined();
  });

  it('revocation is final even when the host/ID becomes usable again', () => {
    const f = fixture(), old = f.controller.begin('files'); old.report('awaiting-input');
    f.controller.revoke(); f.owns = true;
    expect(old.report('awaiting-input')).toBe(false); expect(f.controller.begin('files').report('awaiting-input')).toBe(false);
    expect(f.receipt).toBeUndefined();
  });

  it.each(['', 'has spaces', 'a'.repeat(201), '\0'])('invalid input ID cannot obtain a receipt: %j', id => {
    const f = fixture(); f.inputs.set(id, f.first);
    expect(f.controller.begin(id).report('awaiting-input')).toBe(false); expect(f.receipt).toBeUndefined();
  });

  it('unknown readiness states never become accepted', () => {
    const f = fixture(), attempt = f.controller.begin('files');
    expect(attempt.report('loading' as 'awaiting-input')).toBe(false);
    expect(f.receipt).toBeUndefined();
  });
});
