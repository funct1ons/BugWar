import {it,expect} from 'vitest';
import {Simulation} from '../src/core/Simulation';
import {think,THINK_INTERVAL} from '../src/core/ai';
import {hasRoad} from '../src/core/roads';
import {garrisonDefenseMultiplier} from '../src/core/rules';
import {RACES} from '../src/core/types';
import {LEVELS} from '../src/data/levels';
// Visible current colonies only; no planner, future projection, skills or multi-selection.
function run(id:number,period:number,delay:number,hesitate=false){
 const s=new Simulation(LEVELS[id-1]);let next=delay,orders=0;
 const recentOrders:{time:number;from:string;to:string;ratio:number;targetOwner:number;sourceUnits:number;targetUnits:number;purpose:'attack'|'supply'}[]=[];
 const openingOrders:typeof recentOrders=[];
 const send=(from:string,to:string,ratio:number)=>{
  expect(hasRoad(s.world.roads,from,to)).toBe(true);
  const a=s.world.colonies.find(c=>c.id===from)!,b=s.world.colonies.find(c=>c.id===to)!;
  const order={time:+s.world.elapsed.toFixed(2),from,to,ratio,targetOwner:b.owner,sourceUnits:Math.floor(a.units),targetUnits:Math.floor(b.units),purpose:(b.owner===1?'supply':'attack') as 'attack'|'supply'};
  recentOrders.push(order);if(openingOrders.length<16)openingOrders.push(order);if(recentOrders.length>12)recentOrders.shift();return s.dispatch([from],to,ratio);
 };
 while(s.world.elapsed<600&&s.world.status==='playing'){
  if(s.world.elapsed+1e-8>=next){next+=period;
   if(!(hesitate&&orders===2)){const visible=s.world.colonies.map(c=>({...c,units:Math.floor(c.units)}));const own=visible.filter(c=>c.owner===1);const targets=visible.filter(c=>c.owner!==1);
    const pairs=own.flatMap(a=>targets.filter(b=>hasRoad(s.world.roads,a.id,b.id)).map(b=>({a,b,d:Math.hypot(a.x-b.x,a.y-b.y)})));
    const effectiveDefenders=(owner:number,units:number)=>units*RACES[s.world.factions.find(f=>f.id===owner)?.race??'agile'].defense*garrisonDefenseMultiplier(owner)/RACES.agile.attack;
    const neutrals=pairs.filter(p=>p.b.owner===0&&p.a.units*.5>effectiveDefenders(p.b.owner,p.b.units)+5).sort((a,b)=>a.d-b.d);
    const enemies=pairs.filter(p=>p.b.owner>1&&p.a.units*.75>effectiveDefenders(p.b.owner,p.b.units)+20).sort((a,b)=>a.d-b.d);
    const p=neutrals[0]??enemies[0];
    if(p)send(p.a.id,p.b.id,p.b.owner===0?.5:.75);
    else {
     // Multi-source BFS on CURRENT owned nodes only. Distance zero means a visible
     // non-owned neighbour, not a projected future objective. One manual hop/order.
     const adjacent=(a:typeof own[number],b:typeof own[number])=>hasRoad(s.world.roads,a.id,b.id);
     const hops=new Map<string,number>();const queue=own.filter(c=>targets.some(t=>adjacent(c,t)));
     for(const c of queue)hops.set(c.id,0);
     for(let i=0;i<queue.length;i++)for(const c of own)if(!hops.has(c.id)&&adjacent(queue[i],c)){hops.set(c.id,hops.get(queue[i].id)!+1);queue.push(c);}
     const rear=own.filter(c=>c.units>20&&(hops.get(c.id)??0)>0&&own.some(n=>adjacent(c,n)&&hops.get(n.id)===hops.get(c.id)!-1)).sort((a,b)=>b.units-a.units)[0];
     // Equal-hop choices use a fixed descending ID tie-break, not the changing
     // garrison, so a rear node does not alternate between equivalent branches.
     const next=rear&&own.filter(c=>adjacent(rear,c)&&hops.get(c.id)===hops.get(rear.id)!-1).sort((a,b)=>b.id.localeCompare(a.id))[0];
     if(rear&&next)send(rear.id,next.id,.75);
     else {
      // If no rear can supply, gather at an adjacent frontier in stable node
      // declaration order. Only smaller -> larger IDs: garrison fluctuations
      // cannot reverse a front-to-front order. No enemy forecast or planner.
      const source=own.filter(c=>c.units>20&&hops.get(c.id)===0&&own.some(n=>hops.get(n.id)===0&&adjacent(c,n)&&c.id.localeCompare(n.id)<0)).sort((a,b)=>b.units-a.units)[0];
      const target=source&&own.filter(n=>hops.get(n.id)===0&&adjacent(source,n)&&source.id.localeCompare(n.id)<0).sort((a,b)=>a.id.localeCompare(b.id))[0];
      if(source&&target)send(source.id,target.id,.75);
     }
    }
   }orders++;
  }s.step(.25);s.drainEvents();
 }
 return {id,period,delay,hesitate,status:s.world.status,time:+s.world.elapsed.toFixed(2),lost:s.world.stats.lost,...(s.world.status!=='won'?{colonies:s.world.colonies.map(({id,owner,kind,units})=>({id,owner,kind,units:Math.floor(units)})),openingOrders,recentOrders}: {})};
}
it('low frequency onboarding matrix',()=>{for(const id of [1,2,3])for(const [period,delay] of [[3,8],[3.5,10],[4,12]])for(const hesitate of [false,true]){const r=run(id,period,delay,hesitate);console.log('ONBOARDING '+JSON.stringify(r));expect.soft(r.status,JSON.stringify(r)).toBe('won');}});
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
 const base={...LEVELS[0],roads:[['e','n1'],['e','n2'],['e','n3']] as [string,string][],openingGrace:undefined,colonies:[
  {id:'p',x:1500,y:450,owner:1,kind:'nest' as const,units:1000},
  {id:'e',x:100,y:450,owner:2,kind:'nest' as const,units:300},
  ...[1,2,3].map(i=>({id:`n${i}`,x:300+i*100,y:450,owner:0,kind:'nest' as const,units:5}))]};
 for(const difficulty of ['easy','normal','hard'] as const){const s=new Simulation(base);think(s.world,2,difficulty,(a,b,r,o)=>s.dispatch(a,b,r,o));expect(new Set(s.world.fleets.map(f=>f.to)).size).toBe(difficulty==='hard'?3:1);}
});
