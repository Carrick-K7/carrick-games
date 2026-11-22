// Offline only. No downloads or GLTFLoader. Existing meshoptimizer 1.1.1 is used by this one-off tool, not by Villa.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
const args = process.argv.slice(2), dir = args[0];
if (!dir) throw Error('pass the directory of original Poly Haven .gltf and .bin files; add --write to regenerate');
await MeshoptSimplifier.ready;
const specification = [
  ['fern_02','33974295ee19670af4877705fc7d91f33f42d6302f0d44a625e072271223031f','fe1abb762bcbbc7ad9e86925c8080437a62add257d9280e9142fdc85c226e64c',[320,300,190,176]],
  ['shrub_02','99de0a70fe88ad414615cc8d8e020617c8512e2abfe08b911b153a6fcc40d93e','5c1b79da1cfdbac90599542ccd1f75ba433a3a4d356b1ea03655adb39b0e2c96',[570,495,670,530]],
];
function source(name, hash) { const b=readFileSync(join(dir,name)); if(createHash('sha256').update(b).digest('hex')!==hash)throw Error(name); return b; }
function rotate(x,y,z,[qx,qy,qz,qw]) {const a=2*(qy*z-qz*y),b=2*(qz*x-qx*z),c=2*(qx*y-qy*x);return [x+qw*a+qy*c-qz*b,y+qw*b+qz*a-qx*c,z+qw*c+qx*b-qy*a];}
const assets=[];
for(const [id,docHash,binHash,targets] of specification){
  const g=JSON.parse(source(id+'_1k.gltf',docHash)), blob=source(id+'.bin',binHash);
  function field(i){const a=g.accessors[i],v=g.bufferViews[a.bufferView],Type=({5123:Uint16Array,5125:Uint32Array,5126:Float32Array})[a.componentType];
    if(v.byteStride)throw Error('unexpected interleaving');return new Type(blob.buffer,blob.byteOffset+(v.byteOffset||0)+(a.byteOffset||0),a.count*({VEC3:3,VEC2:2,SCALAR:1})[a.type]);}
  for(const node of g.nodes){ const which=node.mesh,p=g.meshes[which].primitives[0],q=node.rotation||[0,0,0,1];
    const P=field(p.attributes.POSITION),N=field(p.attributes.NORMAL),uv=field(p.attributes.TEXCOORD_0),input=Uint32Array.from(field(p.indices));
    // Simplify each original connected leaf, stem section or fern frond separately.
    // A whole-bush simplifier can silently remove narrow blades on long thin shoots.
    const parent=Array.from({length:P.length/3},(_,i)=>i),root=i=>{while(i!==parent[i]){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    for(let i=0;i<input.length;i+=3){parent[root(input[i+1])]=root(input[i]);parent[root(input[i+2])]=root(input[i]);}
    const pieces=new Map(),idx=[];let error=0;
    for(let i=0;i<input.length;i+=3){const r=root(input[i]);if(!pieces.has(r))pieces.set(r,[]);pieces.get(r).push(input[i],input[i+1],input[i+2]);}
    for(const piece of pieces.values()){
      const source=Uint32Array.from(piece), n=piece.length/3;
      const goal=id==='fern_02'?Math.max(12,Math.round(n*targets[which]/(input.length/3))):n>90?Math.max(12,Math.round(n*.088)):Math.max(5,Math.round(n*.15));
      const [out,err]=MeshoptSimplifier.simplifyWithAttributes(source,P,3,uv,2,[.035,.035],null,goal*3,.075,['Sparse']);
      idx.push(...(out.length>=6?out:source));error=Math.max(error,err);
    }
    const remap=new Map(),verts=[];for(const i of idx)if(!remap.has(i)){remap.set(i,verts.length);verts.push(i);}
    // Packed 0.125mm xyz, signed normalized material-space normals, 16-bit glTF UVs, uint16 indices.
    const b=Buffer.alloc(13*verts.length+2*idx.length);let o=0;
    for(const i of verts){for(const v of rotate(...P.subarray(3*i,3*i+3),q)){b.writeInt16LE(Math.round(v*8000),o);o+=2;}
      for(const v of rotate(...N.subarray(3*i,3*i+3),q))b.writeInt8(Math.max(-127,Math.min(127,Math.round(v*127))),o++);
      for(const v of uv.subarray(2*i,2*i+2)){b.writeUInt16LE(Math.round(Math.max(0,Math.min(1,v))*65535),o);o+=2;}}
    for(const i of idx){b.writeUInt16LE(remap.get(i),o);o+=2;}
    console.log(node.name,input.length/3,'→',idx.length/3,'triangles;',verts.length,'vertices;',new Set(Array.from(input,root)).size,'connected parts; error',error.toFixed(5));
    assets.push(`  { name: '${node.name}', count: ${verts.length}, bytes: '${b.toString('base64')}' },`);
  }
}
const out=new URL('../src/villaShelterPlantingMeshes.ts',import.meta.url), text=['// Generated offline from CC0 Poly Haven plant meshes; see ../assets-sources/SHELTER-PLANTING.md.','export const SHELTER_MESHES = [',...assets,'] as const;',''].join('\n');
if(args.includes('--write'))writeFileSync(out,text);else if(readFileSync(out,'utf8')!==text)throw Error('generated meshes differ');
