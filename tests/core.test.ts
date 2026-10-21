import { describe,it,expect } from 'vitest';
import { think, estimateCannonLoss } from '../src/core/ai';
import { Simulation,rateVictory } from '../src/core/Simulation';
import { RACES,type LevelConfig,type ColonyConfig } from '../src/core/types';
const colony=(id:string,owner:number,units=30,x=0,kind:'nest'|'cannon'='nest'):ColonyConfig=>({id,owner,units,x,y:300,kind,production:0});
const level=(colonies:ColonyConfig[]):LevelConfig=>({id:1,name:'test',subtitle:'',biome:'meadow',par:100,tip:'',factions:[{id:1,race:'agile'},{id:2,race:'agile'},{id:3,race:'strong'}],colonies});
const sim=(colonies:ColonyConfig[])=>new Simulation(level(colonies),'agile','easy');
describe('pure deterministic simulation',()=>{
 it('produces per second, never produces at cannon, no garrison cap',()=>{
  const s=sim([{...colony('a',1,100000),production:2},{...colony('b',2,0,900,'cannon'),production:999}]);s.step(1);
  expect(s.world.colonies[0].units).toBeCloseTo(100002);expect(s.world.colonies[1].units).toBe(0);
 });
 it('has balanced, fast weak, and slow strong races',()=>{expect(RACES.fast.speed).toBeGreaterThan(RACES.agile.speed);expect(RACES.fast.attack).toBeLessThan(1);expect(RACES.strong.speed).toBeLessThan(100);expect(RACES.strong.defense).toBeGreaterThan(1);});
 it('dispatches integer batches with deduplicated sources and friendly reinforcement',()=>{
  const s=sim([colony('a',1,21),colony('b',1,5,10),colony('e',2,1,1000)]);
  expect(s.dispatch(['a','a','e'],'b')).toBe(10);s.step(.2);expect(s.world.colonies[1].units).toBe(15);
 });
 it('captures neutral and resolves multi-faction weighted combat',()=>{
  const s=sim([colony('a',1,40),colony('n',0,10,10),colony('e',3,20,20)]);
  s.dispatch(['a'],'n',1);s.step(.2);expect(s.world.colonies[1].owner).toBe(1);expect(s.world.colonies[1].units).toBeCloseTo(30);
  s.dispatch(['e'],'n',1,3);s.step(.2);expect(s.world.colonies[1].owner).toBe(1);expect(s.world.colonies[1].units).toBeCloseTo(3);
 });
 it('cannons shoot enemy fleets without spending their garrison',()=>{
  const s=sim([colony('a',1,10,0,'cannon'),colony('b',2,10,150)]);s.dispatch(['b'],'a',1,2);s.step(.05);
  expect(s.world.fleets[0].count).toBe(8);expect(s.world.colonies[0].units).toBe(10);expect(s.drainEvents().some(e=>e.type==='shot')).toBe(true);expect(s.drainEvents()).toEqual([]);
 });
 it('skill needs full energy, spares friendly and neutral, does not capture',()=>{
  const s=sim([colony('a',1,30),colony('b',2,10,50),colony('n',0,10,70)]);
  expect(s.castSkill(1,50,300)).toBe(false);s.world.energy[1]=100;expect(s.castSkill(1,50,300)).toBe(true);
  expect(s.world.colonies.map(c=>c.units)).toEqual([30,0,10]);expect(s.world.colonies[1].owner).toBe(2);expect(s.world.energy[1]).toBe(0);
 });
 it('counts hostile and friendly in-flight survivors for ending',()=>{
  const s=sim([colony('a',1,30),colony('b',2,1,10),colony('n',0,0,1000)]);
  s.dispatch(['b'],'n',1,2);s.dispatch(['a'],'b',1);s.step(.2);expect(s.world.status).toBe('playing');
  s.world.energy[1]=100;const f=s.world.fleets[0];s.castSkill(1,f.x,f.y);expect(s.world.status).toBe('won');
  const t=sim([colony('a',1,1),colony('b',2,30,10)]);t.dispatch(['b'],'a',1,2);t.step(.2);expect(t.world.status).toBe('lost');
 });
 it('fixed stepping is frame-partition invariant and rejects invalid input',()=>{
  const l=[colony('a',1,100),colony('b',2,100,1000)];const a=sim(l),b=sim(l);
  a.step(2);for(let i=0;i<200;i++) b.step(.01);expect(a.world).toEqual(b.world);
  a.step(NaN);a.step(Infinity);a.step(-1);expect(a.dispatch(['a'],'b',NaN)).toBe(0);expect(a.castSkill(1,NaN,0)).toBe(false);
  a.step(1e100);expect(Number.isFinite(a.world.elapsed)).toBe(true);
 });
 it('AI coordinates, accounts for incoming, keeps reserves and does not invent units',()=>{
  const s=sim([colony('p',1,100,1400),colony('a',2,25),colony('b',2,25,20),colony('n',0,22,400)]);
  s.step(3);const fleets=s.world.fleets.filter(f=>f.owner===2);expect(fleets.length).toBe(2);expect(fleets.every(f=>f.to==='n')).toBe(true);
  const sent=fleets.reduce((n,f)=>n+f.count,0);expect(sent).toBeLessThan(40);s.step(3);expect(s.world.fleets.filter(f=>f.owner===2).reduce((n,f)=>n+f.count,0)).toBe(sent);
  expect(s.world.colonies.filter(c=>c.owner===2).reduce((n,c)=>n+c.units,0)+sent).toBe(50);
 });
 it('sanitizes initial extreme units and rates within 1–5',()=>{
  const s=sim([colony('a',1,Infinity),colony('b',2,-10,900)]);expect(s.world.colonies.every(c=>Number.isFinite(c.units)&&c.units>=0)).toBe(true);
  expect(rateVictory(50,0,100)).toBe(5);expect(rateVictory(10000,1000,100)).toBe(1);expect(rateVictory(NaN,Infinity,0)).toBeGreaterThanOrEqual(1);
 });
});

const plan=(s:Simulation,owner=2)=>think(s.world,owner,'normal',(a,b,r,o)=>s.dispatch(a,b,r,o));
describe('review regressions',()=>{
 it('counts lost buildings, not dead soldiers, and excludes neutral kills',()=>{
  const s=sim([colony('a',1,40),colony('n',0,10,10),colony('e',2,100,20)]);
  s.dispatch(['a'],'n',1);s.step(.2);
  expect(s.world.stats.kills).toBe(0);expect(s.world.stats.lost).toBe(0);expect(s.world.stats.casualties).toBeCloseTo(10);
  s.dispatch(['e'],'n',.5,2);s.step(.2);
  expect(s.world.stats.lost).toBe(1);expect(s.world.stats.casualties).toBeCloseTo(40);expect(s.world.stats.kills).toBeCloseTo(30);
 });
 it('counts each building loss again after a recapture',()=>{
  const s=sim([colony('a',1,10),colony('e',2,30,10),colony('r',1,100,20),colony('z',2,100,30)]);
  s.dispatch(['e'],'a',1,2);s.step(.2);expect(s.world.stats.lost).toBe(1);
  s.dispatch(['r'],'a',1);s.step(.3);expect(s.world.colonies[0].owner).toBe(1);
  s.dispatch(['z'],'a',1,2);s.step(.4);expect(s.world.stats.lost).toBe(2);
 });
 it('does not count a repelled attack or skill casualties as a building loss',()=>{
  const s=sim([colony('a',1,100),colony('e',2,20,10)]);
  s.dispatch(['e'],'a',.5,2);s.step(.2);expect(s.world.stats.lost).toBe(0);
  s.world.energy[2]=100;s.castSkill(2,0,300);expect(s.world.stats.lost).toBe(0);expect(s.world.stats.casualties).toBe(28);
 });
 it('penalizes each lost building directly when rating',()=>{
  expect(rateVictory(70,0,100)).toBe(5);expect(rateVictory(70,1,100)).toBe(4);
  expect(rateVictory(70,2,100)).toBe(3);expect(rateVictory(70,4,100)).toBe(1);
 });
 it('AI reinforces in time and does not repeatedly duplicate the reinforcement',()=>{
  const s=sim([colony('p',1,40,800),colony('front',2,10,400),colony('rear',2,80,300)]);
  s.dispatch(['p'],'front',1);plan(s);
  const help=s.world.fleets.filter(f=>f.owner===2&&f.to==='front');expect(help.length).toBe(1);expect(help[0].count).toBe(34);
  plan(s);expect(s.world.fleets.filter(f=>f.owner===2&&f.to==='front').length).toBe(1);
 });
 it('AI declines a reinforcement that cannot arrive before the attack',()=>{
  const s=sim([colony('p',1,40,410),colony('front',2,10,400),colony('rear',2,80,0)]);
  s.dispatch(['p'],'front',1);plan(s);expect(s.world.fleets.some(f=>f.owner===2&&f.to==='front')).toBe(false);
 });
 it('AI includes production during travel, declining an impossible growing target',()=>{
  const s=sim([{...colony('p',1,10,1000),production:10},colony('a',2,50)]);
  plan(s);expect(s.world.fleets).toHaveLength(0);
 });
 it('AI allocates sufficient troops for production during travel',()=>{
  const s=sim([{...colony('p',1,10,500),production:2},colony('a',2,60)]);
  plan(s);const sent=s.world.fleets.reduce((n,f)=>n+f.count,0);expect(sent).toBeGreaterThanOrEqual(25);
  const count=s.world.fleets.length;plan(s);expect(s.world.fleets.length).toBe(count);
 });
 it('AI uses multiple sources for an attack no single source can win',()=>{
  const s=sim([colony('p',1,1000,1400),colony('a',2,25),colony('b',2,25,20),colony('n',0,25,400)]);
  plan(s);const fleets=s.world.fleets.filter(f=>f.to==='n');expect(fleets.length).toBe(2);expect(new Set(fleets.map(f=>f.from)).size).toBe(2);
 });
 it('AI refreshes ownership between decisions and cannot use captured sources',()=>{
  const s=sim([colony('p',1,1000,1400),colony('a',2,25),colony('b',2,25,20),colony('n',0,25,400)]);
  s.world.colonies[1].owner=1;plan(s);expect(s.world.fleets).toHaveLength(0);
 });
 it('AI values a productive nest over an otherwise equal empty nest',()=>{
  const s=sim([colony('p',1,1000,1400),colony('a',2,25),{...colony('productive',0,10,100),production:2},colony('empty',0,10,100)]);
  plan(s);expect(s.world.fleets[0].to).toBe('productive');
 });
 it('difficulty changes thinking cadence without production bonuses',()=>{
  const l=level([{...colony('p',1,1000,1400),production:1},{...colony('a',2,30),production:1},colony('n',0,5,400)]);
  const easy=new Simulation(l,'agile','easy'),hard=new Simulation(l,'agile','hard');easy.step(1);hard.step(1);
  expect(easy.world.fleets).toHaveLength(0);expect(hard.world.fleets.length).toBeGreaterThan(0);
  const total=(s:Simulation)=>s.world.colonies.filter(c=>c.owner===2).reduce((n,c)=>n+c.units,0)+s.world.fleets.filter(f=>f.owner===2).reduce((n,f)=>n+f.count,0);
  expect(total(easy)).toBeCloseTo(total(hard));
 });
 it('irregular frame partitions preserve AI, combat, energy, stats and events',()=>{
  const l=level([{...colony('p',1,40,800),production:1},{...colony('a',2,70),production:2},colony('n',0,10,400)]);
  const a=new Simulation(l),b=new Simulation(l);a.step(12);
  for(let i=0;i<40;i++) {b.step(.017);b.step(.083);b.step(.2);}
  expect(a.world).toEqual(b.world);
 });
});
