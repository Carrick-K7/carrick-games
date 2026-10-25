import * as T from 'three';

// Tiny, original procedural textures. No source images, canvas, network or async
// global scene state. The complete extra texture allocation is below 1 MiB.
export const DECORATIVE_KINDS = Object.freeze(['paint','glass','foliage']);
const noise=(x,y)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
function dataTexture(width,height,paint){
  const data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(paint(x,y,width,height),4*(y*width+x));
  const texture=new T.DataTexture(data,width,height,T.RGBAFormat);
  texture.colorSpace=T.SRGBColorSpace;texture.minFilter=T.LinearMipmapLinearFilter;texture.magFilter=T.LinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;
  texture.userData.originalProcedural=true;
  texture.userData.gpuBytes=Math.ceil(width*height*4*4/3);
  return texture;
}
export function decorativeMaterial(kind){
  let material;
  if(kind==='paint'){
    const map=dataTexture(64,64,(x,y)=>{const v=242+Math.floor(noise(x,y)*13);return[v,v,v,255];});
    map.wrapS=map.wrapT=T.RepeatWrapping;
    material=new T.MeshStandardMaterial({name:kind,map,color:0xffffff,roughness:.91,vertexColors:true});
  }else if(kind==='glass'){
    material=new T.MeshStandardMaterial({name:kind,color:0xffffff,roughness:.43,metalness:.12,emissive:0x405254,emissiveIntensity:.14,vertexColors:true});
  }else if(kind==='foliage'){
    const leaves=Array.from({length:80},(_,i)=>{
      const y=.035+.93*noise(i,1),spread=.12+.30*Math.sin(y*Math.PI);
      return{x:.5+(noise(i,2)-.5)*spread*2,y,rx:.035+.065*noise(i,3),ry:.025+.045*noise(i,4),shade:.7+.3*noise(i,5)};
    });
    const map=dataTexture(128,128,(x,y,width,height)=>{
      const u=x/width,v=y/height;let shade=0;
      for(const leaf of leaves)if(((u-leaf.x)/leaf.rx)**2+((v-leaf.y)/leaf.ry)**2<1)shade=Math.max(shade,leaf.shade);
      if(!shade)return[98,132,66,0];
      const n=.88+.12*noise(x,y);return[120*shade*n,155*shade*n,78*shade*n,255];
    });
    material=new T.MeshStandardMaterial({name:kind,map,color:0xffffff,roughness:1,alphaTest:.5,side:T.DoubleSide,vertexColors:true});
  }else return null;
  material.userData.ownedMapDecoration=true;return material;
}

export function addWorldSky(w){
  const atmosphere=w.config.atmosphere||{},horizon=new T.Color(atmosphere.sky??0xb9d5e5).convertLinearToSRGB(),zenith=new T.Color(atmosphere.zenith??0x679cca).convertLinearToSRGB();
  const map=dataTexture(256,128,(x,y,width,height)=>{
    const v=y/(height-1),elevation=Math.max(0,(v-.5)*2),u=x/width;
    const sky=['r','g','b'].map(channel=>(horizon[channel]+(zenith[channel]-horizon[channel])*elevation)*255);
    // Low-contrast, elongated periodic wisps. The earlier broad Gaussian
    // lobe read as a bright round orb in actual map renders.
    const latitude=.64+.013*Math.sin(u*Math.PI*6)+.003*Math.sin(u*Math.PI*18);
    const upper=.77+.009*Math.sin(u*Math.PI*8+1);
    const band=Math.exp(-(((v-latitude)/.008)**2)),thin=Math.exp(-(((v-upper)/.005)**2));
    const envelope=.35+.65*(.5+.5*Math.sin(u*Math.PI*10+1));
    const cloud=Math.min(.14,.11*band+.06*thin)*envelope;
    return[...sky.map(n=>n+(246-n)*cloud),255];
  });
  map.wrapS=T.RepeatWrapping;
  const material=new T.MeshBasicMaterial({name:'original-procedural-sky',map,side:T.BackSide,depthWrite:false,fog:false,toneMapped:false});
  material.userData.ownedMapDecoration=true;w.ownedMaterials.add(material);
  const geometry=new T.SphereGeometry(160,24,12),mesh=new T.Mesh(geometry,material);
  mesh.name='world-owned-sky';mesh.position.set(w.center.x,0,w.center.z);mesh.renderOrder=-1000;
  mesh.userData.ownedMapDecoration=true;w.environment.add(mesh);
  w.decorativeTextureBytes=map.userData.gpuBytes;
  for(const m of w.ownedMaterials)if(m!==material&&m.map?.userData.originalProcedural)w.decorativeTextureBytes+=m.map.userData.gpuBytes;
}

export function addFoliage(w,l){
  const [x,,z]=l.position,h=l.height;
  w.addCylinder('wood',[x,h*.42,z],l.kind==='cypress'?.15:.21,h*.84,{tint:0xb1a48c});
  if(l.kind==='cypress'){
    for(let i=0;i<4;i++){
      const g=new T.PlaneGeometry(1.8,h);g.rotateY(i*Math.PI/4);g.translate(x,h/2+.55,z);
      w.appendGeometry('foliage',g,i%2?0xb3c99b:0xc9d5a7,{preserveUV:true});
    }
  }else{
    for(let i=0;i<10;i++){
      const angle=i*Math.PI*2/10,positions=[],uv=[];
      const point=(t,side)=>{const radius=t*3.4,width=Math.sin(t*Math.PI)*.58+.03,y=h+.65*Math.sin(t*Math.PI)-t*1.35;return[x+Math.cos(angle)*radius+Math.cos(angle+Math.PI/2)*side*width,y,z+Math.sin(angle)*radius+Math.sin(angle+Math.PI/2)*side*width];};
      for(let j=0;j<8;j++){
        const a=j/8,b=(j+1)/8;
        for(const [t,s] of [[a,-1],[b,-1],[a,1],[a,1],[b,-1],[b,1]]){positions.push(...point(t,s));uv.push((s+1)/2,t);}
      }
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.computeVertexNormals();
      w.appendGeometry('foliage',g,0xc6dda5,{preserveUV:true});
    }
  }
}
