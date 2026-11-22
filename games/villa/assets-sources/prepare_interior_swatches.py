"""Reproduce the three Villa interior color maps from pinned local diffuse JPEGs; no network."""

import argparse
import base64
import hashlib
import io
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance, ImageFilter, ImageStat


# Sizes and SHA-256 are of the actual downloaded files, not their web previews.
# Supplier, rights, URLs, UV pitch and color measurements: INTERIOR-FINISHES.md.
SOURCES = {
    'oak': ('oak_wood_planks_diff_4k.jpg', 10_094_919, (4096, 4096),
            'aadbd93033fdfd15d875e85ce7da3558a8375ea282e55d6c3a3dd4ce5272f483'),
    'limestone': ('terrazzo_tiles_diff_2k.jpg', 4_554_044, (2048, 2048),
                  '26cc390c19e468de03fc9699198398590a7adc1ddd4972e6d6fb65d76403bb66'),
    'plaster': ('white_plaster_02_diff_1k.jpg', 527_219, (1024, 1024),
                'a1ebbe091bd1ae93d2abd5de8d69f9003a8d0ee6532bcf9a87c2492c97051f23'),
}
OUTPUT = Path(__file__).resolve().parents[1] / 'src' / 'villaInteriorSwatchData.ts'
LANCZOS = Image.Resampling.LANCZOS
TRANSPOSE = Image.Transpose.TRANSPOSE


def grade(image, target, chroma, contrast):
    """Retain photographic differences about each channel's mean; target is in display sRGB."""
    rgb = ImageEnhance.Color(image).enhance(chroma)
    channels = []
    for band, center, aim in zip(rgb.split(), ImageStat.Stat(rgb).mean, target, strict=True):
        channels.append(band.point([min(255, max(0, round(aim + (v - center) * contrast)))
                                    for v in range(256)]))
    return Image.merge('RGB', channels)


def periodic_strip(pieces, pitch):
    """Quilt neighboring photographic overlaps, including last into first; no synthetic edge.

    The output is len(pieces)*pitch wide. Paired path endpoints preserve a previous
    wrap when this function is used on the second axis. Nothing is mirrored.
    """
    width, height = pieces[0].size
    overlap = width - pitch
    out = Image.new('RGB', (len(pieces) * pitch, height))
    mid = overlap // 2
    for i, piece in enumerate(pieces):
        left = pieces[i - 1].crop((pitch, 0, width, height))
        right = piece.crop((0, 0, overlap, height))
        error = ImageChops.difference(left, right).convert('L').filter(ImageFilter.BoxBlur(1)).load()
        costs = [float('inf')] * overlap
        costs[mid] = 0
        parents = []
        for y in range(height):
            next_costs, source = [float('inf')] * overlap, bytearray(overlap)
            for x in range(2, overlap - 2):
                pred = min((x, x - 1, x + 1), key=costs.__getitem__)
                next_costs[x] = costs[pred] + error[x, y]
                source[x] = pred
            costs = next_costs
            parents.append(source)
        mask = bytearray(overlap * height)
        cut = mid
        for y in reversed(range(height)):
            k = y * overlap
            mask[k:k + cut] = b'\xff' * cut
            mask[k + cut] = 128  # One soft pixel, not a long crossfade through the grain/chips.
            cut = parents[y][cut]
        core = piece.crop((0, 0, pitch, height))
        core.paste(left, (0, 0), Image.frombytes('L', (overlap, height), bytes(mask)))
        out.paste(core, (i * pitch, 0))
    return out


def board(photo):
    # An uninterrupted interval INSIDE one physical board. The long axis is already U.
    # The supplier scan already wraps along U, so close just the newly cut transverse edge.
    face = photo.crop((0, 15, 4096, 315)).resize((1024, 288), LANCZOS)
    return periodic_strip([face.transpose(TRANSPOSE)], 256).transpose(TRANSPOSE)


def aggregate(photo):
    # The 2 m supplier scan has eight 25 cm tiles per axis. Take *only interiors* of
    # 25 real faces. The 16 px guard excludes every photographed grout/bevel pixel.
    # 205 native texels represent ~200.2 mm. Do not enlarge one tiny tile to 1 m.
    rows = []
    for y in range(5):
        pieces = []
        for x in range(5):
            # Sample scattered tiles; do not reproduce the original bond or tone grid.
            ix, iy = (3 * x + 2 * y + 1) % 8, (2 * x + 3 * y + 2) % 8
            u, v = ix * 256 + 16, iy * 256 + 16
            patch = photo.crop((u, v, u + 224, v + 224))
            # A common binder color across cuts; retain differences *inside* every face.
            pieces.append(grade(patch, (207, 195, 172), chroma=0.52, contrast=0.43))
        rows.append(periodic_strip(pieces, 205).transpose(TRANSPOSE))
    return periodic_strip(rows, 205).transpose(TRANSPOSE).resize((1024, 1024), LANCZOS)


def make_map(key, photo):
    if key == 'oak':
        return grade(board(photo), (195, 169, 137), chroma=0.64, contrast=1.15), 91
    if key == 'limestone':
        return aggregate(photo), 88
    if key == 'plaster':
        return grade(photo.resize((512, 512), LANCZOS), (222, 213, 198), chroma=0.30, contrast=0.76), 90
    raise ValueError(key)


def rgba_mip_bytes(width, height):
    total = 0
    while True:
        total += 4 * width * height
        if width == height == 1:
            return total
        width, height = max(1, width // 2), max(1, height // 2)


def build(inputs):
    lines = [
        '// Generated offline by ../assets-sources/prepare_interior_swatches.py. Poly Haven / CC0.',
        '// Color maps only; see ../assets-sources/INTERIOR-FINISHES.md for UV metres and source pins.',
        "export const VILLA_INTERIOR_SWATCHES: Readonly<Record<'oak' | 'limestone' | 'plaster', string>> = {",
    ]
    compressed = 0
    mip_bytes = 0
    for key, (filename, byte_count, dims, sha) in SOURCES.items():
        source = (inputs / filename).read_bytes()
        if len(source) != byte_count or hashlib.sha256(source).hexdigest() != sha:
            raise ValueError(f'{filename}: unexpected source size or SHA-256')
        with Image.open(io.BytesIO(source)) as photo:
            if photo.format != 'JPEG' or photo.mode != 'RGB' or photo.size != dims:
                raise ValueError(f'{filename}: unexpected source format, channels or dimensions')
            rgb, quality = make_map(key, photo)
        # No EXIF, ICC bytes, alpha, lighting, normal/height/AO maps or network references.
        packed = io.BytesIO()
        rgb.save(packed, 'WEBP', lossless=False, quality=quality, method=6)
        payload = packed.getvalue()
        with Image.open(io.BytesIO(payload)) as decoded:
            decoded.load()
            if decoded.format != 'WEBP' or decoded.mode != 'RGB' or decoded.n_frames != 1 or decoded.size != rgb.size:
                raise ValueError(f'{key}: expected single opaque WebP of size {rgb.size}')
            mean = ', '.join(f'{v:.2f}' for v in ImageStat.Stat(decoded).mean)
        print(f'{key:9s} {rgb.width}×{rgb.height}  mean sRGB ({mean})  {len(payload):,} B  {hashlib.sha256(payload).hexdigest()}')
        lines.append(f"  {key}: 'data:image/webp;base64,{base64.b64encode(payload).decode('ascii')}',")
        compressed += len(payload)
        mip_bytes += rgba_mip_bytes(*rgb.size)
    if compressed > 420_000 or mip_bytes > 10 * 1024**2:
        raise ValueError('Swatch payload exceeds the interior resource budget')
    print(f'Total: {compressed:,} WebP bytes; {mip_bytes:,} RGBA8 bytes with complete mip chains.')
    return ('\n'.join([*lines, '};', ''])).encode('ascii')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('inputs', type=Path, help='directory containing the three original JPEG files')
    parser.add_argument('--write', action='store_true', help='replace the data module; default: read-only comparison')
    args = parser.parse_args()
    module = build(args.inputs)
    if args.write:
        OUTPUT.write_bytes(module)
    elif not OUTPUT.is_file() or OUTPUT.read_bytes() != module:
        raise SystemExit('Module differs: check source files and pinned versions; use --write only to regenerate.')
    print(f'{OUTPUT.name}: {len(module):,} B  {hashlib.sha256(module).hexdigest()}')
