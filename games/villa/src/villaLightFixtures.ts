import * as THREE from 'three';
import { VillaModelBuilder } from './villaModel.js';
import { millSection, turnSection } from './villaArchitecturalStock.js';

type Mat = THREE.Material;
/** A slotted bollard, with a cast foot, a weather hood and a real recessed opal lantern.
 * All visible rings share their respective finish; no point light is allocated here. */
export function makePathLantern(b:VillaModelBuilder,x:number,z:number,height:number,body:Mat,light:Mat) {
  b.at(x,0,z,0,()=>{
    const r=height>.8?.072:.059;
    b.geometry(turnSection([[r*1.4,0],[r*1.48,.008],[r*1.43,.026],[r*1.06,.034],[r,.047],[r*.96,height-.233],[r,height-.222],[r*1.12,height-.218],
      [r*1.14,height-.191],[r*.94,height-.18],[r*.91,height-.16]],20),body);
    b.geometry(turnSection([[r*.80,height-.184],[r*.82,height-.166],[r*.77,height-.061],[r*.72,height-.050]],20),light);
    for(let i=0;i<3;i++)b.at(0,0,0,i*Math.PI*2/3,()=>b.geometry(millSection('y',.145,[[-.006,-.007],[.007,-.007],[.010,.001],[.006,.008],[-.008,.008]]),body,[0,height-.119,r*.85]));
    b.geometry(turnSection([[0,height-.060],[r*1.12,height-.060],[r*1.23,height-.049],[r*1.23,height-.036],[r*.88,height-.017],[r*.28,height],[0,height]],22),body);
  });
}
/** Different joinery for a domestic room, gallery, or utility luminaire; the luminous face
 * still belongs to precisely the same room switch and the original six shared lighting slots. */
export function makeCeilingFixture(b:VillaModelBuilder,room:string,p:{x:number;y:number;z:number},ceiling:number,metal:Mat,porcelain:Mat,opal:Mat) {
  const height=ceiling-p.y;
  b.at(p.x,p.y,p.z,0,()=>{
    if(['living','tea-room','east-lounge','master','guest','reading-hall','study','massage'].includes(room)) {
      const s = room==='tea-room' ? 1.18 : room==='reading-hall' ? .89 : 1;
      // A flattened bell shade with a rolled edge. The plaster-toned inner glaze returns
      // up to the socket; no opaque disc seals over its characteristic underside.
      const outside = [[.035,.102],[.076,.096],[.131,.080],[.224,.033],[.273,.016],[.294,.002],[.295,-.010],[.285,-.019]].reverse().map(([r,y])=>[r!*s,y!] as [number,number]);
      b.geometry(turnSection(outside,36),metal);
      const inside = [[.285,-.019],[.270,-.016],[.234,-.002],[.148,.042],[.065,.060],[.027,.059]].reverse().map(([r,y])=>[r!*s,y!] as [number,number]);
      b.geometry(turnSection(inside,36),porcelain);
      b.geometry(turnSection([[0,-.048],[.026,-.044],[.043,-.028],[.048,-.006],[.043,.017],[.027,.037],[.022,.061]],24),opal);
      b.geometry(turnSection([[.023,.042],[.032,.046],[.032,.112],[.021,.120],[.009,.124]],18),metal);
      b.beam([0,.12,0],[0,height-.035,0],.007,metal,8);
      b.geometry(turnSection([[.020,height-.036],[.062,height-.033],[.079,height-.020],[.079,height-.009],[.071,height],[0,height]],24),porcelain);
    } else {
      const w=room==='garage'?2.45:room==='snooker'?1.9:room.startsWith('gallery')?.48:.86;
      b.geometry(millSection('x',w, [[-.106,-.025],[-.123,-.015],[-.107,.029],[-.084,.047],[.084,.047],[.107,.029],[.123,-.015],[.106,-.025],
        [.087,-.025],[.081,-.004],[-.081,-.004],[-.087,-.025]]),metal);
      b.geometry(millSection('x',w-.034,[[-.082,-.003],[.082,-.003],[.078,-.011],[.054,-.020],[-.054,-.020],[-.078,-.011]]),opal);
      for(const s of [-1,1]) {
        const x=s*w*.32;b.beam([x,.04,0],[x,height-.016,0],.005,metal,6);
        b.geometry(turnSection([[.009,height-.024],[.034,height-.018],[.039,height-.006],[.035,height],[0,height]],14),porcelain,[x,0,0]);
      }
    }
  });
}
