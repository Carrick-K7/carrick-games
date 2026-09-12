import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { VillaCollider } from './villaWorld.js';

type Triple = [number, number, number];
export const villaMaterial = (color: THREE.ColorRepresentation, roughness = 0.55, metalness = 0): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Small, scene-owned model authoring helper. Static details share draw calls/materials. */
export class VillaModelBuilder {
  readonly root = new THREE.Group();
  readonly colliders: VillaCollider[] = [];
  private frame = new THREE.Matrix4();
  private readonly batches = new Map<THREE.Material, THREE.BufferGeometry[]>();

  constructor(parent: THREE.Object3D, name: string) { this.root.name = name; parent.add(this.root); }

  at(x: number, y: number, z: number, yaw: number, build: () => void) {
    const previous = this.frame;
    this.frame = previous.clone().multiply(new THREE.Matrix4().makeTranslation(x, y, z).multiply(new THREE.Matrix4().makeRotationY(yaw)));
    build(); this.frame = previous;
  }

  geometry(geometry: THREE.BufferGeometry, material: THREE.Material, position: Triple = [0, 0, 0], rotation: Triple = [0, 0, 0]) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (g !== geometry) geometry.dispose();
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(this.frame.clone().multiply(matrix));
    const list = this.batches.get(material) ?? []; list.push(g); this.batches.set(material, list);
  }

  box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material, radius = 0.02) {
    const r = Math.min(radius, w * 0.22, h * 0.22, d * 0.22);
    this.geometry(r > 0 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d), material, [x, y, z]);
  }

  cylinder(x: number, y: number, z: number, top: number, bottom: number, height: number, material: THREE.Material, rotation: Triple = [0, 0, 0], segments = 16) {
    this.geometry(new THREE.CylinderGeometry(top, bottom, height, segments), material, [x, y, z], rotation);
  }

  ellipsoid(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material) {
    const g = new THREE.SphereGeometry(1, 14, 9); g.scale(sx, sy, sz); this.geometry(g, material, [x, y, z]);
  }

  beam(a: Triple, b: Triple, radius: number, material: THREE.Material, segments = 10) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), delta = end.clone().sub(start);
    const g = new THREE.CylinderGeometry(radius, radius, delta.length(), segments);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    this.geometry(g, material, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
  }

  collide(x: number, bottom: number, z: number, w: number, h: number, d: number) {
    const box = new THREE.Box3(new THREE.Vector3(x - w / 2, bottom, z - d / 2), new THREE.Vector3(x + w / 2, bottom + h, z + d / 2)).applyMatrix4(this.frame);
    this.colliders.push({ minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, minY: box.min.y, maxY: box.max.y });
  }

  finish() {
    for (const [material, parts] of this.batches) {
      const geometry = mergeGeometries(parts);
      if (geometry) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${this.root.name}/surface`;
        mesh.castShadow = !material.transparent && !(material instanceof THREE.MeshBasicMaterial);
        mesh.receiveShadow = true; this.root.add(mesh);
      }
      parts.forEach(g => g.dispose());
    }
    this.batches.clear();
    return this.root;
  }
}
