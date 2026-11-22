# Villa exterior color maps

[`VILLA_GROUND_SCANS`](../src/villaGroundScanData.ts) contains three opaque, power-of-two WebP images as data URLs. They are data, not loaders. No duplicate bitmaps in `public`, external URLs in the module, normal/height maps, or build-time asset requests. Use `THREE.SRGBColorSpace` and a white base color as the neutral starting point; another saturated tint multiplies the photograph again. Use repeat wrapping and mipmapping for grazing views.

| Key / use | Decoded size | WebP bytes | One repeat in scene (U × V) | Mean decoded sRGB (0–255) |
| --- | ---: | ---: | --- | --- |
| `turf` — cultivated lawn | 512 × 512 | 98,750 | ≈1.25 × 1.25 m | 80, 105, 65 |
| `gravel` — packed, neutral pea-gravel finish | 1024 × 1024 | 152,322 | 1.00 × 1.00 m | 153, 147, 139 |
| `timber` — weathered cedar face for modeled boards | 1024 × 256 | 33,102 | 2.50 m **along grain U** × 0.35 m across grain V | 133, 106, 83 |

**Total: 284,174 compressed image bytes; 379,148 bytes for the entire inline module**, including base64 and TypeScript. If each texture is uploaded once as RGBA8, complete mip pyramids use 8,388,612 bytes (~8 MiB), excluding scene/driver/CPU overhead. Broad lawn mowing bands and individual wood joints are not painted into these maps. The timber is face grain, not end grain.

## Sources and rights

Checked 2026-11-22. These are individual downloadable **assets**, not website previews, gallery renders, screenshots or generated illustrations. Poly Haven explicitly dedicates its assets to [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) and permits modification, commercial use and redistribution ([supplier license](https://polyhaven.com/license)). Its [API terms](https://polyhaven.com/our-api) apply separately to the live service; Villa does not call it. The checks below used the supplier's published file sizes and MD5s; SHA-256 was computed independently over the actual source and output bytes.

### Cultivated turf

- [Suburban Soccer Park](https://polyhaven.com/a/suburban_soccer_park), **Dimitrios Savva** (photography), **Jarod Guest** (processing), Poly Haven / CC0. [Individual tonemapped panorama JPEG](https://dl.polyhaven.org/file/ph-assets/HDRIs/extra/Tonemapped%20JPG/suburban_soccer_park.jpg) · [file inventory](https://api.polyhaven.com/files/suburban_soccer_park).
- Actual input: `suburban_soccer_park.jpg`, **8192 × 4096 RGB, 38,416,679 B**, sRGB. Supplier MD5 `5ad1e7be532ec2a95924e5e92449fba4`; source SHA-256 `ebf777257fd0225fe8d22bcb95a06e472a756cb9f7e33993f4467d037a2b4e2c`.
- Only a patch of short, green grass on the actual overcast soccer field is used. A 2×-sampled ground-plane reprojection corrects the panorama's perspective: assume camera height 1.50 m, center 1.20 m forward, at longitude 0.74 turns of the source. The patch plus its overlap samples approximately x=4983–7283, y=2848–3619 of the panorama, away from the tripod pole. This is **not** an axis-aligned rectangle filled edge-to-edge. Downsample to 576² with Lanczos, join the two 64 px overlaps on minimum-difference blade paths and retain a 512² repeat. Chroma ×0.85; grade to the stated mean. WebP quality 82.
- This is photographed living turf, **not** a calibrated photogrammetric PBR/albedo or height scan. Camera height, footprint and mowing condition were not surveyed; the original photograph retains some soft ambient shading. No sky or other scene content is in the map. Output SHA-256 `c0b3de55e0f11ec817e1ffedc1fedfb332d919f8c2c58f9a122bea548639742b`.

### Compacted pea-gravel finish

- [Clean Pebbles](https://polyhaven.com/a/clean_pebbles), **Charlotte Baglioni** (photography), **Dario Barresi** (processing), Poly Haven / CC0. [Individual 1K diffuse JPEG](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/clean_pebbles/clean_pebbles_diff_1k.jpg) · [file inventory](https://api.polyhaven.com/files/clean_pebbles).
- Actual input: `clean_pebbles_diff_1k.jpg`, **1024 × 1024 RGB, 820,570 B**. Supplier MD5 `01c641abeb4d2e1659e280f69a8e6cc7`; source SHA-256 `902b115c4c0ace069862368b751e4799f338164cee62b53b61df3b6994165d95`. The untagged diffuse JPEG is interpreted as sRGB, not linear data.
- Keep the entire tightly packed, rounded aggregate tile; no crop or resample. The [published footprint](https://api.polyhaven.com/info/clean_pebbles) is 2 × 2 m. For this smaller pea-gravel finish use **half that pitch**: at 1.00 m per tile, 7–23 texels read as ≈7–22 mm stones. Some fines and larger stones remain; this is a visual size target, not a certified sieve distribution or compaction measurement. Reduce chroma to 0.67, contrast ×1.12 and neutralize the warm cast. WebP quality 79. Output SHA-256 `07c0c90bff27b0dbc45017cad9c3944422e80768c4f9793e81c7ca9b3bd505b6`.

### Cedar board face

- [Japanese Cedar Planks](https://polyhaven.com/a/japanese_cedar_planks), **Charlotte Baglioni** (scanning), **Rico Cilliers** (processing), Poly Haven / CC0. The asset page records its public unlock. [Individual 8K diffuse JPEG](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/8k/japanese_cedar_planks/japanese_cedar_planks_diff_8k.jpg) · [file inventory](https://api.polyhaven.com/files/japanese_cedar_planks).
- Actual input: `japanese_cedar_planks_diff_8k.jpg`, **8192 × 8192 RGB, 30,730,947 B**, sRGB. Supplier MD5 `33b2fc9b8c3d56034bc8e39f6500237f`; source SHA-256 `6bf1d467506e454d47e530b786ad2ca9d5e6bbbdb7cccac47b5f8d89a5413e6f`.
- The complete scan represents [1.13 × 1.13 m](https://api.polyhaven.com/info/japanese_cedar_planks) and includes multiple adjacent planks. Do **not** use that pitch for this derivative: take only the **440 × 8192 px interior of one board**, crop `[6536,6976) × [0,8192)`. Rotate 90° so the long grain runs along **U**. Lanczos resample to 1056 × 152, close the 32 px length overlap. Phase-shift a second copy of the same interior by 419 px and stitch the two 24 px transverse overlaps along low-error grain paths. This makes one repeating face, with no photographed joints to print over the mesh's own joinery. Grade the strongly amber source to a quiet, weathered brown: chroma ×0.46, contrast ×1.28. WebP quality 83.
- **2.50 × 0.35 m is an authored stock mapping, not a measured single board of that size**; the original plank's sampled width was ~61 mm. Align U with the length of each fence rail, picket or deck plank; V with its width. Fixed per-board UV offsets can vary the grain without changing repeat size. Color is an art finish, not a material-aging measurement. Output SHA-256 `00fda7e25102bb479c9425cb2b4eef4b64530607ae048923c38b67ec17c1166b`.

## Offline reproduction

Save the three individually linked original JPEGs, under their exact filenames, to a local input directory **outside the repository**. [The preparation script](prepare_ground_scans.py) accepts only these SHA-256-pinned inputs; it never contacts a server. From the repository root, with an existing Pillow installation:

```sh
# Read-only comparison against the checked-in data module; add --write to regenerate it.
python3 -B games/villa/assets-sources/prepare_ground_scans.py /path/to/local-originals
```

Verified byte-for-byte with Python 3.14.4, Pillow 13.0.0, libjpeg-turbo 3.2.0 and libwebp 1.6.0 (lossy, method 6). Encoder versions can affect compressed bytes. The offline tool is not a project dependency or a build step. Decode checks verified the three single-frame RGB WebPs, their sizes, complete hashes and power-of-two dimensions. Module SHA-256: `efabf32adcc67123eb125e6c6108b680fb14dccae5cbedbf58b78b4d4d50a68b`. Software/physical-device rendering, scene lighting, UV placement and loader behavior are outside these asset checks.
