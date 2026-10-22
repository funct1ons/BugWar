import { describe,it,expect } from 'vitest';
import { think, estimateCannonLoss } from '../src/core/ai';
import { Simulation,rateVictory } from '../src/core/Simulation';
import { hasRoad,neighboursOf,roadDistances } from '../src/core/roads';
import { BATTLE_RULES } from '../src/core/rules';
import { RACES,type LevelConfig,type ColonyConfig,type Road } from '../src/core/types';
const colony=(id:string,owner:number,units=30,x=0,kind:'nest'|'cannon'='nest'):ColonyConfig=>({id,owner,units,x,y:300,kind,production:0});
// Every fixture names its roads explicitly: there is no implicit free movement in tests.
const level=(colonies:ColonyConfig[],roads:Road[]):LevelConfig=>({id:1,name:'test',subtitle:'',biome:'meadow',par:100,tip:'',factions:[{id:1,race:'agile'},{id:2,race:'agile'},{id:3,race:'strong'}],colonies,roads});
const sim=(colonies:ColonyConfig[],roads:Road[])=>new Simulation(level(colonies,roads),'agile','easy');
describe('pure deterministic simulation',()=>{
 it('produces per second, never produces at cannon, no garrison cap',()=>{
  const s=sim([{...colony('a',1,100000),production:2},{...colony('b',2,0,900,'cannon'),production:999}],[]);s.step(1);
  expect(s.world.colonies[0].units).toBeCloseTo(100002);expect(s.world.colonies[1].units).toBe(0);
 });
 it('has balanced, fast weak, and slow strong races',()=>{expect(RACES.fast.speed).toBeGreaterThan(RACES.agile.speed);expect(RACES.fast.attack).toBeLessThan(1);expect(RACES.strong.speed).toBeLessThan(100);expect(RACES.strong.defense).toBeGreaterThan(1);});
 it('publishes the battle constants the simulation actually uses',()=>{
  expect(BATTLE_RULES).toEqual({nestProduction:1,cannonRange:200,cannonDamage:2,cannonCooldown:0.75,energyRate:2,skillCost:100,skillRadius:135,skillDamage:18});
  const s=sim([colony('a',1,10)],[]);s.world.energy[1]=BATTLE_RULES.skillCost-1;expect(s.castSkill(1,0,300)).toBe(false);s.world.energy[1]=BATTLE_RULES.skillCost;expect(s.castSkill(1,0,300)).toBe(true);
 });
 it('dispatches integer batches with deduplicated sources and friendly reinforcement',()=>{
  const s=sim([colony('a',1,21),colony('b',1,5,10),colony('e',2,1,1000)],[['a','b'],['a','e']]);
  expect(s.dispatch(['a','a','e'],'b')).toBe(10);s.step(.2);expect(s.world.colonies[1].units).toBe(15);
 });
 it('captures neutral and resolves multi-faction weighted combat',()=>{
  const s=sim([colony('a',1,40),colony('n',0,10,10),colony('e',3,20,20)],[['a','n'],['e','n']]);
  s.dispatch(['a'],'n',1);s.step(.2);expect(s.world.colonies[1].owner).toBe(1);expect(s.world.colonies[1].units).toBeCloseTo(30);
  s.dispatch(['e'],'n',1,3);s.step(.2);expect(s.world.colonies[1].owner).toBe(1);expect(s.world.colonies[1].units).toBeCloseTo(3);
 });
 it('cannons shoot enemy fleets without spending their garrison',()=>{
  const s=sim([colony('a',1,10,0,'cannon'),colony('b',2,10,150)],[['b','a']]);s.dispatch(['b'],'a',1,2);s.step(.05);
  expect(s.world.fleets[0].count).toBe(8);expect(s.world.colonies[0].units).toBe(10);expect(s.drainEvents().some(e=>e.type==='shot')).toBe(true);expect(s.drainEvents()).toEqual([]);
 });
 it('skill needs full energy, spares friendly and neutral, does not capture',()=>{
  const s=sim([colony('a',1,30),colony('b',2,10,50),colony('n',0,10,70)],[]);
  expect(s.castSkill(1,50,300)).toBe(false);s.world.energy[1]=100;expect(s.castSkill(1,50,300)).toBe(true);
  expect(s.world.colonies.map(c=>c.units)).toEqual([30,0,10]);expect(s.world.colonies[1].owner).toBe(2);expect(s.world.energy[1]).toBe(0);
 });
 it('counts hostile and friendly in-flight survivors for ending',()=>{
  const s=sim([colony('a',1,30),colony('b',2,1,10),colony('n',0,0,1000)],[['b','n'],['a','b']]);
  s.dispatch(['b'],'n',1,2);s.dispatch(['a'],'b',1);s.step(.2);expect(s.world.status).toBe('playing');
  s.world.energy[1]=100;const f=s.world.fleets[0];s.castSkill(1,f.x,f.y);expect(s.world.status).toBe('won');
  const t=sim([colony('a',1,1),colony('b',2,30,10)],[['b','a']]);t.dispatch(['b'],'a',1,2);t.step(.2);expect(t.world.status).toBe('lost');
 });
 it('fixed stepping is frame-partition invariant and rejects invalid input',()=>{
  const l=[colony('a',1,100),colony('b',2,100,1000)];const a=sim(l,[]),b=sim(l,[]);
  a.step(2);for(let i=0;i<200;i++) b.step(.01);expect(a.world).toEqual(b.world);
  a.step(NaN);a.step(Infinity);a.step(-1);expect(a.dispatch(['a'],'b',NaN)).toBe(0);expect(a.castSkill(1,NaN,0)).toBe(false);
  a.step(1e100);expect(Number.isFinite(a.world.elapsed)).toBe(true);
 });
 it('AI coordinates, accounts for incoming, keeps reserves and does not invent units',()=>{
  const s=sim([colony('p',1,100,1400),colony('a',2,25),colony('b',2,25,20),colony('n',0,22,400)],[['a','n'],['b','n']]);
  think(s.world,2,'hard',(a,b,r,o)=>s.dispatch(a,b,r,o));const fleets=s.world.fleets.filter(f=>f.owner===2);expect(fleets.length).toBe(2);expect(fleets.every(f=>f.to==='n')).toBe(true);
  const sent=fleets.reduce((n,f)=>n+f.count,0);expect(sent).toBeLessThan(40);s.step(3);expect(s.world.fleets.filter(f=>f.owner===2).reduce((n,f)=>n+f.count,0)).toBe(sent);
  expect(s.world.colonies.filter(c=>c.owner===2).reduce((n,c)=>n+c.units,0)+sent).toBe(50);
 });
 it('sanitizes initial extreme units and rates within 1–5',()=>{
  const s=sim([colony('a',1,Infinity),colony('b',2,-10,900)],[]);expect(s.world.colonies.every(c=>Number.isFinite(c.units)&&c.units>=0)).toBe(true);
  expect(rateVictory(50,0,100)).toBe(5);expect(rateVictory(10000,1000,100)).toBe(1);expect(rateVictory(NaN,Infinity,0)).toBeGreaterThanOrEqual(1);
 });
});

const plan=(s:Simulation,owner=2)=>think(s.world,owner,'hard',(a,b,r,o)=>s.dispatch(a,b,r,o));
describe('review regressions',()=>{
 it('counts lost buildings, not dead soldiers, and excludes neutral kills',()=>{
  const s=sim([colony('a',1,40),colony('n',0,10,10),colony('e',2,100,20)],[['a','n'],['e','n']]);
  s.dispatch(['a'],'n',1);s.step(.2);
  expect(s.world.stats.kills).toBe(0);expect(s.world.stats.lost).toBe(0);expect(s.world.stats.casualties).toBeCloseTo(10);
  s.dispatch(['e'],'n',.5,2);s.step(.2);
  expect(s.world.stats.lost).toBe(1);expect(s.world.stats.casualties).toBeCloseTo(40);expect(s.world.stats.kills).toBeCloseTo(30);
 });
 it('counts each building loss again after a recapture',()=>{
  const s=sim([colony('a',1,10),colony('e',2,30,10),colony('r',1,100,20),colony('z',2,100,30)],[['e','a'],['r','a'],['z','a']]);
  s.dispatch(['e'],'a',1,2);s.step(.2);expect(s.world.stats.lost).toBe(1);
  s.dispatch(['r'],'a',1);s.step(.3);expect(s.world.colonies[0].owner).toBe(1);
  s.dispatch(['z'],'a',1,2);s.step(.4);expect(s.world.stats.lost).toBe(2);
 });
 it('does not count a repelled attack or skill casualties as a building loss',()=>{
  const s=sim([colony('a',1,100),colony('e',2,20,10)],[['e','a']]);
  s.dispatch(['e'],'a',.5,2);s.step(.2);expect(s.world.stats.lost).toBe(0);
  s.world.energy[2]=100;s.castSkill(2,0,300);expect(s.world.stats.lost).toBe(0);expect(s.world.stats.casualties).toBe(28);
 });
 it('penalizes each lost building directly when rating',()=>{
  expect(rateVictory(70,0,100)).toBe(5);expect(rateVictory(70,1,100)).toBe(4);
  expect(rateVictory(70,2,100)).toBe(3);expect(rateVictory(70,4,100)).toBe(1);
 });
 it('AI reinforces in time and does not repeatedly duplicate the reinforcement',()=>{
  const s=sim([colony('p',1,40,800),colony('front',2,10,400),colony('rear',2,39,300)],[['p','front'],['rear','front']]);
  s.dispatch(['p'],'front',1);plan(s);
  const help=s.world.fleets.filter(f=>f.owner===2&&f.to==='front');expect(help.length).toBe(1);expect(help[0].count).toBe(34);
  plan(s);expect(s.world.fleets.filter(f=>f.owner===2&&f.to==='front').length).toBe(1);
 });
 it('AI declines a reinforcement that cannot arrive before the attack',()=>{
  const s=sim([colony('p',1,40,410),colony('front',2,10,400),colony('rear',2,80,0)],[['p','front'],['rear','front']]);
  s.dispatch(['p'],'front',1);plan(s);expect(s.world.fleets.some(f=>f.owner===2&&f.to==='front')).toBe(false);
 });
 it('AI includes production during travel, declining an impossible growing target',()=>{
  const s=sim([{...colony('p',1,10,1000),production:10},colony('a',2,50)],[['p','a']]);
  plan(s);expect(s.world.fleets).toHaveLength(0);
 });
 it('AI allocates sufficient troops for production during travel',()=>{
  const s=sim([{...colony('p',1,10,500),production:2},colony('a',2,60)],[['p','a']]);
  plan(s);const sent=s.world.fleets.reduce((n,f)=>n+f.count,0);expect(sent).toBeGreaterThanOrEqual(25);
  const count=s.world.fleets.length;plan(s);expect(s.world.fleets.length).toBe(count);
 });
 it('AI uses multiple sources for an attack no single source can win',()=>{
  const s=sim([colony('p',1,1000,1400),colony('a',2,25),colony('b',2,25,20),colony('n',0,25,400)],[['a','n'],['b','n']]);
  plan(s);const fleets=s.world.fleets.filter(f=>f.to==='n');expect(fleets.length).toBe(2);expect(new Set(fleets.map(f=>f.from)).size).toBe(2);
 });
 it('AI refreshes ownership between decisions and cannot use captured sources',()=>{
  const s=sim([colony('p',1,1000,1400),colony('a',2,25),colony('b',2,25,20),colony('n',0,25,400)],[['a','n'],['b','n']]);
  s.world.colonies[1].owner=1;plan(s);expect(s.world.fleets).toHaveLength(0);
 });
 it('AI values a productive nest over an otherwise equal empty nest',()=>{
  const s=sim([colony('p',1,1000,1400),colony('a',2,25),{...colony('productive',0,10,100),production:2},colony('empty',0,10,100)],[['a','productive'],['a','empty']]);
  plan(s);expect(s.world.fleets[0].to).toBe('productive');
 });
 it('difficulty changes thinking cadence without production bonuses',()=>{
  const l=level([{...colony('p',1,1000,1400),production:1},{...colony('a',2,30),production:1},colony('n',0,5,400)],[['a','n']]);
  const easy=new Simulation(l,'agile','easy'),hard=new Simulation(l,'agile','hard');easy.step(1);hard.step(1);
  expect(easy.world.fleets).toHaveLength(0);expect(hard.world.fleets.length).toBeGreaterThan(0);
  const total=(s:Simulation)=>s.world.colonies.filter(c=>c.owner===2).reduce((n,c)=>n+c.units,0)+s.world.fleets.filter(f=>f.owner===2).reduce((n,f)=>n+f.count,0);
  expect(total(easy)).toBeCloseTo(total(hard));
 });
 it('irregular frame partitions preserve AI, combat, energy, stats and events',()=>{
  const l=level([{...colony('p',1,40,800),production:1},{...colony('a',2,70),production:2},colony('n',0,10,400)],[['p','a'],['a','n']]);
  const a=new Simulation(l),b=new Simulation(l);a.step(12);
  for(let i=0;i<40;i++) {b.step(.017);b.step(.083);b.step(.2);}
  expect(a.world).toEqual(b.world);
 });
});

describe('cannon-aware AI regressions',()=>{
 it('clips the circle chord to the route and accounts for race speed',()=>{
  const s=sim([colony('a',2,100),colony('gun',1,0,500,'cannon')],[]);
  expect(estimateCannonLoss(s.world,{x:0,y:300},{x:1000,y:300},2,100)).toBe(12);
  expect(estimateCannonLoss(s.world,{x:0,y:300},{x:500,y:300},2,100)).toBe(6);
  expect(estimateCannonLoss(s.world,{x:450,y:300},{x:500,y:300},2,100)).toBe(2);
  expect(estimateCannonLoss(s.world,{x:0,y:300},{x:500,y:300},2,72)).toBe(8);
  expect(estimateCannonLoss(s.world,{x:0,y:300},{x:500,y:300},2,145)).toBe(4);
 });
 it('handles off-path, friendly, neutral and overlapping cannons',()=>{
  const s=sim([colony('a',2,100),{...colony('off',1,0,500,'cannon'),y:501},colony('friend',2,0,500,'cannon'),colony('neutral',0,0,500,'cannon')],[]);
  expect(estimateCannonLoss(s.world,{x:0,y:300},{x:1000,y:300},2,100)).toBe(0);
  s.world.colonies.push({...colony('gun1',1,0,500,'cannon'),production:0},{...colony('gun2',3,0,500,'cannon'),production:0});
  expect(estimateCannonLoss(s.world,{x:0,y:300},{x:1000,y:300},2,100)).toBe(24);
 });
 it('does not dispatch repeatedly doomed small batches toward a cannon',()=>{
  const s=sim([colony('gun',1,0,500,'cannon'),colony('a',2,10)],[['a','gun']]);
  for(let i=0;i<20;i++) plan(s);
  expect(s.world.fleets).toHaveLength(0);expect(s.world.colonies[1].units).toBe(10);
  s.world.colonies[1].units=30;plan(s);
  expect(s.world.fleets).toHaveLength(1);expect(s.world.fleets[0].count).toBeGreaterThanOrEqual(9);
  expect(s.world.colonies[1].units).toBeGreaterThanOrEqual(5);
  plan(s);expect(s.world.fleets).toHaveLength(1);
 });
 it('does not mistake doomed existing fleets for a successful projected capture',()=>{
  const s=sim([colony('gun',1,0,500,'cannon'),colony('a',2,31)],[['a','gun']]);
  s.dispatch(['a'],'gun',1/31,2);plan(s);
  expect(s.world.fleets.length).toBe(2);expect(s.world.fleets[0].count).toBe(1);
  expect(s.world.fleets[1].count).toBeGreaterThanOrEqual(9);
  // Actual count stays raw; only projection receives the estimated casualties.
  expect(s.world.fleets[1].initialCount).toBe(s.world.fleets[1].count);
 });
 it('uses only remaining route exposure for fleets already past a cannon',()=>{
  const s=sim([colony('gun',1,100,300,'cannon'),colony('target',0,0,1000),colony('a',2,30)],[['a','target']]);
  s.dispatch(['a'],'target',.5,2);s.world.fleets[0].x=800;
  plan(s);expect(s.world.fleets.filter(f=>f.to==='target').length).toBe(1);
  expect(estimateCannonLoss(s.world,s.world.fleets[0],s.world.colonies[1],2,100)).toBe(0);
 });
 it.each(['easy','normal','hard'] as const)('Strong accumulates then actually breaks through on %s without one-unit cannon loops',difficulty=>{
  const l=level([colony('gun',1,0,500,'cannon'),{...colony('a',2,5),production:1}],[['a','gun']]);
  l.factions[1].race='strong';const s=new Simulation(l,'agile',difficulty);
  let elapsed=0;while(elapsed<60&&s.world.status==='playing') {s.step(.05);elapsed+=.05;}
  expect(s.world.colonies[0].owner).toBe(2);expect(elapsed).toBeLessThan(60);
  const waves=s.world.events.filter(e=>e.type==='dispatch'&&e.owner===2);
  expect(waves.length).toBe(1);expect(waves.every(e=>(e.amount??0)>=11)).toBe(true);
  expect(s.world.colonies[1].units).toBeGreaterThanOrEqual(5);
 });
 it('never uses late friendly inbound to cancel an imminent hostile threat',()=>{
  const s=sim([colony('p',1,40,410),colony('front',2,10,400),colony('rear',2,100,0),colony('neutral',0,0,390)],[['p','front'],['rear','front'],['front','neutral']]);
  s.dispatch(['p'],'front',1);s.dispatch(['rear'],'front',.9,2);plan(s);
  expect(s.world.fleets.some(f=>f.from==='front')).toBe(false);
  expect(s.world.colonies[1].units).toBe(10);
 });
 it('deducts production before distant inbound attacks instead of freezing all current troops',()=>{
  const s=sim([colony('p',1,1000,1000),{...colony('a',2,20),production:5},colony('neutral',0,0,50)],[['p','a'],['a','neutral']]);
  s.dispatch(['p'],'a',.04);plan(s);
  expect(s.world.fleets.some(f=>f.owner===2&&f.to==='neutral')).toBe(true);
  expect(s.world.colonies[1].units).toBeGreaterThanOrEqual(5);
 });
});

describe('fixed road network',()=>{
 it('treats roads as undirected and rejects self-pairs, duplicates and empty networks',()=>{
  expect(hasRoad([['a','b']],'a','b')).toBe(true);
  expect(hasRoad([['a','b']],'b','a')).toBe(true);
  expect(hasRoad([['a','b']],'a','a')).toBe(false);
  expect(hasRoad([['a','a']],'a','a')).toBe(false);
  expect(hasRoad([],'a','b')).toBe(false);
  expect(neighboursOf([['a','b'],['b','a'],['a','a'],['a','c']],'a')).toEqual(['b','c']);
  expect([...roadDistances([['a','b'],['b','c']],['a'])]).toEqual([['a',0],['b',1],['c',2]]);
 });
 it('keeps idle colonies idle on an empty road network',()=>{
  const s=sim([colony('a',1,50),colony('b',2,50,100)],[]);
  expect(s.dispatch(['a'],'b',1)).toBe(0);
  think(s.world,1,'hard',(a,b,r,o)=>s.dispatch(a,b,r,o));
  expect(s.world.colonies[0].units).toBe(50);expect(s.world.colonies[1].units).toBe(50);
  expect(s.world.fleets).toHaveLength(0);expect(s.world.events).toHaveLength(0);expect(s.world.stats.sent).toBe(0);
 });
 it('accepts a dispatch in either direction of the same road',()=>{
  const forward=sim([colony('a',1,20),colony('b',0,5,50)],[['a','b']]);
  expect(forward.dispatch(['a'],'b',1)).toBe(20);
  const backward=sim([colony('a',0,5),colony('b',1,20,50)],[['b','a']]);
  expect(backward.dispatch(['b'],'a',1)).toBe(20);
 });
 it('rejects a self-pair or a non-neighbour without charging or recording anything',()=>{
  const roads:Road[]=[['a','a'],['a','b'],['b','c']];
  const s=sim([colony('a',1,20),colony('b',1,20,50),colony('c',0,0,100)],roads);
  expect(s.dispatch(['a'],'c',1)).toBe(0); // A-B-C is a path, never a relay
  expect(s.dispatch(['a'],'a',1)).toBe(0);
  expect(s.world.colonies[0].units).toBe(20);
  expect(s.world.fleets).toHaveLength(0);expect(s.world.events).toHaveLength(0);expect(s.world.stats.sent).toBe(0);
  expect(s.dispatch(['a'],'b',1)).toBe(20);
 });
 it('checks every selected source independently and sends only legal ones',()=>{
  const roads:Road[]=[['a','t'],['c','t']];
  const s=sim([colony('a',1,20),colony('b',1,20,10),colony('c',1,20,20),colony('t',1,0,30),colony('e',2,20,40)],roads);
  expect(s.dispatch(['a','a','b','c','e'],'t')).toBe(20);
  expect(s.world.fleets.map(f=>f.from).sort()).toEqual(['a','c']);
  expect(s.world.fleets.every(f=>hasRoad(roads,f.from,f.to))).toBe(true);
  expect(s.world.colonies.find(c=>c.id==='b')!.units).toBe(20);
  expect(s.world.colonies.find(c=>c.id==='e')!.units).toBe(20);
  expect(s.world.events.filter(e=>e.type==='dispatch')).toHaveLength(2);
  expect(s.world.stats.sent).toBe(20);
 });
 it('deep-copies roads so level and world can never mutate each other',()=>{
  const original:Road[]=[['a','b']];
  const l=level([colony('a',1,10),colony('b',0,10,100)],original);
  const s=new Simulation(l,'agile','easy');
  expect(s.world.roads).not.toBe(original);
  expect(s.world.roads[0]).not.toBe(original[0]);
  (original[0] as [string,string])[0]='z';
  expect(s.world.roads[0]).toEqual(['a','b']);
  s.world.roads.push(['a','z']);
  expect(l.roads).toHaveLength(1);
  expect(s.dispatch(['a'],'b',1)).toBe(10);
 });
 it('moves inland surplus one friendly hop at a time and never relays in the same pass',()=>{
  const roads:Road[]=[['rear','mid'],['mid','front'],['front','neutral']];
  const s=sim([colony('p',1,10,1400),colony('rear',2,100,0),colony('mid',2,10,200),colony('front',2,10,400),colony('neutral',0,10,600)],roads);
  const calls:{source:string;target:string;sent:number}[]=[];
  const thinkOnce=()=>think(s.world,2,'hard',(sources,target,ratio,owner)=>{
    const sent=s.dispatch(sources,target,ratio,owner);
    if(sent) for(const source of sources) calls.push({source,target,sent});
    return sent;
  });
  thinkOnce();
  expect(calls.map(c=>`${c.source}>${c.target}:${c.sent}`).sort()).toEqual(['mid>front:5','rear>mid:95']);
  expect(calls.every(c=>hasRoad(roads,c.source,c.target))).toBe(true);
  expect(s.world.colonies.find(c=>c.id==='rear')!.units).toBe(5); // hard reserve is preserved
  thinkOnce();
  expect(calls).toHaveLength(2); // the in-flight rear batch is not forwarded again
  s.step(2.05);
  expect(s.world.colonies.find(c=>c.id==='mid')!.units).toBe(100); // 5 kept + 95 arrived - 5 already sent
  expect(s.world.colonies.find(c=>c.id==='front')!.units).toBe(15);
 });
 it('never oscillates: every friendly hop strictly reduces road distance to the front',()=>{
  const roads:Road[]=[['rear','mid'],['mid','front'],['front','neutral']];
  const s=new Simulation(level([
    colony('p',1,10,1400),
    {...colony('rear',2,60,0),production:1},
    {...colony('mid',2,12,200),production:1},
    {...colony('front',2,12,400),production:1},
    colony('neutral',0,100000,600),
  ],roads),'agile','hard');
  const hops=new Map([['front',0],['mid',1],['rear',2]]);
  const friendly=new Set<string>();
  for(let i=0;i<200;i++) {
    s.step(.05);
    for(const f of s.world.fleets) if(f.owner===2&&hops.has(f.to)) friendly.add(`${f.from}>${f.to}`);
  }
  expect([...friendly].sort()).toEqual(['mid>front','rear>mid']);
 });
 it('applies the same road, reserve and supply rules to every enemy faction',()=>{  const roads:Road[]=[['rear','mid'],['mid','front'],['front','neutral']];
  const run=(owner:number)=>{
    const s=sim([colony('p',1,10,1400),colony('rear',owner,100,0),colony('mid',owner,10,200),colony('front',owner,10,400),colony('neutral',0,10,600)],roads);
    const calls:[string,string,number][]=[];
    think(s.world,owner,'hard',(sources,target,ratio,o)=>{
      const before=s.world.fleets.length;const sent=s.dispatch(sources,target,ratio,o);
      for(const f of s.world.fleets.slice(before)) calls.push([f.from,f.to,f.count]);
      return sent;
    });
    return calls;
  };
  const enemy2=run(2),enemy3=run(3);
  expect(enemy3).toEqual(enemy2);
  for(const [from,to] of enemy2) expect(hasRoad(roads,from,to)).toBe(true);
 });
 it('cannot bypass an intervening nest: the AI advances one road at a time',()=>{
  const roads:Road[]=[['a','b'],['b','c']];
  const s=sim([colony('a',1,100,0),colony('b',2,10,200),{...colony('c',2,20,400),production:2}],roads);
  think(s.world,1,'hard',(src,t,r,o)=>s.dispatch(src,t,r,o));
  expect(s.world.fleets).toHaveLength(1);
  expect(s.world.fleets[0].to).toBe('b');
  expect(hasRoad(roads,s.world.fleets[0].from,s.world.fleets[0].to)).toBe(true);
  s.dispatch(['a'],'b',1); // still only the next hop, never straight to c
  s.step(2.1);
  expect(s.world.colonies[1].owner).toBe(1);
  expect(s.world.colonies[1].units).toBeGreaterThan(50);
  think(s.world,1,'hard',(src,t,r,o)=>s.dispatch(src,t,r,o));
  expect(s.world.fleets.some(f=>f.owner===1&&f.to==='c')).toBe(true);
 });
 it('cannot reinforce a threatened colony across an empty intermediate colony',()=>{
  const roads:Road[]=[['p','front'],['front','mid'],['mid','rear']];
  const s=sim([colony('p',1,40,410),colony('front',2,10,400),colony('mid',2,0,300),colony('rear',2,100,100)],roads);
  s.dispatch(['p'],'front',1);plan(s);
  expect(s.world.fleets.some(f=>f.owner===2&&f.to==='front')).toBe(false);
  expect(s.world.colonies.find(c=>c.id==='front')!.units).toBe(10);
  // The surplus may start its own one-hop advance, but that is never presented as defence.
  expect(s.world.fleets.filter(f=>f.owner===2).every(f=>f.to==='mid')).toBe(true);
 });
 it('lets hard mode reuse one source against several targets while real troops remain',()=>{
  const roads:Road[]=[['e','n1'],['e','n2'],['e','n3']];
  const build=()=>sim([colony('p',1,1000,1500),colony('e',2,300,100),colony('n1',0,5,400),colony('n2',0,5,500),colony('n3',0,5,600)],roads);
  const hard=build();think(hard.world,2,'hard',(s,t,r,o)=>hard.dispatch(s,t,r,o));
  expect(new Set(hard.world.fleets.map(f=>f.to))).toEqual(new Set(['n1','n2','n3']));
  expect(hard.world.fleets.every(f=>f.from==='e')).toBe(true);
  expect(hard.world.colonies.find(c=>c.id==='e')!.units).toBe(273);
  for(const difficulty of ['easy','normal'] as const){
   const s=build();think(s.world,2,difficulty,(a,b,r,o)=>s.dispatch(a,b,r,o));
   expect(new Set(s.world.fleets.map(f=>f.to)).size).toBe(1);
  }
 });
});
