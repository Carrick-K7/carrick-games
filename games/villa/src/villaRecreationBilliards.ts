import * as THREE from 'three';
import {sectionLoft, type P3} from './villaVehicleSections.js';

/** A pocket's external iron saddle continues over the walnut edge and down
 * its face. The curve is cut against the actual filleted rectangle rather
 * than leaving the six fittings as rings lost below the rail surface. */
export function pocketSaddle(px:number,pz:number,rx:number,rz:number,binding=false) {
  const center=Math.atan2(Math.sign(pz),Math.sign(px)), wings=pz===0 ? .82 : .73, sections:P3[][]=[];
  for(let j=0;j<=16;j++) {
    const t=j/16,a=center+(2*t-1)*wings, dx=Math.cos(a),dz=Math.sin(a);
    let reach=Math.min(Math.abs(dx)<1e-8?Infinity:(Math.sign(dx)*rx-px)/dx,Math.abs(dz)<1e-8?Infinity:(Math.sign(dz)*rz-pz)/dz);
    if(Math.abs(px+reach*dx)>rx-.07 && Math.abs(pz+reach*dz)>rz-.07){
      const ox=px-Math.sign(px+reach*dx)*(rx-.07),oz=pz-Math.sign(pz+reach*dz)*(rz-.07),dot=ox*dx+oz*dz;
      reach=-dot+Math.sqrt(Math.max(0,dot*dot-ox*ox-oz*oz+.07**2));
    }
    const ease=Math.sin(Math.PI*t), hem=.026+.080*ease**.75, lip=.123+.010*(1-ease);
    const profile=binding ? [[reach+.002,.919-hem],[reach+.004,.920-hem],[reach+.005,.927-hem],[reach+.002,.927-hem]]:
      [[lip,.914],[lip,.922],[lip+.011,.930],[reach-.008,.926],[reach+.002,.921],[reach+.003,.912],[reach+.002,.920-hem],[reach-.005,.920-hem],[reach-.005,.918],[lip+.012,.918]];
    sections.push(profile.map(([r,h]):P3=>[px+r*dx,h,pz+r*dz]));
  }
  return sectionLoft(sections);
}

/** A finite, local radiance study for polished phenolic resin. Each cube texel
 * sees the cloth, window return or ceiling, never a white spot painted on the
 * ball. Phong samples it in reflected VIEW direction, including on software GL
 * without the costly general-purpose IBL prefilter. The six 32² faces are CPU
 * pixel containers for one GPU cube texture, not six render targets. */
export function billiardResin() {
  const n=32, images:THREE.DataTexture[]=[];
  for(let face=0;face<6;face++){
    const data=new Uint8Array(n*n*4);
    for(let j=0;j<n;j++) for(let i=0;i<n;i++){
      const a=(i+.5)*2/n-1,b=(j+.5)*2/n-1;
      const dir=[[1,-b,-a],[-1,-b,a],[a,1,b],[a,-1,-b],[a,-b,1],[-a,-b,-1]][face], [x,y,z]=dir;
      let r=94,g=99,blue=85;
      if(y<-.053) {r=37;g=75;blue=49;}
      else if(y>.34) {r=124;g=117;blue=96;}
      // A rectangular softbox-like pendant, divided glazing to the north,
      // and its darker mullions. The sharpest signals occupy a modest angle.
      if(y>.4 && Math.abs(x/y+.23)<.22 && Math.abs(z/y-.20)<.48){r=250;g=241;blue=216;}
      if(z<-.55 && y>.0 && y<.46 && Math.abs(x)<.87){const mullion=(x+.95)% .41<.028; r=mullion?71:179;g=mullion?77:193;blue=mullion?69:193;}
      const idx=(j*n+i)*4;data[idx]=r;data[idx+1]=g;data[idx+2]=blue;data[idx+3]=255;
    }
    images.push(new THREE.DataTexture(data,n,n,THREE.RGBAFormat));
  }
  const env=new THREE.CubeTexture(images);env.name='Billiard room / directional resin reflections';env.colorSpace=THREE.SRGBColorSpace;
  env.generateMipmaps=true;env.magFilter=THREE.LinearFilter;env.minFilter=THREE.LinearMipmapLinearFilter;env.needsUpdate=true;
  return new THREE.MeshPhongMaterial({color:0xffffff,specular:'#d9e0ce',shininess:87,envMap:env,combine:THREE.MixOperation,reflectivity:.18});
}

/** Contact transmittance close to the bed, not a dark stencil of the sphere.
 * Uses the live balls' existing instance matrix; potted balls cannot leave an
 * orphan shadow. The real spheres still cast into the normal shadow map. */
export function ballContacts(balls:THREE.InstancedMesh,r:number) {
  const p:number[]=[], rgba:number[]=[], indices:number[]=[], n=12;
  p.push(0,-r+.00047,0);rgba.push(1,1,1,.49);
  for(const [k,[scale,alpha]] of [[.39,.41],[.82,.20],[1.40,0]].entries())for(let i=0;i<n;i++){
    const a=-2*Math.PI*i/n,id=1+k*n+i, next=1+k*n+(i+1)%n;
    p.push(r*scale*Math.cos(a),-r+.00047,r*scale*Math.sin(a));rgba.push(1,1,1,alpha);
    if(k===0) indices.push(0,id,next);else indices.push(id-n,id,next,next,next-n,id-n);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(rgba,4));geometry.setIndex(indices);
  const material=new THREE.MeshBasicMaterial({color:'#18241b',vertexColors:true,transparent:true,depthWrite:false});
  const contact=new THREE.InstancedMesh(geometry,material,balls.count);contact.name='Snooker sphere contact on baize';contact.instanceMatrix=balls.instanceMatrix;contact.frustumCulled=false;return contact;
}

/** Orient shop-cut grain on the finished batch: along the apron on long faces,
 * along the local member on its top and vertically on the turned leg shafts. */
export function veneerCoordinates(g:THREE.BufferGeometry) {
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
    let u=0,v=0;
    if(y<.50 && ny<.82){u=y;v=nx>nz?z:x;}
    else if(ny>nx && ny>nz){const long=Math.abs(x)>.82;u=long?z:x;v=long?x:z;}
    else {u=nx>nz?z:x;v=y;}
    uv.setXY(i,u*.79+.37,v*2.74+.11);
  }
}
