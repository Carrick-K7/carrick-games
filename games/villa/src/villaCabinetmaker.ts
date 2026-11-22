import * as THREE from 'three';
import { board, casting, loft, rail, rectRing, sheet, stock, turn, type FurnitureKit, type Point } from './villaFurnitureForms.js';
import { seatPad } from './villaFurnitureTextiles.js';

/** Dressed timber has faces, not tubular rings. Project on the long axis of
 * the STOCK before placing it, with a different across direction on each face. */
export function along(g: THREE.BufferGeometry, axis: 'x'|'y'|'z', offset=0) {
  const out=g.index?g.toNonIndexed():g;if(out!==g)g.dispose();
  const p=out.getAttribute('position'), uv=out.getAttribute('uv');
  const grain=new THREE.Vector3(axis==='x'?1:0,axis==='y'?1:0,axis==='z'?1:0),a=new THREE.Vector3(),b=new THREE.Vector3(),n=new THREE.Vector3(),across=new THREE.Vector3();
  for(let i=0;i<p.count;i+=3){
    a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);n.fromBufferAttribute(p,i+2).sub(a);n.crossVectors(b,n).normalize();
    across.crossVectors(n,grain);if(across.lengthSq()<.01) across.set(axis==='x'?0:1,axis==='x'?1:0,0);else across.normalize();
    for(let j=i;j<i+3;j++){a.fromBufferAttribute(p,j);const end=Math.abs(n.dot(grain))>.97;
      uv.setXY(j,offset+(end ? a.dot(across) + (axis==='z'?a.y:a.z)*.55 : a.dot(grain))/1.80, (end ? (axis==='z'?a.y:a.z) : a.dot(across))/.18+offset*.67);}
  }
  out.userData.villaFinishCharted=true;return out;
}
function plank(k:FurnitureKit,x:number,y:number,z:number,w:number,h:number,d:number,wood:THREE.Material,axis:'x'|'y'|'z',off=0){
  k.put(along(new THREE.BoxGeometry(w,h,d),axis,off),wood,x,y,z);
}
/** Rectangular mortised legs, tapered on the two inner sides; foot and knee need
 * independent widths in X and Z. Only real shoulders get a change of section. */
function post(k:FurnitureKit,wood:THREE.Material,levels:readonly [x:number,y:number,z:number,w:number,d:number][],off=0){
  const g=loft(levels.map(([x,y,z,w,d])=>[[x+w/2,y,z-d/2],[x-w/2,y,z-d/2],[x-w/2,y,z+d/2],[x+w/2,y,z+d/2]]));
  const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();k.put(along(flat,'y',off),wood,0,0,0);
}
/** The three boards share an edge-jointed solid top, not three planks with
 * black gaps. Narrow breadboard ends meet the long stock across the grain. */
function topBoard(k:FurnitureKit,w:number,d:number,h:number,t:number,wood:THREE.Material,ends:boolean){
  if(!ends){k.put(along(board(w,d,t,Math.min(.073,d*.095),.019),w>=d?'x':'z'),wood,0,h-t/2,0);return;}
  const end=Math.min(.115,w*.05),core=w-2*end;
  plank(k,0,h-t/2,0,core,t,d,wood,'x',.12);
  for(const s of [-1,1])plank(k,s*(w-end)/2,h-t/2,0,end,t,d,wood,'z',s*.21);
}
export function indoorTable(k:FurnitureKit,w:number,d:number,h:number,top:THREE.Material){
  const m=k.m,low=h<.53, t=h<.6?.046:.059;
  topBoard(k,w,d,h,t,top,!low&&w>2);
  if(w<.8){
    k.put(along(turn([[.043,.054],[.072,.115],[.049,.24],[.030,h*.74],[.072,h-t]],10),'y'),m.walnut,0,0,0);
    for(let i=0;i<3;i++)k.at(0,0,0,i*Math.PI*2/3,()=>{
      k.put(along(casting([[0,.115],[.039,.138],[d*.40,.037],[d*.44,.017],[d*.43,0],[d*.31,.008],[.047,.070],[0,.072]],.039),'x'),m.walnut,0,0,0,0,-Math.PI/2);
    });return;
  }
  // A low refectory table has broad pinned yokes; a high table has corner
  // posts with a slim apron. Knees never meet the old waist-high crossbar.
  if(low && w>1.60){
    for(const s of [-1,1]){
      const x=s*w*.361, half=d*.337;
      for(const z of [-half,half])post(k,m.walnut,[[x+s*.038,0,z*1.19,.056,.058],[x,.12,z,.079,.071],[x,h-t,z*.77,.085,.073]],s*.22);
      plank(k,x,h*.43,0,.074,.058,2*half*.98,m.walnut,'z');
    }
    plank(k,0,h*.44,0,w*.765,.060,.054,m.oak,'x');
    for(const s of [-1,1])plank(k,s*w*.374,h*.44,.035,.029,.092,.019,m.walnut,'y');
  }else{
    const xx=w*.5-.095,zz=d*.5-.081,leg=low?.060:.071;
    for(const sx of [-1,1])for(const sz of [-1,1])post(k,top,[[sx*(xx+.018),0,sz*(zz+.015),leg*.53,leg*.59],[sx*xx,h*.72,sz*zz,leg,leg],[sx*xx,h-t,sz*zz,leg,leg]],sx*.17+sz*.28);
    for(const s of [-1,1])plank(k,s*xx,h-t-.043,0,leg*.72,.086,zz*2,top,'z',s*.14);
  }
  for(const s of [-1,1])plank(k,0,h-t-.037,s*(low?d*.252:d/2-.08),low?w*.75:w-.18,.074,.046,top,'x',s*.17);
}

export type SeatPattern='spindle'|'ladder'|'desk'|'rush-stool';
export function cabinetChair(k:FurnitureKit,fabric:THREE.Material,pattern:SeatPattern){
  const m=k.m,stool=pattern==='rush-stool', ladder=pattern==='ladder', light=pattern==='desk';
  const h=stool?.706:.442,w=stool?.48:.586,d=stool?.45:.555, wood=ladder||stool?m.oak:m.walnut,xx=w*.365,zz=d*.36;
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const levels:[number,number,number,number,number][]=[[sx*(xx+.026),0,sz*(zz+.026),.034,.038],[sx*xx,h*.79,sz*zz,.047,.053],[sx*xx,h,sz*zz,.053,.052]];
    if(!stool && sz>0)levels.push([sx*(xx+.011),h+.26,zz+.038,.039,.043],[sx*(xx+(light?.038:.029)),light?1.043:1.007,zz+.079,.037,.039]);
    post(k,wood,levels,.09+sx*.16+sz*.19);
  }
  // Mortised H-stretcher ties the splayed legs under the seat; no front rail
  // across shins on a desk chair. Stools need a footrest instead.
  const railY=stool?.269:ladder?.194:.162;
  for(const sx of [-1,1])plank(k,sx*(xx+.015),railY,0,.030,.039,zz*2+.037,wood,'z');
  if(stool)for(const sz of [-1,1])rail(k,[-xx-.018,railY,sz*(zz+.017)],[xx+.018,railY,sz*(zz+.017)],.013,m.brass,7);
  else plank(k,0,railY-.007,.046,xx*2+.034,.032,.032,wood,'x');
  k.put(along(board(w,d,.052,.056,.014),'x'),wood,0,h,0);
  k.put(seatPad(w+.021,d+.032,stool?.079:.113,light?.23:.19),fabric,0,h+.045,-.008);
  if(stool)return;
  function slat(center:number,ht:number,width:number,bow:number){
    const blade=sheet([-1,-.68,0,.68,1],[-1,0,1],(u,v,back)=>[u*width/2, -(zz+.10-bow*u*u+(back?.013:-.013)), center+v*ht*.5+.016*(1-u*u)]);
    k.put(along(blade.rotateX(-Math.PI/2),'x'),wood,0,0,0);
  }
  if(ladder){slat(.67,.052,.464,.053);slat(.79,.072,.483,.068);slat(.934,.099,.518,.083);}
  else if(light){
    slat(.967,.100,.538,.092);
    for(const sx of [-1,1]) k.put(along(casting([[sx*.112,.526],[sx*.045,.544],[sx*.036,.680],[sx*.090,.807],[sx*.115,.932],[sx*.153,.939],[sx*.135,.773],[sx*.087,.670]],.031),'y'),m.oak,0,0,zz+.061,.045);
  }else{
    // Shaped yoke follows the shoulder line; visible stiles, paired dowels and
    // an open centre at the small of the back are intentional.
    slat(.925,.143,.566,.112);
    for(const sx of [-1,1])k.put(along(stock([[sx*.072,.47,zz,.012],[sx*.088,.696,zz+.038,.014],[sx*.128,.888,zz+.079,.011]],7),'y'),m.oak,0,0,0);
  }
}

/** Rail and stile are separate lengths. The field sits IN the rebate, a putty
 * line is not a door gap. The folded half of each butt hinge turns onto the jamb. */
export function panelDoor(k:FurnitureKit,x:number,bottom:number,z:number,w:number,h:number,frame:THREE.Material,field:THREE.Material,hand:number){
  const rail=Math.min(.055,w*.095), t=.033,cy=bottom+h/2;
  for(const s of [-1,1]){
    plank(k,x+s*(w-rail)/2,cy,z,rail,h,t,frame,'y',s*.3);
    plank(k,x,cy+s*(h-rail)/2,z,w-rail*2,rail,t,frame,'x',s*.17);
  }
  plank(k,x,cy,z-.009,w-rail*2+.005,h-rail*2+.005,.021,field,'y',.31);
  for(const yy of [bottom+h*.18,bottom+h*.82]){
    const hx=x+hand*(w/2+.0015);
    k.box(hx-hand*.015,yy,z+.018,.029,.044,.0035,k.m.brass,0);
    k.box(hx+hand*.007,yy,z+.018,.014,.044,.0035,k.m.brass,0);
    // Two outer knuckles and the centre knuckle turn around a common pin.
    for(const [from,to] of [[-.023,-.010],[-.009,.009],[.010,.023]]) {
      const profile: [number,number][]=[[.0056,from],[.0056,to]];
      if(to===.023)profile.push([0,to]); // only the head of the pin is exposed
      k.put(turn(profile,5),k.m.brass,hx,yy,z+.022);
    }
  }
  const dx=x-hand*(w/2-rail*.54);
  k.put(turn([[.008,0],[.007,.011],[.017,.018],[.014,.027],[0,.032]],6),k.m.brass,dx,cy+.11*h,z+.0165,Math.PI/2);
}

export function writingDesk(k:FurnitureKit,w:number,d:number,h:number,guest:boolean){
  const wood=guest?k.m.oak:k.m.walnut,t=.049,endX=w/2-.104, endZ=d/2-.077;
  topBoard(k,w,d,h,t,wood,false);
  for(const sx of [-1,1])for(const sz of [-1,1])post(k,wood,[[sx*(endX+.022),0,sz*(endZ+.016),.046,.049],[sx*endX,h*.73,sz*endZ,.070,.070],[sx*endX,h-t,sz*endZ,.070,.070]],sx*.13+sz*.24);
  for(const sx of [-1,1])plank(k,sx*endX,h-.118,0,.053,.139,d-.16,wood,'z');
  plank(k,0,h-.115,-endZ,w-.21,.132,.046,wood,'x');
  // Suspended bank at one end, shallow pencil drawer over the writing place.
  const side=guest?1:-1, bw=Math.min(.56,w*.215), x=side*(endX-bw/2-.031), z=endZ-.030;
  for(const s of [-1,1])plank(k,x+s*(bw/2-.015),h-.197,-.014,.030,.298,d-.18,wood,'z');
  plank(k,x,h-.334,-.014,bw,.031,d-.18,wood,'x');
  for(let i=0;i<2;i++){
    const y=h-.115-i*.133;plank(k,x,y,z,bw-.078,.121,.030,wood,'x',i*.34);
    k.put(along(turn([[.011,0],[.009,.011],[.019,.019],[.018,.027],[0,.031]],8),'y'),k.m.brass,x,y,z+.015,Math.PI/2);
  }
  const free=w-.205-bw;plank(k,-side*bw/2,h-.078,endZ,free,.058,.028,wood,'x');
}

/** Front, side, shoulder and open leg sections are all inside the original hit
 * envelope. The straight-sided gallery cabinet is accessible from both returns. */
export function cabinetCarcase(k:FurnitureKit,w:number,d:number,h:number,n:number,face:THREE.Material,top:THREE.Material){
  const wood=k.m.oak,front=d*.5-.055,bottom=.106;
  for(const sx of [-1,1])for(const sz of [-1,1])post(k,k.m.walnut,[[sx*(w/2-.072),0,sz*(d/2-.068),.049,.048],[sx*(w/2-.073),.148,sz*(d/2-.069),.075,.075]],sx*.14+sz*.29);
  plank(k,0,(h+bottom)/2,-d/2+.018,w-.052,h-bottom-.046,.028,wood,'x',.19);
  for(const s of [-1,1])plank(k,s*(w/2-.024),(h+bottom)/2,-.019,.047,h-bottom,d-.044,wood,'y',s*.19);
  plank(k,0,bottom,-.015,w-.045,.039,d-.046,k.m.walnut,'x');topBoard(k,w,d,h,.040,top,false);
  const pitch=(w-.097)/n;
  for(let j=0;j<=n;j++)plank(k,pitch*(j-n/2),bottom+(h-bottom)/2,front,.034,h-bottom-.048,.033,wood,'y',j*.12);
  for(let i=0;i<n;i++){
    const x=(i-(n-1)/2)*pitch;
    if(i>0)plank(k,x-pitch/2,(h+bottom)/2,-.025,.018,h-bottom-.04,d-.149,wood,'y');
    panelDoor(k,x,bottom+.024,front,pitch-.038,h-bottom-.078,face,face,i%2?1:-1);
  }
}
