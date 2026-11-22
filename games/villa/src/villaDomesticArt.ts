import * as THREE from 'three';

/** All marks belong to the house: the watercourse, garden specimens and the
 * little glasshouse recur in its prints, field notes and privately bound books.
 * One opaque, scene-owned sheet; no text meshes, fonts, image fetches or decals. */
export const HOUSE_TITLES = [
  'The Mill Reach', 'Under the Hornbeams', 'Stone & Sill', 'Twelve Kitchen Herbs',
  'Waders at Dusk', 'Limewash Notebook', 'Orchard Weather', 'The Long Border',
  'Flood Marks', 'A Cabinet of Seeds', 'Winter Glass', 'A Potter’s Kiln',
  'Rush and Sedge', 'Garden Letters', 'Apricot Preserves', 'Ways of Seeing Rain',
  'Alder Coppice', 'The North Windows', 'A Book of Joinery', 'Collected Walks',
  'Vespers for Viola', 'Drawing the Eaves', 'River Almanac', 'The Indigo Room',
] as const;
const cloth = ['#475e59', '#8a594b', '#a69170', '#536474', '#626c42', '#71575c', '#a76e4a', '#496568'];
export type PrintTile = readonly [x: number, y: number, w: number, h: number];
export const HOUSE_PRINT = {
  water: [5,5,546,162], herbarium: [5,173,546,161], glasshouse: [5,340,546,164],
  notes: [559,5,225,152], letter: [790,5,226,152], postcard: [559,164,225,149],
  specimen: [19,175,516,157], figUpper: [790,164,101,149], figLower: [897,164,86,149], figBark: [988,164,28,149], loam: [854,405,78,94], brick: [559,321,150,178], char: [716,321,131,178],
  endGrain: [854,321,78,78], ash: [938,321,78,178],
} as const satisfies Record<string, PrintTile>;
const edition = (i: number) => ((Math.floor(i) % HOUSE_TITLES.length) + HOUSE_TITLES.length) % HOUSE_TITLES.length;
export const jacketTile = (i: number): PrintTile => [5 + (edition(i)%8)*128, 513 + Math.floor(edition(i)/8)*94, 118, 84];
export const spineTile = (i: number): PrintTile => [5 + (edition(i)%4)*256, 795 + Math.floor(edition(i)/4)*38, 245, 30];
export const inkUV = ([x,y,w,h]: PrintTile, u: number, v: number): [number, number] => [
  (x+1.5+Math.min(1,Math.max(0,u))*(w-3))/1024, 1-(y+h-1.5-Math.min(1,Math.max(0,v))*(h-3))/1024,
];
export function printChart(g: THREE.BufferGeometry, tile: PrintTile, flip = false) {
  const uv = g.getAttribute('uv');
  for(let i=0;i<uv.count;i++) uv.setXY(i,...inkUV(tile,uv.getX(i),flip ? 1-uv.getY(i) : uv.getY(i)));
  return g;
}

type C = CanvasRenderingContext2D;
type XY = readonly [number,number];
function path(c:C, pts:readonly XY[], color:string, width=1, fill=false) {
  c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p);
  if(fill) {c.closePath(); c.fillStyle=color; c.fill();} else {c.lineWidth=width; c.strokeStyle=color; c.stroke();}
}
function text(c:C,t:string,x:number,y:number,size:number,color:string,italic=false){
  c.fillStyle=color; c.font=`${italic?'italic ':''}${size}px Georgia, serif`; c.fillText(t,x,y);
}
function oval(c:C,x:number,y:number,rx:number,ry:number,angle:number,paint:string){
  c.fillStyle=paint; c.beginPath(); c.ellipse(x,y,rx,ry,angle,0,2*Math.PI); c.fill();
}
function leaf(c:C,x:number,y:number,dx:number,dy:number,width:number,color:string){
  const l=Math.hypot(dx,dy), nx=-dy/l*width,nz=dx/l*width;
  c.fillStyle=color;c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+dx*.22+nx,y+dy*.22+nz,x+dx*.64+nx,y+dy*.64+nz,x+dx,y+dy);
  c.bezierCurveTo(x+dx*.67-nx,y+dy*.67-nz,x+dx*.22-nx,y+dy*.22-nz,x,y);c.fill();
  path(c,[[x,y],[x+dx*.76,y+dy*.76]],'#ddd4ab',.65);
}
// Reeds at Stone Ford. The river runs into the distance between opposite banks.
// Ink lines describe masonry beds, bark and broken reflections; the paper stays
// exposed in highlights. Work at the proportions of the print actually framed.
function watercourse(c:C){
  c.save();c.scale(546/392,1);
  const wash=(d:string,draw:()=>void)=>{c.fillStyle=d;c.beginPath();draw();c.closePath();c.fill();};
  const stroke=(ink:string,w:number,draw:()=>void)=>{c.strokeStyle=ink;c.lineWidth=w;c.beginPath();draw();c.stroke();};
  c.fillStyle='#e9dfbc';c.fillRect(0,0,392,162);c.fillStyle='#d4dccf';c.fillRect(7,7,378,123);
  c.save();c.beginPath();c.rect(7,7,378,133);c.clip();
  // A veil of high cloud is pulled sideways with a dry brush, never a skyline polygon.
  for(let i=0;i<10;i++)stroke(i%3?'#f1e9cd8c':'#b9c7bd5e',1+i%3,()=>{
    const x=15+((i*97)%320),y=16+((i*7)%43);c.moveTo(x,y);c.bezierCurveTo(x+9,y-1,x+18,y-4,x+34+i*1.8,y-2);
  });
  wash('#a6b6a0',()=>{c.moveTo(5,71);c.bezierCurveTo(45,71,61,63,87,64);c.bezierCurveTo(120,64,126,56,147,60);c.bezierCurveTo(181,68,215,46,238,49);c.bezierCurveTo(280,54,286,38,316,47);c.bezierCurveTo(338,53,369,42,388,42);c.lineTo(388,112);c.lineTo(5,112);});
  wash('#81957f',()=>{c.moveTo(3,77);c.bezierCurveTo(53,70,89,76,118,67);c.bezierCurveTo(153,60,166,70,199,64);c.bezierCurveTo(250,65,254,56,286,59);c.bezierCurveTo(323,51,353,64,386,53);c.lineTo(389,108);c.lineTo(3,106);});
  // Lower wooded shore with pale willow gaps and short alder crowns. Avoid an
  // equally spaced comb: the copper-plate hatching runs into the silhouette.
  for(let i=0;i<84;i++){
    const x=5+i*4.61,bed=80-16*x/392+2.1*Math.sin(x*.047),h=3+(1+Math.sin(i*2.19))*(2.3+1.9*Math.sin(x*.095));
    stroke(i%3?'#6a826d':'#82937c',.82,()=>{c.moveTo(x-3,bed);c.bezierCurveTo(x-6,bed-h*.47,x-3,bed-h-2,x-1,bed-h);c.bezierCurveTo(x+2,bed-h-3,x+4,bed-h*.44,x+5,bed);});
    if(i%3)path(c,[[x-1,bed-1],[x+1,bed-h*.57]],'#647a665e',.85);
  }
  wash('#c1ccc0',()=>{c.moveTo(8,84);c.bezierCurveTo(100,78,126,82,181,77);c.bezierCurveTo(238,73,306,78,386,67);c.lineTo(386,143);c.lineTo(7,143);});
  // The left flood-bank swings out then back in behind the bridge abutment.
  wash('#8e9779',()=>{c.moveTo(7,77);c.bezierCurveTo(57,75,103,74,161,76);c.bezierCurveTo(162,80,122,78,111,81);c.bezierCurveTo(81,85,68,87,77,91);c.bezierCurveTo(85,94,115,92,128,96);c.bezierCurveTo(82,98,68,104,50,108);c.bezierCurveTo(40,117,17,122,7,124);});
  wash('#91977b',()=>{c.moveTo(388,71);c.bezierCurveTo(321,74,303,81,263,82);c.bezierCurveTo(284,84,304,82,314,85);c.bezierCurveTo(311,92,251,95,222,101);c.bezierCurveTo(201,104,207,107,176,114);c.bezierCurveTo(186,117,180,124,142,139);c.lineTo(388,140);});
  wash('#677963',()=>{c.moveTo(390,91);c.bezierCurveTo(349,89,338,94,326,97);c.bezierCurveTo(301,105,253,107,236,117);c.bezierCurveTo(260,118,228,132,207,141);c.lineTo(390,141);});
  for(let i=0;i<38;i++){
    const y=83+i*1.44, x=96+26*Math.sin(i*2.21)+5*Math.cos(i*.71);
    stroke(i%3?'#f0e7c98a':'#8a9c8c',.66+(i%4)*.12,()=>{c.moveTo(x,y);c.quadraticCurveTo(x+7,y-1,x+15,y-.3);c.lineTo(x+23+(i%7)*2.3,y-.9);});
  }
  // Parapet slopes to the bank at the right; stone piers and their reflected
  // undersides narrow with distance. The cream negative space IS the opening.
  wash('#aba488',()=>{c.moveTo(114,79);c.lineTo(115,73);c.quadraticCurveTo(149,60,194,66);c.lineTo(218,68);c.lineTo(219,74);c.lineTo(211,75);c.bezierCurveTo(210,68,201,67,199,75);c.lineTo(194,75.5);c.bezierCurveTo(191,65,177,66,173,76.5);c.lineTo(167,77);c.bezierCurveTo(164,66,147,67,142,78);c.lineTo(136,79);c.bezierCurveTo(134,71,123,71,121,80);});
  stroke('#586659',1.25,()=>{c.moveTo(113,73);c.quadraticCurveTo(161,57,217,68);});
  for(let i=0;i<23;i++){const x=117+i*4.1,y=72-6.6*Math.sin(i/22*Math.PI*.93);path(c,[[x,y],[x+.6,y+2.3]],i%3?'#817d68':'#d3c3a0',.8);}
  for(const [x,y,w] of [[135,79,6],[167,77,7],[194,75,5]]){path(c,[[x,y],[x+w,y-.6],[x+w*.7,y+2.5],[x+1,y+3.5]],'#849181',1,true);path(c,[[x-2,y+4.5],[x+w+3,y+4.2]],'#d9dac2',.8);}
  // A single old pollard, with fissured trunk and individual sequences of
  // twig / leaf groups. It crosses the reflection and anchors the foreground.
  const tree=(x:number,y:number,s:number)=>{c.save();c.translate(x,y);c.scale(s,s);
    wash('#695f49',()=>{c.moveTo(-6,0);c.bezierCurveTo(-1,-13,-6,-23,-2,-38);c.lineTo(-4,-47);c.lineTo(1,-50);c.lineTo(5,-42);c.quadraticCurveTo(0,-25,3,-15);c.lineTo(7,1);});
    for(let j=0;j<10;j++){
      const t=j/9,dx=-24+t*46,dy=-56-12*Math.sin(t*Math.PI)-5*Math.sin(3*j);
      stroke(j%3?'#596451':'#776e54',1.3,()=>{c.moveTo(0,-39);c.quadraticCurveTo(dx*.64,-46,dx*.68,dy+9);c.lineTo(dx,dy);});
      for(let k=0;k<4;k++){
        const side=k%2?-1:1,px=dx*.7+(dx*.3)*k/4,py=dy+8-k*2.4;
        stroke('#6a785f',.7,()=>{c.moveTo(px,py);c.quadraticCurveTo(px+side*3,py-3,px+side*5,py-6);});
        for(let v=0;v<4;v++)leaf(c,px+side*v,py-v,side*(3.6+1.1*Math.sin(v+j)),1.6+.6*Math.cos(j+k),1.6,(j+v)%3?'#849374':'#a4a786');
      }
    }
    path(c,[[-4,0],[-1,-13],[-2,-21],[0,-34]],'#c1ab83',.95);path(c,[[2,0],[1,-10],[2,-20]],'#4c5549',1);c.restore();
  };
  tree(329,108,.72);tree(358,121,1.29);
  // Clumps of sedge and stones cut across the bank: draw in the local slope.
  for(let j=0;j<32;j++){
    const x=205+j*5.7,y=136-12*Math.sin((j+4)*.12)+3.7*Math.sin(j*2.21);
    for(let i=0;i<3;i++)stroke(i===j%3?'#aeab85':'#536b5959',.70,()=>{c.moveTo(x,y);c.quadraticCurveTo(x-1+i,y-5-i*1.4,x-3+i*3,y-8-i);});
  }
  for(const [x,y,w] of [[61,102,11],[39,111,16],[23,116,9],[180,100,7],[205,97,5]]){
    wash('#8d9688',()=>{c.moveTo(x-w,y);c.quadraticCurveTo(x-3,y-w*.49,x+2,y-w*.46);c.quadraticCurveTo(x+w*.81,y-w*.48,x+w,y-.5);});
    path(c,[[x-w,y+.4],[x+w*.9,y]],'#64786c',.78);path(c,[[x-w*.5,y+2],[x+w*1.43,y+2.2]],'#e4e2cb',.78);
  }
  c.restore();c.strokeStyle='#9b937a';c.lineWidth=.65;c.strokeRect(6.8,6.7,378.2,133);
  text(c,'Stone Ford, after rain',9,152,6.6,'#756b56',true);text(c,'IV   /   THE MILL REACH',310,152,5.1,'#8a7f66');
  c.restore();
}
function botanical(c:C){
  const stems=[[97,143,-35,-113],[101,143,53,-94],[244,145,-10,-119],[246,145,63,-89],[379,144,34,-117]];
  for(let s=0;s<stems.length;s++){
    const [x,y,dx,dy]=stems[s];path(c,[[x,y],[x+dx*.3,y+dy*.43],[x+dx*.73,y+dy*.76],[x+dx,y+dy]],'#82785c',1.8);
    for(let i=1;i<=6;i++){const t=.16+i*.107, side=i%2?1:-1, lx=x+dx*t*.95,ly=y+dy*t;
      if(s<2)leaf(c,lx,ly,side*(18+12*(1-t)),dy*.17,5.3,s===1?'#798567':'#61795e');
      else if(s<4){path(c,[[lx,ly],[lx+side*15,ly-9],[lx+side*21,ly-13]],'#8e805d',.8);for(let j=0;j<5;j++)oval(c,lx+side*(14+j*2),ly-8-j*2.1,2.7,1.3,-side*.8,'#aa8051');}
      else {leaf(c,lx,ly,side*19,-12,3.8,'#7a7f62');for(let j=0;j<4;j++)oval(c,lx+side*(9+j*3),ly-4-j*.9,2.25,2.7,.4,'#8b5651');}
    }
  }
  text(c,'I.   BAY',53,156,8,'#71654d');text(c,'II.   OAT GRASS',211,156,8,'#71654d');text(c,'III.   MYRTLE',367,156,8,'#71654d');
}
function glasshouse(c:C){
  path(c,[[0,138],[63,106],[117,96],[179,98],[202,94],[261,92],[347,84],[420,97],[491,82],[546,86],[546,164],[0,164]],'#a5aa8c',1,true);
  path(c,[[0,164],[77,115],[155,102],[204,104],[196,109],[104,131],[77,164]],'#e4d2ae',1,true);
  path(c,[[86,100],[86,76],[160,40],[263,61],[263,93],[193,103]],'#c5cbc0',1,true);
  path(c,[[77,79],[154,36],[160,39],[245,52],[269,59],[262,63],[161,46],[88,82]],'#987c67',1,true);
  const pen='#5e6a61';path(c,[[85,100],[160,61],[263,76]],pen,1.55);path(c,[[85,100],[160,83],[263,94]],pen,1.4);
  path(c,[[159,45],[160,83]],pen,2);for(let j=1;j<9;j++){const t=j/9;path(c,[[161+t*101,47+t*16],[161+t*101,83+t*10]],pen,1.25);}
  for(let j=0;j<6;j++){const t=j/6;path(c,[[88+t*70,81-t*36],[88+t*70,99-t*16]],pen,1.35);}
  path(c,[[282,113],[282,101],[393,85],[546,95],[546,109],[396,97]],'#c4af8b',1,true);
  for(let i=0;i<12;i++){const x=303+i*19;const y=99-6*Math.sin(i*.45);path(c,[[x,y],[x+1,y-24]],pen,1.2);oval(c,x,y-24,7,14,-.1,'#7e896d');}
  for(let i=0;i<13;i++){const x=96+i*32;path(c,[[x-8,154],[x+2,147],[x-1,143]],'#879579',1);}
}
function writing(c:C,guest:boolean){
  path(c,[[111,1],[110,38],[112,148]],'#ae9578',2);
  text(c,guest?'North window, Sunday':'LOW WATER  /  May',9,18,8.5,'#52625c',guest);
  text(c,guest?'Dear Mara,':'Reach above the mill',9,35,9,'#625957',true);
  const lines=guest?['The rosemary you sent','is in the kitchen now.','We found three nests','by the old stone sill.','Come when it flowers.','A.']:['River down a hand.','Alder at the left bank.','Two swifts. First rain','just before the bells.'];
  lines.forEach((s,i)=>text(c,s,10+(i%2),49+i*11,7.5,'#665f58',true));
  if(guest){text(c,'The walled garden',124,117,8,'#646453',true);c.save();c.translate(121,26);c.scale(.18,.49);glasshouse(c);c.restore();}
  else {c.save();c.translate(123,16);c.scale(.18,.58);botanical(c);c.restore();text(c,'Bay, oat grass',133,122,7,'#675f4e',true);}
}
/** Colour studies of the two faces of a rubber fig leaf. The waxy, dark
 * adaxial face and the paler abaxial face have the same pinnate vein schedule.
 * Charts run petiole -> drip tip and margin -> midrib, not up the world axis. */
function ficusTissue(c:C,w:number,h:number,back:boolean){
  const cx=w*.5;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){
    const u=(x-cx)/cx,t=1-y/h,edge=Math.abs(u),fold=Math.cos(Math.PI*(u-.10)*1.53)*.35+.26*Math.sin(t*4.2+u*.7);
    const cell=.6*Math.sin(y*2.41+x*1.67)+.75*Math.sin(x*2.39-y*.87);
    const light=fold*12+(1-edge)*7+t*3.5+.7*cell+(u>0?2.1:-1.2);
    const rgb=back?[112+light*.87,132+light*.79,92+light*.68]:[50+light*.91,82+light,58+light*.72];
    c.fillStyle=`rgb(${rgb.map(Math.round).join(',')})`;c.fillRect(x,y,2,2);
  }
  for(const side of [-1,1]){
    for(let j=0;j<16;j++){
      const start=h*(.968-j*.058)+(side>0?1.3:0),reach=cx*(.975-.067*Math.cos(j*1.21));
      const lift=(9.6+7.2*Math.sin((j+1)*Math.PI/18))*(.92+.11*Math.sin(j*2.4+side));
      c.beginPath();c.moveTo(cx,start);c.bezierCurveTo(cx+side*reach*.29,start-lift*.11,cx+side*reach*.70,start-lift*.81,cx+side*reach,start-lift);
      c.strokeStyle=back?(j%3?'#b5b693b3':'#d3ca9eab'):(j%3?'#a0b28a70':'#bdc2977d');c.lineWidth=j%3?.77:1.13;c.stroke();
      for(let k=1;k<4;k++){
        const t=k/4,bx=cx+side*t*reach,by=start-lift*t*t;
        c.beginPath();c.moveTo(bx,by);c.quadraticCurveTo(bx+side*3,by-2.4,bx+side*(7+.87*k),by-5.8);
        c.strokeStyle=back?'#a2aa8580':'#92a48054';c.lineWidth=.61;c.stroke();
      }
    }
  }
  c.beginPath();c.moveTo(cx-1.7,h);c.quadraticCurveTo(cx-.63,h*.58,cx-.23,1);c.lineTo(cx+.42,1);c.quadraticCurveTo(cx+1.30,h*.64,cx+2.08,h);c.fillStyle=back?'#c8c39b':'#a2ac7c';c.fill();
  path(c,[[cx+.39,5],[cx+.81,h*.56],[cx+1.50,h]],back?'#e1cfa0':'#d0c18f',.86);
}
export function createDomesticPrintAtlas(){
  const canvas=document.createElement('canvas'); canvas.width=canvas.height=1024;
  const c=canvas.getContext('2d')!;c.fillStyle='#c1b493';c.fillRect(0,0,1024,1024);
  const panel=(r:PrintTile,bg:string,draw:()=>void)=>{const [x,y,w,h]=r;c.save();c.translate(x,y);c.beginPath();c.rect(0,0,w,h);c.clip();c.fillStyle=bg;c.fillRect(0,0,w,h);draw();c.restore();};
  panel(HOUSE_PRINT.water,'#dfd9bd',()=>watercourse(c));panel(HOUSE_PRINT.herbarium,'#e1d6b7',()=>botanical(c));panel(HOUSE_PRINT.glasshouse,'#dedcc6',()=>glasshouse(c));
  panel(HOUSE_PRINT.notes,'#eee3c7',()=>writing(c,false));panel(HOUSE_PRINT.letter,'#f3e6ce',()=>writing(c,true));
  panel(HOUSE_PRINT.postcard,'#e3dbc5',()=>{c.save();c.translate(9,9);c.scale(.378,.71);glasshouse(c);c.restore();text(c,'GLASSHOUSE   ·   NORTH GARDEN',11,140,8,'#544d45');});
  panel(HOUSE_PRINT.figUpper,'#506949',()=>ficusTissue(c,101,149,false));
  panel(HOUSE_PRINT.figLower,'#91a37e',()=>ficusTissue(c,86,149,true));
  let state=133;const rand=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
  panel(HOUSE_PRINT.figBark,'#8f8360',()=>{
    for(let y=0;y<149;y++){const t=(1-y/149);c.fillStyle=`rgb(${Math.round(128-25*t)},${Math.round(110+13*t)},${Math.round(82-4*t)})`;c.fillRect(0,y,28,1);}
    for(let i=0;i<92;i++){const x=rand()*28,y=rand()*149;path(c,[[x,y],[x+1.5+rand()*2,y-.17]],i%4?'#b8ac886e':'#685d4e91',.6+rand()*.6);}
    for(let i=0;i<6;i++){const y=9+i*25;path(c,[[0,y+.7],[7,y-.3],[16,y+.9],[27,y+.4]],'#817a5987',1.05);}
  });
  panel(HOUSE_PRINT.loam,'#4a3d31',()=>{
    for(let i=0;i<1950;i++){const x=rand()*78,y=rand()*94;c.fillStyle=i%4===0?'#a38a655e':i%3?'#231f1b56':'#665740d6';c.fillRect(x,y,.6+rand()*2.4,.5+rand()*1.1);}
    for(let i=0;i<37;i++){const x=rand()*78,y=rand()*94;path(c,[[x,y],[x+2.7,y-1.2],[x+4.6+rand()*2,y-1.0]],i%2?'#876e4e':'#342e28',.77);}
  });
  // Fired clay mottles, alligator checks and pale mineral dust occupy otherwise
  // unused space in the same opaque atlas. Grain has a direction on split wood.
  panel(HOUSE_PRINT.brick,'#785448',()=>{for(let j=0;j<22;j++){const x=rand()*150,y=rand()*178;oval(c,x,y,9+rand()*23,2+rand()*7,rand()*.22,'#483a341a');}for(let j=0;j<1100;j++){c.fillStyle=rand()<.57?'#d7ad822a':'#42352d40';c.fillRect(rand()*150,rand()*178,.6+rand()*2,.6+rand());}for(let j=0;j<29;j++){c.fillStyle=`rgba(36,33,31,${.32*(1-j/29)})`;c.fillRect(0,j*5,150,5);}});
  panel(HOUSE_PRINT.char,'#393331',()=>{for(let j=0;j<25;j++){const x=j*5.8+rand()*3;let y=-9;while(y<180){const dy=12+rand()*32;path(c,[[x,y],[x+3,y+dy*.46],[x-1,y+dy],[x-5,y+dy+2]],'#191d1d',1.3+rand()*1.7);path(c,[[x+1.3,y],[x+4,y+dy*.42]],'#aca494',.9);y+=dy+3;}}});
  panel(HOUSE_PRINT.endGrain,'#8f725a',()=>{for(let i=1;i<15;i++){c.strokeStyle=i%3?'#745743':'#ac8b65';c.lineWidth=.9;c.beginPath();c.ellipse(25,54,i*4.3,i*3.8,-.24,0,Math.PI*2);c.stroke();}for(let i=0;i<5;i++){const a=i*1.34;path(c,[[26+Math.cos(a)*11,54+Math.sin(a)*11],[23+Math.cos(a)*26,54+Math.sin(a)*24],[25+Math.cos(a)*62,54+Math.sin(a)*55]],'#493d33',1.6);}});
  panel(HOUSE_PRINT.ash,'#928b7c',()=>{for(let i=0;i<1300;i++){c.fillStyle=i%3?'#534d4944':'#ded6bd80';c.fillRect(rand()*78,rand()*178,.8+rand()*2.6,.9+rand()*2.2);}});
  HOUSE_TITLES.forEach((name,i)=>{
    const bg=cloth[i%cloth.length],foil=i%4===2?'#423d34':'#eddbac';
    panel(jacketTile(i),bg,()=>{
      for(let j=1;j<86;j+=2){c.fillStyle=j%4?'#efe7c30d':'#30272213';c.fillRect(0,j,118,.6);}
      c.strokeStyle=foil;c.lineWidth=1.1;if(i%3!==1)c.strokeRect(6,6,106,72);
      c.textAlign='center';text(c,'FIELD & HOUSE',59,20,6.3,foil);
      const words=name.split(' '), split=Math.ceil(words.length/2);text(c,words.slice(0,split).join(' '),59,40,12,foil);text(c,words.slice(split).join(' '),59,53,12,foil);
      path(c,[[47,66],[58,66],[62,63],[66,64],[70,62]],foil,.95);
    });
    panel(spineTile(i),bg,()=>{
      for(let j=0;j<246;j+=3){c.fillStyle='#120d0911';c.fillRect(j,0,.8,30);}
      if(i%3===0){c.fillStyle='#e4d4ad';c.fillRect(37,5,166,20);}
      if(i%3!==1)for(const x of [9,13,227,232])path(c,[[x,1],[x,29]],foil,x===9||x===232?1.3:.7);
      c.textAlign='center';text(c,name,119,19.8,13,i%3===0?'#423d35':foil);text(c,String(i+1).padStart(2,'0'),217,19,7,foil);
    });
  });
  const t=new THREE.CanvasTexture(canvas);t.name='house-impressions / library press';t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;
  return t;
}
