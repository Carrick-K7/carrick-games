import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createVillaVehicle } from '../src/villaVehicle.js';
import { createVillaActivities, VILLA_CAR } from '../src/villaActivities.js';
import { createVillaDriving, villaCarAnchors } from '../src/villaDriving.js';
import { furnishVilla } from '../src/villaFurnishings.js';
import { createVillaHomeModel } from '../src/villaHomeModel.js';
import { advanceVillaHome, createVillaHome, setVillaRoomLight, setVillaTimeOfDay } from '../src/villaHome.js';
import { VILLA_ESTATE_BOUNDS, VILLA_GARAGE_EXTENT } from '../src/villaEstateLayout.js';
import { VILLA_BLOCKS } from '../src/villaWorld.js';

const scenes: THREE.Scene[] = [];
const scene = () => { const root = new THREE.Scene(); scenes.push(root); return root; };
function meshes(root: THREE.Object3D): THREE.Mesh[] {
  const result: THREE.Mesh[] = []; root.traverse(node => { if (node instanceof THREE.Mesh) result.push(node); }); return result;
}
function triangles(mesh: THREE.Mesh, visit: (triangle: THREE.Triangle) => void) {
  const position = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
  const triangle = new THREE.Triangle(), vertices = [triangle.a, triangle.b, triangle.c];
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    vertices.forEach((vertex, k) => vertex.fromBufferAttribute(position, index ? index.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld));
    visit(triangle);
  }
}
function cast(from: THREE.Vector3, to: THREE.Vector3, targets: THREE.Object3D[]) {
  return new THREE.Raycaster(from, to.clone().sub(from).normalize(), 0, from.distanceTo(to) + .4).intersectObjects(targets, true);
}
afterEach(() => {
  for (const root of scenes) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    root.traverse(node => {
      if (node instanceof THREE.Mesh || node instanceof THREE.Line || node instanceof THREE.Points) {
        geometries.add(node.geometry); (Array.isArray(node.material) ? node.material : [node.material]).forEach(material => materials.add(material));
      }
    });
    materials.forEach(material => { Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); }); material.dispose(); });
    geometries.forEach(geometry => geometry.dispose()); textures.forEach(texture => texture.dispose()); root.clear();
  }
  scenes.length = 0; vi.unstubAllGlobals();
});

describe('Villa observed visual regression geometry', () => {
  it('occludes both real front tyres with opaque footwell triangles below the dashboard, without moving the driver eye', () => {
    const root = scene(), vehicle = createVillaVehicle(root), driving = createVillaDriving();
    vehicle.update(0, { ...createVillaActivities(), driving }); root.updateMatrixWorld(true);
    const car = root.getObjectByName('villa-vehicle')!, footwell = root.getObjectByName('vehicle-front-footwell')!;
    expect(footwell).toBeDefined();
    const anchor = villaCarAnchors(driving).seat, eye = new THREE.Vector3(anchor.x, anchor.y + VILLA_CAR.eyeHeight, anchor.z);
    expect(eye.x).toBeCloseTo(16.63); expect(eye.y).toBe(1.16); expect(eye.z).toBeCloseTo(-2.55);
    const tyreMeshes = meshes(root.getObjectByName('vehicle-body')!).filter(mesh =>
      mesh.material instanceof THREE.MeshStandardMaterial && mesh.material.color.getHex() === 0x151719);
    expect(tyreMeshes.length).toBeGreaterThan(0);
    for (const side of [-1, 1]) for (const [y, z] of [[.26, 1.21], [.355, 1.21], [.48, 1.24], [.57, 1.40]]) {
      const target = car.localToWorld(new THREE.Vector3(side * .875, y, z));
      const tyreHit = cast(eye, target, tyreMeshes)[0], enclosureHit = cast(eye, target, [footwell])[0];
      expect(tyreHit, `real tyre surface ${side}/${y}/${z}`).toBeDefined();
      expect(enclosureHit, `footwell must hide tyre ${side}/${y}/${z}`).toBeDefined();
      expect(enclosureHit.distance).toBeLessThan(tyreHit.distance - .05);
      const material = (enclosureHit.object as THREE.Mesh).material as THREE.Material;
      expect(material.transparent).toBe(false); expect(material.opacity).toBe(1); expect(material.depthWrite).toBe(true); expect(material.visible).toBe(true);
    }
    const bounds = new THREE.Box3().setFromObject(footwell), local = bounds.clone().applyMatrix4(car.matrixWorld.clone().invert());
    expect(local.min.y).toBeLessThan(.2845); // physically overlaps the existing floor top
    expect(local.max.y).toBeGreaterThan(.807); // physically meets the existing fascia underside
    expect(local.max.y).toBeLessThan(eye.y - .25);
    expect(local.max.z).toBeLessThan(1.0); // the unchanged tyre centres remain ahead at z1.46
  });

  it('has no actual legacy hedge triangles in the expanded garage and retains foliage at every true east/west hedge site', () => {
    const paint = new Proxy({}, { get: (_, name) => name === 'createLinearGradient' || name === 'createRadialGradient'
      ? () => ({ addColorStop() {} }) : name === 'measureText' ? () => ({ width: 10 }) : () => {}, set: () => true });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => paint }) });
    const root = scene(); furnishVilla(root); root.updateMatrixWorld(true);
    const foliage = meshes(root).filter(mesh => mesh.material instanceof THREE.MeshStandardMaterial
      && [0x41684b, 0x7d9854].includes(mesh.material.color.getHex()));
    expect(foliage.length).toBeGreaterThanOrEqual(2);
    const garage = new THREE.Box3(new THREE.Vector3(VILLA_GARAGE_EXTENT.minX, -.5, VILLA_GARAGE_EXTENT.minZ),
      new THREE.Vector3(VILLA_GARAGE_EXTENT.maxX, VILLA_GARAGE_EXTENT.roofY, VILLA_GARAGE_EXTENT.maxZ));
    let triangleCount = 0, intrusions = 0;
    for (const mesh of foliage) triangles(mesh, triangle => {
      triangleCount++; if (garage.intersectsTriangle(triangle)) intrusions++;
    });
    expect(triangleCount).toBeGreaterThan(1000); expect(intrusions).toBe(0);
    for (const x of [-24.15, VILLA_ESTATE_BOUNDS.maxX - 1.15]) for (let i = 0; i < 14; i++) {
      const z = -12 + i * 2.45, hit = cast(new THREE.Vector3(x, 3, z), new THREE.Vector3(x, -.5, z), foliage)[0];
      expect(hit, `retained physical hedge ${x}/${z}`).toBeDefined();
      expect(hit.point.y).toBeGreaterThan(.8); expect(hit.point.y).toBeLessThan(1.4);
      expect((hit.object as THREE.Mesh).material).toMatchObject({ transparent: false, opacity: 1, visible: true });
    }
  });

  it('places a substantial switched emissive roof band outside real fascia triangles while keeping exactly six unshadowed lights', () => {
    const root = scene(), home = createVillaHome(), model = createVillaHomeModel(root), roof = model.glow('terrace');
    // Scene builds VILLA_BLOCKS with exactly these box dimensions. Include the
    // opaque architecture in the same ray query, so a buried diffuser cannot pass.
    const shellMaterial = new THREE.MeshStandardMaterial({ color: '#aaaaaa' });
    for (const block of VILLA_BLOCKS.filter(block => block.material !== 'glass')) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(block.w, block.h, block.d), shellMaterial);
      mesh.position.set(block.x, block.y, block.z); root.add(mesh);
    }
    root.updateMatrixWorld(true);
    const roofMeshes = meshes(root).filter(mesh => mesh.material === roof), bandBounds = new THREE.Box3(); let bandTriangles = 0;
    for (const mesh of roofMeshes) triangles(mesh, triangle => {
      const points = [triangle.a, triangle.b, triangle.c];
      if (points.every(point => point.y > 6.99 && point.y < 7.10)) { points.forEach(point => bandBounds.expandByPoint(point)); bandTriangles++; }
    });
    expect(bandTriangles).toBeGreaterThan(24); expect(bandBounds.max.y - bandBounds.min.y).toBeGreaterThan(.08);
    expect(bandBounds.max.z).toBeGreaterThan(9.44); expect(bandBounds.min.z).toBeLessThan(-9.44);
    expect(bandBounds.max.x).toBeGreaterThan(16.44); expect(bandBounds.min.x).toBeLessThan(-12.44);
    const targets = meshes(root);
    // The outer strip is the first opaque surface on its own outward sightline
    // (a ground-level ray would be stopped by the eave fascia in front of it).
    // The outward strip must sit beyond the eave fascia, which is what makes it
    // visible from the garden: compare real box faces rather than a point probe.
    const fascia = VILLA_BLOCKS.filter(block => !block.solid && block.material === 'stone' && Math.abs(block.y + block.h / 2 - 7.115) < .01);
    expect(fascia.length).toBeGreaterThanOrEqual(4);
    for (const block of fascia) {
      const southFace = block.z + block.d / 2, northFace = block.z - block.d / 2;
      if (Math.abs(block.z - 9.2) < .05) expect(bandBounds.max.z).toBeGreaterThan(southFace);
      if (Math.abs(block.z + 9.2) < .05) expect(bandBounds.min.z).toBeLessThan(northFace);
    }
    // The east/west strips sit just outside their own fascia face, and no part of
    // the run may float past the building: a mis-centred segment used to stick
    // 4.4 m into open air and read as a bright strip hanging above the lawn.
    expect(bandBounds.max.x).toBeGreaterThan(16.2 + .24);
    expect(bandBounds.max.x).toBeLessThan(16.2 + .24 + .06);
    expect(bandBounds.min.x).toBeLessThan(-12.2 - .24);
    expect(bandBounds.min.x).toBeGreaterThan(-12.2 - .24 - .06);
    expect(bandBounds.max.z).toBeLessThan(9.2 + .24 + .06);
    expect(bandBounds.min.z).toBeGreaterThan(-9.2 - .24 - .06);
    // And the band really is the emissive material on its outward face.
    expect((roof as THREE.MeshStandardMaterial).emissive.getHex()).not.toBe(0);
    const lights: THREE.PointLight[] = []; root.traverse(node => { if (node instanceof THREE.PointLight) lights.push(node); });
    expect(lights).toHaveLength(6); expect(lights.every(light => !light.castShadow)).toBe(true);
    setVillaTimeOfDay(home, 'night'); for (let i = 0; i < 280; i++) advanceVillaHome(home, .05);
    model.update(14, home, { x: 0, y: 1.65, z: 23 });
    expect(roof.transparent).toBe(false); expect(roof.emissive.getHex()).not.toBe(0);
    expect(roof.emissiveIntensity).toBeGreaterThan(model.glow('living').emissiveIntensity * 1.8);
    const lit = roof.emissiveIntensity;
    setVillaRoomLight(home, 'terrace', false); for (let i = 0; i < 40; i++) advanceVillaHome(home, .05);
    model.update(16, home, { x: 0, y: 1.65, z: 23 }); expect(lit).toBeGreaterThan(6); expect(roof.emissiveIntensity).toBe(0);
    expect(model.glow('living').emissiveIntensity).toBeGreaterThan(3);
    const after: THREE.PointLight[] = []; root.traverse(node => { if (node instanceof THREE.PointLight) after.push(node); }); expect(after).toEqual(lights);
  });
});
