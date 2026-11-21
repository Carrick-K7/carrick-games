import * as THREE from 'three';
import { villaMaterial } from './villaModel.js';
import { IndexedFittingBuilder, cabinetPull, foldedLinen, formedTube, panel, surround, vessel } from './villaFittingGeometry.js';
import { TEA_SPOUT_TIP, teaCupShell, teaFreeSurface, teaPotBody, teaPotHandle, teaPotLid, teaPourStream } from './villaTeaWare.js';
import type { VillaCollider } from './villaWorld.js';
import { VILLA_TEA_BAR } from './villaLivingLayout.js';
import { createVillaTea, villaTeaCupPose, type VillaTeaState } from './villaTea.js';
export { VILLA_TEA_BAR } from './villaLivingLayout.js';
export interface VillaTeaBar {
  colliders: VillaCollider[];
  /** State is advanced by the controller; boolean remains a legacy steam-only bridge. */
  update(time: number, state: VillaTeaState | boolean): void;
}

/** Static material batches + one subtle steam instance batch; all scene-owned. */
export function createVillaTeaBar(parent: THREE.Object3D): VillaTeaBar {
  const b = new IndexedFittingBuilder(parent, 'villa-tea-bar');
  const oak = villaMaterial(0xba9166, 0.76), walnut = villaMaterial(0x735037, 0.79);
  const stone = villaMaterial(0xe3e0d5, 0.64), ceramic = villaMaterial(0xd2dfce, 0.32);
  const clay = villaMaterial(0x9e6546, 0.82), bronze = villaMaterial(0xbca16c, 0.36, 0.55);
  const dark = villaMaterial(0x393b35, 0.58), tea = villaMaterial(0x795325, 0.31);
  const named = (name: string, x: number, y: number, z: number, details: Record<string, unknown> = {}) => {
    const marker = new THREE.Object3D(); marker.name = `tea-bar/${name}`;
    marker.position.set(VILLA_TEA_BAR.x - x, y, VILLA_TEA_BAR.z - z);
    marker.userData = { component: name, ...details }; b.root.add(marker);
  };
  b.at(VILLA_TEA_BAR.x, 0, VILLA_TEA_BAR.z, VILLA_TEA_BAR.yaw, () => {
    // Slightly recessed plinth and fronts keep pulls inside the stone footprint.
    b.box(0, 0.06, 0, 1.98, 0.12, 0.62, walnut);
    b.box(0, .151, 0, 2.12, .062, .70, walnut, .006);
    for (const x of [-1.033, -.345, .345, 1.033]) b.box(x, .498, .008, .054, .774, .684, oak, .005);
    b.box(0, .500, .333, 2.08, .756, .034, oak, .005);
    b.box(0, .592, .001, 2.08, .026, .682, walnut, .004);
    b.box(0, 0.915, 0, 2.2, 0.07, 0.8, stone, 0.022);
    b.box(0, 0.87, 0, 2.15, 0.018, 0.73, walnut, 0.004);
    // Three real drawer fronts and lower doors on the visitor-facing side.
    for (const x of [-0.69, 0, 0.69]) {
      b.geometry(panel(.661, .225, .012, .031, .004), oak, [x, .715, -.334]);
      b.geometry(surround(.661, .435, .015, [[0, -.014], [0, .012], [.004, .016], [.031, .016],
        [.044, .006], [.044, -.003], [.037, -.014], [0, -.014]], 3), oak, [x, .363, -.334], [0, Math.PI, 0]);
      b.geometry(panel(.584, .357, .007, .016, .002), oak, [x, .363, -.334]);
      for (const [y, front] of [[.745, -.3495], [.520, -.342]]) {
        for (const dx of [-.09, .09]) b.cylinder(x + dx, y, front - .0015, .014, .014, .004, bronze, [Math.PI / 2, 0, 0], 12);
        b.geometry(cabinetPull(.18, .037, .008), bronze, [x, y, front - .002], [0, Math.PI, 0]);
      }
    }
    // Subtle oak end grain/slats, not applied textures or extra draw calls.
    for (const side of [-1, 1]) for (let i = 0; i < 7; i++) b.box(side * 1.064, 0.48, -0.26 + i * 0.087, 0.007, 0.68, 0.012, walnut, 0.002);
    named('cabinet', 0, 0.48, 0, { drawers: 3, doors: 3 });
    named('stone-counter', 0, 0.95, 0, { width: 2.2, depth: 0.8 });

    // Draining tea tray: dark recess beneath spaced bamboo/oak slats and rim.
    b.box(0.13, 0.965, -0.095, 1.14, 0.026, 0.47, walnut, 0.01);
    for (let i = 0; i < 13; i++) b.box(-0.37 + i * 0.083, 0.983, -0.095, 0.067, 0.018, 0.4, oak, 0.004);
    for (const z of [-0.327, 0.137]) b.box(0.13, 0.987, z, 1.14, 0.032, 0.018, walnut, 0.004);
    for (const x of [-0.433, 0.693]) b.box(x, 0.987, -0.095, 0.018, 0.032, 0.47, walnut, 0.004);
    named('tea-tray', 0.13, 0.99, -0.095, { slats: 13 });

    // The metal kettle is thrown taller, with a rolled dock and a long, open pouring neck.
    b.geometry(vessel([[0, 0], [.148, 0], [.159, .005], [.160, .024], [.157, .030], [.137, .034], [0, .034]]), dark, [-.74, .95, .03]);
    b.geometry(teaPotBody([[.135, .084, 0, .03], [.149, .088, 0, .023], [.166, .101, 0, .018],
      [.186, .127, 0, .014], [.208, .170, 0, .012], [.231, .205, 0, .012], [.256, .227, 0, .011],
      [.284, .238, 0, .010], [.320, .242, 0, .010], [.347, .239, 0, .010], [.370, .230, 0, .0105],
      [.394, .210, 0, .0115], [.404, .200, 0, .0125]]).scale(1.08, 1.55, 1.16), bronze, [-.74, .984, .03]);
    b.geometry(teaPotLid().scale(1.08, 1.55, 1.16), bronze, [-.74, .984, .03]);
    b.geometry(teaPotHandle().scale(1.19, 1.55, 1.16), walnut, [-.74, .984, .03]);
    b.geometry(vessel([[.0857, 0, .0763], [.0880, .0004, .0785], [.0883, .0016, .0788],
      [.0862, .0022, .0769]], 32), dark, [-.74, 1.248, .03]);
    named('gooseneck-kettle', -0.74, 1.12, 0.03, { curvedSpout: true, handle: true });

    for (const [i, x] of [0.25, 0.5].entries()) {
      // The saucer's well (including its annular foot) bears the cup at y=1.013.
      b.geometry(vessel([[0, .013], [.030, .013], [.032, 0], [.037, 0], [.038, .010], [.053, .016],
        [.069, .022], [.071, .025], [.069, .027], [.064, .026], [.050, .022], [.033, .021], [0, .021]]), ceramic, [x, .992, -.205]);
      if (i) b.geometry(teaCupShell(), ceramic, [x, 1.013, -0.205]);
      named(`cup-${i + 1}`, x, 1.069, -0.205, { openRim: true, teaSurface: i === 0, initiallyEmpty: true });
    }
    // Tea tins sit behind/right of the tray, never in the approach aisle.
    for (const [i, x] of [0.46, 0.77].entries()) {
      const h = i ? 0.245 : 0.195;
      b.geometry(vessel([[0, 0], [.072, 0], [.084, .005], [.087, .014], [.087, h - .025], [.084, h - .012],
        [.077, h - .008], [.076, h + .006], [.072, h + .006], [.072, h - .012], [.081, h - .024], [.081, .015], [0, .008]]), i ? ceramic : bronze, [x, .95, .235]);
      b.geometry(vessel([[0, -.002], [.071, -.002], [.072, -.011], [.074, -.011], [.075, .001], [.090, .001], [.093, .003],
        [.093, .010], [.088, .016], [.040, .019], [0, .019]]), walnut, [x, .95 + h, .235]);
      b.geometry(vessel([[.012, 0], [.016, .002], [.012, .006], [.020, .012], [.019, .017], [.012, .021], [0, .022]], 16), bronze, [x, .969 + h, .235]);
      b.box(x, 1.02, 0.146, 0.063, 0.048, 0.006, bronze, 0.005);
      named(`tea-canister-${i + 1}`, x, 1.06, 0.235, { fittedLid: true });
    }
    // Folded linen towel and bamboo tea scoop at the right end.
    b.geometry(foldedLinen(.25, .25, .035), stone, [.89, .95, -.145]);
    b.at(.93, .981, -.074, .36, () => {
      b.geometry(formedTube([[0, .008, -.159, .005, .009], [0, .010, -.151, .006, .010], [0, .012, -.072, .004, .007],
        [0, .013, -.037, .0035, .005], [0, .011, -.020, .0035, .008]], 10, 0, [1, 0, 0]), oak);
      b.geometry(vessel([[0, 0], [.009, .0008, .016], [.017, .003, .027], [.023, .009, .038], [.023, .011, .038],
        [.021, .0115, .036], [.015, .006, .025], [.007, .0035, .012], [0, .003]], 22), oak);
    });
    // Bamboo tea tongs: sprung folded end, separated arms and inward-facing tips.
    b.at(.816, .987, -.145, -.16, () => b.geometry(formedTube([[-.014, .002, .090, .002, .004], [-.020, .003, .083, .003, .0045],
      [-.017, .002, .060, .0025, .005], [-.010, .002, -.068, .0025, .005], [-.007, .002, -.084, .003, .005],
      [0, .002, -.088, .003, .005], [.007, .002, -.084, .003, .005], [.010, .002, -.068, .0025, .005],
      [.017, .002, .060, .0025, .005], [.020, .003, .083, .003, .0045], [.014, .002, .090, .002, .004]], 8, 0, [0, 1, 0]), oak));
    named('tea-tools', 0.89, 0.99, -0.145, { scoop: true, foldedTowel: true });
    b.collide(0, 0, 0, VILLA_TEA_BAR.width, VILLA_TEA_BAR.height, VILLA_TEA_BAR.depth);
  });
  const root = b.finish();
  root.userData = { activity: 'tea-brewing', duration: VILLA_TEA_BAR.duration, approach: { ...VILLA_TEA_BAR.approach }, anchor: { ...VILLA_TEA_BAR.anchor }, stool: false };

  const pot = new IndexedFittingBuilder(root, 'tea-bar/teapot');
  pot.geometry(teaPotBody(), clay); pot.geometry(teaPotLid(), clay); pot.geometry(teaPotHandle(), clay);
  pot.finish(); pot.root.userData = { lid: true, spout: true, handle: true };
  const azimuth = Math.atan2(.205 - .018, .25 + .065), ux = -Math.cos(azimuth), uz = Math.sin(azimuth);
  const tip = new THREE.Vector3();
  const cup = new THREE.Group(); cup.name = 'tea-bar/drinking-cup'; root.add(cup);
  const shell = new THREE.Mesh(teaCupShell(), ceramic); shell.castShadow = shell.receiveShadow = true; cup.add(shell);
  const surface = teaFreeSurface(tea); cup.add(surface.mesh);
  const stream = teaPourStream(tea); root.add(stream.mesh);
  const empty = createVillaTea();

  const steamMaterial = new THREE.MeshBasicMaterial({ color: 0xe9eee7, transparent: true, opacity: 0.14, depthWrite: false });
  const steam = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), steamMaterial, 12);
  steam.name = 'tea-bar/steam'; steam.userData = { effect: 'steam', sources: ['teapot', 'cup-1'] };
  steam.castShadow = false; steam.receiveShadow = false; steam.frustumCulled = false;
  steam.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(steam);
  const dummy = new THREE.Object3D();
  const vent = new THREE.Vector3(), cupSteam = new THREE.Vector3();
  const update = (time: number, state: VillaTeaState | boolean): void => {
    const current = typeof state === 'boolean' ? empty : state;
    const brewing = typeof state === 'boolean' ? state : state.phase === 'brewing';
    const pose = villaTeaCupPose(current);
    cup.position.set(VILLA_TEA_BAR.x - 0.25, 1.013 + pose.lift, VILLA_TEA_BAR.z + 0.205 + pose.forward);
    cup.rotation.x = pose.tilt;
    surface.update(pose.fill, pose.tilt);
    // Lift off the slats, incline the pot, and bring the functional mouth over its cup.
    // Everything remains a single clay batch; pitch the vessel, never the saucer or tray.
    const p = brewing ? THREE.MathUtils.smoothstep(Math.min(pose.fill, 1 - pose.fill), 0, .08) : 0;
    const pitch = p * .50;
    pot.root.position.set(VILLA_TEA_BAR.x + .065 + ux * p * .043, .992 + p * .114, VILLA_TEA_BAR.z + .018 + uz * p * .043);
    pot.root.rotation.set(0, Math.PI + azimuth, -pitch, 'YXZ');
    tip.set(TEA_SPOUT_TIP.x, TEA_SPOUT_TIP.y, 0).applyQuaternion(pot.root.quaternion).add(pot.root.position);
    stream.mesh.visible = p > .12;
    if (stream.mesh.visible) stream.update(tip, cup.position.x, 1.013 + surface.uprightLevel(), cup.position.z, pitch);
    else stream.mesh.position.copy(tip);
    cup.userData.phase = current.phase; cup.userData.fill = pose.fill;
    steam.visible = brewing;
    if (!brewing) return;
    const t = Number.isFinite(time) ? ((time % 6.6) + 6.6) % 6.6 : 0;
    vent.set(0, .214, 0).applyQuaternion(pot.root.quaternion).add(pot.root.position);
    cupSteam.set(cup.position.x, 1.076, cup.position.z);
    for (let i = 0; i < steam.count; i++) {
      const source = i % 3 && pose.fill > .001 ? cupSteam : vent, phase = (t / 2.2 + i / steam.count) % 1;
      const envelope = Math.sin(phase * Math.PI), scale = 0.012 + envelope * 0.026;
      dummy.position.set(source.x + Math.sin(phase * 5 + i) * 0.027 * envelope,
        source.y + phase * 0.32, source.z + Math.cos(phase * 4 + i) * 0.018 * envelope);
      dummy.scale.set(scale * envelope, scale * 1.8 * envelope, scale * envelope); dummy.updateMatrix();
      steam.setMatrixAt(i, dummy.matrix);
    }
    steam.instanceMatrix.needsUpdate = true;
  };
  update(0, false);
  return { colliders: b.colliders, update };
}
