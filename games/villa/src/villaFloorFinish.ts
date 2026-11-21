import * as THREE from 'three';

/** A top skin of individually edged stones/boards, clipped to its *structural* rectangle.
 * The low joint is exposed backing, not a line painted above the walking plane. Identical world
 * origins across all rectangles keep bond and grain aligned on both sides of a core opening. */
export function courseSurface(x: number, top: number, z: number, w: number, d: number, length: number, pitch: number, joint: number, bevel: number) {
  const p: number[] = [], uv: number[] = [];
  const minX=x-w/2, maxX=x+w/2, minZ=z-d/2, maxZ=z+d/2;
  for (let row=Math.floor(minZ/pitch+1e-8); row<Math.ceil(maxZ/pitch-1e-8); row++) {
    const off=((row%3+3)%3)*length/3, loZ=Math.max(minZ,row*pitch+joint/2), hiZ=Math.min(maxZ,(row+1)*pitch-joint/2);
    for (let col=Math.floor((minX-off)/length);col<Math.ceil((maxX-off)/length);col++) {
      const loX=Math.max(minX,col*length+off+joint/2), hiX=Math.min(maxX,(col+1)*length+off-joint/2);
      if (hiX-loX<.002 || hiZ-loZ<.002) continue;
      const b=Math.min(bevel,(hiX-loX)/4,(hiZ-loZ)/4), low=top-b*.72;
      // Continuous seams only at board boundaries; where a slab clips the same board the edge stays flat.
      const a=loX+(loX>minX+1e-6?b:0), c=hiX-(hiX<maxX-1e-6?b:0);
      const e=loZ+(loZ>minZ+1e-6?b:0), f=hiZ-(hiZ<maxZ-1e-6?b:0);
      const corners=[[a,top,e],[a,top,f],[c,top,f],[c,top,e],[loX,low,loZ],[loX,low,hiZ],[hiX,low,hiZ],[hiX,low,loZ]];
      const shift = Math.sin(row * 18.67 + col * 11.18) * 2;
      const tri=(i:number,j:number,k:number)=>{for(const n of [i,j,k]){const [px,py,pz]=corners[n]!;p.push(px!,py!,pz!);uv.push(px!/2.5+shift,pz!/2.5+shift*.41);}};
      tri(0,1,2);tri(0,2,3);
      for(let i=0;i<4;i++) {const j=(i+1)%4;tri(i+4,j+4,j);tri(i+4,j,i);}
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
