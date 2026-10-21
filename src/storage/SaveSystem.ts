import type { Difficulty, RaceId } from '../core/types';
export interface Settings { master:number; music:number; sfx:number; muted:boolean; difficulty:Difficulty; reducedMotion:boolean }
export interface Result { stars:number; time:number; lost:number }
export interface SaveData { version:1; results:Record<RaceId,Record<string,Result>>; settings:Settings; totals:{wins:number; captures:number; sent:number; kills:number; skills:number}; achievements:string[] }
export const SAVE_KEY='bugwar-verdant-v1';
export function freshSave():SaveData{return {version:1,results:{agile:{},fast:{},strong:{}},settings:{master:.72,music:.55,sfx:.65,muted:false,difficulty:'normal',reducedMotion:false},totals:{wins:0,captures:0,sent:0,kills:0,skills:0},achievements:[]};}
const bounded=(v:unknown,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(1,Math.max(0,v)):fallback;
export class SaveSystem {
 data:SaveData; available=true;
 private storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>|undefined;
 constructor(storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>){try{this.storage=storage??globalThis.localStorage;}catch{this.available=false;}if(!this.storage)this.available=false;this.data=this.load();}
 private load():SaveData { const base=freshSave(); try { const text=this.storage?.getItem(SAVE_KEY); if(!text)return base; const raw=JSON.parse(text); if(raw.version!==1)return base;
 for(const race of ['agile','fast','strong'] as RaceId[])for(const [id,v] of Object.entries(raw.results?.[race]??{})){if(!v||typeof v!=='object')continue;const r=v as Result;const n=Number(id);if(Number.isInteger(n)&&n>=1&&n<=13&&Number.isInteger(r.stars)&&r.stars>=1&&r.stars<=5&&Number.isFinite(r.time)&&r.time>=0)base.results[race][String(n)]={stars:r.stars,time:r.time,lost:Number.isFinite(r.lost)?Math.max(0,r.lost):0};}
 const s=raw.settings??{}; for(const key of ['master','music','sfx'] as const)base.settings[key]=bounded(s[key],base.settings[key]); base.settings.muted=s.muted===true; base.settings.reducedMotion=s.reducedMotion===true; if(['easy','normal','hard'].includes(s.difficulty))base.settings.difficulty=s.difficulty;
 for(const key of Object.keys(base.totals) as (keyof SaveData['totals'])[])base.totals[key]=Number.isFinite(raw.totals?.[key])?Math.max(0,raw.totals[key]):0;
 base.achievements=Array.isArray(raw.achievements)?[...new Set<string>(raw.achievements.filter((x:unknown)=>typeof x==='string'&&ACHIEVEMENTS.some(a=>a.id===x)))]:[];
 return base; }catch {this.available=false;return base;} }
 persist(){try{this.storage?.setItem(SAVE_KEY,JSON.stringify(this.data));if(!this.storage)this.available=false;}catch{this.available=false;}}
 unlocked(race:RaceId){let next=1;while(next<13&&this.data.results[race][next])next++;return next;}
 raceUnlocked(race:RaceId){return race==='agile'||Object.keys(this.data.results.agile).length===13;}
 stars(race:RaceId){return Object.values(this.data.results[race]).reduce((s,r)=>s+r.stars,0);}
 record(race:RaceId,id:number,result:Result,stats:{captures:number;sent:number;kills:number;skills:number}){
 const old=this.data.results[race][id];if(!old||result.stars>old.stars||(result.stars===old.stars&&result.time<old.time))this.data.results[race][id]=result;
 this.data.totals.wins++;for(const key of ['captures','sent','kills','skills'] as const)this.data.totals[key]+=stats[key];
 const all=Object.values(this.data.results).flatMap(r=>Object.values(r));const conditions:Record<string,boolean>={first:true,conqueror:this.data.totals.captures>=25,swarm:this.data.totals.sent>=1000,hunter:this.data.totals.kills>=250,storm:this.data.totals.skills>=1,flawless:result.lost===0,speed:result.time<60,stargazer:all.some(r=>r.stars===5),veteran:Object.keys(this.data.results.agile).length>=7,crown:Object.keys(this.data.results.agile).length===13,perfection:this.stars('agile')===65,allraces:Object.values(this.data.results).every(r=>Object.keys(r).length===13)};
 const earned=ACHIEVEMENTS.filter(a=>conditions[a.id]&&!this.data.achievements.includes(a.id)).map(a=>a.id);this.data.achievements.push(...earned);this.persist();return earned;
 }
 reset(){this.data=freshSave();this.persist();}
}
export const ACHIEVEMENTS=[{id:'first',name:'初战告捷',text:'赢得第一场战斗'},{id:'conqueror',name:'开疆拓土',text:'累计占领25座建筑'},{id:'swarm',name:'千军万蚁',text:'累计派出1000只虫兵'},{id:'hunter',name:'战场猎手',text:'累计击败250只虫兵'},{id:'storm',name:'风暴使者',text:'施放一次孢子风暴'},{id:'flawless',name:'固若金汤',text:'不丢失建筑赢得一场胜利'},{id:'speed',name:'疾如晨风',text:'60秒内赢得一场战斗'},{id:'stargazer',name:'五星之光',text:'获得一次五星评价'},{id:'veteran',name:'穿越幽林',text:'敏捷族完成前7关'},{id:'crown',name:'翡翠王冠',text:'敏捷族完成全部13关'},{id:'perfection',name:'璀璨星河',text:'敏捷族获得65颗星'},{id:'allraces',name:'三族传奇',text:'三种族各完成全部13关'}];
