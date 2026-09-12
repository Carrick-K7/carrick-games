/* Gacha-owned inventory photos; the shared weapon-art package stays asset-free. */
import { drawWeaponIcon, weaponIconFitSize, resolveSilhouetteId } from '@carrick/weapon-art';
export { drawWeaponIcon, weaponIconFitSize } from '@carrick/weapon-art';

export type WeaponAssetUrl = (relativePath: string) => string;

/** Natural width/height aspect of each shipped photo render. */
const WEAPON_PHOTO_ASPECTS: Record<string, number> = {
  ak47: 1.9512,
  awp: 2.4903,
  butterfly: 1.2008,
  deagle: 1.1896,
  fn57: 1.2053,
  g3sg1: 1.8391,
  glock: 1.2648,
  karambit: 1.4035,
  m4a1s: 2.4521,
  m4a4: 1.7204,
  mac10: 0.795,
  mp5: 1.6,
  p250: 1.0095,
  p90: 1.604,
  ump45: 1.3913,
  usp: 1.9048,
};

// Key by immutable resource URL, not just icon id: two hosts may use different releases.
const photoCache = new Map<string, HTMLImageElement | 'error'>();
const moduleAssetUrl: WeaponAssetUrl = path => new URL(path, import.meta.url).href;

export function weaponPhotoAspect(iconId: string): number | undefined {
  const key = resolveSilhouetteId(iconId);
  return key ? WEAPON_PHOTO_ASPECTS[key] : undefined;
}

function weaponPhoto(iconId: string, assetUrl: WeaponAssetUrl = moduleAssetUrl): HTMLImageElement | undefined {
  const key = resolveSilhouetteId(iconId);
  if (!key || !(key in WEAPON_PHOTO_ASPECTS)) return undefined;
  const url = assetUrl(`weapons/${key}.webp`);
  let entry = photoCache.get(url);
  if (entry === 'error') return undefined;
  if (!entry) {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    img.onerror = () => photoCache.set(url, 'error');
    photoCache.set(url, img);
    entry = img;
  }
  return entry.complete && entry.naturalWidth > 0 ? entry : undefined;
}

/** Start loading every available photo render for this host's release. */
export function preloadWeaponPhotos(assetUrl?: WeaponAssetUrl): void {
  for (const key of Object.keys(WEAPON_PHOTO_ASPECTS)) weaponPhoto(key, assetUrl);
}

/**
 * Draw the real weapon render contain-fitted inside maxWidth × maxHeight.
 * Returns false while unavailable and draws the shared silhouette fallback.
 */
export function drawWeaponPhoto(
  ctx: CanvasRenderingContext2D,
  iconId: string,
  cx: number,
  cy: number,
  maxWidth: number,
  maxHeight: number,
  options: { alpha?: number; mirror?: boolean; fallbackColor?: string; assetUrl?: WeaponAssetUrl } = {},
): boolean {
  const img = weaponPhoto(iconId, options.assetUrl);
  const aspect = weaponPhotoAspect(iconId);
  if (img && aspect) {
    const width = Math.min(maxWidth, maxHeight * aspect);
    const height = width / aspect;
    ctx.save();
    ctx.translate(cx, cy);
    if (options.mirror) ctx.scale(-1, 1);
    ctx.globalAlpha *= options.alpha ?? 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, -width / 2, -height / 2, width, height);
    ctx.restore();
    return true;
  }
  drawWeaponIcon(ctx, iconId, cx, cy, {
    size: weaponIconFitSize(iconId, maxWidth, maxHeight),
    color: options.fallbackColor ?? '#5c6672',
    alpha: options.alpha,
    mirror: options.mirror,
  });
  return false;
}
