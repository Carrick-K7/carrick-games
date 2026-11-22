import * as THREE from 'three';
import type {VillaModelBuilder} from './villaModel.js';
import {bentRail, roundedLoop, sectionLoft, type P3} from './villaVehicleSections.js';

/** Ink is on the PBT face itself. A single opaque chart varies both the coloured
 * cap and its print, so grazing views cannot sort a second coplanar legend mesh
 * into the cap behind it. Wide bars keep their actual printed aspect ratio. */
export function inkKey(c:CanvasRenderingContext2D,slot:number,label:string,width:number) {
  const x=64*(slot%16), y=64*Math.floor(slot/16);
  const alpha=/^[A-Z0-9]$/.test(label), light=alpha || label===' ', esc=label==='Esc', enter=label==='Enter';
  c.fillStyle=esc?'#4e8987':enter?'#bb865b': light?'#c7c5b9':'#686f70';c.fillRect(x,y,64,64);
  c.fillStyle=light?'#394647':'#f3ead5';c.font=`650 ${label.length>2?21:34}px system-ui,sans-serif`;
  c.textBaseline='middle';c.textAlign='left';
  // The slot is stretched with its key. Condense only the ink on 1.5–2.75u keys.
  c.save();c.translate(x+8,y+(label.length===1?34:31));c.scale(Math.min(1,.026/width),1);c.fillText(label,0,0,53*Math.max(1,width/.026));c.restore();
  if(/^[0-9]$/.test(label)){
    c.font='500 15px system-ui,sans-serif';c.fillText(')!@#$%^&*('[Number(label)],x+41,y+17);
  }
  if(label==='F'||label==='J'){c.fillStyle='#8a8f83';c.fillRect(x+24,y+52,22,3);}
}

/** Two original idle screens, an edit of room-tone recordings and a matching
 * reference meter. They are drawn once per room. The television's actual
 * playable race and selectable sources keep their separate update contract. */
export function studioScreen(c:CanvasRenderingContext2D,meters:boolean,w:number,h:number) {
  c.save();c.scale(w/640,h/360);
  c.fillStyle='#26383d';c.fillRect(0,0,640,360);
  c.fillStyle='#1b282e';c.fillRect(0,0,640,40);c.fillRect(0,328,640,32);
  c.font='600 16px system-ui,sans-serif';c.fillStyle='#e3d5b6';c.fillText(meters?'MONITOR  /  INLET SESSION':'FIELD NOTES    /    INLET SESSION',18,26);
  c.fillStyle='#7b9d96';c.fillRect(19,346,78,2);
  if(meters) {
    for(let i=0;i<12;i++){
      const x=43+i*48, amp=Math.floor(6+8*(.5+.5*Math.cos(i*1.36)));
      for(let j=0;j<17;j++){
        c.fillStyle=j>=amp?'#344d51':j>11?'#d9ad70':'#90b6a6';c.fillRect(x,277-j*12,23,7);
      }
      c.fillStyle='#708c8c';c.font='12px monospace';c.fillText(String(i+1).padStart(2,'0'),x+2,304);
    }
  } else {
    for(let j=0;j<5;j++){
      const y=65+j*49;c.fillStyle=j%2?'#33494c':'#31444a';c.fillRect(16,y,608,43);
      c.fillStyle='#aebfb4';c.font='12px system-ui,sans-serif';c.fillText(['01   PIER','02   TIDE','03   REEDS','04   ROOM','05   PRINT'][j],25,y+25);
      const x0=115+(j*35)%112,end=591-(j*33)%78;c.fillStyle=['#628a83','#667c88','#97896f','#628177','#6d8690'][j];c.fillRect(x0,y+5,end-x0,33);
      c.strokeStyle='#d1d4ba';c.lineWidth=1;c.beginPath();
      for(let x=x0+3;x<end-2;x+=3){const t=(x-x0)/(end-x0),envelope=Math.sin(Math.PI*t)**.45;
        const a=(2+11*Math.abs(Math.sin(t*28+j)*Math.cos(t*51+2*j)))*envelope;c.moveTo(x,y+21-a);c.lineTo(x,y+21+a);}
      c.stroke();
    }
    c.fillStyle='#d9b275';c.fillRect(351,52,2,258);c.fillRect(346,49,12,4);
  }
  c.restore();
}

/** Folded under-desk cable basket, clamps, two attached USB boots, and the
 * floor service ring behind the right gable. Nothing dangles into the knees. */
export function studioWiring(b:VillaModelBuilder,frame:THREE.Material,jacket:THREE.Material,steel:THREE.Material) {
  const xmin=7.038,xmax=8.24;
  for(const x of [xmin,xmax]){
    const cross=[[-.085,.751],[-.076,.751],[-.076,.696],[.071,.696],[.071,.729],[.081,.729],[.081,.681],[-.085,.681]];
    b.geometry(sectionLoft([-.012,.012].map(dx=>cross.map(([z,y]):P3=>[x+dx,y,3.539+z]))),steel);
  }
  for(const z of [3.462,3.516,3.574,3.616]) b.beam([xmin,.695,z],[xmax,.695,z],.0047,frame,6);
  b.beam([xmin,.727,3.616],[xmax,.727,3.616],.005,frame,6);
  b.box(7.498,.717,3.536,.236,.034,.081,frame,.007);
  const cord=(points:P3[],r:number,mat:THREE.Material=jacket)=>b.geometry(bentRail(points,r,7),mat);
  for(const [x,d] of [[7.13,-1],[7.78,1]]){
    const port=7.498+d*.125;
    cord([[x,.738,3.503],[x+d*.018,.716,3.531],[x+d*.048,.706,3.546],[port+d*.034,.708,3.544],[port,.717,3.536]],.0036);
    b.box(port,.717,3.536,.031,.014,.023,frame,.002);
  }
  cord([[7.496,.718,3.496],[7.504,.714,3.463],[8.098,.714,3.461],[8.112,.725,3.438],[8.120,.753,3.406],
    [8.123,.803,3.406],[8.123,.811,3.425],[8.121,.819,3.481],[8.114,.861,3.519],[8.09,.972,3.591],[8.09,.981,3.648]],.0048);
  b.box(8.09,.981,3.632,.024,.014,.031,frame,.002);
  cord([[8.167,.903,3.646],[8.167,.900,3.641],[8.188,.833,3.604],[8.221,.811,3.513],[8.271,.811,3.43],
    [8.280,.791,3.402],[8.289,.733,3.406],[8.319,.658,3.517],[8.348,.471,3.540],[8.35,.181,3.528],[8.324,.056,3.534],[8.282,.018,3.538]],.006);
  b.cylinder(8.282,.009,3.538,.037,.041,.017,steel,undefined,12);
  b.cylinder(8.282,.019,3.538,.010,.018,.012,frame,undefined,10);
  // Two display leads run tight to their rear arms, then feed into the basket.
  for(const [x,z] of [[6.25,3.69],[7.05,3.62]]) cord([[x,1.125,z-.014],[x+.078,1.101,3.512],[x+.089,1.090,3.48],
    [x+.029,1.047,3.457],[x,1.006,3.452],[x,.858,3.443],[x+.022,.821,3.422],[x+.035,.804,3.407],[x+.051,.751,3.409],[x+.10,.723,3.452],[7.051,.714,3.462]],.0038);
}

export function deskPad(b:VillaModelBuilder,rubber:THREE.Material,hem:THREE.Material) {
  const ring=(w:number,d:number,y:number)=>roundedLoop(w,d,.050,5).map(([x,z]):P3=>[7.08+x,y+.0011*Math.sin(z*17+x*.8),3.99+z]);
  b.geometry(sectionLoft([ring(1.141,.430,.803),ring(1.141,.430,.8085),ring(1.137,.427,.812)]),rubber);
  b.geometry(sectionLoft([ring(1.129,.414,.8121),ring(1.126,.411,.8128)],false,false,[0,1,0]),hem);
}
