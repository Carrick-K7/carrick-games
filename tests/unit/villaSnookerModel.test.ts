import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VILLA_SNOOKER } from '../../src/games/villaActivities.js';
import { createVillaSnooker, getVillaSnookerTrajectory, VILLA_SNOOKER_BALL_RADIUS as R, VILLA_SNOOKER_POCKETS } from '../../src/games/villaSnooker.js';
import { createVillaSnookerModel, createVillaSnookerTable, VILLA_SNOOKER_GUIDE_HEIGHT } from '../../src/games/villaSnookerModel.js';
import { VILLA_SNOOKER_APERTURE_RADIUS } from '../../src/games/villaSnooker.js';

function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (node instanceof THREE.Mesh || node instanceof THREE.Line) {
      node.geometry.dispose(); (Array.isArray(node.material) ? node.material : [node.material]).forEach(m => materials.add(m));
    }
  });
  materials.forEach(m => m.dispose());
}

describe('Villa walnut snooker table geometry', () => {
  it('keeps the existing accessible anchor, collider, playing dimensions and grounded six-leg frame', () => {
    const scene = new THREE.Group(), table = createVillaSnookerTable(scene);
    expect(table.root.position.toArray()).toEqual([9.15, 0, -3.8]);
    expect(table.colliders).toHaveLength(1); expect(table.colliders[0].minX).toBeCloseTo(8.07); expect(table.colliders[0].maxX).toBeCloseTo(10.23);
    expect(table.colliders[0].minZ).toBeCloseTo(-5.83); expect(table.colliders[0].maxZ).toBeCloseTo(-1.77); expect(table.colliders[0].maxY).toBe(0.92);
    expect(table.root.userData).toMatchObject({ finish: 'walnut', playingWidth: 1.778, playingLength: 3.569, clothHeight: 0.86, connectedLegs: 6 });
    expect(table.root.children.filter(n => n.name === 'snooker-connected-leg')).toHaveLength(6);
    const wood = table.root.children.filter((n): n is THREE.Mesh => n instanceof THREE.Mesh && (n.material as THREE.Material).name === 'snooker-walnut');
    expect(wood).toHaveLength(1); expect((wood[0].material as THREE.MeshStandardMaterial).color.getHexString()).toBe('483326');
    const bounds = new THREE.Box3().setFromObject(table.root); expect(bounds.min.y).toBeCloseTo(0);
    expect(table.root.children.filter(n => n instanceof THREE.Mesh).length).toBeLessThanOrEqual(10);
    dispose(scene);
  });
  it('has actual holes through cloth, slate AND the walnut rails at all six mouths', () => {
    const scene = new THREE.Group(), table = createVillaSnookerTable(scene); scene.updateMatrixWorld(true);
    const materials = ['snooker-cloth', 'snooker-slate', 'snooker-walnut'];
    const surfaces = table.root.children.filter(n => n instanceof THREE.Mesh && materials.includes((n.material as THREE.Material).name));
    const ray = new THREE.Raycaster();
    for (const p of VILLA_SNOOKER_POCKETS) for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, r = i === 0 ? 0 : 0.071;
      ray.set(new THREE.Vector3(VILLA_SNOOKER.center.x + p.x + Math.cos(a) * r, 1.1, VILLA_SNOOKER.center.z + p.z + Math.sin(a) * r), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObjects(surfaces).filter(hit => hit.point.y > 0.82)).toHaveLength(0);
    }
    ray.set(new THREE.Vector3(VILLA_SNOOKER.center.x, 1.1, VILLA_SNOOKER.center.z + 0.3), new THREE.Vector3(0, -1, 0));
    expect(ray.intersectObjects(surfaces).some(hit => Math.abs(hit.point.y - VILLA_SNOOKER.height) < 1e-6)).toBe(true);
    expect(VILLA_SNOOKER_APERTURE_RADIUS).toBe(0.078); dispose(scene);
  });
});

describe('Villa snooker bounded world guides', () => {
  it('renders first contact, ghost and projection in three reused line batches above cloth', () => {
    const root = new THREE.Group(), model = createVillaSnookerModel(root), s = createVillaSnooker();
    const group = root.getObjectByName('villa-playable-snooker')!;
    for (const b of s.balls) b.potted = !['white', 'red-1'].includes(b.id);
    s.balls[0].x = s.balls[1].x = 0; s.balls[0].z = 0.4; s.balls[1].z = -0.1;
    model.update(s, true);
    const lines = group.children.filter((n): n is THREE.LineSegments => n instanceof THREE.LineSegments);
    expect(lines).toHaveLength(3); expect(lines.every(n => n.visible)).toBe(true);
    expect(lines.reduce((sum, n) => sum + n.geometry.getAttribute('position').count, 0)).toBe(54);
    for (const line of lines) {
      const p = line.geometry.getAttribute('position');
      for (let i = 0; i < line.geometry.drawRange.count; i++) {
        expect(p.getY(i)).toBeCloseTo(VILLA_SNOOKER_GUIDE_HEIGHT); expect(p.getY(i)).toBeGreaterThan(VILLA_SNOOKER.height + 0.004);
        expect(Number.isFinite(p.getX(i) + p.getZ(i))).toBe(true);
        expect(Math.abs(p.getX(i))).toBeLessThanOrEqual(VILLA_SNOOKER.playingWidth / 2);
        expect(Math.abs(p.getZ(i))).toBeLessThanOrEqual(VILLA_SNOOKER.playingLength / 2);
      }
    }
    const guide = group.getObjectByName('snooker-world-aim-guide') as THREE.LineSegments;
    expect(guide.geometry.getAttribute('position').getZ(1)).toBeCloseTo(getVillaSnookerTrajectory(s)!.cue.to.z);
    const balls = group.getObjectByName('snooker-dynamic-balls') as THREE.InstancedMesh, matrix = new THREE.Matrix4(); balls.getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixPosition(matrix).y).toBeCloseTo(VILLA_SNOOKER.height + R);
    const geometries = lines.map(n => n.geometry), attributes = lines.map(n => [n.geometry.getAttribute('position'), n.geometry.getAttribute('lineDistance')]);
    s.aim = 0.1; model.update(s, true); expect(lines.map(n => n.geometry)).toEqual(geometries);
    lines.forEach((n, i) => { expect(n.geometry.getAttribute('position')).toBe(attributes[i][0]); expect(n.geometry.getAttribute('lineDistance')).toBe(attributes[i][1]); });
    expect(model.update(s, true)).toBe(false); dispose(root);
  });
  it('hides guides on disable/inactive/rolling/scratch and makes reset visible without stale geometry', () => {
    const root = new THREE.Group(), model = createVillaSnookerModel(root); let s = createVillaSnooker();
    const lines: THREE.LineSegments[] = []; root.traverse(n => { if (n instanceof THREE.LineSegments) lines.push(n); });
    const hidden = () => expect(lines.every(n => !n.visible && n.geometry.drawRange.count === 0)).toBe(true);
    model.update(s, true); expect(lines.some(n => n.visible)).toBe(true);
    s.aimAssist = false; model.update(s, true); hidden(); expect(root.getObjectByName('snooker-active-cue')!.visible).toBe(true);
    s.aimAssist = true; model.update(s, false); hidden();
    s.moving = true; model.update(s, true); hidden(); s.moving = false;
    s.phase = 'rolling'; model.update(s, true); hidden(); s.phase = 'aiming';
    s.balls[0].potted = true; model.update(s, true); hidden(); expect(root.getObjectByName('snooker-active-cue')!.visible).toBe(false);
    s = createVillaSnooker(); model.update(s, true); expect(lines.some(n => n.visible)).toBe(true);
    s.balls[0].vx = 0.1; model.update(s, true); hidden(); dispose(root);
  });
});
