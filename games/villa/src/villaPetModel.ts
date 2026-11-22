import * as THREE from 'three';
import { companionBody, companionHead, companionTail, companionWing, companionFoot, companionLegs, companionDish, jointedGait, felineRest } from './villaCompanionArt.js';
import { companionMaterial } from './villaCoatSurface.js';
import { VillaModelBuilder } from './villaModel.js';
import { createVillaPets, villaPetKind, VILLA_PET_FOOD, VILLA_PET_IDS, VILLA_PET_RADIUS, type VillaPetId, type VillaPetsState } from './villaPets.js';
import type { VillaCollider } from './villaWorld.js';

type Triple = [number, number, number];
interface PetRig {
  root: THREE.Group; body: THREE.Group; head: THREE.Group; tail: THREE.Group;
  legs: THREE.Group[]; strideMorphs: number[][]; wings: THREE.Group[]; shadow: THREE.Mesh;
  foodPlate: THREE.Group; foodFeedCount: number; headRestY: number;
}
export interface VillaPetModel {
  update(time: number, state: VillaPetsState): void;
  /** Mutable plain boxes for vehicle stopping ONLY, never walking-player collision. */
  drivingColliders: VillaCollider[];
}
/** Scene owns every geometry/material. One vertex-colour batch per animated part. */
export function createVillaPetModel(parent: THREE.Object3D): VillaPetModel {
  const material = companionMaterial();
  const birdShadowRadius = .18;
  const shadowMaterial = new THREE.MeshBasicMaterial({ color: 0x25372b, transparent: true, opacity: .24, vertexColors: true, depthWrite: false });
  // A shrinking airborne bird contact has less density too. Read the physical
  // footprint from its existing per-draw matrix so neither shared material nor
  // per-vertex alpha has to be rewritten during flight. All ground footprints
  // are at least the resting bird radius and retain their full falloff.
  shadowMaterial.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
      #ifdef USE_COLOR_ALPHA
        vColor.a *= smoothstep(0.38, 1.0, length(modelMatrix[0].xyz) / ${birdShadowRadius.toFixed(2)});
      #endif`);
  };
  shadowMaterial.customProgramCacheKey = () => 'villa-soft-contact-density-v1';
  const softContact = () => {
    const pos = [0, 0, 0], color = [1, 1, 1, 1], indices: number[] = [], n = 20;
    const bands = [[.23, .95], [.49, .64], [.73, .26], [.91, .055], [1, 0]];
    bands.forEach(([radius, alpha], k) => {
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n, p = 1 + k * n + i, q = 1 + k * n + (i + 1) % n;
        pos.push(radius * Math.cos(a), radius * Math.sin(a), 0); color.push(1, 1, 1, alpha);
        if (!k) indices.push(0, p, q); else indices.push(p - n, p, q, p - n, q, q - n);
      }
    });
    const g = new THREE.BufferGeometry(); g.setIndex(indices); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(color, 4)); return g;
  };
  const rigs = new Map<VillaPetId, PetRig>();
  const drivingColliders: VillaCollider[] = [];

  function part(parentPart: THREE.Object3D, name: string, position: Triple, build: (b: VillaModelBuilder) => void): THREE.Group {
    const builder = new VillaModelBuilder(parentPart, name); build(builder);
    const root = builder.finish(); root.position.set(...position);
    // A walking pet passes in and out of existing tree/house shade. It receives that
    // shadow but never becomes a frozen caster, nor dirties a sun map every gait tick.
    root.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = true; } });
    return root;
  }
  for (const id of VILLA_PET_IDS) {
    const kind = villaPetKind(id);
    const blue = id === 'parrot-blue', female = id === 'rabbit-female';
    const root = new THREE.Group(); root.name = `villa-pet-${id}`;
    root.userData = { petId: id, petKind: kind, peaceful: true, food: VILLA_PET_FOOD[kind], radius: VILLA_PET_RADIUS,
      sex: kind === 'rabbit' ? female ? 'female' : 'male' : null,
      appearance: kind === 'rabbit' ? female ? 'silver-cream coat, gently splayed ears' : 'warm cream coat, upright ears' : blue ? 'blue plumage' : 'natural coat/plumage' };
    parent.add(root);
    const rabbit = kind === 'rabbit', bird = kind === 'parrot';
    const body = part(root, `${id}/body`, [0, 0, 0], b => companionBody(b, material, id));
    const head = part(body, `${id}/head`, [0, bird ? .39 : rabbit ? .29 : .35, bird ? .04 : .175], b => companionHead(b, material, id));
    const tail = part(body, `${id}/tail`, [0, bird ? .205 : rabbit ? .18 : .26, bird ? -.075 : -.205], b => companionTail(b, material, id));
    const legs: THREE.Group[] = [], wings: THREE.Group[] = [], strideMorphs: number[][] = [];
    if (bird) for (const side of [-1, 1]) {
      legs.push(part(body, `${id}/foot-${side < 0 ? 'left' : 'right'}`, [side * .042, .12, .02], b => companionFoot(b, material, side)));
      wings.push(part(body, `${id}/wing-${side < 0 ? 'left' : 'right'}`, [side * .075, .28, 0], b => companionWing(b, material, id, side)));
    } else for (let pair = 0; pair < 2; pair++) {
      const limb = part(body, `${id}/legs-${pair}`, [0, 0, 0], b => companionLegs(b, material, id, pair));
      legs.push(limb); strideMorphs.push(jointedGait(limb, pair, rabbit, kind === 'cat'));
    }
    const foodPlate = part(parent, `${id}/food-plate`, [0, 0, 0], b => companionDish(b, material, id));
    foodPlate.visible = false;
    foodPlate.userData = { petId: id, petKind: kind, food: VILLA_PET_FOOD[kind], role: 'pet-food', contents: rabbit ? ['hay', 'greens'] : bird ? ['seeds'] : ['kibble'] };
    const shadow = new THREE.Mesh(softContact(), shadowMaterial);
    shadow.name = `${id}/contact-shadow`; shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(bird ? 0.18 : 0.23, bird ? 0.23 : 0.31, 1);
    parent.add(shadow);
    rigs.set(id, { root, body, head, tail, legs, strideMorphs, wings, shadow, foodPlate, foodFeedCount: -1, headRestY: head.position.y });
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
      rig.body.position.y = sitting ? felineRest.lower : 0;
      rig.body.rotation.x = sitting ? felineRest.pitch : 0;
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
        const footprint = 1 - .44 * THREE.MathUtils.smoothstep(pet.y, .02, .68);
        rig.shadow.scale.set(birdShadowRadius * footprint, .23 * footprint, 1);
      }
      rig.legs.forEach((leg, i) => {
        const stride = Math.sin(pet.gait + i * Math.PI);
        if (bird) {
          leg.rotation.x = airborne ? 1.05 : moving ? stride * .27 : 0;
          leg.position.y = .12 + (airborne ? .03 : moving ? Math.max(0, stride) * .028 : 0);
        } else {
          const stroke = moving ? stride : 0;
          rig.strideMorphs[i][0] = Math.max(0, -stroke); rig.strideMorphs[i][1] = Math.max(0, stroke);
          if (pet.kind === 'cat') rig.strideMorphs[i][2] = sitting ? 1 : 0;
        }
      });
      rig.wings.forEach((wing, i) => {
        // Smooth spread/fold, asymmetric downstroke, and feather sweep in recovery.
        const flap = Math.sin(pet.wingPhase), spread = pet.wingFold;
        wing.rotation.z = (i === 0 ? -1 : 1) * spread * (0.95 + flap * (pet.verticalSpeed > 0.03 ? 0.6 : 0.42));
        wing.rotation.x = spread * (0.12 + Math.max(0, -flap) * 0.3);
        // Primaries stow rearward against the back; unfold the wrist out from the flank.
        wing.rotation.y = (i === 0 ? -1 : 1) * spread * (-.53 + Math.max(0, -flap) * .18);
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
