// Authored-space → world-space bake. This changes the world, never a camera,
// projection, input direction, scene scale or rendered image.
export const reflectPointX = ([x,y,z]) => [-x,y,z];
export const reflectRectX = ([minX,minZ,maxX,maxZ]) => [-maxX,minZ,-minX,maxZ];
const entries = (object, transform) => Object.fromEntries(Object.entries(object).map(([key,value])=>[key,transform(value)]));
const positioned = item => ({...item,position:reflectPointX(item.position)});
const rectangular = item => ({...item,rect:reflectRectX(item.rect)});

function reflectFrontage(f) {
  if(f.axis==='x')return {...f,start:-f.end,end:-f.start};
  return {...f,line:-f.line,...(typeof f.side==='number'?{side:-f.side}:{})};
}

/** Complete public spatial data, independent of the source authoring convention. */
export function reflectMapDefinitionX(d) {
  return {
    ...d,
    floors:d.floors.map(reflectRectX),
    frontages:d.frontages.map(reflectFrontage),
    spawns:entries(d.spawns,list=>list.map(s=>({...positioned(s),yaw:-s.yaw}))),
    sites:d.sites.map(s=>rectangular(positioned(s))),
    buyZones:entries(d.buyZones,reflectRectX),
    platforms:d.platforms.map(rectangular),
    stairs:d.stairs.map(s=>({...rectangular(s),direction:s.direction.endsWith('x')?(s.direction==='+x'?'-x':'+x'):s.direction})),
    ceilings:d.ceilings.map(positioned),
    extraSteps:(d.extraSteps||[]).map(positioned),
    props:d.props.map(positioned),
    portals:d.portals.map(p=>({...p,x:-p.x})),
    landmarks:d.landmarks.map(positioned),
    routes:entries(d.routes,routes=>entries(routes,points=>points.map(reflectPointX))),
    callouts:d.callouts.map(rectangular),
    previewCamera:{...d.previewCamera,position:reflectPointX(d.previewCamera.position),target:reflectPointX(d.previewCamera.target)},
  };
}

export function staticFormShade(nx,ny,nz,y) {
  // Only soffit/contact occlusion. Directional lighting belongs to the world's
  // actual sun; an opposing baked horizontal key would double-darken facades.
  const form=ny<0?.94+.24*ny:.94+.06*ny;
  const contact=Math.abs(ny)<.6?.94+.06*Math.min(1,Math.max(0,y)/1.5):1;
  return form*contact;
}

/** Run once, after all source-space architecture, before glyphs/meshes/nav. */
export function bakeWorldReflectionX(w) {
  for(const b of w._buckets.values()){
    // Nonindexed triangles: reflection reverses orientation, so swap vertices
    // 1/2 in EVERY attribute. Reflected normals then agree with front faces.
    for(let i=0;i<b.positions.length;i+=9){
      for(const [data,stride] of [[b.positions,3],[b.normals,3],[b.colors,3],[b.uvs,2]]){
        const first=i/3*stride;
        for(let k=0;k<stride;k++)[data[first+stride+k],data[first+2*stride+k]]=[data[first+2*stride+k],data[first+stride+k]];
      }
    }
    for(let i=0;i<b.positions.length;i+=3){
      const oldNX=b.normals[i],ny=b.normals[i+1],nz=b.normals[i+2],y=b.positions[i+1];
      b.positions[i]=-b.positions[i];b.normals[i]=-oldNX;
      const ratio=staticFormShade(-oldNX,ny,nz,y)/staticFormShade(oldNX,ny,nz,y);
      for(let k=0;k<3;k++)b.colors[i+k]*=ratio;
      // Regenerate world-metre UVs rather than mirroring texture imagery.
      if(b.uvMode!=='authored'){
        const x=b.positions[i],z=b.positions[i+2],uv=i/3*2;
        b.uvs[uv]=Math.abs(ny)>.6?x:Math.abs(oldNX)>.6?z:x;
        b.uvs[uv+1]=Math.abs(ny)>.6?z:y;
      }
    }
  }
  const colliders=w.collisionBoxes;w.collisionBoxes=[];w.collisionGrid.clear();w.collisionBounds.makeEmpty();
  for(const c of colliders){
    const {box,kind,...options}=c,min=box.min.x,max=box.max.x;box.min.x=-max;box.max.x=-min;
    if(options.cylinder)options.cylinder={...options.cylinder,x:-options.cylinder.x};
    w.addCollider(box,kind,options);
  }
  // A cell [x,x+1] becomes [-x-1,-x], not the cell at -x.
  w.floorCells=new Set([...w.floorCells].map(cell=>{const [x,z]=cell.split(',').map(Number);return `${-x-1},${z}`;}));
  const {minX,maxX}=w.bounds;w.bounds.minX=-maxX;w.bounds.maxX=-minX;w.center.x=-w.center.x;
  w.radarTriangles=w.radarTriangles.map(([a,b,c])=>[reflectPointX(a),reflectPointX(c),reflectPointX(b)]);
  w.architectureFeatures=w.architectureFeatures.map(f=>{
    let result={...f};
    if(typeof f.x==='number')result.x=-f.x;
    if(typeof f.start==='number'&&typeof f.end==='number')result=reflectFrontage(result);
    return result;
  });
}
