import type { World, Point, Building } from './types.js';
import { BUILDINGS } from './content.js';
import { findPath, getBuilding } from './simulation.js';
export interface Resident { x: number; y: number; path: Point[]; progress: number; wait: number; color: string; home: string }
const COLORS = ['#b66d51','#c5af79','#4f7077','#71815b','#8d7090','#e1c59a'];
/** Bounded presentation walkers. Population/economy belongs to the deterministic simulation. */
export class CityLife {
  readonly residents: Resident[] = [];
  private worldId = '';
  private planning = 0;
  private turn = 0;
  reset() { this.residents.length = 0; this.worldId = ''; this.planning = 0; this.turn = 0; }
  update(world: World, dt: number) {
    if (this.worldId !== world.id) { this.reset(); this.worldId = world.id; }
    const targetCount = Math.min(20, Math.floor(world.population / 3));
    this.residents.length = Math.min(this.residents.length, targetCount);
    this.planning -= dt;
    if (this.planning <= 0) {
      this.planning = 1;
      const homes = world.buildings.filter(b => b.progress === 1 && BUILDINGS[b.kind].capacity > 0);
      if (homes.length && this.residents.length < targetCount) {
        const home = homes[this.turn % homes.length]!, point = access(world, home)[0];
        if (point) this.residents.push({ ...point, path: [], progress: 0, wait: .5, color: COLORS[this.turn++ % COLORS.length]!, home: home.id });
      }
      // At most two BFS plans per simulated second, even on large imported maps.
      let plans = 0;
      for (const resident of this.residents) {
        if (resident.path.length || resident.wait > 0 || plans++ >= 2) continue;
        const destinations = world.buildings.filter(b => b.progress === 1 && ['house','apartment','park','market','library','school'].includes(b.kind));
        const destination = destinations[this.turn++ % Math.max(1, destinations.length)];
        if (destination) for (const point of access(world, destination)) {
          const route = findPath(world, resident, point); if (route && route.length && route.length < 180) { resident.path = route; break; }
        }
        resident.wait = 3;
      }
    }
    for (const resident of this.residents) {
      resident.wait = Math.max(0, resident.wait - dt);
      const next = resident.path[0]; if (!next) continue;
      if (!walkable(world, next)) { resident.path = []; resident.progress = 0; continue; }
      resident.progress += dt * 1.35;
      if (resident.progress >= 1) { resident.x = next.x; resident.y = next.y; resident.path.shift(); resident.progress = 0; }
    }
  }
}
function walkable(world: World, point: Point) {
  if (point.x < 0 || point.y < 0 || point.x >= world.width || point.y >= world.height) return false;
  const cell = world.terrain[point.y * world.width + point.x]!;
  const building = getBuilding(world, point.x, point.y);
  return !['void','water','rock'].includes(cell.kind) && (!building || BUILDINGS[building.kind].walkable);
}
function access(world: World, building: Building) {
  const size = BUILDINGS[building.kind].footprint;
  return [{ x: building.x - 1, y: building.y }, { x: building.x, y: building.y - 1 },
    { x: building.x + size.width, y: building.y }, { x: building.x, y: building.y + size.height }].filter(point => walkable(world, point));
}
