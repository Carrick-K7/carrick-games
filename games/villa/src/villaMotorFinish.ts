import * as THREE from 'three';
import { VILLA_GARAGE_EXTENT, villaTerrainHeight } from './villaEstateLayout.js';
import { villaStreamBridgeHeight } from './villaStream.js';

export type TyreCut = 'aero' | 'utility' | 'split' | 'scooter';
type Point = [number, number, number];
const tau = Math.PI * 2;
const sat = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const t = sat(x); return t * t * (3 - 2 * t); };
const period = (x: number) => Math.abs(x - Math.round(x));

/** A repeat of the mould, unwrapped bead-to-bead. Water channels cross the crown;
 * fine mould ribs STOP at the shoulder. No lettering/noise pasted on the alloy. */
function motorRubber(color: THREE.ColorRepresentation, cut: TyreCut) {
  const w = 128, h = 64, data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + .5) / w, v = (y + .5) / h, side = u - .5, s = Math.abs(side);
    const pickup = cut === 'utility', scooter = cut === 'scooter';
    const angle = pickup ? 1.46 : scooter ? 2.85 : cut === 'aero' ? 1.91 : 2.27;
    const phase = v + angle * s + (side < 0 && !scooter ? .37 : 0) + .16 * Math.cos(s * 8);
    const groove = (d: number, half: number, bevel: number) => 1 - smooth((d - half) / bevel);
    const across = groove(period(phase), pickup ? .066 : .031, .046);
    const siping = groove(period(phase * 2 + .37 + .095 * Math.sin(26 * s)), .020, .055);
    let channels = scooter ? groove(Math.abs(s - .045), .005, .008) : groove(Math.abs(s - (pickup ? .105 : .084)), .010, .012);
    if (cut === 'split' || cut === 'aero') channels = Math.max(channels, groove(Math.abs(s - .206), .009, .012));
    const mould = Math.max(across * (scooter ? .95 : smooth((s - .03) / .08)), channels, siping * .38) * smooth((.336 - s) / .059);
    const stipple = ((x * 37 + y * 23 + x * y * 13) % 31) / 31;
    const ribs = s > .326 && s < .458 ? groove(period((s - .32) * 41), .09, .14) * 18 : 0;
    const shoulder = (1 - smooth((s - .285) / .057)) * 37;
    const value = Math.round(183 + shoulder + stipple * 9 - mould * (pickup ? 95 : 84) + ribs);
    const i = (y * w + x) * 4; data.set([value, value, value, 255], i);
  }
  const map = new THREE.DataTexture(data, w, h); map.name = `mould/${cut}`; map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter; map.generateMipmaps = true; map.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ color, map, bumpMap: map, bumpScale: cut === 'utility' ? .0042 : .0024, roughness: .86, vertexColors: true });
  material.name = `vulcanised-${cut}`; return material;
}

/** Construct the section under load, not an ellipse scaled through the axle. The
 * rim, bead, upper radius and hub datum do not move. Only the bottom sidewall
 * and contact land follow the few cm of render finish above/below the support. */
export function motorTyreStock(hub: number, radius: number, width: number, cut: TyreCut, color: THREE.ColorRepresentation) {
  const rubber = motorRubber(color,cut), bike = cut === 'scooter', bead = bike ? .619 : .687;
  // (half-section width fraction, radius fraction, distance across our rubber mould)
  const section = [[-.35,bead,0],[-.46,bead+.071,.055],[-.5,.855,.105],[-.454,.938,.161],[-.353,.984,.221],[-.173,1,.351],
    [0,1,.5],[.173,1,.649],[.353,.984,.779],[.454,.938,.839],[.5,.855,.895],[.46,bead+.071,.945],[.35,bead,1]];
  const p: number[] = [], uv: number[] = [], colors: number[] = [], offset: number[] = [], index: number[] = [];
  const n = bike ? 40 : 44, repeats = bike ? 13 : cut === 'utility' ? 18 : 22;
  for (const [ax, fraction, u] of section) for (let i = 0; i <= n; i++) {
    const theta = tau * (i % n) / n, c = Math.cos(theta), s = Math.sin(theta), lower = Math.max(0, -c);
    const outer = smooth((fraction - bead) / (1 - bead));
    const free = radius * fraction + (hub - radius + (bike ? .009 : .017)) * lower ** 2 * outer;
    const y = Math.max(-hub, c * free), bulge = 1 + (bike ? .075 : .054) * lower ** 5 * smooth(1 - Math.abs(fraction - .85) / .17);
    p.push(ax * width * bulge, y, s * free);
    uv.push(u, i / n * repeats);
    // Carbon-black sidewall, a chalkier abraded tread and a darker bead seat.
    const wear = 1.30 + .88 * outer - .16 * (1 - lower) * (1 - outer);
    colors.push(wear * 1.04, wear, wear * .97);
    offset.push(0, .07 * smooth((-y / hub - .50) / .448) * smooth((fraction - bead) / .16), 0);
  }
  for (let j = 0; j < section.length - 1; j++) for (let i = 0; i < n; i++) {
    const a = j * (n + 1) + i, b = a + n + 1;
    index.push(a,a+1,b,a+1,b+1,b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); g.setIndex(index); g.computeVertexNormals();
  const normal = g.getAttribute('normal'), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let j = 0; j < section.length; j++) {
    const i = j * (n + 1); a.fromBufferAttribute(normal,i).add(b.fromBufferAttribute(normal,i+n)).normalize();
    normal.setXYZ(i,a.x,a.y,a.z); normal.setXYZ(i+n,a.x,a.y,a.z);
  }
  g.morphTargetsRelative = true; g.morphAttributes.position = [new THREE.Float32BufferAttribute(offset, 3)];
  // All four wheels share the uploaded casing/mould; only their load weights differ.
  // As with the other skins, the triangle stream remains directly inspectable.
  const geometry = g.toNonIndexed(); g.dispose(); geometry.computeBoundingSphere(); geometry.boundingSphere!.radius += .03;
  return { rubber, repeats, mount(parent: THREE.Object3D, at: Point) {
    const mesh = new THREE.Mesh(geometry,rubber); mesh.name='loaded-tyre'; mesh.position.set(...at);
    mesh.castShadow=mesh.receiveShadow=true; parent.add(mesh); return { mesh, hub, width };
  } };
}
export type MotorTyre = ReturnType<ReturnType<typeof motorTyreStock>['mount']>;

/** A tiny broadphase over the ALREADY rendered road triangles. This includes the
 * apron, shoulder and overlapping junction heights without a second road layout,
 * raycasting the estate on every frame, or any changes to vehicle suspension. */
const roadFields = new WeakMap<THREE.Object3D, ReturnType<typeof readRoad>>();
function readRoad(road: THREE.Object3D) {
  const cell = 3, key = (x: number, z: number) => x + 2048 * z;
  const surfaces: { p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute; ix: THREE.BufferAttribute | null; bins: Map<number, number[]> }[] = [];
  for (const mesh of road.children) {
    if (!(mesh instanceof THREE.Mesh) || !['estate-road-asphalt','estate-road-shoulder'].includes(mesh.material.name)) continue;
    const p = mesh.geometry.getAttribute('position'), ix = mesh.geometry.index, bins = new Map<number, number[]>();
    for (let i = 0; i < (ix?.count ?? p.count); i += 3) {
      const a = ix?.getX(i) ?? i, b = ix?.getX(i+1) ?? i+1, c = ix?.getX(i+2) ?? i+2;
      const x0 = p.getX(a), x1 = p.getX(b), x2 = p.getX(c), z0 = p.getZ(a), z1 = p.getZ(b), z2 = p.getZ(c);
      const right = Math.floor(Math.max(x0,x1,x2) / cell), top = Math.floor(Math.max(z0,z1,z2) / cell);
      for (let row = Math.floor(Math.min(z0,z1,z2) / cell); row <= top; row++) for (let col = Math.floor(Math.min(x0,x1,x2) / cell); col <= right; col++) {
        const k = key(col,row), list = bins.get(k); if (list) list.push(i); else bins.set(k,[i]);
      }
    }
    surfaces.push({ p, ix, bins });
  }
  return (x: number, z: number, base: number) => {
    const k = key(Math.floor(x / cell), Math.floor(z / cell)); let y = base;
    for (const {p,ix,bins} of surfaces) {
      const list = bins.get(k); if (!list) continue;
      for (const i of list) {
        const a = ix?.getX(i) ?? i, b = ix?.getX(i+1) ?? i+1, c = ix?.getX(i+2) ?? i+2;
        const ax=p.getX(a), az=p.getZ(a), bx=p.getX(b)-ax, bz=p.getZ(b)-az, cx=p.getX(c)-ax, cz=p.getZ(c)-az, det=bx*cz-bz*cx;
        if (Math.abs(det) < 1e-9) continue;
        const u=((x-ax)*cz-(z-az)*cx)/det, v=(bx*(z-az)-bz*(x-ax))/det;
        if(u>=-1e-6 && v>=-1e-6 && u+v<=1.000001) y=Math.max(y,p.getY(a)*(1-u-v)+p.getY(b)*u+p.getY(c)*v);
      }
    }
    return y;
  };
}

/** One terrain-draped, non-casting ambient contact draw per vehicle. A broad
 * undertray penumbra gives way to four (or two) much tighter contact cores.
 * This is ambient blocking, NOT a fake directional sun frozen to a chassis. */
export function motorContact(root: THREE.Object3D, tyres: MotorTyre[], track: number, axle: number, bodyLength: number) {
  const parent = root.parent!, bike = track === 0, halfW = bike ? .385 : track + .42, halfL = bodyLength + (bike ? .14 : .38);
  const w=64,h=128, bytes = new Uint8Array(w*h*4), wheelX=bike?[0]:[-track,track];
  for (let j=0;j<h;j++) for (let i=0;i<w;i++) {
    const x=((i+.5)/w*2-1)*halfW, z=(1-(j+.5)/h*2)*halfL;
    const dx=Math.max(0,Math.abs(x)-(bike?.065:track*.68)), dz=Math.max(0,Math.abs(z+(bike?.12:0))-(bike?.30:bodyLength*.72));
    const shade=(1-smooth(Math.hypot(dx/(bike?.30:halfW-track*.68),dz/(bike?.43:halfL-bodyLength*.72))))*(bike?.37:.46);
    let alpha=shade;
    for(const wx of wheelX) for(const wz of [-axle,axle]) {
      const a=(x-wx)/tyres[0].width,b=(z-wz)/(bike?.125:.205);
      // Concentrate it on the compressed casing. Softer bounce occlusion reaches past each sidewall.
      const core=(1-smooth((Math.hypot(a*1.39,b)-.26)/1.16))*.67, bounce=(1-smooth(Math.hypot(a*.55,b*.44)))*.35;
      alpha=1-(1-alpha)*(1-core)*(1-bounce);
    }
    bytes.set([29,25,23,Math.round(alpha*255)],(j*w+i)*4);
  }
  const map=new THREE.DataTexture(bytes,w,h); map.name='underbody/contact-density'; map.colorSpace=THREE.SRGBColorSpace;
  map.magFilter=THREE.LinearFilter; map.minFilter=THREE.LinearMipmapLinearFilter; map.generateMipmaps=true; map.needsUpdate=true;
  const mat=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1});
  const g=new THREE.PlaneGeometry(halfW*2,halfL*2,4,8); g.rotateX(-Math.PI/2);
  const p=g.getAttribute('position') as THREE.BufferAttribute, uv=g.getAttribute('uv'); p.setUsage(THREE.DynamicDrawUsage);
  // A vertex under EVERY bearing keeps the tight core on the correct side of a
  // road edge even while the opposite wheels are still on the lower lawn.
  const halfTrack=bike?.12:track, xs=[-halfW,-halfTrack,0,halfTrack,halfW];
  const bevel=(halfL-axle)/2,zs=[-halfL,-axle-bevel,-axle,-axle*.52,0,axle*.52,axle,axle+bevel,halfL];
  for(let j=0;j<zs.length;j++)for(let i=0;i<xs.length;i++){
    const k=j*xs.length+i;p.setXYZ(k,xs[i],0,zs[j]);uv.setXY(k,.5+xs[i]/(2*halfW),.5-zs[j]/(2*halfL));
  }
  const mesh=new THREE.Mesh(g,mat); mesh.name=root.name+'/moving-contact'; parent.add(mesh);
  // The receiver is NOT a body part; it has its own yaw-only frame and neither
  // swings with a kickstand nor enlarges the solid vehicle's leaf/collider bounds.
  let prevX=NaN,prevZ=NaN,prevYaw=NaN,road:ReturnType<typeof readRoad>|undefined;
  const meadow=parent.getObjectByName('estate-lawn');
  const inGarage=(x:number,z:number)=>x>=VILLA_GARAGE_EXTENT.minX && x<=VILLA_GARAGE_EXTENT.maxX && z>=VILLA_GARAGE_EXTENT.minZ && z<=VILLA_GARAGE_EXTENT.maxZ;
  const ground=(x:number,z:number)=>{
    const height=inGarage(x,z) ? .015 : villaStreamBridgeHeight(x,z) ?? (villaTerrainHeight(x,z) - (meadow ? .022 : 0));
    return road ? road(x,z,height) : height;
  };
  const bearing=new THREE.Vector3(),inverse=new THREE.Matrix4(),local=new THREE.Matrix4();
  return () => {
    let addedRoad=false;
    if (!road) { const r=parent.getObjectByName('garden-road'); if(r){road=roadFields.get(r)??readRoad(r);roadFields.set(r,road);addedRoad=true;} }
    const {x,y,z}=root.position, yaw=root.rotation.y, c=Math.cos(yaw),s=Math.sin(yaw);
    if (addedRoad||x!==prevX||z!==prevZ||yaw!==prevYaw) {
      mesh.position.set(x,y,z); mesh.rotation.y=yaw;
      for(let i=0;i<p.count;i++){const a=p.getX(i),b=p.getZ(i);p.setY(i,ground(x+c*a+s*b,z-s*a+c*b)-y+.004);}
      p.needsUpdate=true; g.computeBoundingSphere(); prevX=x; prevZ=z; prevYaw=yaw;
    }
    parent.updateWorldMatrix(true,false); inverse.copy(parent.matrixWorld).invert();
    for (const {mesh:skin,hub} of tyres) {
      skin.updateWorldMatrix(true,false); local.multiplyMatrices(inverse,skin.matrixWorld);
      bearing.set(0,-hub,0).applyMatrix4(local);
      // No lawn/road mesh in an isolated rig: keep the nominal terrain tangent datum.
      const finish = meadow || road || inGarage(bearing.x,bearing.z) ? ground(bearing.x,bearing.z)-bearing.y : 0;
      skin.morphTargetInfluences![0]=THREE.MathUtils.clamp(finish / (.07*local.elements[5]),-.46,1);
    }
  };
}

/** Local road film on the unwashed rocker/behind a wheel well. Door and fixed
 * panels are sampled together in the CLOSED body frame; their paint stays one
 * continuous finish when the hinge opens. The roof and shoulder stay clean. */
export function finishCoachPaint(root: THREE.Object3D, paint: THREE.MeshPhysicalMaterial, axles: readonly number[], hub: number) {
  root.updateWorldMatrix(true,true); const inv=root.matrixWorld.clone().invert(), m=new THREE.Matrix4(), v=new THREE.Vector3();
  // Fine orange peel changes the width of the lacquer glint, never the base
  // hue. Use finish-space millimetres; no random salt-and-pepper sparkle.
  const size=32, bytes=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const a=tau*x/size,b=tau*y/size;
    const tone=Math.round(209+19*Math.cos(3*a+4*b)*Math.sin(2*b-a)+13*Math.sin(7*a-b)*Math.cos(3*b+a));
    bytes.set([tone,tone,tone,255],4*(y*size+x));
  }
  const peel=new THREE.DataTexture(bytes,size,size);peel.name='coachpaint/clear-lacquer';peel.wrapS=peel.wrapT=THREE.RepeatWrapping;
  peel.generateMipmaps=true;peel.minFilter=THREE.LinearMipmapLinearFilter;peel.magFilter=THREE.LinearFilter;peel.needsUpdate=true;
  paint.clearcoatRoughnessMap=peel; paint.vertexColors=true;
  root.traverse(o=>{
    if(!(o instanceof THREE.Mesh)||o.material!==paint)return;
    m.multiplyMatrices(inv,o.matrixWorld);const p=o.geometry.getAttribute('position'),uv=o.geometry.getAttribute('uv'), c=new Float32Array(p.count*3);
    for(let i=0;i<p.count;i++) {
      v.fromBufferAttribute(p,i).applyMatrix4(m);
      uv.setXY(i,(v.x+.53*v.y)/.056,(v.z+.61*v.y)/.056);
      const low=smooth((hub+.34-v.y)/.46), outside=smooth((Math.abs(v.x)-.58)/.24);
      let wake=0; if(low*outside>0) for(const axle of axles) wake=Math.max(wake,Math.exp(-((v.z-axle+.42)**2)/.11));
      const dust=outside*low*(.34+.51*wake+.10*Math.sin(v.z*13+v.y*17));
      c.set([1+dust*.18,1+dust*.025,1-dust*.12],i*3);
    }
    o.geometry.setAttribute('color',new THREE.BufferAttribute(c,3));
  });
}
