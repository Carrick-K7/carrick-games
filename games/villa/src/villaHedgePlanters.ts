import * as THREE from 'three';
import { turn, type FurnitureKit, type Profile } from './villaFurnitureForms.js';
import { NatureMesh, add3, collar, mix3, polar, type P3 } from './villaNatureGeometry.js';
import { LeafSurface, plantSeed, plantSurface, potLeafUV, prepareShootFinish } from './villaHedgeShoots.js';

// Palmately veined, scalloped leaves. The petiole inserts at the open basal
// notch, not at the tip of a spoon. The margin sags below the raised junction.
function cranesbill(leaf: LeafSurface, socket: P3, dir: number, size: number, tilt: number, trailing: boolean) {
  const ring = [[0,0],[.54,0],[1,0],[1,.64],[1,1],[.47,1],[0,1],[0,.59]];
  const rib = leaf.point(socket, ...potLeafUV(.5,.33,trailing));
  const edge = ring.map(([u,v])=>{
    const s = (u-.5)*2, t = v-.33;
    const rise = tilt*t-.34*t*t-.17*Math.abs(s)+.061*s;
    const p = add3(socket,add3(polar(dir,t*size,rise*size),polar(dir+Math.PI/2,s*size*(trailing?.60:.73),0)));
    return leaf.point(p,...potLeafUV(u,v,trailing));
  });
  for (let i=0; i<edge.length; i++) leaf.mesh.tri(rib,edge[i],edge[(i+1)%edge.length]);
}

/** Five lobes, wider upper pair, sloping face and a returning underside.
 * Flowers share a peduncle, not the same position or growth direction. */
function flower(mesh: NatureMesh, p: P3, dir: number, r: number, tilt: number) {
  const pos = (a: number, d: number, h: number): P3 => add3(p,polar(a,d*r,r*(h + Math.cos(a-dir)*d*tilt)));
  const top = mesh.point(add3(p,[0,r*.075,0])), bottom = mesh.point(add3(p,[0,-r*.21,0]));
  for (let i=0;i<5;i++) {
    const a=dir+i*Math.PI*.4, d=i===1||i===4?1.09:.94;
    const l=mesh.point(pos(a-.58,d*.83,.31)), t=mesh.point(pos(a-.08,d,.37)), rr=mesh.point(pos(a+.52,d*.87,.34));
    mesh.tri(top,t,l); mesh.tri(top,rr,t);
    mesh.tri(bottom,l,t); mesh.tri(bottom,t,rr);
  }
}

/** Terracotta pots by the porch and lawn: upright zonal pelargoniums, trailing
 * ivy-leaved plants in low bowls. Kept separate from indoor cut-flower vases. */
export function outdoorPlanter(k: FurnitureKit, scale: number, random: () => number) {
  const m=k.m, bowl=scale<.8, rng=plantSeed(random()*181), drop=(g: THREE.BufferGeometry,mat: THREE.Material)=>k.put(g.scale(scale,scale,scale),mat,0,0,0);
  const profile: Profile = bowl ? [[0,.010],[.134,0],[.164,.020],[.238,.126],[.245,.198],[.227,.262],[.163,.326],[.178,.345],[.171,.358],[.148,.337],[.143,.309]] :
    [[0,.011],[.143,.011],[.164,0],[.179,.054],[.227,.308],[.248,.327],[.251,.359],[.241,.382],[.218,.380],[.205,.329]];
  drop(turn(profile,bowl?10:12),m.terra);
  const soil=bowl?.317:.336, mouth=bowl?.145:.209;
  drop(turn([[mouth,soil],[mouth*.69,soil+.009],[0,soil+.006]],10),m.soil);
  const wood=new NatureMesh(), leaf=new LeafSurface(), fresh=new NatureMesh(), salmon=new NatureMesh(), ivory=new NatureMesh();
  prepareShootFinish(m.leafLight, 'privet');
  const rotation=rng()*Math.PI*2, canes=3;
  for(let i=0;i<canes;i++) {
    const dir=rotation+i*2.39+(rng()-.5)*.49, foot=polar(dir,.025,soil+.002);
    const knee = polar(dir+.17,bowl?.137:.096,soil+(bowl?.161:.205)*(.84+.28*rng()));
    const end = polar(dir-.16,bowl?.253:.176,soil+(bowl?.092:.316)*(.89+.22*rng()));
    wood.stem([collar(foot,.013),collar(knee,.010),collar(end,.0043)],4,.11,dir,true);
    for(let j=0;j<(bowl?4:5);j++) {
      const a=j<2?mix3(foot,knee,.42+.42*j):mix3(knee,end,.13+.41*(j-2));
      const hand=j%2?-1:1, la=dir+hand*(.95+.51*rng());
      const socket=add3(a,polar(la,.060+.026*rng(),.021+.025*rng()));
      fresh.stem([collar(a,.0048),collar(socket,0)],3,0,0,true);
      cranesbill(leaf,socket,la,(.146+.039*rng())*(bowl?.92:1),.42-.87*rng(),bowl);
    }
    if (i>1) continue;
    const head=add3(end,polar(dir-.32,bowl?.026:.045,(bowl?.115:.177)*(.91+.20*rng())));
    fresh.stem([collar(end,.0058),collar(head,.0039)],3,0,0,true);
    for(let j=0;j<(bowl?3:4);j++) {
      const la=dir+j*2.39, opening=add3(head,polar(la,.047+.022*rng(),.031+.061*rng()));
      fresh.stem([collar(head,.0034),collar(opening,0)],3,0,0,true);
      flower(i?ivory:salmon,opening,la-.23,.035+.011*rng(),-.33-.74*rng());
    }
  }
  drop(leaf.geometry(),m.leafLight);
  for(const [mesh,mat] of [[wood,m.walnut],[fresh,m.leaf],[salmon,m.coral],[ivory,m.cream]] as const) drop(plantSurface(mesh,mesh===wood),mat);
}
