/*
 * Opening-animation mode abstraction for the Gacha game.
 *
 * Add future reveal styles (card flip, slot machine, portal...) by
 * implementing the GachaOpenMode interface and registering a factory in
 * OPENING_MODES below. The game renders a mode switcher automatically
 * once more than one mode exists — no game-side changes required.
 */

import type { GachaSfx } from './gachaAudio.js';
import type { GachaRoll } from './gachaData.js';
import { createCsgoStripMode } from './gachaModeCsgo.js';

export interface GachaOpenContext {
  width: number;
  height: number;
  dark: boolean;
  zh: boolean;
  sfx: GachaSfx;
  roll: GachaRoll;
}

export interface GachaOpenMode {
  readonly id: string;
  /**
   * Advance the animation by dt seconds. `skip` is true when the user
   * asked to jump straight to the result (honored only when canSkip()).
   * Returns true once the mode is finished. The winning item is always
   * settled on screen in the final frame before this returns true.
   */
  update(dt: number, skip: boolean): boolean;
  draw(ctx: CanvasRenderingContext2D): void;
  /** True when the user may skip straight to the result. */
  canSkip(): boolean;
}

export interface GachaOpenModeFactory {
  readonly name: string;
  readonly nameZh: string;
  create(ctx: GachaOpenContext): GachaOpenMode;
}

/* Registry — register new modes here; the menu shows a switcher when > 1. */
export const OPENING_MODES: GachaOpenModeFactory[] = [
  createCsgoStripMode,
];

export function createOpeningMode(index: number, ctx: GachaOpenContext): GachaOpenMode {
  const factory = OPENING_MODES[((index % OPENING_MODES.length) + OPENING_MODES.length) % OPENING_MODES.length];
  return factory.create(ctx);
}

export function openingModeCount(): number {
  return OPENING_MODES.length;
}

/** Label for a mode index; safe for any integer (wraps around). */
export function openingModeLabel(index: number): { name: string; nameZh: string } {
  const factory = OPENING_MODES[((index % OPENING_MODES.length) + OPENING_MODES.length) % OPENING_MODES.length];
  return { name: factory.name, nameZh: factory.nameZh };
}
