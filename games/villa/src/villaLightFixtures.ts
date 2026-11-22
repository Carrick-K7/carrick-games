import * as THREE from 'three';
import { VillaModelBuilder, villaMaterial } from './villaModel.js';
import { millSection, turnSection } from './villaArchitecturalStock.js';
import { turn as spinOptic } from './villaFurnitureForms.js';

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
// One pair of finishes for this builder, never clone a material per lamp or
// recolour the shared stock used by path lanterns and the roof pavilion.
const lampFinishes=new WeakMap<VillaModelBuilder,{satin:THREE.MeshStandardMaterial;enamel:THREE.MeshStandardMaterial}>();
function finishes(b:VillaModelBuilder) {
  let f=lampFinishes.get(b);if(!f){f={satin:villaMaterial('#b5a084',.40,.48),enamel:villaMaterial('#e5dfd1',.32,.06)};
    f.satin.name='indoor light / spun satin';f.enamel.name='indoor light / fired enamel';lampFinishes.set(b,f);}return f;
}
/** Different joinery for a domestic room, gallery, or utility luminaire; the luminous face
 * still belongs to precisely the same room switch and the original six shared lighting slots. */
export function makeCeilingFixture(b:VillaModelBuilder,room:string,p:{x:number;y:number;z:number},ceiling:number,metal:Mat,porcelain:Mat,opal:Mat) {
  const height=ceiling-p.y;
  // Both wire ends are buried in opaque ferrules. Keep its silhouette, not
  // dozens of invisible discs across all the room fittings.
  const wire=(x:number,from:number,to:number,r:number,mat:Mat)=>b.geometry(new THREE.CylinderGeometry(r,r,to-from,8,1,true),mat,[x,(from+to)/2,0]);
  b.at(p.x,p.y,p.z,0,()=>{
    if(['living','tea-room','east-lounge','master','guest','reading-hall','study','massage'].includes(room)) {
      const {satin,enamel}=finishes(b), s=room==='tea-room'?1.13:room==='guest'||room==='master'?.83:1;
      const spin=(profile:[number,number][],mat:Mat,n:number)=>b.geometry(spinOptic(profile.map(([r,y])=>[r*s,y]),n),mat);
      // A spun-and-hemmed reflector, rolled rim and milk-glass drop bowl. From
      // an armchair the glass belly is luminous, not the opaque shade above it.
      // Keep 28 segments at the 0.71 m silhouette. The inner reflector ends
      // at the opaque glass seat, and the small fittings need fewer meridians.
      spin([[.324,-.029],[.343,-.033],[.354,-.022],[.345,-.012],[.311,-.010],
        [.207,.054],[.137,.084],[.086,.092],[.082,.102],[.050,.102]],satin,28);
      spin([[.258,.005],[.284,-.011],[.319,-.024],[.324,-.029]],enamel,28);
      spin([[0,-.105],[.094,-.100],[.172,-.083],[.233,-.054],[.251,-.039],
        [.253,-.027],[.266,-.020],[.272,-.007],[.258,.005]],opal,28); // same 28-vertex seat as the reflector
      spin([[.042,.098],[.058,.107],[.054,.117],[.029,.128],[.0065,.141]],metal,12);
      wire(0,.139,height-.035,.007,metal);
      spin([[.0065,height-.038],[.040,height-.034],[.090,height-.021],[.091,height-.007],[.085,height]],enamel,14);
    } else if(room!=='gallery-2' && (room.startsWith('gallery')||room==='cinema')) {
      const {satin,enamel}=finishes(b);
      // Twin deep-regressed downlights. The annular baffles expose the lenses
      // head-on and cut them off at grazing angles, like a real glare shield.
      b.geometry(millSection('x',.570,[[-.087,.018],[-.092,.024],[-.081,.070],[.081,.070],[.092,.024],[.087,.018]]),satin);
      for(const x of [-.148,.148]) {
        b.geometry(spinOptic([[.047,.019],[.062,.002],[.064,-.009],[.078,-.028],[.083,-.044],
          [.091,-.055],[.102,-.055],[.109,-.046],[.101,-.024],[.099,.019]],18),metal,[x,0,0]);
        b.geometry(spinOptic([[0,.004],[.036,.007],[.051,.013],[.051,.017]],14),opal,[x,0,0]);
        wire(x,.069,height-.020,.009,satin);
        b.geometry(spinOptic([[.0085,height-.024],[.049,height-.013],[.049,height]],12),enamel,[x,0,0]);
      }
    } else if(room!=='gallery-2') {
      const {satin,enamel}=finishes(b), w=room==='garage'?2.45:room==='snooker'?1.90:room==='gym'?1.18:.94;
      // Tool-rolled batten with a ribbed opal trough, returned flange and
      // captive end caps. Both edges of the lens actually enter the flange.
      const channel:[number,number][]=[[-.124,-.018],[-.134,-.007],[-.125,.034],[-.099,.056],[.099,.056],[.125,.034],[.134,-.007],
        [.124,-.018],[.103,-.018],[.100,-.013],[.106,-.005],[.106,.006],[-.106,.006],[-.106,-.005],[-.100,-.013],[-.103,-.018]];
      b.geometry(millSection('x',w,channel),enamel);
      b.geometry(millSection('x',w-.030,[[-.109,-.003],[-.108,-.019],[-.092,-.039],[-.072,-.045],[-.063,-.042],[-.054,-.048],
        [-.041,-.046],[-.030,-.051],[-.019,-.048],[-.009,-.052],[.009,-.052],[.019,-.048],[.030,-.051],[.041,-.046],
        [.054,-.048],[.063,-.042],[.072,-.045],[.092,-.039],[.108,-.019],[.109,-.003]],'socketed'),opal);
      for(const side of [-1,1]) {
        b.geometry(millSection('x',.020,[[-.120,-.010],[-.101,-.037],[-.071,-.050],[.071,-.050],[.101,-.037],[.120,-.010],
          [.117,.020],[.101,.031],[-.101,.031],[-.117,.020]]),satin,[side*(w/2-.008),0,0]);
        const x=side*w*.31;wire(x,.054,height-.020,.008,metal);
        b.geometry(spinOptic([[.0075,height-.027],[.048,height-.019],[.054,height-.010],[.054,height]],12),satin,[x,0,0]);
      }
    } else {
      // Original roof-access fitting, outside the indoor fixture revision.
      const w=.48;
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
