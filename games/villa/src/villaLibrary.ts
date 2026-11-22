import * as THREE from 'three';
import { board, casting, type FurnitureKit } from './villaFurnitureForms.js';
import { along, panelDoor } from './villaCabinetmaker.js';
import { HOUSE_PRINT, HOUSE_TITLES, inkUV, jacketTile, printChart, spineTile, type PrintTile } from './villaDomesticArt.js';

export type Imprint={ press:THREE.Material; edition:number };
/** A sewn volume, not a painted block. The case overhangs; the end of the
 * gatherings is slightly concave and does not coincide with the boards. */
export function sewnVolume(k:FurnitureKit,x:number,y:number,z:number,w:number,h:number,d:number,cover:THREE.Material,lying=false,lean=0,ink?:Imprint){
  // Narrow paperbacks are square-backed with a folded card wrapper, not a
  // miniature leather case. Do not spend a rounded shoulder on a straight fold.
  const hard = !ink || w>.062 || ink.edition%7===0;
  const a=w*.5,b=d*.5,t=hard?Math.min(.0045,w*.13):.0018,curve=hard?Math.min(.008,w*.15):0,r=lying?Math.PI/2:lean;
  const cy=y+(lying?a:Math.cos(r)*h*.5+Math.abs(Math.sin(r))*a);
  const wrap=hard?[[-a,b],[-a,-b+curve],[-a*.70,-b],[0,-b-curve*.65],[a*.70,-b],[a,-b+curve],[a,b],
    [a-t,b],[a-t,-b+curve*1.35],[0,-b+curve*.72],[-a+t,-b+curve*1.35],[-a+t,b]]:
    [[-a,b],[-a,-b],[a,-b],[a,b],[a-t,b],[a-t,-b+t],[-a+t,-b+t],[-a+t,b]];
  const jacket=casting(wrap,h).rotateX(-Math.PI/2),p=jacket.getAttribute('position'),uv=jacket.getAttribute('uv'),n=jacket.getAttribute('normal');
  if(ink){
    const face=jacketTile(ink.edition),spine=spineTile(ink.edition);
    for(let i=0;i<p.count;i++){
      const sx=p.getX(i),sy=p.getY(i),sz=p.getZ(i);
      const q=n.getZ(i)>.34&&sz>b-curve*1.1-.00001 ? inkUV(spine,.5-sy/h,.5+sx/w) :
        n.getX(i)>.96 ? inkUV(face,.5+sz/d,.5+sy/h) : inkUV(face,.015+.014*((sy/h)+.5),.02+.008*(sz/d));
      uv.setXY(i,...q);
    }
  }
  k.put(jacket,ink?.press??cover,x,cy,z,0,0,r);
  // Only the cut edges of paper are exposed. The first and last endpapers are
  // pasted to the boards; modelling hidden side walls there adds no surface.
  const pa=a-t, head=h*.5-.006, fore=-b+.009, rear=b-(hard?curve*1.65:t);
  const pages=new THREE.BufferGeometry(),xyz:number[]=[],puv:number[]=[];
  for(const py of [-head,head])for(const [px,pz] of [[-pa,fore],[0,fore+.005],[pa,fore],[pa,rear],[-pa,rear]]){
    xyz.push(px,py,pz);puv.push(.5+px/w,.5+pz/d);
  }
  // Concave fore-edge: head and tail use their actual polygon, not a fan
  // crossing the centre notch. Wind separately for the top, bottom and mouth.
  pages.setAttribute('position',new THREE.Float32BufferAttribute(xyz,3));
  pages.setAttribute('uv',new THREE.Float32BufferAttribute(puv,2));
  pages.setIndex([0,1,4,1,3,4,1,2,3, 5,9,6,6,9,8,6,8,7, 0,6,1,0,5,6,1,7,2,1,6,7]);
  pages.computeVertexNormals();k.put(pages,k.m.cream,x,cy,z,0,0,r);
  if(!ink || ink.edition%6===0){
    const band=new THREE.PlaneGeometry(w*.67,h*.012,2,1),v=band.getAttribute('position');
    for(let i=0;i<v.count;i++)v.setZ(i,b+curve*.65+.0005-Math.abs(v.getX(i)/a)*curve*.94);
    band.translate(0,h*.33,0);k.put(band,k.m.brass,x,cy,z,0,0,r);
  }
}

/** Folded mount and back leg meet at a hinge, both feet bear on the shelf.
 * Matte, paper face and rear support are all visible to a walking viewer. */
export function mountedPrint(k:FurnitureKit,press:THREE.Material,tile:PrintTile,w:number,h:number){
  const tilt=-.17, cy=(h*Math.cos(tilt)+.014*Math.abs(Math.sin(tilt)))/2, z=0;
  k.put(new THREE.BoxGeometry(w,h,.014),k.m.walnut,0,cy,z,tilt);
  const image=printChart(new THREE.PlaneGeometry(w-.022,h-.023),tile);
  image.translate(0,0,.0075);k.put(image,press,0,cy,z,tilt);
  // Solve the hinge on the tilted board's REAR plane, rather than aligning
  // two independent silhouettes that leave a gap when viewed from the side.
  const top=h*.78, foot=-h*.42, back=(top-cy)*Math.tan(tilt)-.007/Math.cos(tilt),a=Math.atan2(back-foot,top);
  k.put(new THREE.BoxGeometry(w*.26,Math.hypot(back-foot,top),.008),k.m.walnut,0,top/2,(foot+back)/2,a);
}
function bookend(k:FurnitureKit,x:number,y:number,z:number,hand:number,depth:number){
  const h=.144,d=depth*.73,t=.004;
  k.box(x+hand*.041,y+.002,z,.088,.004,d,k.m.brass,0);
  const plate=casting([[-d*.48,.003],[d*.5,.003],[d*.5,h*.23],[d*.19,h*.29],[-d*.17,h],[-d*.42,h],[-d*.48,h-.011]],t);
  k.put(plate,k.m.brass,x,y,z,0,Math.PI/2);
}
function cassette(k:FurnitureKit,x:number,y:number,w:number,press:THREE.Material,code:number){
  const d=.25,h=.089;
  k.box(x,y+h/2,-.015,w,h,d,k.m.sage,0);
  k.put(board(w+.009,d+.009,.014,.009,.004),k.m.sage,x,y+h-.002,-.015);
  const label=printChart(new THREE.PlaneGeometry(Math.min(.151,w*.55),.029),spineTile(code));k.put(label,press,x,y+.045,.111);
}
type Display = 'specimen'|'postcard'|'folio';
function row(k:FurnitureKit,press:THREE.Material,left:number,right:number,y:number,code:number,display?:Display){
  const width=right-left, fromLeft=(code&1)===0, hand=fromLeft?1:-1;
  const mid=(left+right)/2;
  if(display){
    if(display==='folio'){
      // A folio opened to its jacket, leaning against the actual oak lining
      // above a retaining bead. Solve its upper rear corner onto the backboard.
      const h=.336,w=.047,d=.251,theta=.19,back=-.1575;
      const z=back+Math.cos(theta)*w/2+Math.sin(theta)*h/2;
      k.at(mid,y,z,-Math.PI/2,()=>sewnVolume(k,0,0,0,w,h,d,k.m.terra,false,theta,{press,edition:7}));
      k.box(mid,y+.012,z+Math.cos(theta)*w/2+Math.sin(theta)*h/2+.006,d+.015,.024,.012,k.m.oak,0);
    }else{
      k.at(mid-.08,y,-.009,display==='postcard'?-.108:.08,()=>mountedPrint(k,press,HOUSE_PRINT[display],.254,.186));
      if(width>.77)cassette(k,right-.207,y,.312,press,code);
    }
    return;
  }
  // Not every bay is a wall of fiction. The folios lie with the sewing flat;
  // photographs and correspondence occupy a few quieter bays by themselves.
  if(code%5===0 || code%7===2){
    if(code%5===0){
      sewnVolume(k,mid-.035,y,.006,.054,.386,.272,k.m.sage,true,0,{press,edition:code+2});
      k.at(mid-.031,y+.054,.001,.058,()=>sewnVolume(k,0,0,0,.038,.328,.229,k.m.terra,true,0,{press,edition:code+7}));
    }else cassette(k,mid,y,.324,press,code);
    return;
  }
  let edge=fromLeft?left+.015:right-.015, used=0;
  const max=width*(.54+.18*((code%7)/6)), limit=5+code%5;
  for(let i=0;i<limit;i++){
    const ed=(code*5+i*(code%3===1?5:1))%HOUSE_TITLES.length;
    const w=.033+.009*((3*i+code)%7),h=.173+.018*((ed*7+code+i)%9),d=.151+.009*((ed+i)%8);
    if(used+w>max && i>1)break;
    sewnVolume(k,edge+hand*w*.5,y,-.083+d*.31+.006*(i%3),w,h,d,k.m.sage,false,0,{press,edition:ed});
    edge+=hand*(w+.0015);used+=w+.0015;
  }
  // The metal angle bears on the surface, with its foot pointing OUT of the
  // run so that thin books never float above the shelf.
  bookend(k,edge,y,-.013,hand,.203);
  const spare=width-used, x=fromLeft?right-spare*.40:left+spare*.40;
  if(spare>.47 && (code%4===0 || code%4===3)){
    if(code%4===3)cassette(k,x,y,Math.min(.348,spare*.68),press,code);
    else {sewnVolume(k,x,y,.002,.037,.337,.228,k.m.terra,true,0,{press,edition:code+3});k.at(x+.006,y+.037,-.009,.052,()=>sewnVolume(k,0,0,0,.026,.290,.207,k.m.blue,true,0,{press,edition:code+15}));}
  }
}
/** Different editions of one joiner's bookpress. Closed folio cupboards below
 * reading height; removable upper shelves stop at a real cheek or centre stile.
 * Tall atlases fit below the cornice rather than clipping through it. */
export function libraryCase(k:FurnitureKit,w:number,press:THREE.Material,caseNo:number){
  const m=k.m,sides=[-w/2+.025,w/2-.025],front=.168,wide=w>1.82, base=.594;
  const timber=(x:number,y:number,z:number,ww:number,h:number,d:number,wood:THREE.Material,axis:'x'|'y'|'z',off=0)=>k.put(along(new THREE.BoxGeometry(ww,h,d),axis,off),wood,x,y,z);
  for(const x of sides){
    const cheek=casting([[-.187,0],[-.117,0],[-.085,.071],[.089,.071],[.127,0],[.186,0],[.186,2.27],[-.187,2.27]],.050).rotateY(Math.PI/2);
    k.put(along(cheek,'y',x*.23),m.oak,x,0,0);
  }
  // Narrow matching boards with expressed V joints and a horizontal housed
  // top rail; none is a full-width box covering the shelf openings.
  const count=Math.max(3,Math.round((w-.1)/.31)),bw=(w-.095)/count;
  for(let j=0;j<count;j++)timber((j-(count-1)/2)*bw,1.171,-.170,bw-.002,2.207,.025,caseNo%3===1?m.oak:m.walnut,'y',(j*29+caseNo)*.073);
  timber(0,.073,0,w-.089,.046,.355,m.walnut,'x'); timber(0,.103,.145,w-.080,.085,.037,m.oak,'x');
  const doors=wide?3:2,cell=(w-.112)/doors;
  for(let i=0;i<=doors;i++)timber(cell*(i-doors/2),(.112+base)/2,front,.034,base-.112,.033,m.oak,'y',i*.21);
  for(let i=0;i<doors;i++)panelDoor(k,cell*(i-(doors-1)/2),.116,front,cell-.038,base-.16,m.oak,caseNo%2?m.oak:m.walnut,i%2?1:-1);
  const split=w*(caseNo%2===1?-.062:.05);
  if(wide)timber(split,(2.273+base)/2,-.003,.035,2.273-base,.352,m.oak,'y',caseNo*.14);
  for(let i=0;i<4;i++){
    const z=.003, deck=base+i*.419;
    timber(0,deck-.020,z,w-.084,.040,.366,m.oak,'x',caseNo*.33+i*.14);
    if(wide){
      row(k,press,-w/2+.057,split-.019,deck,caseNo*7+i*3,caseNo===3&&i===1?'specimen':undefined);
      row(k,press,split+.019,w/2-.057,deck,caseNo*11+i*3+1,caseNo===5&&i===2?'folio':caseNo===6&&i===1?'postcard':undefined);
    }
    else row(k,press,-w/2+.054,w/2-.054,deck,caseNo*11+i*5);
  }
  timber(0,2.256,.141,w-.079,.092,.047,m.oak,'x',.65);
  k.put(along(board(w+.054,.414,.061,.022,.014),'x'),m.oak,0,2.305,0);
}
