import * as THREE from 'three';
import { VILLA_SCENIC_ROAD, type VillaDrivingState } from './villaDriving.js';
import { villaTerrainHeight } from './villaEstateLayout.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { addVillaIslandTree } from './villaEstateCraft.js';
import type { VillaCollider } from './villaWorld.js';
import { mineralAggregate, roadStations, junctionMask, driveRibbon, quietEdgePaint, shoulderStation, type DriveRun } from './villaWeatheredDrive.js';

export type RoadPoint = { x: number; z: number };
/** Negative and positive edges of a rendered road station. Neighbouring
 * forecourt paving uses the same bisector, including on the end stations. */
export function villaRoadCrossSection(points: readonly RoadPoint[], i: number, width: number): [RoadPoint, RoadPoint] {
  const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
  const dx = b.x - a.x, dz = b.z - a.z, length = Math.hypot(dx, dz) || 1, half = width / 2;
  return [
    { x: p.x - dz / length * half, z: p.z + dx / length * half },
    { x: p.x + dz / length * half, z: p.z - dx / length * half },
  ];
}
/** The original garden oval is retained. A long flowing branch shares its east
 * and west tangents, so either short or long scenic drive is continuous. */
const VILLA_SOUTH_ROAD_KNOTS: readonly RoadPoint[] = [
  { x: 23, z: 28 }, { x: 21, z: 39 }, { x: 23, z: 51 }, { x: 30, z: 65 },
  { x: 32, z: 81 }, { x: 25, z: 100 }, { x: 32, z: 120 }, { x: 30, z: 139 },
  { x: 19, z: 150 }, { x: 4, z: 148 }, { x: -7, z: 133 }, { x: -8, z: 112 },
  { x: 0, z: 94 }, { x: 1, z: 74 }, { x: -2, z: 62 }, { x: -9, z: 51 },
  { x: -9, z: 39 }, { x: -9, z: 28 },
];
const catmull = (a: number, b: number, c: number, d: number, t: number) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
/** End knots only constrain tangent; start/end at the original oval extremes. */
function villaSouthRoadPoint(t: number): RoadPoint {
  const spans = VILLA_SOUTH_ROAD_KNOTS.length - 3, u = Math.max(0, Math.min(1, t)) * spans, i = Math.min(spans - 1, Math.floor(u)), f = u - i;
  const [a, b, c, d] = VILLA_SOUTH_ROAD_KNOTS.slice(i, i + 4);
  return { x: catmull(a.x, b.x, c.x, d.x, f), z: catmull(a.z, b.z, c.z, d.z, f) };
}
export const VILLA_SOUTH_ROAD_SAMPLES: readonly RoadPoint[] = Array.from({ length: 481 }, (_, i) => villaSouthRoadPoint(i / 480));
const VILLA_SCENIC_ROAD_SAMPLES: readonly RoadPoint[] = Array.from({ length: 145 }, (_, i) => {
  const a = i / 144 * Math.PI * 2, r = VILLA_SCENIC_ROAD;
  return { x: r.x + Math.cos(a) * r.radiusX, z: r.z + Math.sin(a) * r.radiusZ };
});
/** Garage driveway, now aligned with the first bay's new x after the garage
 *  moved east with the enlarged house. */
export const VILLA_GARAGE_DRIVE: readonly RoadPoint[] = [
  // Centred east of the house's east wall: the old x=32.4 line let the shoulder
  // reach x=27.5, inside the east lounge — a real clip, not a cosmetic one.
  // The north end stops 1 m short of the garage facade so its 8.8 m ribbon no
  // longer overlaps the wall piers beside the 4.5 m bay opening.
  { x: 34, z: 3 }, { x: 34, z: 12 }, { x: 31, z: 22 }, { x: 25.5, z: 29 }];
/** A through-road across the front of the house, joining both ends of the long
 *  southern branch. With it the estate has two independent loops instead of one
 *  out-and-back line, which is the point of the added roads. */
export const VILLA_FRONT_LINK: readonly RoadPoint[] = [
  // The west approach swings north of the vegetable patch: the old line ran
  // through the beds, its centreline 0.19 m from their corner, which left the
  // asphalt growing crops and no car able to pass.
  { x: -9, z: 33 }, { x: -2, z: 28 }, { x: 3, z: 22 }, { x: 5, z: 15.6 },
  // The east approach swings wide of the orange tree at (23.2, 19).
  { x: 13, z: 16.2 }, { x: 19, z: 21.2 }, { x: 25, z: 27.4 }];
/** A second descent down the east side, so the garage apron is not a dead end. */
const VILLA_EAST_LINK: readonly RoadPoint[] = [
  // The north end now starts on the apron right at the SUV's bay-4 door instead
  // of 7 m west of it: the old x=40 line left no road outside bay 4 at all.
  { x: 46.9, z: 4 }, { x: 44.5, z: 13 }, { x: 40.5, z: 26 }, { x: 35, z: 45 }, { x: 31.4, z: 60 }];
/** Short spur from the front link to the entrance forecourt. */
export const VILLA_ENTRY_SPUR: readonly RoadPoint[] = [{ x: 3.4, z: 17.4 }, { x: 1.6, z: 12.6 }];
export const VILLA_ESTATE_ROAD_PATHS: readonly (readonly RoadPoint[])[] = [
  VILLA_SCENIC_ROAD_SAMPLES, VILLA_SOUTH_ROAD_SAMPLES,
  VILLA_GARAGE_DRIVE, VILLA_FRONT_LINK, VILLA_EAST_LINK, VILLA_ENTRY_SPUR];
export function villaDistanceToRoad(x: number, z: number): number {
  let best = Infinity;
  for (const path of VILLA_ESTATE_ROAD_PATHS) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return best;
}
/** Other built surfaces meet the actual loose toe, not the maximum safety envelope. */
export function villaRoadToe(path:readonly RoadPoint[], i:number, width:number):[RoadPoint,RoadPoint] {
  const {leftVerge,rightVerge}=shoulderStation(path,i,width,villaRoadCrossSection);return [leftVerge,rightVerge];
}
/** Every road vertex samples authoritative terrain, including cross-road slope.
 * Broad ribbons are subdivided across width to avoid bridging the gentle hills. */
export function createVillaDrivingCourse(parent: THREE.Object3D): { colliders: VillaCollider[]; update(state: VillaDrivingState): void } {
  const root = new THREE.Group(); root.name = 'villa-driving-course'; parent.add(root);
  root.userData = { kind: 'scenic-loop', roadWidth: VILLA_SCENIC_ROAD.width, drivewayWidth: VILLA_SCENIC_ROAD.drivewayWidth, examination: false, southExtent: 150, terrainSampled: true };
  const model = new VillaModelBuilder(root, 'garden-road');
  const asphalt = villaMaterial(0xffffff, .96), shoulder = villaMaterial(0xffffff, .99);
  const paint = villaMaterial(0xffffff, .97), bark = villaMaterial(0x7c634a, .94), leaf = villaMaterial(0x526d49, .97);
  asphalt.name = 'estate-road-asphalt'; shoulder.name = 'estate-road-shoulder'; paint.name='estate-road-edge-paint';
  asphalt.map = shoulder.map = paint.map = mineralAggregate(); asphalt.vertexColors=shoulder.vertexColors=paint.vertexColors=true;
  const runs:DriveRun[]=VILLA_ESTATE_ROAD_PATHS.map((points,i)=>({points,width:points===VILLA_GARAGE_DRIVE?VILLA_SCENIC_ROAD.drivewayWidth:VILLA_SCENIC_ROAD.width, y:.038+i*.002,verge:true}));
  runs.push({points:[{x:39.6,z:2},{x:39.6,z:3.5},{x:39.6,z:5}],width:21.2,y:.048,verge:false},
    {points:[{x:46.5,z:4.5},{x:44,z:13},{x:41,z:22},{x:38,z:30}],width:6.3,y:.049,verge:true});
  const mask=junctionMask(runs);
  for(const run of runs){
    const stations=roadStations(run,villaRoadCrossSection);
    model.geometry(driveRibbon(stations,run,'asphalt',mask),asphalt);
    if(run.verge) for(const side of ['left','right'] as const) model.geometry(driveRibbon(stations,run,side,mask),shoulder);
    if(run.points===VILLA_SCENIC_ROAD_SAMPLES) model.geometry(quietEdgePaint(stations,run,mask),paint);
  }
  // Preserve the three familiar island trees and their collider identities/API.
  for (const [x, z, height] of [[1, 39, 3.8], [6, 40, 4.2], [10, 38, 3.4]]) {
    const y = villaTerrainHeight(x, z);
    addVillaIslandTree(model,x,y,z,height,bark,leaf);
    model.collide(x, y, z, .3, height, .3);
  }
  model.finish();
  return { colliders: model.colliders, update(state) { root.userData.contact = state.contact; root.userData.distance = state.distance; } };
}
