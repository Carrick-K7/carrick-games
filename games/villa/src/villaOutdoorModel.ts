import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { registerVillaSeatCollider } from './villaSeating.js';
import { registerVillaCampingCollider, VILLA_SWING, villaSwingSeat, villaCampingCarryPose, type VillaOutdoorState } from './villaOutdoor.js';
import { villaTerrainOrientation } from './villaEstateLayout.js';
import { canvasWeave, fabricPanel, sawnGrain, timberMember } from './villaOutdoorJoinery.js';
import { millSection, turnSection, type Section } from './villaArchitecturalStock.js';
import { NatureMesh, collar, type P3 } from './villaNatureGeometry.js';
import type { VillaCollider, VillaPosition } from './villaWorld.js';

export function createVillaOutdoorModel(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(state: VillaOutdoorState, visitor: VillaPosition, yaw: number): boolean;
} {
  const root = new THREE.Group(); root.name = 'villa-outdoor-living'; parent.add(root);
  const wood = villaMaterial('#a28a70', .90), dark = villaMaterial('#373d36', .75, .27);
  const rope = villaMaterial('#b8a585', .96), sage = villaMaterial('#81916e', .96), light = villaMaterial('#cbd0b7', .9);
  const brass = villaMaterial('#a38a63', .46, .48), canvasEdge = villaMaterial('#556854', .95);
  sawnGrain(wood); sage.map=canvasWeave(); sage.vertexColors=true;
  const frame = new VillaModelBuilder(root, 'villa-swing-frame'), s = VILLA_SWING;
  frame.at(s.x, s.y, s.z, 0, () => {
    for (const side of [-1, 1]) {
      for (const z of [-.78, .78]) {
        timberMember(frame, [side * 1.52, .018, z], [side * 1.25, 2.42, 0], .136, .12, wood, .013);
        const t = .066;
        timberMember(frame, [side * 1.52, .018, z], [side * (1.52 - .27 * t), .018 + 2.40 * t, z * (1 - t)], .145, .131, dark, .008);
      }
      // The leaning legs and waist-high crossbrace form one blocked side frame.
      // Foot-only boxes would let a standing visitor pass through its centre.
      frame.collide(side * 1.39, 0, 0, .42, 2.47, 1.70);
      timberMember(frame, [side * 1.424, .85, -.51], [side * 1.424, .85, .51], .109, .092, wood, .009);
      for (const z of [-.496, .496]) frame.cylinder(side * 1.43, .86, z, .023, .023, .147, brass, [0, 0, Math.PI / 2], 8);
      timberMember(frame, [side * 1.27, 2.13, .090], [side * 1.27, 2.13, -.090], .161, .103, dark);
      frame.cylinder(side * 1.25, 2.37, 0, .037, .037, .184, brass, [0, 0, Math.PI / 2], 8);
      const at=side*.57;
      // Folded saddle bears on the rectangular timber. The pin is below the
      // beam on the actual animation axis, not a torus buried inside the wood.
      const strap:Section=[[-.071,-.055],[-.071,.046],[-.058,.064],[.058,.064],[.071,.046],[.071,-.055],
        [.060,-.055],[.060,.041],[.050,.056],[-.050,.056],[-.060,.041],[-.060,-.055]];
      frame.geometry(millSection('x',.065,strap),dark,[at,2.432,0]);
      const cheek:Section=[[-.070,.038],[.070,.038],[.070,.027],[.033,-.016],[.018,-.026],[-.014,-.026],[-.030,-.015],[-.070,.025]];
      for(const sign of [-1,1])frame.geometry(millSection('x',.009,cheek),dark,[at+sign*.029,s.pivotHeight,0]);
      for(const sign of [-1,1])frame.cylinder(at+sign*.0275,s.pivotHeight,0,.013,.013,.023,brass,[0,0,Math.PI/2],10);
    }
    timberMember(frame, [-1.46, 2.432, 0], [1.46, 2.432, 0], .119, .113, wood, .012);
  });
  frame.finish();
  const pivot = new THREE.Group(); pivot.name = 'villa-swing-pivot'; pivot.position.set(s.x, s.y + s.pivotHeight, s.z); root.add(pivot);
  const seat = new VillaModelBuilder(pivot, 'villa-swing-seat');
  const level = -s.chainLength;
  for (const x of [-.57, .57]) {
    // The swaged socket rotates on the original pivot. Its two trunnion
    // pins leave the central bore clear: the load line reaches its blind end
    // at the bearing centre, not the bottom of a decorative hoop.
    const socket:Section=[[0,0],[.0106,0],[.0106,-.036],[.012,-.042],[.016,-.042],[.018,-.036],
      [.019,-.019],[.023,-.012],[.023,.008],[.017,.016],[.009,.020],[0,.020]];
    seat.geometry(turnSection(socket,14),brass,[x,0,0]);
    seat.beam([x,0,0],[x,level+.04,0],.010,rope,8);
    // Lays of twisted hemp wrap the load line (neither end follows a
    // decorative sag); the short branch hitches physically gather the seat.
    const lay = new NatureMesh();
    for (let strand = 0; strand < 3; strand++) {
      const path = Array.from({ length: 38 }, (_, i) => {
        const t = i / 37, a = strand * Math.PI * 2 / 3 + t * Math.PI * 15;
        return collar([x + .006 * Math.cos(a), -.025+(level+.065)*t, .006 * Math.sin(a)], .007);
      });
      lay.stem(path, 4);
    }
    seat.geometry(lay.geometry(), rope);
    for (const z of [-.215, .215]) {
      seat.beam([x, level + .33, 0], [x, level + .057, z], .012, rope, 6);
      seat.cylinder(x, level + .075, z, .026, .026, .014, brass, [0, 0, 0], 9);
    }
    for (const h of [.31, .33, .35]) seat.geometry(new THREE.TorusGeometry(.016, .005, 5, 9), rope, [x, level + h, 0], [Math.PI / 2, 0, 0]);
    seat.box(x, level + .01, 0, .07, .085, .62, wood, .01);
  }
  for (let i = 0; i < 5; i++) {
    const z = -.235 + i * .118;
    timberMember(seat, [-.72, level + .055, z], [.72, level + .055, z], .107, .057, wood, .009);
  }
  for (const x of [-.66, .66]) seat.beam([x, level, .25], [x, level + .49, .35], .027, wood, 8);
  for (const h of [.22, .37]) {
    const z = .25 + h * .2;
    timberMember(seat, [-.69, level + h, z], [.69, level + h, z], .055, .115, wood, .012);
    for (const x of [-.659, .659]) seat.cylinder(x, level + h, z, .015, .015, .061, brass, [Math.PI / 2, 0, 0], 7);
  }
  const cushion = (u: number, v: number): P3 => {
    const x = 2 * u - 1, z = 2 * v - 1, corner = Math.abs(x * z) ** 5;
    // A sewn box pad: lofty shoulders over a gently settled centre, with
    // short compression pleats breaking towards (not across) the edge seam.
    const belly=(1-x*x)*(1-z*z), folds=.009*Math.cos(14*x+2*z)*Math.abs(z)**3*belly;
    return [x*(.647-.025*corner), level+.122+.046*belly-.010*Math.exp(-8*x*x-6*z*z)+folds, z*(.251-.025*corner)-.009];
  };
  seat.geometry(fabricPanel(cushion, [0, -.044, 0]), sage);
  for (const end of [0, 1]) for (const long of [false, true]) {
    const welt = new NatureMesh(); welt.stem(Array.from({ length: 11 }, (_, i) => { const p = long ? cushion(i / 10, end) : cushion(end, i / 10); p[1] -= .009; return collar(p, .005); }), 5);
    seat.geometry(welt.geometry(), light);
  }
  seat.finish().traverse(node => { if (node instanceof THREE.Mesh) node.castShadow = false; });
  const swingCollider: VillaCollider = { minX: s.x - .73, maxX: s.x + .73, minZ: s.z - .32, maxZ: s.z + .39, minY: .47, maxY: 1.02 };
  registerVillaSeatCollider(swingCollider, 'swing');

  const camping = new THREE.Group(); camping.name = 'villa-portable-camping-chair'; root.add(camping);
  const chair = new VillaModelBuilder(camping, 'camping-chair-frame');
  for (const side of [-1, 1]) {
    const x = side * .375;
    chair.beam([side * .43, .016, -.36], [x, .51, .28], .014, dark, 8);
    chair.beam([side * .43, .016, .38], [x, .51, -.28], .014, dark, 8);
    chair.beam([x, .49, .25], [x, 1.015, .335], .016, dark, 8);
    chair.beam([x, .5, -.25], [x, .68, -.18], .013, dark, 8);
    chair.beam([x, .68, -.25], [x, .69, .3], .016, dark, 8);
    timberMember(chair,[x,.694,-.264],[x,.704,.294],.065,.025,wood,.007);
    for (const z of [-.36, .38]) chair.box(side * .43, .019, z, .065, .033, .063, dark, .012);
    chair.cylinder(side * .394, .285, 0, .03, .03, .038, dark, [0, 0, Math.PI / 2], 8);
  }
  const sling = (u: number, v: number): P3 => {
    const x=2*u-1,z=2*v-1, tucked=Math.abs(x)-.79+.065*z;
    const fold=.012*Math.exp(-tucked*tucked/.009)*Math.cos(3.7*z+1.3*x);
    return [x*(.375-.016*(1-z*z)), .509-.072*(1-x*x)*(1-z*z)+fold*(1-z*z), -.284+v*.562];
  };
  const back = (u: number, v: number): P3 => {
    const x=2*u-1, load=1-x*x, sag=load*(.025+.037*Math.sin(v*Math.PI));
    const seam=Math.abs(x)-(.29+.54*v), cornerPull=.019*Math.exp(-seam*seam/.018)*Math.sin(v*Math.PI);
    return [x*(.375-.017*Math.sin(v*Math.PI)),.512+v*.495-load*.041*v,
      .255+v*.08+sag-cornerPull+.008*Math.sin(8*x+2.1*v)*load];
  };
  chair.geometry(fabricPanel(sling, [0, -.010, 0]), sage);
  chair.geometry(fabricPanel(back, [0, 0, .011]), sage);
  for (const side of [-1, 1]) {
    const hingeX = side * .404;
    for (const [y, z] of [[.28, 0], [.50, -.264], [.507, .267]]) {
      chair.cylinder(hingeX, y, z, .027, .027, .060, dark, [0, 0, Math.PI / 2], 12);
      chair.cylinder(hingeX + side * .031, y, z, .017, .017, .008, brass, [0, 0, Math.PI / 2], 6);
    }
    // Bias-bound edges run down the tension lines, not as straight stripes in
    // front of the loaded panel. Four corner sleeves wrap the support tubes.
    for (const surface of [sling, back]) {
      const seam = new NatureMesh(), u = side === 1 ? .979 : .021;
      seam.stem(Array.from({ length: 10 }, (_, i) => collar(surface(u, i / 9), .006)), 5);
      chair.geometry(seam.geometry(), light);
    }
    for (const h of [.58, .923]) {
      const z = .25 + (h - .49) * .16;
      chair.beam([side * .375, h, z], [side * .375, h + .063, z + .010], .020, canvasEdge, 8);
    }
  }
  // Reinforced webbing carry loop on the back, secured through the same panel.
  const p0 = back(.29, .77), p1 = back(.71, .77), web = new NatureMesh();
  p0[2]+=.017;p1[2]+=.017; // Fasten on the rear layer; do not poke two dark studs through the sitter's face.
  web.stem([collar(p0, .009), collar([-.125, p0[1] - .075, p0[2] + .045], .011),
    collar([.122, p1[1] - .075, p1[2] + .045], .011), collar(p1, .009)], 6); chair.geometry(web.geometry(), canvasEdge);
  for (const z of [-.279, .274]) {
    // The stretchers enter both upper X joints. The hem laps the tube over
    // its full span; the flexible part of the sling dips between these edges.
    chair.beam([-.375, .492, z], [.375, .492, z], .014, dark, 10);
    for (const side of [-1, 1]) {
      chair.beam([side * .375, .492, z], [side * .375, .509, z < 0 ? -.28 : .28], .020, dark, 8);
      chair.beam([side * .36, .493, z], [side * .29, .493, z], .016, canvasEdge, 8);
    }
  }
  chair.finish();
  camping.userData = { movable: true, seatId: 'camping-chair', material: 'sage-canvas', foldableFrame: true };
  const campingCollider: VillaCollider = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 1.04 };
  registerVillaCampingCollider(campingCollider); registerVillaSeatCollider(campingCollider, 'camping-chair');
  let signature = '';
  const update = (state: VillaOutdoorState, visitor: VillaPosition, yaw: number) => {
    pivot.rotation.x = state.swingAngle;
    const swing = villaSwingSeat(state);
    Object.assign(swingCollider, { minZ: swing.seat.z - .34, maxZ: swing.seat.z + .4, minY: swing.seat.y + .47, maxY: swing.seat.y + 1.07 });
    const p = state.camping.carried ? villaCampingCarryPose(visitor, yaw) : state.camping;
    const terrain = p.y < 3 && p.z > 35 ? villaTerrainOrientation(p.x, p.z, p.yaw) : { pitch: 0, roll: 0 };
    camping.position.set(p.x, p.y, p.z); camping.rotation.order = 'YXZ'; camping.rotation.set(terrain.pitch, p.yaw, terrain.roll, 'YXZ');
    const width = Math.abs(Math.cos(p.yaw)) * .47 + Math.abs(Math.sin(p.yaw)) * .43;
    const depth = Math.abs(Math.sin(p.yaw)) * .47 + Math.abs(Math.cos(p.yaw)) * .43;
    Object.assign(campingCollider, { minX: p.x - width, maxX: p.x + width, minZ: p.z - depth, maxZ: p.z + depth,
      minY: state.camping.carried ? 1e6 : p.y, maxY: state.camping.carried ? 1e6 + 1 : p.y + 1.05 });
    camping.userData.carried = state.camping.carried;
    const next = `${p.x}/${p.y}/${p.z}/${p.yaw}/${state.camping.carried}`;
    const dirty = next !== signature; signature = next; return dirty;
  };
  return { colliders: [...frame.colliders, swingCollider, campingCollider], update };
}
