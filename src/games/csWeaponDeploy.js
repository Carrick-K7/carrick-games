// View-model handling profiles, in seconds/metres. These are authored motions
// for this browser game; drawing never creates ammo or clears a cycling lock.
export const DEPLOY={
  ak47:{duration:1.05,action:'charge',hand:'right',travel:.075,grip:[.025,0,.006],tilt:-.26},
  m4a1:{duration:1.05,action:'charge',hand:'left',travel:.065,grip:[-.021,0,.006],tilt:-.28},
  awp:{duration:1.20,action:'bolt',hand:'right',travel:.105,tilt:-.20},
  scout:{duration:1.00,action:'bolt',hand:'right',travel:.088,tilt:-.16},
  g3sg1:{duration:1.10,action:'charge',hand:'left',travel:.085,grip:[-.018,0,.005],tilt:-.31},
  sg552:{duration:1.05,action:'charge',hand:'left',travel:.074,grip:[-.018,0,.006],tilt:-.23},
  aug:{duration:1.10,action:'charge',hand:'left',travel:.068,grip:[-.016,0,.006],tilt:-.26},
  mp5:{duration:.95,action:'charge',hand:'left',travel:.068,grip:[-.020,0,.006],tilt:-.28},
  tmp:{duration:.90,action:'charge',hand:'left',travel:.040,grip:[-.014,.003,0],tilt:-.22},
  p90:{duration:1.00,action:'charge',hand:'left',travel:.052,grip:[-.016,0,0],tilt:-.30},
  mac10:{duration:.95,action:'charge',hand:'left',travel:.060,grip:[0,.016,0],tilt:-.30},
  m3:{duration:1.05,action:'pump',hand:'left',travel:.086,tilt:-.19},
  xm1014:{duration:1.05,action:'charge',hand:'right',travel:.065,grip:[.017,0,.006],tilt:-.21},
  m249:{duration:1.30,action:'charge',hand:'right',travel:.093,grip:[.024,0,.006],tilt:-.31},
  deagle:{duration:1.00,action:'slide',hand:'left',travel:.034,tilt:-.31},
  usp:{duration:.95,action:'slide',hand:'left',travel:.031,tilt:-.25},
  glock:{duration:.90,action:'slide',hand:'left',travel:.030,tilt:-.22},
  knife:{duration:.60,action:'raise',tilt:.26},
  he:{duration:.65,action:'raise',tilt:-.16},
  c4:{duration:.75,action:'raise',tilt:-.10},
  armor:{duration:.65,action:'raise',tilt:0}
};
export function deployCues(id){const p=DEPLOY[id];if(!p||p.action==='raise')return[{at:.15,sound:'cloth'}];return[{at:.10,sound:'cloth'},...(p.action==='bolt'?[{at:.36,sound:'bolt-lift'}]:[]),{at:.50,sound:'bolt-open'},{at:.72,sound:'bolt-close'},...(p.action==='bolt'?[{at:.85,sound:'bolt-lock'}]:[]),{at:.95,sound:'cloth'}];}
export function chargingGrip(r,pose){
  const p=DEPLOY[r.id];
  if(p?.action==='slide')return r.slide.position.clone().add({x:-.021,y:.033,z:.028});
  return r.bolt.position.clone().add({x:p?.grip?.[0]||0,y:p?.grip?.[1]||0,z:p?.grip?.[2]||0});
}
