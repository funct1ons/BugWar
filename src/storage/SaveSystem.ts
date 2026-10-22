import type { Difficulty, RaceId } from '../core/types';
export interface Settings { master:number; music:number; sfx:number; muted:boolean; difficulty:Difficulty; reducedMotion:boolean }
export interface Result { stars:number; time:number; lost:number }
export interface SaveData { version:1; results:Record<RaceId,Record<string,Result>>; settings:Settings; totals:{wins:number; captures:number; sent:number; kills:number; skills:number}; achievements:string[] }
export const SAVE_KEY='bugwar-verdant-v1';
/** Campaign length. The original thirteen levels stay 1..13; 14..18 are the added expedition. */
export const CAMPAIGN_LEVEL_COUNT=18;
/** Contiguous levels of the Agile campaign needed before another race becomes playable. */
export const RACE_UNLOCK_LEVELS:Record<RaceId,number>={agile:0,fast:2,strong:4,brood:7};
const LEGACY_LEVEL_COUNT=13;
const RACE_IDS:RaceId[]=['agile','fast','strong','brood'];
const LEGACY_RACES:RaceId[]=['agile','fast','strong'];
const emptyResults=():Record<RaceId,Record<string,Result>>=>({agile:{},fast:{},strong:{},brood:{}});
export function freshSave():SaveData{return {version:1,results:emptyResults(),settings:{master:.72,music:.55,sfx:.65,muted:false,difficulty:'normal',reducedMotion:false},totals:{wins:0,captures:0,sent:0,kills:0,skills:0},achievements:[]};}
const bounded=(v:unknown,fallback:number)=>typeof v==='number'&&Number.isFinite(v)?Math.min(1,Math.max(0,v)):fallback;
export class SaveSystem {
 data:SaveData; available=true;
 private storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>|undefined;
 constructor(storage?:Pick<Storage,'getItem'|'setItem'|'removeItem'>){try{this.storage=storage??globalThis.localStorage;}catch{this.available=false;}if(!this.storage)this.available=false;this.data=this.load();}
 private load():SaveData { const base=freshSave(); try { const text=this.storage?.getItem(SAVE_KEY); if(!text)return base; const raw=JSON.parse(text); if(raw.version!==1)return base;
 // Stored ids stay bounded to the real campaign; every other malformed entry is skipped
 // without discarding its valid siblings (older saves only contain 1..13).
 for(const race of RACE_IDS)for(const [id,v] of Object.entries(raw.results?.[race]??{})){if(!v||typeof v!=='object')continue;const r=v as Result;const n=Number(id);if(Number.isInteger(n)&&n>=1&&n<=CAMPAIGN_LEVEL_COUNT&&Number.isInteger(r.stars)&&r.stars>=1&&r.stars<=5&&Number.isFinite(r.time)&&r.time>=0)base.results[race][String(n)]={stars:r.stars,time:r.time,lost:Number.isFinite(r.lost)?Math.max(0,r.lost):0};}
 const s=raw.settings??{}; for(const key of ['master','music','sfx'] as const)base.settings[key]=bounded(s[key],base.settings[key]); base.settings.muted=s.muted===true; base.settings.reducedMotion=s.reducedMotion===true; if(['easy','normal','hard'].includes(s.difficulty))base.settings.difficulty=s.difficulty;
 for(const key of Object.keys(base.totals) as (keyof SaveData['totals'])[])base.totals[key]=Number.isFinite(raw.totals?.[key])?Math.max(0,raw.totals[key]):0;
 // A previously awarded achievement is never revoked by later result changes; unknown ids
 // are still dropped so a corrupt array cannot invent badges.
 base.achievements=Array.isArray(raw.achievements)?[...new Set<string>(raw.achievements.filter((x:unknown)=>typeof x==='string'&&ACHIEVEMENTS.some(a=>a.id===x)))]:[];
 return base; }catch {this.available=false;return base;} }
 persist(){try{this.storage?.setItem(SAVE_KEY,JSON.stringify(this.data));if(!this.storage)this.available=false;}catch{this.available=false;}}
 /** Number of truly contiguous cleared levels starting at 1, never a raw object count. */
 private cleared(race:RaceId,limit=CAMPAIGN_LEVEL_COUNT){let next=0;while(next<limit&&this.data.results[race][next+1])next++;return next;}
 unlocked(race:RaceId){return Math.min(CAMPAIGN_LEVEL_COUNT,this.cleared(race)+1);}
 raceUnlocked(race:RaceId){return this.cleared('agile',LEGACY_LEVEL_COUNT)>=RACE_UNLOCK_LEVELS[race];}
 stars(race:RaceId){return Object.values(this.data.results[race]).reduce((s,r)=>s+r.stars,0);}
 /** Stars earned strictly in the original thirteen levels; the added 14..18 cannot count. */
 private legacyStars(race:RaceId){let total=0;for(let id=1;id<=LEGACY_LEVEL_COUNT;id++)total+=this.data.results[race][id]?.stars??0;return total;}
 record(race:RaceId,id:number,result:Result,stats:{captures:number;sent:number;kills:number;skills:number}){
 if(!Number.isInteger(id)||id<1||id>CAMPAIGN_LEVEL_COUNT)return [];
 const old=this.data.results[race][id];if(!old||result.stars>old.stars||(result.stars===old.stars&&result.time<old.time))this.data.results[race][id]=result;
 this.data.totals.wins++;for(const key of ['captures','sent','kills','skills'] as const)this.data.totals[key]+=stats[key];
 const all=Object.values(this.data.results).flatMap(r=>Object.values(r));
 // Legacy thresholds and wording are kept for the original trilogy: crown/perfection are
 // first-13 Agile goals, and allraces still asks only the three original races for 13.
 const conditions:Record<string,boolean>={first:true,conqueror:this.data.totals.captures>=25,swarm:this.data.totals.sent>=1000,hunter:this.data.totals.kills>=250,storm:this.data.totals.skills>=1,flawless:result.lost===0,speed:result.time<60,stargazer:all.some(r=>r.stars===5),veteran:this.cleared('agile',7)>=7,crown:this.cleared('agile',LEGACY_LEVEL_COUNT)>=LEGACY_LEVEL_COUNT,perfection:this.legacyStars('agile')>=65,allraces:LEGACY_RACES.every(r=>this.cleared(r,LEGACY_LEVEL_COUNT)>=LEGACY_LEVEL_COUNT)};
 const earned=ACHIEVEMENTS.filter(a=>conditions[a.id]&&!this.data.achievements.includes(a.id)).map(a=>a.id);this.data.achievements.push(...earned);this.persist();return earned;
 }
 reset(){this.data=freshSave();this.persist();}
}
export const ACHIEVEMENTS=[{id:'first',name:'初战告捷',text:'赢得第一场战斗'},{id:'conqueror',name:'开疆拓土',text:'累计占领25座建筑'},{id:'swarm',name:'千军万蚁',text:'累计派出1000只虫兵'},{id:'hunter',name:'战场猎手',text:'累计击败250只虫兵'},{id:'storm',name:'风暴使者',text:'施放一次孢子风暴'},{id:'flawless',name:'固若金汤',text:'不丢失建筑赢得一场胜利'},{id:'speed',name:'疾如晨风',text:'60秒内赢得一场战斗'},{id:'stargazer',name:'五星之光',text:'获得一次五星评价'},{id:'veteran',name:'穿越幽林',text:'敏捷族完成前7关'},{id:'crown',name:'翡翠王冠',text:'敏捷族完成全部13关'},{id:'perfection',name:'璀璨星河',text:'敏捷族获得65颗星'},{id:'allraces',name:'三族传奇',text:'三种族各完成全部13关'}];
