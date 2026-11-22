import * as THREE from 'three';
import { bent, board, casting, loft, rail, sheet, stock, turn, type FurnitureKit, type Ring } from './villaFurnitureForms.js';
import { indoorTeaSetting } from './villaKilnTable.js';
import { seatPad } from './villaFurnitureTextiles.js';
import { along, cabinetCarcase } from './villaCabinetmaker.js';
export { sewnVolume as boundBook, libraryCase as bookcase } from './villaLibrary.js';

/** Drawbored trestle, with an eased overhanging edge, shouldered feet and an
 * actual through-stretcher beneath the top. Small side tables get tripod feet. */
export function joineryTable(k: FurnitureKit, w: number, d: number, h: number, top: THREE.Material) {
  const { put, m, box } = k, thick = Math.min(.09, h * .15);
  put(board(w, d, thick, Math.min(.16, d * .15), .043), top, 0, h - thick / 2, 0);
  if (w < .8) {
    put(turn([[0, .025], [.062, .025], [.077, .065], [.055, .13], [.037, h * .65], [.068, h - thick], [0, h - thick]], 12), m.walnut, 0, 0, 0);
    for (let i = 0; i < 3; i++) k.at(0, 0, 0, i * 2 * Math.PI / 3, () => bent(k, m.walnut, [[0, .19, 0, .039], [0, .10, d * .22, .034], [0, .025, d * .43, .026]]));
  } else {
    const half = d * .414, leg = Math.min(.095, w * .12);
    for (const x of [-w * .34, w * .34]) {
      // End elevation sawn as one continuous fork. No fictitious solid apron between the sitter's knees.
      const outline = [[-half, 0], [-half + leg, 0], [-half * .38, h * .46], [half * .38, h * .46], [half - leg, 0], [half, 0],
        [half * .63, h * .55], [half * .84, h - thick], [half * .55, h - thick], [half * .31, h * .62], [-half * .31, h * .62],
        [-half * .55, h - thick], [-half * .84, h - thick], [-half * .63, h * .55]];
      put(casting(outline, leg), m.walnut, x, 0, 0, 0, Math.PI / 2);
      for (const z of [-half * .59, half * .59]) put(turn([[0, 0], [.015, 0], [.017, .008], [0, .012]], 8), m.oak, x + leg / 2, h * .54, z, 0, 0, -Math.PI / 2);
    }
    box(0, h * .54, 0, w * .74, .069, .087, m.oak, 0);
    for (const z of [-d * .28, d * .28]) box(0, h - thick - .029, z, w * .78, .061, .065, m.walnut, 0);
  }
}

export function diningChair(k: FurnitureKit, upholstery: THREE.Material, stool = false) {
  const { m, put } = k, h = stool ? .71 : .44, s = stool ? .82 : 1;
  // Rear legs continue into the back stiles; the shoulder blade is laminated
  // in two curves, a concave face on the sitter and a convex, finished rear.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const points: [number, number, number, number][] = [[sx * .246 * s, 0, sz * .238 * s, .025], [sx * .246 * s, .018, sz * .238 * s, .026],
      [sx * .243 * s, .065, sz * .232 * s, .029], [sx * .195 * s, h * .71, sz * .19 * s, .035], [sx * .216 * s, h, sz * .202 * s, .038]];
    if (sz === 1 && !stool) points.push([sx * .231, .68, .23, .029], [sx * .249, .92, .269, .027], [sx * .246, 1.012, .271, .026]);
    bent(k, m.walnut, points);
  }
  put(board(.590 * s, .588 * s, .056, .105, .023), m.oak, 0, h, 0);
  put(seatPad(.615 * s, .602 * s, stool ? .094 : .126, .23), upholstery, 0, h + .049, -.011);
  if (stool) {
    for (const sx of [-1, 1]) rail(k, [sx * .178, .28, -.176], [sx * .178, .28, .176], .014, m.brass);
    for (const sz of [-1, 1]) rail(k, [-.182, .28, sz * .176], [.182, .28, sz * .176], .014, m.brass);
  } else {
    const blade = sheet([-1, -.88, -.57, 0, .57, .88, 1], [-1, -.80, .12, .85, 1], (u, v, under) => {
      const edge = Math.abs(u), z = .286 - .119 * u * u - .010 * (1 - v) + (under ? .018 : -.018);
      return [u * (.30 - .013 * v * v), -z, .903 + .135 * v + .038 * (1 - edge * edge) - .026 * edge ** 4 * v];
    });
    put(blade, m.oak, 0, 0, 0, -Math.PI / 2);
    // A bifurcated bentwood splat rather than a filled rectangular back.
    for (const sx of [-1, 1]) bent(k, m.walnut, [[sx * .033, .474, .206, .018], [sx * .045, .566, .217, .018], [sx * .084, .696, .238, .016], [sx * .146, .85, .251, .015]]);
  }
}

export function bench(k: FurnitureKit, w: number, d: number, seatY: number, fabric: THREE.Material) {
  const { m, put } = k;
  for (const x of [-w * .37, w * .37]) {
    const p = [[-d * .44, 0], [-d * .30, 0], [-d * .20, seatY * .55], [d * .20, seatY * .55], [d * .30, 0], [d * .44, 0],
      [d * .31, seatY * .76], [d * .37, seatY - .065], [-d * .37, seatY - .065], [-d * .31, seatY * .76]];
    put(casting(p, .083), m.oak, x, 0, 0, 0, Math.PI / 2);
  }
  k.box(0, seatY * .63, 0, w * .81, .062, .073, m.walnut, 0);
  put(board(w, d, .064, .065), m.walnut, 0, seatY - .085, 0);
  put(seatPad(w - .012, d, .145), fabric, 0, seatY, 0);
}

export function pull(k: FurnitureKit, x: number, y: number, z: number, span: number, projection: number, metal: THREE.Material, vertical = false) {
  const g = stock([[-span / 2, 0, 0, .009], [-span / 2, 0, projection * .68, .011], [-span * .43, 0, projection, .014], [span * .43, 0, projection, .014], [span / 2, 0, projection * .68, .011], [span / 2, 0, 0, .009]], 8);
  k.put(g, metal, x, y, z, 0, 0, vertical ? Math.PI / 2 : 0);
}
/** A breakfront with actual carcase panels and feet, not a cabinet-sized solid.
 * Its front is +Z; keep handles within the caller's allowed depth. */
export function cabinet(k: FurnitureKit, w: number, d: number, h: number, count: number, face: THREE.Material, top: THREE.Material) {
  cabinetCarcase(k,w,d,h,count,face,top);
}

export type HouseLamp = 'standard' | 'swing' | 'lantern' | 'bedside';
export function shade(top:number,bottom:number,h:number,pleated=true){
  const n=pleated?24:16;
  const ring=(r:number,y:number):Ring=>Array.from({length:n},(_,i)=>{const a=-i*2*Math.PI/n, rr=r+(pleated?(i%2?-.003:.004):0);return [rr*Math.cos(a),y,rr*Math.sin(a)];});
  // Separate inner return and wired hems. The hole above the harp stays open.
  return loft([ring(bottom-.006,-h/2+.006),ring(bottom,-h/2),ring(top,h/2),ring(top-.007,h/2-.001),ring(bottom-.006,-h/2+.006)],false,false);
}
export function lightFixture(k:FurnitureKit,tall:boolean,style:HouseLamp='standard'){
  const {put,m}=k,h=tall?1.65:.485;
  if(style==='swing'){
    // Counterweighted task light: pivot pin, a bent arm entering the reflector
    // from its back, and a white vitreous lining. Shade opens onto the reader.
    const end=tall?1.38:.374, scale=tall?1:.71;
    put(turn([[0,0],[.182*scale,0],[.198*scale,.014],[.188*scale,.031],[.071*scale,.047],[.032,.055]],14),m.brass,0,0,0);
    put(turn([[.026,.043],[.024,.101],[.014,end-.032],[.025,end],[.024,end+.024]],9),m.black,0,0,0);
    put(stock([[0,end,0,.019],[.087*scale,end+.051*scale,0,.016],[.257*scale,end+.125*scale,-.005,.013],[.313*scale,end+.111*scale,.007,.013],[.320*scale,end+.071*scale,.013,.014]],7),m.brass,0,0,0);
    const depth=.192*scale,rx=.24,rz=.23,axis=new THREE.Vector3(0,1,0).applyEuler(new THREE.Euler(rx,0,rz));
    const p=new THREE.Vector3(.320*scale,end+.071*scale,.013).addScaledVector(axis,-depth);
    put(turn([[.197*scale,-.007],[.195*scale,0],[.163*scale,.042*scale],[.073*scale,depth*.53],[.051*scale,depth*.87],[.027*scale,depth]],16),m.sage,p.x,p.y,p.z,rx,0,rz);
    put(turn([[.041*scale,depth*.51],[.071*scale,depth*.49],[.157*scale,.041*scale],[.193*scale,-.006]],16),m.cream,p.x,p.y,p.z,rx,0,rz);
    put(turn([[.023*scale,depth*.36],[.031*scale,depth*.41],[.031*scale,depth*.55],[.022*scale,depth*.61]],8),m.brass,p.x,p.y,p.z,rx,0,rz);
    p.addScaledVector(axis,depth*.26);put(new THREE.SphereGeometry(.038*scale,9,5),m.lampGlow,p.x,p.y,p.z);return;
  }
  if(style==='lantern'&&tall){
    put(turn([[0,0],[.152,0],[.162,.022],[.167,.047],[.124,.061],[.045,.071]],12),m.walnut,0,0,0);
    put(along(turn([[.037,.055],[.030,.17],[.018,1.263],[.042,1.32]],10),'y'),m.oak,0,0,0);
    const bands:[[number,number],...Array<[number,number]>]=[[.142,1.28],[.176,1.32],[.207,1.47],[.215,1.63],[.181,1.78],[.139,1.82],[.133,1.815],[.171,1.761],[.202,1.625],[.195,1.467],[.166,1.33],[.138,1.283]];
    put(turn(bands,18),m.linen,0,0,0);
    for(const [r,y] of [[.151,1.286],[.181,1.349],[.215,1.608],[.188,1.753],[.144,1.813]])put(turn([[r,y],[r+.001,y+.006]],18),m.oak,0,0,0);
    put(new THREE.SphereGeometry(.052,8,5),m.lampGlow,0,1.419,0);return;
  }
  const t=tall?.206:.109,b=tall?.337:.189,depth=tall?.405:.227;
  if(tall){
    put(turn([[0,.004],[.18,.004],[.196,.013],[.196,.025],[.178,.036]],16),m.brass,0,0,0);
    put(along(turn([[.175,.034],[.168,.047],[.078,.081],[.051,.117],[.049,.155],[.030,.255],[.018,1.15],[.026,1.341],[.030,1.374]],14),'y'),m.walnut,0,0,0);
  }else{
    put(turn([[0,0],[.077,0],[.087,.011],[.083,.022]],12),m.walnut,0,0,0);
    put(turn([[.068,.02],[.104,.052],[.114,.117],[.092,.165],[.038,.209],[.027,.274],[.036,.284]],14),style==='bedside'?m.blue:m.sage,0,0,0);
  }
  put(turn([[.028,h-depth*.69],[.035,h-depth*.58],[.024,h-depth*.32],[.026,h-depth*.14]],10),m.brass,0,0,0);
  put(shade(t,b,depth,tall),m.linen,0,h,0);
  put(new THREE.SphereGeometry(tall?.047:.034,9,5),m.lampGlow,0,h-depth*.22,0);
  for(let i=0;i<3;i++){const a=i*Math.PI*2/3;rail(k,[0,h-depth*.34,0],[Math.cos(a)*b*.94,h-depth*.45,Math.sin(a)*b*.94],.0036,m.brass,4);}
}

export function vessel(radius: number, h: number, foot = .45, n = radius < .10 ? 14 : radius < .20 ? 18 : 24) {
  const r = radius;
  return turn([[0, h * .046], [r * foot * .74, h * .046], [r * foot * .78, 0], [r * foot, 0],
    [r * foot, h * .105], [r * .71, h * .29], [r * .92, h * .65], [r, h * .955], [r * .980, h],
    [r * .925, h * .949], [r * .81, h * .57], [r * .43, h * .197], [0, h * .143]], n);
}
export function teaSetting(k: FurnitureKit, x: number, y: number, z: number, setting: 'interior' | 'terrace' = 'interior') {
  if (setting === 'interior') return indoorTeaSetting(k, x, y, z);
  // The outdoor service belongs to the verified terrace, not this interior refit.
  const { put, m } = k;
  put(vessel(.14, .026, .48), m.white, x, y, z);
  put(vessel(.075, .121, .56), m.white, x, y + .0048, z);
  put(stock([[.064, .098, 0, .010], [.087, .110, 0, .010], [.111, .108, 0, .009], [.122, .093, 0, .009], [.120, .072, 0, .009], [.103, .052, 0, .009], [.078, .043, 0, .010], [.057, .050, 0, .010]], 8), m.white, x, y + .0048, z);
  // A low tea level leaves the glaze and lip visible from above and across the table.
  put(turn([[0, 0], [.060, 0], [.060, .002], [0, .002]], 20), m.walnut, x, y + .0838, z);
}
