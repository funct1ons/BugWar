import {it,expect} from 'vitest';
import {Simulation} from '../src/core/Simulation';
import {think,THINK_INTERVAL} from '../src/core/ai';
import {LEVELS} from '../src/data/levels';
// Visible current colonies only; no planner, future projection, skills or multi-selection.
function run(id:number,period:number,delay:number,hesitate=false){
 const s=new Simulation(LEVELS[id-1]);let next=delay,orders=0;
 while(s.world.elapsed<600&&s.world.status==='playing'){
  if(s.world.elapsed+1e-8>=next){next+=period;
   if(!(hesitate&&orders===2)){const own=s.world.colonies.filter(c=>c.owner===1);const targets=s.world.colonies.filter(c=>c.owner!==1);
    const pairs=own.flatMap(a=>targets.map(b=>({a,b,d:Math.hypot(a.x-b.x,a.y-b.y)})));
    const neutrals=pairs.filter(p=>p.b.owner===0&&p.a.units*.5>p.b.units+5).sort((a,b)=>a.d-b.d);
    const enemies=pairs.filter(p=>p.b.owner>1&&p.a.units*.75>p.b.units+20).sort((a,b)=>a.d-b.d);
    const p=neutrals[0]??enemies[0];
    if(p)s.dispatch([p.a.id],p.b.id,p.b.owner===0?.5:.75);
    else {const front=own.sort((a,b)=>Math.min(...targets.map(t=>Math.hypot(a.x-t.x,a.y-t.y)))-Math.min(...targets.map(t=>Math.hypot(b.x-t.x,b.y-t.y))))[0];const rear=own.filter(c=>c!==front&&c.units>20).sort((a,b)=>b.units-a.units)[0];if(front&&rear)s.dispatch([rear.id],front.id,.75);}
   }orders++;
  }s.step(.25);s.drainEvents();
 }
 return {id,period,delay,hesitate,status:s.world.status,time:+s.world.elapsed.toFixed(2),lost:s.world.stats.lost};
}
it('low frequency onboarding matrix',()=>{for(const id of [1,2,3])for(const [period,delay] of [[3,8],[3.5,10],[4,12]])for(const hesitate of [false,true]){const r=run(id,period,delay,hesitate);console.log('ONBOARDING '+JSON.stringify(r));expect(r.status).toBe('won');}});
it('grace is public, produces normally and thinks immediately at its boundary',()=>{
 const level={...LEVELS[1],openingGrace:{normal:10.13}};
 const s=new Simulation(level);expect(s.openingGrace).toBe(10.13);s.step(10.1);
 expect(s.world.fleets).toHaveLength(0);
 for(const c of s.world.colonies.filter(c=>c.owner>0))expect(c.units).toBeCloseTo(level.colonies.find(a=>a.id===c.id)!.units+10.1);
 s.step(.05);expect(s.world.fleets.some(f=>f.owner===2)).toBe(true);
 expect(new Simulation({...level,openingGrace:undefined}).openingGrace).toBe(0);
 expect(THINK_INTERVAL.hard).toBe(.75);
});
it('normal/easy limit offensive objectives, hard retains full planning',()=>{
 const base={...LEVELS[0],openingGrace:undefined,colonies:[
  {id:'p',x:1500,y:450,owner:1,kind:'nest' as const,units:1000},
  {id:'e',x:100,y:450,owner:2,kind:'nest' as const,units:300},
  ...[1,2,3].map(i=>({id:`n${i}`,x:300+i*100,y:450,owner:0,kind:'nest' as const,units:5}))]};
 for(const difficulty of ['easy','normal','hard'] as const){const s=new Simulation(base);think(s.world,2,difficulty,(a,b,r,o)=>s.dispatch(a,b,r,o));expect(new Set(s.world.fleets.map(f=>f.to)).size).toBe(difficulty==='hard'?3:1);}
});
