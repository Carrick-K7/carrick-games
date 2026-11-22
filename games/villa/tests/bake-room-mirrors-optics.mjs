/** Optional isolated GL check: actual ship shader against a synthetic radiance
 * chart with known coordinates. Never substitutes for furnished capture data. */
export async function sampleMirrorShader(samples,lookup,fragment) {
  const {chromium}=await import('@playwright/test');
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage({serviceWorkers:'block'});
    return await page.evaluate(({samples,lookup,fragment})=>{
      const c=document.createElement('canvas');c.width=c.height=1;
      const gl=c.getContext('webgl2',{antialias:false,alpha:false});if(!gl)throw Error('No WebGL2');
      const compile=(t,src)=>{const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
      const program=gl.createProgram();
      const vertex=compile(gl.VERTEX_SHADER,`#version 300 es
        void main(){ const vec2 p[3]=vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.)); gl_Position=vec4(p[gl_VertexID],0.,1.);}`);
      const pixel=compile(gl.FRAGMENT_SHADER,`#version 300 es
        precision highp float; uniform vec3 cameraPosition, vViewPosition, normal; uniform mat4 viewMatrix; out vec4 outColor;
        vec3 transformNormalByInverseViewMatrix(vec3 n,mat4 m){return normalize((vec4(n,0.)*m).xyz);}
        ${lookup}\nvoid main(){vec3 outgoingLight=vec3(.3); ${fragment}\noutColor=vec4(outgoingLight,1.);}`);
      gl.attachShader(program,vertex);gl.attachShader(program,pixel);gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
      gl.disable(gl.DITHER); const n=64,pixels=new Uint8Array(4*4*n*n);
      for(let k=0;k<4;k++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
        const color=[.12+.70*(x+.5)/n,.08+.76*(y+.5)/n,.10+.16*k]; const p=4*((k*n+y)*n+x);
        color.forEach((v,i)=>pixels[p+i]=Math.round(255*v/(1+v)));pixels[p+3]=255;
      }
      const tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,tex);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,n,n,4,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      const loc=x=>gl.getUniformLocation(program,x);gl.uniform1i(loc('villaMirrorPlate'),0);
      const results=[];
      for(const s of samples){
        for(const [key,v] of Object.entries(s.uniforms)) gl.uniform3fv(loc(key),v);
        gl.uniformMatrix4fv(loc('viewMatrix'),false,s.matrix);gl.uniform4fv(loc('villaMirrorWeights'),s.weights);
        gl.drawArrays(gl.TRIANGLES,0,3);const b=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,b);results.push([...b]);
      }
      if(gl.getError()!==0||gl.isContextLost())throw Error('GL lookup failed');gl.getExtension('WEBGL_lose_context')?.loseContext();return results;
    },{samples,lookup,fragment});
  } finally {await browser.close();}
}
