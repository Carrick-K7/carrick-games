import * as T from 'three';
// CS-style three-strength throws, scaled to this game's metre-based world.
// The fuse starts at release, never while the player holds the safety lever.
export const GRENADE_PIN_TIME=.50;
export const GRENADE_RELEASE_TIME=.22;
export const GRENADE_RECOVER_TIME=.56;
export const GRENADE_RADIUS=.035;
export function grenadeLaunch(pitch,yaw,strength,eye,velocity,vertical=0){
 const s=T.MathUtils.clamp(strength,0,1),angle=pitch+(10*Math.PI/180)*(1-Math.abs(pitch)/(Math.PI/2));
 const direction=new T.Vector3(0,0,-1).applyEuler(new T.Euler(angle,yaw,0,'YXZ'));
 return{direction,origin:eye.clone().add(new T.Vector3(0,-.10-(1-s)*.24,0)),velocity:direction.clone().multiplyScalar(17.15*(.3+.7*s)).addScaledVector(velocity,1.25).add(new T.Vector3(0,vertical*1.25,0))};
}
export function advanceGrenade(g,dt,world,onBounce=()=>{}){
 const step=1/120;g.accumulator=(g.accumulator||0)+dt;
 while(g.accumulator>=step&&g.fuse>0){
  g.accumulator-=step;g.fuse-=step;
  if(g.resting)continue;
  const previous=g.velocity.y;g.velocity.y-=8.13*step;
  const move=g.velocity.clone().multiplyScalar(step);move.y=(previous+g.velocity.y)*.5*step;
  const len=move.length();if(len<1e-8)continue;
  const direction=move.clone().divideScalar(len),hit=world.raycast(g.pos,direction,len+GRENADE_RADIUS);
  if(hit){
   const normal=hit.face.normal.clone();if(hit.object?.matrixWorld)normal.transformDirection(hit.object.matrixWorld);
   if(normal.dot(direction)>0)normal.negate();
   g.pos.copy(hit.point).addScaledVector(normal,GRENADE_RADIUS+.001);
   const impact=Math.abs(g.velocity.dot(normal));g.velocity.reflect(normal).multiplyScalar(.45);
   if(normal.y>.7){g.velocity.x*=.82;g.velocity.z*=.82;if(g.velocity.length()<.45){g.resting=true;g.velocity.set(0,0,0);}}
   g.spin?.multiplyScalar(.60);g.bounceTime=(g.bounceTime||0)+step;
   if(impact>.65&&g.fuse<(g.lastBounceFuse??2)-.08){onBounce(impact);g.lastBounceFuse=g.fuse;}
  }else g.pos.add(move);
  if(g.spin){g.mesh.rotation.x+=g.spin.x*step;g.mesh.rotation.z+=g.spin.z*step;}
 }
 g.mesh.position.copy(g.pos);
}
