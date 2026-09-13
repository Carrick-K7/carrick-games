/*
 * Case-opening sound kit — recorded CC0 material, arranged like the real
 * thing: a dry metal ratchet under the strip, a two-stage latch on unlock,
 * a heavy settle when the strip stops, and a reveal fanfare that grows with
 * the rarity tier. Sample provenance and licences live in
 * games/gacha/public/CREDITS.md.
 *
 * This module is pure data so the arrangement stays unit-testable; the
 * WebAudio engine lives in gachaAudio.ts.
 */

export const GACHA_AUDIO_SAMPLES = [
  'tick-1', 'tick-2', 'tick-3',
  'latch', 'latch-heavy', 'case-body',
  'thud', 'knock',
  'chime-low', 'chime-mid', 'chime-glass',
  'bell', 'bell-grand', 'bell-deep',
  'pluck', 'coins', 'riser', 'rattle', 'click',
] as const;

export type GachaSample = typeof GACHA_AUDIO_SAMPLES[number];

export interface GachaSampleLayer {
  sample: GachaSample;
  /** Linear gain before the master bus. */
  gain: number;
  /** Playback rate; also transposes the recording. */
  rate?: number;
  /** Seconds after the event's scheduled start. */
  delay?: number;
  /** Stereo position, -1..1. */
  pan?: number;
  /** Reverb send, 0..1. */
  wet?: number;
  /**
   * Play the buffer backwards. A reversed layer's `delay` marks when it
   * *ends*, so it leads into that moment instead of starting after it.
   */
  reverse?: boolean;
}

/** Dry ratchet ticks; the engine round-robins so the strip never machine-guns. */
export const GACHA_TICK_VARIANTS: GachaSampleLayer[][] = [
  [{ sample: 'tick-1', gain: 0.30, wet: 0.04 }],
  [{ sample: 'tick-2', gain: 0.34, wet: 0.04 }],
  [{ sample: 'tick-3', gain: 0.27, wet: 0.05 }],
];

/** Two-stage key turn: mechanism hit, then the latch giving way, then the lid. */
export const GACHA_CASE_OPEN: GachaSampleLayer[] = [
  { sample: 'latch-heavy', gain: 0.34, wet: 0.10 },
  { sample: 'latch', gain: 0.40, delay: 0.055, wet: 0.14 },
  { sample: 'case-body', gain: 0.22, delay: 0.11, rate: 1.04, wet: 0.20 },
];

/** Strip stop: heavy settle with a wooden knock on top. */
export const GACHA_STRIP_LAND: GachaSampleLayer[] = [
  { sample: 'thud', gain: 0.50, wet: 0.16 },
  { sample: 'knock', gain: 0.20, delay: 0.045, wet: 0.10 },
  { sample: 'latch-heavy', gain: 0.14, delay: 0.10, rate: 1.18, wet: 0.08 },
];

const MAJOR_ARPEGGIO = [1, 1.26, 1.5, 2];

/**
 * Reveal fanfare per tier, 0 (milspec) … 4 (rare special). Each step adds a
 * voice: soft chime → glass → bell → deep bell with boom → grand bell with a
 * reverse-riser swell, plucked arpeggio and a coin shimmer tail.
 */
export const GACHA_REVEAL: GachaSampleLayer[][] = [
  [{ sample: 'chime-low', gain: 0.42, wet: 0.32 }],
  [
    { sample: 'chime-mid', gain: 0.40, wet: 0.34 },
    { sample: 'chime-low', gain: 0.22, delay: 0.08, wet: 0.30 },
  ],
  [
    { sample: 'bell', gain: 0.42, wet: 0.36 },
    { sample: 'chime-glass', gain: 0.24, delay: 0.09, wet: 0.34 },
    { sample: 'chime-mid', gain: 0.18, delay: 0.18, wet: 0.32 },
  ],
  [
    { sample: 'bell-deep', gain: 0.44, wet: 0.38 },
    { sample: 'thud', gain: 0.22, rate: 1.06, wet: 0.30 },
    { sample: 'bell', gain: 0.22, delay: 0.13, wet: 0.36 },
    { sample: 'chime-glass', gain: 0.20, delay: 0.22, wet: 0.34 },
  ],
  [
    // The reversed riser is scheduled to crest on the bell, not after it.
    { sample: 'riser', gain: 0.26, reverse: true, delay: 0.02, wet: 0.34 },
    { sample: 'thud', gain: 0.30, rate: 0.96, wet: 0.32 },
    { sample: 'bell-grand', gain: 0.44, wet: 0.42 },
    ...MAJOR_ARPEGGIO.map((rate, i) => ({
      sample: 'pluck' as const,
      gain: 0.24 - i * 0.02,
      rate,
      delay: 0.06 + i * 0.085,
      pan: i % 2 === 0 ? 0.22 : -0.22,
      wet: 0.34,
    })),
    { sample: 'coins', gain: 0.26, delay: 0.42, pan: -0.18, wet: 0.40 },
    { sample: 'chime-glass', gain: 0.16, rate: 1.5, delay: 0.55, pan: 0.25, wet: 0.44 },
  ],
];

/** Continuous rattle under the strip, its rate driven by strip speed. */
export const GACHA_SPIN_RATTLE = { sample: 'rattle' as const, gain: 0.16, rate: 0.78 };

/** UI confirmation click. */
export const GACHA_UI_CLICK: GachaSampleLayer[] = [{ sample: 'click', gain: 0.34, wet: 0.08 }];

export const GACHA_REVEAL_TIERS = GACHA_REVEAL.length;

/** Tier index clamped into the arranged range. */
export function revealLayers(tier: number): GachaSampleLayer[] {
  const index = Math.min(GACHA_REVEAL_TIERS - 1, Math.max(0, Math.floor(tier) || 0));
  return GACHA_REVEAL[index];
}

/** Round-robin tick variant for the n-th boundary crossing. */
export function tickLayers(step: number): GachaSampleLayer[] {
  const index = Math.abs(Math.floor(step)) % GACHA_TICK_VARIANTS.length;
  return GACHA_TICK_VARIANTS[index];
}

/** Relative path of a kit sample inside the game's release assets. */
export function samplePath(sample: GachaSample): string {
  return `audio/${sample}.wav`;
}
