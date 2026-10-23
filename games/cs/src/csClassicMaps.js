// Original, metre-scale interpretations of the classic competitive layouts.
// No Valve geometry, textures, BSPs, or other downloaded map assets are used.
// Coordinates are [x,y,z]; floor rectangles are [minX,minZ,maxX,maxZ].
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
  spawns:{t:spawnRow(-11,31,Math.PI),ct:spawnRow(-10,-33,0)},
  sites:[{id:'A',position:v(21,-15),rect:[14,-21,28,-8]},{id:'B',position:v(-25,-19),rect:[-38,-29,-22,-13]}],
  buyZones:{t:[-16,28,0,42],ct:[-13,-36,3,-26]},
  // Apartments are a genuine raised, roofed passage, not a painted alley.
  platforms:[{rect:[12,-8,20,18],height:1.2,kind:'wood'}],
  stairs:[{rect:[12,18,20,22],height:1.2,direction:'-z',steps:6},{rect:[12,-12,20,-8],height:1.2,direction:'+z',steps:6}],
  ceilings:[box('wood',16,3.95,5,8,.3,26)],
  portals:[
    {name:'Mid arch',x:-1,z:23,axis:'x',width:8,opening:4.4,height:4.9,kind:'brick'},
    {name:'Arch',x:5,z:-24,axis:'x',width:14,opening:5.6,height:5.8,kind:'sandstone'},
    {name:'Banana arch',x:-24.5,z:15,axis:'x',width:9,opening:4.4,height:5.1,kind:'brick'},
    {name:'Apartments entrance',x:16,z:16,axis:'x',width:8,opening:3.4,height:4.4,bottom:1.2,kind:'plaster'},
  ],
  props:[
    crate(17,-13,2.6,1.45,2.3),crate(25,-19,2.5,2.1,2.5),crate(-35,-15,2.6,1.65,2.5),
    crate(-23.2,-26,2.8,2.15,2.3),crate(-31.5,7,1.6,1.15,2.2),
    box('brick',-3.8,.52,10,1.5,1.04,3.3),box('sandstone',2,.5,-14,1.5,1,3),
    barrel(-27.8,-8),barrel(-28.8,-8),barrel(-27.8,-9.1),barrel(10,-21),
    box('wood',13,1.65,4,.7,1,3),box('wood',19,1.65,8,.7,1,3),
    box('wood',26.5,.45,-8,3,.9,1),
    box('wood',18,2.35,5,2,.16,2),
    ...[-.85,.85].flatMap(dx=>[-.85,.85].map(dz=>box('wood',18+dx,1.74,5+dz,.1,1.08,.1))),
  ],
  landmarks:[
    {kind:'bellTower',name:'Campanile',position:v(8,-29),height:15},
    {kind:'fountain',name:'B fountain',position:v(-31,-24),radius:1.55},
    {kind:'fountain',name:'T courtyard fountain',position:v(-12,38),radius:1.2},
    {kind:'canopy',name:'A balcony canopy',position:v(26,-10),width:5,depth:3.2,height:3.6},
    {kind:'canopy',name:'Banana laundry',position:v(-28,1),width:5.5,depth:2,height:4.4},
    {kind:'cypress',name:'Church cypress',position:v(-37,-27),height:7},
    {kind:'cypress',name:'Courtyard cypress',position:v(-14,29.5),height:6},
  ],
  routes:{
    A:{
      short:[v(-7,31),v(-1,29),v(-1,1),v(0,-5),v(9,-5),v(10,-10),v(10,-16),v(21,-16),v(21,-15)],
      long:[v(-7,31),v(-1,29),v(-1,-6),v(0,-13),v(0,-19),v(11,-19),v(21,-19),v(21,-15)],
      apartments:[v(-7,31),v(12,31),v(12,23),v(16,23),v(16,16,1.2),v(16,-7,1.2),v(14,-15),v(21,-16),v(21,-15)],
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
  previewCamera:{position:[24,4,-10],target:[9,3,-23],fov:70},
};

const mirage = {
  id:'de_mirage',name:'Mirage',theme:'desert',authored:true,style:'desert',
  floors:[
    [23,27,39,41],[20,-5,29,33],[34,-10,43,32],[28,-12,43,-4],
    [15,-25,36,-5],[-4,-14,5,23],[0,18,26,27],[0,-13,21,-5],
    [-8,-27,4,-12],[-1,-39,14,-27],[8,-32,25,-22],[-24,-35,3,-27],
    [-38,-30,-19,-12],[-23,-13,-2,-5],[-23,-23,-15,-8],
    [-34,-14,-25,22],[-28,18,5,27],[-2,22,29,31],
  ],
  spawns:{t:spawnRow(29,35,Math.PI),ct:spawnRow(3,-35,0)},
  sites:[{id:'A',position:v(27,-16),rect:[17,-24,35,-7]},{id:'B',position:v(-29,-21),rect:[-37,-29,-20,-13]}],
  buyZones:{t:[23,27,39,41],ct:[-1,-39,14,-27]},
  platforms:[{rect:[34,-4,43,24],height:1.2,kind:'sandstone'}],
  stairs:[{rect:[34,24,43,28],height:1.2,direction:'-z',steps:6},{rect:[34,-8,43,-4],height:1.2,direction:'+z',steps:6}],
  ceilings:[box('wood',38.5,5.1,10,9,.35,28),box('plaster',-29.5,3.9,4,9,.35,28),box('wood',-14.5,3.8,-31,15,.3,8)],
  portals:[
    {name:'A Ramp',x:24.5,z:3,axis:'x',width:9,opening:4.6,height:5,kind:'sandstone'},
    {name:'Connector',x:11,z:-9,axis:'z',width:8,opening:3.7,height:5.2,kind:'sandstone'},
    {name:'B apartments',x:-29.5,z:-9,axis:'x',width:9,opening:4.4,height:3.8,kind:'plaster'},
    {name:'Market door',x:-20,z:-28,axis:'z',width:8,opening:3.8,height:4.2,kind:'sandstone'},
    {name:'Palace door',x:38.5,z:21,axis:'x',width:9,opening:4.4,height:4.8,bottom:1.2,kind:'sandstone'},
    {name:'Window',x:-2,z:-17,axis:'x',width:12,opening:4,height:5,kind:'sandstone',sill:1},
  ],
  // The window sill has climbable steps on both sides; no navigation teleport.
  extraSteps:[
    box('sandstone',-2,.125,-14,4,.25,1,{walkable:true}),
    box('sandstone',-2,.25,-15,4,.5,1,{walkable:true}),
    box('sandstone',-2,.375,-16,4,.75,1,{walkable:true}),
    box('sandstone',-2,.375,-18,4,.75,1,{walkable:true}),
    box('sandstone',-2,.25,-19,4,.5,1,{walkable:true}),
    box('sandstone',-2,.125,-20,4,.25,1,{walkable:true}),
  ],
  props:[
    crate(22,-16,2.7,2.15,2.8),crate(31,-21,3,2.4,2.6),crate(31,-18.9,2.4,1.2,1.5),
    crate(17,-6.9,2,1.1,2.4),crate(-33,-25,2.4,2.2,2.4),crate(-24,-17,2.5,1.55,2.5),
    crate(-3,12,1.2,1.25,2.3),crate(-25,23,2,1.3,2),
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
      connector:[v(31,34),v(25,25),v(2,22),v(1,6),v(1,-9),v(11,-9),v(21,-9),v(27,-10),v(27,-16)],
    },
    B:{
      apartments:[v(31,34),v(25,28),v(0,26),v(-20,23),v(-29,20),v(-29.5,0),v(-29.5,-9),v(-29,-21)],
      short:[v(31,34),v(25,25),v(2,22),v(1,6),v(1,-8),v(-10,-8),v(-19,-10),v(-19,-18),v(-19,-21),v(-24,-22),v(-29,-21)],
    },
  },
  callouts:[
    call('Bombsite A','A 包点',[15,-25,36,-5]),call('Bombsite B','B 包点',[-38,-30,-19,-12]),
    call('Palace','宫殿',[34,-8,43,28]),call('A Ramp','A 坡',[20,-5,29,27]),
    call('Connector','拱门',[5,-13,21,-5]),call('Window','VIP 窗口',[-8,-27,4,-12]),
    call('B Short / Catwalk','B 小道',[-23,-23,-4,-5]),call('B Apartments','B 公寓',[-34,-14,-25,22]),
    call('Apartments approach','B 公寓入口',[-28,18,5,31]),call('Market','超市',[-24,-35,3,-27]),
    call('CT Spawn','CT 出生点',[-1,-39,14,-27]),call('Mid','中路',[-4,-14,5,23]),
    call('T Spawn','T 出生点',[23,27,39,41]),call('T Mid','匪家中路',[0,18,26,31]),
  ],
  previewCamera:{position:[29,3.5,-7],target:[19,2.3,-22],fov:74},
};

export const CLASSIC_MAPS = Object.freeze({de_inferno:inferno,de_mirage:mirage});
export const classicMapDefinitions = CLASSIC_MAPS;
export function getClassicMap(id) { return CLASSIC_MAPS[id] || null; }
