import { describe, expect, it } from 'vitest';
import { SaveSystem, freshSave } from '../src/storage/SaveSystem';

describe('storage failure hardening',()=>{
 it('survives a localStorage getter SecurityError, not just getItem errors',()=>{
  const old=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new DOMException('Policy disabled','SecurityError');}});
  try{const save=new SaveSystem();expect(save.available).toBe(false);save.record('agile',1,{stars:3,time:90,lost:0},{captures:1,sent:10,kills:3,skills:0});expect(save.unlocked('agile')).toBe(2);}finally{if(old)Object.defineProperty(globalThis,'localStorage',old);else Reflect.deleteProperty(globalThis,'localStorage');}
 });
 it('skips a null record without discarding later results and settings',()=>{
  const raw={...freshSave(),results:{agile:{'1':null,'2':{stars:4,time:90,lost:1},'2.5':{stars:5,time:1,lost:0}},fast:{},strong:{}},settings:{...freshSave().settings,music:.28},achievements:['first','first','bad']};
  const save=new SaveSystem({getItem:()=>JSON.stringify(raw),setItem:()=>{},removeItem:()=>{}});
  expect(save.data.results.agile['2'].stars).toBe(4);expect(save.data.results.agile['2.5']).toBeUndefined();expect(save.data.settings.music).toBe(.28);expect(save.unlocked('agile')).toBe(1);expect(save.data.achievements).toEqual(['first']);
 });
});
