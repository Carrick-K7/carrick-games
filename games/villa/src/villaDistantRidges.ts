import * as THREE from 'three';

// Different watersheds for the exposed pale ridge and the lower wooded spur.
// Low passes leave the open meadow visible between the high ground.
const nearer = [10, 13, 18, 13, 8, 7, 12, 15, 10, 8, 14, 20, 24, 14, 9, 15, 17, 7, 6, 9];
const farther = [21, 29, 23, 16, 12, 17, 25, 30, 22, 19, 27, 39, 33, 20, 23, 30, 24, 18, 15, 16];
function skyline(heights: number[], t: number) {
  const n = heights.length, u = (t % 1 + 1) % 1 * n, i = Math.floor(u), f = u - i;
  const sample = (k: number) => heights[(i + k + n) % n];
  const a = sample(-1), b = sample(0), c = sample(1), d = sample(2);
  return .5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f);
}
/** A single connected landform, not a row of disconnected horizon domes.
 * Both sides of both crests have geometry; their saddles change in parallax as
 * the visitor goes from the northern bridge to the southern overlook. */
export function addVillaDistantRidges(parent: THREE.Object3D, cx: number, cz: number): THREE.Mesh {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [], n = 144;
  const foothill = new THREE.Color('#87947b'), wood = new THREE.Color('#758b79'), rock = new THREE.Color('#9da79a'), shade = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const t = i / n, a = t * Math.PI * 2, gully = Math.sin(a * 11 + .5 * Math.cos(a * 4));
    const spur = 6 * gully + 4 * Math.cos(a * 7), saddle = 4 * Math.cos(a * 9 + .6);
    const front = skyline(nearer, t), back = skyline(farther, t + .026);
    const sections = [ // radial setback, elevation, hue toward stone
      [-18 + spur, -1.65, -.5], [-6 + spur * 1.4, front * .32 - 1, -.2], [4 + spur, front * .7, -.1],
      [11 + spur * .8, front, .04], [26 + saddle, front * .47, 0], [36 + saddle, Math.min(front, back) * .24, -.12],
      [47 + saddle, back * .56, .16], [60 + saddle * .5, back * .78 + 1.4 * gully, .28], [71 + saddle, back, .66], [96, -2.1, .12],
    ];
    sections.forEach(([offset, y, exposed], j) => {
      positions.push(cx + Math.cos(a) * (151 + offset), y, cz + Math.sin(a) * (190 + offset));
      shade.copy(wood).lerp(exposed < 0 ? foothill : rock, Math.abs(exposed)).multiplyScalar(.96 + .045 * Math.cos(a * 13 + j * .65));
      colors.push(shade.r, shade.g, shade.b);
      if (j) {
        const k = i * sections.length + j - 1, q = ((i + 1) % n) * sections.length + j - 1;
        indices.push(k, q, k + 1, q, q + 1, k + 1);
      }
    });
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  mesh.name = 'villa-distant-ridges'; parent.add(mesh); return mesh;
}
