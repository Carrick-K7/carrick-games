import * as THREE from 'three';
import { VillaModelBuilder } from './villaModel.js';
import { createVillaPets, villaPetKind, VILLA_PET_FOOD, VILLA_PET_IDS, VILLA_PET_RADIUS, type VillaPetId, type VillaPetsState } from './villaPets.js';
import type { VillaCollider } from './villaWorld.js';

type Triple = [number, number, number];
interface PetRig {
  root: THREE.Group; body: THREE.Group; head: THREE.Group; tail: THREE.Group;
  legs: THREE.Group[]; wings: THREE.Group[]; shadow: THREE.Mesh;
  foodPlate: THREE.Group; foodFeedCount: number; headRestY: number;
}
export interface VillaPetModel {
  update(time: number, state: VillaPetsState): void;
  /** Mutable plain boxes for vehicle stopping ONLY, never walking-player collision. */
  drivingColliders: VillaCollider[];
}
/** Scene owns every geometry/material. One vertex-colour batch per animated part. */
export function createVillaPetModel(parent: THREE.Object3D): VillaPetModel {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x25372b, transparent: true, opacity: 0.16, depthWrite: false });
  const rigs = new Map<VillaPetId, PetRig>();
  const drivingColliders: VillaCollider[] = [];
  const cream = 0xf6e5c8, brown = 0xba824f, dark = 0x382d2a, pink = 0xe0a2a0;

  function part(parentPart: THREE.Object3D, name: string, position: Triple, build: (b: VillaModelBuilder) => void): THREE.Group {
    const builder = new VillaModelBuilder(parentPart, name); build(builder);
    const root = builder.finish(); root.position.set(...position);
    root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false; } });
    return root;
  }
  function shape(b: VillaModelBuilder, g: THREE.BufferGeometry, color: number, p: Triple, rotation: Triple = [0, 0, 0]): void {
    const rgb = new THREE.Color(color), count = g.getAttribute('position').count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { colors[i * 3] = rgb.r; colors[i * 3 + 1] = rgb.g; colors[i * 3 + 2] = rgb.b; }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    b.geometry(g, material, p, rotation);
  }
  function oval(b: VillaModelBuilder, color: number, p: Triple, scale: Triple, rotation: Triple = [0, 0, 0]): void {
    const g = new THREE.SphereGeometry(1, 10, 7); g.scale(...scale); shape(b, g, color, p, rotation);
  }
  function cone(b: VillaModelBuilder, color: number, p: Triple, radius: number, height: number, rotation: Triple = [0, 0, 0]): void {
    shape(b, new THREE.ConeGeometry(radius, height, 8), color, p, rotation);
  }
  function catBody(b: VillaModelBuilder): void {
    // Latitude rings run across the back. Mark the fur itself: no raised stripe
    // geometry hovering above the narrow, curved sides of the ellipsoid.
    const g = new THREE.SphereGeometry(1, 16, 28);
    g.rotateX(Math.PI / 2); g.scale(0.105, 0.13, 0.195);
    const positions = g.getAttribute('position'), colors = new Float32Array(positions.count * 3);
    const fur = new THREE.Color(0xc4b7a6), stripe = new THREE.Color(0x756658);
    for (let i = 0; i < positions.count; i++) {
      const marked = positions.getY(i) > -0.025 && [-0.115, -0.025, 0.065].some(z => Math.abs(positions.getZ(i) - z) < 0.019);
      const color = marked ? stripe : fur;
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    b.geometry(g, material, [0, 0.235, -0.035]);
  }
  for (const id of VILLA_PET_IDS) {
    const kind = villaPetKind(id);
    const blue = id === 'parrot-blue', female = id === 'rabbit-female';
    const root = new THREE.Group(); root.name = `villa-pet-${id}`;
    root.userData = { petId: id, petKind: kind, peaceful: true, food: VILLA_PET_FOOD[kind], radius: VILLA_PET_RADIUS,
      sex: kind === 'rabbit' ? female ? 'female' : 'male' : null,
      appearance: kind === 'rabbit' ? female ? 'silver-cream coat, gently splayed ears' : 'warm cream coat, upright ears' : blue ? 'blue plumage' : 'natural coat/plumage' };
    parent.add(root);
    const rabbit = kind === 'rabbit', bird = kind === 'parrot', cat = kind === 'cat';
    const fur = rabbit ? female ? 0xd6d4cd : cream : cat ? 0xc4b7a6 : brown;
    const body = part(root, `${id}/body`, [0, 0, 0], b => {
      if (bird) {
        oval(b, blue ? 0x429bca : 0x48a763, [0, 0.23, 0], [0.095, 0.145, 0.105]);
        oval(b, 0xe6c955, [0, 0.26, 0.071], [0.075, 0.09, 0.047]);
      } else {
        if (cat) catBody(b);
        else oval(b, fur, [0, rabbit ? 0.19 : 0.235, -0.035], [0.14, rabbit ? 0.145 : 0.13, 0.195]);
        oval(b, cream, [0, 0.22, 0.105], [0.088, 0.11, 0.07]);
      }
    });
    const head = part(body, `${id}/head`, [0, bird ? 0.39 : rabbit ? 0.29 : 0.35, bird ? 0.04 : 0.175], b => {
      oval(b, bird ? blue ? 0x69b9dc : 0x51b66a : fur, [0, 0, 0], bird ? [0.087, 0.09, 0.08] : [0.12, 0.115, 0.108]);
      if (bird) {
        // Cream cheek patches, bright hooked beak, dark lower beak.
        for (const x of [-0.068, 0.068]) oval(b, cream, [x, 0.009, 0.037], [0.024, 0.037, 0.033]);
        cone(b, 0xe9aa42, [0, -0.012, 0.1], 0.042, 0.085, [Math.PI / 2 + 0.35, 0, 0]);
        oval(b, dark, [0, -0.041, 0.104], [0.018, 0.021, 0.025]);
      } else {
        oval(b, cream, [0, -0.041, 0.085], [cat || rabbit ? 0.064 : 0.086, 0.05, cat || rabbit ? 0.046 : 0.075]);
        oval(b, cat || rabbit ? pink : dark, [0, -0.015, cat || rabbit ? 0.129 : 0.151], [0.022, 0.016, 0.012]);
        for (const side of [-1, 1]) {
          if (rabbit) {
            const tilt: Triple = [0, 0, female ? -side * 0.17 : 0];
            oval(b, fur, [side * 0.061, 0.143, -0.018], [0.038, female ? 0.133 : 0.145, 0.03], tilt);
            oval(b, female ? 0xd4aaa6 : pink, [side * 0.061, 0.152, 0.008], [0.018, female ? 0.096 : 0.109, 0.009], tilt);
          } else if (cat) {
            cone(b, fur, [side * 0.079, 0.115, -0.008], 0.047, 0.125);
            cone(b, pink, [side * 0.079, 0.117, 0.022], 0.026, 0.08);
            // Whiskers use thin solid geometry, avoiding line-material draw calls.
            for (const y of [-0.04, -0.02]) oval(b, cream, [side * 0.086, y, 0.098], [0.048, 0.004, 0.005]);
          } else oval(b, 0x855335, [side * 0.117, -0.013, -0.025], [0.047, 0.115, 0.07]);
        }
      }
      for (const side of [-1, 1]) {
        oval(b, dark, [side * (bird ? 0.069 : 0.059), 0.016, bird ? 0.061 : 0.094], [0.013, 0.018, 0.009]);
        oval(b, 0xffffff, [side * (bird ? 0.069 : 0.059) - 0.003, 0.023, bird ? 0.069 : 0.101], [0.004, 0.005, 0.003]);
      }
    });
    // A parrot's shorter rump needs its own embedded tail root, not the
    // quadrupeds' rear anchor (which leaves the feathers floating behind it).
    const tail = part(body, `${id}/tail`, [0, bird ? .205 : rabbit ? .18 : .26, bird ? -.075 : -.205], b => {
      if (rabbit) oval(b, 0xfff5e7, [0, 0, -0.034], [0.061, 0.06, 0.061]);
      else if (bird) {
        oval(b, 0x3682a7, [0, -0.055, -0.064], [0.052, 0.033, 0.105]);
        oval(b, 0xe1bb4b, [0, -0.054, -0.102], [0.018, 0.027, 0.08]);
      } else if (cat) {
        oval(b, fur, [0, 0.075, -0.045], [0.027, 0.103, 0.041]);
        oval(b, 0x756658, [0, 0.153, -0.015], [0.028, 0.043, 0.038]);
      } else oval(b, brown, [0, 0.038, -0.058], [0.035, 0.048, 0.097]);
    });
    const legs: THREE.Group[] = [];
    if (bird) for (const side of [-1, 1]) {
      legs.push(part(body, `${id}/foot-${side < 0 ? 'left' : 'right'}`, [side * 0.042, 0.12, 0.02], b => {
        shape(b, new THREE.CylinderGeometry(0.01, 0.012, 0.09, 8), dark, [0, -0.045, 0]);
        // Two forward toes and a rear gripping toe, each connected to its shank.
        for (const toe of [-1, 1]) oval(b, dark, [toe * 0.009, -0.105, 0.022], [0.009, 0.015, 0.043]);
        oval(b, dark, [0, -0.103, -0.025], [0.009, 0.014, 0.029]);
      }));
    }
    if (!bird) for (let pair = 0; pair < 2; pair++) {
      legs.push(part(body, `${id}/legs-${pair}`, [0, 0.13, 0], b => {
        for (const side of [-1, 1]) {
          const z = (pair === 0 ? side : -side) * 0.12;
          oval(b, fur, [side * 0.089, -0.045, z], [rabbit ? 0.045 : 0.029, 0.07, rabbit ? 0.068 : 0.034]);
          oval(b, cream, [side * 0.089, -0.102, z + 0.02], [0.038, 0.027, rabbit ? 0.069 : 0.047]);
        }
      }));
    }
    const wings: THREE.Group[] = [];
    if (bird) for (const side of [-1, 1]) {
      wings.push(part(body, `${id}/wing-${side < 0 ? 'left' : 'right'}`, [side * 0.075, 0.28, 0], b => {
        oval(b, blue ? 0x3679ba : 0x318966, [side * 0.045, -0.06, -0.018], [0.055, 0.09, 0.044]);
        for (let feather = 0; feather < 3; feather++) {
          oval(b, blue ? 0x275596 : 0x337eac, [side * (0.058 + feather * 0.012), -0.12, -0.012 - feather * 0.024], [0.022, 0.065 - feather * 0.007, 0.019]);
        }
      }));
    }
    // One extra batch only while eating. Parent-space anchor keeps the dish on
    // the ground: it is never attached to a walking/hopping/turning animal.
    const foodPlate = part(parent, `${id}/food-plate`, [0, 0, 0], b => {
      const dishColor = rabbit ? 0xc9aa74 : cat ? 0xc88666 : bird ? cream : 0x91b8bd;
      shape(b, new THREE.CylinderGeometry(0.105, 0.097, 0.018, 16), dishColor, [0, 0.014, 0]);
      shape(b, new THREE.TorusGeometry(0.103, 0.013, 6, 16), dishColor, [0, 0.026, 0], [Math.PI / 2, 0, 0]);
      if (rabbit) {
        for (let i = 0; i < 6; i++) {
          shape(b, new THREE.BoxGeometry(0.006, 0.006, 0.115), 0xd6bb70,
            [(i - 2.5) * 0.017, 0.032 + i % 2 * 0.005, 0], [0, (i - 2.5) * 0.23, 0]);
        }
        for (let i = 0; i < 3; i++) oval(b, i % 2 ? 0x66a34c : 0x438346,
          [(i - 1) * 0.032, 0.045 + i * 0.003, 0.015], [0.026, 0.007, 0.057]);
      } else {
        const count = bird ? 14 : 9;
        for (let i = 0; i < count; i++) {
          const angle = i * 2.4, radius = 0.018 + (i % 3) * 0.021;
          oval(b, bird ? (i % 2 ? 0xe1c589 : 0x886643) : (i % 2 ? 0x8d5936 : 0xac7947),
            [Math.sin(angle) * radius, bird ? 0.033 : 0.04, Math.cos(angle) * radius],
            bird ? [0.007, 0.004, 0.013] : [0.016, 0.012, 0.014]);
        }
      }
    });
    foodPlate.visible = false;
    foodPlate.userData = { petId: id, petKind: kind, food: VILLA_PET_FOOD[kind], role: 'pet-food', contents: rabbit ? ['hay', 'greens'] : bird ? ['seeds'] : ['kibble'] };
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 20), shadowMaterial);
    shadow.name = `${id}/contact-shadow`; shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(bird ? 0.18 : 0.23, bird ? 0.23 : 0.31, 1);
    parent.add(shadow);
    rigs.set(id, { root, body, head, tail, legs, wings, shadow, foodPlate, foodFeedCount: -1, headRestY: head.position.y });
    drivingColliders.push({ minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 0 });
  }
  const update = (time: number, state: VillaPetsState): void => {
    const t = Number.isFinite(time) ? time : state.time;
    for (const pet of state.pets) {
      const rig = rigs.get(pet.id); if (!rig) continue;
      rig.root.position.set(pet.x, pet.y, pet.z); rig.root.rotation.y = pet.yaw;
      rig.root.userData.sheltered = pet.sheltered; rig.root.userData.shelterSite = pet.shelterSite;
      const moving = pet.speed > 0.01, happy = pet.mode === 'happy', eating = pet.mode === 'eating';
      if (eating && (!rig.foodPlate.visible || rig.foodFeedCount !== pet.feedCount)) {
        // Eating begins after approach has stopped. Snapshot once, not every RAF.
        const forward = pet.kind === 'parrot' ? 0.17 : 0.275;
        rig.foodPlate.position.set(pet.x + Math.sin(pet.yaw) * forward, 0, pet.z + Math.cos(pet.yaw) * forward);
        rig.foodPlate.rotation.y = pet.yaw; rig.foodFeedCount = pet.feedCount;
      }
      rig.foodPlate.visible = eating;
      const sitting = pet.kind === 'cat' && !moving && !eating;
      rig.body.position.y = sitting ? -0.025 : 0;
      rig.body.rotation.x = sitting ? -0.1 : 0;
      rig.head.position.y = rig.headRestY - (eating ? pet.kind === 'parrot' ? 0.2 : pet.kind === 'rabbit' ? 0.1 : 0.15 : 0);
      rig.head.rotation.x = eating ? 0.55 + Math.sin(t * 10) * 0.09 : happy ? Math.sin(t * 4) * 0.08 : 0;
      rig.head.rotation.z = happy ? Math.sin(t * 3) * 0.09 : 0;
      rig.tail.rotation.y = pet.kind === 'dog' ? Math.sin(t * (happy ? 14 : 7)) * (happy ? 0.6 : 0.3) : pet.kind === 'cat' ? Math.sin(t * 1.8) * 0.16 : 0;
      const bird = pet.kind === 'parrot', airborne = bird && pet.y > 0.025;
      if (bird) {
        rig.body.rotation.x = airborne ? 0.12 + pet.speed * 0.22 - pet.verticalSpeed * 0.25 : 0;
        rig.body.rotation.z = Math.max(-0.18, Math.min(0.18, pet.bank));
        rig.body.position.y = moving && !airborne ? Math.abs(Math.sin(pet.gait)) * 0.009 : 0;
        rig.head.rotation.x += moving && !airborne ? Math.sin(pet.gait) * 0.055 : 0;
        rig.tail.rotation.x = airborne ? -0.12 - pet.verticalSpeed * 0.2 : 0;
      }
      rig.legs.forEach((leg, i) => {
        const stride = Math.sin(pet.gait + i * Math.PI);
        leg.rotation.x = bird ? airborne ? 1.05 : moving ? stride * 0.27 : 0
          : moving ? stride * 0.24 : sitting ? (i ? -0.32 : 0.32) : 0;
        if (bird) leg.position.y = 0.12 + (airborne ? 0.03 : moving ? Math.max(0, stride) * 0.028 : 0);
      });
      rig.wings.forEach((wing, i) => {
        // Smooth spread/fold, asymmetric downstroke, and feather sweep in recovery.
        const flap = Math.sin(pet.wingPhase), spread = pet.wingFold;
        wing.rotation.z = (i === 0 ? -1 : 1) * spread * (0.95 + flap * (pet.verticalSpeed > 0.03 ? 0.6 : 0.42));
        wing.rotation.x = spread * (0.12 + Math.max(0, -flap) * 0.3);
        wing.rotation.y = (i === 0 ? -1 : 1) * spread * Math.max(0, -flap) * 0.18;
      });
      rig.shadow.position.set(pet.x, 0.014, pet.z); rig.shadow.rotation.z = -pet.yaw;
      const c = drivingColliders[VILLA_PET_IDS.indexOf(pet.id)], r = VILLA_PET_RADIUS;
      c.minX = pet.x - r; c.maxX = pet.x + r; c.minZ = pet.z - r; c.maxZ = pet.z + r;
      c.minY = pet.y; c.maxY = pet.y + 0.61;
    }
  };
  update(0, createVillaPets());
  return { update, drivingColliders };
}
