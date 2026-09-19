// Authored view-model handling, in seconds/metres. Contact points follow the
// visible action geometry. These are not imported Valve animation tracks.
// Phases: hand contact, rear stop, release, battery, hand home.
import * as T from 'three';
export const DEPLOY={
  ak47:{duration:1.05,action:'charge',hand:'right',travel:.075,grip:[.032,.001,.004],approach:[.075,.025,.018],wrist:'side',phase:[.31,.49,.56,.63,.88],tilt:-.26},
  m4a1:{duration:1.05,action:'charge',hand:'left',travel:.065,grip:[-.014,.006,.005],approach:[-.055,.075,.040],wrist:'rear',phase:[.29,.48,.57,.64,.89],tilt:-.28},
  awp:{duration:1.20,action:'bolt',hand:'right',travel:.105,grip:[.062,-.022,.012],approach:[.060,.020,.025],wrist:'side',phase:[.28,.54,.60,.76,.97],tilt:-.20},
  scout:{duration:1.00,action:'bolt',hand:'right',travel:.088,grip:[.049,-.041,-.020],approach:[.055,.024,.018],wrist:'side',phase:[.26,.51,.57,.73,.96],tilt:-.16},
  g3sg1:{duration:1.10,action:'charge',hand:'left',travel:.085,grip:[-.019,.003,-.003],approach:[-.055,.040,0],wrist:'side',latch:true,phase:[.27,.46,.63,.70,.92],tilt:-.31},
  sg552:{duration:1.05,action:'charge',hand:'right',travel:.074,grip:[.028,.002,0],approach:[.080,.026,0],wrist:'side',phase:[.33,.53,.59,.66,.90],tilt:-.30},
  aug:{duration:1.10,action:'charge',hand:'left',travel:.068,grip:[-.030,.007,.002],approach:[-.065,.037,-.010],wrist:'side',phase:[.29,.48,.57,.65,.89],tilt:-.26},
  mp5:{duration:.95,action:'charge',hand:'left',travel:.068,grip:[-.020,.006,0],approach:[-.062,.030,-.020],wrist:'side',latch:true,phase:[.26,.45,.62,.69,.91],tilt:-.28},
  tmp:{duration:.90,action:'charge',hand:'left',travel:.040,grip:[-.008,.006,.001],approach:[-.045,.050,.030],wrist:'rear',phase:[.30,.48,.56,.63,.86],tilt:-.22},
  p90:{duration:1.00,action:'charge',hand:'left',travel:.052,grip:[-.026,.008,0],approach:[-.060,.020,-.018],wrist:'side',phase:[.28,.46,.55,.62,.86],tilt:-.30},
  mac10:{duration:.95,action:'charge',hand:'left',travel:.056,grip:[-.003,.023,0],approach:[-.065,.085,.015],wrist:'top',phase:[.33,.52,.60,.67,.90],tilt:-.30},
  m3:{duration:1.05,action:'pump',hand:'left',travel:.086,phase:[.29,.50,.57,.74,.92],tilt:-.19},
  xm1014:{duration:1.05,action:'charge',hand:'right',travel:.065,grip:[.013,0,0],approach:[.065,.015,.010],wrist:'side',phase:[.32,.52,.58,.65,.90],tilt:-.21},
  m249:{duration:1.30,action:'charge',hand:'right',travel:.093,grip:[.004,.010,-.001],approach:[.095,.035,.025],wrist:'side',phase:[.32,.52,.63,.70,.94],tilt:-.31},
  deagle:{duration:1.00,action:'slide',hand:'left',travel:.034,grip:[-.006,.048,.062],approach:[-.065,.090,.018],wrist:'top',phase:[.28,.48,.56,.63,.88],tilt:-.31},
  usp:{duration:.95,action:'slide',hand:'left',travel:.033,grip:[-.009,.030,.086],approach:[-.065,.075,.022],wrist:'top',phase:[.27,.46,.54,.61,.86],tilt:-.25},
  glock:{duration:.90,action:'slide',hand:'left',travel:.033,grip:[-.008,.020,.069],approach:[-.060,.073,.023],wrist:'top',phase:[.29,.48,.56,.63,.88],tilt:-.22},
  knife:{duration:.70,action:'raise',tilt:.26},
  he:{duration:.65,action:'raise',tilt:-.16},
  c4:{duration:.75,action:'raise',tilt:-.10},
  armor:{duration:.65,action:'raise',tilt:0}
};
export function actionPhase(id,mode='draw'){
  const d=DEPLOY[id];
  if(mode==='cycle')return id==='scout'?[.20,.45,.55,.73,.98]:id==='m3'?[.22,.46,.60,.83,.99]:[.23,.47,.57,.75,.99];
  if(mode==='reload')return id==='m249'?[.87,.92,.94,.97,1]:d.action==='bolt'?[.76,.85,.87,.94,1]:[.80,.86,.88,.94,.995];
  return d.phase;
}
export function actionCues(id,mode='draw'){
  const d=DEPLOY[id];if(!d||d.action==='raise')return [];
  const [contact,back,release,close]=actionPhase(id,mode);
  return [...(d.action==='bolt'?[{at:contact,sound:'bolt-lift'}]:[]),{at:d.action==='bolt'?contact+(back-contact)*.47:contact,sound:'bolt-open'},{at:release,sound:'bolt-close'},...(d.action==='bolt'?[{at:close,sound:'bolt-lock'}]:[])];
}
export function deployCues(id){return[{at:.10,sound:'cloth'},...actionCues(id),{at:.98,sound:'cloth'}];}
export function chargingGrip(r,pose){
  const d=DEPLOY[r.id],part=d?.action==='slide'?r.slide:r.bolt;
  const target=(part.userData.restPosition||part.position).clone();
  const grip=d?.grip||[0,0,0];target.x+=grip[0];target.y+=grip[1];target.z+=grip[2]+(pose.handTravel||0);
  return target;
}
export function chargingRotation(style='side',lift=0){
  const x=style==='top'||style==='rear'?new T.Vector3(0,-1,0):new T.Vector3(1,0,0);
  const y=style==='top'?new T.Vector3(.98,0,-.20).normalize():style==='rear'?new T.Vector3(.55,0,-.84).normalize():new T.Vector3(0,.22,-.975).normalize();
  const q=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,new T.Vector3().crossVectors(x,y)));
  if(lift)q.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),lift*1.12));
  return q;
}
export function reachChargingAction(target,contact,weight,profile){
  target.lerp(contact,weight);
  if(profile?.approach)target.addScaledVector(new T.Vector3(...profile.approach),Math.sin(Math.PI*weight));
  return target;
}
