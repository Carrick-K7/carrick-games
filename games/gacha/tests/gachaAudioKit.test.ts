import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  GACHA_AUDIO_SAMPLES,
  GACHA_CASE_OPEN,
  GACHA_REVEAL,
  GACHA_SPIN_RATTLE,
  GACHA_STRIP_LAND,
  GACHA_TICK_VARIANTS,
  GACHA_UI_CLICK,
  revealLayers,
  samplePath,
  tickLayers,
  type GachaSampleLayer,
} from '../src/gachaAudioKit';

const audioDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'audio');

function everyLayer(groups: GachaSampleLayer[][]): GachaSampleLayer[] {
  return groups.flat();
}

function isSaneLayer(layer: GachaSampleLayer) {
  expect(GACHA_AUDIO_SAMPLES).toContain(layer.sample);
  expect(layer.gain).toBeGreaterThan(0);
  expect(layer.gain).toBeLessThanOrEqual(0.6);
  expect(layer.delay ?? 0).toBeGreaterThanOrEqual(0);
  expect(layer.delay ?? 0).toBeLessThan(1.5);
  expect(Math.abs(layer.pan ?? 0)).toBeLessThanOrEqual(1);
  expect(layer.wet ?? 0).toBeGreaterThanOrEqual(0);
  expect(layer.wet ?? 0).toBeLessThanOrEqual(1);
  expect(layer.rate ?? 1).toBeGreaterThan(0.4);
  expect(layer.rate ?? 1).toBeLessThan(2.5);
}

describe('gacha case-opening sound kit', () => {
  it('ships exactly the assets the kit references, with provenance', () => {
    const shipped = readdirSync(audioDir).filter(name => name.endsWith('.wav')).map(name => name.replace(/\.wav$/, '')).sort();
    expect(shipped).toEqual([...GACHA_AUDIO_SAMPLES].sort());
    const credits = readFileSync(join(audioDir, '..', 'CREDITS.md'), 'utf8');
    for (const sample of GACHA_AUDIO_SAMPLES) expect(credits).toContain(`\`${sample}.wav\``);
    // Every referenced recording is listed with its Kenney source file.
    expect(credits.match(/\.ogg`/g)?.length ?? 0).toBeGreaterThanOrEqual(GACHA_AUDIO_SAMPLES.length);
    expect(credits).toMatch(/CC0/);
  });

  it('resolves sample paths inside the game release', () => {
    for (const sample of GACHA_AUDIO_SAMPLES) expect(samplePath(sample)).toBe(`audio/${sample}.wav`);
  });

  it('keeps every arranged layer inside safe mix bounds', () => {
    for (const group of [GACHA_CASE_OPEN, GACHA_STRIP_LAND, GACHA_UI_CLICK, ...GACHA_TICK_VARIANTS]) {
      expect(group.length).toBeGreaterThan(0);
      group.forEach(isSaneLayer);
    }
    for (const tier of GACHA_REVEAL) tier.forEach(isSaneLayer);
  });

  it('round-robins the ratchet instead of machine-gunning one tick', () => {
    const first = tickLayers(0);
    expect(tickLayers(GACHA_TICK_VARIANTS.length)).toEqual(first);
    expect(tickLayers(GACHA_TICK_VARIANTS.length + 1)).toEqual(tickLayers(1));
    for (let step = 0; step < GACHA_TICK_VARIANTS.length; step++) {
      const layers = tickLayers(step);
      expect(layers).toHaveLength(1);
      isSaneLayer(layers[0]);
    }
    const samples = GACHA_TICK_VARIANTS.map(group => group[0].sample);
    expect(new Set(samples).size).toBe(samples.length);
  });

  it('builds the unlock and stop from real mechanism layers', () => {
    const open = GACHA_CASE_OPEN.map(layer => layer.sample);
    expect(open).toContain('latch');
    expect(open).toContain('latch-heavy');
    // The lid swings open slightly after the latch releases.
    const latch = GACHA_CASE_OPEN.find(layer => layer.sample === 'latch')!;
    const body = GACHA_CASE_OPEN.find(layer => layer.sample === 'case-body')!;
    expect(body.delay!).toBeGreaterThan(latch.delay!);
    expect(GACHA_STRIP_LAND.map(layer => layer.sample)).toEqual(['thud', 'knock', 'latch-heavy']);
  });

  it('grows the reveal fanfare with rarity and peaks on the gold tier', () => {
    expect(GACHA_REVEAL).toHaveLength(5);
    const sizes = GACHA_REVEAL.map(tier => tier.length);
    expect(sizes[0]).toBe(1);
    expect(sizes[4]).toBeGreaterThan(sizes[3]);
    expect(sizes[4]).toBeGreaterThan(sizes[2]);
    // Clamping never escapes the arranged tiers.
    expect(revealLayers(-3)).toBe(GACHA_REVEAL[0]);
    expect(revealLayers(9)).toBe(GACHA_REVEAL[4]);
    expect(revealLayers(Number.NaN)).toBe(GACHA_REVEAL[0]);
  });

  it('reserves the top tier for the reverse riser and an ascending arpeggio', () => {
    const gold = revealLayers(4);
    const riser = gold.find(layer => layer.reverse);
    expect(riser?.sample).toBe('riser');
    // A reversed layer ends at its nominal delay, so it must be scheduled to
    // crest no later than the fanfare it leads into.
    const hit = Math.min(...gold.filter(layer => !layer.reverse).map(layer => layer.delay ?? 0));
    expect(riser!.delay!).toBeLessThanOrEqual(hit + 0.02);
    const plucks = gold.filter(layer => layer.sample === 'pluck');
    expect(plucks.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < plucks.length; i++) {
      expect(plucks[i].rate!).toBeGreaterThan(plucks[i - 1].rate!);
      expect(plucks[i].delay!).toBeGreaterThan(plucks[i - 1].delay!);
    }
    // Only the gold tier spends the grand bell, coin shimmer and riser.
    expect(gold.map(layer => layer.sample)).toContain('bell-grand');
    expect(gold.map(layer => layer.sample)).toContain('coins');
    for (const tier of GACHA_REVEAL.slice(0, 4)) {
      expect(tier.some(layer => layer.reverse)).toBe(false);
      expect(tier.map(layer => layer.sample)).not.toContain('coins');
    }
  });

  it('keeps the continuous strip friction quiet enough to sit under the ticks', () => {
    expect(GACHA_SPIN_RATTLE.gain).toBeGreaterThan(0);
    expect(GACHA_SPIN_RATTLE.gain).toBeLessThan(0.25);
    expect(GACHA_SPIN_RATTLE.rate).toBeGreaterThan(0.5);
    expect(GACHA_AUDIO_SAMPLES).toContain(GACHA_SPIN_RATTLE.sample);
    const tickGain = everyLayer(GACHA_TICK_VARIANTS)[0].gain;
    expect(tickGain).toBeGreaterThan(GACHA_SPIN_RATTLE.gain);
  });
});
