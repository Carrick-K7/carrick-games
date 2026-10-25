# CS world photographic material palette

These nine tileable photographic PBR material families are Poly Haven assets, **CC0-1.0**, initially checked on 2026-10-23; the plaster family was replaced and reverified on 2026-10-25. No Valve/Counter-Strike texture artwork is included. The Counter-Strike-like goal is the architectural surface treatment, not a reproduction of proprietary assets.

## License and exact provenance

Inspected [Poly Haven asset license](https://polyhaven.com/license): all HDRIs, textures and models are CC0; redistribution and commercial use are permitted. The [CC0 legal instrument](https://creativecommons.org/publicdomain/zero/1.0/) applies to the asset files. Website logos, preview renders, prose and API software are not the asset license and are not bundled.

The [public API terms](https://raw.githubusercontent.com/Poly-Haven/Public-API/master/ToS.md) were inspected. Offline requests identify themselves as `CarrickGames-OfflineTexturePrep/1.0`. The game does not use the live API. All runtime downloads are game-owned files resolved through the host's immutable per-instance `assetUrl`.

[Machine-readable provenance](./provenance.json) records every exact original download URL, source API URL, author, original byte count, original API MD5 (verified while downloading), original SHA-256 and derived WebP SHA-256/byte count. Authors below are credited voluntarily; CC0 does not require attribution.

| Family | Original material / author | Derived bytes, all three maps | Tile width |
|---|---|---:|---:|
| Plaster | [Worn Plaster Wall](https://polyhaven.com/a/worn_plaster_wall), Dimitrios Savva | 44,558 | 2.8 m |
| Sandstone | [Sandstone Blocks 05](https://polyhaven.com/a/sandstone_blocks_05), Rob Tuytel | 232,632 | 3 m |
| Brick | [Brick Wall 001](https://polyhaven.com/a/brick_wall_001), Dimitrios Savva (photography), Rob Tuytel (processing) | 172,126 | 3 m |
| Cobble | [Cobblestone Floor 02](https://polyhaven.com/a/cobblestone_floor_02), Rob Tuytel | 141,648 | 2 m |
| Concrete | [Concrete Floor 02](https://polyhaven.com/a/concrete_floor_02), Rob Tuytel | 159,852 | 2 m |
| Wood | [Wood Planks](https://polyhaven.com/a/wood_planks), Amal Kumar | 48,434 | 1.5 m |
| Metal | [Rusty Painted Metal](https://polyhaven.com/a/rusty_painted_metal), Amal Kumar | 29,402 | 2.2 m |
| Terracotta roof | [Clay Roof Tiles](https://polyhaven.com/a/clay_roof_tiles), Amal Kumar | 176,448 | 4 m |
| Snow | [Snow 02](https://polyhaven.com/a/snow_02), Rob Tuytel | 125,492 | 2 m |

## Preparation and budgets

The game-owned [offline preparation script](../../../prepare-world-materials.py) uses existing Python/Pillow tooling, not a new runtime dependency. It requests the original 1k JPG diffuse, OpenGL normal and roughness maps, verifies the provider's MD5 and computes SHA-256, resizes RGB to 512×512 using Lanczos, and writes WebP method 6 (quality 86 albedo/roughness; 90 normal). Roughness is grayscale duplicated into RGB for Three.js's green-channel sampler. Normal directions are sampled as linear data; Three.js normalizes them in the shader. The plaster albedo additionally uses Pillow Color enhancement 0.65, Brightness 1.22, then Contrast 0.42 on the resized encoded 8-bit RGB pixels; this is a documented tone adaptation, not an unmodified photo or linear-light exposure. Its normal and roughness maps are not tone-adjusted. Source physical size is about 1.8 m; 2.8 m is the authored repeat scale, with shader normal strength 0.20. Those art-direction settings are not asserted source measurements. Architectural photographs are not replaced by generated noise. Separately owned original paint, foliage-mask and sky textures are explicitly procedural, need no network fetch, and are included alongside the photographic palette in combined world budgets. There is no displacement/tessellation cost. The script prints the runtime manifest; after deliberately regenerating assets, update the manifest in the palette module and run its hash tests. Byte-identical encoding requires the recorded Pillow/WebP toolchain; source SHA-256 is retained independently.

- **27 images, nine distinct source families**, all 512×512.
- Full image payload: **1,130,592 bytes (1.078 MiB)**, well below the 4 MiB limit / 2 MiB preference.
- Basecolor-only image payload: **430,820 bytes (0.411 MiB)**.
- Full decoded RGBA8 base levels: **28,311,552 bytes (27 MiB)**.
- Full RGBA8 base plus complete mip chains: **37,748,700 bytes (~36 MiB)**, below 48 MiB. This is texture storage accounting, not a measured driver allocation or total scene memory claim.
- Basecolor-only RGBA8 with mip chains: **12,582,900 bytes (~12 MiB)**.
- Linear filtering/trilinear mipmaps, repeat wrapping, anisotropy clamped to 1–4; renderer integration should additionally clamp to hardware capability.
- Maximum four concurrent requests per palette; 15-second per-asset timeout; no automatic retries. Missing/invalid optional images leave solid-color or partial-texture materials playable and are visible in status diagnostics.

Metadata and this provenance document are small additional release files, not runtime texture requests; source originals are not bundled. GPU figures exclude shader/material/geometry/framebuffer/driver overhead. Download diagnostics count completed response payloads (including a completed payload whose subsequent decode fails), not unknown partial network transfers.

## Integration ownership

[WorldMaterialPalette](../../../src/csWorldMaterials.js) exports `WORLD_MATERIAL_MANIFEST[kind] = {sourceId, repeatMeters, maps: {map, normalMap, roughnessMap}}`; each map record has `path`, `width`, `height`, `encodedBytes`, `sha256`. The nine kind strings are exported as `WORLD_MATERIAL_KINDS`.

Create one palette per world with its captured `assetUrl`, call synchronous `material(kind)` while constructing meshes, then start `load()` in the background while the ready geometry renders with usable base materials. Gameplay does not wait for optional photographs. Explicit offline artwork capture awaits completed loading; the integration exposes `world.materialsReady` for that purpose. Materials/maps are shared only inside that instance. UVs should be world meters divided by `repeatMeters`, not legacy BSP texel normalization. All shared textures have unit repeat. `stone` aliases `sandstone`.

Use `{detail:false, anisotropy:1}` for low-cost software/mobile startup. This downloads only albedo and uses scalar roughness. `applyQuality()` changes bound slots without cloning/allocating; call `load()` after enabling detail to fetch any as-yet-unloaded maps. Switching down after high detail retains cached maps for cheap subsequent switches; create a low-detail palette initially to minimize retained GPU memory.

`load()` resolves JSON-safe `stats()` even when optional assets fail. Node/no-Image environments report `cpu-fallback` and **zero photographic textures loaded**, not a fake texture success. `dispose()` owns every cached texture and material, aborts pending loads, drops/releases late completions, nulls texture slots and is idempotent. The world's generic cleanup must not dispose palette-owned materials/maps again (`material.userData.worldMaterialPalette === true`).

The classifier maps legacy GoldSrc texture names to semantic families. Embedded fy_snow pixels were visually checked: `1-teks` snow, `2-teks` stone wall, `3-teks` stone trim, `4-teks` worn plaster, `5-teks` decorative poster replaced with plaster, `6-teks` wooden crate. Cutout names are recognized semantically but this palette does not invent alpha; the world integration decides whether to retain an independently licensed original alpha treatment. Neither currently retained BSP has cutout texture names.

[Focused tests](../../../tests/csWorldMaterials.test.ts) check current image hashes/dimensions, provenance alignment, source-family count, budgets, immutable URL routing, data color spaces, load concurrency/timeouts/failure fallback, low/high quality reuse, late completion safety and once-only disposal.
