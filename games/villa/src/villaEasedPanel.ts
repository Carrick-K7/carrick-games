import * as THREE from 'three';

type V=[number,number,number];
/** Cabinet plywood and powder-coated brake-formed panels have a planed arris,
 * not 6 miniature spherical patches at every corner. Each of the six faces,
 * twelve eased strips and eight mitred junctions is actual closed stock. */
export function easedInteriorBlank(w:number,h:number,d:number,r:number){
  const size:V=[w/2,h/2,d/2],a:number[]=[],uv:number[]=[];
  const add=(ring:V[],out:V)=>{
    const p=ring[0]!,q=ring[1]!,s=ring[2]!,ab=q.map((v,i)=>v-p[i]!),ac=s.map((v,i)=>v-p[i]!);
    const dot=out[0]*(ab[1]!*ac[2]!-ab[2]!*ac[1]!)+out[1]*(ab[2]!*ac[0]!-ab[0]!*ac[2]!)+out[2]*(ab[0]!*ac[1]!-ab[1]!*ac[0]!);
    if(dot<0)ring.reverse();const ax=Math.abs(out[0])>Math.abs(out[1])&&Math.abs(out[0])>=Math.abs(out[2])?0:Math.abs(out[1])>=Math.abs(out[2])?1:2;
    for(let i=1;i<ring.length-1;i++)for(const v of [ring[0]!,ring[i]!,ring[i+1]!]){a.push(...v);uv.push(v[ax===0?2:0]/(ax===0?d:w)+.5,v[ax===1?2:1]/(ax===1?d:h)+.5);}
  };
  r=Math.min(r,w*.23,h*.23,d*.23);
  const corner=(i:number,s:number,j:number,t:number,k:number,u:number,s0:number,s1:number,s2:number):V=>{const v:V=[0,0,0];v[i]=s*(size[i]!-s0);v[j]=t*(size[j]!-s1);v[k]=u*(size[k]!-s2);return v;};
  for(let i=0;i<3;i++)for(const s of [-1,1]){const j=(i+1)%3,k=(i+2)%3,out:V=[0,0,0];out[i]=s;add([[-1,-1],[1,-1],[1,1],[-1,1]].map(([t,u])=>corner(i,s,j,t!,k,u!,0,r,r)),out);}
  for(let i=0;i<3;i++){const j=(i+1)%3,k=(i+2)%3;for(const s of [-1,1])for(const t of [-1,1]){const out:V=[0,0,0];out[i]=s;out[j]=t;
    add([corner(i,s,j,t,k,-1,0,r,r),corner(i,s,j,t,k,1,0,r,r),corner(i,s,j,t,k,1,r,0,r),corner(i,s,j,t,k,-1,r,0,r)],out);}}
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])add([corner(0,x,1,y,2,z,0,r,r),corner(0,x,1,y,2,z,r,0,r),corner(0,x,1,y,2,z,r,r,0)],[x,y,z]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
