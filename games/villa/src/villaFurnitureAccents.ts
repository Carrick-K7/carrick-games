import * as THREE from 'three';
import { bent, board, casting, circleXY, loft, oval, rectRing, rectXY, sheet, stock, turn, type FurnitureKit, type Point } from './villaFurnitureForms.js';
import { prunedPrivet } from './villaHedgePrivet.js';
import { teapot } from './villaInteriorKitchen.js';
import { drainingBoat } from './villaKilnFinish.js';
import { coupe, ironKettle, liddedCaddy, teaCloth, thrownCup } from './villaKilnTable.js';
import { pantryPart } from './villaPantryFinish.js';
import { NatureMesh, add3, collar, mix3, polar } from './villaNatureGeometry.js';
import { HOUSE_PRINT, printChart } from './villaDomesticArt.js';

export function woolRug(w: number, d: number, h: number, hand?: number) {
  const hem = .026, us = [-1, -1 + hem / w * 2, -.88, 0, .88, 1 - hem / w * 2, 1], vs = [-1, -1 + hem / d * 2, -.84, 0, .84, 1 - hem / d * 2, 1];
  if (hand !== undefined) return sheet(us, vs, (u, v, under) => {
    const a = Math.abs(u), b = Math.abs(v), corner = a ** 10 * b ** 10;
    const roll = h * (.14 + .42 * Math.exp(-(((u + .78) / .21) ** 2 + ((v - .92) / .17) ** 2)));
    const lifted = corner * .003 * (1 + Math.cos(hand + 2 * u - 3 * v));
    const selvedge = .008 * Math.sin(4.1 * v + hand) + .004 * Math.cos(8.7 * v - hand);
    return [u * (w / 2 - .021 * corner) + selvedge * a ** 6,
      lifted + (under ? -h * .44 : a === 1 || b === 1 ? roll : h * (.41 - .052 * Math.exp(-((v * 2.3 + .21) ** 2)))), v * (d / 2 - .023 * corner)];
  });
  return sheet(us, vs, (u, v, under) => {
    const edge = Math.abs(u) === 1 || Math.abs(v) === 1, tip = Math.abs(u * v) === 1 ? .016 : 0;
    const y = under ? -h * .46 : edge ? h * .14 : h * (.40 + .065 * Math.sin(u * 3.3 + v * 1.9));
    return [u * (w * .5 - tip), y, v * (d * .5 - tip)];
  });
}

/** Paired knotted warp ends. Baked into one small strip per short edge, not a
 * draw call or cylinder per thread. All tips end inside the inherited footprint. */
export function rugFringe(w: number, d: number, h: number, hand?: number) {
  const xyz: number[] = [], uv: number[] = [], ids: number[] = [], n = Math.min(42, Math.round(w / .135));
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
    const x = w * ((i + .5) / n - .5), z = side * (d / 2 - .061), base = xyz.length / 3;
    const drift = hand === undefined ? 0 : .010 * Math.sin(.73 * i + hand + side);
    const reach = hand === undefined ? .050 + Math.sin(i * 2.41) * .006 : .047 + drift + .004 * Math.cos(i * 2.35);
    const tip = x + .008 * Math.sin(i * 1.4) + drift;
    const path = [[x - .014, h * .13, z - side * .003], [x + .013, h * .13, z - side * .003],
      [x - .009, -h * .01, z + side * .017], [x + .008, -h * .01, z + side * .017],
      [tip - .012, -h * .26, z + side * reach], [tip + .002, -h * .23, z + side * reach * .94], [tip + .010, -h * .27, z + side * reach * .89]];
    for (const [xx, yy, zz] of path) { xyz.push(xx, yy, zz); uv.push(xx * 3, zz * 3); }
    const tris = [[0, 2, 1], [1, 2, 3], [2, 4, 5], [3, 2, 5], [3, 5, 6]];
    for (const [a, b, c] of tris) ids.push(base + a, base + (side > 0 ? b : c), base + (side > 0 ? c : b));
  }
  const g = new THREE.BufferGeometry(); g.setIndex(ids); g.setAttribute('position', new THREE.Float32BufferAttribute(xyz, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}

export function pebble(w: number, h: number, d: number, seed: number) {
  const ring = (s: number, y: number, dx: number) => oval(w * s, d * s, y * h, 8).map(([x, yy, z], i): Point => {
    const a = i * .785 + seed, s = 1 + .105 * Math.cos(a * 3 + seed);
    return [x * s + dx * w, yy + .040 * h * Math.sin(a * 2), z * s];
  });
  return loft([ring(.54, -.45, -.044), ring(.94, -.19, -.037), ring(1, .05, .016), ring(.71, .38, .055), ring(.32, .48, .075)]);
}

export function topiary(k: FurnitureKit, halfWidth: number, height: number, variant: number, material: THREE.Material) {
  prunedPrivet(k, halfWidth, height, variant, material);
}

export function cueStand(k: FurnitureKit, mahogany: THREE.Material) {
  const { put, m } = k;
  for (const z of [-.444, .444]) put(casting([[-.048, .209], [.049, .209], [.056, 1.576], [.024, 1.642], [-.025, 1.642], [-.054, 1.574]], .072), mahogany, 16.838, 0, -12 + z, 0, Math.PI / 2);
  for (const [y, r, d] of [[.296, .025, .096], [1.518, .018, .041]]) {
    const apertures = Array.from({ length: 5 }, (_, i) => circleXY(-.055, -.4 + i * .20, r, 12));
    put(casting(rectXY(.249, 1.071, .031), d, apertures), mahogany, 16.728, y, -12, -Math.PI / 2);
  }
  put(board(.222, 1.030, .034, .037), m.oak, 16.728, .252, -12);
  for (let i = 0; i < 5; i++) {
    const z = -12.4 + i * .20;
    put(turn([[0, .265], [.019, .265], [.022, .278], [.021, .306], [.020, .521], [.017, .873], [.016, .937], [0, .937]], 8), mahogany, 16.673, 0, z);
    put(turn([[.016, .925], [.017, .932], [.016, .944], [.008, 1.568], [0, 1.568]], 8), m.oak, 16.673, 0, z);
    put(turn([[.008, 1.565], [.008, 1.588], [.007, 1.596], [0, 1.596]], 8), m.cream, 16.673, 0, z);
    put(turn([[.007, 1.594], [.007, 1.602], [.005, 1.605], [0, 1.606]], 8), m.blue, 16.673, 0, z);
  }
}

export function teaFurniture(k: FurnitureKit) {
  const { m, put, at } = k;
  // Low kang table: inward-sweeping feet and carved cloud brackets under its
  // floating top; the dark serving tray has a shallow continuous raised rim.
  for (const s of [-1, 1]) {
    const foot = [[-.510, .012], [-.372, .012], [-.292, .074], [-.272, .204], [-.210, .272], [-.135, .288], [.135, .288], [.210, .272], [.272, .204], [.292, .074], [.372, .012], [.510, .012], [.489, .048], [.38, .092], [.371, .211], [.439, .318], [.510, .354], [.510, .391], [-.510, .391], [-.510, .354], [-.439, .318], [-.371, .211], [-.38, .092], [-.489, .048]];
    put(casting(foot, .114), m.walnut, s * .688, 0, 0, 0, Math.PI / 2);
  }
  put(board(1.902, 1.241, .065, .070, .031), m.walnut, 0, .401, 0);
  // Recessed end splines lock each trestle into the aprons. The tabletop is
  // intentionally visible around two separate working zones: hot iron and tea.
  for (const s of [-1, 1]) {
    k.box(0, .345, s * .445, 1.38, .062, .030, m.walnut, 0);
    for (const x of [-.752, .752]) k.box(x, .343, s * .444, .015, .017, .045, m.oak, 0);
  }
  const top = .4335, deck = top + .042;
  at(-.563, top, -.085, -.52, () => ironKettle(k));
  at(.264, top, -.032, 0, () => drainingBoat((g, mat, x = 0, y = 0, z = 0) => put(g, mat, x, y, z), 1.046, .595, 12, m.oak, m.dark));
  at(.073, deck, -.095, -.34, () => teapot(k, m.terra, .75));
  for (const [x, z] of [[.36, .125], [.53, .138], [.59, -.036]]) thrownCup(k, x, deck, z, .051, .052, 'celadon', 12);
  at(-.414, top, .309, .06, () => { teaCloth(k, .274, .147, .024); put(stock([[0, .020, -.035, .006], [.095, .021, -.026, .008], [.158, .023, -.008, .011]], 6), m.oak, -.10, 0, 0); });
  // The fairness pitcher has its own flared mouth and proud pour point.
  const lip = turn([[0, .003], [.031, .003], [.033, 0], [.046, 0], [.048, .012], [.067, .044], [.070, .086], [.062, .107],
    [.061, .118], [.065, .127], [.064, .132], [.059, .133], [.056, .126], [.055, .110], [.062, .085], [.058, .045], [.039, .022], [0, .018]], 16);
  const p = lip.getAttribute('position'); for (let i = 0; i < p.count; i++) { const nose = Math.max(0, p.getX(i) / .065) ** 7 * Math.max(0, (p.getY(i) - .102) / .031); p.setX(i, p.getX(i) + .021 * nose); p.setY(i, p.getY(i) + .008 * nose); }
  lip.computeVertexNormals(); pantryPart(k, lip, 'oatmeal', .59, deck, -.207, 0, .44, 0, 'turned');
}
export function teaShelf(k: FurnitureKit) {
  const { put, m } = k;
  for (const z of [-1.446, 1.446]) {
    const side = [[-.15, 0], [-.088, 0], [-.065, .084], [.070, .084], [.097, 0], [.161, 0], [.161, 1.98], [.117, 2.07], [-.15, 2.07]];
    put(casting(side, .065), m.walnut, 0, 0, z);
  }
  // Three pierced back panels reveal the backing wall through moon windows.
  for (let i = -1; i <= 1; i++) put(casting(rectXY(.953, 1.937, .021, 0, 1.095), .033, [circleXY(0, 1.32, .302, 16)]), m.walnut, -.15, 0, i * .966, 0, Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const y = .331 + i * .52; put(board(.339, 2.857, .048, .030, .014), m.oak, .026, y, 0);
    const base = y + .024;
    if (i === 0) {
      // Lacquer boxes on plinths, and tea cloths ready to be taken down.
      for (const [z, w] of [[-.83, .40], [-.20, .28]]) {
        put(board(.235, w, .106, .018, .005), m.walnut, .035, base + .053, z);
        put(board(.244, w + .012, .018, .018, .004), m.oak, .035, base + .115, z);
      }
      k.at(.050, base, .79, .05, () => teaCloth(k, .232, .352, .046));
    } else if (i === 1) {
      liddedCaddy(k, .04, base, -.95, .079, .186, 'ochre'); liddedCaddy(k, .04, base, -.68, .068, .151, 'tenmoku');
      coupe(k, .06, base, .30, .115, .034, 'celadon', 14); thrownCup(k, .06, base, .81, .060, .087, 'celadon', 12);
    } else if (i === 2) {
      // The taller storage pieces flank the open moon window rather than
      // marching in a row in front of it. Their shoulders and lids differ.
      liddedCaddy(k, .027, base, -.86, .103, .223, 'celadon'); liddedCaddy(k, .047, base, .97, .083, .143, 'ochre');
      coupe(k, .045, base, .60, .115, .062, 'oatmeal', 12);
    } else {
      liddedCaddy(k, .034, base, -.92, .084, .150, 'oatmeal');
      for (const z of [.55, .80]) thrownCup(k, .044, base, z, .062, .078, 'oatmeal', 12);
    }
  }
}

/** Chinese elm on its root flare. Fine shoots carry alternate, pointed leaves;
 * loose treetops are not solid green stones balanced on a trunk. */
export function bonsai(k:FurnitureKit){
  const {m,put}=k;
  for(const sx of [-1,1])for(const sz of [-1,1])k.put(casting([[-.023,0],[.026,0],[.056,.077],[.043,.165],[.028,.270],[-.012,.270],[-.030,.214],[-.014,.088]],.038),m.walnut,sx*.154,0,sz*.112,0,sx>0?0:Math.PI);
  for(const sx of [-1,1])k.box(sx*.154,.126,0,.021,.027,.220,m.walnut,0);
  put(board(.414,.301,.034,.039,.014),m.walnut,0,.277,0);
  const potBase=.294;
  put(loft([oval(.292,.201,potBase,14),oval(.375,.267,potBase+.036,14),oval(.435,.310,potBase+.094,14),oval(.452,.320,potBase+.106,14),oval(.444,.309,potBase+.119,14),oval(.415,.285,potBase+.119,14),oval(.391,.266,potBase+.083,14)],true,false),m.blue,0,0,0);
  const base=potBase+.106;
  put(loft([oval(.406,.278,base-.009,14),oval(.362,.237,base-.001,14),oval(.139,.109,base+.007,14)],false,true),m.soil,0,0,0);
  const wood=new NatureMesh(),old=new NatureMesh(),fresh=new NatureMesh();old.membrane=fresh.membrane=true;
  const trunk:Point[]=[[-.070,base+.002,-.016],[-.045,base+.074,-.023],[.033,base+.125,-.005],[.076,base+.193,.016],[.037,base+.275,.030],[-.028,base+.344,.022],[-.058,base+.412,-.003],[-.013,base+.489,-.023],[.045,base+.545,-.016]];
  wood.stem(trunk.map((v,i)=>collar(v,[.041,.035,.030,.026,.022,.018,.014,.010,.005][i])),8,.115,.2,true);
  for(let j=0;j<5;j++){const tip=add3(trunk[0],polar(j*1.31,.071+.012*(j%2),-.003));wood.stem([collar(trunk[1],.015),collar(mix3(trunk[0],tip,.46),.011),collar(tip,0)],5,.09,.18,true);}
  const leaders:[number,number,number][]=[[2,2.95,.193],[3,.04,.197],[4,1.49,.152],[5,3.56,.150],[6,-.53,.143],[7,2.17,.113],[8,.66,.102]];
  for(const [i,a,reach] of leaders){
    const socket=trunk[i], elbow=add3(socket,polar(a,reach*.52,.046)),tip=add3(socket,polar(a+.07,reach,.027));
    wood.stem([collar(socket,.014-i*.0009),collar(elbow,.007),collar(tip,.003)],6,.06,a,true);
    for(let j=0;j<4;j++){
      const foot=mix3(elbow,tip,j*.25),az=a+(j%2?1:-1)*(.59+.12*j),end=add3(foot,polar(az,.061+.006*j,.035+.007*(j%2)));
      wood.stem([collar(foot,.0027),collar(end,0)],4,0,0,true);
      for(let t=0;t<6;t++){
        const leaf=(j+t+i)%5>1?old:fresh, p=mix3(foot,end,.22+t*.146), dir=az+(t%2?.96:-1.21);
        leaf.blade(p,polar(dir,.027+.005*((i+j)%3),.008+.012*(t/6)),.011,[[.19,.76],[.41,1],[.57,.88],[.68,.77]],.004,dir*.23,.17,.002);
      }
    }
  }
  for(const [mesh,mat] of [[wood,m.walnut],[old,m.leaf],[fresh,m.leafLight]] as const)put(mesh.geometry(),mat,0,0,0);
}

export function writingSet(k:FurnitureKit,guest=false,press?:THREE.Material){
  const {put,m}=k,w=guest?.529:.449,d=guest?.339:.301, columns=[-1,-.83,-.57,-.31,-.10,-.025,0,.034,.13,.39,.69,.91,1], rows=[-1,.15,1];
  put(board(w+.029,d+.021,.009,.015,.003),guest?m.sage:m.walnut,0,.0045,0);
  const page=(u:number,v:number,under:boolean):Point=>{const a=Math.abs(u);return [u*w/2,under?.0095:.019+.029*Math.sin(Math.PI*Math.sqrt(a))+.007*a+.003*v*a,v*d/2+.005*(1-a)*v];};
  const block=sheet(columns,rows,page),ids=Array.from(block.index!.array),topVertices=columns.length*rows.length;
  const sides:number[]=[];for(let i=0;i<ids.length;i+=3)if(ids[i]>=topVertices||ids[i+1]>=topVertices||ids[i+2]>=topVertices)sides.push(ids[i],ids[i+1],ids[i+2]);
  block.setIndex(sides);put(block,m.cream,0,0,0);
  const surface=sheet(columns,rows,page,true);put(press?printChart(surface,guest?HOUSE_PRINT.letter:HOUSE_PRINT.notes,true):surface,press??m.cream,0,0,0);
  // A ceramic reservoir with a clear throat and a pen with an actual nib. The
  // pen lies in the groove of its rest instead of balancing upright in space.
  k.at(w*.5+.145,0,-.022,guest?-.14:.08,()=>{
    if(!guest){
      put(turn([[0,0],[.037,0],[.046,.009],[.048,.050],[.036,.065],[.023,.069],[.021,.081],[.025,.085],[.019,.086],[.015,.074]],12),m.blue,0,0,-.091);
      put(turn([[.016,.076],[0,.076]],10),m.dark,0,0,-.091);
    }
    for(const dz of [-.047,.036])put(casting([[-.025,0],[.025,0],[.025,.015],[.014,.027],[.007,.019],[0,.016],[-.008,.019],[-.016,.027],[-.025,.014]],.012),m.brass,0,0,dz);
    put(turn([[0,0],[.0065,.005],[.0078,.040],[.0064,.115],[.005,.136]],8),m.dark,0,.022,.087,-Math.PI/2);
    put(turn([[.005,.129],[.006,.136],[.002,.150],[0,.156]],7),m.brass,0,.022,.087,-Math.PI/2);
  });
}
