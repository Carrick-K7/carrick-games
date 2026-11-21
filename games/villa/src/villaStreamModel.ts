import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { fieldStone } from './villaNatureGeometry.js';
import { addVillaWaterMargin, addVillaUnderstory, addVillaWoodlandTree } from './villaWoodlandArt.js';
import { sawnGrain, timberMember } from './villaOutdoorJoinery.js';
import type { VillaCollider } from './villaWorld.js';
import {
  VILLA_LANDSCAPE_CLUSTERS, VILLA_LANDSCAPE_TREES, VILLA_LANDSCAPE_RENDER_BUDGET,
  VILLA_STREAM, VILLA_STREAM_BRIDGE, VILLA_STREAM_PATH, VILLA_STREAM_RENDER_BUDGET,
  VILLA_STREAM_SECTIONS, villaStreamBasinGeometry, villaStreamBridgeHeight, villaStreamSectionAt, villaStreamTerrainHeight,
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
    for (let i = 0; i < count; i++) { const k = shade?.getX(i) ?? 1; colors[i * 3] = color.r * k; colors[i * 3 + 1] = color.g * k; colors[i * 3 + 2] = color.b * k; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); super.geometry(g, this.surface, position, rotation);
  }
}

/** Scene-owned stream/basin, timber bridge and low planting. No network, DOM,
 * timers, reflection passes or per-frame geometry uploads. Host scene traversal
 * disposes every resource. update() only changes a water shader uniform; do NOT
 * insert its clock into the software-renderer's discrete-input cache key. */
export function createVillaStreamModel(parent: THREE.Object3D): {
  root: THREE.Group; colliders: VillaCollider[]; update: (elapsedSeconds: number) => void;
} {
  const root = new THREE.Group(); root.name = 'villa-north-stream'; parent.add(root);
  root.userData = { waterY: VILLA_STREAM.waterY, flowing: true, waterUnsupportedExceptBridge: true, renderBudget: VILLA_STREAM_RENDER_BUDGET };
  const data = villaStreamBasinGeometry(), basinGeometry = geometry(data.positions, data.indices);
  const colors: number[] = [], dry = new THREE.Color('#a69c78'), wet = new THREE.Color('#79775d'), deep = new THREE.Color('#959077');
  for (let i = 0; i < data.positions.length; i += 3) {
    const x = data.positions[i]!, y = data.positions[i + 1]!, z = data.positions[i + 2]!;
    const c = y >= VILLA_STREAM.waterY ? wet.clone().lerp(dry, (y - VILLA_STREAM.waterY) / -VILLA_STREAM.waterY) : wet.clone().lerp(deep, (VILLA_STREAM.waterY - y) / (VILLA_STREAM.waterY - VILLA_STREAM.bedY));
    c.multiplyScalar(.97 + .03 * Math.sin(x * 1.7 + z * 3.1)); colors.push(c.r, c.g, c.b);
  }
  basinGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const silt = villaMaterial('#ffffff', .98); silt.vertexColors = true;
  const basin = new THREE.Mesh(basinGeometry, silt); basin.name = 'villa-stream-basin-and-banks'; basin.receiveShadow = true; root.add(basin);

  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  VILLA_STREAM_SECTIONS.forEach((p, i) => {
    positions.push(p.x, VILLA_STREAM.waterY, p.z - p.halfWidth, p.x, VILLA_STREAM.waterY, p.z + p.halfWidth);
    uvs.push(p.x, 0, p.x, 1);
    if (i) { const n = (i - 1) * 2; indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2); }
  });
  const waterGeometry = geometry(positions, indices); waterGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const water = new THREE.MeshStandardMaterial({ color: '#658f88', roughness: .23, metalness: .05, transparent: true, opacity: .68, depthWrite: false });
  water.name = 'villa-stream-flowing-water';
  const time = { value: 0 };
  // Animated longitudinal ripple shading, in metres, makes modest west→east
  // flow visible without moving the water edge or simulating a whole ocean.
  water.onBeforeCompile = shader => {
    shader.uniforms.villaStreamTime = time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 villaStreamUV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvillaStreamUV = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float villaStreamTime;\nvarying vec2 villaStreamUV;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float flow = villaStreamUV.x - villaStreamTime * ${VILLA_STREAM.flowMetresPerSecond.toFixed(2)};
        float ripple = sin(flow * 5.0 + sin(villaStreamUV.y * 13.0) * 1.6);
        float smallRipple = sin(flow * 11.0 - villaStreamUV.y * 23.0);
        float edgeFade = smoothstep(0.0, 0.16, villaStreamUV.y) * smoothstep(0.0, 0.16, 1.0 - villaStreamUV.y);
        float glint = pow(max(0.0, ripple * 0.7 + smallRipple * 0.3), 10.0) * edgeFade;
        diffuseColor.rgb *= 0.97 + ripple * 0.035 + smallRipple * 0.018;
        diffuseColor.rgb += vec3(0.12, 0.14, 0.12) * glint;
      `);
  };
  water.customProgramCacheKey = () => 'villa-stream-metres-flow-v1';
  const surface = new THREE.Mesh(waterGeometry, water); surface.name = 'villa-stream-water'; surface.receiveShadow = true; root.add(surface);

  const b = new VillaModelBuilder(root, 'villa-stream-bank-details');
  const timber = villaMaterial('#a18360', .9), edgeTimber = villaMaterial('#80674a', .95), darkWood = villaMaterial('#665640', .98);
  const stone = villaMaterial('#9c9b8d', 1), paleStone = villaMaterial('#b0ab95', 1), leaf = villaMaterial('#697b48', 1);
  const reedTip = villaMaterial('#9b8960', 1), grass = villaMaterial('#88905b', 1), gravel = villaMaterial('#b5ac8e', 1);
  leaf.side = grass.side = THREE.DoubleSide;
  timber.name = 'stream-bridge-timber'; edgeTimber.name = 'stream-bridge-framing';
  sawnGrain(timber); sawnGrain(edgeTimber);
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
  for (const [za, zb, wideningEnd] of [[VILLA_STREAM_PATH.minZ, bridge.approachMinZ, true], [bridge.approachMaxZ, VILLA_STREAM_PATH.maxZ, false]] as const) {
    const count = Math.ceil((zb - za) / .5), p: number[] = [], ids: number[] = [];
    for (let i = 0; i <= count; i++) {
      const z = za + (zb - za) * i / count, distance = wideningEnd ? zb - z : z - za;
      const half = VILLA_STREAM_PATH.halfWidth + (width / 2 - VILLA_STREAM_PATH.halfWidth) * Math.max(0, 1 - distance / 2);
      p.push(-half, .008, z, half, .008, z);
      if (i) { const k = (i - 1) * 2; ids.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    b.geometry(geometry(p, ids), gravel);
  }
  // Uneven groups rather than identical reeds on every transect. Leave the
  // bridge sightline and approaches completely open. Only low pebbles enter
  // walkable dry banks; larger stones sit IN already unsupported water.
  for (let i = 0; i < 47; i++) {
    const x = VILLA_STREAM.minX + 1.1 + i * 2.31;
    if (Math.abs(x) < 5.2) continue;
    const s = villaStreamSectionAt(x); if (!s) continue;
    const side = i % 3 ? 1 : -1, z = s.z + side * (s.halfWidth + .24 + (i % 4) * .17), y = villaStreamTerrainHeight(x, z) ?? 0;
    if (i % 5 !== 1) {
      b.at(x, y, z, i * .73, () => addVillaWaterMargin(b, .9 + (i % 4) * .13, i * 2.399, leaf, grass, reedTip, i % 3 === 0));
    }
    if (i % 3 === 0) {
      // 10cm-high bank pebbles do not require phantom shin-high colliders.
      rock(b, x + .24, y + .025, z - side * .08, .21, .07, .15, i % 2 ? paleStone : stone, i);
    }
    if (i % 4 === 1) {
      const rz = s.z + side * (s.halfWidth - .42), floor = villaStreamTerrainHeight(x, rz)!;
      rock(b, x, floor + .11, rz, .33, .24, .27, stone, i * .8);
    }
  }
  // A few submerged stones make the moving transparent surface visibly shallow.
  for (let i = 0; i < 54; i++) {
    const x = -42.5 + i * 1.99, s = villaStreamSectionAt(x); if (!s) continue;
    const z = s.z + Math.sin(i * 2.399) * s.halfWidth * .5, y = villaStreamTerrainHeight(x, z)!;
    rock(b, x, y + .035, z, .08 + i % 3 * .027, .06, .12, i % 3 ? stone : paleStone, i);
  }
  b.finish();
  return { root, colliders: b.colliders, update(elapsedSeconds) { if (Number.isFinite(elapsedSeconds)) time.value = Math.max(0, elapsedSeconds); } };
}

/** Batched, low-poly mixed copses. These are outside the fence, so no new
 * gameplay obstacles or hidden walls are returned. Default ground is the TOP
 * of VillaScene's existing distant grass box (-1.2 + .12/2), not estate height.
 * A parent adding exterior terrain can provide its own exact ground sampler. */
export function createVillaPeripheralLandscape(parent: THREE.Object3D, groundHeight: (x: number, z: number) => number = () => -1.14): { root: THREE.Group; colliders: VillaCollider[] } {
  const root = new THREE.Group(); root.name = 'villa-peripheral-copses'; parent.add(root);
  const material = villaMaterial('#ffffff', 1); material.vertexColors = true;
  const regions = { west: new LandscapeRegionBuilder(root, 'landscape-west', material), east: new LandscapeRegionBuilder(root, 'landscape-east', material),
    north: new LandscapeRegionBuilder(root, 'landscape-north', material), south: new LandscapeRegionBuilder(root, 'landscape-south', material) };
  const bark = villaMaterial('#70604b', 1), birch = villaMaterial('#b9b6a4', 1), dark = villaMaterial('#4d6550', 1);
  const oak = villaMaterial('#67794d', 1), lime = villaMaterial('#81935a', 1), pine = villaMaterial('#4b6a55', 1);
  const shrub = villaMaterial('#73825c', 1), stone = villaMaterial('#9b9b8b', 1);
  material.side = THREE.DoubleSide;
  for (const p of [oak, lime, dark, pine, shrub]) { p.side = THREE.DoubleSide; p.vertexColors = true; }
  VILLA_LANDSCAPE_TREES.forEach((tree, i) => {
    const b = regions[tree.side], { x, z, scale: s, kind } = tree, y = groundHeight(x, z);
    const marker = new THREE.Object3D(); marker.name = `landscape-${tree.side}-${kind}`; marker.position.set(x, y, z); marker.userData = { ...tree, sceneryOnly: true }; b.root.add(marker);
    b.at(x, y - .03, z, tree.yaw, () => {
      addVillaWoodlandTree(b, kind, s, i * 2.399, { bark, birch, dark, oak, lime, pine });
    });
  });
  // Composed low foreground around each copse, interspersed with exposed stone.
  // Gaps between clusters remain 15–35m of open meadow, not a hedge-wall band.
  VILLA_LANDSCAPE_CLUSTERS.forEach((cluster, i) => {
    const b = regions[cluster.side];
    for (let j = 0; j < 7; j++) {
      const angle = j * 2.399 + i * .73, r = cluster.radius * (.33 + (j % 3) * .24);
      const x = cluster.x + Math.cos(angle) * r, z = cluster.z + Math.sin(angle) * r, y = groundHeight(x, z);
      const s = .55 + ((i + j) % 4) * .16;
      if (j === 1 || j === 5) rock(b, x, y + .23 * s, z, .9 * s, .55 * s, .65 * s, stone, angle);
      else {
        b.at(x, y, z, angle, () => addVillaUnderstory(b, s, angle, bark, shrub, (i + j) % 3 ? lime : dark));
      }
    }
  });
  Object.values(regions).forEach(b => b.finish());
  // Palette paints were baked to vertex attributes, not retained GPU resources.
  [bark, birch, dark, oak, lime, pine, shrub, stone].forEach(paint => paint.dispose());
  // Shadow maps need not rasterize distant copses beyond the property fence.
  root.traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = false; });
  root.userData = { renderBudget: VILLA_LANDSCAPE_RENDER_BUDGET, sceneryOnly: true, outsideWalkableFence: true, trees: VILLA_LANDSCAPE_TREES.length, clusters: VILLA_LANDSCAPE_CLUSTERS.length, species: ['oak', 'birch', 'pine'] };
  return { root, colliders: [] };
}
