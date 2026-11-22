// Offline inspection of the actual in-game meshes. Unlike the normal map-audit screenshot
// these frames use declared study resolution without a HUD. Never use them to report FPS.
export function renderExteriorStudy({mode,width,height}) {
  const g=window.__auditGame,s=g.scene,scene=s.scene,r=s.renderer,cam=s.camera;
  const [ow,oh]=[r.domElement.width,r.domElement.height],restores=[],overrides=new Map(),indexedEye=cam.position.toArray();
  try{
    r.setSize(width,height,false);
    if(mode==='clay'){
      const prototype=scene.getObjectByName('estate-lawn').material;
      scene.traverse(o=>{if(!o.isMesh||Array.isArray(o.material))return;const mat=o.material;
        if(o.renderOrder===10000||mat.isMeshBasicMaterial&&mat.transparent||mat.isShaderMaterial&&!mat.depthWrite){if(o.visible){restores.push(()=>o.visible=true);o.visible=false;}return;}
        const k=mat.uuid+':'+o.receiveShadow;let clay=overrides.get(k);
        if(!clay){clay=prototype.clone();clay.color.setRGB(.54,.53,.50);clay.roughness=1;clay.metalness=0;clay.emissive.setRGB(0,0,0);clay.vertexColors=false;clay.side=mat.side;
          clay.map=mat.alphaTest?mat.map:null;clay.alphaMap=mat.alphaMap??null;clay.alphaTest=mat.alphaTest??0;
          clay.transparent=mat.transparent;clay.opacity=mat.transparent?Math.max(.17,Math.min(.37,mat.opacity)) : 1;clay.depthWrite=mat.depthWrite;
          for(const slot of ['normalMap','bumpMap','roughnessMap','metalnessMap','emissiveMap','aoMap','lightMap','envMap'])clay[slot]=null;
          // Keep the *coverage* of fixed leaf sprays, not the green RGB or texture detail.
          // Transparent geometry is neutral glass / water, not removed for a prettier cutaway.
          if(mat.alphaTest&&clay.map){clay.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <map_fragment>','#ifdef USE_MAP\n diffuseColor.a*=texture2D(map,vMapUv).a;\n#endif');};clay.customProgramCacheKey=()=>'villa-shape-only-with-holes';}
          if(o.receiveShadow)s.surveyedSun?.wireReceiver(clay);overrides.set(k,clay);
        }
        restores.push(()=>{o.material=mat});o.material=clay;
      });
      const old=scene.background;restores.push(()=>{scene.background=old;});scene.background=s.sky.uniforms.horizon.value.clone();
    }
    r.render(scene,cam);const ctx=document.createElement('canvas');ctx.width=width;ctx.height=height;ctx.getContext('2d').drawImage(r.domElement,0,0);
    if(r.info.programs?.some(x=>x.diagnostics&&!x.diagnostics.runnable))throw Error('Non-runnable WebGL program in study');return{png:ctx.toDataURL('image/png'),camera:indexedEye,mode,width,height};
  }finally{for(const restore of restores.reverse())restore();for(const m of overrides.values())m.dispose();r.setSize(ow,oh,false);}
}
