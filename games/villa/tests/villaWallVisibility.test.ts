import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { slabFaces } from '../src/villaArchitecturalStock.js';
import { createVillaEnvelope, type VillaSurfaces } from '../src/villaEnvelope.js';
import { VillaModelBuilder } from '../src/villaModel.js';
import { allowVillaWallLighting, VillaWallVisibility } from '../src/villaWallVisibility.js';

const shellName='villa-fabric-and-joinery', front=[0,1,3,0,3,2], frame=[640,400] as const;
const point=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const target=(x=0,y=0,z=-6,r=.15)=>new THREE.Box3(point(x-r,y-r,z-r),point(x+r,y+r,z+r));
function eye(x=0,y=0,z=8, dest=point()) {
  const c=new THREE.PerspectiveCamera(65,1.4,.065,650); c.position.set(x,y,z); c.lookAt(dest); c.updateMatrixWorld(); return c;
}
function plane(ids: number[]=front, vertices=[-2,-2,0, 2,-2,0, -2,2,0, 2,2,0]) {
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); g.setIndex(ids); g.computeVertexNormals();
  g.userData.villaRigidBatch=true; const scene=new THREE.Scene(), parent=new THREE.Group(), shell=new THREE.Group(), m=new THREE.MeshStandardMaterial();
  shell.name=shellName; scene.add(parent); parent.add(shell); const mesh=new THREE.Mesh(g,m); mesh.name=shellName+'/surface'; shell.add(mesh);
  return {scene,parent,shell,g,m,mesh,view:new VillaWallVisibility(scene)};
}
/** Independent check against Three's actual source triangles, not their bounding planes. */
function allCornerRaysHit(eye: THREE.Vector3, box: THREE.Box3, object: THREE.Object3D) {
  object.updateWorldMatrix(true,true);
  for(const x of [box.min.x,box.max.x]) for(const y of [box.min.y,box.max.y]) for(const z of [box.min.z,box.max.z]) {
    const ray=point(x,y,z).sub(eye), distance=ray.length();
    if(!new THREE.Raycaster(eye,ray.normalize(),0,distance-.001).intersectObject(object,true).length) return false;
  }
  return true;
}

describe('occlusion from the real submitted opaque Villa fabric',()=>{
  it('accepts both diagonals, arbitrary cyclic/order permutations, and only the wound front of both triangles',()=>{
    for(const ids of [front,[3,2,0,1,3,0],[1,3,2,1,2,0],[0,0,1,...front]]) {
      const {view,mesh}=plane(ids), c=eye(), box=target(1.1,0,-6); expect(view.prepare(c,...frame)).toBe(true); expect(view.hidden(box)).toBe(true);
      expect(allCornerRaysHit(c.position,box,mesh)).toBe(true);
      expect(view.prepare(eye(0,0,-8),...frame)).toBe(false); expect(view.hidden(target(1.1,0,6))).toBe(false);
    }
    const {view}=plane([3,1,0,2,3,0]); expect(view.prepare(eye(),...frame)).toBe(false);
    expect(view.prepare(eye(0,0,-8),...frame)).toBe(true); expect(view.hidden(target(1.1,0,6))).toBe(true);
  });
  it('requires one pixel-clear submitted triangle, not just the quad, on either actual diagonal',()=>{
    for(const [ids,sign] of [[front,1],[[0,1,2,1,3,2],-1]] as const) {
      const {view}=plane([...ids]),c=eye(); expect(view.prepare(c,...frame)).toBe(true);
      expect(view.hidden(target())).toBe(false); expect(view.hidden(target(1,sign,-8))).toBe(false); expect(view.hidden(target(1,-sign,-8))).toBe(true);
      const almost=target(1,.85*sign,-8,.0001); expect(view.hidden(almost)).toBe(false);
      expect(view.prepare(c,1280,800)).toBe(true); expect(view.hidden(almost)).toBe(true);
    }
  });
  it('does not inflate a single, overlapping, wrongly wound, degenerate, skewed or noncoplanar pair into a panel',()=>{
    for(const ids of [[0,1,3],[0,1,3,0,1,3],[0,1,3,0,1,2],[0,1,3,0,2,3],[0,0,3,0,3,2],[0,1,3,0,2,0xffff]]) {
      expect(plane(ids).view.prepare(eye(),...frame),String(ids)).toBe(false);
    }
    for(const vertices of [[-2,-2,0,2,-2,0,-2,2,1e-6,2,2,0],[-2,-2,0,2,-2,0,-1.999999,2,0,2,2,0],[-.3,-4,0,.3,-4,0,-.3,4,0,.3,4,0]])
      expect(plane(front,vertices).view.prepare(eye(),...frame)).toBe(false);
  });
  it('proves all six directions against a complete slabFaces draw, including soffit and interior wall faces',()=>{
    const s=new THREE.Scene(), b=new VillaModelBuilder(s,shellName); b.geometry(slabFaces(0,0,0,4,4,4),new THREE.MeshStandardMaterial());
    const geometry=b.finish(), view=new VillaWallVisibility(s);
    for(let axis=0;axis<3;axis++) for(const sign of [-1,1]) {
      const pos=point().setComponent(axis,sign*8), c=eye(pos.x,pos.y,pos.z), dest=pos.clone().multiplyScalar(-.75).setComponent((axis+1)%3,1.5), box=target(dest.x,dest.y,dest.z);
      expect(view.prepare(c,...frame)).toBe(true); expect(view.hidden(box)).toBe(true); expect(allCornerRaysHit(pos,box,geometry)).toBe(true);
      expect(view.hidden(target(pos.x*.6,pos.y*.6,pos.z*.6))).toBe(false);
    }
  });
  it('rejects a door gap even when all eight target corner rays hit opaque stock',()=>{
    const s=new THREE.Scene(), b=new VillaModelBuilder(s,shellName), m=new THREE.MeshStandardMaterial();
    for(const x of [-2.5,2.5]) b.geometry(slabFaces(x,0,0,3,4,.2),m);
    const shell=b.finish(), view=new VillaWallVisibility(s), c=eye(), wide=new THREE.Box3(point(-4,-.2,-8.3),point(4,.2,-7.7));
    expect(view.prepare(c,...frame)).toBe(true); expect(view.hidden(target(-4,0,-8))).toBe(true); expect(view.hidden(target(4,0,-8))).toBe(true);
    expect(allCornerRaysHit(c.position,wide,shell)).toBe(true); expect(view.hidden(wide)).toBe(false); expect(view.hidden(target())).toBe(false);
  });
  it('supports depth intervals for an off-axis eye; coplanar, in-front and off-edge bounds remain submitted',()=>{
    const {view}=plane(); expect(view.prepare(eye(5,0,8),...frame)).toBe(true);
    expect(view.hidden(target(-1,0,-4))).toBe(true);
    expect(view.hidden(new THREE.Box3(point(-1.2,-.1,-12),point(-.8,.1,-4)))).toBe(false); // The far x edge peeks out.
    expect(view.hidden(target(0,0,.1))).toBe(false); expect(view.hidden(target(0,0,3))).toBe(false); expect(view.hidden(target(0,0,9))).toBe(false);
    expect(view.hidden(new THREE.Box3())).toBe(false); expect(view.hidden(target(NaN))).toBe(false);
  });
  it('rejects a near-plane crossing, even if the centre is well past near; never reuses a behind-camera blocker',()=>{
    const {view}=plane(), c=eye(5,0,8), base=target(-1,0,-4); expect(view.prepare(c,...frame)).toBe(true); expect(view.hidden(base)).toBe(true);
    // X/Y projections are unchanged and the centre is 9.43 m away; the near 9 m plane slices the right edge.
    c.near=9; c.updateProjectionMatrix(); expect(view.prepare(c,...frame)).toBe(false); expect(view.hidden(base)).toBe(false);
    c.near=.065; c.updateProjectionMatrix(); c.lookAt(10,0,16); expect(view.prepare(c,...frame)).toBe(false);
    c.lookAt(0,0,0); c.projectionMatrix.elements[2]+=.01; expect(view.prepare(c,...frame)).toBe(false);
  });
  it('rejects side-clipped real triangles and leaves at least one physical pixel inside each projected edge',()=>{
    const {view}=plane(), c=eye(); expect(view.prepare(c)).toBe(false); expect(view.prepare(c,80,50)).toBe(true);
    expect(view.hidden(target(3.8,0,-8,.005))).toBe(false); expect(view.prepare(c,...frame)).toBe(true); expect(view.hidden(target(3.8,0,-8,.005))).toBe(true);
    const partial=plane(front,[-20,-2,0,2,-2,0,-20,2,0,2,2,0]); expect(partial.view.prepare(c,...frame)).toBe(false);
    const diagonal=eye(7.7,0,1,point()); expect(view.prepare(diagonal,160,100)).toBe(true);
    expect(view.hidden(target(-7.7,2.6,-1,.001))).toBe(true); // A grazing face still has usable single-triangle interior.
    const shallow=target(-.462,1.378,-.06,.0001); expect(view.hidden(shallow)).toBe(false); // Same ray, insufficient depth clearance for the pixel slope.
    expect(view.prepare(diagonal,1280,800)).toBe(true); expect(view.hidden(shallow)).toBe(true);
  });
  it('requires the original visible, untransformed physical owner and original complete submission',()=>{
    const {view,scene,parent,shell,mesh,g,m}=plane(), c=eye(); expect(view.prepare(c,...frame)).toBe(true);
    const blocked=()=>{expect(view.prepare(c,...frame)).toBe(false); expect(view.hidden(target())).toBe(false);};
    parent.visible=false; blocked(); parent.visible=true; shell.position.x=1; blocked(); shell.position.x=0;
    mesh.position.y=.0001; blocked(); mesh.position.y=0; mesh.visible=false; blocked(); mesh.visible=true;
    mesh.layers.set(2); blocked(); c.layers.enable(2); expect(view.prepare(c,...frame)).toBe(true);
    scene.overrideMaterial=new THREE.MeshBasicMaterial(); blocked(); scene.overrideMaterial=null;
    scene.remove(parent); blocked(); scene.add(parent); mesh.geometry=g.clone(); blocked(); mesh.geometry=g; mesh.material=m.clone(); blocked(); mesh.material=m;
    g.setDrawRange(0,3); blocked(); g.setDrawRange(0,Infinity); g.morphAttributes.position=[g.getAttribute('position')]; blocked(); delete g.morphAttributes.position;
    const pos=g.getAttribute('position'), version=pos.version; pos.setZ(3,.03125); expect(pos.version).toBe(version); blocked(); pos.setZ(3,0);
    g.index!.array[5]=3; blocked(); g.index!.array[5]=2; expect(view.prepare(c,...frame)).toBe(true); g.index!.needsUpdate=true; blocked();
    const initial=plane(); initial.shell.position.z=10; const stale=new VillaWallVisibility(initial.scene); initial.shell.position.z=0; expect(stale.prepare(c,...frame)).toBe(false);
  });
  it('rejects impostors, glass, cutouts, other depth state, clip planes and unrecognized shader hooks',()=>{
    const {scene,shell,mesh,g,m,view}=plane(), c=eye();
    for(const [key,value] of Object.entries({visible:false,transparent:true,opacity:.99,alphaMap:new THREE.Texture(),alphaTest:.1,alphaHash:true,alphaToCoverage:true,
      displacementMap:new THREE.Texture(),depthTest:false,depthWrite:false,colorWrite:false,stencilWrite:true,side:THREE.BackSide,wireframe:true,
      polygonOffset:true,depthFunc:THREE.AlwaysDepth,clippingPlanes:[new THREE.Plane()]})) {
      const original=(m as any)[key]; (m as any)[key]=value; expect(view.prepare(c,...frame),key).toBe(false); (m as any)[key]=original;
    }
    const stock=m.onBeforeCompile; m.onBeforeCompile=()=>{}; expect(view.prepare(c,...frame)).toBe(false);
    allowVillaWallLighting(m,()=>{}); expect(view.prepare(c,...frame)).toBe(false); allowVillaWallLighting(m,stock); expect(view.prepare(c,...frame)).toBe(true);
    m.onBeforeCompile=()=>{}; expect(view.prepare(c,...frame)).toBe(false); m.onBeforeCompile=stock;
    mesh.material=[m] as any; expect(new VillaWallVisibility(scene).prepare(c,...frame)).toBe(false); mesh.material=m;
    shell.name='fake'; expect(new VillaWallVisibility(scene).prepare(c,...frame)).toBe(false); shell.name=shellName;
    mesh.name='loose pane'; expect(new VillaWallVisibility(scene).prepare(c,...frame)).toBe(false); mesh.name=shellName+'/surface';
    g.userData.villaRigidBatch=false; expect(new VillaWallVisibility(scene).prepare(c,...frame)).toBe(false);
  });
  it('uses the real finished south wall from either side but leaves its doorway and individual glazing open',()=>{
    const scene=new THREE.Scene(), materials=Object.fromEntries(['oak','stone','plaster','glass','bronze','roof'].map(k=>[k,new THREE.MeshStandardMaterial({transparent:k==='glass'})])) as VillaSurfaces;
    const shell=createVillaEnvelope(scene,materials), view=new VillaWallVisibility(scene);
    for(const [x,z,back,hidden,wall] of [[-3.45,13.5,7,true,true],[-3.45,4.8,11,true,true],
      [-3,13.5,7,false,true],[-3,4.8,11,false,true], // Both camera directions have real coverage but insufficient clearance at the joint.
      [0,12,7,false,false],[-7.7,12,7,false,false],[-3,12,10,false,false]] as const) {
      const c=eye(x,1.55,z,point(x,1.55,9)), box=target(x,1.55,back,.1);
      expect(view.prepare(c,...frame)).toBe(true); expect(view.hidden(box),`from ${x}/${z} to ${back}`).toBe(hidden);
      if(wall) expect(allCornerRaysHit(c.position,box,shell)).toBe(true);
    }
    const maps=new Set<THREE.Texture>(); shell.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose(); for(const value of Object.values(o.material)) if(value instanceof THREE.Texture) maps.add(value); o.material.dispose();}}); maps.forEach(t=>t.dispose());
  });
});
