import * as T from 'three';
import { SnowWorld } from './csWorld.js';
import { CLASSIC_MAPS } from './csClassicMaps.js';

export const AUTHORED_HULL = Object.freeze({radius:.42,standing:1.8,crouching:.9,step:.46});
const EPS = .0001, CELL = 4;
const COLORS = {plaster:0xd9c5a3,sandstone:0xc8ad7b,brick:0xa87153,cobble:0x999288,concrete:0xb7ac95,wood:0x795338,metal:0x5e6564,roof:0x9b5440,snow:0xdce5df};
const key = (x,z) => `${x},${z}`;
const contains = (r,x,z) => x>=r[0]&&x<=r[2]&&z>=r[1]&&z<=r[3];
const vec = a => new T.Vector3(...a);

/** Local-only authored worlds. One static mesh per semantic material, metre UVs.
 * Collision uses a spatial index of the same architectural/prop primitives;
 * navigation uses only supported walkable surfaces, never decorative rooftops.
 */
export class AuthoredWorld extends SnowWorld {
  constructor(scene,config={},assetUrl) {
    const options=typeof config==='string'?{id:config}:config,id=options.id;
    const definition=CLASSIC_MAPS[id];
    if(!definition)throw new Error(`Unknown authored map: ${id}`);
    super(scene,options,assetUrl);
    this.definition=definition;
    this.config={...this.definition,...options,id};this.theme='desert';
    this.tacticalRoutes=this.definition.routes;this.previewCamera=this.definition.previewCamera;
    this.landmarks=this.definition.landmarks;this.authored=true;this.navStep=1;
    this.collisionBoxes=[];this.collisionGrid=new Map();this.floorCells=new Set();
    this.ownedMaterials=new Set();this.borrowedMaterials=new Set();this.materialMeshes=new Map();
    this._buckets=new Map();this._disposed=false;this._loaded=false;
    this.mapGroup.name=`authored-${id}`;this.environment.name=`environment-${id}`;
    this.convert=p=>Array.isArray(p)?vec(p):new T.Vector3(p.x,p.y,p.z);
  }

  async load() {
    if(this._disposed)throw new Error('Cannot load a disposed authored world');
    if(this._loaded)return this;
    const start=performance.now(),d=this.definition;
    for(const r of d.floors)for(let z=r[1];z<r[3];z++)for(let x=r[0];x<r[2];x++)this.floorCells.add(key(x,z));
    const xs=d.floors.flatMap(r=>[r[0],r[2]]),zs=d.floors.flatMap(r=>[r[1],r[3]]);
    this.bounds={minX:Math.min(...xs)-.5,maxX:Math.max(...xs)+.5,minZ:Math.min(...zs)-.5,maxZ:Math.max(...zs)+.5,minY:-.35};
    this.center=new T.Vector3((this.bounds.minX+this.bounds.maxX)/2,1,(this.bounds.minZ+this.bounds.maxZ)/2);
    this.size=Math.max(this.bounds.maxX-this.bounds.minX,this.bounds.maxZ-this.bounds.minZ);
    this.radarTriangles=[];
    this.buildFloors();
    // Surrounding terrain is presentation-only: it shares the floor material
    // batch but never enters collision, radar, navigation, or supported space.
    const terrain=new T.PlaneGeometry(this.size*7,this.size*7);terrain.rotateX(-Math.PI/2);terrain.translate(this.center.x,-.42,this.center.z);
    this.appendGeometry(d.style==='italian'?'cobble':'sandstone',terrain);
    this.buildFacades();
    for(const p of d.platforms||[])this.addBox(p.kind,[(p.rect[0]+p.rect[2])/2,p.height/2,(p.rect[1]+p.rect[3])/2],[p.rect[2]-p.rect[0],p.height,p.rect[3]-p.rect[1]],{walkable:true});
    for(const stairs of d.stairs||[])this.addStairs(stairs);
    for(const p of [...d.ceilings,...(d.extraSteps||[]),...d.props])this.addDescriptor(p);
    for(const portal of d.portals)this.addPortal(portal);
    for(const landmark of d.landmarks)this.addLandmark(landmark);
    for(const site of d.sites)this.addSiteMark(site);
    this.finishMeshes();
    this.spawns=Object.fromEntries(Object.entries(d.spawns).map(([team,spawns])=>[team,spawns.map(s=>({pos:vec(s.position),yaw:s.yaw}))]));
    this.bombSites=d.sites.map(s=>({id:s.id,pos:vec(s.position),box:new T.Box3(new T.Vector3(s.rect[0],-.1,s.rect[1]),new T.Vector3(s.rect[2],2.4,s.rect[3]))}));
    this.buyZones=Object.entries(d.buyZones).map(([team,r])=>({team,box:new T.Box3(new T.Vector3(r[0],-.1,r[1]),new T.Vector3(r[2],2.5,r[3]))}));
    this.buildNavigation();this._loaded=true;
    this.stats={drawCalls:this.mapGroup.children.length,triangles:this.mapGroup.children.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0),colliders:this.collisionBoxes.length,navNodes:this.nodes.length,loadMs:performance.now()-start};
    return this;
  }

  // Merge each floor row into slabs. Overlapping route rectangles never z-fight.
  buildFloors() {
    const b=this.bounds,kind=this.definition.style==='italian'?'cobble':'concrete';
    for(let z=Math.ceil(b.minZ);z<b.maxZ;z++){
      let begin=null;
      for(let x=Math.ceil(b.minX);x<=Math.floor(b.maxX);x++){
        const has=this.floorCells.has(key(x,z));
        if(has&&begin===null)begin=x;
        if(!has&&begin!==null){
          this.addBox(kind,[(begin+x)/2,-.175,z+.5],[x-begin,.35,1],{floor:true,walkable:true});
          this.radarTriangles.push([[begin,0,z],[x,0,z],[x,0,z+1]],[[begin,0,z],[x,0,z+1],[begin,0,z+1]]);begin=null;
        }
      }
    }
  }

  buildFacades() {
    const lines=new Map();
    const edge=(axis,line,a,side)=>{const k=`${axis},${line},${side}`;if(!lines.has(k))lines.set(k,[]);lines.get(k).push(a);};
    for(const cell of this.floorCells){const [x,z]=cell.split(',').map(Number);
      if(!this.floorCells.has(key(x,z-1)))edge('x',z,x,-1);
      if(!this.floorCells.has(key(x,z+1)))edge('x',z+1,x,1);
      if(!this.floorCells.has(key(x-1,z)))edge('z',x,z,-1);
      if(!this.floorCells.has(key(x+1,z)))edge('z',x+1,z,1);
    }
    let serial=0;
    for(const [k,values] of lines){const [axis,lineRaw,sideRaw]=k.split(','),line=Number(lineRaw),side=Number(sideRaw);values.sort((a,b)=>a-b);
      let begin=values[0],end=begin+1;
      const emit=()=>{
        const total=end-begin,parts=Math.ceil(total/5.5),span=total/parts;
        for(let j=0;j<parts;j++){
          const mid=begin+(j+.5)*span,h=5.4+(serial++%4)*.65;
          const p=axis==='x'?[mid,h/2,line+side*.1]:[line+side*.1,h/2,mid];
          const size=axis==='x'?[span+.02,h,.45]:[.45,h,span+.02];
          const italian=this.definition.style==='italian';
          const tints=italian?[0xf2dcc4,0xe3bd9f,0xf0c9af,0xe8dfd0,0xd9b99a]:[0xf1e1c7,0xe5cda6,0xf5ead7,0xddc7a4];
          const tint=tints[serial%tints.length];
          this.addBox('plaster',p,size,{tint});
          // Buildings extend OUT of the playable footprint. Limit depth to half
          // the gap to another street: opposite facades never fill a passage.
          const start=begin+j*span,finish=start+span;
          let depth=3.4+(serial%3)*.7;
          outer:for(let away=.5;away<=12;away+=.5)for(let at=start+.01;at<finish;at+=.45){
            const xx=axis==='x'?at:line+side*away,zz=axis==='x'?line+side*away:at;
            if(this.floorCells.has(key(Math.floor(xx),Math.floor(zz)))){depth=Math.min(depth,Math.max(.35,(away-.5)/2));break outer;}
          }
          const mass=axis==='x'?[mid,h/2,line+side*depth/2]:[line+side*depth/2,h/2,mid];
          this.addBox('plaster',mass,axis==='x'?[span,h,depth]:[depth,h,span],{tint});
          if(italian)this.addPitchedRoof(axis,mid,line+side*depth/2,span+.14,depth+.18,h,Math.min(1.45,depth*.34));
          else {
            this.addBox('sandstone',[mass[0],h+.13,mass[2]],axis==='x'?[span+.14,.26,depth+.15]:[depth+.15,.26,span+.14],{solid:false,tint});
            this.addBox('plaster',[mass[0],h+.43,mass[2]],axis==='x'?[span,.55,.17]:[.17,.55,span],{solid:false,tint});
          }
          const trim=axis==='x'?[span+.04,.48,.52]:[.52,.48,span+.04];
          this.addBox(this.definition.style==='italian'?'brick':'sandstone',[p[0],.24,p[2]],trim,{solid:false});
          this.addBox(this.definition.style==='italian'?'roof':'sandstone',[p[0],h+.12,p[2]],axis==='x'?[span+.2,.24,1.4]:[1.4,.24,span+.2],{solid:false});
          if(span>2){
            if(serial%3===0){
              const door=axis==='x'?[mid,1.05,line-side*.15]:[line-side*.15,1.05,mid];
              this.addBox('wood',door,axis==='x'?[1.15,2.1,.14]:[.14,2.1,1.15],{solid:false,tint:0xbab3a7});
              this.addBox('sandstone',[door[0],2.15,door[2]],axis==='x'?[1.35,.15,.28]:[.28,.15,1.35],{solid:false});
            }
            if(italian&&serial%5===0){
              const bx=axis==='x'?mid:line-side*.43,bz=axis==='x'?line-side*.43:mid;
              this.addBox('sandstone',[bx,2.5,bz],axis==='x'?[2.5,.18,.85]:[.85,.18,2.5]);
              for(const dy of [2.65,3.28])this.addBox('metal',[bx,dy,bz],axis==='x'?[2.5,.065,.85]:[.85,.065,2.5],{solid:false});
              for(let k=0;k<7;k++)this.addBox('metal',[bx+(axis==='x'?(k-3)*.38:-side*.4),2.97,bz+(axis==='z'?(k-3)*.38:-side*.4)],[.035,.65,.035],{solid:false});
            }
            for(const offset of span>4?[-span*.26,span*.26]:[0]){
              const wx=p[0]+(axis==='x'?offset:-side*.26),wz=p[2]+(axis==='z'?offset:-side*.26);
              this.addBox('wood',[wx,3.3,wz],axis==='x'?[1.08,1.35,.13]:[.13,1.35,1.08],{solid:false});
              this.addBox('sandstone',[wx,2.58,wz],axis==='x'?[1.3,.12,.25]:[.25,.12,1.3],{solid:false});
              for(const dy of [-.42,-.14,.14,.42])this.addBox('wood',[wx,3.3+dy,wz+(axis==='x'?-side*.08:0)],axis==='x'?[1.12,.065,.17]:[.17,.065,1.12],{solid:false});
            }
          }
        }
      };
      for(let i=1;i<values.length;i++){if(values[i]===end)end++;else{emit();begin=values[i];end=begin+1;}}emit();
    }
  }

  addPitchedRoof(axis,along,across,width,depth,y,rise) {
    const point=(u,v,h)=>axis==='x'?[along+u,y+h,across+v]:[across+v,y+h,along+u];
    const a=point(-width/2,-depth/2,0),b=point(width/2,-depth/2,0),c=point(width/2,depth/2,0),d=point(-width/2,depth/2,0),e=point(-width/2,0,rise),f=point(width/2,0,rise);
    const points=[a,e,b,b,e,f,d,c,e,c,f,e,a,d,e,b,f,c];
    // Each triangle's winding faces away from the solid roof centre.
    const centre=new T.Vector3(...point(0,0,rise*.3)),positions=[];
    for(let i=0;i<points.length;i+=3){const tri=points.slice(i,i+3).map(vec),normal=tri[1].clone().sub(tri[0]).cross(tri[2].clone().sub(tri[0])),out=tri[0].clone().add(tri[1]).add(tri[2]).multiplyScalar(1/3).sub(centre);if(normal.dot(out)<0)[tri[1],tri[2]]=[tri[2],tri[1]];for(const p of tri)positions.push(...p.toArray());}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();this.appendGeometry('roof',g);
  }

  addStairs({rect:r,height,direction,steps}) {
    for(let i=0;i<steps;i++){
      const unit=(r[3]-r[1])/steps,z=r[1]+(i+.5)*unit;
      const h=height*(direction==='+z'?i+1:steps-i)/steps;
      this.addBox('sandstone',[(r[0]+r[2])/2,h/2,z],[r[2]-r[0],h,unit+.002],{walkable:true});
    }
  }

  addPortal({name,x,z,axis,width,opening,height,bottom=0,kind,sill=0}) {
    const along=(offset,y,w,h,depth=.7,walkable=false)=>this.addBox(kind,[x+(axis==='x'?offset:0),y,z+(axis==='z'?offset:0)],axis==='x'?[w,h,depth]:[depth,h,w],{walkable,name});
    const side=(width-opening)/2;
    for(const s of [-1,1])along(s*(opening/2+side/2),height/2,side,height);
    const spring=bottom+2.25,peak=Math.min(height-.25,bottom+3.15);
    // Eight masonry voussoirs give a recognisable rounded arch and conservative
    // matching stepped collision. Every opening retains standing head clearance.
    for(let i=0;i<8;i++){
      const w=opening/8,u=(i+.5)/8*2-1,lower=spring+(peak-spring)*Math.sqrt(1-u*u);
      along(-opening/2+(i+.5)*w,(height+lower)/2,w+.005,height-lower);
    }
    if(sill)along(0,sill/2,opening,sill,1.05,true);
  }

  addDescriptor(p) {
    if(p.shape==='cylinder')this.addCylinder(p.kind,p.position,p.radius,p.height,{solid:p.solid!==false});
    else this.addBox(p.kind,p.position,p.size,{solid:p.solid!==false,walkable:!!p.walkable});
    if(p.detail==='crate'){
      const [x,y,z]=p.position,[w,h,d]=p.size;
      for(const dx of [-w*.34,w*.34])this.addBox('metal',[x+dx,y,z],[.075,h+.025,d+.025],{solid:false});
      for(const dy of [-h*.38,h*.38])this.addBox('wood',[x,y+dy,z],[w+.055,.09,d+.055],{solid:false});
    }
  }

  addLandmark(l) {
    const [x,,z]=l.position;
    if(l.kind==='fountain'){
      this.addCylinder('sandstone',[x,.32,z],l.radius,.64);
      this.addCylinder('metal',[x,.66,z],l.radius*.77,.045,{solid:false});
      this.addCylinder('sandstone',[x,1.05,z],.20,1.3);
      this.addCylinder('sandstone',[x,1.5,z],l.radius*.52,.17);
      this.addCylinder('sandstone',[x,1.8,z],.12,.6);
    } else if(l.kind==='bellTower'||l.kind==='minaret'){
      const h=l.height,w=l.kind==='bellTower'?3.4:2.7;
      this.addBox('sandstone',[x,h*.39,z],[w,h*.78,w]);
      for(const dx of [-1,1])for(const dz of [-1,1])this.addBox('sandstone',[x+dx*(w/2-.2),h*.86,z+dz*(w/2-.2)],[.4,h*.2,.4]);
      this.addBox('sandstone',[x,h*.97,z],[w+.5,.35,w+.5]);
      const cap=new T.ConeGeometry(w*.85,h*.18,4);cap.rotateY(Math.PI/4);cap.translate(x,h*1.06,z);this.appendGeometry(l.kind==='bellTower'?'roof':'sandstone',cap);
      if(l.kind==='bellTower')this.addCylinder('metal',[x,h*.85,z],.45,.8,{solid:false});
    } else if(l.kind==='canopy'){
      this.addBox('wood',[x,l.height,z],[l.width,.17,l.depth],{solid:true});
      for(const dx of [-1,1])for(const dz of [-1,1])this.addBox('wood',[x+dx*(l.width/2-.14),l.height/2,z+dz*(l.depth/2-.14)],[.13,l.height,.13]);
      for(let i=0;i<6;i++)this.addBox('roof',[x-l.width/2+(i+.5)*l.width/6,l.height+.11,z],[l.width/9,.07,l.depth+.1],{solid:false});
    } else if(l.kind==='palm'){
      this.addCylinder('wood',[x,l.height*.43,z],.23,l.height*.86);
      for(let i=0;i<7;i++){
        const a=i*Math.PI*2/7,g=new T.ConeGeometry(.48,3.8,3);g.rotateZ(Math.PI*.39);g.rotateY(a);g.translate(x+Math.cos(a)*1.4,l.height-.5,z-Math.sin(a)*1.4);this.appendGeometry('metal',g,0x668254);
      }
    } else if(l.kind==='cypress'){
      this.addCylinder('wood',[x,.8,z],.2,1.6);
      const g=new T.ConeGeometry(.85,l.height,7);g.translate(x,l.height/2+.4,z);this.appendGeometry('metal',g,0x53664b);
    }
  }

  addSiteMark(site) {
    const r=site.rect,cx=(r[0]+r[2])/2,cz=(r[1]+r[3])/2,w=r[2]-r[0],d=r[3]-r[1];
    for(const s of [-1,1]){
      this.addBox('brick',[cx,.013,cz+s*(d/2-.5)],[w-1,.018,.09],{solid:false});
      this.addBox('brick',[cx+s*(w/2-.5),.013,cz],[.09,.018,d-1],{solid:false});
    }
    // Stencilled letter built from flat strips, never a network/canvas texture.
    const [x,,z]=site.position,segments=site.id==='A'?[[0,-.5,1.2,.16],[-.55,0,.16,1.5],[.55,0,.16,1.5],[0,0,1.2,.16]]:[[-.55,0,.16,1.6],[0,-.72,1.2,.16],[0,0,1.2,.16],[0,.72,1.2,.16],[.55,0,.16,1.6]];
    for(const [dx,dz,sw,sd] of segments)this.addBox('brick',[x+dx,.025,z+dz],[sw,.018,sd],{solid:false});
  }

  addBox(kind,position,size,options={}) {
    const g=new T.BoxGeometry(...size);g.translate(...position);this.appendGeometry(kind,g,options.tint??0xffffff);
    if(options.solid!==false){const p=vec(position),s=vec(size).multiplyScalar(.5);this.addCollider(new T.Box3(p.clone().sub(s),p.clone().add(s)),kind,options);}
  }
  addCylinder(kind,position,radius,height,options={}) {
    const g=new T.CylinderGeometry(radius,radius,height,12);g.translate(...position);this.appendGeometry(kind,g);
    if(options.solid!==false){const [x,y,z]=position;this.addCollider(new T.Box3(new T.Vector3(x-radius,y-height/2,z-radius),new T.Vector3(x+radius,y+height/2,z+radius)),kind,{...options,cylinder:{x,z,radius}});}
  }
  addCollider(box,kind,options) {
    const collider={box,kind,...options};this.collisionBoxes.push(collider);
    for(let z=Math.floor(box.min.z/CELL);z<=Math.floor(box.max.z/CELL);z++)for(let x=Math.floor(box.min.x/CELL);x<=Math.floor(box.max.x/CELL);x++){
      const k=key(x,z);if(!this.collisionGrid.has(k))this.collisionGrid.set(k,[]);this.collisionGrid.get(k).push(collider);
    }
  }
  appendGeometry(kind,geometry,tint=0xffffff) {
    const g=geometry.index?geometry.toNonIndexed():geometry;
    if(!this._buckets.has(kind))this._buckets.set(kind,{positions:[],normals:[],uvs:[],colors:[]});
    const b=this._buckets.get(kind),p=g.attributes.position,n=g.attributes.normal,c=new T.Color(tint);
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),y=p.getY(i),z=p.getZ(i),nx=n.getX(i),ny=n.getY(i),nz=n.getZ(i);
      b.positions.push(x,y,z);b.normals.push(nx,ny,nz);
      // World-aligned UVs measured in metres, shared across walls and props.
      b.uvs.push(Math.abs(ny)>.6?x:Math.abs(nx)>.6?z:x,Math.abs(ny)>.6?z:y);
      b.colors.push(c.r,c.g,c.b);
    }
    if(g!==geometry)g.dispose();geometry.dispose();
  }
  finishMeshes() {
    for(const [kind,b] of this._buckets){
      const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(b.positions,3));g.setAttribute('normal',new T.Float32BufferAttribute(b.normals,3));g.setAttribute('uv',new T.Float32BufferAttribute(b.uvs,2));g.setAttribute('color',new T.Float32BufferAttribute(b.colors,3));g.computeBoundingSphere();
      const material=new T.MeshStandardMaterial({name:kind,color:COLORS[kind]||0xffffff,roughness:.9,vertexColors:true});
      this.ownedMaterials.add(material);this.materials.push(material);
      const mesh=new T.Mesh(g,material);mesh.name=`${this.definition.id}-${kind}`;mesh.userData.materialKind=kind;mesh.userData.uvMeters=true;mesh.castShadow=true;mesh.receiveShadow=true;
      this.mapGroup.add(mesh);this.solids.push(mesh);this.materialMeshes.set(kind,mesh);
    }
    this._buckets.clear();this.mapGroup.updateMatrixWorld(true);
  }

  /** Borrowed palettes remain owned by the caller; owned palettes are released. */
  applyMaterialPalette(mapping,{owned=false}={}) {
    if(this._disposed)return;
    const previousMaterials=new Set();
    for(const [kind,mesh] of this.materialMeshes){const material=typeof mapping==='function'?mapping(kind):mapping[kind];if(!material||material===mesh.material)continue;
      previousMaterials.add(mesh.material);mesh.material=material;
      if(mesh.geometry.hasAttribute('color')&&!material.vertexColors){material.vertexColors=true;material.needsUpdate=true;}
      if(owned)this.ownedMaterials.add(material);else this.borrowedMaterials.add(material);
    }
    this.materials=[...new Set([...this.materialMeshes.values()].map(m=>m.material))];
    const retained=new Set(this.materials),retainedTextures=new Set();
    for(const material of retained)for(const value of Object.values(material))if(value?.isTexture)retainedTextures.add(value);
    for(const material of previousMaterials)if(!retained.has(material)&&this.ownedMaterials.delete(material))this.releaseMaterial(material,retainedTextures);
  }

  localColliders(x,z,r=AUTHORED_HULL.radius) {
    const minX=Math.floor((x-r)/CELL),maxX=Math.floor((x+r)/CELL),minZ=Math.floor((z-r)/CELL),maxZ=Math.floor((z+r)/CELL);
    if(minX===maxX&&minZ===maxZ)return this.collisionGrid.get(key(minX,minZ))||[];
    const result=new Set();for(let j=minZ;j<=maxZ;j++)for(let i=minX;i<=maxX;i++)for(const c of this.collisionGrid.get(key(i,j))||[])result.add(c);return result;
  }
  footprintSupported(x,z,r=AUTHORED_HULL.radius) {
    // Visible perimeter masonry also blocks airborne hulls. Keeping the floor
    // footprint bounded prevents numerical corner escapes into scenery.
    return [[-r,-r],[r,-r],[-r,r],[r,r],[0,0]].every(([dx,dz])=>this.floorCells.has(key(Math.floor(x+dx),Math.floor(z+dz))));
  }
  overlaps(c,x,z,r=AUTHORED_HULL.radius) {
    const b=c.box;if(x+r<=b.min.x+EPS||x-r>=b.max.x-EPS||z+r<=b.min.z+EPS||z-r>=b.max.z-EPS)return false;
    if(c.cylinder){const q=c.cylinder,dx=Math.max(Math.abs(x-q.x)-r,0),dz=Math.max(Math.abs(z-q.z)-r,0);return dx*dx+dz*dz<q.radius*q.radius-EPS;}
    return true;
  }
  canStand(x,y,z,crouch=false) {
    if(this._disposed||y<-.001||!this.footprintSupported(x,z))return false;
    const h=crouch?AUTHORED_HULL.crouching:AUTHORED_HULL.standing;
    for(const c of this.localColliders(x,z)){if(y>=c.box.max.y-EPS||y+h<=c.box.min.y+EPS)continue;if(this.overlaps(c,x,z))return false;}return true;
  }
  contents(x,y,z,hull=1) {
    if(hull===0){if(!this.footprintSupported(x,z,0))return -2;for(const c of this.localColliders(x,z,0))if(c.box.containsPoint(new T.Vector3(x,y,z)))return -2;return -1;}
    return this.canStand(x,y-(hull===3?.45:.9),z,hull===3)?-1:-2;
  }
  ground(x,z,from=40) {
    if(!this.footprintSupported(x,z,0))return null;let best=null;
    for(const c of this.localColliders(x,z,0)){const b=c.box;if(b.max.y>from+EPS||x<b.min.x||x>b.max.x||z<b.min.z||z>b.max.z)continue;if(c.cylinder&&Math.hypot(x-c.cylinder.x,z-c.cylinder.z)>c.cylinder.radius)continue;best=Math.max(best??-Infinity,b.max.y);}return best;
  }
  supportHeight(x,y,z,drop=.46,crouch=false) {
    if(!this.canStand(x,y,z,crouch))return null;let best=null;
    for(const c of this.localColliders(x,z)){const top=c.box.max.y;if(top>y+EPS||top<y-drop-EPS||!this.overlaps(c,x,z))continue;if(best===null||top>best)best=top;}
    return best===null?null:best+.001;
  }
  navigationHeight(x,z) {
    let top=0;for(const c of this.localColliders(x,z))if(c.walkable&&this.overlaps(c,x,z))top=Math.max(top,c.box.max.y);return top;
  }

  buildNavigation() {
    this.nodes=[];this.grid.clear();this.levels.clear();this.reachable=null;
    const b=this.bounds,s=this.navStep=1;this.navMinX=Math.ceil(b.minX)+.5;this.navMinZ=Math.ceil(b.minZ)+.5;
    this.navW=Math.ceil((b.maxX-this.navMinX)/s);this.navH=Math.ceil((b.maxZ-this.navMinZ)/s);
    for(let j=0;j<this.navH;j++)for(let i=0;i<this.navW;i++){
      const x=this.navMinX+i*s,z=this.navMinZ+j*s;if(!this.footprintSupported(x,z))continue;
      const y=this.navigationHeight(x,z)+.03;if(!this.canStand(x,y,z))continue;
      const n={x,y,z,i,j,id:this.nodes.length,neighbors:[]};this.nodes.push(n);this.grid.set(key(i,j),n);this.levels.set(key(i,j),[n]);
    }
    for(const n of this.nodes)for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){
      if(!di&&!dj)continue;const m=this.grid.get(key(n.i+di,n.j+dj));if(!m||Math.abs(n.y-m.y)>AUTHORED_HULL.step+.01)continue;
      if(Math.abs(n.y-m.y)>.01){if(this.walkEdge(n,m))n.neighbors.push(m.id);continue;}
      let valid=true;for(const t of [.25,.5,.75]){const x=n.x+(m.x-n.x)*t,z=n.z+(m.z-n.z)*t;if(!this.canStand(x,n.y,z)||this.supportHeight(x,n.y,z,.08)===null){valid=false;break;}}
      if(valid)n.neighbors.push(m.id);
    }
    // Flood from ONE spawn: unlike a union flood this detects disconnected teams.
    const first=this.closest(this.spawns.t[0].pos),queue=first?[first.id]:[],reachable=new Set(queue);
    for(let i=0;i<queue.length;i++)for(const next of this.nodes[queue[i]].neighbors)if(!reachable.has(next)){reachable.add(next);queue.push(next);}
    this.reachable=reachable;
  }

  *rayCells(origin,dir,dist) {
    let x=Math.floor(origin.x/CELL),z=Math.floor(origin.z/CELL),distance=0;
    const sx=Math.sign(dir.x),sz=Math.sign(dir.z),dx=sx?CELL/Math.abs(dir.x):Infinity,dz=sz?CELL/Math.abs(dir.z):Infinity;
    let tx=sx?((x+(sx>0?1:0))*CELL-origin.x)/dir.x:Infinity,tz=sz?((z+(sz>0?1:0))*CELL-origin.z)/dir.z:Infinity;
    while(distance<=dist){
      yield {distance,colliders:this.collisionGrid.get(key(x,z))||[]};
      if(tx===Infinity&&tz===Infinity)break;
      if(tx<tz){distance=tx;tx+=dx;x+=sx;}else if(tz<tx){distance=tz;tz+=dz;z+=sz;}else{distance=tx;tx+=dx;tz+=dz;x+=sx;z+=sz;}
    }
  }
  raycast(origin,dir,dist=150) {
    if(this._disposed||dist<=0)return null;
    let closest=dist,chosen=null,chosenNormal=null;const tested=new Set();
    for(const cell of this.rayCells(origin,dir,dist)){
      if(cell.distance>closest)break;
      for(const c of cell.colliders){
      if(tested.has(c))continue;tested.add(c);
      const b=c.box;let near=-Infinity,far=Infinity,nearAxis='x',farAxis='x',nearSign=-1,farSign=1,miss=false;
      for(const axis of ['x','y','z']){
        if(Math.abs(dir[axis])<1e-10){if(origin[axis]<b.min[axis]||origin[axis]>b.max[axis]){miss=true;break;}continue;}
        let lo=(b.min[axis]-origin[axis])/dir[axis],hi=(b.max[axis]-origin[axis])/dir[axis],sign=-1;
        if(lo>hi){[lo,hi]=[hi,lo];sign=1;}
        if(lo>near){near=lo;nearAxis=axis;nearSign=sign;}if(hi<far){far=hi;farAxis=axis;farSign=-sign;}if(near>far){miss=true;break;}
      }
      if(miss||far<0)continue;
      let distance=near>=0?near:far;if(Math.max(0,near)>=closest)continue;
      let normal=new T.Vector3();normal[near>=0?nearAxis:farAxis]=near>=0?nearSign:farSign;
      if(c.cylinder){
        const q=c.cylinder,ox=origin.x-q.x,oz=origin.z-q.z,a=dir.x*dir.x+dir.z*dir.z,bb=2*(ox*dir.x+oz*dir.z),cc=ox*ox+oz*oz-q.radius*q.radius,hits=[];
        const disc=bb*bb-4*a*cc;
        if(a>1e-10&&disc>=0)for(const t of [(-bb-Math.sqrt(disc))/(2*a),(-bb+Math.sqrt(disc))/(2*a)]){const y=origin.y+dir.y*t;if(t>=0&&y>=b.min.y&&y<=b.max.y)hits.push({t,n:new T.Vector3(ox+dir.x*t,0,oz+dir.z*t).normalize()});}
        if(Math.abs(dir.y)>1e-10)for(const [y,sign] of [[b.min.y,-1],[b.max.y,1]]){const t=(y-origin.y)/dir.y;if(t>=0&&(ox+dir.x*t)**2+(oz+dir.z*t)**2<=q.radius*q.radius)hits.push({t,n:new T.Vector3(0,sign,0)});}
        hits.sort((a,b)=>a.t-b.t);if(!hits.length)continue;distance=hits[0].t;normal=hits[0].n;
      }
      if(distance<closest){closest=distance;chosen=c;chosenNormal=normal;}
      }
    }
    return chosen?{distance:closest,point:origin.clone().addScaledVector(dir,closest),face:{normal:chosenNormal},object:this.materialMeshes.get(chosen.kind),collider:chosen}:null;
  }
  locationAt(pos,zh=false) {
    const c=this.definition.callouts.find(c=>contains(c.rect,pos.x,pos.z));return c?(zh?c.zh:c.name):(zh?'连接通道':'Passage');
  }
  update() {}
  releaseMaterial(material,textures=new Set()) {
    for(const value of Object.values(material))if(value?.isTexture&&!textures.has(value)){textures.add(value);value.dispose();}material.dispose();
  }
  dispose() {
    if(this._disposed)return;this._disposed=true;
    const geometries=new Set(),textures=new Set();
    for(const group of [this.mapGroup,this.environment]){group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);});group.removeFromParent();group.clear();}
    for(const g of geometries)g.dispose();for(const m of this.ownedMaterials)this.releaseMaterial(m,textures);
    this.ownedMaterials.clear();this.borrowedMaterials.clear();this.materials=[];this.materialMeshes.clear();this.solids=[];
    this.collisionBoxes=[];this.collisionGrid.clear();this.floorCells.clear();this.nodes=[];this.grid.clear();this.levels.clear();this.reachable?.clear();this.externalTextures.clear();this._buckets.clear();
    this.radarTriangles=[];this.bombSites=[];this.buyZones=[];this.spawns={ct:[],t:[]};this.pickups=[];
  }
}
