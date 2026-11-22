# Western garden planting — source and scale

The [placement and shade tree](../src/villaShelterPlanting.ts) are original Villa construction, not a scene downloaded from a model library. The [four planted drifts](../src/villaShelterPlantingDrifts.ts) use compact derivatives of eight actual plant meshes and their corresponding UV charts. The tree has a visible root flare, three differently ageing leaders, tapered laterals, 3D forklets and fixed, twisted local sprays. There is no camera-facing geometry, opaque canopy envelope or whole-tree photograph. Seven small, originally arranged woody stools fill the gaps between narrow-leaved shrubs and ferns. They are ornamental, not another fruit tree, crop, harvest marker or solid hedge.

## Licensed material

Checked on 2026-11-22. Poly Haven releases the downloadable assets under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/); [its license page](https://polyhaven.com/license) explicitly permits derivatives and redistribution. The [live API](https://polyhaven.com/our-api) was used only during offline source selection, not in the game or verification recipe. Only actual model buffers, texture pixels and opacity masks were used — no thumbnails, orthographic preview renders, website illustrations, user screenshots or unknown third-party art. The original files matched the published byte sizes and MD5s in the inventory links below. The hashes in the table are independently calculated SHA-256s.

- [Fern 02](https://polyhaven.com/a/fern_02): Rob Tuytel (scanning), Rico Cilliers (modeling), Poly Haven. [Individual file inventory](https://api.polyhaven.com/files/fern_02).
- [Shrub 02](https://polyhaven.com/a/shrub_02): Rico Cilliers, Poly Haven. [Individual file inventory](https://api.polyhaven.com/files/shrub_02).
- [Island Tree 02](https://polyhaven.com/a/island_tree_02): Rob Tuytel (scanning / processing), Rico Cilliers (cleanup / processing), Poly Haven. [Individual file inventory](https://api.polyhaven.com/files/island_tree_02). **Only three maps** were used. Its mesh, trunk topology, and complete tree silhouette were not imported.

| Individual original | Bytes | SHA-256 |
| --- | ---: | --- |
| [fern_02_1k.gltf](https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/fern_02/fern_02_1k.gltf) | 6,899 | `33974295ee19670af4877705fc7d91f33f42d6302f0d44a625e072271223031f` |
| [fern_02.bin](https://dl.polyhaven.org/file/ph-assets/Models/gltf/8k/fern_02/fern_02.bin) | 176,176 | `fe1abb762bcbbc7ad9e86925c8080437a62add257d9280e9142fdc85c226e64c` |
| [fern_02_diff_1k.jpg](https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/fern_02/fern_02_diff_1k.jpg) | 315,705 | `a828a6e7b4c01c826911e2eac4b3afc7457dab7b3b392a31c681ed88b7d50029` |
| [fern_02_alpha_1k.png](https://dl.polyhaven.org/file/ph-assets/Models/png/1k/fern_02/fern_02_alpha_1k.png) | 114,589 | `ea3c64284c7ebdeedf484d2d816eae92825ec526140c3bb83859ddc7a64001f9` |
| [shrub_02_1k.gltf](https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/shrub_02/shrub_02_1k.gltf) | 8,083 | `99de0a70fe88ad414615cc8d8e020617c8512e2abfe08b911b153a6fcc40d93e` |
| [shrub_02.bin](https://dl.polyhaven.org/file/ph-assets/Models/gltf/4k/shrub_02/shrub_02.bin) | 758,692 | `5c1b79da1cfdbac90599542ccd1f75ba433a3a4d356b1ea03655adb39b0e2c96` |
| [shrub_02_diff_1k.jpg](https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/shrub_02/shrub_02_diff_1k.jpg) | 395,120 | `9956eff294034d70516d867e9668428a23d782feb3d4c34061dce5e44bacd5a8` |
| [shrub_02_alpha_1k.png](https://dl.polyhaven.org/file/ph-assets/Models/png/1k/shrub_02/shrub_02_alpha_1k.png) | 91,741 | `5c2c31bac311051db77443e1780078403c2df0a832c40fe6ed7bcd982695cdf0` |
| [island_tree_02_leaves_diff_1k.jpg](https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_02/island_tree_02_leaves_diff_1k.jpg) | 191,886 | `f56d762a1507754752abf164cc12acbc1e87ce87fa609ac44b98a1b0037c89d8` |
| [island_tree_02_leaves_alpha_1k.png](https://dl.polyhaven.org/file/ph-assets/Models/png/1k/island_tree_02/island_tree_02_leaves_alpha_1k.png) | 57,438 | `f4341f147988dbe6b58d9ca841a8f0e4bcff25bc40d05f9877da82006d489c39` |
| [island_tree_02_branches_diff_1k.jpg](https://dl.polyhaven.org/file/ph-assets/Models/jpg/1k/island_tree_02/island_tree_02_branches_diff_1k.jpg) | 528,304 | `bee5ec22196e9e31ad0c95a5a9b4636571cc0124d5bb27a92f1e307d289cc60d` |

## Derivation and assembly

- **Mesh:** Remove only the suppliers' gallery-layout translations; apply their native rotations. Simplify each connected, UV-mapped leaf, fern frond or stem separately offline; retain source normals, UV seams and all connected parts. Endpoints remain in local metres, quantized to 0.125 mm (signed int16); normals signed 8-bit, UVs unsigned 16-bit, indices uint16. Fern variants B/C/A/D: 2,384/2,248/784/816 → **321/309/187/176** triangles. Shrub variants A/B/C/D: 7,590/5,242/9,234/5,188 → **909/629/1,120/623**. These derivatives are not presented as full-detail scans.
- **Scan charts:** All seven source images are actually 1024 × 1024. The original 16-bit alpha maps supply coverage; the JPEGs supply color. The fern occupies 512 × 512, the shrub 256 × 512, and four local twig charts 128 × 256 each in one 1024 × 512 atlas. For each twig, pick individual scanned blades from the top five leaves of the island-tree sheet: the [recipe](prepare_shelter_atlas.py) specifies each half-open crop rectangle, rotation and attachment. Seven or eight small offshoots carry 42–48 blades plus a terminal leaf. Each chart bends in 3D, stays attached to a local branching forklet and spans ~0.54–0.80 m along a mature shoot; typical leaves read at centimetres, not metres. Grade the leaf color conservatively; no light-direction, cast shadow or architectural backdrop is baked in. The complete branch-bark map is Lanczos-reduced to 128² and wrapped along actual tapered tubes. A 256-entry RGBA palette and byte-run coding keep coverage CPU-readable at scene creation and for a shadow survey. Mipmapped sRGB, green matte for transparent pixels, non-blended `alphaTest=0.31`, two-sided leaf lighting. No runtime model/image loader, GLTF parser, WASM simplifier, third-party calls or per-frame updates.
- **Site:** Three woody leaders at **(−27.90, 22.45)**, behind the court and west of the existing cherry. Canopy bounds X ≈ −32.92…−22.76, Z ≈ 18.06…26.57, Y ≈ 2.20…8.28 m. Four curved patches contain **14 shrubs and 24 ferns** in varied rotations, spread/age and tone; three patches occupy the west lawn and one small secondary patch sits west of the fields (Z=54…57 m), not on the paths or behind every fence. All sites sample actual terrain. Nine short, grade-to-fork collision boxes follow only the three trunk leaders; the crown/understory never block movement. The primary tree is authored in form, not a claim to an exact native tree species or a survey of a real property.
- **Budget:** Root plus all four patches and the low stools total **32,615 indexed triangles, 34,219 vertices, 8 cullable meshes, 2 shared materials**. The foliage and bark maps together are 139,049 packed bytes, geometry prototypes 85,184 packed bytes (**224,233 bytes** before base64). The five runtime TS source files together are 316,242 bytes (185,798 bytes gzip-9 on their sorted concatenation, not a release payload claim). The two RGBA8 textures plus mips and the eight geometry attribute/index buffers together total about **4.37 MiB** before driver, material and scene overhead. No duplicate public assets.

## Offline reproduction / checks

Save the 11 individual originals from the table into a local directory outside the repository. These scripts **only** read pinned files; default mode compares with the generated data modules, and `--write` explicitly regenerates them. This is not part of the game build or install.

```sh
node games/villa/assets-sources/prepare_shelter_meshes.mjs /path/to/originals
python3 -B games/villa/assets-sources/prepare_shelter_atlas.py /path/to/originals
```

Verified with existing Node 24.22.1 / meshoptimizer 1.1.1 and Python 3.14.4 / Pillow 13.0.0 / NumPy 2.5.4. Neither tool adds a runtime dependency. The [geometry data](../src/villaShelterPlantingMeshes.ts) SHA-256 is `03499cf1c5b435e6a37a53bea7408c3be621c84c88d1ef4ec303b8a8d9b0ee9f`; [texture data](../src/villaShelterPlantingAtlas.ts) SHA-256 `f83b10df4dcbcc7ebba70a1290d3b653929648910ca1dd84dbac82ce867059b8`.

[Scoped geometry tests](../tests/villaShelterPlanting.test.ts) exercise actual sun-direction and trunk rays, alpha coverage and open sky, connected donor placement at grade, true outside road toes, raised-bed court, pool and deck, pet lawn, estate bounds, field and water clearances. A local triangle/UV/coverage profile was inspected; that is not a full game render, device performance result, or evidence of a regenerated scene-wide shadow bake.
