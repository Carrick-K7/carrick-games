// Original gameplay-scale interpretations informed by inspected CS:GO references.
// Screenshot perspective is not evidence of exact dimensions or a survey replica.
// No Valve geometry, textures, BSPs, or other downloaded map assets are used.
// Coordinates are [x,y,z]; floor rectangles are [minX,minZ,maxX,maxZ].
import { reflectMapDefinitionX } from './csAuthoredSpace.js';
const v = (x,z,y=0) => [x,y,z];
const box = (kind,x,y,z,w,h,d,extra={}) => ({shape:'box',kind,position:[x,y,z],size:[w,h,d],...extra});
const crate = (x,z,w=2,h=1.6,d=2) => box('wood',x,h/2,z,w,h,d,{detail:'crate'});
const barrel = (x,z) => ({shape:'cylinder',kind:'metal',position:[x,.65,z],radius:.48,height:1.3,solid:true});
const call = (name,zh,rect) => ({name,zh,rect});
const spawnRow = (x,z,yaw) => Array.from({length:5},(_,i)=>({position:v(x+(i%3)*1.45,z+Math.floor(i/3)*1.6),yaw}));

const inferno = {
  id:'de_inferno',name:'Inferno',theme:'desert',authored:true,style:'italian',
  floors:[
    [-16,28,0,42],[-5,-4,3,34],[-8,28,16,35],[8,10,16,34],
    [12,-8,20,22],[12,20,20,26],[-2,-9,13,-2],[8,-22,29,-6],[-3,-22,5,-5],
    [0,-22,14,-16],[-2,-30,14,-20],[-13,-36,3,-26],[-28,-33,-5,-26],
    [-39,-30,-21,-12],[-28,-30,-20,-23],[-24,21,-8,29],
    [-29,10,-20,25],[-34,-2,-25,15],[-35,-16,-27,4],
  ],
  // Larger composed frontages replace the former uniform 5.5m façade tiles.
  frontages:[
    {name:'A dual-arch warehouse',axis:'x',line:-22,side:-1,start:14,end:29,height:5.7,type:'warehouse',tint:0xe9e8df},
    {name:'A orange balcony apartments',axis:'z',line:29,side:1,start:-22,end:-6,height:8.8,type:'orangeApartment',tint:0xd78b61},
    {name:'Mid pale corner house',axis:'z',line:-5,side:-1,start:-4,end:12,height:7.5,tint:0xe6e6dc},
    {name:'Mid orange house',axis:'z',line:3,side:1,start:-2,end:11,height:8.4,tint:0xd48b67},
    {name:'Mid shuttered house',axis:'z',line:3,side:1,start:11,end:28,height:6.5,tint:0xe8e3d5},
    {name:'Banana balcony house',axis:'z',line:-25,side:1,start:4,end:10,height:7.6,type:'bananaHouse',tint:0xe1e4de},
    {name:'Banana high enclosure',axis:'z',line:-34,side:-1,start:4,end:10,height:4.5,tint:0xd5d1b9},
    {name:'Banana ochre end house',axis:'z',line:-20,side:1,start:10,end:21,height:6.7,tint:0xd4c28c},
    {name:'T courtyard balcony',axis:'z',line:-16,side:-1,start:29,end:42,height:7.4,type:'spawnHouse',tint:0xe4e7df},
    {name:'T courtyard gabled home',axis:'x',line:42,side:1,start:-16,end:0,height:8.2,tint:0xdadfd7},
    {name:'B pale house',axis:'z',line:-39,side:-1,start:-30,end:-12,height:7.4,tint:0xe6e5d7},
    {name:'B ochre storage',axis:'x',line:-12,side:1,start:-39,end:-35,height:5.2,tint:0xc5b879},
  ],
  spawns:{t:spawnRow(-11,31,Math.PI),ct:spawnRow(-10,-33,0)},
  sites:[{id:'A',position:v(21,-15,.72),rect:[19,-21,28,-14]},{id:'B',position:v(-25,-19),rect:[-38,-29,-22,-13]}],
  buyZones:{t:[-16,28,0,42],ct:[-13,-36,3,-26]},
  // Apartments are a genuine raised, roofed passage, not a painted alley.
  platforms:[{rect:[12,-8,20,18],height:1.2,kind:'wood'},{rect:[19,-21,28,-14],height:.72,kind:'brick'}],
  stairs:[{rect:[12,18,20,22],height:1.2,direction:'-z',steps:6},{rect:[12,-12,20,-8],height:1.2,direction:'+z',steps:6},
    {rect:[19,-14,28,-10],height:.72,direction:'-z',steps:4},
    {rect:[16,-21,19,-15],height:.72,direction:'+x',steps:4}],
  ceilings:[box('wood',16,3.95,5,8,.3,26)],
  portals:[
    {name:'Mid arch',x:-1,z:23,axis:'x',width:8,opening:4.4,height:4.9,kind:'brick'},
    {name:'Arch',x:5,z:-24,axis:'x',width:14,opening:5.6,height:5.8,kind:'sandstone'},
    {name:'Banana arch',x:-24.5,z:15,axis:'x',width:9,opening:4.4,height:5.1,kind:'brick'},
    {name:'Apartments entrance',x:16,z:16,axis:'x',width:8,opening:3.4,height:4.4,bottom:1.2,kind:'plaster'},
  ],
  props:[
    crate(17,-13,2.6,1.45,2.3),box('wood',25,1.77,-19,2.5,2.1,2.5,{detail:'crate'}),
    crate(-23.2,-26,2.8,2.15,2.3),crate(-31.5,7,1.6,1.15,2.2),
    box('brick',-3.8,.52,10,1.5,1.04,3.3),box('sandstone',2,.5,-14,1.5,1,3),
    barrel(10,-21),
    box('wood',13,1.65,4,.7,1,3),box('wood',19,1.65,8,.7,1,3),
    box('wood',18,2.35,5,2,.16,2),
    ...[-.85,.85].flatMap(dx=>[-.85,.85].map(dz=>box('wood',18+dx,1.74,5+dz,.1,1.08,.1))),
  ],
  landmarks:[
    {kind:'bellTower',name:'Campanile',position:v(8,-29),height:15},
    {kind:'fountain',name:'B fountain',position:v(-31,-24),radius:1.55},
    {kind:'fountain',name:'T courtyard fountain',position:v(-12,38),radius:1.2},
        {kind:'laundry',name:'Banana laundry',position:v(-28,1),width:5.5,depth:2,height:4.4},
    {kind:'cypress',name:'Church cypress',position:v(-37,-27),height:7},
    {kind:'cypress',name:'Courtyard cypress',position:v(-14,29.5),height:6},
  ],
  routes:{
    A:{
      short:[v(-7,31),v(-1,29),v(-1,1),v(0,-5),v(9,-5),v(10,-10),v(10,-16),v(21,-16,.72),v(21,-15,.72)],
      long:[v(-7,31),v(-1,29),v(-1,-6),v(0,-13),v(0,-19),v(11,-19),v(21,-19,.72),v(21,-15,.72)],
      apartments:[v(-7,31),v(12,31),v(12,23),v(16,23),v(16,16,1.2),v(16,-7,1.2),v(14,-15),v(21,-16,.72),v(21,-15,.72)],
    },
    B:{banana:[v(-11,31),v(-12,25),v(-23,25),v(-24,18),v(-24.5,12),v(-29,11),v(-29,2),v(-31,-4),v(-31,-15),v(-29,-19),v(-25,-19)]},
  },
  callouts:[
    call('Bombsite A','A 包点',[8,-22,29,-6]),call('Bombsite B','B 包点',[-39,-30,-21,-12]),
    call('Apartments','公寓',[12,-8,20,22]),call('Banana','香蕉道',[-35,-16,-20,26]),
    call('Arch / Library','拱门 / 书房',[-2,-30,14,-20]),call('CT Spawn','CT 出生点',[-13,-36,3,-26]),
    call('CT Rotation','警家回防',[-28,-33,-5,-26]),call('A Long','A 大道',[-3,-22,5,-5]),
    call('A Short','A 近道',[-2,-9,13,-2]),call('Second Mid','侧道',[8,10,16,35]),
    call('Mid','中路',[-5,-4,3,28]),call('T Spawn','T 出生点',[-16,28,0,42]),
  ],
  previewCamera:{position:[24,4,-8],target:[20,2.3,-22],fov:74},
};

const mirage = {
  id:'de_mirage',name:'Mirage',theme:'desert',authored:true,style:'desert',authoredTransform:'reflect-x',
  floors:[
    [23,27,39,41],[20,-5,29,33],[34,-10,43,32],[28,-12,43,-4],
    [15,-25,36,-5],[-4,-14,5,23],[0,18,26,27],[0,-13,21,-5],
    [-8,-27,4,-12],[-1,-39,14,-27],[8,-32,25,-22],[-24,-35,3,-27],
    [-38,-30,-19,-12],[-23,-13,-2,-5],[-23,-23,-15,-8],
    [-34,-14,-25,22],[-28,18,5,27],[-2,22,29,31],[-8,-5,-4,18],
  ],
  frontages:[
    {name:'Mid blue plaster landmark',axis:'z',line:-8,side:-1,start:-5,end:18,height:8.6,type:'blueMid',tint:0x7ca8d4},
    {name:'Blue house front toward Window',axis:'x',line:-5,side:1,start:-18,end:-8,height:8.6,type:'blueMid',tint:0x7ca8d4},
    {name:'Mid red upper residence',axis:'z',line:5,side:1,start:5,end:18,height:8.8,tint:0xc38f7a},
    {name:'Connector plaster house',axis:'z',line:5,side:1,start:-5,end:5,height:6.5,tint:0xe7dfcb},
    {name:'Palace tall sandstone flank',axis:'z',line:43,side:1,start:-10,end:15,height:10.4,tint:0xd5bb91},
    {name:'Palace lower approach',axis:'z',line:43,side:1,start:15,end:32,height:7.4,tint:0xe3cfaa},
    {name:'A north palace',axis:'x',line:-25,side:-1,start:25,end:36,height:10.5,type:'palace',tint:0xd5c097},
    {name:'A upper wall',axis:'z',line:36,side:1,start:-25,end:-12,height:9.7,tint:0xdfca9f},
    {name:'T Mid white backdrop',axis:'x',line:31,side:1,start:0,end:20,height:8.4,tint:0xe9dfc8},
    {name:'B apartments ochre',axis:'z',line:-34,side:-1,start:-12,end:18,height:7.6,tint:0xd5c69e},
    {name:'B outer wall',axis:'z',line:-38,side:-1,start:-30,end:-12,height:5.4,tint:0xe4d4b6},
  ],
  spawns:{t:spawnRow(29,35,Math.PI),ct:spawnRow(3,-35,0)},
  sites:[{id:'A',position:v(27,-16),rect:[17,-24,35,-7]},{id:'B',position:v(-29,-21),rect:[-37,-29,-20,-13]}],
  buyZones:{t:[23,27,39,41],ct:[-1,-39,14,-27]},
  platforms:[{rect:[34,-4,43,24],height:1.2,kind:'sandstone'},
    {rect:[-21,-13,-7,-5],height:.9,kind:'concrete'},
    {rect:[-8,-13,-4,18],height:.9,kind:'concrete'},
    {rect:[-8,-25,4,-17],height:1.8,kind:'wood'},
    {rect:[-4,12,5,23],height:.6,kind:'cobble'}],
  stairs:[{rect:[34,24,43,28],height:1.2,direction:'-z',steps:6},{rect:[34,-8,43,-4],height:1.2,direction:'+z',steps:6},
    {rect:[-4,-12,-1,-9],height:.9,direction:'-x',steps:6,kind:'concrete'},
    {rect:[-8,18,-4,22],height:.9,direction:'-z',steps:6,kind:'concrete'},
    {rect:[-.5,-31,3.5,-25],height:1.8,direction:'+z',steps:9,kind:'wood'},
    {rect:[-23,-13,-21,-5],height:.9,direction:'+x',steps:4},
    {rect:[-21,-17,-15,-13],height:.9,direction:'+z',steps:6},
    {rect:[-4,6,5,12],height:.6,direction:'+z',steps:6},
    {rect:[-4,23,5,26],height:.6,direction:'-z',steps:3},
    {rect:[5,18,9,23],height:.6,direction:'-x',steps:4}],
  ceilings:[box('wood',38.5,5.1,10,9,.35,28),box('plaster',-29.5,3.9,4,9,.35,28),box('wood',-14.5,3.8,-31,15,.3,8),box('wood',-2,5.3,-21,12,.3,8)],
  portals:[
    {name:'A Ramp',x:24.5,z:3,axis:'x',width:9,opening:4.6,height:5,kind:'sandstone'},
    {name:'Connector',x:5,z:-9,axis:'z',width:8,opening:3.7,height:5.2,kind:'plaster',shape:'pointed',spring:2.25,peak:3.7},
    {name:'B apartments',x:-29.5,z:-9,axis:'x',width:9,opening:4.4,height:3.8,kind:'plaster'},
    {name:'Market door',x:-20,z:-28,axis:'z',width:8,opening:3.8,height:4.2,kind:'sandstone'},
    {name:'Palace door',x:38.5,z:21,axis:'x',width:9,opening:4.4,height:4.8,bottom:1.2,kind:'sandstone'},
    {name:'Window',x:-2,z:-17,axis:'x',width:12,opening:4,height:6.5,kind:'plaster',sill:2.65,shape:'rectangular',peak:4.75,tint:0xe2d7c4},
  ],
  // Elevated CT-side room, with short internal boost steps. Mid has no fake
  // exterior staircase: Window is an overlook/drop, with a real CT return route.
  extraSteps:[
    box('wood',-2,1.05,-19.5,3,2.1,2,{walkable:true}),
    box('wood',-2,1.2,-18.05,3,2.4,.9,{walkable:true}),
  ],
  props:[
    // A cover is authored ordnance racks in csReferenceArchitecture, not generic crates.
    crate(17,-6.9,2,1.1,2.4),crate(-33,-25,2.4,2.2,2.4),crate(-24,-17,2.5,1.55,2.5),
    box('wood',-3,1.225,12,1.2,1.25,2.3,{detail:'crate'}),crate(-25,23,2,1.3,2),
    box('wood',-26.2,1,-1,.8,2,3),box('wood',-17.5,.5,-33,4,1,1.1),
    barrel(35,36),barrel(36,36),barrel(-36,-15),
  ],
  landmarks:[
    {kind:'palm',name:'A palm',position:v(33,-9),height:7.5},
    {kind:'palm',name:'B palm',position:v(-36,-27),height:8},
    {kind:'palm',name:'T palm',position:v(37,38),height:7},
    {kind:'canopy',name:'B market awning',position:v(-21,-24),width:3,depth:4,height:3.5},
    {kind:'canopy',name:'A ticket booth',position:v(17,-22),width:3,depth:2.5,height:3},
    {kind:'minaret',name:'Old town minaret',position:v(-7,-31),height:15},
  ],
  routes:{
    A:{
      ramp:[v(31,34),v(25,30),v(25,10),v(24.5,3),v(25,-7),v(27,-10),v(27,-16)],
      palace:[v(31,34),v(38,30),v(38.5,23,1.2),v(38.5,0,1.2),v(38.5,-9),v(32,-11),v(27,-12),v(27,-16)],
      connector:[v(31,34),v(25,25),v(2,22,.6),v(1,6,.1),v(1,-9),v(11,-9),v(21,-9),v(27,-10),v(27,-16)],
    },
    B:{
      apartments:[v(31,34),v(25,28),v(0,27),v(-20,23),v(-29,20),v(-29.5,0),v(-29.5,-9),v(-29,-21)],
      short:[v(31,34),v(25,25),v(2,22,.6),v(1,6,.1),v(0,-10.5),v(-6,-10.5,.9),v(-10,-8,.9),v(-19,-10,.9),v(-19,-18),v(-19,-21),v(-24,-22),v(-29,-21)],
    },
  },
  callouts:[
    call('Bombsite A','A 包点',[15,-25,36,-5]),call('Bombsite B','B 包点',[-38,-30,-19,-12]),
    call('Palace','宫殿',[34,-8,43,28]),call('A Ramp','A 坡',[20,-5,29,27]),
    call('Connector','拱门',[5,-13,21,-5]),call('Window','VIP 窗口',[-8,-27,4,-12]),
    call('B Short / Catwalk','B 小道',[-23,-23,-4,-5]),call('Mid Catwalk','中路小道',[-8,-5,-4,18]),call('B Apartments','B 公寓',[-34,-14,-25,22]),
    call('Apartments approach','B 公寓入口',[-28,18,5,31]),call('Market','超市',[-24,-35,3,-27]),
    call('CT Spawn','CT 出生点',[-1,-39,14,-27]),call('Mid','中路',[-4,-14,5,23]),
    call('T Spawn','T 出生点',[23,27,39,41]),call('T Mid','匪家中路',[0,18,26,31]),
  ],
  previewCamera:{position:[-2,3.7,-18.5],target:[-2,3.7,10],fov:74},
};

// Keep source coordinates separate from public world-space data. Mirage's
// world-space X bake puts blue Mid/catwalk LEFT and Connector RIGHT from Window.
export const AUTHORED_MAP_SOURCES = Object.freeze({de_inferno:inferno,de_mirage:mirage});
export const CLASSIC_MAPS = Object.freeze({de_inferno:inferno,de_mirage:reflectMapDefinitionX(mirage)});
export const classicMapDefinitions = CLASSIC_MAPS;
export function getClassicMap(id) { return CLASSIC_MAPS[id] || null; }
