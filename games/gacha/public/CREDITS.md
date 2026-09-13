# Gacha sound credits

The case-opening kit in `public/audio/` is built from **CC0 (public domain)**
recordings published by [Kenney](https://kenney.nl/assets) as *Casino Audio*,
*Interface Sounds*, *Impact Sounds* and *RPG Audio*. Kenney releases these packs
under CC0 1.0; attribution is not required and is given here as provenance.

| Shipped asset | Kenney source file | Pack |
|---|---|---|
| `tick-1.wav` | `tick_001.ogg` | Interface Sounds |
| `tick-2.wav` | `tick_002.ogg` | Interface Sounds |
| `tick-3.wav` | `tick_004.ogg` | Interface Sounds |
| `latch.wav` | `metalLatch.ogg` | RPG Audio |
| `latch-heavy.wav` | `impactMetal_heavy_000.ogg` | Impact Sounds |
| `case-body.wav` | `impactPlate_heavy_000.ogg` | Impact Sounds |
| `thud.wav` | `impactSoft_heavy_000.ogg` | Impact Sounds |
| `knock.wav` | `impactWood_heavy_000.ogg` | Impact Sounds |
| `chime-low.wav` | `bong_001.ogg` | Interface Sounds |
| `chime-mid.wav` | `glass_001.ogg` | Interface Sounds |
| `chime-glass.wav` | `impactGlass_light_000.ogg` | Impact Sounds |
| `bell.wav` | `impactBell_heavy_002.ogg` | Impact Sounds |
| `bell-grand.wav` | `impactBell_heavy_001.ogg` | Impact Sounds |
| `bell-deep.wav` | `impactBell_heavy_000.ogg` | Impact Sounds |
| `pluck.wav` | `pluck_002.ogg` | Interface Sounds |
| `coins.wav` | `handleCoins.ogg` | RPG Audio |
| `riser.wav` | `scratch_001.ogg` (played reversed) | Interface Sounds |
| `rattle.wav` | `dice-shake-1.ogg` | Casino Audio |
| `click.wav` | `click_001.ogg` | Interface Sounds |

Processing applied to each file: Ogg Vorbis decoded once, mixed to mono,
resampled to 22.05 kHz, trimmed at −54 dBFS, 1.5 ms fade-in and 10–450 ms
fade-out to remove trimmed edges, and peak-normalised to −1 dBFS. Levels,
layering, pitch (playback rate), stereo placement, the reverse-riser swell and
the reverb tail are arranged at runtime in `src/gachaAudioKit.ts`.

**No Counter-Strike, CS:GO or Valve audio is bundled, fetched or imitated by
sample.** This kit is an original arrangement of CC0 recordings; the case,
latch, ratchet and reveal structure is our own design. See
`games/cs/public/CREDITS.md` for the same licensing position applied to CS.
