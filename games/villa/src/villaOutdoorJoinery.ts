import * as THREE from 'three';
import type { VillaModelBuilder } from './villaModel.js';
import { NatureMesh, type P3 } from './villaNatureGeometry.js';
import { finishTexture, sample01 } from './villaWeatheredFinish.js';

/** Sawn member with four true corner chamfers and shorter chamfers across the
 * end grain. Dimensions are measured normal to the member, even on a rake. */
export function timberMember(b: VillaModelBuilder, start: P3, end: P3, width: number, depth: number, paint: THREE.Material, bevel = .009) {
  const a = new THREE.Vector3(...start), direction = new THREE.Vector3(...end).sub(a);
  const length = direction.length(); direction.normalize();
  const xAxis = new THREE.Vector3().crossVectors(Math.abs(direction.y) > .95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0), direction).normalize();
  const yAxis = new THREE.Vector3().crossVectors(direction, xAxis), m = new NatureMesh(), cut = Math.min(bevel, width * .21, depth * .20, length * .05);
  const outline = (t: number, inset: number) => {
    const w = width / 2 - inset, h = depth / 2 - inset, c = cut * .72;
    return [[-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c]].map(([x, y]): P3 =>
      [a.x + direction.x * t + xAxis.x * x + yAxis.x * y, a.y + direction.y * t + xAxis.y * x + yAxis.y * y, a.z + direction.z * t + xAxis.z * x + yAxis.z * y]);
  };
  m.skin([[start], outline(0, cut * .60), outline(cut, 0), outline(length - cut, 0), outline(length, cut * .60), [end]]);
  const indexed = m.geometry(), flat = indexed.toNonIndexed(); indexed.dispose(); flat.computeVertexNormals();
  const pos = flat.getAttribute('position'), normal = flat.getAttribute('normal'), uv: number[] = [];
  const v = new THREE.Vector3(), n = new THREE.Vector3(), phase = Math.sin(a.x * .57 + a.y * .48 + a.z * 3.07);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos,i).sub(a); n.fromBufferAttribute(normal,i);
    const across = v.dot(xAxis), through = v.dot(yAxis);
    if (Math.abs(n.dot(direction)) > .9) uv.push(-10 + across, through);
    else uv.push(2.0 + phase + v.dot(direction), across + through * .84 + phase * .31);
  }
  flat.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); b.geometry(flat, paint);
}

/** Use the local saw axis on a physically modelled plank, including cross-cut
 * faces. Sub-pixel latewood is filtered out in the distance; there is no image,
 * texture object, extra draw or per-frame upload. */
export function sawnGrain(paint: THREE.MeshStandardMaterial) {
  paint.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 villaTimberUV;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvillaTimberUV = uv;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 villaTimberUV;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 saw = villaTimberUV;
        bool cut = saw.x < -5.0;
        float growth = cut ? length(vec2((saw.x + 10.03)*.93, saw.y - .04))
          : saw.y + .007 * sin(saw.x*2.13 + saw.y*5.8) + .0026*sin(saw.x*5.03 - saw.y*15.);
        float phase = growth*1770. + 4.2*sin(growth*92.);
        float grain = sin(phase) * (1.0-smoothstep(.4,2.4,fwidth(phase)));
        float figure = .56*sin(growth*153.+.4*saw.x) + .44*sin(growth*49.-saw.x*.73);
        float silver = smoothstep(-.42,.96,figure);
        diffuseColor.rgb *= (1.+.079*grain+.085*figure)*(cut?.79:1.)
          * mix(vec3(1.,.97,.94),vec3(.97,1.025,1.09),silver);
      `);
  };
  paint.customProgramCacheKey = () => 'villa-sawn-grain-v2';
}

/** 16 cm of uncoated outdoor duck cloth. Paired, irregular over/under yarns
 * average into a matt, yarn-dyed field with distance; never a normal-map gloss. */
export function canvasWeave() {
  const n=128, data=new Uint8Array(4*n*n);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const wx=x>>2,wy=y>>2, warp=((wx+wy)&1)===0, cross=(warp?x:y)%4;
    const slub=warp?sample01(wx,38):sample01(wy,69), yarn=warp?sample01(wx,y>>5):sample01(x>>5,wy);
    const tone=222+15*slub+8*yarn+4*Math.sin((x-y)*Math.PI/32)+(cross===0?-13:cross===2?7:0);
    const i=4*(y*n+x); data[i]=tone;data[i+1]=tone-(warp?2:0);data[i+2]=tone-4;data[i+3]=255;
  }
  return finishTexture('garden/sage-basket-duck',n,n,data);
}

/** A sewn panel under tension, closed along its real thickness. Both panels and
 * edge welts use the identical sampler so stitches follow the loaded canvas. */
export function fabricPanel(sample: (u: number, v: number) => P3, thickness: P3, nx = 10, ny = 6) {
  const m=new NatureMesh(), uv:number[]=[], cols=[0,.027,...Array.from({length:nx-1},(_,i)=>(i+1)/nx),.973,1];
  const rows=[0,.035,...Array.from({length:ny-1},(_,j)=>(j+1)/ny),.965,1];
  nx=cols.length-1;ny=rows.length-1;
  const stride=nx+1, layer=stride*(ny+1), cloth=rows.map(v=>cols.map(u=>sample(u,v)));
  const length=(a:P3,c:P3)=>Math.hypot(a[0]-c[0],a[1]-c[1],a[2]-c[2]);
  for(const underside of [false,true]) {
    const vDistance=cols.map(()=>0);
    for(let j=0;j<=ny;j++){
      let uDistance=0;
      for(let i=0;i<=nx;i++){
        const p=cloth[j][i]; if(i)uDistance+=length(p,cloth[j][i-1]); if(j)vDistance[i]+=length(p,cloth[j-1][i]);
        const hem=i<2||i>=nx-1||j<2||j>=ny-1;
        m.point(underside?[p[0]+thickness[0],p[1]+thickness[1],p[2]+thickness[2]]:p, (hem?.88:1)*(underside?.89:1));
        uv.push(uDistance/.16,vDistance[i]/.16);
      }
    }
  }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = j * stride + i, q = n + stride;
    // sample runs across +X, then either +Z (seat) or +Y (back).
    m.tri(n, q, n + 1); m.tri(q, q + 1, n + 1);
    m.tri(n + layer, n + 1 + layer, q + layer); m.tri(q + layer, n + 1 + layer, q + 1 + layer);
  }
  const hem = (i: number, j: number) => {
    // Separate normals at the folded return: averaging it with the whole seat
    // cast a dark plastic-looking halo over an otherwise taut, flat panel.
    const ids=[i,j,i+layer,j+layer].map(k=>{
      uv.push(uv[k*2],uv[k*2+1]);return m.point([m.positions[k*3],m.positions[k*3+1],m.positions[k*3+2]],.79);
    });m.tri(ids[0],ids[1],ids[2]);m.tri(ids[1],ids[3],ids[2]);
  };
  for (let i = 0; i < nx; i++) { hem(i, i + 1); hem(ny * stride + i + 1, ny * stride + i); }
  for (let j = 0; j < ny; j++) { hem((j + 1) * stride, j * stride); hem(j * stride + nx, (j + 1) * stride + nx); }
  const g=m.geometry(true); g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2)); return g;
}
