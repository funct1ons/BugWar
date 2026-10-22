import { describe, it, expect } from 'vitest';
import { think } from '../src/core/ai';
import { Simulation } from '../src/core/Simulation';
import { LEVELS } from '../src/data/levels';
import { ACHIEVEMENTS, freshSave, SAVE_KEY, SaveSystem } from '../src/storage/SaveSystem';
import type { Difficulty, RaceId } from '../src/core/types';

const difficulties:Difficulty[]=['easy','normal','hard'];
const strategies = [
  {name:'agile-guard',race:'agile' as RaceId,period:.75,skill:true},
  {name:'agile-planner',race:'agile' as RaceId,period:.75,skill:false},
  {name:'agile-pulse',race:'agile' as RaceId,period:.75,skill:true},
  {name:'strong-pulse',race:'strong' as RaceId,period:.75,skill:true},
  {name:'fast-pulse',race:'fast' as RaceId,period:.75,skill:true},
  {name:'brood-pulse',race:'brood' as RaceId,period:.75,skill:true},
];
// No changes to enemy logic/resources. Owner 1 uses the exported visible-state planner.
function run(level:typeof LEVELS[number],difficulty:Difficulty,strategy:typeof strategies[number],openingDelay=0) {
  const sim=new Simulation(level,strategy.race,difficulty);
  const dispatches:Record<number,number>={};
  const last:Record<number,number>={};
  const maxIdle:Record<number,number>={};
  let quiet=0,maxQuiet=0;
  // Bounded robot experiment: 900 s instead of the former 600 s. The approved garrison firepower
  // table makes towers hit harder, which lengthened one symmetric production standoff
  // (level 10 easy agile-pulse wins at 618.5 s, previously 518 s). This is a longer time budget
  // for the same win/loss/dispatch assertions; "still playing" at the cap is never counted as a win.
  for(let tick=0;tick<1200 && sim.world.status==='playing';tick++) {
    if(sim.world.elapsed>=openingDelay)think(sim.world,1,'hard',(s,t,r,o)=>{
      if(strategy.name!=='agile-guard')return sim.dispatch(s,t,r,o);
      let sent=0;
      for(const id of s){const c=sim.world.colonies.find(c=>c.id===id);if(c&&c.units>20)sent+=sim.dispatch([id],t,Math.min(r,(c.units-20)/c.units),o);}
      return sent;
    });
    if(strategy.skill && sim.world.energy[1]>=100) {
      const targets=[...sim.world.colonies.filter(c=>c.owner>1),...sim.world.fleets.filter(f=>f.owner>1)];
      const score=(p:{x:number;y:number})=>targets.reduce((n,t)=>n+(Math.hypot(t.x-p.x,t.y-p.y)<=135?Math.min('units' in t?t.units:t.count,18):0),0);
      targets.sort((a,b)=>score(b)-score(a));
      if(targets[0])sim.castSkill(1,targets[0].x,targets[0].y);
    }
    sim.step(strategy.period);
    const events=sim.drainEvents();
    if(events.some(e=>e.type==='capture'||e.type==='impact'))quiet=0;else quiet+=strategy.period;
    maxQuiet=Math.max(maxQuiet,quiet);
    for(const e of events)if(e.type==='dispatch') {dispatches[e.owner]=(dispatches[e.owner]??0)+1;last[e.owner]=sim.world.elapsed;}
    for(const f of sim.world.factions)if(sim.world.colonies.some(c=>c.owner===f.id))maxIdle[f.id]=Math.max(maxIdle[f.id]??0,sim.world.elapsed-(last[f.id]??0));
    expect(sim.world.colonies.every(c=>Number.isFinite(c.units)&&c.units>=0)).toBe(true);
    expect(sim.world.fleets.every(f=>Number.isFinite(f.count)&&f.count>0)).toBe(true);
  }
  return {level:level.id,difficulty,strategy:strategy.name,status:sim.world.status,time:+sim.world.elapsed.toFixed(2),lost:sim.world.stats.lost,dispatches,maxIdle:Object.fromEntries(Object.entries(maxIdle).map(([k,v])=>[k,Math.round(v)])),maxQuiet:Math.round(maxQuiet),survivors:sim.world.factions.filter(f=>sim.world.colonies.some(c=>c.owner===f.id)||sim.world.fleets.some(c=>c.owner===f.id)).map(f=>f.id)};
}

describe('campaign geometry and ownership',()=>{
  it('has eighteen distinct layouts, four biomes, four races and legal factions',()=>{
    expect(LEVELS.map(l=>l.id)).toEqual(Array.from({length:18},(_,i)=>i+1));
    expect(new Set(LEVELS.map(l=>l.biome)).size).toBe(4);
    expect(new Set(LEVELS.map(l=>JSON.stringify(l.colonies.map(c=>[c.x,c.y])))).size).toBe(18);
    for(const l of LEVELS){
      expect(new Set(l.colonies.map(c=>c.id)).size).toBe(l.colonies.length);
      const ids=l.factions.map(f=>f.id);
      expect(new Set(ids).size).toBe(ids.length);expect(ids).toContain(1);
      expect(ids.every(id=>Number.isInteger(id)&&id>=1&&id<=4)).toBe(true);
      expect(l.factions.every(f=>['agile','fast','strong','brood'].includes(f.race))).toBe(true);
      expect(l.colonies.every(c=>['nest','cannon','hatchery','wind'].includes(c.kind))).toBe(true);
      if(l.objective){const target=l.colonies.find(c=>c.id===l.objective!.target);expect(target?.owner).toBeGreaterThan(1);}
      for(const c of l.colonies){
        expect(c.owner===0||ids.includes(c.owner)).toBe(true);
        expect(c.units>=0&&Number.isFinite(c.units)).toBe(true);
        // Conservative 80px half-footprint: art plus label stays outside HUD y<=130/y>=790.
        expect(c.x).toBeGreaterThanOrEqual(120);expect(c.x).toBeLessThanOrEqual(1480);
        expect(c.y-80).toBeGreaterThanOrEqual(130);expect(c.y+80).toBeLessThanOrEqual(790);
        for(const other of l.colonies)if(other!==c)expect(Math.hypot(c.x-other.x,c.y-other.y)).toBeGreaterThanOrEqual(160);
      }
    }
  });
});

describe('bounded campaign robot experiments',()=>{
  for(const level of LEVELS)for(const difficulty of difficulties)it(`level ${level.id} ${difficulty}: six strategies <=900s`,()=>{
    const results=strategies.map(strategy=>run(level,difficulty,strategy));
    for(const result of results){expect(result.time).toBeLessThanOrEqual(900.01);expect(result.dispatches[1]??0).toBeGreaterThan(0);}
    console.log('CAMPAIGN_RESULT '+JSON.stringify(results));
    if(difficulty==='normal'||difficulty==='easy'){
      expect(results.some(r=>(r.strategy==='agile-planner'||r.strategy==='agile-pulse')&&r.status==='won'),`Agile must win level ${level.id} ${difficulty}`).toBe(true);
      // Every playable race needs a natural robot win on the forgiving difficulties; hard mode
      // intentionally keeps losing runs so the matrix still exercises failure states.
      for(const race of ['agile','fast','strong','brood'])expect(results.some(r=>r.strategy.startsWith(race)&&r.status==='won'),`${race} must win level ${level.id} ${difficulty}`).toBe(true);
    }
  },120000);
});

// Opt-in reproducible balance search, never mutates the exported campaign.
const scanning=(globalThis as {process?:{env?:Record<string,string|undefined>}}).process?.env?.CAMPAIGN_SCAN==='1';
it.skipIf(!scanning)('scans conservative Agile opening garrisons',()=>{
  for(const original of LEVELS){
    let found=false;
    for(let extra=0;extra<=100;extra+=5){
      const level={...original,colonies:original.colonies.map(c=>({...c}))};
      const baseline=LEVELS.map(l=>l.colonies.find(c=>c.id==='a')!.units);
      level.colonies.find(c=>c.id==='a')!.units=baseline[level.id-1];
      if(level.id===1)level.colonies.find(c=>c.id==='d')!.units=16;
      if(level.id===6)level.colonies.find(c=>c.id==='b')!.owner=1;
      if(level.id===10)level.colonies.find(c=>c.id==='c')!.owner=1;
      level.colonies.find(c=>c.id==='a')!.units+=extra;
      const results=(['easy','normal'] as Difficulty[]).flatMap(d=>strategies.filter(s=>s.name==='agile-planner'||s.name==='agile-pulse').map(s=>run(level,d,s)));
      const success=(['easy','normal'] as Difficulty[]).every(d=>results.some(r=>r.difficulty===d&&r.status==='won'));
      console.log('SCAN_RESULT '+JSON.stringify({level:level.id,extra,success,results}));
      if(success){found=true;break;}
    }
    expect(found,`No <=100 opening increment found for level ${original.id}`).toBe(true);
  }
},120000);

it('tutorial tolerates six seconds without player orders on normal',()=>{
  const result=run(LEVELS[0],'normal',strategies.find(s=>s.name==='agile-planner')!,6);
  console.log('TUTORIAL_DELAY '+JSON.stringify(result));
  expect(result.status).toBe('won');
});

function memory(text:string|null=null){return {getItem:(_key:string)=>text,setItem:(_key:string,value:string)=>{text=value;},removeItem:(_key:string)=>{text=null;}};}
const stats={captures:25,sent:1000,kills:250,skills:1};
describe('campaign persistence',()=>{
  it('recovers broken JSON, wrong versions and malformed results',()=>{
    for(const text of ['{','null',JSON.stringify({version:2})])expect(new SaveSystem(memory(text)).data).toEqual(freshSave());
    const raw=freshSave();raw.results.agile={'1':{stars:6,time:1,lost:0},'19':{stars:5,time:1,lost:0},'2':{stars:4,time:-1,lost:0},'18':{stars:5,time:120,lost:1}};
    expect(new SaveSystem(memory(JSON.stringify(raw))).data.results.agile).toEqual({'18':{stars:5,time:120,lost:1}});
    raw.results.brood={'0':{stars:5,time:1,lost:0},'17':{stars:0,time:1,lost:0},'18':{stars:4,time:99,lost:2}};
    expect(new SaveSystem(memory(JSON.stringify(raw))).data.results.brood).toEqual({'18':{stars:4,time:99,lost:2}});
    const denied={getItem:()=>{throw Error('denied');},setItem:()=>{throw Error('quota');},removeItem:()=>{}};
    const save=new SaveSystem(denied);expect(save.available).toBe(false);expect(()=>save.persist()).not.toThrow();
  });
  it('round trips volume/mute/difficulty, clamps corrupt volume and resets',()=>{
    const storage=memory();const save=new SaveSystem(storage);
    Object.assign(save.data.settings,{master:.2,music:.3,sfx:.4,muted:true,difficulty:'hard',reducedMotion:true});save.persist();
    expect(new SaveSystem(storage).data.settings).toEqual(save.data.settings);
    storage.setItem(SAVE_KEY,JSON.stringify({version:1,settings:{master:3,music:-2,sfx:'bad'}}));
    expect(new SaveSystem(storage).data.settings).toMatchObject({master:1,music:0,sfx:.65});
    save.reset();expect(new SaveSystem(storage).data).toEqual(freshSave());
  });
  it('keeps best stars, then best time, independently for each race',()=>{
    const storage=memory();const save=new SaveSystem(storage);
    for(const result of [{stars:4,time:80,lost:0},{stars:3,time:20,lost:0},{stars:4,time:90,lost:1},{stars:4,time:70,lost:2}])save.record('agile',1,result,stats);
    expect(new SaveSystem(storage).data.results.agile['1']).toEqual({stars:4,time:70,lost:2});
    save.record('agile',1,{stars:5,time:100,lost:0},stats);
    expect(save.stars('agile')).toBe(5);expect(save.stars('fast')).toBe(0);
    save.record('brood',18,{stars:5,time:100,lost:0},stats);
    expect(new SaveSystem(storage).data.results.brood['18']).toEqual({stars:5,time:100,lost:0});
  });
  it('unlocks 18 stages and all four races from contiguous Agile clears',()=>{
    const storage=memory();let save=new SaveSystem(storage);
    expect(save.unlocked('agile')).toBe(1);
    expect([save.raceUnlocked('agile'),save.raceUnlocked('fast'),save.raceUnlocked('strong'),save.raceUnlocked('brood')]).toEqual([true,false,false,false]);
    for(let id=1;id<=18;id++){
      save.record('agile',id,{stars:5,time:50,lost:0},stats);
      save=new SaveSystem(storage);expect(save.unlocked('agile')).toBe(Math.min(18,id+1));
      expect(save.raceUnlocked('fast')).toBe(id>=2);expect(save.raceUnlocked('strong')).toBe(id>=4);expect(save.raceUnlocked('brood')).toBe(id>=7);
    }
    expect(save.stars('agile')).toBe(90);
    expect(save.data.results.agile['18']).toEqual({stars:5,time:50,lost:0});
  });
  it('requires a contiguous first N rather than a raw result count',()=>{
    const raw=freshSave();
    for(const id of [1,3,4,5,6,7])raw.results.agile[id]={stars:5,time:50,lost:0};
    const save=new SaveSystem(memory(JSON.stringify(raw)));
    expect(Object.keys(save.data.results.agile)).toHaveLength(6);
    expect(save.unlocked('agile')).toBe(2);
    expect(save.raceUnlocked('fast')).toBe(false);
    expect(save.raceUnlocked('strong')).toBe(false);
    expect(save.raceUnlocked('brood')).toBe(false);
  });
  it('keeps the original thirteen-level achievements and allraces without brood',()=>{
    const storage=memory();const save=new SaveSystem(storage);
    for(const race of ['agile','fast','strong'] as RaceId[])for(let id=1;id<=13;id++)save.record(race,id,{stars:5,time:50,lost:0},stats);
    expect(save.unlocked('agile')).toBe(14);
    expect(save.stars('agile')).toBe(65);
    expect(Object.keys(save.data.results.brood)).toHaveLength(0);
    expect(new Set(save.data.achievements)).toEqual(new Set(ACHIEVEMENTS.map(a=>a.id)));
    expect(save.record('agile',1,{stars:1,time:200,lost:2},stats)).toEqual([]);
    const reloaded=new SaveSystem(storage);
    expect(new Set(reloaded.data.achievements)).toEqual(new Set(ACHIEVEMENTS.map(a=>a.id)));
    expect(reloaded.data.achievements).toHaveLength(new Set(reloaded.data.achievements).size);
    expect(reloaded.data.totals.wins).toBe(40);
  });
  it('never revokes an awarded legacy achievement when old results are missing',()=>{
    const raw=freshSave();raw.achievements=['crown','perfection','allraces','veteran','first','not-a-badge'];raw.results.agile={'1':{stars:2,time:90,lost:0}};
    const save=new SaveSystem(memory(JSON.stringify(raw)));
    expect(new Set(save.data.achievements)).toEqual(new Set(['crown','perfection','allraces','veteran','first']));
    save.record('agile',2,{stars:1,time:90,lost:0},stats);
    expect(save.data.achievements).toEqual(expect.arrayContaining(['crown','perfection','allraces','veteran','first']));
  });
  it('does not let the added levels stand in for original perfection',()=>{
    const storage=memory();const save=new SaveSystem(storage);
    for(let id=1;id<=12;id++)save.record('agile',id,{stars:5,time:50,lost:0},stats);
    for(let id=14;id<=18;id++)save.record('agile',id,{stars:5,time:50,lost:0},stats);
    // 85 total stars, but only 60 of them belong to the original thirteen levels.
    expect(save.stars('agile')).toBe(85);
    expect(save.data.achievements).not.toContain('perfection');
    expect(save.data.achievements).not.toContain('crown');
    save.record('agile',13,{stars:4,time:50,lost:0},stats);
    expect(save.stars('agile')).toBe(89);
    expect(save.data.achievements).toContain('crown');
    expect(save.data.achievements).not.toContain('perfection');
    save.record('agile',13,{stars:5,time:50,lost:0},stats);
    expect(save.stars('agile')).toBe(90);
    expect(save.data.achievements).toContain('perfection');
  });
});
