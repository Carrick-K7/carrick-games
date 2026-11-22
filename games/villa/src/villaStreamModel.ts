import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { fieldStone } from './villaNatureGeometry.js';
import { addVillaMeadowTuft, addVillaUnderstory, addVillaWoodlandTree } from './villaWoodlandArt.js';
import { createVillaTreelineAtlas, SHOOT, shootU, shootV, woodRandom } from './villaTreelineAtlas.js';
import { addVillaStandTree, villaTreelinePlots } from './villaTreelineStands.js';
import { addRiparianStreamWater } from './villaRiparianWater.js';
import { addStreamHabitat } from './villaRiparianBanks.js';
import { RiparianTrail } from './villaRiparianTrail.js';
import { sawnGrain, timberMember } from './villaOutdoorJoinery.js';
import type { VillaCollider } from './villaWorld.js';
import {
  VILLA_LANDSCAPE_CLUSTERS, VILLA_LANDSCAPE_TREES, VILLA_LANDSCAPE_RENDER_BUDGET,
  VILLA_STREAM, VILLA_STREAM_BRIDGE, VILLA_STREAM_PATH, VILLA_STREAM_RENDER_BUDGET,
  villaStreamBridgeHeight,
} from './villaStream.js';

function geometry(positions: number[], indices: number[]) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices); g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere(); return g;
}
function rock(b: VillaModelBuilder, x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, yaw: number) {
  b.geometry(fieldStone(yaw, sx, sy, sz), material, [x, y, z], [0, yaw, 0]);
}
/** One vertex-coloured draw per compass region gives useful frustum culling
 * without paying a draw for every tree or every foliage shade. */
class LandscapeRegionBuilder extends VillaModelBuilder {
  constructor(parent: THREE.Object3D, name: string, private readonly surface: THREE.MeshStandardMaterial) { super(parent, name); }
  override geometry(g: THREE.BufferGeometry, paint: THREE.Material, position: [number, number, number] = [0, 0, 0], rotation: [number, number, number] = [0, 0, 0]) {
    const color = (paint as THREE.MeshStandardMaterial).color, count = g.getAttribute('position').count, colors = new Float32Array(count * 3);
    const shade = g.getAttribute('color');
    if (!g.hasAttribute('uv')) {
      // Tubes/field stones sample solid white. They can therefore share the
      // cutout material without either a fifth draw or an accidental bark hole.
      const uv = new Float32Array(count * 2), u = shootU(SHOOT.solid,.5), v = shootV(SHOOT.solid,.5);
      for (let i = 0; i < count; i++) { uv[i * 2] = u; uv[i * 2 + 1] = v; }
      g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    }
    for (let i = 0; i < count; i++) { const k = shade?.getX(i) ?? 1; colors[i * 3] = color.r * k; colors[i * 3 + 1] = color.g * k; colors[i * 3 + 2] = color.b * k; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); super.geometry(g, this.surface, position, rotation);
  }
}

/** Scene-owned stream/basin, timber bridge and low planting. No network, DOM,
 * timers, reflection passes or per-frame geometry uploads. Host scene traversal
 * disposes every resource. update() writes only bounded water phases and rain
 * into one existing uniform; do not add it to the discrete-input cache key. */
export function createVillaStreamModel(parent: THREE.Object3D): {
  root: THREE.Group; colliders: VillaCollider[]; update: (elapsedSeconds: number, rain?: number) => void;
} {
  const root = new THREE.Group(); root.name = 'villa-north-stream'; parent.add(root);
  root.userData = { waterY: VILLA_STREAM.waterY, flowing: true, waterUnsupportedExceptBridge: true, renderBudget: VILLA_STREAM_RENDER_BUDGET };
  const flow = addRiparianStreamWater(root, geometry);

  const b = new VillaModelBuilder(root, 'villa-stream-bank-details');
  const timber = villaMaterial('#a18360', .9), edgeTimber = villaMaterial('#80674a', .95), darkWood = villaMaterial('#665640', .98);
  const stone = villaMaterial('#9c9b8d', 1), paleStone = villaMaterial('#b0ab95', 1);
  timber.name = 'stream-bridge-timber'; edgeTimber.name = 'stream-bridge-framing';
  for (const wood of [timber, edgeTimber]) {
    sawnGrain(wood); const fallback = wood.onBeforeCompile;
    // The scene may bind a real cedar study to these metre-space faces. Do
    // not draw simulated growth rings a second time over the photographed grain.
    wood.onBeforeCompile = (shader, renderer) => { if (!wood.map) fallback.call(wood, shader, renderer); };
    wood.customProgramCacheKey = () => wood.map ? 'villa-bridge-cedar' : 'villa-sawn-grain-v1';
  }
  const bridge = VILLA_STREAM_BRIDGE, centreZ = (bridge.minZ + bridge.maxZ) / 2, width = bridge.maxX - bridge.minX, length = bridge.maxZ - bridge.minZ;
  // Continuous underdeck beneath tiny plank joints, two stout stringers and a
  // central beam on four dry-bank abutments: no floating timber landing.
  b.box(0, .005, centreZ, width, .03, length, darkWood, 0);
  const plankCount = 32, pitch = length / plankCount;
  for (let i = 0; i < plankCount; i++) {
    const z = bridge.minZ + (i + .5) * pitch;
    timberMember(b, [-width / 2, .05, z], [width / 2, .05, z], pitch - .006, .06, i % 6 ? timber : edgeTimber, .007);
    // Counterbored pegs head over both hidden stringers, not out in empty air.
    if (i % 2 === 0) for (const x of [-1.85, 1.85]) b.cylinder(x, .079, z, .023, .023, .004, darkWood, [0, 0, 0], 7);
  }
  for (const x of [-1.85, 0, 1.85]) b.box(x, -.04, centreZ, .16, .09, length, darkWood, 0);
  for (const z of [bridge.minZ + .28, bridge.maxZ - .28]) {
    // Separate staggered limestone courses under the bearing sill.
    for (let course = 0; course < 2; course++) {
      const n = course ? 5 : 4, w = (width - .16) / n;
      for (let j = 0; j < n; j++) b.box(-width / 2 + .08 + (j + .5) * w, -.53 + course * .323, z, w - .008, .321, .36, (j + course) % 4 ? stone : paleStone, 0);
    }
    b.box(0, -.10, z, width, .15, .38, edgeTimber, 0);
  }
  for (const [za, zb] of [[bridge.approachMinZ, bridge.minZ], [bridge.maxZ, bridge.approachMaxZ]]) {
    const count = 8, run = (zb - za) / count, bevel = .0038;
    for (let i = 0; i < count; i++) {
      // Adjacent square-cut ends meet 4mm below the riding face. Fine V seams
      // now continue around the end grain; no painted bars above the ramp.
      const start = za + i * run, end = start + run, v: number[] = [], ids: number[] = [];
      const sections = [[start, i ? -.004 : 0], [start + bevel, 0], [end - bevel, 0], [end, i + 1 < count ? -.004 : 0]];
      for (const [j, [z, delta]] of sections.entries()) {
        const y = villaStreamBridgeHeight(0, z)! + delta;
        v.push(bridge.minX,y,z, bridge.maxX,y,z, bridge.minX,-.05,z, bridge.maxX,-.05,z);
        if (j) {
          const n = (j - 1) * 4;
          ids.push(n,n+4,n+1, n+1,n+4,n+5, n,n+2,n+4, n+4,n+2,n+6, n+1,n+5,n+3, n+3,n+5,n+7);
        }
      }
      if (!i) ids.push(0,1,2, 1,3,2);
      if (i === count - 1) ids.push(12,14,13, 13,14,15);
      const flat = new THREE.BufferGeometry(); flat.setAttribute('position',new THREE.Float32BufferAttribute(ids.flatMap(k=>v.slice(k*3,k*3+3)),3)); flat.computeVertexNormals();
      const uv: number[] = [], p = flat.getAttribute('position'), normals = flat.getAttribute('normal'), seed = Math.sin(start * 3.77);
      for (let k=0;k<p.count;k++) {
        if (Math.abs(normals.getX(k)) > .9) uv.push(-10 + p.getZ(k)-start, p.getY(k));
        else uv.push(p.getX(k)-bridge.minX+1.3+seed, p.getZ(k)-start+seed*.31);
      }
      flat.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); b.geometry(flat, i % 7 === 2 ? edgeTimber : timber);
    }
  }
  for (const x of [-bridge.railX, bridge.railX]) {
    for (let i = 0; i < 5; i++) {
      const z = bridge.railMinZ + .06 + (bridge.railMaxZ - bridge.railMinZ - .12) * i / 4;
      timberMember(b, [x, .055, z], [x, 1.12, z], .12, .12, edgeTimber, .010);
      for (const h of [.60, 1.055]) b.cylinder(x, h, z, .017, .017, .122, darkWood, [0, 0, Math.PI / 2], 8);
      if (i < 4) {
        const next = z + (bridge.railMaxZ - bridge.railMinZ - .12) / 4, mid = (z + next) / 2;
        for (const foot of [z + .041, next - .041]) timberMember(b, [x, .30, foot], [x, .60, mid], .052, .045, edgeTimber, .005);
      }
    }
    for (const y of [.60, 1.085]) timberMember(b, [x, y, bridge.railMinZ], [x, y, bridge.railMaxZ], .105, .07, timber, .010);
    b.colliders.push({ minX: x - .06, maxX: x + .06, minZ: bridge.railMinZ, maxZ: bridge.railMaxZ, minY: .06, maxY: bridge.railTopY });
  }
  const bridgeMarker = new THREE.Object3D(); bridgeMarker.name = 'villa-stream-timber-footbridge'; bridgeMarker.userData = { ...bridge, support: 'villaStreamBridgeHeight', abutments: 2, stringers: 3, plankCount }; root.add(bridgeMarker);

  // Gravel approach is deliberately narrow through the two retained fruit
  // trees; it widens at the last two metres to meet the generous bridge deck.
  const trail = new RiparianTrail('stream-walking-gravel', 12174, 2.6);
  for (const [za, zb, wideningEnd] of [[VILLA_STREAM_PATH.minZ, bridge.approachMinZ, true], [bridge.approachMaxZ, VILLA_STREAM_PATH.maxZ, false]] as const) {
    trail.path([{ x: 0, z: za }, { x: 0, z: zb }], p => 2 * VILLA_STREAM_PATH.halfWidth
      + (width - 2 * VILLA_STREAM_PATH.halfWidth) * Math.max(0, 1 - (wideningEnd ? zb - p.z : p.z - za) / 2), true);
  }
  trail.finish(b); addStreamHabitat(b); flow.chartFrom(b.finish());
  return { root, colliders: b.colliders, update: flow.update };
}

/** The open near meadow, wooded middle distance and planted uplands remain
 * outside the playable fence. The exterior grass plane is at -1.14, NOT the
 * in-fence terrain height; ridge sites additionally sample the actual folds. */
export function createVillaPeripheralLandscape(parent: THREE.Object3D, groundHeight: (x: number, z: number) => number = () => -1.14): { root: THREE.Group; colliders: VillaCollider[] } {
  const root = new THREE.Group(); root.name = 'villa-peripheral-copses'; parent.add(root);
  const material = new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1, map:createVillaTreelineAtlas(),
    alphaTest:.45, side:THREE.DoubleSide }); material.name = 'villa/regional-woodland';
  const regions = { west: new LandscapeRegionBuilder(root, 'landscape-west', material), east: new LandscapeRegionBuilder(root, 'landscape-east', material),
    north: new LandscapeRegionBuilder(root, 'landscape-north', material), south: new LandscapeRegionBuilder(root, 'landscape-south', material) };
  const bark = villaMaterial('#716354',1), birch = villaMaterial('#cdc9ad',1), dark = villaMaterial('#536b53',1);
  const oak = villaMaterial('#839865',1), lime = villaMaterial('#a5b77c',1), pine = villaMaterial('#6c8875',1);
  const shrub = villaMaterial('#8a9a61',1), grass = villaMaterial('#99a66d',1), straw = villaMaterial('#bcb178',1), stone = villaMaterial('#a5a495',1);
  const paint = {bark,birch,dark,oak,lime,pine}, palette = [...Object.values(paint),shrub,grass,straw,stone];
  palette.forEach(p => { p.vertexColors = true; });
  VILLA_LANDSCAPE_TREES.forEach((tree, i) => {
    const b = regions[tree.side], { x, z, scale: s, kind } = tree, y = groundHeight(x, z);
    const marker = new THREE.Object3D(); marker.name = `landscape-${tree.side}-${kind}`; marker.position.set(x, y, z); marker.userData = { ...tree, sceneryOnly: true }; b.root.add(marker);
    b.at(x, y, z, tree.yaw, () => addVillaWoodlandTree(b, kind, s, i * 2.399, paint));
  });
  VILLA_LANDSCAPE_CLUSTERS.forEach((cluster, i) => {
    const b = regions[cluster.side], rand = woodRandom(41.6 + i);
    for (let j = 0; j < 10; j++) {
      const angle = j * 2.399 + i * .73 + rand() * .42, r = cluster.radius * (.22 + .76 * Math.sqrt(rand()));
      const x = cluster.x + Math.cos(angle) * r, z = cluster.z + Math.sin(angle) * r, y = groundHeight(x,z);
      if (j === 0 && i % 2 === 0) rock(b,x,y + .15,z,.56 + rand() * .7,.43,.62,stone,angle);
      if (j < 4) b.at(x,y,z,angle,() => addVillaUnderstory(b,1.10 + rand() * 1.30,angle,bark,shrub,j % 2 ? lime : oak));
      // Low grasses run around, not through, the exposed stems. The pocket
      // itself ends; do not string identical bushes along the whole fence.
      const gx = x + Math.cos(angle) * .80, gz = z + Math.sin(angle) * .80;
      b.at(gx,groundHeight(gx,gz),gz,angle,() => addVillaMeadowTuft(b,.76 + rand() * .55,angle,grass,straw));
    }
  });
  const {plots,floor} = villaTreelinePlots(groundHeight);
  for (const p of plots) {
    const b = regions[p.side]; b.at(p.x,p.y,p.z,0,() => addVillaStandTree(b,p,paint,floor));
  }
  Object.values(regions).forEach(b => b.finish());
  // These swatches never reach WebGL. The one retained surface exposes its
  // atlas through .map for the scene's ordinary deduplicating disposal pass.
  palette.forEach(p => p.dispose());
  root.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = false; node.receiveShadow = false; } });
  root.userData = { renderBudget: VILLA_LANDSCAPE_RENDER_BUDGET, sceneryOnly:true, outsideWalkableFence:true,
    trees:VILLA_LANDSCAPE_TREES.length, clusters:VILLA_LANDSCAPE_CLUSTERS.length, meadowWood:plots.filter(p => !p.fell).length,
    ridgeWood:plots.filter(p => p.fell).length, species:['oak','birch','pine'] };
  return { root, colliders: [] };
}
