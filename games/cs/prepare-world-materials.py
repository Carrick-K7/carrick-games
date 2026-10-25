#!/usr/bin/env python3
"""Offline-only CC0 photo texture preparation. Requires existing Pillow, not a runtime dependency.
Run from any directory: python3 games/cs/prepare-world-materials.py [--family plaster]
Downloads only selected Poly Haven families, verifies API MD5, records SHA-256,
and downsamples to 512px WebP. --family preserves all other assets/provenance.
Never run during a game build or at runtime. Plaster albedo is explicitly toned,
not an unmodified photograph; other families and data maps retain the old recipe.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import urllib.request
from PIL import Image, ImageEnhance, features, __version__ as pillow_version

OUT = Path(__file__).resolve().parent / 'public/assets/materials'
FAMILIES = {
    'plaster': ('worn_plaster_wall', 2.8),
    'sandstone': ('sandstone_blocks_05', 3),
    'brick': ('brick_wall_001', 3),
    'cobble': ('cobblestone_floor_02', 2),
    'concrete': ('concrete_floor_02', 2),
    'wood': ('wood_planks', 1.5),
    'metal': ('rusty_painted_metal', 2.2),
    'roof': ('clay_roof_tiles', 4),
    'snow': ('snow_02', 2),
}

def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'CarrickGames-OfflineTexturePrep/1.0'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


BASE_PROCESSING = ('1k photographic PBR JPG -> RGB Lanczos 512x512 -> WebP method=6; '
                   'albedo quality=86, normal=90, roughness=86. No synthesis, baking, or Valve assets. '
                   'OpenGL normals; roughness grayscale copied into RGB, sampled from G.')
PLASTER_PROCESSING = ('Plaster albedo only, after RGB Lanczos resize and before WebP: '
                      'Pillow ImageEnhance.Color(image).enhance(0.65), then '
                      'ImageEnhance.Brightness(image).enhance(1.22), then '
                      'ImageEnhance.Contrast(image).enhance(0.42), on 8-bit encoded RGB '
                      '(not linear-light exposure). Contrast blends toward Pillow\'s rounded '
                      'mean L luminance to soften existing photographic wear; no added wear. '
                      'Normal and roughness receive no tone transform.')


def prepare_image(raw, kind, slot):
    source_image = Image.open(io.BytesIO(raw))
    source_size = source_image.size
    image = source_image.convert('RGB').resize((512, 512), Image.Resampling.LANCZOS)
    if kind == 'plaster' and slot == 'map':
        image = ImageEnhance.Color(image).enhance(0.65)
        image = ImageEnhance.Brightness(image).enhance(1.22)
        image = ImageEnhance.Contrast(image).enhance(0.42)
    if slot == 'roughnessMap':
        image = image.convert('L').convert('RGB')
    return image, source_size


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--family', choices=FAMILIES, help='Regenerate only this family; preserve all others')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    provenance_path = OUT / 'provenance.json'
    if args.family:
        # A scoped run must never silently discard the other eight families.
        result = json.loads(provenance_path.read_text())
        if set(result['families']) != set(FAMILIES):
            raise ValueError('Scoped regeneration requires complete nine-family provenance')
    else:
        result = {'schemaVersion': 1, 'license': 'CC0-1.0',
                  'licenseUrl': 'https://polyhaven.com/license',
                  'legalCodeUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
                  'inspectedDate': '2026-10-25', 'pillowVersion': pillow_version,
                  'families': {}}
    selected = [args.family] if args.family else list(FAMILIES)
    retained = {}
    for kind, family in result['families'].items():
        if kind not in selected:
            for entry in family['maps'].values():
                path = OUT / Path(entry['path']).name
                raw = path.read_bytes()
                if len(raw) != entry['encodedBytes'] or hashlib.sha256(raw).hexdigest() != entry['sha256']:
                    raise ValueError('Retained asset does not match provenance: ' + str(path))
                retained[path] = raw
    pending = {}
    for kind in selected:
        asset, repeat = FAMILIES[kind]
        info_url = 'https://api.polyhaven.com/info/' + asset
        api_url = 'https://api.polyhaven.com/files/' + asset
        info = json.loads(fetch(info_url))
        files = json.loads(fetch(api_url))
        family = {'sourceId': asset, 'page': 'https://polyhaven.com/a/' + asset,
                  'apiUrl': api_url, 'infoUrl': info_url, 'authors': info['authors'],
                  'sourceDimensionsMm': info['dimensions'], 'repeatMeters': repeat,
                  'inspectedDate': '2026-10-25', 'pillowVersion': pillow_version,
                  'webpVersion': features.version('webp'),
                  'processing': BASE_PROCESSING + (' ' + PLASTER_PROCESSING if kind == 'plaster' else ''),
                  'maps': {}}
        if kind == 'plaster':
            family['repeatNote'] = 'Authored 2.8 m repeat softens repetition frequency; source photographed area remains approximately 1.8 m square. Authored UV scale differs from source physical dimensions.'
        for slot, source_key, quality in [('map', 'Diffuse', 86), ('normalMap', 'nor_gl', 90), ('roughnessMap', 'Rough', 86)]:
            source = files[source_key]['1k']['jpg']
            raw = fetch(source['url'])
            if len(raw) != source['size'] or hashlib.md5(raw).hexdigest() != source['md5']:
                raise ValueError('Source size/MD5 mismatch: ' + source['url'])
            image, source_size = prepare_image(raw, kind, slot)
            filename = kind + '-' + {'map': 'albedo', 'normalMap': 'normal', 'roughnessMap': 'roughness'}[slot] + '.webp'
            buffer = io.BytesIO()
            image.save(buffer, 'WEBP', quality=quality, method=6)
            encoded = buffer.getvalue()
            pending[OUT / filename] = encoded
            entry = {'path': 'assets/materials/' + filename, 'width': 512, 'height': 512,
                     'encodedBytes': len(encoded), 'sha256': hashlib.sha256(encoded).hexdigest()}
            family['maps'][slot] = {**entry, 'sourceUrl': source['url'], 'sourceBytes': len(raw),
                                   'sourceMd5': source['md5'], 'sourceSha256': hashlib.sha256(raw).hexdigest(),
                                   'sourceWidth': source_size[0], 'sourceHeight': source_size[1]}
            print(kind, slot, len(encoded), flush=True)
        result['families'][kind] = family
    # Describe the actual retained plaster recipe, even when another family is selected.
    result['processing'] = result['families']['plaster'].get('processing', BASE_PROCESSING)
    # All downloads/verification/encoding finish before any public image is replaced.
    for path, raw in retained.items():
        if path.read_bytes() != raw:
            raise ValueError('Retained asset changed during regeneration: ' + str(path))
    for path, encoded in pending.items():
        path.write_bytes(encoded)
    provenance_path.write_text(json.dumps(result, indent=2) + '\n')
    runtime = {kind: {'sourceId': family['sourceId'], 'repeatMeters': family['repeatMeters'],
                     'maps': {slot: {key: entry[key] for key in ('path', 'width', 'height', 'encodedBytes', 'sha256')}
                              for slot, entry in family['maps'].items()}}
               for kind, family in result['families'].items()}
    print('RUNTIME_MANIFEST=' + json.dumps(runtime, separators=(',', ':')))
    print('Total encoded bytes:', sum(m['encodedBytes'] for f in runtime.values() for m in f['maps'].values()))

if __name__ == '__main__':
    main()
