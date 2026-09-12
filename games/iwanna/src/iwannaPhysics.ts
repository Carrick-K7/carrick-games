export const IWANNA_PLAYER_W = 14;
export const IWANNA_PLAYER_H = 18;

export interface IwannaPlatform {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface IwannaPlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
}

export function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function resolveIwannaHorizontalMove(
  player: IwannaPlayerState,
  platforms: readonly IwannaPlatform[],
  dx: number,
  worldWidth: number
): IwannaPlayerState {
  const next = {
    ...player,
    x: Math.max(0, Math.min(worldWidth - IWANNA_PLAYER_W, player.x + dx)),
  };

  if (dx === 0) return next;

  for (const platform of platforms) {
    if (!rectsOverlap(next.x, next.y, IWANNA_PLAYER_W, IWANNA_PLAYER_H, platform.x, platform.y, platform.w, platform.h)) {
      continue;
    }

    if (dx > 0) {
      next.x = platform.x - IWANNA_PLAYER_W;
    } else {
      next.x = platform.x + platform.w;
    }
    next.x = Math.max(0, Math.min(worldWidth - IWANNA_PLAYER_W, next.x));
    next.vx = 0;
  }

  return next;
}

export function resolveIwannaVerticalMove(
  player: IwannaPlayerState,
  platforms: readonly IwannaPlatform[],
  dy: number
): IwannaPlayerState {
  const next = {
    ...player,
    y: player.y + dy,
    onGround: false,
  };

  for (const platform of platforms) {
    if (!rectsOverlap(next.x, next.y, IWANNA_PLAYER_W, IWANNA_PLAYER_H, platform.x, platform.y, platform.w, platform.h)) {
      continue;
    }

    if (dy > 0) {
      next.y = platform.y - IWANNA_PLAYER_H;
      next.vy = 0;
      next.onGround = true;
    } else if (dy < 0) {
      next.y = platform.y + platform.h;
      next.vy = 0;
    } else {
      const pushUp = next.y + IWANNA_PLAYER_H - platform.y;
      const pushDown = platform.y + platform.h - next.y;
      if (pushUp <= pushDown) {
        next.y = platform.y - IWANNA_PLAYER_H;
        next.onGround = true;
      } else {
        next.y = platform.y + platform.h;
      }
      next.vy = 0;
    }
  }

  return next;
}
