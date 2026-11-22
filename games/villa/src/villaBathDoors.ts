import * as THREE from 'three';
import { villaMaterial } from './villaModel.js';
import { IndexedFittingBuilder, piercedPanel, vessel } from './villaFittingGeometry.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider, type VillaPosition } from './villaWorld.js';

export type VillaBathDoorId = 'west' | 'east';
/** Exactly two entryways matching villaWorld's clear jambs. Both pairs slide
 * NORTH and stack on the bathroom-side return, never into the south bath wall.
 * `swing` is a retained orientation sign, NOT an angular motion parameter:
 * +X is into the bath at west; -X is into it at east. */
export const VILLA_BATH_OPENINGS = {
  west: { x: 8, z0: -6.2, z1: -3.4, swing: 1 },
  east: { x: 17, z0: -4, z1: 0, swing: -1 },
} as const;
export const VILLA_BATH_DOOR_DIMENSIONS = {
  floorY: 3.6, bottom: .03, height: 2.9, thickness: .064,
  // Parallel bath-side tracks clear the world's 0.135m-deep oak jambs.
  nearTrackDepth: .235, farTrackDepth: .360, jambOverlap: .45, meetingOverlap: .30,
  parkingGap: .06, railOverhang: .12, railY: 3.065, seconds: 1.5,
} as const;

export interface VillaBathDoorState {
  west: boolean;
  east: boolean;
  progressW: number;
  progressE: number;
}
/** Upright player cylinder in the authored villa coordinates. Position is FEET,
 * not eye height; supply actual body height (including jump offset if using the
 * ground position). Omit only when no player occupies the world. */
export interface VillaBathDoorBlocker {
  position: VillaPosition;
  height?: number;
  radius?: number;
}

const IDS = ['west', 'east'] as const;
const D = VILLA_BATH_DOOR_DIMENSIONS;
const progressOf = (value: number | undefined) => Number.isFinite(value) ? Math.max(0, Math.min(1, value!)) : 0;
const eased = (progress: number) => progress * progress * (3 - 2 * progress);
const progressKey = (which: VillaBathDoorId) => which === 'west' ? 'progressW' : 'progressE';

/** Shared panel/roller bounds for rendering, live collision and exact swept
 * translation. Flush recessed pulls remain INSIDE the 64mm panel thickness;
 * the two tracks retain 61mm of clear space even when the leaves are stacked. */
export const VILLA_BATH_SLIDING_LEAVES = IDS.flatMap(which => [0, 1].map(end => {
  const opening = VILLA_BATH_OPENINGS[which], middle = (opening.z0 + opening.z1) / 2;
  // Sliding leaves need REAL cover behind their jambs. A 15mm cover at a
  // 235/360mm inset left a clear view around the panels from the gallery.
  // Generous wall overlap plus a lapped centre joint seals ordinary oblique
  // sightlines without a fixed return obstructing either moving track.
  const closedMinZ = end ? middle - D.meetingOverlap / 2 : opening.z0 - D.jambOverlap;
  const closedMaxZ = end ? opening.z1 + D.jambOverlap : middle + D.meetingOverlap / 2;
  const width = closedMaxZ - closedMinZ, closedZ = (closedMinZ + closedMaxZ) / 2;
  const parkedZ = opening.z0 - D.parkingGap - width / 2;
  const rollers = [-width * .32, width * .32];
  const shapes: VillaCollider[] = [{
    minX: -D.thickness / 2, maxX: D.thickness / 2,
    minY: D.bottom, maxY: D.bottom + D.height,
    minZ: -width / 2, maxZ: width / 2,
  }, ...rollers.map(z => ({
    minX: -.022, maxX: .022, minY: 2.89, maxY: 3.055,
    minZ: z - .035, maxZ: z + .035,
  }))];
  // Keep both finger cups in the visible aperture rather than burying the
  // leading pull behind the newly extended jamb cover.
  const handleZ = (end ? opening.z1 - .18 : middle - .26) - closedZ;
  return { which, end, width, rollers, handleZ, shapes,
    x: opening.x + opening.swing * (end ? D.farTrackDepth : D.nearTrackDepth),
    closedZ, parkedZ, travel: closedZ - parkedZ,
  };
}));
const LEAVES = VILLA_BATH_SLIDING_LEAVES;
const leafZ = (leaf: (typeof LEAVES)[number], progress: number) => leaf.closedZ - leaf.travel * eased(progress);

function overlapsLocal(x: number, y: number, z: number, height: number, radius: number, shape: VillaCollider): boolean {
  if (y + height <= shape.minY || y >= shape.maxY) return false;
  const dx = x - Math.max(shape.minX, Math.min(x, shape.maxX));
  const dz = z - Math.max(shape.minZ, Math.min(z, shape.maxZ));
  return dx * dx + dz * dz < radius * radius;
}

function sweptLeafBlocked(leaf: (typeof LEAVES)[number], from: number, to: number, body: VillaBathDoorBlocker): boolean {
  const a = leafZ(leaf, from), b = leafZ(leaf, to);
  // The union of an axis-aligned box translating along Z is exactly this box,
  // not a sampled path or radial inflation. Even an unbounded dt cannot move
  // a panel through a cylinder that clears both endpoint poses.
  return leaf.shapes.some(shape => overlapsLocal(body.position.x - leaf.x, body.position.y - D.floorY, body.position.z,
    body.height ?? 1.75, body.radius ?? PLAYER_RADIUS,
    { ...shape, minZ: shape.minZ + Math.min(a, b), maxZ: shape.maxZ + Math.max(a, b) }));
}

export function createVillaBathDoors(): VillaBathDoorState {
  return { west: false, east: false, progressW: 0, progressE: 0 };
}

export function toggleVillaBathDoor(state: VillaBathDoorState, which: VillaBathDoorId): boolean {
  if (!IDS.includes(which)) return false;
  state[which] = !state[which];
  return true;
}

/** Advance before refreshing the scene's colliders and moving the player.
 * An obstructed pair pauses together at the last safe pose, in BOTH directions;
 * its target stays set and motion resumes when the player clears the track.
 * The other entryway continues independently. No player relocation/push-out. */
export function advanceVillaBathDoors(state: VillaBathDoorState, dt: number, blocker?: VillaBathDoorBlocker): boolean {
  if (!Number.isFinite(dt) || dt <= 0) return false;
  if (blocker && (![blocker.position.x, blocker.position.y, blocker.position.z, blocker.height ?? 1.75, blocker.radius ?? PLAYER_RADIUS].every(Number.isFinite)
    || (blocker.height ?? 1.75) <= 0 || (blocker.radius ?? PLAYER_RADIUS) <= 0)) return false;
  const step = Math.min(1, dt / D.seconds);
  let changed = false;
  for (const which of IDS) {
    const key = progressKey(which), before = progressOf(state[key]), target = Number(state[which]);
    const proposed = before + Math.sign(target - before) * Math.min(step, Math.abs(target - before));
    // Finish an accumulated fractional clock at its exact endpoint rather than
    // spend another frame on a progress ULP whose eased geometry cannot move.
    const next = Math.abs(target - proposed) < 1e-12 ? target : proposed;
    let accepted = before;
    if (!blocker) accepted = next;
    else if (next !== before) {
      // Smoothstep's derivative is at most 1.5; limit far-panel travel to 1cm
      // for a close safe stop, with <=677 bounded substeps even for infinite-
      // sized finite dt. Each substep still tests the complete swept volume.
      const travel = Math.max(...LEAVES.filter(leaf => leaf.which === which).map(leaf => leaf.travel));
      const steps = Math.max(1, Math.ceil(Math.abs(next - before) * travel * 1.5 / .01));
      for (let i = 1; i <= steps; i++) {
        const candidate = before + (next - before) * i / steps;
        if (LEAVES.some(leaf => leaf.which === which && sweptLeafBlocked(leaf, accepted, candidate, blocker))) break;
        accepted = candidate;
      }
    }
    if (accepted !== state[key]) changed = true;
    state[key] = accepted;
  }
  return changed;
}

/** Kiln-formed vertical reeds on the dry face; the shower-side return is
 * smooth to clean. The thickness/closed edges and angular facet normals are
 * real even without any environment map, target, transparency pass or bump map. */
export function reededGlass(width:number,height:number,thickness:number, pitch=.044, depth=.0035, sealEnds=false) {
  const n=Math.max(2,Math.round(width/pitch)), xyz:number[]=[], uv:number[]=[], index:number[]=[];
  const pt=(x:number,y:number,z:number)=>{xyz.push(x,y,z);uv.push(x,y);return xyz.length/3-1;};
  const quad=(a:number,b:number,c:number,d:number)=>{index.push(a,b,c,a,c,d);};
  const bottom:number[]=[], top:number[]=[], h=height/2, w=width/2, t=thickness/2;
  for(let i=0;i<=n*4;i++) {
    const x=width*i/(n*4)-w, z=t + depth*[0,.78,1,.78][i%4];
    bottom.push(pt(x,-h,z)); top.push(pt(x,h,z));
    if(i) quad(bottom[i-1],bottom[i],top[i],top[i-1]);
  }
  const back=[pt(-w,-h,-t),pt(w,-h,-t),pt(w,h,-t),pt(-w,h,-t)];
  quad(back[1],back[0],back[3],back[2]);
  quad(pt(-w,-h,-t),pt(-w,-h,t),pt(-w,h,t),pt(-w,h,-t));
  quad(pt(w,-h,t),pt(w,-h,-t),pt(w,h,-t),pt(w,h,t));
  // Flush gaskets cover the horizontal cuts on a door. A free-standing
  // shower pane has exposed polished edges instead (one continuous face fan).
  if(!sealEnds) for(const edge of [-1,1]) {
    const y=edge*h, a=pt(-w,y,-t), b=pt(w,y,-t);
    let prev=pt(-w,y,t);for(let i=1;i<=n*4;i++){
      const j=pt(width*i/(n*4)-w,y,t+depth*[0,.78,1,.78][i%4]);
      if(edge>0) index.push(a,prev,j);else index.push(a,j,prev); prev=j;
    }if(edge>0) index.push(a,prev,b);else index.push(a,b,prev);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
}

/** A sintered frit is pigmented *in* glass. A subdued strié in the opacity-
 * preserving central band reads from either room. No alpha holes at eye height. */
function sandblast(m:THREE.MeshStandardMaterial) {
  const w=64,h=64,rgba=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const reed=(x%16)/16, satin=.5+.5*Math.cos(reed*2*Math.PI), grain=((x*31+y*17+x*y*3)%19)/19;
    const v=231+Math.round(14*satin+7*grain);const i=(y*w+x)*4;rgba[i]=v-4;rgba[i+1]=v;rgba[i+2]=v-1;rgba[i+3]=255;
  }
  const tex=new THREE.DataTexture(rgba,w,h);tex.name='Door etched strié';tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(4.8,3.2);tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.needsUpdate=true;m.map=tex;
}

/** Parent owns disposal and must append these LIVE collider objects (not copies)
 * to its collision list. update(undefined) resets to closed. The authored root
 * is upright/unscaled; rigid parent translation/yaw is reflected by update,
 * but the pure advance() guard always receives authored villa coordinates. */
export function createVillaBathDoorModel(parent: THREE.Object3D) {
  const root = new THREE.Group(); root.name = 'bath-doors'; root.userData = { kind: 'bath-doors', entryways: 2, movingLeaves: 4, motion: 'north-stacking-slide', seconds: D.seconds }; parent.add(root);
  // Satin etched glass admits light, not a clear bathroom view. The central
  // opaque ceramic-frit band covers both standing and seated sightlines, and a
  // second thin band makes the privacy treatment intentional from either side.
  const frosted = villaMaterial('#c4d7d4', .93);
  frosted.transparent = true; frosted.opacity = .93; frosted.depthWrite = true; frosted.name = 'bath-door-frosted';
  const privacy = villaMaterial('#b6cbc5', .78); privacy.name = 'bath-door-privacy-frit'; sandblast(privacy); frosted.map = privacy.map;
  const steel = villaMaterial('#89958f', .36, .55); steel.name = 'bath-door-frame';
  const brass = villaMaterial('#b69e72', .36, .68); brass.name = 'bath-door-handles';
  const seal = villaMaterial('#5e6b65', .88); seal.name = 'bath-door-gaskets';
  const tracks = new IndexedFittingBuilder(root, 'bath-door-overhead-tracks');
  for (const which of IDS) {
    const o = VILLA_BATH_OPENINGS[which], pair = LEAVES.filter(leaf => leaf.which === which);
    const north = pair[0]!.parkedZ - pair[0]!.width / 2 - D.railOverhang;
    const south = pair[1]!.closedZ + pair[1]!.width / 2 + D.railOverhang;
    for (const { x } of pair) {
      const mid = (north + south) / 2, length = south - north;
      tracks.box(x, D.floorY + D.railY + .013, mid, .058, .010, length, steel, 0);
      for (const side of [-1, 1]) {
        tracks.box(x + side * .026, D.floorY + 3.042, mid, .006, .072, length, steel, 0);
        tracks.box(x + side * .020, D.floorY + 3.006, mid, .016, .006, length, steel, 0);
      }
    }
    // Wall-mounted standoffs terminate on the actual bath-side plaster/casing;
    // all sit above head clearance and therefore need no extra gameplay boxes.
    const mounts = Math.ceil((south - north) / 1.0);
    for (let i = 0; i <= mounts; i++) {
      const z = north + (south - north) * i / mounts;
      tracks.box(o.x + o.swing * .120, D.floorY + 3.12, z, .034, .18, .09, steel, 0);
      tracks.box(o.x + o.swing * .266, D.floorY + 3.14, z, .27, .045, .065, steel, 0);
    }
    // Slim paired-channel cover: visible horizontal hardware, not a wall-sized
    // pelmet. Both channels extend across the full parking + doorway strip.
    tracks.box(o.x + o.swing * .2975, D.floorY + 3.155, (north + south) / 2, .26, .055, south - north, steel, 0);
    const marker = new THREE.Object3D(); marker.name = `bath-door-track-${which}`;
    marker.userData = { minZ: north, maxZ: south, trackOffsets: [D.nearTrackDepth, D.farTrackDepth], direction: 'north', wallMounted: true }; tracks.root.add(marker);
  }
  tracks.finish();
  const colliders: VillaCollider[] = [];
  const leaves = LEAVES.map(layout => {
    const { which, end, width, handleZ } = layout;
    const pivot = new THREE.Group(); pivot.name = `bath-door-${which}-${end ? 'far' : 'near'}`;
    pivot.position.set(layout.x, D.floorY, layout.closedZ); root.add(pivot);
    const leaf = new IndexedFittingBuilder(pivot, `bath-door-leaf-${which}-${end}`);
    const centre = 0, top = D.bottom + D.height, stile = .064;
    // Full-height panels retain their 30mm undercut/30mm head reveal. Only the
    // slim roller hangers rise above the panel, outside the casing's depth.
    for (const z of [-width / 2 + stile / 2, width / 2 - stile / 2]) {
      leaf.box(0, D.bottom + D.height / 2, z, D.thickness, D.height, stile, steel, .004);
    }
    leaf.box(0, D.bottom + .06, centre, D.thickness, .12, width - 2 * stile, steel, .004);
    leaf.box(0, top - .0425, centre, D.thickness, .085, width - 2 * stile, steel, .004);
    // Inset glazing/frit sections share edges but never coplanar exposed faces.
    for (const [bottom, height, material] of [
      [.15, .26, frosted], [.41, 1.65, privacy], [2.06, .22, frosted],
      [2.28, .055, privacy], [2.335, .51, frosted],
    ] as const) {
      const y = bottom + height / 2;
      const inner = width - 2*stile;
      if (material === privacy && height > 1) {
        // Flat milled mounting strip, milky frit all around the cut. Adjacent
        // facets meet that strip without passing through the finger cups.
        const half=.106, cx=-handleZ;
        leaf.geometry(piercedPanel(2*half,height,.022,[[0,1.11-y,.050,.151]]),material,[0,y,handleZ],[0,Math.PI/2,0]);
        for(const [l,r] of [[-inner/2,cx-half],[cx+half,inner/2]])
          leaf.geometry(reededGlass(r-l,height,.022,.053,.004,true),material,[0,y,-(r+l)/2],[0,Math.PI/2,0]);
      } else if(height>.1) leaf.geometry(reededGlass(inner,height,.022,.053,.004,true),material,[0,y,0],[0,Math.PI/2,0]);
      else leaf.box(0,y,centre,.022,height,inner,material,0);
    }
    for (const z of [-width / 2 + stile + .0025, width / 2 - stile - .0025])
      leaf.box(0, 1.4975, z, .029, 2.695, .006, seal, .001);
    for (const y of [.41, 2.06, 2.28, 2.335]) leaf.box(0, y, centre, .028, .008, width - 2 * stile, seal, 0);
    for (const z of layout.rollers) {
      leaf.box(0, 2.953, z, .034, .126, .036, steel, .002);
      leaf.geometry(vessel([[.006, -.021], [.011, -.021], [.011, -.013], [.017, -.011], [.027, -.008],
        [.035, -.005], [.035, .005], [.027, .008], [.017, .011], [.011, .013], [.011, .021], [.006, .021]], 16),
        steel, [0, 3.02, z], [0, 0, Math.PI / 2]);
      leaf.cylinder(0, 3.02, z, .007, .007, .043, brass, [0, 0, Math.PI / 2], 10);
    }
    // Recessed finger cups on BOTH faces. A dark backing lies below an open
    // brass bezel; no protruding bar can clip the other leaf when stacking.
    for (const side of [-1, 1]) {
      const position: [number, number, number] = [0, 1.11, handleZ], rot: [number, number, number] = [0, 0, -side * Math.PI / 2];
      leaf.geometry(vessel([[.154, .010, .052], [.165, .0112, .058], [.168, .014, .060], [.168, .028, .060],
        [.164, .031, .058], [.144, .031, .049], [.138, .028, .045], [.132, .018, .042], [.121, .009, .035]], 28), brass, position, rot);
      leaf.geometry(vessel([[.126, .012, .038], [.119, .008, .034], [.105, .005, .027], [.083, .0034, .020], [0, .003]], 28), seal, position, rot);
    }
    leaf.finish();
    const collider: VillaCollider = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    colliders.push(collider);
    pivot.userData = { animated: true, which, motion: 'linear-north', closedZ: layout.closedZ, parkedZ: layout.parkedZ, travel: layout.travel,
      trackX: layout.x, panelWidth: width, panelBottom: D.bottom, panelTop: top, collider, openFraction: 0, handles: 2, recessedPulls: true };
    const bounds = new THREE.Box3();
    for (const shape of layout.shapes) bounds.union(new THREE.Box3(new THREE.Vector3(shape.minX, shape.minY, shape.minZ), new THREE.Vector3(shape.maxX, shape.maxY, shape.maxZ)));
    const inverse = new THREE.Matrix4(), query = new THREE.Vector3();
    setVillaColliderNarrowPhase(collider, (p, height) => {
      query.set(p.x, p.y, p.z).applyMatrix4(inverse);
      return layout.shapes.some(shape => overlapsLocal(query.x, query.y, query.z, height, PLAYER_RADIUS, shape));
    });
    return { layout, pivot, collider, bounds, inverse };
  });
  const world = new THREE.Box3();
  const update = (state?: VillaBathDoorState): boolean => {
    let changed = false;
    for (const leaf of leaves) {
      const progress = progressOf(state?.[progressKey(leaf.layout.which)]), z = leafZ(leaf.layout, progress);
      if (leaf.pivot.position.z !== z || leaf.pivot.rotation.y !== 0) changed = true;
      leaf.pivot.position.z = z; leaf.pivot.rotation.y = 0; leaf.pivot.userData.openFraction = progress;
    }
    root.updateWorldMatrix(true, true);
    // Do not short-circuit after one changed pair: refresh every inverse and all
    // four AABBs in place, including on parent-transform changes and resets.
    for (const leaf of leaves) {
      leaf.inverse.copy(leaf.pivot.matrixWorld).invert(); world.copy(leaf.bounds).applyMatrix4(leaf.pivot.matrixWorld);
      const next = { minX: world.min.x, maxX: world.max.x, minY: world.min.y, maxY: world.max.y, minZ: world.min.z, maxZ: world.max.z };
      if ((Object.keys(next) as (keyof VillaCollider)[]).some(key => leaf.collider[key] !== next[key])) changed = true;
      Object.assign(leaf.collider, next);
    }
    return changed;
  };
  update();
  return { root, colliders, doorColliders: colliders, update };
}
