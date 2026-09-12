export const BUY_CATEGORIES=[
  {id:'pistol',name:'手枪',items:['glock','usp','deagle']},
  {id:'smg',name:'冲锋枪',items:['mac10','tmp','mp5','p90']},
  {id:'rifle',name:'步枪',items:['ak47','m4a1','sg552','aug']},
  {id:'sniper',name:'狙击枪',items:['scout','awp','g3sg1']},
  {id:'heavy',name:'重型武器',items:['m3','xm1014','m249']},
  {id:'equipment',name:'投掷物与装备',items:['he','vest','armor','kit']}
];
export const SHOP=[
  {id:'glock',price:200,team:'t'},{id:'usp',price:200,team:'ct'},{id:'deagle',price:700},
  {id:'mac10',price:1050,team:'t'},{id:'tmp',price:1250,team:'ct'},{id:'mp5',price:1500},{id:'p90',price:2350},
  {id:'ak47',price:2700,team:'t'},{id:'m4a1',price:2900,team:'ct'},{id:'sg552',price:3000,team:'t'},{id:'aug',price:3300,team:'ct'},
  {id:'scout',price:1700},{id:'awp',price:4750},{id:'g3sg1',price:5000,team:'t'},
  {id:'m3',price:1050},{id:'xm1014',price:2000},{id:'m249',price:5200},
  {id:'armor',price:1000},{id:'vest',price:650,name:'Kevlar Vest'},{id:'kit',price:400,team:'ct',name:'Defuse Kit'},{id:'he',price:300}
].map(item=>({...item,category:BUY_CATEGORIES.find(c=>c.items.includes(item.id)).id}));
export function awardMoney(actor,amount){actor.money=Math.min(16000,(actor.money||0)+amount);}
export function settleRound(actors,winner,bomb){for(const a of actors){if(a.team===winner){a.losses=0;awardMoney(a,bomb&&['defused','exploded'].includes(bomb.status)?3500:3250);}else{a.losses=Math.min(5,(a.losses||0)+1);awardMoney(a,1400+(a.losses-1)*500+(a.team==='t'&&bomb?.site?800:0));}}}
