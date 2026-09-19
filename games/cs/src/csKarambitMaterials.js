import * as T from 'three';

let materials;
export function karambitMaterials(){
  if(materials)return materials;
  // Small, self-contained linear HDR reflection probe. Broad sky/ground bands
  // give the curved steel readable moving reflections without an external HDR
  // download. Three prefilters this once for the materials' different roughness.
  const width=512,height=256,data=new Uint16Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const latitude=(y+.5)/height*Math.PI,longitude=(x+.5)/width*Math.PI*2;
    const up=-Math.cos(latitude),side=Math.sin(latitude)*Math.cos(longitude);
    const forward=Math.sin(latitude)*Math.sin(longitude);
    const sky=T.MathUtils.smoothstep(up,-.12,.28);
    const horizon=Math.exp(-Math.pow(up/.13,2))*.28;
    const key=Math.exp(-Math.pow((side+.46)/.16,2)-Math.pow((up-.48)/.42,2))*2.5;
    const rim=Math.exp(-Math.pow((forward-.74)/.12,2)-Math.pow((up-.12)/.65,2))*1.4;
    const ground=[.09,.10,.115],zenith=[.55,.64,.75],i=(y*width+x)*4;
    for(let c=0;c<3;c++)data[i+c]=T.DataUtils.toHalfFloat(
      T.MathUtils.lerp(ground[c],zenith[c],sky)+horizon+key*[1,.94,.84][c]+rim*[.8,.9,1][c]);
    data[i+3]=T.DataUtils.toHalfFloat(1);
  }
  const envMap=new T.DataTexture(data,width,height,T.RGBAFormat,T.HalfFloatType);
  envMap.name='karambit-steel-reflections';
  envMap.mapping=T.EquirectangularReflectionMapping;
  envMap.colorSpace=T.LinearSRGBColorSpace;
  envMap.minFilter=envMap.magFilter=T.LinearFilter;
  envMap.needsUpdate=true;
  const steel=(name,color,roughness,intensity)=>{
    const m=new T.MeshStandardMaterial({name,color,metalness:1,roughness,envMap,envMapIntensity:intensity});
    return m;
  };
  materials={
    face:steel('karambit-satin-steel',0x939ca2,.29,.85),
    edge:steel('karambit-polished-edge',0xd0d6d9,.15,1.05),
    frame:steel('karambit-dark-steel',0x5b6269,.25,.8),
    ring:steel('karambit-ring-steel',0x939ca2,.20,.95)
  };
  return materials;
}
