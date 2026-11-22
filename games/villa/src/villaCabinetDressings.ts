import { VillaModelBuilder } from './villaModel.js';
import * as THREE from 'three';
import { FittingSkin, IndexedFittingBuilder, formedTube, vessel, type Section, type XYZ } from './villaFittingGeometry.js';

type Outfit = 'dress' | 'coat' | 'blouse' | 'cardigan' | 'shirt' | 'trousers';
type Weave = 'oxford' | 'houndstooth' | 'herringbone' | 'pinstripe' | 'terry';

/** One repeat is 20cm of cut cloth. Yarn crossings survive at touching distance;
 * the woven check, twill direction or narrow chalk stripe survives mip filtering. */
export function wovenCloth(color: string, weave: Weave) {
  const n = 96, pixels = new Uint8Array(n * n * 4);
  for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) {
    const warp = u % 3, weft = v % 3, cross = ((u / 3 | 0) + (v / 3 | 0)) & 1;
    const knot = cross ? warp : weft, tread = ((u + (u % 48 >= 24 ? v : n - v)) % 12) < 5;
    const ink = weave === 'pinstripe' ? (u % 24 < 2 ? 41 : 0) + (u % 48 === 5 ? 18 : 0)
      : weave === 'houndstooth' ? ((((u / 12 | 0) + (v / 12 | 0)) & 1) ? 23 : tread ? 12 : 0)
      : weave === 'herringbone' ? (tread ? 23 : 0) : weave === 'terry' ? (warp === weft ? 15 : 3) : ((u / 6 | 0) % 2 ? 8 : 0);
    const slub = Math.sin((v * 17 + u * 11) * Math.PI * 2 / n) * 3;
    const value = Math.round(246 - ink - (knot === 0 ? 18 : knot === 1 ? 6 : 0) + slub), i = (u + n * v) * 4;
    pixels[i] = pixels[i+1] = pixels[i+2] = value; pixels[i+3] = 255;
  }
  const map = new THREE.DataTexture(pixels, n, n); map.name = `suite yarn/${weave}`;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(5, 5); map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter; map.magFilter = THREE.LinearFilter; map.anisotropy = 4; map.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ color, roughness: weave === 'pinstripe' ? .84 : .94, map });
  m.name = `Cut cloth/${weave}`; m.userData.fittedCloth = true; return m;
}

/** Timber is commissioned by the scene's own oak study. A shader that projects
 * world coordinates onto this row would make the grain slide when a leaf opens. */
export function fittedVeneer(color: string, tint: number) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: .74 });
  m.name = 'Fitted timber'; m.userData.villaInteriorFinish = 'oak'; m.userData.villaInteriorSwatchTint = tint; return m;
}

/** Chart each piece BEFORE it is placed/batched. U is along the long stock,
 * the flat door's rails turn 90 degrees relative to its stiles. V is cross-grain.
 * Short end cuts pick up the cross-section rather than the broad face's chart. */
export function fittedChart(g: THREE.BufferGeometry, mat: THREE.Material, offset = 0) {
  if (!mat.userData.villaInteriorFinish && !mat.userData.fittedCloth) return g;
  g.computeBoundingBox(); const box = g.boundingBox!, size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const p = g.getAttribute('position'), normal = g.getAttribute('normal'), uv = new Float32Array(2 * p.count);
  const wood = mat.userData.villaInteriorFinish === 'oak', cloth = mat.userData.fittedCloth;
  const long = size.x >= size.y && size.x >= size.z ? 0 : size.y >= size.z ? 1 : 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
    const face = nx > ny && nx > nz ? 0 : ny > nz ? 1 : 2;
    let u = face === 0 ? z : x, v = face === 1 ? z : y;
    if (wood) {
      const axis = g.userData.railAndStile ? (size.y/2 - Math.abs(y-mid.y) < size.x/2 - Math.abs(x-mid.x) ? 0 : 1) : long;
      if (face !== axis) {
        u = axis === 0 ? x : axis === 1 ? y : z;
        v = (face !== 0 && axis !== 0) ? x : (face !== 1 && axis !== 1) ? y : z;
      } else { u *= .53; v += u * .41; }
    } else if (cloth && size.y > size.z && size.y > size.x * .43) { u = x + (Math.abs(z - mid.z) * (nx > .75 ? .32 : .024)); v = y; }
    // The commissioned oak is one 1.80m × .18m board face, not a square
    // image projected once across a wardrobe. A floating panel's reverse is
    // a different veneer leaf, not the outside grain showing through.
    if (wood) {
      u /= 1.8; v /= .18;
      if (g.userData.veneerLayup && normal.getZ(i) < -.6) { u += .413; v = .721 - v; }
    }
    uv[2*i] = u + offset; uv[2*i+1] = v + offset * .271;
  }
  g.setAttribute('uv',new THREE.BufferAttribute(uv,2)); return g;
}
export class FittedCaseBuilder extends IndexedFittingBuilder {
  override geometry(g: THREE.BufferGeometry, m: THREE.Material, pos: XYZ = [0,0,0], rot: XYZ = [0,0,0]) {
    super.geometry(fittedChart(g, m, pos[0]*.773 + pos[1]*.213 + pos[2]*.71), m, pos, rot);
  }
}

type Row = readonly [w: number, y: number, depth: number, fullness: number, cx?: number, cz?: number];
/** Sewn tubular panels; pleats move out of phase at the hem and around the
 * hip instead of running uniformly from a squeezed neck to a cone. */
function clothRings(rows: readonly Row[], phase: number, sides = 18) {
  const skin = new FittingSkin(); let last: number[] | undefined;
  for (const [w,y,d,fall,cx=0,cz=0] of rows) {
    const ring = Array.from({length: sides}, (_,i)=> {
      const a = i * Math.PI*2 / sides, c = Math.cos(a), s = Math.sin(a), ripple = Math.cos(6*a + phase + .9*y) + .48*Math.sin(3*a - 1.35*y);
      return skin.point(cx + w*c + c*fall*.005*ripple, y + fall*(.012*Math.sin(a+phase) + .006*Math.cos(3*a)),
        cz + d*s + fall*(.013*Math.sin(a*6+phase+y)+.006*Math.cos(a*2-y)));
    }); if(last) skin.join(last,ring); last = ring;
  } return skin.geometry();
}
/** Collar, facing or patch with a turned-under outer edge. Coordinates are the
 * cut pattern on the front of the garment, not a colour printed on its chest. */
function facing(points: XYZ[], thickness = .002) {
  const shape = new FittingSkin(), front = points.map(p=>shape.point(...p)), back = points.map(([x,y,z])=>shape.point(x,y,z-thickness));
  for(let i=1;i<front.length-1;i++){shape.face(front[0], front[i], front[i+1]); shape.face(back[i+1],back[i],back[0]);}
  shape.join(back,front); return shape.geometry();
}

export function hangingGarment(b: VillaModelBuilder, x: number, shoulder: number, z: number, style: Outfit,
  fabric: THREE.Material, lining: THREE.Material, button: THREE.Material, phase: number, size = 1, breadth = 1.82) {
  const sx = size * breadth / 1.82, add = (g: THREE.BufferGeometry, m: THREE.Material) => b.geometry(g.scale(sx,size,size),m,[x,shoulder,z]);
  const dress = style === 'dress', coat = style === 'coat', knit = style === 'cardigan', blouse = style === 'blouse';
  // A skirt or pair of trousers sharing a hanger is clipped lengthwise and
  // compressed inside the upper garment. Let it open below the free hem; a
  // full-width waistband would cut visibly through the cardigan's flanks.
  const tuckedInto = (g: THREE.BufferGeometry, hem: number) => {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const t = THREE.MathUtils.smoothstep(p.getY(i), hem - .14, hem - .012);
      p.setX(i, p.getX(i) * (1 - .37 * t)); p.setZ(i, p.getZ(i) * (1 - .57 * t) - .001 * t);
    }
    g.computeVertexNormals(); return g;
  };
  const trousers = (m: THREE.Material, tucked: boolean) => {
    const back = tucked ? -.008 : .003;
    const lower = (g: THREE.BufferGeometry) => add(tucked ? tuckedInto(g, -.52) : g, m);
    for(const side of [-1,1]) {
      const s=side, end= -.89-.038*(s+1);
      lower(clothRings([[.053,end+.014,.030,.20,.068*s,back+.014*s],[.055,end,.032,.28,.068*s,back+.014*s],
        [.059,-.68,.032,.58,.064*s,back],[.053,-.52,.038,.30,.06*s,back+.012*s],[.069,-.29,.044,.31,.061*s,back],
        [.071,-.22,.039,.17,.06*s,back]],phase+s,12));
    }
    lower(clothRings([[.133,-.25,.04,.11,0,back],[.138,-.16,.044,.22,0,back],[.127,-.079,.035,.12,0,back],
      [.126,-.071,.034,.02,0,back],[.127,-.039,.034,0,0,back],[.121,-.039,.028,0,0,back],[.121,-.049,.028,0,0,back]],phase,14));
    // Spring jaws straddle the waistband. Upper tongue curls around the trouser bar.
    for(const dir of [-1,1]) { const side = dir * (tucked ? .65 : 1); add(formedTube([[side*.095,-.059,.038,.004,.010],[side*.095,-.043,.032,.004,.010],
      [side*.095,-.034,.006,.004,.010],[side*.095,-.033,-.001,.003,.010],[side*.095,-.040,-.006,.003,.010],
      [side*.095,-.052,-.004,.004,.010]],5,0,[1,0,0]),button); }
  };
  if(style==='trousers'){ trousers(fabric,false); return; }
  const hem = dress ? -1.09 : coat ? -.84 : knit ? -.52 : blouse ? -.42 : -.55;
  const sweep = dress ? .187 : coat ? .157 : knit ? .122 : .135, waist = dress ? .085 : coat ? .125 : .107;
  if(knit) trousers(lining,true);
  if(blouse) add(tuckedInto(clothRings([[.154,-.86,.044,.72],[.159,-.873,.048,.78],[.155,-.84,.047,.84],
    [.143,-.61,.054,.92],[.116,-.40,.046,.42],[.123,-.25,.043,.18],[.112,-.063,.028,0]],phase+.3,16),hem),lining);
  // Upper skirt and coat have real ease, lower dropped shoulder, collar bore and return.
  const torso = clothRings([[sweep-.006,hem+.016,.044,.73],[sweep,hem,.046,.77],[sweep-.001,hem+.022,.046,.77],
    [sweep*.94,hem*.78,.054,.94],[waist,hem*.47,.039,.42],[.122,-.17,.057,.24],[.142,-.081,.052,.10],
    [.158,-.034,.019,.018],[.097,-.014,.024,.01],[.055,.003,.024,0],[.051,.005,.020,0],[.050,-.014,.019,0]],phase);
  const neck = torso.getAttribute('position');
  for (let i=0; i<neck.count; i++) {
    const x=neck.getX(i), y=neck.getY(i), z=neck.getZ(i);
    if(y>-.029 && z>0) neck.setY(i, y-(dress ? .046 : .027)*Math.max(0,1-Math.abs(x)/.059)*Math.min(1,z/.020));
  }
  torso.computeVertexNormals(); add(torso,fabric);
  for(const side of [-1,1]) {
    const s=side, cuff=coat ? -.588 : dress ? -.216 : blouse ? -.305 : -.534;
    const pose = .004*Math.sin(phase+s), reach = (coat ? .022 : .016) + .014 * Math.sin(phase * 1.7 + s);
    add(clothRings([[.023,cuff+.024,.020,.1,s*.155,reach],[.025,cuff,.022,.11,s*.155,reach],
      [.034,cuff+.004,.028,.14,s*.155,reach],[.033,cuff+.051,.030,.22,s*.159,reach-.004],
      [blouse ? .041 : .033, cuff*.48,.035,.50,s*(.152+pose),reach-.013],[.042,-.083,.041,.21,s*.151,.001],
      [.032,-.049,.031,.04,s*.148,-.001],[.017,-.033,.014,0,s*.149,-.001]], phase+s,10),fabric);
    if(!dress) {
      const end = coat ? -.224 : knit ? -.16 : -.081;
      const lapel: XYZ[]=[[s*.050,.005,.019],[s*.010,end,coat ? .061 : .057],[s*(coat ? .085 : .058),end*.52,.053],[s*.056,-.058,.051],[s*.077,-.044,.043]];
      add(facing(s > 0 ? lapel : lapel.reverse()),coat||knit ? fabric : lining);
    }
  }
  if(coat || knit) {
    // A folded welt slopes into the pocket. One in-seam pocket on a cardigan, two flaps on the coat.
    for(const s of (coat?[-1,1]:[1])) {
      const h = coat ? -.41 : -.34, flap:XYZ[]=[[s*.064,h-.005,.045],[s*.111,h+.014,.032],[s*.108,h+.037,.031],[s*.061,h+.017,.046]];
      add(facing(s>0?flap:flap.reverse(),.003),fabric);
    }
  }
  if(dress) {
    const sash = clothRings([[.097,-.536,.046,.42],[.095,-.523,.046,.42],[.094,-.496,.046,.42],[.097,-.470,.047,.42]],phase);
    add(sash,lining);
    add(facing([[-.061,-.503,.035],[-.096,-.716,.045],[-.060,-.704,.053],[-.046,-.501,.040]]),lining);
  } else {
    for(let i=0;i<(coat?2:3);i++) {
      const y = (coat ? -.262 : -.118)-i*(coat?.15:.092), zz = coat?.045:.052;
      add(new THREE.CylinderGeometry(coat?.008:.005,coat?.009:.0055,.004,7).rotateX(Math.PI/2).translate(coat?.018:0,y,zz),button);
    }
  }
}

/** A load-bearing maple shoulder and separately oriented hook: rotating the
 * garment on its rod does not rotate the hook's bore out of alignment. */
export function hanger(b: VillaModelBuilder, x: number, y: number, z: number, width: number, wood: THREE.Material, metal: THREE.Material, yaw = 0, drop = .075, railRadius = .012) {
  const r = railRadius+.002, wire = .0026;
  b.geometry(formedTube([[0,-drop+.019,0,wire],[0,-.023,0,wire],[0,-.008,-r*.88,wire],
    [0,.003,-r,wire],[0,r*.84,-r*.57,wire],[0,r,0,wire],[0,r*.78,r*.62,wire],[0,.002,r,wire],[0,-.008,r*.90,wire]],7,0,[1,0,0]).rotateY(-yaw),metal,[x,y,z]);
  b.geometry(formedTube([[-width,-drop-.040,.001,.006,.014],[-width*.88,-drop-.035,0,.008,.015],[-width*.5,-drop-.015,0,.008,.012],
    [0,-drop+.014,0,.010,.009],[width*.5,-drop-.015,0,.008,.012],[width*.88,-drop-.035,0,.008,.015],[width,-drop-.040,.001,.006,.014]],7,0,[0,0,1]),wood,[x,y,z]);
  b.beam([x-width,y-drop-.040,z],[x+width,y-drop-.040,z],.0038,metal,7);
}

/** Irregular low-top upper, heel counter and a real ankle opening descending to an insole. */
export function shoe(b: VillaModelBuilder, x: number, y: number, z: number, upper: THREE.Material, sole: THREE.Material, scale = 1) {
  const add = (rows: Section[], m: THREE.Material) => b.geometry(vessel(rows, 12, .86).scale(scale, scale, scale), m, [x, y, z]);
  add([[0, 0], [.045, 0, .106, 0, .006], [.046, .010, .106, 0, .006], [.044, .014, .104, 0, .006], [0, .014]], sole);
  add([[.043, .010, .102, 0, .006], [.044, .019, .101, 0, .006], [.042, .031, .096, 0, .004],
    [.037, .042, .072, 0, -.013], [.032, .063, .045, 0, -.040], [.027, .061, .039, 0, -.040],
    [.023, .028, .035, 0, -.040], [0, .024, 0, 0, -.04]], upper);
}
