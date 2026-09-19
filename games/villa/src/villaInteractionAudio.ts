/** Pure asset-free cue score. A cue names a committed action, never an input
 * device: native Use, E and canvas activation share the same controller hook.
 * Noise is filtered pink noise; tones are short, quiet, non-verbal gestures. */
export type VillaCuePart =
  | { noise: number; seconds: number; gain: number }
  | { hz: number; seconds: number; gain: number; wave: OscillatorType; to?: number; delay?: number };
const noise = (noise: number, seconds: number, gain: number): VillaCuePart => ({ noise, seconds, gain });
const tone = (hz: number, seconds: number, gain: number, to = hz, wave: OscillatorType = 'sine', delay = 0): VillaCuePart => ({ hz, seconds, gain, to, wave, delay });

export const VILLA_INTERACTION_CUES = {
  reject: [tone(235, .10, .045, 170)],
  busy: [tone(330, .055, .035, 300)],
  'wardrobe-open': [noise(520, .20, .075), tone(185, .15, .025, 240, 'triangle')],
  'wardrobe-close': [noise(370, .11, .09)],
  'fridge-open': [noise(1250, .13, .08), tone(95, .10, .025, 125)],
  'fridge-close': [noise(280, .14, .10), tone(110, .08, .025, 65)],
  'slide-open': [noise(1800, .30, .055), tone(480, .08, .018, 620)],
  'slide-close': [noise(1350, .28, .06), tone(300, .08, .022, 210, 'sine', .20)],
  'grill-open': [noise(2350, .08, .055), tone(740, .23, .04, 410, 'triangle')],
  'grill-close': [noise(2100, .07, .065), tone(430, .20, .045, 300, 'triangle')],
  sit: [noise(460, .18, .055)],
  bed: [noise(720, .30, .055)],
  stand: [noise(780, .13, .04)],
  swing: [tone(290, .28, .025, 370, 'triangle'), noise(1600, .13, .02)],
  'carry-chair': [noise(2100, .12, .05), tone(520, .10, .025, 360, 'triangle')],
  'place-chair': [noise(650, .13, .065), tone(310, .09, .025, 190, 'triangle')],
  'feed-dog': [noise(1800, .16, .055), tone(230, .13, .035, 320, 'triangle')],
  'feed-cat': [noise(1600, .15, .045), tone(530, .20, .032, 360)],
  'feed-parrot': [noise(2800, .12, .04), tone(1600, .13, .027, 2300)],
  'feed-rabbit': [noise(2450, .20, .055), tone(640, .065, .015, 510, 'triangle')],
  'feed-fish': [noise(3100, .09, .04), tone(950, .14, .023, 510)],
  'tea-brew': [noise(1100, .38, .07), tone(1500, .10, .025, 1200)],
  'tea-drink': [noise(1400, .23, .045), tone(1300, .08, .018, 1100)],
  'tea-ready': [tone(1250, .18, .038), tone(1660, .20, .025, 1660, 'sine', .10)],
  'tea-set-down': [tone(1700, .09, .03, 1250), noise(2200, .035, .025)],
  'faucet-on': [tone(1150, .04, .025, 850), noise(2300, .18, .045)],
  'faucet-off': [noise(1900, .07, .035), tone(740, .06, .022, 540)],
  'fire-on': [noise(2800, .045, .07), noise(380, .38, .08)],
  'fire-off': [noise(1650, .32, .065)],
  'device-on': [tone(420, .10, .04, 760)],
  'device-off': [tone(600, .09, .035, 290)],
  media: [tone(740, .08, .035), tone(990, .09, .025, 990, 'sine', .07)],
  'elevator-call': [tone(740, .10, .045)],
  'elevator-select': [tone(980, .10, .045)],
  'elevator-open': [noise(850, .38, .055)],
  'elevator-close': [noise(630, .38, .055)],
  'elevator-arrive': [tone(880, .16, .09), tone(1320, .22, .065, 1320, 'sine', .18)],
  crouch: [noise(900, .10, .035)],
  rise: [noise(1150, .12, .035)],
  jump: [noise(650, .08, .055)],
  land: [noise(380, .10, .085)],
  'panel-open': [tone(520, .085, .045, 780)],
  'panel-close': [tone(690, .07, .035, 470)],
  'ui-tab': [tone(850, .045, .03, 980)],
  setting: [tone(1100, .035, .025)],
  home: [tone(520, .16, .045, 660)],
  moment: [noise(780, .28, .03)],
  reset: [noise(1850, .07, .03), tone(660, .10, .03, 880)],
  'snooker-enter': [noise(1700, .12, .04)],
  'snooker-pot': [noise(350, .09, .065)],
  'park-start': [tone(650, .10, .045, 950)],
  'park-cancel': [tone(650, .10, .04, 420)],
  'park-arrive': [tone(660, .15, .05), tone(880, .17, .04, 880, 'sine', .12)],
  collision: [noise(280, .15, .10), tone(80, .12, .045, 45, 'triangle')],
  gear: [noise(1400, .055, .045)],
  'handbrake-on': [noise(2600, .08, .045)],
  'handbrake-off': [noise(1900, .04, .035)],
  'rally-split': [tone(950, .12, .035, 1250)],
  'rally-finish': [tone(790, .18, .045), tone(1185, .21, .035, 1185, 'sine', .13)],
} as const satisfies Record<string, readonly VillaCuePart[]>;
export type VillaInteractionCue = keyof typeof VILLA_INTERACTION_CUES;

/** Clamp distance before squaring; unknown/non-finite positions are inaudible. */
export function villaAudioProximity(distance: number, radius: number): number {
  return Number.isFinite(distance) && Number.isFinite(radius) && radius > 0
    ? Math.max(0, Math.min(1, 1 - Math.max(0, distance) / radius)) : 0;
}
/** A speed-direction change is not a combustion gearshift for an EV. It is the
 * single drive/reverse engagement clunk. Neutral/stopping alone is silent. */
export function villaAudioDriveDirection(speed: number): -1 | 0 | 1 {
  return Number.isFinite(speed) && Math.abs(speed) > .18 ? speed < 0 ? -1 : 1 : 0;
}
