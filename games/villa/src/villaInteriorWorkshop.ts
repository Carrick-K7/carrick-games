import * as THREE from 'three';
import { VillaModelBuilder } from './villaModel.js';
import { bent, board, casting, circleXY, loft, oval, rail, rectRing, rectXY, stock, turn, type FurnitureKit, type Point } from './villaFurnitureForms.js';
import { equipmentSurface, wrapCut } from './villaRecreationSurfaces.js';

function spanner() {
  // Forked open jaw at the head, pierced box end at the heel.
  const profile = [[-.025, -.226], [-.048, -.206], [-.051, -.176], [-.038, -.151], [-.016, -.129], [-.013, .092], [-.046, .121],
    [-.058, .153], [-.054, .187], [-.033, .205], [-.025, .157], [-.007, .146], [.018, .151], [.028, .168], [.022, .213],
    [.047, .200], [.063, .169], [.057, .134], [.031, .108], [.017, .095], [.018, -.127], [.043, -.154], [.052, -.184], [.044, -.209], [.023, -.226]];
  return casting(profile, .016, [circleXY(0, -.186, .023, 12)]);
}
export function workshop(k: FurnitureKit) {
  const { m, put, box, at } = k;
  // A joiner's bench is a load-bearing frame, not the café table from upstairs.
  for (const x of [-1.77, 1.77]) {
    for (const z of [-.334, .334]) put(loft([rectRing(.101, .112, .014, 0), rectRing(.107, .118, .014, .129), rectRing(.133, .141, .014, .791)]), m.oak, x, 0, z);
    box(x, .19, 0, .107, .115, .774, m.walnut, 0);
  }
  for (const z of [-.318, .318]) box(0, .192, z, 3.72, .115, .081, m.oak, 0);
  const finish=equipmentSurface(k);
  const dogs=Array.from({length:8},(_,i)=>circleXY(-1.72+i*.466,-.292,.015,10));
  // The string of bench-dog bores really opens through the worn beech. Separate
  // end caps reveal their joint, and keep the profiled edge of the old thick top.
  put(wrapCut(casting(rectXY(4.066,.907,.019),.123,dogs),'beech','xy'),finish,0,.849,0,-Math.PI/2);
  for(const x of [-2.094,2.094]){
    put(board(.112,.911,.123,.016,.005),m.oak,x,.849,0);
    for(const z of [-.28,.257])put(turn([[.009,0],[.010,.002],[0,.002]],8),m.walnut,x,.910,z);
  }
  // Under-bench tools chest. Three flush drawers and an offset-open top
  // tray; the glazed label holder and lip pulls belong to each front.
  at(.799,0,-.012,0,()=>{
    for(const x of [-.718,.718]) box(x,.498,0,.039,.568,.608,m.walnut,0);
    for(const y of [.231,.389,.545,.765]) box(0,y,0,1.455,.033,.607,m.walnut,0);
    for(const [i,y] of [.315,.474,.642].entries()){
      const z=.296+(i===2?.098:0),h=i===2?.120:.136;
      put(wrapCut(board(1.377,h,.027,.014,.007).rotateX(Math.PI/2),'drawer','xy'),finish,0,y,z);
      for(const x of [-.349,.349]){
        bent(k,m.brass,[[x-.077,y+.009,z+.011,.008],[x-.077,y+.009,z+.041,.007],[x-.069,y+.004,z+.049,.007],
          [x+.069,y+.004,z+.049,.007],[x+.077,y+.009,z+.041,.007],[x+.077,y+.009,z+.011,.008]],6);
      }
      if(i===2){
        for(const x of [-.673,.673])box(x,y,0,.026,h,.741,m.oak,0);
        box(0,y-.048,.027,1.330,.019,.690,m.oak,0);
        for(const x of [-.24,.20])box(x,y-.004,.231,.012,.088,.304,m.walnut,0);
      }
    }
  });
  for (const z of [-.33, .33]) box(0, .731, z, 3.78, .120, .071, m.walnut, 0);
  k.hit(0, 0, 0, 4.3, .91, .91);
  // An open wall of hanging cleats backed by uprights, with short pegs through
  // the box ends. The underside of each cleat is cut at a hanging bevel.
  for (const x of [-1.94, -.66, .66, 1.94]) box(x, 1.74, -.352, .076, 1.161, .038, m.walnut, 0);
  for (let i = 0; i < 6; i++) {
    const cleat=casting([[-.035,-.058],[.035,-.058],[.035,.047],[.014,.066],[-.035,.066]],4.14).rotateY(Math.PI/2);
    const p=cleat.getAttribute('position'), uv=cleat.getAttribute('uv');
    for(let j=0;j<p.count;j++) uv.setXY(j,p.getX(j)*.68+i*.19,.48+p.getY(j)*1.7-p.getZ(j));
    put(cleat,m.oak,0,1.24+i*.194,-.309);
    for(const x of [-1.94,-.66,.66,1.94]) put(turn([[.007,0],[0,.002]],6),m.dark,x,1.24+i*.194,-.273,Math.PI/2);
  }
  for (let i = 0; i < 10; i++) {
    const x = -1.79 + i * .385, y = 1.736 + (i % 2) * .053;
    rail(k, [x, y + .159, -.286], [x, y + .159, -.201], .008, m.brass);
    switch (i % 5) {
      case 0: case 1: {
        const s = i<5 ? (i%5 ? .80 : 1.08) : (i%5 ? .69 : .95), cy=y+.159-.186*s;
        put(wrapCut(spanner().scale(s,s,1),'pad','xy'),finish,x,cy,-.217,0,0,Math.PI);
        // The raised forging spine ends below both heads; the eye stays open.
        put(board(.014*s,.174*s,.004,.006,.001),m.steel,x,cy+.011*s,-.207,Math.PI/2);
        break;
      }
      case 2: {
        // Combination square: pierced fence with an actual throat, separate rule.
        put(casting([[-.084, -.165], [-.046, -.165], [-.046, -.015], [.122, .106], [.122, .15], [-.084, .15]], .032,
          [[[-.044, .052], [.058, .120], [-.044, .120]]]), m.black, x, y, -.219);
        box(x - .02, y + .117, -.197, .341, .022, .008, m.steel, 0); break;
      }
      case 3:
        put(turn([[0, 0], [.025, .002], [.035, .020], [.037, .068], [.029, .117], [.017, .133], [.022, .148], [0, .148]], 8), m.terra, x, y - .202, -.211);
        put(stock([[0, 0, 0, .011], [0, .201, 0, .009], [0, .224, 0, .006]], 6), m.steel, x, y - .057, -.211);
        break;
      default:
        for (const s of [-1, 1]) {
          bent(k, m.terra, [[x + s * .053, y - .160, -.209, .012], [x + s * .057, y - .106, -.208, .014], [x + s * .033, y - .038, -.208, .013], [x, y + .006, -.210, .011]]);
          put(casting([[0, 0], [s * .021, .014], [s * .034, .096], [s * .028, .142], [s * .012, .136], [s * .012, .077], [-s * .010, .026]], .017), m.steel, x, y, -.21 + .006 * s);
        }
        put(turn([[0, 0], [.014, 0], [.014, .008], [0, .008]], 8), m.brass, x, y + .012, -.197, Math.PI / 2);
    }
  }
  // Independent fixed/moving vise jaws: open mouth, polished jaw inserts,
  // exposed screw housing and a sliding tommy bar with stops at both ends.
  at(-1.30, .91, .124, -.08, () => {
    put(turn([[0, 0], [.155, 0], [.161, .018], [.138, .034], [.104, .038], [.112, .055], [0, .055]], 14), m.terra, 0, 0, 0);
    put(casting([[-.13, .054], [.148, .054], [.138, .099], [.093, .131], [.069, .196], [.078, .240], [-.013, .243], [-.039, .201], [-.064, .153], [-.107, .133]], .202), m.terra, 0, 0, 0, 0, Math.PI / 2);
    put(casting([[-.023, .120], [.075, .120], [.112, .142], [.115, .22], [.096, .245], [.014, .245], [.008, .194], [-.018, .177]], .202), m.terra, 0, 0, .174, 0, -Math.PI / 2);
    for(const z of [.024,.184]){
      put(wrapCut(board(.226,.028,.035,.003,.002),'pad','xy'),finish,0,.244,z);
      for(const x of [-.075,.075])put(turn([[.006,0],[0,.002]],6),m.dark,x,.244,z+.014,Math.PI/2);
    }
    for(const x of [-.119,.119]) for(const z of [-.061,.062]) put(turn([[.010,0],[.012,.004],[.010,.009],[0,.009]],6),m.steel,x,.028,z);
    rail(k, [0, .151, -.022], [0, .151, .285], .027, m.steel);
    bent(k, m.steel, [[-.083, .092, .280, .012], [-.076, .097, .280, .014], [-.065, .104, .280, .007], [.102, .224, .280, .007], [.114, .232, .280, .014], [.121, .237, .280, .012]], 8);
  });
  at(1.18, .91, .032, 0, () => {
    put(loft([rectRing(.46, .274, .038, 0), rectRing(.508, .313, .036, .035), rectRing(.51, .313, .025, .178), rectRing(.529, .328, .026, .188),
      rectRing(.527, .327, .026, .202), rectRing(.486, .283, .019, .203), rectRing(.478, .276, .022, .175), rectRing(.451, .245, .021, .030)]), m.steel, 0, 0, 0);
    for (const x of [-.221, .221]) put(casting([[-.133, .156], [.133, .156], [.060, .31], [.026, .34], [-.026, .34], [-.060, .31]], .025), m.walnut, x, 0, 0, 0, Math.PI / 2);
    rail(k, [-.224, .313, 0], [.224, .313, 0], .020, m.oak);
    box(.073,.099,-.002,.018,.139,.24,m.walnut,0);
    for(const [x,z,h] of [[.149,-.052,.187],[.177,-.033,.170],[.160,-.074,.209]]) rail(k,[x,.037,z],[x+.016,.037+h,z],.006,m.oak,6);
    put(turn([[.066,0],[.071,.003],[.071,.046],[.065,.050],[.038,.050],[.037,.047],[.037,.003],[.038,0],[.066,0]],12),m.cream,-.108,.031,.027);
  });
  // A machinist's level stands in its own sole. Three open viewing windows in
  // the cast web expose the spirit vial and catches, not paint on a solid bar.
  at(-.224,.912,.095,-.23,()=>{
    const slots=[rectXY(.123,.027,.010,-.182,.041),rectXY(.136,.048,.016,0,.045),rectXY(.123,.027,.010,.182,.041)];
    put(wrapCut(casting(rectXY(.608,.090,.014,0,.045),.039,slots),'drawer','xy'),finish,0,0,0);
    rail(k,[-.063,.046,0],[.063,.046,0],.010,m.coral,8);
    for(const x of [-.028,.028]) rail(k,[x-.0015,.046,0],[x+.0015,.046,0],.0108,m.dark,8);
    box(0,.004,0,.598,.007,.044,m.stone,0);
  });
}

export function stockroom(k: FurnitureKit) {
  const { m, put, box } = k;
  for (const x of [-.833, .833]) for (const z of [-.263, .263]) {
    // Folded angle stock: through-view from either side below the shelves.
    const post = casting([[-.022, -.022], [.023, -.022], [.023, -.014], [-.014, -.014], [-.014, .023], [-.022, .023]], 2.38).rotateX(-Math.PI / 2);
    put(post, m.steel, x, 1.20, z, 0, Math.atan2(x, z));
    box(x, .013, z, .080, .026, .083, m.dark, 0);
  }
  rail(k, [-.814, .219, -.275], [.813, 2.11, -.275], .013, m.steel, 6);
  rail(k, [.814, .219, -.275], [-.813, 2.11, -.275], .013, m.steel, 6);
  for (let j = 0; j < 4; j++) {
    const y = .200 + j * .64;
    put(board(1.70, .590, .048, .019, .014), m.steel, 0, y, 0);
    for (const x of [-.419, .419]) {
      const front: number[][] = [[-.331, .027], [.331, .027], [.355, .318], [.35, .346], [.295, .346], [.247, .202], [.203, .170], [-.203, .170], [-.247, .202], [-.295, .346], [-.350, .346], [-.355, .318]];
      const side = [[-.192, .025], [.188, .025], [.225, .30], [.225, .347], [-.225, .347], [-.225, .310]];
      const material = j % 2 ? m.sage : m.oak;
      put(casting(front, .021), material, x, y, .212);
      const die=(w:number,h:number,r:number,cy:number)=>rectRing(w,h,r,0,0,0,1).map(([u,,v])=>[u,cy+v]);
      put(casting(die(.699,.321,.018,.187),.021,[die(.16,.047,.017,.277)]),material,x,y,-.213);
      for (const sx of [-.339, .339]) put(casting(side, .020), material, x + sx, y, 0, 0, Math.PI / 2);
      box(x, y + .041, 0, .681, .027, .419, material, 0);
      box(x,y+.103,.225,.146,.039,.006,m.cream,0);
      for(let i=0;i<j+1;i++)box(x-.044+i*.026,y+.104,.229,.014,.003,.011,m.dark,0);
      if(j===1 || (x<0 && j===2)) {
        // Small shop materials live inside the bins. The lower scoop and
        // pierced hand-hold remain entirely open to the aisle.
        for(let i=0;i<3;i++)put(turn([[.060,0],[.060,.096],[.055,.100],[.031,.100],[.031,0]],10),i===2?m.sage:m.cream,x-.145+i*.138,y+.055,-.015);
      } else if(j>1) {
        for(let i=0;i<3;i++) put(new THREE.BoxGeometry(.477,.042,.165),i%2?m.oak:m.walnut,x,y+.075+i*.043,.016,0,.03*(i-1));
      }
    }
  }
  k.hit(0, 0, 0, 1.8, 2.4, .64);
}

export function vacuumModel(k: FurnitureKit, vacuum: THREE.Group, brush: THREE.Group, shell: THREE.Material, trim: THREE.Material, lens: THREE.Material) {
  const body = new VillaModelBuilder(vacuum, 'vacuum/body');
  // Flat front for the flush camera, domed perimeter elsewhere. The dark
  // sensor band is the wall itself, not a lens glued to a circular wall.
  const rim = (r: number, y: number, front: number) => oval(2 * r, 2 * r, y, 28).map(([x, h, z]): Point => [x, h, Math.min(z, front)]);
  body.geometry(loft([rim(.141, .012, .133), rim(.166, .018, .149), rim(.176, .028, .158)]), trim);
  body.geometry(loft([rim(.173, .025, .157), rim(.179, .032, .165), rim(.181, .048, .165), rim(.179, .052, .164)]), lens);
  const roof=rim(.157,.081,.139),tx=-.035,tz=-.038;
  body.geometry(loft([rim(.179,.048,.164),rim(.181,.056,.166),rim(.179,.065,.163),rim(.171,.076,.153),roof],true,false),shell);
  body.geometry(casting(roof.map(([x,,z])=>[x,-z]),.004,[circleXY(tx,-tz,.047,20)]),shell,[0,.079,0],[-Math.PI/2,0,0]);
  body.geometry(casting(rectXY(.073, .018, .006), .005, [circleXY(-.019, 0, .006, 8), circleXY(.019, 0, .005, 8)]), trim, [0, .041, .166]);
  for (const x of [-.119, .119]) body.geometry(turn([[0, -.014], [.027, -.014], [.031, -.009], [.031, .010], [.027, .015], [0, .015]], 12), trim, [x, .031, -.024], [0, 0, Math.PI / 2]);
  body.geometry(casting(rectXY(.117, .048, .013), .006, [rectXY(.098, .027, .008)]), shell, [0, .012, -.054], [-Math.PI / 2, 0, 0]);
  body.geometry(stock([[-.049, .010, -.054, .008], [.049, .010, -.054, .008]], 8), trim);
  // Flush top-sensor well: the optic sits below the rolled aperture instead
  // of raising the compact 8 cm machine into the furniture it travels under.
  body.geometry(turn([[.048,.079],[.048,.081],[.044,.083],[.037,.082],[.034,.077],[.034,.071]],20),trim,[tx,0,tz]);
  body.geometry(turn([[.035,.071],[.030,.072],[.024,.074],[0,.074]],20),lens,[tx,0,tz]);
  body.geometry(stock([[-.136,.080,.049,.002],[-.089,.082,.056,.002],[.081,.082,.056,.002],[.135,.080,.050,.002]],6),trim);
  body.geometry(board(.066, .019, .003, .009, .001), trim, [0, .082, .099]);
  for (const x of [-.014, .014]) body.geometry(turn([[.004, 0], [.004, .0015], [0, .0015]], 8), shell, [x, .084, .099]);
  body.finish();
  const blades = new VillaModelBuilder(brush, 'vacuum/sweeper');
  for (let i = 0; i < 3; i++) blades.at(0, 0, 0, 2 * Math.PI / 3 * i, () => {
    const blade = casting([[0, 0], [.008, .002], [.018, .043], [.015, .064], [.010, .062], [.012, .045], [.006, .060], [.002, .059], [.005, .038]], .004);
    blades.geometry(blade, trim, [0, 0, 0], [-Math.PI / 2, 0, 0]);
  });
  blades.finish();
  k.at(4.45, 0, -7.36, Math.PI, () => {
    // The ramp rises into an actual wash bay. Leave the center unobstructed
    // under the control head so the robot could enter between both cheeks.
    for (const x of [-.192, .192]) k.put(board(.043, .320, .476, .018, .007), shell, x, .243, 0);
    const {m}=k;
    k.box(0, .235, -.147, .363, .455, .022, m.dark, 0);
    k.put(loft([rectRing(.412, .302, .034, .163), rectRing(.424, .316, .032, .183), rectRing(.429, .320, .026, .443), rectRing(.417, .305, .039, .486), rectRing(.395, .29, .041, .492)]), shell, 0, 0, 0);
    k.put(board(.269, .057, .007, .017), m.black, 0, .348, .161, Math.PI / 2);
    k.put(board(.046,.009,.004,.003),m.sage,0,.348,.166,Math.PI/2);
    for(const s of [-1,1]) {
      k.put(board(.187,.254,.009,.019,.002),m.dark,s*.096,.492,0);
      k.put(board(.179,.249,.012,.020,.002),shell,s*.096,.498,-.001);
      k.box(s*.096,.505,-.078,.056,.004,.011,m.stone,0);
    }
    k.put(casting([[-.134, .002], [.556, .002], [.556, .008], [.363, .029], [.059, .031], [-.134, .025]], .408), m.dark, 0, 0, 0, 0, -Math.PI / 2);
    for(const s of [-1,1]){
      k.put(turn([[.021, 0], [.022, .006], [0, .007]], 8),m.brass,s*.094,.028,.129);
      for(let i=0;i<5;i++) k.box(s*.110,.026-.0031*i,.273+i*.052,.081,.006,.011,m.black,0);
    }
    const slots=Array.from({length:4},(_,i)=>rectXY(.125,.007,.003,0,-.025+i*.017));
    k.put(casting(rectXY(.171,.081,.012),.011,slots),shell,-.216,.264,.014,0,-Math.PI/2);
    k.box(-.214,.264,.014,.006,.070,.15,m.dark,0);
  });
}
