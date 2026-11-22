import * as THREE from 'three';
import { describe,expect,it } from 'vitest';
import { VillaVisibleRanges } from '../src/villaVisibleRanges.js';
import { VillaStaticView } from '../src/villaStaticView.js';

/** Three distant clusters deliberately interleave outer and central authored blocks. */
function fixture(){
  const p:number[]=[],colors:number[]=[];
  for(let part=0;part<7;part++)for(let i=0;i<1430;i++){
    const x=[-90,0,90,0,-90,0,90][part]+(i%17)*.012,y=(i%9)*.002;
    p.push(x,y,0,x+.01,y+.02,0,x-.01,y+.03,0);for(let j=0;j<3;j++)colors.push(i/1431,part/7,j/3);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.userData.villaRigidBatch=true;
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true})),s=new THREE.Scene();s.add(m);
  const f=(x:number)=>{const c=new THREE.PerspectiveCamera(50,1,.05,200);c.position.set(x,0,7);c.updateMatrixWorld();return new THREE.Frustum().setFromProjectionMatrix(c.projectionMatrix.clone().multiply(c.matrixWorldInverse));};
  return{m,g,s,f};
}
describe('visible detail ranges, without detail substitution',()=>{
  it('keeps all visible faces in source order and uses the exact source attributes; reuses an unchanged index upload',()=>{
    const {m,g,f}=fixture(),sel=VillaVisibleRanges.forMesh(m)!;const near=f(0);
    const view=sel.select(near)!;expect(view).toBe(sel.proxy);expect(view.getAttribute('color')).toBe(g.getAttribute('color'));expect(view.getAttribute('position')).toBe(g.getAttribute('position'));
    const ids=Array.from(view.index!.array).slice(0,view.drawRange.count),required:number[]=[];for(let i=0;i<g.getAttribute('position').count;i++)if(Math.abs(g.getAttribute('position').getX(i))<1)required.push(i);
    expect(ids.length).toBeGreaterThanOrEqual(required.length);expect(ids.length).toBeLessThan(g.getAttribute('position').count*.65);
    const kept=new Set(ids);expect(required.every(i=>kept.has(i))).toBe(true);expect(ids.every((v,i)=>i===0||v>ids[i-1])).toBe(true);
    const ver=view.index!.version;expect(sel.select(near)).toBe(view);expect(view.index!.version).toBe(ver);
    expect(sel.select(f(-90))).toBe(view);expect(view.index!.version).toBeGreaterThan(ver);expect(sel.select(f(280))).toBe(null);
    expect(g.index).toBeNull();expect(g.drawRange.count).toBe(Infinity);sel.dispose();g.dispose();m.material.dispose();
  });
  it('does not use a partial view for a sun map or leave its index attached after a failed CCTV pass',()=>{
    const {m,g,s}=fixture(),v=new VillaStaticView(s),camera=new THREE.PerspectiveCamera(50,1,.05,200);camera.position.z=7;
    let picked:THREE.BufferGeometry|null=null,fail=false;const renderer={shadowMap:{enabled:false,autoUpdate:false,needsUpdate:false},render:()=>{picked=m.geometry;if(fail)throw Error('lost output');}};
    const draw=()=>v.draw(renderer as unknown as THREE.WebGLRenderer,s,camera);draw();expect(picked).not.toBe(g);expect(m.geometry).toBe(g);
    fail=true;expect(draw).toThrow('lost output');expect(m.geometry).toBe(g);fail=false;renderer.shadowMap.enabled=true;renderer.shadowMap.needsUpdate=true;draw();expect(picked).toBe(g);
    const original=g.getAttribute('position');v.dispose();expect(g.getAttribute('position')).toBe(original);g.dispose();m.material.dispose();
  });
  it('uses software occlusion only for the sealed leaf mesh and an actual depth viewport; restores it even after failure',()=>{
    const scene=new THREE.Scene(), fabric=new THREE.Group();fabric.name='villa-fabric-and-joinery';scene.add(fabric);
    const stock=new THREE.BufferGeometry();stock.setAttribute('position',new THREE.Float32BufferAttribute([-2,-2,0,2,-2,0,2,2,0,-2,-2,0,2,2,0,-2,2,0],3));stock.userData.villaRigidBatch=true;
    const wall=new THREE.Mesh(stock,new THREE.MeshStandardMaterial());wall.name=fabric.name+'/surface';fabric.add(wall);
    const detail=new THREE.BoxGeometry(.2,.3,.2,6,6,6), tint=new THREE.MeshStandardMaterial();detail.userData.villaRigidBatch=true;
    const piece=new THREE.Mesh(detail,tint);piece.position.set(-1.1,.7,-4);scene.add(piece);
    const cam=new THREE.PerspectiveCamera(65,1.4,.065,650);cam.position.z=8;cam.updateMatrixWorld(true);
    const index=new VillaStaticView(scene,true);index.sealEstateFinishes();let seen=true,fail=false,depth=true,width=512;
    const renderer={shadowMap:{enabled:false,autoUpdate:false,needsUpdate:false},clippingPlanes:[],localClippingEnabled:false,
      getCurrentViewport:(out:THREE.Vector4)=>out.set(0,0,width,320),getRenderTarget:()=>({depthBuffer:depth}),
      render(){seen=piece.visible;if(fail)throw Error('interrupted');}};
    const draw=()=>index.draw(renderer as unknown as THREE.WebGLRenderer,scene,cam);
    try{draw();expect(seen).toBe(false);expect(piece.visible).toBe(true);
      fail=true;expect(draw).toThrow('interrupted');expect(piece.visible).toBe(true);fail=false;
      depth=false;draw();expect(seen).toBe(true);depth=true;width=0;draw();expect(seen).toBe(true);width=512;
      renderer.shadowMap.enabled=true;draw();expect(seen).toBe(true);renderer.shadowMap.enabled=false;
      renderer.localClippingEnabled=true;draw();expect(seen).toBe(true);renderer.localClippingEnabled=false;
      const child=new THREE.Object3D();piece.add(child);draw();expect(seen).toBe(true);piece.remove(child);
      const before=tint.onBeforeCompile;tint.onBeforeCompile=()=>{};draw();expect(seen).toBe(true);tint.onBeforeCompile=before;
      draw();expect(seen).toBe(false);fabric.visible=false;draw();expect(seen).toBe(true);
    }finally{index.dispose();detail.dispose();stock.dispose();tint.dispose();wall.material.dispose();}
  });
  it('leaves transparent, pre-ranged, untagged, morph and multi-material draws alone',()=>{
    const {m,g}=fixture();m.material.transparent=true;expect(VillaVisibleRanges.forMesh(m)).toBeNull();m.material.transparent=false;
    g.setDrawRange(0,3);expect(VillaVisibleRanges.forMesh(m)).toBeNull();g.setDrawRange(0,Infinity);
    g.userData.villaRigidBatch=false;expect(VillaVisibleRanges.forMesh(m)).toBeNull();g.userData.villaRigidBatch=true;
    expect(VillaVisibleRanges.forMesh(new THREE.Mesh(g,[m.material,m.material]))).toBeNull();g.morphAttributes.position=[g.getAttribute('position')];expect(VillaVisibleRanges.forMesh(m)).toBeNull();
    g.dispose();m.material.dispose();
  });
});
