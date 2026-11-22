import { bent, board, casting, circleXY, loft, rail, rectRing, rectXY, stock, turn, type FurnitureKit } from './villaFurnitureForms.js';
import { equipmentSurface, wrapCut } from './villaRecreationSurfaces.js';
import { sectionLoft, type P3 } from './villaVehicleSections.js';
import { createVillaRoomMirror } from './villaInteriorMirror.js';

/** Cut-and-boxed vinyl with a scalloped waist and full width at the shoulders.
 * Separate sections carry load from foam to the thin rigid board underneath. */
function exercisePad(w:number,d:number,back:boolean) {
  const rows=back?[[-.50,.67],[-.46,.80],[-.34,.84],[-.13,.82],[.12,.95],[.31,1],[.455,.98],[.50,.83]]:
    [[-.50,.77],[-.45,.96],[-.29,1],[.01,.98],[.31,.85],[.46,.77],[.50,.65]];
  return sectionLoft(rows.map(([t,width])=>{
    const r=w*width*.5, crown=.057+.006*Math.cos(t*Math.PI), seat=back?.009:.014;
    return [[-.88*r,-.060],[.88*r,-.060],[r,-.044],[r,.017],[.982*r,.037],[.86*r,crown],[.55*r,crown-.002],
      [0,crown-seat*Math.cos(t*Math.PI)],[ -.55*r,crown-.002],[-.86*r,crown],[-.982*r,.037],[-r,.017],[-r,-.044]].map(([x,y]):P3=>[x,y,t*d]);
  }));
}

function weightPlate(radius: number, thickness: number) {
  const outer = circleXY(0, 0, radius, 16), holes = [circleXY(0, 0, .020, 8)];
  // Through-grips leave three spokes in each plate, not markings on a disk.
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3, p: number[][] = [];
    for (const [j, r] of [[-.62,.69],[-.65,.59],[-.52,.51],[0,.51],[.52,.51],[.65,.59],[.62,.69],[0,.78]])
      p.push([Math.cos(a + j) * radius * r, Math.sin(a + j) * radius * r]);
    holes.push(p);
  }
  return casting(outer, thickness, holes);
}
function dumbbell(k: FurnitureKit, r: number, span: number) {
  const { put, m } = k;
  put(wrapCut(turn([[.020,-span+.027],[.021,-span*.54],[.014,-span*.36],[.017,0],[.014,span*.36],[.021,span*.54],[.020,span-.027]],8),'pad','xy'), equipmentSurface(k), 0, 0, 0, Math.PI / 2);
  for (const s of [-1, 1]) {
    put(wrapCut(turn([[0, -.038], [r * .72, -.038], [r, -.024], [r, .024], [r * .74, .038], [r * .37, .038], [r * .30, .032], [0, .032]], 6),'runner','xy'),equipmentSurface(k),0,0,s*span,Math.PI/2);
    put(turn([[r*.28,0],[r*.29,.004],[0,.004]],8),m.stone,0,0,s*(span+.036),s*Math.PI/2);
  }
}
export function gymEquipment(k: FurnitureKit) {
  const { m, put, at, box, hit } = k;
  at(-4.2, 0, -3.3, 0, () => {
    for (const x of [-1.00, 0, 1.00]) {
      put(board(.205, .314, .046, .031), m.black, x, .024, 0);
      bent(k, m.steel, [[x, .041, -.06, .033], [x, .966, -.06, .033], [x, 1.009, -.046, .028]]);
      for (const [y, r] of [[.265, .186], [.736, .14]]) {
        rail(k, [x, y, -.075], [x, y + .018, .158], .016, m.steel);
        for (let i = 0; i < 2; i++) put(wrapCut(weightPlate(r*(1-i*.08),.045),i?'pad':'runner','xy'),equipmentSurface(k),x,y+.009+i*.004,.019+.05*i,-.068);
        put(turn([[r*.76,0],[r*.77,.004],[r*.81,.004],[r*.82,0]],16),m.stone,x,y+.013,.094,Math.PI/2-.068);
      }
    }
    rail(k, [-1.01, .146, -.067], [1.01, .146, -.067], .024, m.dark);
    hit(0, 0, 0, 2.7, 1.1, .30);
  });
  // Open cable crossover: a compact stack on guide rods, a running cable
  // around a grooved pulley and a suspended stirrup handle on each side.
  at(1.2, 0, -4.05, 0, () => {
    for (const s of [-1, 1]) {
      const x = s * .85;
      put(board(.46, .623, .071, .062), m.dark, x, .041, -.015);
      // The perforated tower carries the pulley fork. Slots are through-cuts,
      // so the steel guide and traveling stack remain visible behind it.
      const shield = rectXY(.296,1.96,.064,0,1.106);
      const ports = [rectXY(.147,.84,.042,0,1.49), rectXY(.170,.55,.044,0,.70)];
      put(wrapCut(casting(shield,.030,ports),'drawer','xy'), equipmentSurface(k), x,0,-.192);
      for (const dx of [-.068,.068]) {
        const fork=[[-.227,2.029],[-.164,2.034],[.152,2.065],[.189,2.084],[.188,2.110],[.165,2.136],[-.178,2.156],[-.227,2.138]];
        put(casting(fork,.018,[circleXY(.142,2.096,.017,8)]),m.dark,x+dx,0,0,0,-Math.PI/2);
      }
      rail(k,[x-.086,2.096,.142],[x+.086,2.096,.142],.014,m.brass,8);
      rail(k,[x,.344,.059],[x,.344,.155],.010,m.steel,8);
      put(turn([[.015,0],[.021,.006],[.020,.017],[0,.019]],9),m.terra,x,.344,.147,Math.PI/2);
      for (const dx of [-.187, .187]) bent(k, m.steel, [[x + dx, .071, -.211, .026], [x + dx, 2.066, -.211, .026], [x + dx, 2.138, -.194, .028], [x + dx, 2.187, -.129, .026], [x + dx, 2.187, .126, .025]]);
      for (const dx of [-.102, .102]) rail(k, [x + dx, .09, -.04], [x + dx, 2.14, -.04], .012, m.steel);
      const lamination=rectRing(.307,.249,.018,0,0,0,1).map(([u,,v])=>[u,v]);
      for (let i=0;i<8;i++) put(wrapCut(casting(lamination,.047),'runner','xy'),equipmentSurface(k),x,.129+i*.054,-.035,-Math.PI/2);
      box(x+.083,.318,.091,.027,.378,.006,m.stone,0);
      const py = 2.096;
      put(turn([[0, -.03], [.064, -.03], [.073, -.024], [.071, -.012], [.061, -.007], [.061, .007], [.071, .012], [.073, .024], [.064, .03], [0, .03]], 16), m.black, x, py, .142, 0, 0, Math.PI / 2);
      const cable: [number, number, number, number][] = [[x, .531, -.035, .005], [x, 1.96, .069, .005], [x, py, .079, .005], [x, py + .045, .097, .005], [x, py + .060, .144, .005], [x, py + .042, .183, .005], [x, py, .207, .005], [x, 1.112, .29, .005]];
      bent(k, m.steel, cable, 6);
      bent(k, m.black, [[x, 1.102, .292, .010], [x - .035, 1.082, .299, .009], [x - .100, .986, .314, .009], [x - .092, .963, .319, .011], [x + .092, .963, .319, .011], [x + .100, .986, .314, .009], [x + .035, 1.082, .299, .009], [x, 1.102, .292, .010]], 7);
    }
    bent(k, m.dark, [[-.986, 2.162, .13, .033], [-.76, 2.196, .13, .034], [-.57, 2.253, .14, .03], [.57, 2.253, .14, .03], [.76, 2.196, .13, .034], [.986, 2.162, .13, .033]]);
    hit(0, 0, 0, 2.25, 2.3, .7);
  });
  at(-2.6, 0, -1.15, 0, () => {
    for (const sx of [-.69, .69]) {
      const side = [[-.256, .014], [-.181, .014], [-.032, .533], [.145, .014], [.239, .014], [.029, .856], [-.061, .856]];
      put(casting(side, .047), m.steel, sx, 0, 0, 0, Math.PI / 2);
    }
    for (const y of [.28, .677]) {
      for (const z of [-.135, .135]) put(casting([[-.022, -.023], [.022, -.023], [.022, .023], [.012, .023], [.012, -.008], [-.022, -.008]], 1.43), m.dark, 0, y, z, 0, Math.PI / 2);
      for (let i = 0; i < 3; i++) {
        const r = (y < .5 ? .070 : .052) + i * .006;
        at((i - 1) * .46, y + .020 + r * .87, 0, 0, () => dumbbell(k, r, .124));
      }
    }
    hit(0, 0, 0, 1.6, .95, .6);
  });
  for (let i = 0; i < 4; i++) at(-.40 + i * .34, 0, -1.15, 0, () => {
    const r = .090 + i * .011;
    put(wrapCut(turn([[0, 0], [r * .70, 0], [r * .86, r * .16], [r, r * .64], [r * .96, r * 1.13], [r * .71, r * 1.58], [r * .46, r * 1.72], [0, r * 1.72]], 14),i%2?'drawer':'saddle','xy'),equipmentSurface(k),0,0,0);
    put(turn([[.022,0],[.027,.006],[.024,.009],[0,.009]],10),m.stone,0,r*.88,r*.961,Math.PI/2);
    const handle = stock([[-.57, 1.47, 0, .21], [-.76, 1.87, 0, .165], [-.84, 2.38, 0, .14], [-.70, 2.66, 0, .14], [-.43, 2.81, 0, .14], [.43, 2.81, 0, .14], [.70, 2.66, 0, .14], [.84, 2.38, 0, .14], [.76, 1.87, 0, .165], [.57, 1.47, 0, .21]], 8);
    put(handle.scale(r, r, r), m.dark, 0, 0, 0);
  });
  at(2.7, 0, -2.4, 0, () => {
    // A continuous belt loops round the rollers. Deeper motor cowling in the
    // nose, toe rails to either side and a tilted display facing the runner.
    const chassis = [[-.832, .055], [.818, .041], [.884, .067], [.907, .134], [.882, .191], [.795, .202], [-.549, .235], [-.675, .303], [-.831, .30], [-.898, .234], [-.898, .113]];
    const cross = (shape:number[][],span:number,holes:number[][][] = [])=>casting(shape,span,holes).rotateY(-Math.PI/2);
    for(const x of [-.273,.273]) put(cross(chassis,.041),m.dark,x,0,0);
    const cowl=[[ -.902,.112],[-.901,.238],[-.842,.308],[-.731,.316],[-.628,.293],[-.537,.237],[-.540,.192],[-.830,.107]];
    put(cross(cowl,.531),m.dark,0,0,0);
    const belt = [[-.697,.135],[-.729,.152],[-.744,.185],[-.736,.214],[-.715,.232],[-.688,.239],[.804,.211],[.838,.201],[.858,.175],[.858,.151],[.840,.123],[.810,.111]];
    const inner=belt.map(([z,y])=>[.05+(z-.05)*.989,.171+(y-.171)*.87]);
    put(wrapCut(cross(belt,.462,[inner]),'runner','zx'),equipmentSurface(k),0,0,0);
    for(const [z,y,r] of [[-.691,.186,.044],[.806,.161,.042]]) {
      rail(k,[-.269,y,z],[.269,y,z],.016,m.steel,8);
      put(turn([[0,-.234],[r,-.234],[r,.234],[0,.234]],12),m.black,0,y,z,0,0,Math.PI/2);
    }
    for (const s of [-1, 1]) {
      bent(k, m.steel, [[s * .269, .19, -.655, .031], [s * .269, .389, -.672, .028], [s * .267, .918, -.766, .027], [s * .267, 1.056, -.750, .026], [s * .267, 1.087, -.706, .026], [s * .267, 1.073, -.325, .024], [s * .267, 1.030, -.153, .020]]);
      const railFace=[[-.535,.217],[-.53,.247],[.805,.221],[.829,.199],[.800,.185]];
      put(cross(railFace,.050),m.steel,s*.263,0,0);
      for(let i=0;i<8;i++){const z=-.47+i*.166;box(s*.262,.241-(z+.47)*.020,z,.042,.006,.062,m.black,0);}
      bent(k,m.dark,[[s*.267,1.078,-.602,.025],[s*.267,1.075,-.329,.026],[s*.267,1.035,-.159,.021]],7);
    }
    const console = loft([rectRing(.46, .194, .034, -.046), rectRing(.578, .257, .036, .008), rectRing(.555, .246, .038, .036), rectRing(.453, .164, .026, .036), rectRing(.433, .15, .026, .018)]);
    put(console, m.dark, 0, 1.105, -.794, .92);
    put(board(.43, .147, .005, .025, .002), m.black, 0, 1.117, -.777, .92);
    const panel=(x:number,z:number,w:number,d:number,m:typeof k.m.blue)=>{
      const y=.004;
      put(board(w,d,.003,.004,.002),m,x,1.117+y*Math.cos(.92)-z*Math.sin(.92),-.777+y*Math.sin(.92)+z*Math.cos(.92),.92);
    };
    panel(-.042,-.017,.257,.062,m.blue); panel(.155,.018,.046,.045,m.terra);
    for(let i=0;i<4;i++) panel(-.143+i*.077,.044,.043,.012,m.steel);
    bent(k,m.black,[[.18,1.071,-.785,.006],[.224,1.042,-.746,.005],[.264,.952,-.763,.005],[.272,.469,-.688,.005],[.265,.284,-.673,.006]],6);
    hit(0, 0, 0, .7, 1.3, 1.9);
  });
  for (let i = 0; i < 3; i++) {
    const spiral: number[][] = [[-.846, .008], [.671, .008]], inside: number[][] = [];
    for (let j = 0; j <= 30; j++) {
      const a = -Math.PI / 2 + j / 30 * Math.PI * 3.7, r = .080 - j / 30 * .043;
      spiral.push([.671 + r * Math.cos(a), .088 + r * Math.sin(a)]);
      inside.unshift([.671 + (r - .008) * Math.cos(a), .088 + (r - .008) * Math.sin(a)]);
    }
    put(wrapCut(casting([...spiral, ...inside, [-.846, .016]], .611),i%2?'rush':'brick'),equipmentSurface(k), -1.9 + i * 1.35, -.006, .9, 0, -Math.PI / 2);
  }
  at(-3.6, 0, 1.4, 0, () => {
    for (const z of [-.642, .642]) {
      put(board(.472, .137, .061, .031), m.dark, 0, .031, z);
      bent(k, m.steel, [[0, .063, z, .045], [0, .235, z * .90, .040], [0, .393, z * .83, .036]], 8);
    }
    box(0, .393, 0, .084, .073, 1.57, m.dark, 0);
    // A ratchet quadrant and pivot connect the separated pads to the bearer.
    const quadrant=[[-.343,.388],[-.211,.265],[.145,.265],[.169,.297],[.115,.369],[-.212,.390]];
    for(const sx of [-.055,.055]) put(casting(quadrant,.017,[-.128,-.039,.050].map(z=>circleXY(z,.319,.017,8))),m.steel,sx,0,0,0,-Math.PI/2);
    rail(k,[-.098,.319,-.128],[.116,.319,-.128],.011,m.dark);
    put(turn([[0,0],[.023,0],[.026,.013],[.022,.024],[0,.025]],9),m.terra,.098,.319,-.128,0,0,-Math.PI/2);
    put(board(.328,.445,.019,.029),m.dark,0,.414,-.585);
    put(board(.289,1.056,.019,.029),m.dark,0,.431,.272,-.062);
    put(wrapCut(exercisePad(.382,.51,false),'saddle','zx'),equipmentSurface(k),0,.478,-.585);
    put(wrapCut(exercisePad(.350,1.134,true),'saddle','zx'),equipmentSurface(k),0,.493,.272,-.062);
    hit(0, 0, 0, .50, .60, 1.9);
  });
  put(casting(rectXY(2.4, 1.9, .062), .043, [rectXY(2.347, 1.847, .047)]), m.dark, 4.2, 1.45, -4.565);
  // Keep the mirror on its dedicated planar room-reflection material. The
  // narrow backing still takes the edge load and every bracket stays steel.
  put(casting(rectXY(2.357, 1.857, .050), .016), createVillaRoomMirror('gym','#c8d2cf'), 4.2, 1.45, -4.560);
}
