import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {WorldMaterialPalette,WORLD_MATERIAL_MANIFEST,classifyWorldMaterial} from './csWorldMaterials.js';

function releaseMaterials(materials){
  const textures=new Set();
  for(const material of materials){
    if(material.userData.worldMaterialPalette)continue;
    for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    material.dispose();
  }
  for(const texture of textures)texture.dispose();
}
function scaleUV(mesh,kind){
  if(mesh.userData.materialUVScaled)return;
  const uv=mesh.geometry.getAttribute('uv'),repeat=WORLD_MATERIAL_MANIFEST[kind]?.repeatMeters||2;
  if(uv&&mesh.userData.uvMeters){for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)/repeat,uv.getY(i)/repeat);uv.needsUpdate=true;}
  mesh.userData.materialUVScaled=true;
}
function projectedUV(geometry){
  const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),uv=[];
  for(let i=0;i<positions.count;i++){
    const x=Math.abs(normals.getX(i)),y=Math.abs(normals.getY(i)),z=Math.abs(normals.getZ(i));
    uv.push(y>=x&&y>=z?positions.getX(i):x>z?positions.getZ(i):positions.getX(i),y>=x&&y>=z?positions.getZ(i):positions.getY(i));
  }
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
}

/** Replace world surfaces only. Gun, actor, HUD and objective materials stay untouched. */
export async function upgradeWorldMaterials(world,assetUrl,options={}){
  if(world.materialPalette)return options.awaitTextures===false?world.materialPalette.stats():(world.materialsReady||world.materialPalette.load());
  const palette=new WorldMaterialPalette(assetUrl,options);
  world.materialPalette=palette;
  // Both BSP and authored worlds have different geometry ownership. The palette
  // is borrowed by their meshes and released once by this world-instance lease.
  const originalDispose=world.dispose.bind(world);let disposed=false;
  world.dispose=()=>{if(disposed)return;disposed=true;try{originalDispose();}finally{palette.dispose();}};
  if(world.config.authored){
    world.mapGroup.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.userData.materialKind||mesh.userData.ownedMapDecoration)return;
      scaleUV(mesh,mesh.userData.materialKind);
    });
    world.applyMaterialPalette(kind=>WORLD_MATERIAL_MANIFEST[kind]?palette.material(kind):null,{owned:false});
  }else{
    const buckets=new Map(),oldMaterials=new Set(world.materials),oldMeshes=[...world.mapGroup.children];
    for(const mesh of oldMeshes){
      if(!mesh.isMesh)continue;
      const kind=classifyWorldMaterial(mesh.userData.sourceTextureName,world.theme);
      scaleUV(mesh,kind);
      if(!buckets.has(kind))buckets.set(kind,[]);
      buckets.get(kind).push(mesh.geometry);
      mesh.removeFromParent();
    }
    world.solids=[];
    for(const [kind,geometries] of buckets){
      const geometry=mergeGeometries(geometries,false);
      if(!geometry)throw new Error('Map surface batching failed');
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      const mesh=new T.Mesh(geometry,palette.material(kind));
      mesh.userData.materialKind=kind;mesh.userData.materialUVScaled=true;
      mesh.castShadow=mesh.receiveShadow=true;world.mapGroup.add(mesh);world.solids.push(mesh);
      for(const source of geometries)source.dispose();
    }
    releaseMaterials(oldMaterials);
    world.materials=[...buckets.keys()].map(kind=>palette.material(kind));
    // The distant snow terrain is scenery, not another collision/nav surface.
    // Batch its old individual cones without adding draw calls or animated lights.
    const scenery=new Map(),oldSceneryMaterials=new Set();
    for(const mesh of [...world.environment.children]){
      if(!mesh.isMesh)continue;
      mesh.updateMatrix();const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrix);
      projectedUV(geometry);
      const kind=world.theme==='snow'?'snow':'sandstone';
      const holder={geometry,userData:{uvMeters:true}};scaleUV(holder,kind);
      if(!scenery.has(kind))scenery.set(kind,[]);scenery.get(kind).push(geometry);
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])oldSceneryMaterials.add(material);
      mesh.geometry.dispose();mesh.removeFromParent();
    }
    for(const [kind,geometries] of scenery){
      const geometry=mergeGeometries(geometries,false),mesh=new T.Mesh(geometry,palette.material(kind));
      mesh.receiveShadow=true;mesh.userData.materialKind=kind;world.environment.add(mesh);
      for(const source of geometries)source.dispose();
    }
    releaseMaterials(oldSceneryMaterials);
  }
  world.mapGroup.updateMatrixWorld(true);
  world.sourceMissingTextures=world.missingTextures||[];
  world.missingTextures=[];
  // Geometry and usable neutral materials are ready now. Optional photographs
  // refine this same world in place; they must not gate arena entry or movement.
  world.materialsReady=palette.load().then(stats=>{
    if(!disposed)world.missingTextures=[...new Set(stats.assets.filter(a=>a.slot==='map'&&a.state==='failed').map(a=>a.kind))];
    return stats;
  });
  return options.awaitTextures===false?palette.stats():world.materialsReady;
}
