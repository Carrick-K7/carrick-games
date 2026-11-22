# Villa interior finish swatches

[`VILLA_INTERIOR_SWATCHES`](../src/villaInteriorSwatchData.ts) exports three **opaque sRGB WebP data URLs**, not textures or loaders. The oak is one photographed board face; the stone is real fine **terrazzo**, not a mineralogically identified limestone slab. All three are color maps only. Edges, bevels, grout, plank lengths, roughness, light and shadows belong to the scene, not these images.

| Key / finish | Decoded pixels | One repeat (U × V, metres) | WebP bytes | Target / fallback sRGB | Actual decoded mean R, G, B (0–255) |
| --- | ---: | --- | ---: | --- | --- |
| `oak` — pale sawn oak face | 1024 × 256 | **1.80 × 0.18**, grain along **U** | 57,026 | `#c3a989` | 194.89, 169.18, 137.08 |
| `limestone` — warm ivory terrazzo | 1024 × 1024 | **1.00 × 1.00** | 211,154 | `#cfc3ac` | 207.01, 195.27, 171.97 |
| `plaster` — warm chalk-colored mineral finish | 512 × 512 | **1.00 × 1.00** | 49,162 | `#ded5c6` | 222.18, 213.16, 197.97 |

**317,342 compressed image bytes**, or **423,527 bytes** for the complete ASCII data module including base64. One upload of each as RGBA8 uses 6,291,456 bytes at the base level; complete mip pyramids use **8,388,612 bytes (~8 MiB)**. This is an allocation estimate, not measured VRAM; it excludes drivers, staging/CPU images and other textures. There is no linen, alpha, second map set, public bitmap copy or remote runtime dependency.

Use `THREE.SRGBColorSpace`, repeat wrapping and mipmapping. Fill a fallback with the tabulated **target** (rounded mean of the decoded image); after decoding, white is the neutral material multiplier, **not** that fallback color again. For a boarded floor or shelf, U is the stock length regardless of its world direction. A stable per-board UV phase is fine; end grain is a different cut. Sample all plaster in wall-local metres, not normalized to each entire wall. Keep decoded textures and their lifetime per owning game instance.

## Source rights and input pins

Checked 2026-11-22. Poly Haven explicitly releases its individual texture assets under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), including commercial use, modification and redistribution ([supplier license](https://polyhaven.com/license)). That dedication does **not** cover the website's sample renders or UI previews. We used only the individually linked **Diffuse JPEG** maps. No scene, HDRI, site graphic, material ball or layout is in the library. The [API terms](https://polyhaven.com/our-api) are separate from the asset license; neither Villa nor the offline recipe calls the API. Supplier lengths/MD5 were checked against the actual downloads; source and output SHA-256 were computed independently.

| Individual asset / artist | Supplier material and file records | Original JPEG (RGB) | Bytes | Supplier MD5; source SHA-256 |
| --- | --- | --- | ---: | --- |
| [Oak Wood Planks](https://polyhaven.com/a/oak_wood_planks) — **Dimitrios Savva** | [Scale/credit](https://api.polyhaven.com/info/oak_wood_planks) · [inventory](https://api.polyhaven.com/files/oak_wood_planks) | [oak_wood_planks_diff_4k.jpg](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/4k/oak_wood_planks/oak_wood_planks_diff_4k.jpg), 4096², tagged sRGB | 10,094,919 | `afdebae04b31a4f77ca878d9c8292daa`; `aadbd93033fdfd15d875e85ce7da3558a8375ea282e55d6c3a3dd4ce5272f483` |
| [Terrazzo Tiles](https://polyhaven.com/a/terrazzo_tiles) — **Amal Kumar** | [Scale/credit](https://api.polyhaven.com/info/terrazzo_tiles) · [inventory](https://api.polyhaven.com/files/terrazzo_tiles) | [terrazzo_tiles_diff_2k.jpg](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/terrazzo_tiles/terrazzo_tiles_diff_2k.jpg), 2048² | 4,554,044 | `b4bfb01525c22e611d9a0651f372ae91`; `26cc390c19e468de03fc9699198398590a7adc1ddd4972e6d6fb65d76403bb66` |
| [White Plaster 02](https://polyhaven.com/a/white_plaster_02) — **Rob Tuytel** | [Scale/credit](https://api.polyhaven.com/info/white_plaster_02) · [inventory](https://api.polyhaven.com/files/white_plaster_02) | [white_plaster_02_diff_1k.jpg](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/white_plaster_02/white_plaster_02_diff_1k.jpg), 1024² | 527,219 | `7b10c2686bcfd76d1f309a20fd06b57e`; `a1ebbe091bd1ae93d2abd5de8d69f9003a8d0ee6532bcf9a87c2492c97051f23` |

The stone and plaster JPEGs have no embedded ICC profile; their diffuse color bytes are interpreted as sRGB. Grades and the table's measured means are in display-encoded sRGB (Pillow/libwebp decode), not linear-light averages or reflectance measurements. A separate FFmpeg 7.0.2 decode yielded complete RGB frames of the same dimensions; decoder YUV-to-RGB rounding can shift the channel means by ~1–2 levels. The opaque WebPs have no ICC/EXIF metadata.

## What was sampled

- **Oak:** the supplier scan spans 1.20 × 1.20 m and contains several varnished boards. Take **only** the longitudinal face in `[0,4096) × [15,315)` (origin upper left). The first plank joint below it is near y=334. This uninterrupted strip has actual open oak grain, two small eyes and fine pores; no joint, cedar, repeating deck, or end-grain photograph. The source is already periodic in U. Lanczos-resize to 1024 × 288 and join a 32-pixel transverse overlap along a minimum-color-difference path. The crop covers ~88 mm of the original board's width (~78 mm after overlap). **1.80 × 0.18 m is the authored wide-stock mapping**, not a claim the source board was that size. Chroma ×0.64, contrast ×1.15, grade to pale oak; WebP quality 91. The supplier identifies oak, not a particular European species or finish chemistry; its asset page records the public Wood Works Vault unlock.
- **Stone:** the 2 × 2 m photograph contains eight 250 mm terrazzo tiles per axis. The actual chips are useful; the grout is not. From **25 distinct** tile interiors take 224² native pixels apiece, leaving a 16-pixel guard from each nominal grid edge. Normalize each crop to the same warm binder color, retaining the real chip shapes and local color variation (chroma ×0.52, contrast ×0.43). Stitch a 5 × 5 field at 205-pixel pitch with 19-pixel overlapping, minimum-error cuts, including both wrap edges. At the supplier's pitch the resulting 1025² field spans 1.001 m per side. Resample to 1024² for the 1 m repeat. A 3–8 texel chip reads as ~3–8 mm; no repeated photo-grid underneath the physical floor bond. WebP quality 88. `limestone` is the renderer key: this is a pale terrazzo finish, **not** quarried limestone, veined travertine or a scan of a particular honing process.
- **Plaster:** use the **whole** seamless 1 × 1 m sample without a crop. Retain small trowelled changes in density and fineness rather than adding paint noise. Lanczos-resize to 512², reduce chroma to 0.30 and contrast to 0.76, center on warm chalk; WebP quality 90. Bare plaster is the documented source. Lime content/composition and gloss were not measured.

## Offline reproduction and verification

Save the three **original JPEG links above**, with their unchanged basenames, in an input directory outside the checkout. The [offline recipe](prepare_interior_swatches.py) checks the input lengths, SHA-256 and JPEG dimensions before sampling. It decodes its results, reports measured channel means, checks compressed and GPU budgets, and compares the generated module byte-for-byte by default. There is no network option, dependency install, app build or deployment step.

```sh
# From repository root, using an existing authoring environment with Pillow.
python3 -B games/villa/assets-sources/prepare_interior_swatches.py /path/to/originals
# To deliberately regenerate instead, append --write.

# The narrow format/receipt check needs no original JPEGs or Pillow.
npm run test:unit -- games/villa/tests/villaInteriorSwatchData.test.ts
```

Byte-identical regeneration verified with **Python 3.14.4, Pillow 13.0.0, libjpeg-turbo 3.2.0 and libwebp 1.6.0** (lossy, method 6). Use the same decoder/encoder build for a byte comparison. The [format test](../tests/villaInteriorSwatchData.test.ts) checks the embedded RIFF lengths, opaque VP8 keyframe headers, dimensions, independent receipts and combined budgets; the Python run performs the actual RGB decode. These checks do not certify runtime UVs, lighting, room integration or physical-device performance.

| Final payload | SHA-256 |
| --- | --- |
| `oak` WebP | `bf1585a9edfd8d07a3df407024215bb218f25564b4dc8f84c3c216ae43d167f0` |
| `limestone` WebP | `cbac978178962179223603a970745ec9360079edfb7fc35d4eba1930cae8da83` |
| `plaster` WebP | `077b5bfd752ff332b2ee737435b4bf6c21d88380e2fe3c288ee4cfd8b017ae41` |
| [Data module](../src/villaInteriorSwatchData.ts) | `9f9842f66510c5fdeac931e54142f475b3d3f6f4aa390f5bda6e7f9d500b1e60` |
