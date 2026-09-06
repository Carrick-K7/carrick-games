import * as T from 'three';
const SCALE=.025;
export class SnowWorld {
  constructor(scene,config={}){this.config=config;this.theme=config.theme||'snow';this.scene=scene;this.materials=[];this.externalTextures=new Map();this.brushSolids=[];this.bombSites=[];this.buyZones=[];this.levels=new Map();this.environment=new T.Group();scene.add(this.environment);this.solids=[];this.spawns={ct:[],t:[]};this.pickups=[];this.ray=new T.Raycaster();this.floorRay=new T.Raycaster();this.nodes=[];this.grid=new Map();this.navStep=1.1;this.snow=null;this.mapGroup=new T.Group();scene.add(this.mapGroup);}
  async load(mapUrl='/cs/assets/fy_snow.bsp'){
    const read=async url=>{const r=await fetch(url);if(!r.ok)throw new Error('地图或材质加载失败');return r.arrayBuffer();};
    const [raw,...wads]=await Promise.all([mapUrl,...(this.config.wads||[])].map(read));for(const wad of wads)this.parseWAD(wad);this.parseBSP(raw);
    let restored=false;if(this.config.navigation){try{const data=JSON.parse(new TextDecoder().decode(await read(this.config.navigation)));restored=this.restoreNavigation(data);}catch{/* The original BSP remains sufficient to rebuild navigation. */}}
    if(!restored)this.buildNavigation();this.makeAtmosphere();
  }
  parseWAD(raw){
    const d=new DataView(raw),bytes=new Uint8Array(raw),nameAt=(o,n)=>new TextDecoder().decode(bytes.subarray(o,o+n)).replace(/\0.*$/,'').toLowerCase();
    if(nameAt(0,4)!=='wad3')throw new Error('地图材质格式不正确');
    const count=d.getInt32(4,true),directory=d.getInt32(8,true);
    for(let i=0;i<count;i++){const o=directory+i*32,start=d.getInt32(o,true),size=d.getInt32(o+4,true);if(bytes[o+12]!==67||bytes[o+13]!==0)continue;this.externalTextures.set(nameAt(o+16,16),bytes.slice(start,start+size));}
  }
  parseBSP(raw){
    const d=new DataView(raw),u8=new Uint8Array(raw);if(d.getInt32(0,true)!==30)throw new Error('地图格式不正确');
    const i32=o=>d.getInt32(o,true),u16=o=>d.getUint16(o,true),i16=o=>d.getInt16(o,true),f32=o=>d.getFloat32(o,true);const lumps=Array.from({length:15},(_,i)=>({o:i32(4+i*8),n:i32(8+i*8)}));
    const ents=new TextDecoder().decode(u8.subarray(lumps[0].o,lumps[0].o+lumps[0].n));this.entities=[...ents.matchAll(/\{([^}]+)\}/g)].map(m=>Object.fromEntries([...m[1].matchAll(/"([^"]+)"\s*"([^"]*)"/g)].map(v=>[v[1],v[2]])));
    const origins=this.entities.filter(e=>e.classname==='info_player_start'||e.classname==='info_player_deathmatch').map(e=>e.origin.split(/\s+/).map(Number));
    if(!origins.length)throw new Error('地图缺少出生点');
    const xs=origins.map(a=>a[0]),ys=origins.map(a=>a[1]);this.cx=(Math.min(...xs)+Math.max(...xs))/2;this.cy=(Math.min(...ys)+Math.max(...ys))/2;this.floorZ=Math.min(...origins.map(a=>a[2]))-36;
    this.convert=p=>new T.Vector3((p[0]-this.cx)*SCALE,(p[2]-this.floorZ)*SCALE,-(p[1]-this.cy)*SCALE);
    this.planes=[];for(let o=lumps[1].o;o<lumps[1].o+lumps[1].n;o+=20)this.planes.push([f32(o),f32(o+4),f32(o+8),f32(o+12)]);
    this.clip=[];for(let o=lumps[9].o;o<lumps[9].o+lumps[9].n;o+=8)this.clip.push([i32(o),i16(o+4),i16(o+6)]);
    this.bspNodes=[];for(let o=lumps[5].o;o<lumps[5].o+lumps[5].n;o+=24)this.bspNodes.push([i32(o),i16(o+4),i16(o+6)]);
    this.leaves=[];for(let o=lumps[10].o;o<lumps[10].o+lumps[10].n;o+=28)this.leaves.push(i32(o));
    this.models=[];for(let o=lumps[14].o;o<lumps[14].o+lumps[14].n;o+=64){const min=this.convert([f32(o),f32(o+4),f32(o+8)]),max=this.convert([f32(o+12),f32(o+16),f32(o+20)]);this.models.push({heads:[i32(o+36),i32(o+40),i32(o+44),i32(o+48)],first:i32(o+56),count:i32(o+60),box:new T.Box3().setFromPoints([min,max])});}
    const mo=lumps[14].o;this.heads=[i32(mo+36),i32(mo+40),i32(mo+44),i32(mo+48)];
    const verts=[];for(let o=lumps[3].o;o<lumps[3].o+lumps[3].n;o+=12)verts.push([f32(o),f32(o+4),f32(o+8)]);
    const edges=[];for(let o=lumps[12].o;o<lumps[12].o+lumps[12].n;o+=4)edges.push([u16(o),u16(o+2)]);
    const surface=[];for(let o=lumps[13].o;o<lumps[13].o+lumps[13].n;o+=4)surface.push(i32(o));
    const ti=[];for(let o=lumps[6].o;o<lumps[6].o+lumps[6].n;o+=40)ti.push({s:[f32(o),f32(o+4),f32(o+8),f32(o+12)],t:[f32(o+16),f32(o+20),f32(o+24),f32(o+28)],texture:i32(o+32)});
    const materials=[],textures=[];const texo=lumps[2].o,count=i32(texo);
    for(let i=0;i<count;i++){
      const off=i32(texo+4+i*4);if(off<0){textures.push({name:'missing',w:64,h:64});materials.push(this.fallbackMaterial('stone'));continue;}
      const o=texo+off,name=new TextDecoder().decode(u8.subarray(o,o+16)).replace(/\0.*$/,'').toLowerCase(),w=i32(o+16),h=i32(o+20),pix=i32(o+24);textures.push({name,w,h});
      const external=!pix&&this.externalTextures.get(name),pixels=external||u8,base=external?0:o,pixelOffset=external?new DataView(external.buffer).getInt32(24,true):pix;
      if(!pixelOffset||w*h>4194304){materials.push(this.fallbackMaterial(name));continue;}
      const pal=base+40+(w*h*85/64)+2,rgba=new Uint8Array(w*h*4);
      for(let p=0;p<w*h;p++){const c=pixels[base+pixelOffset+p],k=pal+c*3;rgba[p*4]=pixels[k]??180;rgba[p*4+1]=pixels[k+1]??170;rgba[p*4+2]=pixels[k+2]??145;rgba[p*4+3]=name.startsWith('{')&&c===255?0:255;}
      const tex=new T.DataTexture(rgba,w,h,T.RGBAFormat);tex.colorSpace=T.SRGBColorSpace;tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.anisotropy=8;tex.needsUpdate=true;
      materials.push(new T.MeshStandardMaterial({map:tex,color:this.theme==='desert'?0xffffff:0xdce8f4,roughness:.89,metalness:.02,side:T.DoubleSide,alphaTest:name.startsWith('{')?.5:0}));
    }
    this.materials=materials;
    const buckets=new Map(),visibleModels=[this.models[0]];this.radarTriangles=[];
    for(const e of this.entities){const model=this.models[Number(e.model?.slice(1))];if(!e.model?.startsWith('*')||!model)continue;
      if(e.classname==='func_bomb_target'){this.bombSites.push({box:model.box.clone(),pos:model.box.getCenter(new T.Vector3())});continue;}
      if(e.classname==='func_buyzone'){this.buyZones.push({box:model.box.clone(),team:e.team==='1'?'t':e.team==='2'?'ct':null});continue;}
      if(['func_wall','func_breakable','func_door','func_illusionary'].includes(e.classname)){visibleModels.push(model);if(e.classname!=='func_illusionary')this.brushSolids.push(model);}
    }
    this.bombSites.sort((a,b)=>b.pos.x-a.pos.x).forEach((site,i)=>site.id=String.fromCharCode(65+i));
    for(const model of visibleModels)for(let n=model.first;n<model.first+model.count;n++){
      const o=lumps[7].o+n*20,first=i32(o+4),num=u16(o+8),texinfo=ti[u16(o+10)];if(!texinfo)continue;const tx=textures[texinfo.texture];if(!tx||/sky|clip|origin|aaatrigger|null|nodraw/.test(tx.name))continue;
      let b=buckets.get(texinfo.texture);if(!b){b={p:[],uv:[]};buckets.set(texinfo.texture,b);}const face=[];
      for(let j=0;j<num;j++){const e=surface[first+j],vertex=verts[edges[Math.abs(e)][e<0?1:0]];if(vertex)face.push(vertex);}
      const coord=v=>[(v[0]*texinfo.s[0]+v[1]*texinfo.s[1]+v[2]*texinfo.s[2]+texinfo.s[3])/tx.w,(v[0]*texinfo.t[0]+v[1]*texinfo.t[1]+v[2]*texinfo.t[2]+texinfo.t[3])/tx.h];
      for(let j=1;j<face.length-1;j++){const tri=[face[0],face[j],face[j+1]],world=tri.map(v=>this.convert(v));for(let k=0;k<3;k++){b.p.push(...world[k].toArray());b.uv.push(...coord(tri[k]));}if(Math.abs(world[0].y-world[1].y)<.02&&Math.abs(world[0].y-world[2].y)<.02)this.radarTriangles.push(world.map(v=>v.toArray()));}
    }
    for(const [key,b] of buckets){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(b.p,3));geo.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));geo.computeVertexNormals();const mesh=new T.Mesh(geo,materials[key]);mesh.castShadow=true;mesh.receiveShadow=true;this.mapGroup.add(mesh);this.solids.push(mesh);}
    this.mapGroup.updateMatrixWorld(true);const bbox=new T.Box3().setFromObject(this.mapGroup);this.bounds={minX:bbox.min.x,maxX:bbox.max.x,minZ:bbox.min.z,maxZ:bbox.max.z,minY:bbox.min.y};this.center=new T.Vector3((bbox.min.x+bbox.max.x)/2,1,(bbox.min.z+bbox.max.z)/2);this.size=Math.max(bbox.max.x-bbox.min.x,bbox.max.z-bbox.min.z);
    for(const e of this.entities){
      if(!e.origin)continue;
      const sourceOrigin=e.origin.split(/\s+/).map(Number),pos=this.convert(sourceOrigin);
      const team=e.classname==='info_player_start'?'ct':e.classname==='info_player_deathmatch'?'t':null;
      if(team){pos.y=this.ground(pos.x,pos.z,pos.y+1)??0;this.spawns[team].push({pos,yaw:(Number(e.angle)||0)*Math.PI/180-Math.PI/2});}
      if(e.classname==='armoury_entity'){
        const item=Number(e.item??0),weapon={0:'mp5',1:'tmp',2:'p90',3:'mac10',4:'ak47',5:'sg552',6:'m4a1',7:'aug',8:'scout',9:'g3sg1',10:'awp',11:'m3',12:'xm1014',13:'m249',15:'he',16:'armor',17:'armor'}[item];
        if(weapon){
          // Drop from the entity's own height, never from a roof above it.
          // Retain the original x/z, facing, item and count for map auditing.
          const groundY=this.ground(pos.x,pos.z,pos.y+.05)??pos.y;
          pos.y=groundY+.04;
          const angle=Number(e.angles?.split(/\s+/)[1]??e.angle??0);
          this.pickups.push({pos,weapon,groundY,yaw:angle*Math.PI/180-Math.PI/2,sourceOrigin,item,count:Number(e.count??1)});
        }
      }
    }
    for(const site of this.bombSites)site.pos.y=this.ground(site.pos.x,site.pos.z,site.box.max.y+.2)??site.box.min.y;
    this.sourceTextureNames=textures.map(t=>t.name);
    this.missingTextures=textures.filter((t,i)=>!materials[i].map&&!/sky|clip|origin|aaatrigger|null|nodraw/.test(t.name)).map(t=>t.name);
  }
  fallbackMaterial(name){
    const size=64,rgba=new Uint8Array(size*size*4),desert=this.theme==='desert',base=desert?[190,164,119]:/snow|ice|white/.test(name)?[217,228,233]:[143,173,185];
    for(let i=0;i<size*size;i++){const noise=((i*73+i*i*17)%23)-11;for(let c=0;c<3;c++)rgba[i*4+c]=base[c]+noise;rgba[i*4+3]=255;}
    const tex=new T.DataTexture(rgba,size,size);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;tex.needsUpdate=true;return new T.MeshStandardMaterial({map:tex,roughness:.95,side:T.DoubleSide});
  }
  contentsHead(p,hull,heads){let n=heads[hull],guard=0;if(hull===0){while(n>=0&&guard++<512){const node=this.bspNodes[n];if(!node)return -2;const a=this.planes[node[0]];n=node[1+(p[0]*a[0]+p[1]*a[1]+p[2]*a[2]-a[3]<0?1:0)];}return this.leaves[-n-1]??-2;}
    while(n>=0&&guard++<512){const node=this.clip[n];if(!node)return -2;const a=this.planes[node[0]];n=node[1+(p[0]*a[0]+p[1]*a[1]+p[2]*a[2]-a[3]<0?1:0)];}return n;
  }
  contents(x,y,z,hull=1){const p=[x/SCALE+this.cx,-z/SCALE+this.cy,y/SCALE+this.floorZ],main=this.contentsHead(p,hull,this.heads);if(main===-2)return main;
    for(const m of this.brushSolids){const b=m.box,r=hull===0?0:.42;if(x<b.min.x-r||x>b.max.x+r||z<b.min.z-r||z>b.max.z+r||y<b.min.y-1||y>b.max.y+1)continue;if(this.contentsHead(p,hull,m.heads)===-2)return -2;}return main;
  }
  canStand(x,y,z,crouch=false){return this.contents(x,y+(crouch?.45:.9),z,crouch?3:1)!==-2;}
  ground(x,z,from=40){this.floorRay.set(new T.Vector3(x,from,z),new T.Vector3(0,-1,0));this.floorRay.far=100;const hits=this.floorRay.intersectObjects(this.solids,false);for(const h of hits){if(Math.abs(h.face.normal.y)>.5)return h.point.y;}return null;}
  raycast(origin,dir,dist=150){this.ray.set(origin,dir);this.ray.far=dist;return this.ray.intersectObjects(this.solids,false)[0]||null;}
  lineClear(a,b){const dir=b.clone().sub(a),len=dir.length();if(len<.01)return true;const hit=this.raycast(a,dir.multiplyScalar(1/len),len);return !hit||hit.distance>len-.15;}
  supportHeight(x,y,z,drop=.46,crouch=false){
    // Trace the same standing/crouching hull used for movement. A centre ray
    // alone misses the footprint touching an incline or the edge of a stair.
    if(!this.canStand(x,y,z,crouch))return null;
    const steps=Math.max(1,Math.ceil(drop/.06));let hi=y;
    for(let i=1;i<=steps;i++){let lo=y-drop*i/steps;
      if(this.canStand(x,lo,z,crouch)){hi=lo;continue;}
      for(let j=0;j<10;j++){const mid=(lo+hi)/2;if(this.canStand(x,mid,z,crouch))hi=mid;else lo=mid;}
      return hi+.001;
    }return null;
  }
  move(body,dx,dz,dt,jump=false,crouch=false){
    const p=body.pos,stepHeight=.46;
    if(jump&&body.grounded){body.vy=6;body.grounded=false;}
    if(body.vy>0)body.grounded=false;
    const steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dz))/.10));
    for(let i=0;i<steps;i++)for(const [axis,v]of [['x',dx/steps],['z',dz/steps]]){
      if(!v)continue;const nx=axis==='x'?p.x+v:p.x,nz=axis==='z'?p.z+v:p.z;
      if(this.canStand(nx,p.y,nz,crouch))p[axis]+=v;
      else if(body.grounded&&this.canStand(p.x,p.y+stepHeight,p.z,crouch)){
        const support=this.supportHeight(nx,p.y+stepHeight,nz,stepHeight+.005,crouch);
        if(support!==null&&support-p.y<=stepHeight){p[axis]+=v;p.y=support;}
      }
      if(body.grounded){const support=this.supportHeight(p.x,p.y+.002,p.z,stepHeight,crouch);
        if(support!==null){p.y=support;body.vy=0;}else body.grounded=false;
      }
    }
    if(body.grounded){const support=this.supportHeight(p.x,p.y+.002,p.z,.06,crouch);
      if(support!==null){p.y=support;body.vy=0;return;}body.grounded=false;
    }
    body.vy-=19*dt;const dy=body.vy*dt,vs=Math.max(1,Math.ceil(Math.abs(dy)/.06));
    for(let i=0;i<vs;i++){const y=p.y+dy/vs;
      if(this.canStand(p.x,y,p.z,crouch))p.y=y;
      else{if(dy<0){const support=this.supportHeight(p.x,p.y+.002,p.z,Math.abs(dy/vs)+.004,crouch);if(support!==null)p.y=support;body.grounded=true;}body.vy=0;break;}
    }
    if(body.vy<=0&&!body.grounded){const support=this.supportHeight(p.x,p.y+.002,p.z,.035,crouch);if(support!==null){p.y=support;body.grounded=true;body.vy=0;}}
    if(p.y<Math.min(-10,this.bounds.minY-4)){p.copy(this.spawns.ct[0].pos);p.y+=.08;body.vy=0;}
  }
  buildNavigation(){
    this.reachable=null;this.nodes=[];this.grid.clear();this.levels.clear();const b=this.bounds,s=this.navStep=this.config.navStep||1.1;
    this.navMinX=b.minX+.7;this.navMinZ=b.minZ+.7;this.navW=Math.ceil((b.maxX-b.minX-1.4)/s);this.navH=Math.ceil((b.maxZ-b.minZ-1.4)/s);
    for(let j=0;j<this.navH;j++)for(let i=0;i<this.navW;i++){
      const x=this.navMinX+i*s,z=this.navMinZ+j*s,heights=[];
      if(this.theme==='desert'){this.floorRay.set(new T.Vector3(x,50,z),new T.Vector3(0,-1,0));this.floorRay.far=120;for(const hit of this.floorRay.intersectObjects(this.solids,false)){if(Math.abs(hit.face.normal.y)>.5&&!heights.some(y=>Math.abs(y-hit.point.y)<.1))heights.push(hit.point.y);}}
      else{const y=this.ground(x,z,30);if(y!==null)heights.push(y);}
      for(const y of heights){if(y>20||!this.canStand(x,y+.04,z)||this.canStand(x,y-.08,z))continue;
        const n={x,z,y:y+.03,i,j,id:this.nodes.length,neighbors:[]},key=i+','+j;this.nodes.push(n);this.grid.set(key,n);if(!this.levels.has(key))this.levels.set(key,[]);this.levels.get(key).push(n);
      }
    }
    for(const n of this.nodes)for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){
      if(!di&&!dj)continue;for(const m of this.levels.get((n.i+di)+','+(n.j+dj))||[]){if(this.theme==='desert'){if(Math.abs(m.y-n.y)>2.4)continue;if(Math.abs(m.y-n.y)>.16){if(this.walkEdge(n,m))n.neighbors.push(m.id);continue;}}else if(m.y-n.y>.61||n.y-m.y>2.3)continue;
        const h=Math.max(n.y,m.y)+.035;if(di&&dj&&(!this.canStand(n.x,h,m.z)||!this.canStand(m.x,h,n.z)))continue;
        let clear=true;for(const t of [.25,.5,.75])if(!this.canStand(n.x+(m.x-n.x)*t,h,n.z+(m.z-n.z)*t)){clear=false;break;}if(clear)n.neighbors.push(m.id);
      }
    }
    if(this.theme==='desert')this.connectNarrowPassages();
    // Keep the spawn-connected play space. Roofs and exterior sky brushes must
    // never become shortcuts over tunnels or through the scenery.
    const reachable=new Set(),queue=Object.values(this.spawns).flat().map(s=>this.closest(s.pos)?.id).filter(id=>id!==undefined);
    for(let i=0;i<queue.length;i++){const id=queue[i];if(reachable.has(id))continue;reachable.add(id);for(const next of this.nodes[id].neighbors)if(!reachable.has(next))queue.push(next);}
    this.reachable=reachable;
  }
  walkEdge(n,m,jump=false){
    const body={pos:new T.Vector3(n.x,n.y,n.z),vy:0,grounded:true};
    for(let i=0;i<65;i++){const dx=m.x-body.pos.x,dz=m.z-body.pos.z,len=Math.hypot(dx,dz);if(len<.09&&Math.abs(body.pos.y-m.y)<.15)return true;const step=Math.min(len,3.2/30);this.move(body,dx/Math.max(len,.001)*step,dz/Math.max(len,.001)*step,1/30,jump&&i===0);}
    return false;
  }
  connectNarrowPassages(){
    // A coarse grid can miss a whole stair tread or a narrow offset doorway.
    // Bridge only gaps the actual player hull can traverse, including a jump.
    for(const n of this.nodes){if(n.neighbors.length>=7)continue;const local=new Set([n.id]),queue=[[n.id,0]];for(let k=0;k<queue.length;k++){const [id,depth]=queue[k];if(depth===5)continue;for(const next of this.nodes[id].neighbors)if(!local.has(next)){local.add(next);queue.push([next,depth+1]);}}
      for(let di=-4;di<=4;di++)for(let dj=-4;dj<=4;dj++)for(const m of this.levels.get((n.i+di)+','+(n.j+dj))||[]){if(local.has(m.id)||m.neighbors.length>=7||Math.abs(n.y-m.y)>1.6||Math.hypot(n.x-m.x,n.z-m.z)>3.3)continue;
        const a=new T.Vector3(n.x,n.y+1.4,n.z),b=new T.Vector3(m.x,m.y+1.4,m.z);if(!this.lineClear(a,b))continue;
        if(this.walkEdge(n,m)){n.neighbors.push(m.id);local.add(m.id);}else if(m.y-n.y<.95&&m.y-n.y>-.95&&this.walkEdge(n,m,true)){n.neighbors.push(m.id);(n.jumpLinks??=[]).push(m.id);local.add(m.id);}
      }
    }
  }
  restoreNavigation(data){
    if(data.version!==1||data.mapHash!==this.config.mapHash||data.origin?.[2]!==this.config.navStep||!Array.isArray(data.nodes)||!Array.isArray(data.reachable))return false;
    [this.navMinX,this.navMinZ,this.navStep]=data.origin;[this.navW,this.navH]=data.dimensions;this.grid.clear();this.levels.clear();
    this.nodes=data.nodes.map(([i,j,y,neighbors,jumpLinks=[]],id)=>({i,j,y,x:this.navMinX+i*this.navStep,z:this.navMinZ+j*this.navStep,id,neighbors,jumpLinks}));
    for(const n of this.nodes){if(![n.x,n.y,n.z].every(Number.isFinite)||!n.neighbors.every(id=>Number.isInteger(id)&&id>=0&&id<this.nodes.length))return false;const key=n.i+','+n.j;this.grid.set(key,n);if(!this.levels.has(key))this.levels.set(key,[]);this.levels.get(key).push(n);}
    this.reachable=new Set(data.reachable);return true;
  }
  closest(p){let closest=null,dist=Infinity;const i=Math.round((p.x-this.navMinX)/this.navStep),j=Math.round((p.z-this.navMinZ)/this.navStep);
    const consider=n=>{if(this.reachable&&!this.reachable.has(n.id))return;const d=(n.x-p.x)**2+(n.z-p.z)**2+(n.y-p.y)**2*2;if(d<dist){dist=d;closest=n;}};
    for(let dj=-3;dj<=3;dj++)for(let di=-3;di<=3;di++)for(const n of this.levels.get((i+di)+','+(j+dj))||[])consider(n);
    if(!closest)for(const n of this.nodes)consider(n);return closest;
  }
  path(from,to){const start=this.closest(from),end=this.closest(to);if(!start||!end)return[];if(start===end)return[new T.Vector3(end.x,end.y,end.z)];const size=this.nodes.length,g=new Float32Array(size).fill(Infinity),f=new Float32Array(size).fill(Infinity),prev=new Int32Array(size).fill(-1),closed=new Uint8Array(size),open=[start.id];g[start.id]=0;f[start.id]=Math.hypot(start.x-end.x,start.z-end.z);let count=0;
    while(open.length&&count++<this.nodes.length*2){let best=0;for(let i=1;i<open.length;i++)if(f[open[i]]<f[open[best]])best=i;const id=open[best];open[best]=open[open.length-1];open.pop();if(closed[id])continue;if(id===end.id){const result=[];let n=id;while(n!==start.id&&n>=0){const v=this.nodes[n];const point=new T.Vector3(v.x,v.y,v.z);point.jump=!!this.nodes[prev[n]]?.jumpLinks?.includes(n);result.push(point);n=prev[n];}return result.reverse();}closed[id]=1;const n=this.nodes[id];for(const ni of n.neighbors){if(closed[ni])continue;const next=this.nodes[ni],cost=g[id]+Math.hypot(n.x-next.x,n.z-next.z)+Math.abs(n.y-next.y)*.4;if(cost<g[ni]){g[ni]=cost;f[ni]=cost+Math.hypot(next.x-end.x,next.z-end.z);prev[ni]=id;open.push(ni);}}}return[];
  }
  makeAtmosphere(){
    if(this.theme==='desert'){
      const floor=new T.Mesh(new T.PlaneGeometry(this.size*7,this.size*7),new T.MeshStandardMaterial({color:0xc8b28c,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=this.bounds.minY-.2;floor.receiveShadow=true;this.environment.add(floor);return;
    }
    const count=700,p=new Float32Array(count*3);for(let i=0;i<count;i++){p[i*3]=this.center.x+(Math.random()-.5)*this.size*1.35;p[i*3+1]=Math.random()*24;p[i*3+2]=this.center.z+(Math.random()-.5)*this.size*1.35;}const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(p,3));const mat=new T.PointsMaterial({size:.055,color:0xedf8ff,transparent:true,opacity:.66,depthWrite:false});this.snow=new T.Points(geo,mat);this.environment.add(this.snow);
    const mountainMat=new T.MeshStandardMaterial({color:0xb9ccd6,roughness:1,flatShading:true});for(let i=0;i<28;i++){const a=i/28*Math.PI*2,r=this.size*(1.25+Math.random()*.2),h=15+Math.random()*32;const geo=new T.ConeGeometry(13+Math.random()*17,h,5,2);const m=new T.Mesh(geo,mountainMat);m.position.set(this.center.x+Math.cos(a)*r,h/2-6,this.center.z+Math.sin(a)*r);m.rotation.y=a;m.rotation.z=(Math.random()-.5)*.17;this.environment.add(m);}
    const floor=new T.Mesh(new T.PlaneGeometry(this.size*7,this.size*7),new T.MeshStandardMaterial({color:0xc4d9e5,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=this.bounds.minY-.1;floor.receiveShadow=true;this.environment.add(floor);
  }
  dispose(){
    const geometries=new Set(),materials=new Set(this.materials),textures=new Set();for(const group of [this.mapGroup,this.environment]){group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.add(m);});group.removeFromParent();}
    for(const g of geometries)g.dispose();for(const m of materials){if(m.map)textures.add(m.map);m.dispose();}for(const t of textures)t.dispose();this.solids=[];this.nodes=[];this.grid.clear();this.levels.clear();this.externalTextures.clear();
  }
  update(dt,time){if(!this.snow)return;const a=this.snow.geometry.attributes.position;for(let i=0;i<a.count;i++){a.array[i*3]+=(.15+Math.sin(time+i)*.1)*dt;a.array[i*3+1]-=(.4+(i%9)*.08)*dt;if(a.array[i*3+1]<0)a.array[i*3+1]=24;}a.needsUpdate=true;}
}
