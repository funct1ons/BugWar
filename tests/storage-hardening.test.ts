import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, SaveSystem, freshSave } from '../src/storage/SaveSystem';

describe('storage failure hardening',()=>{
 it('survives a localStorage getter SecurityError, not just getItem errors',()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new DOMException('Policy disabled','SecurityError');}});
  try{const save=new SaveSystem();expect(save.available).toBe(false);save.record('agile',1,{stars:3,time:90,lost:0},{captures:1,sent:10,kills:3,skills:0});expect(save.unlocked('agile')).toBe(2);expect(()=>save.record('brood',18,{stars:2,time:120,lost:1},{captures:1,sent:10,kills:3,skills:0})).not.toThrow();expect(save.stars('brood')).toBe(2);}finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage');}
 });
 it('skips a null record without discarding later results and settings',()=>{
  const raw={...freshSave(),results:{agile:{'1':null,'2':{stars:4,time:90,lost:1},'2.5':{stars:5,time:1,lost:0}},fast:{},strong:{},brood:{'18':{stars:5,time:80,lost:0},'19':{stars:5,time:80,lost:0}}},settings:{...freshSave().settings,music:.28},achievements:['first','first','bad']};
  const save=new SaveSystem({getItem:()=>JSON.stringify(raw),setItem:()=>{},removeItem:()=>{}});
  expect(save.data.results.agile['2'].stars).toBe(4);expect(save.data.results.agile['2.5']).toBeUndefined();expect(save.data.settings.music).toBe(.28);expect(save.unlocked('agile')).toBe(1);expect(save.data.achievements).toEqual(['first']);
  expect(save.data.results.brood).toEqual({'18':{stars:5,time:80,lost:0}});
 });
 it('keeps valid 18 results while rejecting corrupt races, levels and values',()=>{
  const raw=freshSave();
  raw.results.agile={'1':{stars:4,time:80,lost:0},'13':{stars:5,time:70,lost:1},'18':{stars:2,time:60,lost:0},'19':{stars:5,time:60,lost:0},'2.5':{stars:5,time:60,lost:0}};
  raw.results.brood={'0':{stars:5,time:0,lost:0},'1':{stars:1,time:120,lost:3},'17':{stars:5.5,time:60,lost:0},'18':{stars:5,time:90,lost:1}};
  const save=new SaveSystem({getItem:()=>JSON.stringify(raw),setItem:()=>{},removeItem:()=>{}});
  expect(Object.keys(save.data.results.agile).sort()).toEqual(['1','13','18']);
  expect(Object.keys(save.data.results.brood).sort()).toEqual(['1','18']);
  expect(save.unlocked('agile')).toBe(2);expect(save.unlocked('brood')).toBe(2);
  expect(save.stars('brood')).toBe(6);
 });
 it('preserves legacy awards even when the loaded results are partial or malformed',()=>{
  const raw=freshSave();
  raw.achievements=[...ACHIEVEMENTS.map(a=>a.id),'first','not-a-badge'];
  raw.results.agile={'2':{stars:4,time:90,lost:0}};
  raw.results.brood={'18':null as unknown as {stars:number;time:number;lost:number},'19':{stars:5,time:1,lost:0}};
  const save=new SaveSystem({getItem:()=>JSON.stringify(raw),setItem:()=>{},removeItem:()=>{}});
  expect(new Set(save.data.achievements)).toEqual(new Set(ACHIEVEMENTS.map(a=>a.id)));
  expect(save.data.results.brood).toEqual({});
  save.record('agile',1,{stars:1,time:200,lost:2},{captures:0,sent:0,kills:0,skills:0});
  expect(new Set(save.data.achievements)).toEqual(new Set(ACHIEVEMENTS.map(a=>a.id)));
 });
});
