import * as THREE from 'three';
import { villaMaterial } from './villaModel.js';
import { FittingSkin, cabinetPull, foldedLinen, formedTube, panel, piercedPanel, surround, vessel } from './villaFittingGeometry.js';
import { FittedCaseBuilder, fittedVeneer, hanger, hangingGarment, shoe, wovenCloth } from './villaCabinetDressings.js';

import { reededGlass } from './villaBathDoors.js';
import { mountedTowels } from './villaInteriorBath.js';
import { createVillaRoomMirror } from './villaInteriorMirror.js';
import type { PutSurface } from './villaFurnitureForms.js';

/** Fitted joinery follows solid partitions, never the guest/dressing doorway or
 * the west glazing. The clear cross-aisle joins the two suite doors at z=-4.9. */
export function createVillaSuiteFittings(parent: THREE.Object3D) {
  const b = new FittedCaseBuilder(parent, 'villa-suite-fittings');
  const oak=fittedVeneer('#aa805d',0xffefde), walnut=fittedVeneer('#654d3b',0xb09986);
  const cream=villaMaterial('#f0eee4',.235), nickel=villaMaterial('#acb7b4',.26,.60);
  const stone=villaMaterial('#d8d2c5',.79); stone.userData.villaInteriorFinish='limestone';stone.userData.villaInteriorSwatchTint=0xf6f1e2;
  const water = new THREE.MeshStandardMaterial({color:'#c4dfdb',roughness:.14,transparent:true,opacity:.22,depthWrite:false});
  const screen = new THREE.MeshStandardMaterial({color:'#acc6c0',roughness:.38,transparent:true,opacity:.61,depthWrite:false});
  const garments=[wovenCloth('#9e7160','houndstooth'),wovenCloth('#50636b','pinstripe'),wovenCloth('#ded5c4','oxford')], cloth=garments[2];
  const put:PutSurface=(g,m,x,y,z,rx=0,ry=0,rz=0)=>b.geometry(g,m,[x,y,z],[rx,ry,rz]);
  const fixture = (id: string, x: number, z: number, w: number, d: number, yaw: number, build: () => void) => {
    const marker = new THREE.Object3D(); marker.name = `suite/${id}`; marker.position.set(x, 3.6, z);
    marker.userData = { width: w, depth: d, yaw }; b.root.add(marker);
    b.at(x, 3.6, z, yaw, build);
  };
  const cabinet = (id: string, x: number, z: number, width: number, bays: number, yaw: number) => fixture(id, x, z, width, .64, yaw, () => {
    const bay = width / bays;
    b.box(0, 1.32, -.28, width, 2.64, .075, walnut, 0);
    for (let i = 0; i <= bays; i++) b.box(-width / 2 + i * bay, 1.32, 0, .045, 2.64, .61, oak, 0);
    for (const y of [.10, .43, 2.19, 2.59]) b.box(0, y, 0, width, .06, .62, oak, 0);
    for (let i = 0; i < bays; i++) {
      const cx = -width / 2 + (i + .5) * bay;
      const arrangement=i+(yaw===0?0:2), style = (['coat','blouse','cardigan','dress','shirt','trousers'] as const);
      if(arrangement%4===1) {
        // One bay of linen is intentionally open: different shelf intervals,
        // small stacks toward the back and a forward space for today's clothes.
        for(const [shelf,folds] of [[.96,2],[1.43,1],[1.85,2]]){
          b.box(cx,shelf,0,bay-.048,.033,.55,oak,0);
          for(let k=0;k<folds;k++) b.geometry(foldedLinen(bay*(.51-.025*k),.405-.019*k,.084),garments[(i+k)%3],
            [cx-.078+.022*k,shelf+.017+.073*k,.015*k],[0,.046*k,0]);
        }
      } else {
        b.beam([cx-bay/2+.022,2.01,0],[cx+bay/2-.022,2.01,0],.014,nickel,12);
        for(const end of [-1,1]) b.cylinder(cx+end*(bay/2-.029),2.01,0,.027,.027,.026,nickel,[0,0,Math.PI/2],10);
        const count=arrangement%3===0?3:2;
        for(let j=0;j<count;j++) {
          const gx=cx+(j-(count-1)*.5)*bay*.27, angle=[.48,-.31,.73][(i+j)%3];
          b.at(gx,0,0,angle,()=>{
            hanger(b,0,2.01,0,.168,oak,nickel,angle,.088,.014);
            if(j===2 && arrangement%3===0)return;
            hangingGarment(b,0,1.922,0,style[(i*2+j)%6],garments[(i+j)%3],garments[(i+j+1)%3],nickel,
              .51*i+.63*j,1.11,1.82);
          });
        }
      }
      if(i%2===0) for(const side of [-1,1]) shoe(b,cx+side*.078,.13,.08,garments[(i+1)%3],oak,1.20);
      for (let fold = 0; fold < (i%2 ? 1 : 3); fold++) b.geometry(foldedLinen(bay * .58 - fold * .031, .365 - .008 * fold, .052),
        fold === 1 ? garments[(i + 1) % 3] : cloth, [cx + .009 * fold, 2.22 + fold * .045, .004 * fold], [0, .031 * fold, 0]);
      b.box(cx,.478,-.032,bay-.09,.026,.52,walnut,0);
      for(const end of [-1,1]) {
        b.box(cx+end*(bay/2-.057),.55,-.032,.018,.135,.52,oak,0);
        b.box(cx+end*(bay/2-.038),.504,-.02,.018,.016,.53,nickel,0);
      }
      b.geometry(panel(bay - .081, .17, .015, .026, .003), oak, [cx, .545, .242]);
      b.geometry(cabinetPull(.17, .028, .008), nickel, [cx, .57, .255]);
    }
    b.collide(0, 0, 0, width + .06, 2.65, .65);
  });
  cabinet('north-wardrobe', -21.55, -8.52, 4.1, 3, 0);
  cabinet('south-wardrobe', -18.8, -.5, 8.5, 6, Math.PI);
  fixture('accessory-island', -19, -4.05, 2.8, 1.2, 0, () => {
    b.box(0, .055, 0, 2.59, .11, 1.00, walnut, .008);
    for (const x of [-1.336,0,1.336]) b.box(x,.515,0,.048,.845,1.055,walnut,0);
    b.box(0,.515,0,2.62,.845,.045,walnut,0); b.box(0,.97,0,2.8,.07,1.2,stone,.025);
    for (const face of [-1, 1]) b.at(0, 0, face * .524, face < 0 ? Math.PI : 0, () => {
      for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
        const open=row===2 && face===1 && side===-1 ? .162 : 0, y=.251+row*.268;
        b.geometry(panel(1.30,.252,.012,.024,.003),oak,[side*.673,y,.012+open]);
        b.geometry(cabinetPull(.215,.031,.009),nickel,[side*.673,y+.009,.024+open]);
        if(open){
          b.box(-.673,y-.095,-.063,1.245,.022,.45,oak,0);
          for(const e of [-1,1]){b.box(-.673+e*.61,y,-.063,.024,.192,.45,oak,0);b.box(-.673+e*.635,y-.066,-.07,.016,.023,.41,nickel,0);}
          b.geometry(foldedLinen(.38,.22,.071),garments[1],[-.79,y-.085,.033]);
          b.collide(-.673,y-.13,.107,1.31,.27,open+.084);
        }
      }
    });
    b.geometry(vessel([[0, 0], [.225, 0, .12], [.265, .015, .168], [.277, .034, .178], [.274, .038, .174],
      [.267, .032, .167], [.242, .012, .143], [0, .012]], 28, .48), nickel, [.7, 1.005, -.1]);
    for (const x of [.53, .69, .86]) b.geometry(new THREE.TorusGeometry(.043, .006, 5, 12), nickel, [x, 1.023, -.1], [Math.PI / 2, 0, 0]);
    // A laid-out scarf and a shopper with an open throat and two sewn straps
    // break up the unbroken stone slab without entering the circulation aisle.
    b.geometry(foldedLinen(.65,.34,.046),garments[1],[-.13,1.005,.08],[0,.23,0]);
    b.geometry(vessel([[0,0],[.151,.001,.057],[.176,.020,.071],[.197,.232,.073],[.204,.286,.069],
      [.194,.288,.059],[.190,.271,.059],[.165,.032,.059],[0,.026]],20,.59),garments[0],[-.85,1.005,-.095]);
    for(const z of [-.052,.052]) b.geometry(formedTube([[-.105,0,0,.006,.011],[-.101,.088,0,.006,.011],
      [-.077,.135,0,.006,.011],[-.028,.16,0,.006,.011],[.032,.158,0,.006,.011],[.080,.131,0,.006,.011],
      [.098,.080,0,.006,.011],[.103,0,0,.006,.011]],7,0,[0,0,1]),garments[0],[-.85,1.276,-.095+z]);
    b.collide(0, 0, 0, 2.8, 1.02, 1.2);
  });
  fixture('dressing-bench', -22.2, -4.1, .85, 1.7, 0, () => {
    for (const x of [-.315, .315]) for (const z of [-.734, .734]) {
      b.geometry(vessel([[0, 0], [.031, 0], [.033, .019], [.026, .112], [.041, .332]], 10), walnut, [x, 0, z]);
    }
    b.geometry(panel(.79, 1.64, .09, .065, .009), walnut, [0, .347, 0], [-Math.PI / 2, 0, 0]);
    b.geometry(vessel([[0, .375], [.39, .375, .800], [.419, .397, .841], [.425, .439, .850],
      [.416, .495, .842], [.388, .529, .82], [.316, .552, .726], [0, .56]], 32, .38), cloth);
    b.collide(0, 0, 0, .85, .57, 1.7);
  });
  fixture('dressing-mirror', -13.25, -2, .11, 1.5, -Math.PI / 2, () => {
    b.geometry(surround(1.5, 2.4, .15, [[0, -.025], [0, .017], [.006, .027], [.020, .031], [.029, .028],
      [.036, .038], [.044, .038], [.049, .023], [.047, -.015], [0, -.025]]), nickel, [0, 1.34, 0]);
    b.geometry(panel(1.416, 2.316, .11, .015, .0025), createVillaRoomMirror('dressing'), [0, 1.34, .019]);
  });
  // A light, flush stone finish belongs only to the wet room, not the hall.
  b.box(-8.5, 3.61, -4.5, 8.7, .018, 8.7, stone, 0);
  fixture('double-vanity', -8, -8.39, 4.4, .78, 0, () => {
    b.box(0, .063, 0, 4.17, .126, .62, walnut, .008);
    for (const x of [-2.139, 0, 2.139]) b.box(x, .455, 0, .042, .69, .71, walnut, .005);
    b.box(0, .452, -.335, 4.30, .682, .038, walnut, .005);
    b.box(0, .133, 0, 4.32, .042, .71, walnut, .005);
    const centres = [-1.04, 1.04];
    b.geometry(piercedPanel(4.4, .78, .08, centres.map(x => [x, -.008, .029, .029])), cream, [0, .84, 0], [-Math.PI / 2, 0, 0]);
    for (const x of centres) {
      // Basin wall returns all the way to the waste: the top is not a flat plate under an open cone.
      b.geometry(vessel([[.024, 0, .024], [.16, 0, .115], [.22, .013, .16], [.271, .052, .194],
        [.309, .119, .225], [.32, .148, .231], [.320, .157, .231], [.316, .160, .228], [.305, .158, .218],
        [.299, .147, .212], [.28, .107, .201], [.240, .070, .172], [.175, .040, .127], [.091, .026, .069],
        [.035, .018, .033], [.024, .014, .024], [.024, 0, .024]], 36), cream, [x, .88, .008]);
      b.geometry(vessel([[.022, -.022], [.022, .010], [.034, .014], [.035, .017], [.030, .018], [.017, .016], [.017, -.022]], 22), nickel, [x, .88, .008]);
      b.beam([x - .017, .889, .008], [x + .017, .889, .008], .002, nickel, 6);
      b.geometry(formedTube([[0, -.04, 0, .030], [0, .006, 0, .034], [0, .014, 0, .034], [0, .019, 0, .026],
        [0, .102, 0, .025], [0, .110, 0, .021], [0, .298, 0, .018], [0, .328, .007, .018],
        [0, .348, .028, .018], [0, .358, .064, .018], [0, .358, .130, .017], [0, .352, .16, .017],
        [0, .334, .18, .018], [0, .307, .185, .019], [0, .294, .185, .019]], 14, .003, [1, 0, 0]), nickel, [x, .88, -.294]);
      b.geometry(cabinetPull(.105, .02, .006), nickel, [x + .028, 1.008, -.294], [0, 0, .33]);
      for (const y of [.306, .626]) {
        b.geometry(panel(2.05, .301, .016, .025, .003), oak, [x, y, .344]);
        b.geometry(cabinetPull(.37, .024, .0085), nickel, [x, y + .065, .356]);
      }
    }
    b.geometry(surround(4.1, 1.28, .084, [[0, -.023], [0, .014], [.005, .022], [.018, .028], [.032, .021],
      [.037, .012], [.035, -.020], [0, -.023]]), nickel, [0, 1.96, -.423]);
    b.geometry(panel(4.037, 1.217, .051, .016, .002), createVillaRoomMirror('ensuite'), [0, 1.96, -.415]);
    // At either basin: a pumped dispenser on its weighted foot and a
    // recessed oval soap dish. Their ledges actually sit on the stone.
    b.geometry(vessel([[0,0],[.041,0,.036],[.051,.008,.043],[.049,.145,.041],[.043,.157,.037],
      [.021,.165,.018],[.019,.180,.017]],14,.65),cream,[-.23,.88,-.09]);
    b.geometry(formedTube([[0,0,0,.021],[0,.013,0,.021],[0,.016,0,.009],[0,.044,0,.010],
      [0,.047,.014,.011],[0,.043,.053,.009]],9),nickel,[-.23,1.053,-.09]);
    b.geometry(vessel([[0,0],[.126,0,.061],[.146,.013,.083],[.148,.029,.084],[.136,.030,.075],[.118,.014,.063],[0,.014]],18,.67),
      cream,[.29,.88,.096]);
    b.geometry(vessel([[0,0],[.067,.001,.035],[.075,.009,.040],[.070,.029,.037],[.053,.035,.028],[0,.036]],16,.71),stone,[.30,.895,.099]);
    b.geometry(foldedLinen(.39,.29,.060),cloth,[1.76,.88,.062],[0,-.16,0]);
    b.collide(0, 0, 0, 4.4, 1.04, .78);
  });
  fixture('ensuite-tub', -11.55, -6.65, 1.35, 2.45, 0, () => {
    b.geometry(vessel([[.024,.018,.024,0,-.28], [.444, .018, .84], [.451, 0, .85], [.508, 0, .91], [.519, .029, .936],
      [.531, .089, .958], [.585, .289, 1.035], [.660, .557, 1.20], [.675, .614, 1.225],
      [.672, .640, 1.222], [.654, .651, 1.200], [.606, .651, 1.149], [.590, .638, 1.132],
      [.568, .555, 1.084, 0, .008], [.534, .390, 1.006, 0, .025], [.505, .304, .95, 0, .035],
      [.439, .18, .784, 0, .070], [.386, .142, .682, 0, .085], [.296, .127, .544, 0, .087],
      [.042,.119,.042,0,-.28],[.024,.118,.024,0,-.28],[.024,.018,.024,0,-.28]], 44, .66), cream);
    // Water's perimeter meets the flared inner section at this elevation.
    b.geometry(vessel([[.506,.307,.952,0,.035],[.503,.304,.947,0,.035],[.497,.303,.940,0,.035],[0,.303,0,0,.035]],44,.66),water);
    b.geometry(vessel([[.022,-.024],[.024,-.024],[.024,0],[.037,.002],[.039,.005],[.026,.006],[.019,.003],[.019,-.024]],18),nickel,[0,.119,-.28]);
    b.beam([-.020,.117,-.28],[.020,.117,-.28],.002,nickel,6);
    // The deck mixer stands on the rim, not in midair over the bath.
    b.geometry(formedTube([[.634, .640, 0, .032], [.634, .659, 0, .034], [.634, .669, 0, .024],
      [.634, .930, 0, .019], [.627, .966, 0, .019], [.607, .990, 0, .020], [.574, 1.0, 0, .020],
      [.397, 1.0, 0, .021], [.375, .992, 0, .021], [.365, .974, 0, .022], [.365, .954, 0, .022]], 16, .003), nickel);
    b.geometry(formedTube([[.610, .746, 0, .014], [.585, .746, 0, .015], [.570, .754, 0, .012],
      [.552, .792, 0, .009], [.540, .819, 0, .007]], 10), nickel);
    b.collide(0, 0, 0, 1.35, .7, 2.45);
  });
  fixture('toilet', -11.4, -1.1, .7, 1.18, 0, () => {
    b.geometry(vessel([[0, .002], [.20, .002, .204, 0, .075], [.214, .016, .228, 0, .075],
      [.184, .110, .188, 0, .062], [.166, .189, .176, 0, .058], [.191, .254, .231, 0, .044],
      [.258, .312, .316, 0, .012], [.303, .40, .395, 0, -.025], [.315, .466, .412, 0, -.031],
      [.312, .482, .410, 0, -.031], [.261, .486, .324, 0, -.053], [.244, .473, .307, 0, -.054],
      [.227, .425, .289, 0, -.055], [.185, .331, .214, 0, -.035], [.113, .261, .118, 0, .008],
      [.065, .242, .072, 0, .030], [.053, .198, .054, 0, .056], [0, .184, 0, 0, .072]], 36), cream);
    b.geometry(vessel([[.115, .262, .120, 0, .008], [0, .261, 0, 0, .008]], 32), water);
    b.geometry(vessel([[.245, .495, .297, 0, -.050], [.290, .495, .371, 0, -.039], [.305, .502, .387, 0, -.038],
      [.307, .518, .389, 0, -.038], [.301, .530, .384, 0, -.038], [.283, .536, .365, 0, -.039],
      [.249, .533, .307, 0, -.050], [.239, .523, .290, 0, -.050], [.240, .504, .291, 0, -.050], [.245, .495, .297, 0, -.050]], 36), cream);
    b.geometry(vessel([[0, .400], [.230, .400, .085], [.282, .441, .104], [.301, .852, .113], [.299, .883, .111],
      [.279, .898, .102], [0, .898]], 28, .48), cream, [0, 0, .404]);
    b.geometry(vessel([[0, 0], [.302, .002, .117], [.306, .012, .119], [.300, .024, .115], [.282, .031, .109], [0, .031]], 28, .48), cream, [0, .898, .404]);
    for (const x of [-.094, .094]) b.beam([x - .03, .501, .269], [x + .03, .501, .269], .014, nickel, 10);
    for (const [x, r] of [[-.025, .024], [.026, .019]]) b.cylinder(x, .932, .404, r, r, .008, nickel, undefined, 16);
    b.collide(0, 0, .05, .7, 1, 1.18);
  });
  fixture('ensuite-shower', -5.45, -1.32, 1.8, 1.86, 0, () => {
    // A pitched receiver falls to an open trench. The removable grate has actual slots.
    const tray = new FittingSkin(), rect = (w: number, d: number, y: number, z: number) =>
      [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, dz]) => tray.point(x, y, z + dz));
    const base = rect(.90, .93, .002, 0), edge = rect(.90, .93, .080, 0), fall = rect(.331, .047, .072, .655), well = rect(.331, .047, .044, .655);
    tray.join(base, edge); tray.join(edge, fall); tray.join(fall, well); b.geometry(tray.geometry(), stone);
    b.box(0, .042, .655, .662, .004, .094, walnut, 0);
    b.geometry(piercedPanel(.657, .089, .007, Array.from({ length: 12 }, (_, i) => [-.282 + i * .051, 0, .009, .030])),
      nickel, [0, .075, .655], [-Math.PI / 2, 0, 0]);
    b.geometry(reededGlass(1.80,2.15,.014,.045,.005),screen,[-.86,1.155,0],[0,-Math.PI/2,0]);
    b.geometry(reededGlass(1.75,2.15,.014,.045,.005),screen,[0,1.155,.89]);
    b.collide(0,.02,.89,1.75,2.215,.028);
    b.collide(-.86, 0, 0, .05, 2.23, 1.8);
    b.geometry(formedTube([[.67, .64, .67, .021], [.67, .69, .67, .024], [.67, .70, .67, .018],
      [.67, 2.112, .67, .018], [.66, 2.171, .665, .018], [.637, 2.208, .653, .018], [.591, 2.228, .63, .018],
      [.063, 2.23, .38, .018], [.025, 2.223, .362, .018], [0, 2.196, .350, .021]], 14, 0, [0, 0, 1]), nickel);
    b.geometry(vessel([[.146, 0], [.167, .002], [.170, .008], [.169, .018], [.157, .023], [.073, .028],
      [.025, .035], [0, .035]]), nickel, [0, 2.166, .350]);
    const plate = new THREE.Shape(); plate.absarc(0, 0, .149, 0, Math.PI * 2, false);
    for (const [r, count] of [[0, 1], [.052, 6], [.096, 11], [.130, 16]]) for (let i = 0; i < count; i++) {
      const a = i * 2 * Math.PI / count, hole = new THREE.Path(); hole.absarc(r * Math.cos(a), r * Math.sin(a), .0037, 0, Math.PI * 2, true); plate.holes.push(hole);
    }
    b.geometry(new THREE.ExtrudeGeometry(plate, { depth: .003, bevelEnabled: false, curveSegments: 4 }), nickel, [0, 2.170, .350], [Math.PI / 2, 0, 0]);
    for (const y of [.74, 1.97]) b.beam([.67, y, .67], [.67, y, .886], .014, nickel, 10);
    b.cylinder(.67, 1.073, .843, .079, .072, .058, nickel, [Math.PI / 2, 0, 0], 18);
    b.beam([.67, 1.073, .815], [.60, .995, .790], .012, nickel, 10);
    for (const y of [.17, 1.98]) for (const x of [-.70, .72]) b.box(x, y, .883, .052, .087, .046, nickel, .004);
  });
  fixture('tub-rail',-11.51,-8.874,1.21,.14,0,()=>{
    mountedTowels(put,nickel,cloth,garments[1],0,1.32,0,1.12,.665,.82);
    b.collide(0,.48,.072,1.19,.89,.154);
  });
  fixture('towel-console', -8.3, -.6, 1.5, .5, Math.PI, () => {
    for (const x of [-.72, .72]) for (const z of [-.214, .214]) b.box(x, .361, z, .046, .722, .049, oak, .006);
    for (const y of [.144, .415, .721]) b.geometry(panel(1.5, .50, .033, .041, .005), oak, [0, y, 0], [-Math.PI / 2, 0, 0]);
    for (const x of [-.34, .33]) for (let i = 0; i < 2; i++) b.geometry(foldedLinen(.59, .41, .065),
      i ? cloth : garments[2], [x, .436 + i * .056, .004 * i]);
    for (let i = 0; i < 3; i++) b.geometry(foldedLinen(.62 - .015 * i, .38, .073), cloth, [0, .742 + i * .063, .004 * i]);
    b.collide(0, 0, 0, 1.5, .75, .5);
  });
  b.finish();
  return { root: b.root, colliders: b.colliders };
}
