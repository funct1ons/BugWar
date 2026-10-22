import {describe,it,expect} from 'vitest';
import {Simulation} from '../src/core/Simulation';
import {think} from '../src/core/ai';
import {hasRoad} from '../src/core/roads';
import {LEVELS} from '../src/data/levels';
import type {ColonyConfig,Road} from '../src/core/types';

/** Explicit AI fixture; campaign topologies are never used as assumptions here. */
const aiSim=(colonies:ColonyConfig[],roads:Road[])=>new Simulation({id:0,name:'ai fixture',subtitle:'',biome:'meadow',par:60,colonies,roads,tip:'',factions:[1,2,3,4].map(id=>({id,race:'agile' as const}))});

describe('independent fixed-road regression',()=>{
 it('every campaign edge has two distinct real endpoints and no duplicate undirected pair',()=>{
  for(const level of LEVELS){
   expect(Array.isArray(level.roads)).toBe(true);
   const ids=new Set(level.colonies.map(c=>c.id)),seen=new Set<string>();
   for(const [a,b] of level.roads){expect(ids.has(a)&&ids.has(b)).toBe(true);expect(a).not.toBe(b);const key=[a,b].sort().join(':');expect(seen.has(key)).toBe(false);seen.add(key);expect(hasRoad(level.roads,b,a)).toBe(true);}
  }
 });
 it('rejects nonadjacent dispatch with exactly unchanged world resources and statistics',()=>{
  const s=new Simulation(LEVELS[0]);expect(hasRoad(s.world.roads,'a','b')).toBe(true);expect(hasRoad(s.world.roads,'a','d')).toBe(false);
  const units=s.world.colonies.map(c=>c.units),stats={...s.world.stats};
  s.dispatch(['a'],'d',.75);expect(s.world.fleets).toHaveLength(0);expect(s.world.colonies.map(c=>c.units)).toEqual(units);expect(s.world.stats).toEqual(stats);
 });
 it('mixed source dispatch only debits the adjacent source; ownership does not create a road',()=>{
  // Explicit minimal topology fixture, not an assumption about later level design.
  const s=new Simulation({...LEVELS[0],roads:[['a','b']]});const a=s.world.colonies.find(c=>c.id==='a')!,b=s.world.colonies.find(c=>c.id==='b')!,d=s.world.colonies.find(c=>c.id==='d')!;
  b.owner=1;d.owner=1;a.units=100;d.units=100;
  expect(hasRoad(s.world.roads,'d','b')).toBe(false);
  s.dispatch(['a','d'],'b',.5);expect(a.units).toBeLessThan(100);expect(d.units).toBe(100);expect(s.world.fleets.map(f=>[f.from,f.to])).toEqual([['a','b']]);
 });
 it('cannon never produces even when a map supplies a production override',()=>{
  // Isolated rules fixture, not a campaign completion or resource rebalance.
  const level={...LEVELS[0],openingGrace:{normal:1000},colonies:LEVELS[0].colonies.map(c=>c.id==='a'?{...c,kind:'cannon' as const,production:999}:c)};
  const s=new Simulation(level),tower=s.world.colonies.find(c=>c.id==='a')!;
  const units=tower.units;expect(tower.production).toBe(0);s.step(10);expect(tower.units).toBe(units);
 });
 it('missing road list never falls back to complete connectivity',()=>{
  expect(hasRoad([],'a','b')).toBe(false);expect(hasRoad([],'a','a')).toBe(false);
 });
 it('every AI faction 2-4 treats player 1 as an enemy front and keeps the border garrison',()=>{
  // Chain: player1 - A(ai,100) - B(ai,8) - rival AI. A's only foreign neighbour is the
  // player, so seeding the front from owner>1 alone would exile A's surplus to B and leave
  // the player-facing border nearly empty.
  for(const ai of [2,3,4]){
   const rival=[2,3,4].find(id=>id!==ai)!;
   const s=aiSim([
    {id:'p',x:260,y:460,owner:1,kind:'nest',units:500},
    {id:'a',x:620,y:460,owner:ai,kind:'nest',units:100},
    {id:'b',x:980,y:460,owner:ai,kind:'nest',units:8},
    {id:'e',x:1340,y:460,owner:rival,kind:'nest',units:500},
   ],[['p','a'],['a','b'],['b','e']]);
   const a=s.world.colonies.find(c=>c.id==='a')!,b=s.world.colonies.find(c=>c.id==='b')!;
   think(s.world,ai,'normal',(sources,target,ratio,owner)=>s.dispatch(sources,target,ratio,owner));
   expect(s.world.fleets.filter(f=>f.from==='a')).toEqual([]);
   expect(a.units).toBe(100);
   expect(b.units).toBe(8);
  }
 });
 it('neutral-only contact still seeds the supply front when no faction is adjacent',()=>{
  // rear R(ai2,100) - front F(ai2,8) - neutral N: no enemy faction touches F, so the
  // neutral fallback must still forward the rear surplus one road hop.
  const s=aiSim([
   {id:'r',x:260,y:460,owner:2,kind:'nest',units:100},
   {id:'f',x:620,y:460,owner:2,kind:'nest',units:8},
   {id:'n',x:980,y:460,owner:0,kind:'nest',units:500},
  ],[['r','f'],['f','n']]);
  const r=s.world.colonies.find(c=>c.id==='r')!;
  think(s.world,2,'normal',(sources,target,ratio,owner)=>s.dispatch(sources,target,ratio,owner));
  expect(s.world.fleets.map(f=>[f.from,f.to])).toEqual([['r','f']]);
  expect(s.world.fleets[0].count).toBeGreaterThan(0);
  expect(r.units).toBeLessThan(100);
  expect(s.world.fleets.some(f=>f.from==='f')).toBe(false);
 });
});
