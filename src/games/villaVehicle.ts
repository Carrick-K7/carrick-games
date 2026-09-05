import * as THREE from 'three';
import { CAR_DOOR_SECONDS, VILLA_CAR, type VillaActivityState } from './villaActivities.js';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { PLAYER_RADIUS, setVillaColliderNarrowPhase, type VillaCollider } from './villaWorld.js';
import { registerVillaVehicleColliders, type VillaDrivingState } from './villaDriving.js';

type Point = [number, number, number];

/** A curved, open sheet, rather than a solid volume: the passenger compartment stays hollow. */
function sheet(uSteps: number, vSteps: number, sample: (u: number, v: number) => Point): THREE.BufferGeometry {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let v = 0; v <= vSteps; v++) for (let u = 0; u <= uSteps; u++) {
    positions.push(...sample(u / uSteps, v / vSteps)); uv.push(u / uSteps, v / vSteps);
  }
  for (let v = 0; v < vSteps; v++) for (let u = 0; u < uSteps; u++) {
    const a = v * (uSteps + 1) + u, b = a + uSteps + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** Station loft used for the tapered nose, shoulders and short rear deck. */
function station(z: number): { width: number; belt: number } {
  const stations = [
    [-2.36, 0.64, 0.64], [-2.23, 0.83, 0.83], [-1.8, 0.925, 0.91],
    [-1.1, 0.96, 0.935], [0.15, 0.955, 0.92], [0.95, 0.94, 0.895],
    [1.6, 0.925, 0.805], [2.14, 0.84, 0.665], [2.36, 0.62, 0.54],
  ];
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1], b = stations[i];
    if (z <= b[0]) {
      const t = smooth(THREE.MathUtils.clamp((z - a[0]) / (b[0] - a[0]), 0, 1));
      return { width: mix(a[1], b[1], t), belt: mix(a[2], b[2], t) };
    }
  }
  return { width: 0.62, belt: 0.54 };
}

export function createVillaVehicle(parent: THREE.Object3D): {
  colliders: VillaCollider[];
  update(time: number, state: VillaActivityState & { driving?: VillaDrivingState }): boolean;
  readonly doorProgress: number;
} {
  const car = new THREE.Group();
  car.name = 'villa-vehicle';
  car.position.set(VILLA_CAR.center.x, VILLA_CAR.center.y, VILLA_CAR.center.z);
  car.userData = { kind: 'vehicle', style: 'electric-fastback-sedan', forward: '+Z', driverSide: '+X', hollowCabin: true };
  parent.add(car);
  // A cheap travelling contact shadow grounds the car even beyond the villa's
  // fixed sun-shadow map (and on software renderers). Never leave a stain at home.
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const shade = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
      shade.addColorStop(0, 'rgba(0,0,0,.65)'); shade.addColorStop(.58, 'rgba(0,0,0,.38)'); shade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shade; ctx.fillRect(0, 0, 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.65, 5.35), new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: .68, depthWrite: false, toneMapped: false }));
      contact.name = 'vehicle-contact-shadow'; contact.rotation.x = -Math.PI / 2; contact.position.y = .032; car.add(contact);
    }
  }

  const paint = new THREE.MeshPhysicalMaterial({ color: 0xdfe6e7, roughness: 0.25, metalness: 0.22, clearcoat: 1, clearcoatRoughness: 0.16, side: THREE.DoubleSide });
  const dark = villaMaterial(0x171d23, 0.43, 0.12); dark.side = THREE.DoubleSide;
  const rubber = villaMaterial(0x151719, 0.91);
  const silver = villaMaterial(0x9aa8b1, 0.29, 0.72);
  const upholstery = villaMaterial(0xe9e8df, 0.84);
  const seam = villaMaterial(0x9dabae, 0.62);
  const wood = villaMaterial(0x9b7150, 0.76);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x8caeb8, roughness: 0.09, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 });
  // Solar-control roof glass reads as a continuous reflective fastback roof, not a convertible.
  // This is still only a curved sheet; there is no solid volume inside the passenger cabin.
  const roofGlass = new THREE.MeshPhysicalMaterial({ color: 0x152129, roughness: 0.19, metalness: 0.18, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.12 });
  const rearGlass = new THREE.MeshPhysicalMaterial({ color: 0x314653, roughness: 0.13, metalness: 0.08, transparent: true, opacity: 0.57, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1 });
  const headlight = new THREE.MeshStandardMaterial({ color: 0xe2f6ff, emissive: 0xc8eafa, emissiveIntensity: 0.65, roughness: 0.2 });
  const taillight = new THREE.MeshStandardMaterial({ color: 0x9e1723, emissive: 0xd61c25, emissiveIntensity: 0.4, roughness: 0.25 });
  const display = new THREE.MeshBasicMaterial({ color: 0x182d38 });
  const displayAccent = new THREE.MeshBasicMaterial({ color: 0x8fc3cd });
  paint.name = 'pearl-clearcoat'; glass.name = 'clear-cabin-glazing'; roofGlass.name = 'panoramic-roof-glazing'; rearGlass.name = 'tinted-rear-glazing';

  const body = new VillaModelBuilder(car, 'vehicle-body');
  const cabin = new VillaModelBuilder(car, 'vehicle-cabin');
  cabin.root.userData = { kind: 'cabin', hollow: true, eyeHeight: VILLA_CAR.eyeHeight };
  const glazing = new VillaModelBuilder(car, 'vehicle-glazing');
  glazing.root.userData.kind = 'glazing';

  // The lower skin has genuine semicircular wheel cut-outs. No box occupies the cabin.
  const wheelZ = [-1.46, 1.46];
  const lowerEdge = (z: number) => {
    let y = 0.255;
    for (const axle of wheelZ) {
      const dz = z - axle;
      if (Math.abs(dz) < 0.385) y = Math.max(y, 0.355 + Math.sqrt(0.385 ** 2 - dz ** 2));
    }
    return y;
  };
  const sidePoint = (side: number, z: number, t: number): Point => {
    const { width, belt } = station(z);
    return [side * (width - 0.045 + 0.045 * Math.sin(Math.PI * t) - 0.035 * t), mix(lowerEdge(z), belt, t), z];
  };
  for (const side of [-1, 1]) {
    // Driver opening is not covered by a second, fixed body panel.
    const intervals = side === 1 ? [[-2.36, -0.3], [0.9, 2.36]] : [[-2.36, 2.36]];
    for (const [start, end] of intervals) body.geometry(sheet(Math.ceil((end - start) * 65), 8, (u, v) => sidePoint(side, mix(start, end, u), v)), paint);
    body.beam([side * 0.88, 0.245, -1.04], [side * 0.88, 0.245, 1.04], 0.052, paint);
    body.beam([side * 0.9, 0.21, -1.04], [side * 0.9, 0.21, 1.04], 0.019, dark);
    for (const z of wheelZ) {
      const arch = new THREE.TorusGeometry(0.382, 0.016, 6, 42, Math.PI);
      body.geometry(arch, paint, [side * 0.935, 0.355, z], [0, Math.PI / 2, 0]);
    }
  }
  // Crown the hood and deck using a curved transverse section, tapering into rounded end caps.
  const deckPoint = (across: number, z: number, lift = 0): Point => {
    const { width, belt } = station(z);
    return [across * (width - 0.08), belt + 0.055 * (1 - across * across) + lift, z];
  };
  for (const [start, end] of [[0.9, 2.36], [-2.36, -1.64]]) {
    body.geometry(sheet(30, 32, (u, v) => deckPoint(u * 2 - 1, mix(start, end, v))), paint);
  }
  for (const z of [-2.36, 2.36]) {
    const s = station(z);
    body.geometry(sheet(26, 10, (u, v) => {
      const x = u * 2 - 1;
      return [x * (s.width - 0.045 - 0.035 * v), mix(0.255, s.belt + 0.055 * (1 - x * x), v), z + Math.sign(z) * 0.018 * Math.sin(v * Math.PI) * (1 - x * x)];
    }), paint);
  }
  // Dark lower intake and slim rear diffuser avoid a cartoon grille.
  body.box(0, 0.325, 2.373, 1.06, 0.058, 0.008, dark, 0.002);
  body.box(0, 0.29, -2.373, 1.1, 0.049, 0.008, dark, 0.002);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 24; i++) {
      const crease = (t: number) => deckPoint(side * mix(0.19, 0.61, t), mix(0.93, 2.08, t), 0.002);
      body.beam(crease(i / 24), crease((i + 1) / 24), 0.002, seam, 5);
    }
    // All lamp vertices follow the actual hood crown; a fixed-height patch floated above it.
    const lampPoint = (u: number, v: number, lift = 0.004): Point => {
      const z = mix(2.185, 1.94, u) + (v - 0.5) * 0.094 * Math.sin(Math.PI * u);
      return deckPoint(side * mix(0.57, 0.965, u), z, lift);
    };
    body.geometry(sheet(28, 6, (u, v) => lampPoint(u, v)), dark);
    for (let i = 0; i < 24; i++) {
      const u = mix(0.035, 0.965, i / 24), next = mix(0.035, 0.965, (i + 1) / 24);
      body.beam(lampPoint(u, 0.78, 0.009), lampPoint(next, 0.78, 0.009), 0.006, headlight, 6);
      body.beam(lampPoint(u, 0.25, 0.007), lampPoint(next, 0.25, 0.007), 0.003, silver, 6);
    }
    body.beam([side * 0.19, 0.744, -2.285], [side * 0.78, 0.795, -2.2], 0.018, taillight, 8);
    body.beam([side * 0.78, 0.795, -2.2], [side * 0.895, 0.831, -1.96], 0.013, taillight, 8);
    // Rear-door seam and flush handle.
    body.beam([side * 0.895, 0.925, -1.16], [side * 0.92, 0.735, -1.12], 0.003, seam, 5);
    body.beam([side * 0.92, 0.735, -1.12], [side * 0.924, 0.355, -0.98], 0.003, seam, 5);
    body.box(side * 0.928, 0.845, -0.98, 0.014, 0.023, 0.135, dark, 0.006);
    if (side === -1) {
      body.beam([-0.915, 0.925, -0.3], [-0.915, 0.32, -0.3], 0.003, seam, 5);
      body.box(-0.928, 0.827, -0.17, 0.014, 0.023, 0.145, dark, 0.006);
    }
  }
  // Four tires, brake discs and five swept aero spokes (all batched by material).
  for (const side of [-1, 1]) for (const z of wheelZ) {
    body.geometry(new THREE.TorusGeometry(0.272, 0.075, 10, 40), rubber, [side * 0.875, 0.355, z], [0, Math.PI / 2, 0]);
    body.cylinder(side * 0.927, 0.355, z, 0.249, 0.249, 0.026, dark, [0, 0, Math.PI / 2], 40);
    body.cylinder(side * 0.944, 0.355, z, 0.182, 0.182, 0.012, silver, [0, 0, Math.PI / 2], 32);
    body.geometry(new THREE.TorusGeometry(0.237, 0.011, 6, 36), silver, [side * 0.948, 0.355, z], [0, Math.PI / 2, 0]);
    for (let spoke = 0; spoke < 5; spoke++) {
      const a = spoke * Math.PI * 2 / 5;
      body.geometry(sheet(1, 1, (u, v) => {
        const radius = mix(0.057, 0.229, v), angle = a + 0.24 * v + (u - 0.5) * mix(0.55, 0.36, v);
        return [side * (0.955 - 0.006 * v), 0.355 + Math.cos(angle) * radius, z + Math.sin(angle) * radius];
      }), paint);
    }
    body.cylinder(side * 0.957, 0.355, z, 0.058, 0.058, 0.012, silver, [0, 0, Math.PI / 2], 20);
    for (let bolt = 0; bolt < 5; bolt++) {
      const a = bolt * Math.PI * 2 / 5;
      body.cylinder(side * 0.965, 0.355 + Math.cos(a) * 0.037, z + Math.sin(a) * 0.037, 0.006, 0.006, 0.005, dark, [0, 0, Math.PI / 2], 6);
    }
  }

  // Arching roof/windscreen surfaces. Side windows are separate sheets, never a cabin block.
  const roofPoint = (u: number, v: number): Point => {
    const z = mix(-0.93, 0.08, v), x = u * 2 - 1;
    return [x * (0.746 + 0.012 * Math.sin(v * Math.PI)), 1.425 + 0.052 * (1 - x * x) + 0.004 * Math.sin(v * Math.PI), z];
  };
  glazing.geometry(sheet(22, 24, roofPoint), roofGlass);
  const windPoint = (u: number, v: number): Point => {
    const x = u * 2 - 1;
    return [x * mix(0.858, 0.746, v), mix(0.957, 1.425, v) + 0.044 * (1 - x * x) * v, mix(0.96, 0.08, v) + 0.037 * Math.sin(Math.PI * v)];
  };
  glazing.geometry(sheet(24, 24, windPoint), glass);
  const rearPoint = (u: number, v: number): Point => {
    const x = u * 2 - 1;
    return [x * mix(0.858, 0.746, v), mix(0.96, 1.425, v) + 0.05 * (1 - x * x) * v, mix(-1.64, -0.93, v)];
  };
  glazing.geometry(sheet(22, 18, rearPoint), rearGlass);
  const line = (builder: VillaModelBuilder, sample: (t: number) => Point, material: THREE.Material, radius: number, count = 18) => {
    for (let i = 0; i < count; i++) builder.beam(sample(i / count), sample((i + 1) / count), radius, material, 6);
  };
  for (const side of [-1, 1]) {
    const u = (side + 1) / 2;
    line(body, t => windPoint(u, t), paint, 0.032);
    line(body, t => rearPoint(u, t), paint, 0.038);
    line(body, t => roofPoint(u, t), paint, 0.024);
    // Rear quarter glass and narrow B pillar.
    glazing.geometry(sheet(12, 12, (u, v) => {
      const z = mix(-1.59, -0.32, u), top = z < -0.93 ? mix(0.98, 1.425, (z + 1.59) / 0.66) : 1.425;
      return [side * mix(0.883, 0.751, v), mix(0.955, top, v), z];
    }), glass);
    body.beam([side * 0.89, 0.943, -0.318], [side * 0.752, 1.427, -0.318], 0.023, dark);
    body.beam([side * 0.89, 0.943, -1.59], [side * 0.89, 0.943, -0.318], 0.012, dark);
  }
  line(body, t => windPoint(t, 0), dark, 0.018);
  line(body, t => windPoint(t, 1), dark, 0.016);
  line(body, t => rearPoint(t, 0), paint, 0.014);
  // Subtle wipers lie below the driver's sightline.
  body.beam([-0.63, 0.977, 0.938], [-0.13, 0.984, 0.933], 0.009, dark, 6);
  body.beam([0.08, 0.984, 0.933], [0.59, 0.977, 0.938], 0.009, dark, 6);

  // Cabin floor and footwells lie well below the seated eye; seats are individual upholstered forms.
  cabin.box(0, 0.257, -0.31, 1.72, 0.055, 2.61, dark, 0.025);
  for (const side of [-1, 1]) {
    cabin.box(side * 0.43, 0.293, 0.39, 0.57, 0.012, 0.54, rubber, 0.02);
    cabin.box(side * 0.43, 0.355, -0.105, 0.53, 0.09, 0.58, dark, 0.035);
    cabin.box(side * 0.43, 0.46, -0.06, 0.49, 0.15, 0.52, upholstery, 0.065);
    cabin.box(side * 0.43, 0.477, -0.027, 0.32, 0.124, 0.4, upholstery, 0.045);
    for (const offset of [-0.2, 0.2]) cabin.ellipsoid(side * 0.43 + offset, 0.522, -0.055, 0.065, 0.075, 0.242, upholstery);
    // Reclined backrest behind camera z=.05; no headrest/mesh intersects the seated camera.
    const seatBack = new THREE.BoxGeometry(0.47, 0.5, 0.135);
    cabin.geometry(seatBack, upholstery, [side * 0.43, 0.756, -0.34], [-0.15, 0, 0]);
    for (const offset of [-0.192, 0.192]) cabin.ellipsoid(side * 0.43 + offset, 0.762, -0.292, 0.063, 0.24, 0.08, upholstery);
    cabin.beam([side * 0.43 - 0.07, 0.98, -0.371], [side * 0.43 - 0.07, 1.035, -0.371], 0.01, silver);
    cabin.beam([side * 0.43 + 0.07, 0.98, -0.371], [side * 0.43 + 0.07, 1.035, -0.371], 0.01, silver);
    cabin.box(side * 0.43, 1.08, -0.378, 0.263, 0.184, 0.14, upholstery, 0.045);
    cabin.box(side * 0.13, 0.49, -0.2, 0.035, 0.055, 0.05, dark, 0.005);
    cabin.beam([side * 0.79, 1.12, -0.36], [side * 0.71, 0.43, -0.42], 0.012, dark, 6);
  }
  cabin.box(0, 0.455, -1.12, 1.42, 0.155, 0.46, upholstery, 0.055);
  cabin.box(0, 0.735, -1.38, 1.43, 0.45, 0.15, upholstery, 0.04);
  for (const x of [-0.49, 0, 0.49]) {
    cabin.box(x, 0.992, -1.413, 0.23, 0.17, 0.125, upholstery, 0.034);
    cabin.beam([x - 0.17, 0.535, -1.315], [x - 0.17, 0.535, -0.94], 0.0025, seam, 5);
  }
  // Minimalist dashboard: low continuous pad, real wood strip, and thin horizontal center display.
  cabin.box(0, 0.865, 0.842, 1.66, 0.116, 0.25, dark, 0.035);
  cabin.box(0, 0.854, 0.704, 1.61, 0.044, 0.017, wood, 0.006);
  for (let i = 0; i < 4; i++) cabin.box(0, 0.84 + i * 0.009, 0.693, 1.58, 0.0014, 0.001, seam, 0);
  cabin.box(0, 0.893, 0.705, 1.56, 0.009, 0.018, rubber, 0.001);
  cabin.box(0, 0.476, 0.096, 0.245, 0.29, 0.99, dark, 0.025);
  cabin.box(0, 0.628, -0.237, 0.235, 0.063, 0.3, upholstery, 0.018);
  cabin.box(0, 0.622, 0.339, 0.215, 0.025, 0.285, wood, 0.007);
  for (const z of [-0.005, 0.147]) {
    cabin.cylinder(0, 0.627, z, 0.052, 0.046, 0.008, rubber, [0, 0, 0], 24);
    cabin.geometry(new THREE.TorusGeometry(0.053, 0.004, 6, 24), silver, [0, 0.635, z], [Math.PI / 2, 0, 0]);
  }
  cabin.box(0, 0.927, 0.607, 0.407, 0.258, 0.024, dark, 0.012);
  cabin.box(0, 0.929, 0.592, 0.376, 0.225, 0.003, display, 0.002);
  // Quiet, label-free map and vehicle UI; not a floating sign or external texture.
  cabin.box(0.074, 0.928, 0.589, 0.002, 0.197, 0.002, displayAccent, 0);
  for (let i = 0; i < 4; i++) {
    cabin.box(-0.067, 0.855 + i * 0.046, 0.588, 0.215, 0.003, 0.002, displayAccent, 0);
    cabin.box(-0.151 + i * 0.059, 0.93, 0.588, 0.003, 0.196, 0.002, displayAccent, 0);
  }
  cabin.box(0.13, 0.952, 0.587, 0.043, 0.078, 0.003, upholstery, 0.008);
  for (let i = 0; i < 3; i++) cabin.box(0.13, 0.869 + i * 0.015, 0.587, 0.068, 0.004, 0.002, displayAccent, 0);

  const steering = new VillaModelBuilder(car, 'vehicle-steering');
  steering.root.userData = { kind: 'steering', driverSide: '+X', position: [0.43, 0.935, 0.443] };
  steering.beam([0.43, 0.828, 0.749], [0.43, 0.923, 0.46], 0.035, dark);
  steering.geometry(new THREE.TorusGeometry(0.161, 0.019, 10, 36), dark, [0.43, 0.935, 0.443], [-0.23, 0, 0]);
  steering.box(0.43, 0.92, 0.442, 0.11, 0.067, 0.045, dark, 0.015);
  for (const side of [-1, 1]) steering.beam([0.43 + side * 0.047, 0.93, 0.443], [0.43 + side * 0.146, 0.948, 0.44], 0.012, silver);
  steering.beam([0.43, 0.903, 0.445], [0.43, 0.781, 0.479], 0.011, dark);
  steering.box(0.43, 0.922, 0.416, 0.024, 0.008, 0.002, silver, 0.002);
  cabin.box(0.485, 0.341, 0.704, 0.076, 0.11, 0.03, silver, 0.01);
  cabin.box(0.315, 0.353, 0.704, 0.11, 0.08, 0.03, rubber, 0.008);
  cabin.box(0, 1.33, 0.327, 0.216, 0.072, 0.039, dark, 0.015);
  cabin.box(0, 1.328, 0.304, 0.184, 0.049, 0.005, silver, 0.01);
  cabin.beam([0, 1.372, 0.299], [0, 1.343, 0.33], 0.01, dark);

  const doorPivot = new THREE.Group();
  doorPivot.name = 'vehicle-driver-door';
  doorPivot.position.set(0.96, 0, 0.9);
  doorPivot.userData = { kind: 'door', animated: true, hinge: [0.96, 0, 0.9], openAngle: -1.1, carriesGlazing: true };
  car.add(doorPivot);
  const driver = new VillaModelBuilder(doorPivot, 'driver-door-panel');
  const doorWindows = new VillaModelBuilder(doorPivot, 'driver-door-glazing');
  doorWindows.root.userData.kind = 'glazing';
  const passenger = new VillaModelBuilder(car, 'passenger-door-details');
  const frontWindow = (side: number, u: number, v: number): Point => {
    const z = mix(-0.3, 0.9, u), top = z <= 0.08 ? 1.425 : mix(1.425, 0.973, (z - 0.08) / 0.82);
    return [side * mix(0.887, z <= 0.08 ? 0.747 : mix(0.747, 0.857, (z - 0.08) / 0.82), v), mix(0.944, top, v), z];
  };
  const buildDoor = (builder: VillaModelBuilder, windows: VillaModelBuilder, side: number) => {
    windows.geometry(sheet(24, 12, (u, v) => frontWindow(side, u, v)), glass);
    line(builder, t => frontWindow(side, t, 0), dark, 0.012);
    line(builder, t => frontWindow(side, t, 1), dark, 0.009);
    line(builder, t => frontWindow(side, 0, t), dark, 0.009, 10);
    // Keep the inner card fully inside the inward-tapering outer shoulder at both ends.
    builder.box(side * 0.827, 0.649, 0.27, 0.047, 0.32, 1.09, dark, 0.02);
    builder.box(side * 0.827, 0.668, 0.165, 0.069, 0.057, 0.51, upholstery, 0.016);
    builder.box(side * 0.832, 0.812, 0.27, 0.014, 0.036, 1.024, wood, 0.006);
    builder.box(side * 0.817, 0.741, 0.558, 0.016, 0.032, 0.13, silver, 0.004);
    builder.box(side * 0.821, 0.704, 0.31, 0.025, 0.006, 0.086, dark, 0.002);
    builder.beam([side * 0.885, 0.962, 0.728], [side * 1.03, 0.978, 0.775], 0.022, dark);
    builder.ellipsoid(side * 1.049, 0.997, 0.794, 0.106, 0.047, 0.088, paint);
    builder.box(side * 1.053, 0.999, 0.725, 0.139, 0.054, 0.007, silver, 0.012);
  };
  // Author the moving door in body coordinates, then convert once to hinge-local space.
  driver.at(-0.96, 0, -0.9, 0, () => {
    driver.geometry(sheet(28, 10, (u, v) => sidePoint(1, mix(-0.3, 0.9, u), v)), paint);
    driver.geometry(sheet(24, 1, (u, v) => {
      const z = mix(-0.3, 0.9, u);
      return [mix(0.861, station(z).width - 0.08, v), station(z).belt, z];
    }), paint);
    for (const z of [-0.3, 0.9]) driver.beam([0.876, 0.28, z], [0.882, 0.925, z], 0.012, paint);
    driver.box(0.928, 0.827, -0.17, 0.014, 0.023, 0.145, dark, 0.006);
    // Windows use their own frame because builder transforms are intentionally independent.
    doorWindows.at(-0.96, 0, -0.9, 0, () => buildDoor(driver, doorWindows, 1));
  });
  buildDoor(passenger, glazing, -1);

  for (const builder of [body, cabin, glazing, steering, driver, doorWindows, passenger]) builder.finish();
  car.traverse(node => {
    if (node instanceof THREE.Mesh) {
      const material = node.material as THREE.Material;
      node.name = `${node.parent?.name}/${material.name || material.type}`;
      if (material === glass || material === roofGlass || material === rearGlass) node.userData.kind = 'glazing';
    }
  });

  // Keep the very same objects: the world holds these references, not a freshly returned list.
  const bodyCollider: VillaCollider = { ...VILLA_CAR.body };
  const doorCollider: VillaCollider = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, minY: 0, maxY: 1.46 };
  const localDoorBounds = new THREE.Box3(new THREE.Vector3(-0.155, 0.27, -1.21), new THREE.Vector3(0.011, 1.455, 0.013));
  const worldDoorBounds = new THREE.Box3();
  const localBodyBounds = new THREE.Box3(new THREE.Vector3(-0.96, 0, -2.36), new THREE.Vector3(0.96, 1.48, 2.36));
  const worldBodyBounds = new THREE.Box3();
  registerVillaVehicleColliders([bodyCollider, doorCollider]);
  const bodyInverse = new THREE.Matrix4(), doorInverse = new THREE.Matrix4();
  const query = new THREE.Vector3();
  // World AABBs remain plain legacy snapshots; only the final walking test uses
  // hinge/body-local rectangles, so their empty rotated corners stay walkable.
  for (const [collider, bounds, inverse] of [[bodyCollider, localBodyBounds, bodyInverse], [doorCollider, localDoorBounds, doorInverse]] as const) {
    setVillaColliderNarrowPhase(collider, p => {
      query.set(p.x, p.y, p.z).applyMatrix4(inverse);
      const dx = query.x - THREE.MathUtils.clamp(query.x, bounds.min.x, bounds.max.x);
      const dz = query.z - THREE.MathUtils.clamp(query.z, bounds.min.z, bounds.max.z);
      return dx * dx + dz * dz < PLAYER_RADIUS * PLAYER_RADIUS;
    });
  }
  const updateCollider = () => {
    doorPivot.updateWorldMatrix(true, false);
    bodyInverse.copy(car.matrixWorld).invert(); doorInverse.copy(doorPivot.matrixWorld).invert();
    worldBodyBounds.copy(localBodyBounds).applyMatrix4(car.matrixWorld);
    // Keep legacy spawn values bit-for-bit, including decimal rounding.
    if (car.position.x === VILLA_CAR.center.x && car.position.z === VILLA_CAR.center.z && car.rotation.y === 0) Object.assign(bodyCollider, VILLA_CAR.body);
    else Object.assign(bodyCollider, { minX: worldBodyBounds.min.x, maxX: worldBodyBounds.max.x, minZ: worldBodyBounds.min.z, maxZ: worldBodyBounds.max.z, minY: worldBodyBounds.min.y, maxY: worldBodyBounds.max.y });
    worldDoorBounds.copy(localDoorBounds).applyMatrix4(doorPivot.matrixWorld);
    doorCollider.minX = worldDoorBounds.min.x; doorCollider.maxX = worldDoorBounds.max.x;
    doorCollider.minZ = worldDoorBounds.min.z; doorCollider.maxZ = worldDoorBounds.max.z;
    doorCollider.minY = worldDoorBounds.min.y; doorCollider.maxY = worldDoorBounds.max.y;
  };
  updateCollider();
  let progress = 0, previousTime: number | undefined;
  return {
    colliders: [bodyCollider, doorCollider],
    get doorProgress() { return progress; },
    update(time, state) {
      if (!Number.isFinite(time)) return false;
      const pose = state.driving;
      const x = pose?.x ?? VILLA_CAR.center.x, z = pose?.z ?? VILLA_CAR.center.z, yaw = pose?.yaw ?? 0;
      const moved = car.position.x !== x || car.position.z !== z || car.rotation.y !== yaw;
      car.position.set(x, 0, z); car.rotation.y = yaw;
      if (moved) updateCollider();
      const target = state.carDoorOpen ? 1 : 0;
      if (time === 0 || (previousTime !== undefined && time < previousTime)) {
        const changed = moved || progress !== target;
        progress = target; previousTime = time; doorPivot.rotation.y = -1.1 * smooth(progress); updateCollider(); return changed;
      }
      const elapsed = previousTime === undefined ? 0 : Math.max(0, time - previousTime);
      previousTime = time;
      if (target === progress) return moved;
      let next = target > progress ? Math.min(1, progress + elapsed / CAR_DOOR_SECONDS) : Math.max(0, progress - elapsed / CAR_DOOR_SECONDS);
      if (Math.abs(next - target) < 1e-9) next = target;
      if (next === progress) return moved;
      progress = next;
      const angle = -1.1 * smooth(progress);
      if (doorPivot.rotation.y === angle) return moved;
      doorPivot.rotation.y = angle;
      updateCollider();
      return true;
    },
  };
}
