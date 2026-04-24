export const PACMAN_TILE = 16;
export const PACMAN_RADIUS = PACMAN_TILE / 2 - 1;

export type PacmanDir = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

export const PACMAN_DIR_DX: Record<PacmanDir, number> = {
  LEFT: -1,
  RIGHT: 1,
  UP: 0,
  DOWN: 0,
};

export const PACMAN_DIR_DY: Record<PacmanDir, number> = {
  LEFT: 0,
  RIGHT: 0,
  UP: -1,
  DOWN: 1,
};

export interface PacmanMoveInput {
  maze: readonly (readonly number[])[];
  cols: number;
  rows: number;
  tile: number;
  radius: number;
  x: number;
  y: number;
  dir: PacmanDir;
  nextDir: PacmanDir;
  speed: number;
  dt: number;
}

export interface PacmanMoveResult {
  x: number;
  y: number;
  col: number;
  row: number;
  dir: PacmanDir;
  angle: number;
}

const OPPOSITE_DIR: Record<PacmanDir, PacmanDir> = {
  UP: 'DOWN',
  DOWN: 'UP',
  LEFT: 'RIGHT',
  RIGHT: 'LEFT',
};

const EDGE_EPSILON = 0.000001;

export function pacmanDirToAngle(dir: PacmanDir): number {
  switch (dir) {
    case 'RIGHT': return 0;
    case 'DOWN': return Math.PI / 2;
    case 'LEFT': return Math.PI;
    case 'UP': return -Math.PI / 2;
    default: return 0;
  }
}

export function isPacmanTileBlocked(
  maze: readonly (readonly number[])[],
  col: number,
  row: number,
  cols = maze[0]?.length ?? 0,
  rows = maze.length
): boolean {
  if (row < 0 || row >= rows || col < 0 || col >= cols) return true;
  const tile = maze[row]?.[col];
  return tile === undefined || tile === 0 || tile === 4;
}

export function getPacmanValidDirs(
  maze: readonly (readonly number[])[],
  col: number,
  row: number,
  cols: number,
  rows: number
): PacmanDir[] {
  const dirs: PacmanDir[] = [];
  for (const dir of ['UP', 'DOWN', 'LEFT', 'RIGHT'] as PacmanDir[]) {
    if (!isPacmanTileBlocked(maze, col + PACMAN_DIR_DX[dir], row + PACMAN_DIR_DY[dir], cols, rows)) {
      dirs.push(dir);
    }
  }
  return dirs;
}

function tileCenter(index: number, tile: number): number {
  return index * tile + tile / 2;
}

function normalizeCol(col: number, cols: number): number {
  if (cols <= 0) return col;
  return ((col % cols) + cols) % cols;
}

function normalizeTunnelX(x: number, cols: number, tile: number): number {
  const leftLimit = -tile / 2;
  const rightLimit = cols * tile + tile / 2;
  if (x < leftLimit) return rightLimit;
  if (x > rightLimit) return leftLimit;
  return x;
}

function nearestTileIndex(coord: number, tile: number): number {
  return Math.round((coord - tile / 2) / tile);
}

function nearestCol(x: number, cols: number, tile: number): number {
  return normalizeCol(nearestTileIndex(x, tile), cols);
}

function nearestRow(y: number, rows: number, tile: number): number {
  return Math.max(0, Math.min(rows - 1, nearestTileIndex(y, tile)));
}

function gridPosition(x: number, y: number, cols: number, rows: number, tile: number) {
  return {
    col: normalizeCol(Math.floor(x / tile), cols),
    row: Math.max(0, Math.min(rows - 1, Math.floor(y / tile))),
  };
}

function sampleTileBlocked(
  maze: readonly (readonly number[])[],
  cols: number,
  rows: number,
  tile: number,
  x: number,
  y: number
): boolean {
  const worldWidth = cols * tile;
  let col = Math.floor(x / tile);
  if (x < 0) col = 0;
  if (x >= worldWidth) col = cols - 1;
  const row = Math.floor(y / tile);
  return isPacmanTileBlocked(maze, col, row, cols, rows);
}

function canOccupyCircle(input: PacmanMoveInput, x: number, y: number): boolean {
  const { maze, cols, rows, tile, radius } = input;
  const left = x - radius + EDGE_EPSILON;
  const right = x + radius - EDGE_EPSILON;
  const top = y - radius + EDGE_EPSILON;
  const bottom = y + radius - EDGE_EPSILON;

  return !(
    sampleTileBlocked(maze, cols, rows, tile, left, y) ||
    sampleTileBlocked(maze, cols, rows, tile, right, y) ||
    sampleTileBlocked(maze, cols, rows, tile, x, top) ||
    sampleTileBlocked(maze, cols, rows, tile, x, bottom)
  );
}

function applyQueuedTurn(input: PacmanMoveInput, x: number, y: number) {
  const { maze, cols, rows, tile, radius, speed, dt, dir, nextDir } = input;
  if (nextDir === dir) return { x, y, dir };
  if (nextDir === OPPOSITE_DIR[dir]) return { x, y, dir: nextDir };

  const col = nearestCol(x, cols, tile);
  const row = nearestRow(y, rows, tile);
  const centerX = tileCenter(col, tile);
  const centerY = tileCenter(row, tile);
  const turnTolerance = Math.min(radius, Math.max(1.25, speed * dt + 0.25));
  const alignedToCenter = Math.abs(x - centerX) <= turnTolerance && Math.abs(y - centerY) <= turnTolerance;
  const targetCol = col + PACMAN_DIR_DX[nextDir];
  const targetRow = row + PACMAN_DIR_DY[nextDir];

  if (alignedToCenter && !isPacmanTileBlocked(maze, targetCol, targetRow, cols, rows)) {
    return { x: centerX, y: centerY, dir: nextDir };
  }

  return { x, y, dir };
}

function alignToLane(input: PacmanMoveInput, x: number, y: number, dir: PacmanDir) {
  const { cols, rows, tile } = input;
  const dx = PACMAN_DIR_DX[dir];
  const dy = PACMAN_DIR_DY[dir];

  if (dx !== 0) {
    return { x, y: tileCenter(nearestRow(y, rows, tile), tile) };
  }

  if (dy !== 0) {
    return { x: tileCenter(nearestCol(x, cols, tile), tile), y };
  }

  return { x, y };
}

function farthestReachablePoint(input: PacmanMoveInput, x: number, y: number, targetX: number, targetY: number) {
  if (!canOccupyCircle(input, x, y)) {
    return { x, y };
  }

  let low = 0;
  let high = 1;
  for (let i = 0; i < 28; i++) {
    const mid = (low + high) / 2;
    const testX = normalizeTunnelX(x + (targetX - x) * mid, input.cols, input.tile);
    const testY = y + (targetY - y) * mid;
    if (canOccupyCircle(input, testX, testY)) {
      low = mid;
    } else {
      high = mid;
    }
  }

  const rawX = x + (targetX - x) * low;
  const rawY = y + (targetY - y) * low;
  const safeX = rawX === x ? rawX : rawX - Math.sign(targetX - x) * EDGE_EPSILON;
  const safeY = rawY === y ? rawY : rawY - Math.sign(targetY - y) * EDGE_EPSILON;

  return {
    x: normalizeTunnelX(safeX, input.cols, input.tile),
    y: safeY,
  };
}

export function movePacmanBody(input: PacmanMoveInput): PacmanMoveResult {
  const speed = Math.max(0, input.speed);
  const dt = Math.max(0, input.dt);
  const distance = speed * dt;
  const turned = applyQueuedTurn(input, input.x, input.y);
  const aligned = alignToLane(input, turned.x, turned.y, turned.dir);
  const dx = PACMAN_DIR_DX[turned.dir];
  const dy = PACMAN_DIR_DY[turned.dir];
  const targetX = aligned.x + dx * distance;
  const targetY = aligned.y + dy * distance;
  const wrappedTargetX = normalizeTunnelX(targetX, input.cols, input.tile);
  const moved = canOccupyCircle(input, wrappedTargetX, targetY)
    ? { x: wrappedTargetX, y: targetY }
    : farthestReachablePoint(input, aligned.x, aligned.y, targetX, targetY);
  const pos = gridPosition(moved.x, moved.y, input.cols, input.rows, input.tile);

  return {
    x: moved.x,
    y: moved.y,
    col: pos.col,
    row: pos.row,
    dir: turned.dir,
    angle: pacmanDirToAngle(turned.dir),
  };
}
