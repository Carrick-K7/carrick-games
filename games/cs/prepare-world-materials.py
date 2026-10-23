#!/usr/bin/env python3
"""Offline-only CC0 photo texture preparation. Requires existing Pillow, not a runtime dependency.
Run from any directory: python3 games/cs/prepare-world-materials.py
Downloads only the nine listed Poly Haven families, verifies API MD5, records SHA-256,
and downsamples to 512px WebP. Never run during a game build or at runtime.
"""
import hashlib
import io
import json
from pathlib import Path
import urllib.request
from PIL import Image, __version__ as pillow_version

OUT = Path(__file__).resolve().parent / 'public/assets/materials'
FAMILIES = {
    'plaster': ('plastered_wall', 2),
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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    result = {'schemaVersion': 1, 'license': 'CC0-1.0',
              'licenseUrl': 'https://polyhaven.com/license',
              'legalCodeUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
              'inspectedDate': '2026-10-23', 'pillowVersion': pillow_version,
              'processing': '1k photographic PBR JPG -> RGB Lanczos 512x512 -> WebP method=6; albedo quality=86, normal=90, roughness=86. No synthesis, baking, or Valve assets. OpenGL normals; roughness grayscale copied into RGB, sampled from G.',
              'families': {}}
    runtime = {}
    for kind, (asset, repeat) in FAMILIES.items():
        info_url = 'https://api.polyhaven.com/info/' + asset
        api_url = 'https://api.polyhaven.com/files/' + asset
        info = json.loads(fetch(info_url))
        files = json.loads(fetch(api_url))
        family = {'sourceId': asset, 'page': 'https://polyhaven.com/a/' + asset,
                  'apiUrl': api_url, 'infoUrl': info_url, 'authors': info['authors'],
                  'sourceDimensionsMm': info['dimensions'], 'repeatMeters': repeat, 'maps': {}}
        runtime[kind] = {'sourceId': asset, 'repeatMeters': repeat, 'maps': {}}
        for slot, source_key, quality in [('map', 'Diffuse', 86), ('normalMap', 'nor_gl', 90), ('roughnessMap', 'Rough', 86)]:
            source = files[source_key]['1k']['jpg']
            raw = fetch(source['url'])
            assert hashlib.md5(raw).hexdigest() == source['md5'], source['url']
            image = Image.open(io.BytesIO(raw)).convert('RGB').resize((512, 512), Image.Resampling.LANCZOS)
            if slot == 'roughnessMap':
                image = image.convert('L').convert('RGB')
            filename = kind + '-' + {'map': 'albedo', 'normalMap': 'normal', 'roughnessMap': 'roughness'}[slot] + '.webp'
            image.save(OUT / filename, 'WEBP', quality=quality, method=6)
            encoded = (OUT / filename).read_bytes()
            entry = {'path': 'assets/materials/' + filename, 'width': 512, 'height': 512,
                     'encodedBytes': len(encoded), 'sha256': hashlib.sha256(encoded).hexdigest()}
            runtime[kind]['maps'][slot] = entry
            family['maps'][slot] = {**entry, 'sourceUrl': source['url'], 'sourceBytes': len(raw),
                                   'sourceMd5': source['md5'], 'sourceSha256': hashlib.sha256(raw).hexdigest()}
            print(kind, slot, len(encoded), flush=True)
        result['families'][kind] = family
    (OUT / 'provenance.json').write_text(json.dumps(result, indent=2) + '\n')
    print('RUNTIME_MANIFEST=' + json.dumps(runtime, separators=(',', ':')))
    print('Total encoded bytes:', sum(m['encodedBytes'] for f in runtime.values() for m in f['maps'].values()))

if __name__ == '__main__':
    main()
