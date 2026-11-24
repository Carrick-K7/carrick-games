import * as THREE from 'three';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createVillaPetModel } from '../src/villaPetModel.js';
import { createVillaPets, VILLA_PET_IDS } from '../src/villaPets.js';

// Inspect actual submitted geometry, not descriptive metadata, invisible extra
// heroes or a screenshot golden. Welding positions lets us identify the little
// contiguous vanes/locks inside the same batched draw as the skin.
type Vertex = { p: THREE.Vector3; u: number; v: number };
type Island = { vertices: Vertex[]; faces: THREE.Triangle[] };
function islands(mesh: THREE.Mesh): Island[] {
  const { geometry: g } = mesh, p = g.getAttribute('position'), uv = g.getAttribute('uv');
  const keys = new Map<string, number>(), roots: number[] = [], verts: Vertex[] = [], triangles: number[][] = [];
  const root = (v: number): number => roots[v] === v ? v : (roots[v] = root(roots[v]));
  const weld = (i: number) => {
    const v = new THREE.Vector3().fromBufferAttribute(p, i), key = v.toArray().map(c => Math.round(c * 1e7)).join('/');
    const seen = keys.get(key); if (seen !== undefined) return seen;
    const index = verts.length; keys.set(key, index); roots.push(index); verts.push({ p: v, u: uv.getX(i), v: uv.getY(i) }); return index;
  };
  for (let i = 0; i < (g.index?.count ?? p.count); i += 3) {
    const f = [0, 1, 2].map(k => weld(g.index ? g.index.getX(i + k) : i + k));
    roots[root(f[1])] = root(f[0]); roots[root(f[2])] = root(f[0]); triangles.push(f);
  }
  const parts = new Map<number, Island>();
  verts.forEach((v, i) => { const id = root(i); if (!parts.has(id)) parts.set(id, { vertices: [], faces: [] }); parts.get(id)!.vertices.push(v); });
  for (const [a, b, c] of triangles) parts.get(root(a))!.faces.push(new THREE.Triangle(verts[a].p, verts[b].p, verts[c].p));
  return [...parts.values()].sort((a, b) => b.faces.length - a.faces.length);
}
function signedDistance(p: THREE.Vector3, shell: Island) {
  const hit = new THREE.Vector3(), v = new THREE.Vector3(), n = new THREE.Vector3(); let distance = Infinity, sign = 1;
  for (const f of shell.faces) {
    f.closestPointToPoint(p, hit); v.subVectors(p, hit); const d = v.lengthSq();
    if (d < distance) { distance = d; sign = v.dot(f.getNormal(n)) < 0 ? -1 : 1; }
  }
  return sign * Math.sqrt(distance);
}

const scene = new THREE.Group(); let model: ReturnType<typeof createVillaPetModel>;
const batch = (name: string) => scene.getObjectByName(`${name}/surface`) as THREE.Mesh;
beforeAll(() => { model = createVillaPetModel(scene); });
afterAll(() => {
  const materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  scene.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); } });
  for (const m of materials) { for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value); m.dispose(); }
  textures.forEach(t => t.dispose()); scene.clear();
});

describe('outdoor coat, plumage and support', () => {
  it('keeps detail in bounded opaque draws and a scene-owned, mip-filtered direction field', () => {
    const material = batch('dog/head').material as THREE.MeshStandardMaterial, map = material.map as THREE.DataTexture;
    expect(map.isDataTexture).toBe(true); expect(material.roughnessMap).toBe(map); expect(material.transparent).toBe(false);
    const { width, height, data } = map.image; expect(data.byteLength).toBeLessThanOrEqual(128 * 1024);
    expect(map.generateMipmaps).toBe(true); expect(map.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    let across = 0, along = 0; const pigments = new Set<number>(), sample = (x: number, y: number) => data[4 * (y * width + x)];
    for (let y = 5; y < height - 5; y++) for (let x = 5; x < width / 2 - 5; x++) {
      const c = sample(x, y); pigments.add(c); across += Math.abs(c - sample(x + 1, y)); along += Math.abs(c - sample(x, y + 1));
    }
    expect(across).toBeGreaterThan(1.7 * along); expect(pigments.size).toBeGreaterThan(40);
    let visible = 0, total = 0, draws = 0; const version = map.version;
    const faces = (o: THREE.Mesh) => (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
    scene.traverseVisible(o => { if (o instanceof THREE.Mesh) { visible += faces(o); draws++; } });
    for (const id of VILLA_PET_IDS) {
      let animal = 0; scene.getObjectByName(`villa-pet-${id}`)!.traverse(o => { if (o instanceof THREE.Mesh) {
        expect(o.material).toBe(material); animal += faces(o); const uv = o.geometry.getAttribute('uv');
        expect(Array.from(uv.array).every(n => Number.isFinite(n) && n >= 0 && n <= 1)).toBe(true);
      } });
      expect(animal, id).toBeLessThan(4470);
    }
    scene.traverse(o => { if (o instanceof THREE.Mesh) total += faces(o); });
    expect(draws).toBe(40); expect(visible).toBeLessThanOrEqual(24100); expect(total).toBeLessThanOrEqual(30000);
    const state = createVillaPets(); state.pets[2].wingFold = 1; state.pets[2].y = .5; model.update(3, state);
    expect(map.version).toBe(version); expect(map.image.data).toBe(data);
  });

  it.each(['dog', 'cat', 'rabbit', 'rabbit-female'])('%s has embedded caudally swept tufts rather than detached bright flecks', id => {
    const [skin, ...locks] = islands(batch(`${id}/body`)); expect(locks.length).toBeGreaterThan(35); expect(locks.length).toBeLessThan(90);
    for (const tuft of locks) {
      expect(tuft.faces.length).toBeLessThanOrEqual(5);
      const ordered = tuft.vertices.map(v => ({ p: v.p, lift: signedDistance(v.p, skin) })).sort((a, b) => b.p.z - a.p.z);
      expect(ordered[0].lift).toBeLessThan(.0001); // broad root is buried, not floating above the polygonal hide
      expect(Math.max(...ordered.slice(-2).map(v => v.lift))).toBeGreaterThan(.0007);
      expect(Math.max(...ordered.map(v => Math.abs(v.lift)))).toBeLessThan(.009);
      const a = ordered[0].p, b = ordered.at(-1)!.p; expect(a.z - b.z).toBeGreaterThan(.003);
      // Actual length follows the curved shoulder, not just its Z projection.
      expect(a.distanceTo(b)).toBeGreaterThan(.007); expect(a.distanceTo(b)).toBeLessThan(.039);
    }
  });

  it('fits both eyes above a cheekbone in the continuous mammal hide', () => {
    for (const id of ['dog','cat','rabbit','rabbit-female']) {
      // Cut the actual skull, not the outermost ear/eye or a painted contour.
      // There must be positive relief across a length of the cheek, returning
      // below it into the jaw, not just one proud vertex or a detached pad.
      const [skull,...features] = islands(batch(`${id}/head`)), hit = new THREE.Vector3();
      const eyes=features.filter(i=>i.vertices.some(v=>v.u>.84 && v.v>.88) && i.vertices.some(v=>v.u<.78 && v.v>.88));
      expect(eyes).toHaveLength(2);
      for(const eye of eyes){
        const side=Math.sign(eye.vertices[0].p.x);
        for(const {p} of eye.vertices){
          expect(side*p.x, `${id}: lid stays on its own cheek`).toBeGreaterThan(.034);
          expect(Math.abs(signedDistance(p,skull)), `${id}: flush orbital fit`).toBeLessThan(.006);
        }
      }
      const breadth = (y:number,z:number) => {
        const ray = new THREE.Ray(new THREE.Vector3(.25,y,z), new THREE.Vector3(-1,0,0));
        let x = -Infinity;
        for (const f of skull.faces) if (ray.intersectTriangle(f.a,f.b,f.c,false,hit)) x=Math.max(x,hit.x);
        expect(Number.isFinite(x), `${id} has a closed cheek at ${y}/${z}`).toBe(true);
        return x;
      };
      for (const z of [.033,.043]) {
        const cheek=breadth(-.021,z);
        expect(cheek-breadth(.028,z), `${id}: infraorbital relief`).toBeGreaterThan(.004);
        expect(cheek-breadth(-.068,z), `${id}: return under jaw`).toBeGreaterThan(.010);
      }
    }
  });

  it.each(['parrot', 'parrot-blue'])('%s wraps separately tapered asymmetric remiges over the wing and has a small flush ocular surface', id => {
    const [scapula, ...vanes] = islands(batch(`${id}/wing-right`)); expect(vanes.length).toBeGreaterThanOrEqual(11);
    const lengths: number[] = []; let asymmetric = 0;
    for (const vane of vanes) {
      const vs = vane.vertices.sort((a,b) => a.v - b.v), root = vs[0], tip = vs.at(-1)!;
      const d = tip.p.distanceTo(root.p); lengths.push(d);
      expect(signedDistance(root.p, scapula)).toBeLessThan(.017); // can lift at the tip, not drift off at the shoulder
      expect(d).toBeGreaterThan(.052);
      const row = (v: number) => vs.filter(p => Math.abs((p.v - root.v) / (tip.v - root.v) - v) < .018).sort((a,b)=>a.u-b.u);
      if (d > .150) {
        const middle = row(.37), last = row(.92); expect(middle.length).toBe(4); expect(last.length).toBe(4);
        const a = middle[0].p.distanceTo(middle[1].p), b = middle[3].p.distanceTo(middle[1].p);
        if (Math.max(a,b) > 1.65 * Math.min(a,b)) asymmetric++;
        expect(last[0].p.distanceTo(last[3].p)).toBeLessThan(.52 * middle[0].p.distanceTo(middle[3].p));
      }
    }
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(.085); expect(asymmetric).toBeGreaterThanOrEqual(4);
    const eye = islands(batch(`${id}/head`)).filter(i => i.vertices.some(v => v.u > .84 && v.v > .88) && i.vertices.every(v=> v.p.x > .035));
    expect(eye.length).toBe(1); const bounds = new THREE.Box3().setFromPoints(eye[0].vertices.map(v => v.p)).getSize(new THREE.Vector3());
    expect(bounds.y).toBeGreaterThan(.012); expect(bounds.y).toBeLessThan(.023); expect(bounds.z).toBeLessThan(.026);
  });

  it('plants every foot in the actual idle pose and embeds the thigh/shoulder roots inside the torso', () => {
    const state = createVillaPets(); state.pets.forEach(p => { p.x = p.y = p.z = p.yaw = 0; }); model.update(0,state); scene.updateMatrixWorld(true);
    for (const pet of state.pets) {
      const bird = pet.kind === 'parrot', body = batch(`${pet.id}/body`), [skin] = islands(body);
      const limbs = bird ? ['foot-left','foot-right'] : ['legs-0','legs-1'];
      for (const limb of limbs) {
        const m = batch(`${pet.id}/${limb}`), p = m.geometry.getAttribute('position');
        const foot = new Map<number,number>(), bodySpace = body.matrixWorld.clone().invert().multiply(m.matrixWorld);
        for (let i=0;i<p.count;i++) {
          const loc = m.getVertexPosition(i,new THREE.Vector3()), side = bird ? 0 : Math.sign(p.getX(i));
          if (!bird && p.getY(i) > .282) expect(signedDistance(loc.clone().applyMatrix4(bodySpace), skin), `${pet.id}/${limb}: upper attachment at ${loc.toArray()}`).toBeLessThan(-.002);
          if (p.getY(i) < (bird ? -.091 : .040)) foot.set(side, Math.min(foot.get(side) ?? Infinity, loc.applyMatrix4(m.matrixWorld).y));
        }
        expect(foot.size).toBe(bird ? 1 : 2);
        foot.forEach(y=>{expect(y,`${pet.id}/${limb}`).toBeGreaterThanOrEqual(-.0001);expect(y).toBeLessThan(.007);});
      }
    }
  });
});
