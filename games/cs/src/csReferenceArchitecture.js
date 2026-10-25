import * as T from 'three';
import { addFoliage } from './csMapDecorations.js';

// Original geometry authored after visual inspection, NOT extracted map assets.
// Inferno: https://www.counter-strike.net/inferno/ (CS:GO after-images).
// Mirage: https://steamcommunity.com/sharedfiles/filedetails/?id=152508932
// Supplemental official storefront Window→Mid image: capture date/version unknown.
// Dimensions below are gameplay adaptations, not survey measurements of screenshots.
const key=(x,z)=>`${x},${z}`;
const stone=0xd9d6c8, ivory=0xf1eee0, dark=0x343b38;

function beam(w,a,b,r=.025,kind='metal',tint=0x67675c) {
  const from=new T.Vector3(...a),to=new T.Vector3(...b),delta=to.clone().sub(from);
  const g=new T.CylinderGeometry(r,r,delta.length(),5);
  g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize()));
  g.translate(...from.add(to).multiplyScalar(.5).toArray());w.appendGeometry(kind,g,tint);
}
function cable(w,a,b,sag=.3) {
  let last=a;
  for(let i=1;i<=10;i++){const t=i/10,p=a.map((n,j)=>n+(b[j]-n)*t);p[1]-=4*sag*t*(1-t);beam(w,last,p,.018);last=p;}
}
// A façade's local coordinates: u along the street, d into the playable space.
function facadeTools(w,{axis,line,side}) {
  const p=(u,y,d=0)=>axis==='x'?[u,y,line-side*d]:[line-side*d,y,u];
  const box=(kind,u,y,d,width,height,depth,tint=0xffffff,solid=false)=>w.addBox(kind,p(u,y,d),axis==='x'?[width,height,depth]:[depth,height,width],{solid,tint});
  return {p,box};
}
function prism(w,points,depth,point,kind,tint) {
  const shape=new T.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1});
  const pos=g.attributes.position;
  for(let i=0;i<pos.count;i++)pos.setXYZ(i,...point(pos.getX(i),pos.getY(i),pos.getZ(i)-depth/2));
  // Callers use proper rotations (not reflected local frames), preserving winding.
  g.computeVertexNormals();w.appendGeometry(kind,g,tint);
}
// Ring segments are true wedge profiles, not eight rectangular stair-step tops.
function archRing(w,f,u,bottom,width,rise,thickness,depth=.23,kind='sandstone',tint=stone,shape='round',crownRise) {
  const {box}=facadeTools(w,f),r=width/2,spring=bottom+rise;
  const crown=crownRise??(shape==='pointed'?rise*.58:r*.58);
  const curve=t=>shape==='pointed'?crown*(1-Math.abs(t)):crown*Math.sqrt(Math.max(0,1-t*t));
  for(const s of [-1,1])box(kind,u+s*(r+thickness/2),bottom+rise/2,0,thickness,rise,depth,tint);
  for(let i=0;i<16;i++){
    const a=-1+i/8,b=-1+(i+1)/8;
    // Convert to world through a rotation (not reflection), keeping winding.
    const point=(x,y,d)=>f.axis==='x'?[u+x,y,f.line+d]:[f.line-d,y,u+x];
    const outerA=curve(a)+thickness,outerB=curve(b)+thickness;
    prism(w,[[a*r,spring+curve(a)],[b*r,spring+curve(b)],[b*(r+thickness),spring+outerB],[a*(r+thickness),spring+outerA]],depth,point,kind,tint);
  }
}
function wearPatch(w,f,u,y,width,height,seed,kind='brick',tint=0xb4aea2){
  const {p}=facadeTools(w,f),points=[];
  for(let i=0;i<9;i++){const a=i*Math.PI*2/9,r=.8+.2*Math.sin(seed*7+i*3.7);points.push(p(u+Math.cos(a)*width*.5*r,y+Math.sin(a)*height*.5*r,.012));}
  const positions=[],flip=f.axis==='x'?f.side===1:f.side===-1;
  for(let i=1;i<points.length-1;i++){const tri=[points[0],points[i],points[i+1]];if(flip)[tri[1],tri[2]]=[tri[2],tri[1]];positions.push(...tri.flat());}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();w.appendGeometry(kind,g,tint);
}
function window(w,f,u,y,{width=1.25,height=1.85,shutters=true,tint=0xb1b6ad,variant=0}={}) {
  const {box}=facadeTools(w,f),closed=shutters&&variant%3===0;
  // Thin painted reveals, not sandstone blocks wrapped around every opening.
  box(closed?'paint':'glass',u,y,.035,width,height,.04,closed?tint:variant%2?0x91a4aa:0xa3b1af);
  for(const s of [-1,1])box('paint',u+s*(width/2+.045),y,.095,.085,height+.15,.12,0xe7e6dc);
  for(const s of [-1,1])box('paint',u,y+s*(height/2+.04),.10,width+.18,.08,.15,0xe7e6dc);
  if(closed){
    box('paint',u,y,.09,.035,height,.045,0x878e87);
    for(let j=0;j<5;j++)box('paint',u,y-height*.40+j*height*.20,.085,width,.035,.04,0x909b91);
  }else{
    box('paint',u,y,.07,.045,height,.05,0xc8ccc2);box('paint',u,y,.07,width,.045,.05,0xc8ccc2);
    if(shutters)for(const side of variant%3===1?[-1]:[-1,1]){
      box('paint',u+side*(width*.76),y,.10,width*.4,height,.08,tint);
      for(let j=0;j<4;j++)box('paint',u+side*(width*.76),y-height*.36+j*height*.24,.15,width*.36,.035,.035,0x8c968c);
    }
  }
}
function balcony(w,f,u,y,width) {
  const {p,box}=facadeTools(w,f);
  box('sandstone',u,y,.65,width,.22,1.6,stone,true);
  for(const dy of [.25,1.15])box('metal',u,y+dy,1.43,width,.055,.055,dark);
  for(let j=0;j<=Math.floor(width/.28);j++)box('metal',u-width/2+j*.28,y+.7,1.43,.035,1,.035,dark);
  for(const s of [-1,1]){
    beam(w,p(u+s*(width/2-.3),y-.7,.2),p(u+s*(width/2-.3),y-.12,1.3),.06,'wood');
    box('metal',u+s*width/2,y+1.15,.8,.055,.055,1.3,dark);
  }
}
function facade(w,f) {
  const {axis,line,side,start,end,height:h,tint=ivory,type='house',depth=3.2,detailed=false}=f;
  const span=end-start,mid=(start+end)/2,{p,box}=facadeTools(w,f),italian=w.definition.style==='italian';
  // Single architectural mass per authored frontage, not 5.5m repeated tiles.
  box('plaster',mid,h/2,-depth/2,span+.02,h,depth,tint,true);
  box('paint',mid,.10,.025,span,.20,.12,0xbabeb4);
  box(italian?'wood':'paint',mid,h-.12,.18,span+.35,.15,.38,0xe0dfd1);
  if(italian)w.addPitchedRoof(axis,mid,line+side*depth/2,span+.5,depth+.7,h,Math.min(1,depth*.25));
  else {
    box('paint',mid,h+.10,-depth/2,span+.28,.20,depth+.25,0xe7e1d0);
    box('plaster',mid,h+.45,.02,span,.55,.30,tint);
    for(const u of [start+.22,end-.22])box('paint',u,h+.62,.02,.4,.8,.4,0xe7e1d0);
  }
  if(type==='warehouse') {
    for(const u of [start+span*.25,start+span*.75]){
      const width=span*.40;
      // Shutters are CLOSED: a shallow framed recess over the colliding mass.
      const r=width/2,spring=2.5,rise=r*.58,outline=[[-r,0],[r,0],[r,spring]];
      for(let i=1;i<=16;i++){const a=i*Math.PI/16;outline.push([Math.cos(a)*r,spring+Math.sin(a)*rise]);}
      const point=(a,y,d)=>axis==='x'?[u+a,y,line-side*.12+d]:[line-side*.12-d,y,u+a];
      prism(w,outline,.10,point,'paint',0x969c9c);
      for(let j=0;j<14;j++){
        const y=.24+j*.29,fraction=Math.max(0,(y-spring)/rise),ribWidth=width*Math.sqrt(Math.max(0,1-fraction*fraction));
        if(ribWidth>.1)box('paint',u,y,.20,ribWidth,.045,.07,0x727b79);
      }
      archRing(w,{...f,line:line-side*.32},u,0,width,2.5,.33,.25,'brick',0xc0b6a4);
      box('sandstone',u,4.85,.15,.65,.55,.13,0x7d827a);
    }
    for(const u of [start+.22,mid,end-.22]){
      box('brick',u,2.22,.2,.48,4.44,.5,0xb7aba1);
      box('sandstone',u,3.0,.29,.78,.18,.68,stone);
    }
    box('sandstone',mid,4.3,.15,span,.2,.3,stone);
  } else if(type==='palace') {
    // The historic Workshop A view has a tall, ornamented pointed entrance
    // behind the ordnance stacks, rather than another residential window row.
    const point=(a,y,d)=>axis==='x'?[mid+a,y,line-side*.16+d]:[line-side*.16-d,y,mid+a];
    prism(w,[[-1.7,0],[1.7,0],[1.7,3.5],[0,5.53],[-1.7,3.5]],.12,point,'wood',0x977357);
    archRing(w,{...f,line:line-side*.35},mid,0,3.4,3.5,.30,.30,'sandstone',0xeee0bc,'pointed');
    archRing(w,{...f,line:line-side*.30},mid,0,4.1,3.5,.17,.22,'sandstone',0xc4ad82,'pointed');
    for(const y of [6.1,6.55])box('sandstone',mid,y,.12,span,.2,.35,stone);
    for(let j=0;j<Math.floor(span/.45);j++)box('sandstone',start+.3+j*.45,6.35,.18,.22,.25,.3,0xbba884);
    for(const s of [-1,1])box('sandstone',mid+s*2.7,3,.16,.48,6,.4,stone);
  } else {
    // Deliberate floors and bay spacing; each street face shares its own rhythm.
    const bays=span<3?0:Math.max(1,Math.floor((span-1)/3.4));
    const levels=h>7.8&&detailed?[3.65,6.45]:h>5?[3.65]:[2.8];
    for(const y of levels)for(let i=0;i<bays;i++)window(w,f,start+(i+.5)*span/bays,y,{shutters:italian&&(detailed||i%3===0),tint:italian?0xb5b9ae:0x9eaeac,variant:detailed?i+Math.round(y):i*3,width:type==='blueMid'?1.35:1.15,height:type==='blueMid'?2.1:1.7});
    if(span>5){
      box('paint',mid,1.2,.08,1.45,2.4,.08,italian?0xaeb3a5:0x9aa9a5);
      for(const s of [-1,1])box('paint',mid+s*.79,1.3,.16,.12,2.6,.13,0xe4e3d7);
      if(italian&&detailed)archRing(w,{...f,line:line-side*.29},mid,0,1.45,2.0,.12,.16,'paint',0xe4e3d7);
      else box('paint',mid,2.53,.16,1.75,.12,.16,0xe4e3d7);
    }
    if(type==='orangeApartment'||type==='bananaHouse'||type==='spawnHouse')balcony(w,f,mid,2.7,Math.min(5,span*.65));
    if(italian&&detailed&&bays>0){
      const u=start+.5*span/bays;
      box('paint',u,2.72,.20,1.35,.18,.35,0xb98567);
      const leaves=new T.PlaneGeometry(1.26,.42);if(axis==='z')leaves.rotateY(Math.PI/2);leaves.translate(...p(u,2.96,.25));
      w.appendGeometry('foliage',leaves,0xd2dfb6,{preserveUV:true});
    }
  }
  // Alternating quoin widths are masonry cornerwork, not a flat brown stripe.
  if(italian&&detailed)for(const u of [start+.18,end-.18])for(let j=0;j<Math.floor(h/.65);j++)box('paint',u,.32+j*.65,.035,j%2?.30:.45,.60,.08,0xc9cbc1);
  // Sparse small exposed masonry only. Pale flat wear polygons looked like
  // paper stickers in the rendered audit; plaster wear belongs to its photo.
  for(let i=0;i<Math.min(5,Math.ceil(span/3));i+=3){
    const u=start+.35+(i+.2)*Math.max(.5,(span-.8)/Math.min(5,Math.ceil(span/3)));
    wearPatch(w,f,u,.23+(i%2)*.10,.48+(i%2)*.20,.30+(i%2)*.12,i+line,'brick',0xd2c9b9);
  }
  if(span>4&&italian&&detailed){
    const u=end-.52;
    beam(w,p(u,.2,.29),p(u,h-.3,.29),.055,'metal',0x686f67);
    beam(w,p(start,h-.04,.45),p(end,h-.04,.45),.07,'metal',0x77786d);
    for(let j=0;j<Math.floor(span/1.1);j++)box('wood',start+.5+j*1.1,h-.30,.32,.12,.22,.75,0xa59d87);
    box('plaster',start+span*.26,h+.45,-depth*.6,.65,1.4,.72,stone);
    for(const offset of [-.17,.17])w.addCylinder('roof',p(start+span*.26+offset,h+1.25,-depth*.6),.105,.65,{solid:false,tint:0x8d8070});
  }
  if(type==='blueMid'){
    box('paint',mid,2.5,.08,span,.15,.20,0xe4e3d6);
    for(const y of [h-1.1,h-1.5])box('wood',mid,y,.36,span*.7,.1,.7,0x92958a);
  }
  w.architectureFeatures.push({type,name:f.name||type,axis,line,start,end,height:h});
}

export function buildReferenceFacades(w) {
  const lines=new Map(),edge=(axis,line,at,side)=>{const k=`${axis},${line},${side}`;if(!lines.has(k))lines.set(k,[]);lines.get(k).push(at);};
  for(const cell of w.floorCells){const [x,z]=cell.split(',').map(Number);
    if(!w.floorCells.has(key(x,z-1)))edge('x',z,x,-1);
    if(!w.floorCells.has(key(x,z+1)))edge('x',z+1,x,1);
    if(!w.floorCells.has(key(x-1,z)))edge('z',x,z,-1);
    if(!w.floorCells.has(key(x+1,z)))edge('z',x+1,z,1);
  }
  for(const [k,values] of lines){
    const [axis,lineRaw,sideRaw]=k.split(','),line=+lineRaw,side=+sideRaw;values.sort((a,b)=>a-b);
    const emit=(start,end)=>{
      const authored=(w.authoredDefinition.frontages||[]).filter(f=>f.axis===axis&&f.line===line&&f.side===side&&f.start<end&&f.end>start);
      const cuts=[start,end,...authored.flatMap(f=>[Math.max(start,f.start),Math.min(end,f.end)])].sort((a,b)=>a-b);
      for(let i=1;i<cuts.length;i++){
        const a=cuts[i-1],b=cuts[i];if(b-a<.01)continue;
        const spec=authored.find(f=>f.start<=a&&f.end>=b);
        // Quiet background fronts stay broad; named reference fronts are never tiled.
        const spans=spec||b-a<17?[[a,b]]:[[a,a+(b-a)*.57],[a+(b-a)*.57,b]];
        for(const [lo,hi] of spans){
          let depth=3.5;
          outer:for(let away=.5;away<=8;away+=.5)for(let at=lo+.05;at<hi;at+=.45){
            const x=axis==='x'?at:line+side*away,z=axis==='x'?line+side*away:at;
            if(w.floorCells.has(key(Math.floor(x),Math.floor(z)))){depth=Math.min(depth,Math.max(.26,(away-.5)/2));break outer;}
          }
          const italian=w.definition.style==='italian';
          facade(w,{axis,line,side,start:lo,end:hi,height:italian?6.8:7.2,tint:italian?ivory:0xe9dcc3,...spec,detailed:!!spec,depth,start:lo,end:hi});
        }
      }
    };
    let begin=values[0],end=begin+1;for(let i=1;i<values.length;i++){if(values[i]===end)end++;else{emit(begin,end);begin=values[i];end=begin+1;}}emit(begin,end);
  }
}

function rail(w,a,b,y,height=.85) {
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]),count=Math.ceil(length/.35);
  for(const dy of [.18,height])beam(w,[a[0],y+dy,a[1]],[b[0],y+dy,b[1]],.032);
  for(let i=0;i<=count;i++){const t=i/count,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;beam(w,[x,y,z],[x,y+height,z],i%4===0?.045:.022);}
}
function cart(w,x,z) {
  w.addBox('wood',[x,.65,z],[2.65,.3,1.45],{tint:0xc2bba0});
  for(const side of [-1,1]){
    w.addBox('wood',[x,.99,z+side*.73],[2.8,.58,.12],{tint:0xc2bba0});
    for(const dx of [-.95,.95]){
      const g=new T.TorusGeometry(.48,.065,4,12);g.translate(x+dx,.49,z+side*.86);w.appendGeometry('wood',g,0xaeb0a2);
      for(let j=0;j<6;j++){const a=j*Math.PI/3;beam(w,[x+dx,.49,z+side*.86],[x+dx+Math.cos(a)*.43,.49+Math.sin(a)*.43,z+side*.86],.025,'wood');}
    }
  }
  for(const [dx,y,dz] of [[-.65,1.26,0],[.6,1.26,0],[-.2,1.8,0]]){
    w.addBox('plaster',[x+dx,y,z+dz],[1.08,.55,1.15],{tint:0xc7b45d});
    for(const dd of [-.3,.3])w.addBox('wood',[x+dx+dd,y,z],[.035,.57,1.17],{solid:false,tint:0x9b926a});
  }
}
function ordnance(w,x,z,{height=2.2,width=2.6,depth=2.4,base=0}={}) {
  // Colliding rack silhouette and individually modelled shell/canister ends.
  w.addBox('wood',[x,base+.15,z],[width,.3,depth],{tint:0x858878});
  for(const side of [-1,1])for(const dx of [-width/2,width/2])w.addBox('metal',[x+dx,base+height/2,z+side*depth/2],[.11,height,.11],{tint:0x525851});
  w.addBox('metal',[x,base+height-.12,z],[width+.1,.18,depth+.1],{tint:0x565b52});
  // A full collision box follows the opaque packed shells, no invisible extra cover.
  w.addBox('wood',[x,base+height/2,z],[width,height-.35,depth],{tint:0x666955});
  for(let i=0;i<5;i++)for(const side of [-1,1]){
    const xx=x-width*.39+i*width*.195;
    w.addCylinder('plaster',[xx,base+height*.48,z+side*depth*.46],width*.075,height*.66,{solid:false,tint:0xd6b657});
    const cap=new T.ConeGeometry(width*.075,height*.18,8);cap.translate(xx,base+height*.88,z+side*depth*.46);w.appendGeometry('metal',cap,0x6b705b);
  }
  w.architectureFeatures.push({type:'ordnance',x,z,height,width,depth});
}

export function buildReferenceSetPieces(w) {
  if(w.definition.style==='italian'){
    // A: low pit remains at street grade; the brick site terrace is +.72m,
    // with real west/front stair access defined in the map (not a teleport).
    cart(w,26.4,-8.2);
    w.addBox('sandstone',[28.3,.5,-12],[.4,1,3.8],{tint:stone});
    rail(w,[28.3,-14],[28.3,-10.2],1,.72);
    w.addBox('sandstone',[23.3,.17,-14.05],[9.4,.34,.2],{solid:false,tint:stone});
    // Banana curb and grouped WOODEN barrels seen in the official after-image.
    for(const [x,z,length] of [[-33.55,6,13],[-25.45,10,7],[-34.55,-7,12]])w.addBox('sandstone',[x,.09,z],[.45,.18,length],{walkable:true,tint:stone});
    for(const [x,z] of [[-27.8,-8],[-28.8,-8],[-27.8,-9.1]]){
      w.addCylinder('wood',[x,.68,z],.48,1.36,{tint:0xb2a38a});
      for(const y of [.15,.63,1.22])w.addCylinder('metal',[x,y,z],.495,.065,{solid:false,tint:0x6b6d60});
    }
    // B's blue drum / yellow storage grouping is more specific than extra crates.
    for(const x of [-36.7,-35.65])for(const y of [.65,1.95])w.addCylinder('plaster',[x,y,-16.1],.51,1.3,{tint:0x7799b3});
    for(const y of [.65,1.95])w.addBox('wood',[-34.4,y,-16.1],[1.35,1.3,1.2],{tint:0xd8bd67});
    for(const [a,b,sag] of [[[28.8,6.3,-19],[14.2,5.4,-21],.45],[[-4.8,6.1,18],[2.8,6.6,9],.28],[[-33.8,5.2,10],[-25.2,6.4,1],.4],[[-15.8,6.4,32],[-.2,6.5,39],.5]])cable(w,a,b,sag);
  }else{
    ordnance(w,22,-16);ordnance(w,31,-21,{height:2.4,width:3,depth:2.6});
    // Horizontal triple canister ends alongside the A rack.
    for(let j=0;j<3;j++)for(let i=0;i<2;i++){
      const g=new T.CylinderGeometry(.3,.3,1.7,10);g.rotateX(Math.PI/2);g.translate(30.6+i*.65,.34+j*.62,-18.8);w.appendGeometry('metal',g,0x768073);
    }
    w.addBox('metal',[30.93,.94,-18.8],[1.3,1.88,1.7],{tint:0x737668});
    // Catwalk's parapet is real waist-height cover, with a visible sandstone cap.
    w.addBox('plaster',[-4.16,.9,6],[.32,1.8,22],{tint:0xe6e2d5});
    w.addBox('paint',[-4.16,1.85,6],[.43,.10,22],{solid:false,tint:0xdedfd3});
    for(const z of [-3,3,9,15])beam(w,[-4.16,1.9,z],[-4.16,3.4,z],.03,'paint',0xb9bfb2);
    beam(w,[-4.16,3.35,-3],[-4.16,3.35,15],.03,'paint',0xb9bfb2);
    archRing(w,{axis:'z',line:4.60,side:1},-9,0,3.7,2.25,.16,.22,'paint',0xe5dfcf,'pointed',1.45);
    for(const z of [7,9,11])w.addBox('sandstone',[.5,.61*(z-6)/6+.025,z],[8.5,.05,.13],{solid:false,tint:stone});
    cable(w,[-3.8,7.4,14],[4.8,6.5,19],.35);
    cable(w,[4.8,7.2,-4],[-3.8,7.5,10],.55);
    // Explicit CT/interior-facing timber at z<-17.35, in front of the plaster
    // wall's back face. Full-depth reveals cover the recess too, not just four
    // painted strips that leave a thick concrete-looking opening underneath.
    for(const x of [-4.12,.12])w.addBox('wood',[x,3.70,-17.43],[.24,2.40,.20],{solid:false,tint:0xc5bca5});
    for(const [y,h] of [[2.57,.16],[4.85,.20]])w.addBox('wood',[-2,y,-17.43],[4.48,h,.20],{solid:false,tint:0xc5bca5});
    for(const x of [-3.975,-.025])w.addBox('wood',[x,3.70,-17],[.05,2.10,.72],{solid:false,tint:0xb8ad94});
    for(const y of [2.63,4.77])w.addBox('wood',[-2,y,-17],[4,.05,.72],{solid:false,tint:0xb8ad94});
    w.architectureFeatures.push({type:'windowTimberLining',x:-2,z:-17,interiorFace:-17.53,bottom:2.65,top:4.75});
  }
}

export function buildStoneBellTower(w,l) {
  const [x,,z]=l.position,h=l.height,scale=h/15,width=3.4;
  w.addBox('sandstone',[x,3.5*scale,z],[width,7*scale,width],{tint:stone});
  for(const [base,top,count] of [[7,10.5,2],[10.5,14,1]]){
    for(const [axis,line] of [['x',z-width/2],['x',z+width/2],['z',x-width/2],['z',x+width/2]]){
      const center=axis==='x'?x:z,unit=width/count;
      for(let j=0;j<count;j++){
        const u=center-width/2+(j+.5)*unit,opening=unit*.62,bottom=(base+.32)*scale,spring=(base+2.15)*scale;
        const {box}=facadeTools(w,{axis,line,side:1});
        for(const s of [-1,1])box('sandstone',u+s*(opening/2+(unit-opening)/4),(base+top)*scale/2,0,(unit-opening)/2,(top-base)*scale,.38,stone,true);
        const point=(a,y,d)=>axis==='x'?[u+a,y,line+d]:[line-d,y,u+a];
        for(let i=0;i<12;i++){
          const a=-opening/2+i*opening/12,b=a+opening/12,curve=v=>spring+opening*.29*Math.sqrt(Math.max(0,1-(v/(opening/2))**2));
          prism(w,[[a,curve(a)],[b,curve(b)],[b,top*scale],[a,top*scale]],.38,point,'sandstone',stone);
          const low=Math.min(curve(a),curve(b)),center=new T.Vector3(...point((a+b)/2,(low+top*scale)/2,0));
          const half=new T.Vector3(...(axis==='x'?[(b-a)/2,(top*scale-low)/2,.19]:[.19,(top*scale-low)/2,(b-a)/2]));
          w.addCollider(new T.Box3(center.clone().sub(half),center.clone().add(half)),'sandstone',{name:'Stone belfry arch'});
        }
        archRing(w,{axis,line,side:1},u,bottom,opening,spring-bottom,.12,.47,'sandstone',0xeee9d6);
      }
    }
  }
  for(const y of [6.95,10.5,14,14.35])w.addBox('sandstone',[x,y*scale,z],[width+.38,.20*scale,width+.38],{tint:0xe7e2d2});
  for(const dx of [-1,1])for(const dz of [-1,1])for(let y=0;y<14;y+=.5)w.addBox('sandstone',[x+dx*1.56,(y+.25)*scale,z+dz*1.56],[.34,.45*scale,.34],{solid:false,tint:0xe9e3d2});
  const roof=new T.ConeGeometry(2.7,.7*scale,4);roof.rotateY(Math.PI/4);roof.translate(x,14.8*scale,z);w.appendGeometry('roof',roof,0xafa18b);
  beam(w,[x,15.1*scale,z],[x,15.9*scale,z],.035);beam(w,[x-.22,15.6*scale,z],[x+.22,15.6*scale,z],.035);
  w.addCylinder('metal',[x,9*scale,z],.35,.65,{solid:false,tint:0x70674b});
  w.architectureFeatures.push({type:'twoTierStoneBelfry',x,z,height:h});
}

export function buildFoliage(w,l) { addFoliage(w,l); }

export function buildLaundry(w,l){
  const [x,,z]=l.position,y=l.height+.8;
  cable(w,[x-5,y,z],[x+1,y+.1,z+.5],.18);
  for(let i=0;i<4;i++){
    const g=new T.BoxGeometry(.8,1.05+(i%2)*.3,.025);g.rotateZ((i%2?.05:-.04));g.translate(x-3.8+i*1.1,y-.65,z+.12+i*.08);
    w.appendGeometry('paint',g,[0xe7e8dd,0xc0d0dc,0xd8ccb2,0xe9e9e1][i]);
  }
}
