import { describe,it,expect } from 'vitest';
import { Simulation } from '../src/core/Simulation';
import { RACES,type ColonyConfig,type LevelConfig,type Fleet,type RaceId } from '../src/core/types';
const c=(id:string,owner:number,units:number,x:number,kind:ColonyConfig['kind']='nest'):ColonyConfig=>({id,owner,units,x,y:0,kind,production:0});
const make=(colonies:ColonyConfig[],roads:LevelConfig['roads'],race:RaceId='agile',objective?:LevelConfig['objective'])=>new Simulation({id:1,name:'test',subtitle:'',biome:'meadow',par:100,tip:'',factions:[{id:1,race},{id:2,race:'strong'}],colonies,roads,objective,openingGrace:{easy:999,normal:999,hard:999}},race,'easy');
const fleet=(id:number,owner:number,count:number,x:number,race:RaceId='agile'):Fleet=>({id,owner,count,initialCount:count,x,y:0,race,from:owner===1?'a':'b',to:owner===1?'b':'a'});
describe('lightweight core rules',()=>{
 it('caps growth, preserves over-cap supply and resumes growth after dispatch',()=>{
  const s=make([{...c('a',1,99.99,0),production:2},c('b',1,30,10),c('e',2,1,1000)],[['a','b']]);
  s.step(.05);expect(s.world.colonies[0].units).toBe(100);
  s.dispatch(['b'],'a',1);s.step(.2);expect(s.world.colonies[0].units).toBe(130);
  s.step(.1);expect(s.world.colonies[0].units).toBe(130);
  s.dispatch(['a'],'b',.5);s.step(.05);expect(s.world.colonies[0].units).toBeCloseTo(65.1);
 });
 it('automatically relays without consuming the intermediate garrison',()=>{
  const s=make([c('a',1,20,0),c('b',1,7,5),c('t',0,1,10),c('e',2,1,1000)],[['a','b'],['b','t']]);
  s.dispatch(['a'],'t',1);s.step(.05);expect(s.world.colonies[1].units).toBe(7);expect(s.world.fleets[0].to).toBe('t');
  s.step(.05);expect(s.world.colonies[2].owner).toBe(1);
 });
 it('interrupts an itinerary when an intermediate stop is lost',()=>{
  const s=make([c('a',1,20,0),c('b',1,7,5),c('d',1,100,10),c('t',0,1,15),c('e',2,1,1000)],[['a','b'],['b','d'],['d','t']]);
  s.dispatch(['a'],'t',1);s.world.colonies[2].owner=2;s.step(.05);
  expect(s.world.fleets).toHaveLength(0);expect(s.world.colonies[1].units).toBe(27);expect(s.world.colonies[2].units).toBe(100);
 });
 it('grants wind haste only on the segment leaving the wind stop',()=>{
  const s=make([c('a',1,20,0),c('w',1,1,5,'wind'),c('b',1,1,10),c('t',0,1,100),c('e',2,1,1000)],[['a','w'],['w','b'],['b','t']]);
  s.dispatch(['a'],'t',1);expect(s.world.fleets[0].haste).toBeUndefined();s.step(.05);
  expect(s.world.fleets[0].haste).toBe(1.35);s.step(.05);expect(s.world.fleets[0].to).toBe('t');expect(s.world.fleets[0].haste).toBeUndefined();
 });
 it.each(['nest','hatchery','wind'] as const)('Brood neutral %s capture rewards only production buildings once',kind=>{
  const s=make([c('a',1,20,0),c('n',0,0,1,kind),c('e',2,1,1000)],[['a','n']],'brood');
  s.dispatch(['a'],'n',1);s.step(.05);expect(s.world.colonies[1].units).toBe(kind==='wind'?20:28);
  s.world.colonies[1].owner=2;s.world.colonies[1].units=0;s.world.colonies[0].units=20;
  s.dispatch(['a'],'n',1);s.step(.05);expect(s.world.colonies[1].units).toBe(20);
 });
 it('ends immediately on capture goal before a later arrival can undo it',()=>{
  const s=make([c('a',1,20,0),c('t',0,0,1),c('e',2,100,2)],[['a','t'],['e','t']],'agile',{type:'capture',target:'t'});
  s.dispatch(['a'],'t',1);s.dispatch(['e'],'t',1,2);s.step(.05);
  expect(s.world.status).toBe('won');expect(s.world.colonies[1].owner).toBe(1);expect(s.world.events.filter(e=>e.type==='end')).toHaveLength(1);
 });
 it('resolves high-speed swept collisions symmetrically with both attack and defense',()=>{
  const run=(reverse:boolean)=>{
   const s=make([c('a',1,1,0),c('b',2,1,5)],[['a','b']]);
   const a=fleet(1,1,100,0,'fast'),b=fleet(2,2,100,5,'strong');s.world.fleets=reverse?[b,a]:[a,b];s.step(.05);
   return [a.count,b.count];
  };
  const expected=[Math.max(0,100-100*RACES.strong.attack/RACES.fast.defense),Math.max(0,100-100*RACES.fast.attack/RACES.strong.defense)];
  run(false).forEach((n,i)=>expect(n).toBeCloseTo(expected[i]));expect(run(true)).toEqual(run(false));
 });
 it('new reinforcements collide with paused groups instead of tunneling through',()=>{
  const s=make([c('a',1,1,0),c('b',2,1,100)],[['a','b']]);
  const held=fleet(1,2,100,50,'strong');held.combatPause=.25;
  const help=fleet(2,1,20,44,'fast');s.world.fleets=[held,help];s.step(.05);
  expect(help.count).toBe(0);expect(held.count).toBeCloseTo(100-20*RACES.fast.attack/RACES.strong.defense);
  expect(held.x).toBe(50);expect(s.world.events.some(e=>e.type==='clash')).toBe(true);
 });
});
