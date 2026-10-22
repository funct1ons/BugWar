import { RACES, type Colony, type Difficulty, type World } from './types';
export const THINK_INTERVAL: Record<Difficulty,number> = {easy:4,normal:2.7,hard:0.75};
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
interface Arrival { time:number; owner:number; count:number; effectiveCount:number; attack:number; order:number }
/** Conservative ready-to-fire estimate over the clipped straight-line/circle chord.
 * Does not assume that another fleet will absorb shots or that a cannon is cooling down.
 */
export function estimateCannonLoss(world:World,from:{x:number;y:number},to:{x:number;y:number},owner:number,speed:number):number {
  if(!Number.isFinite(speed)||speed<=0) return 0;
  const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
  let loss=0;
  for(const cannon of world.colonies) {
    if(cannon.kind!=='cannon'||cannon.owner<=0||cannon.owner===owner) continue;
    if(length===0) {if(distance(from,cannon)<=200) loss+=2;continue;}
    const ux=dx/length,uy=dy/length,cx=cannon.x-from.x,cy=cannon.y-from.y;
    const along=cx*ux+cy*uy,perpendicularSquared=Math.max(0,cx*cx+cy*cy-along*along);
    if(perpendicularSquared>200*200) continue;
    const halfChord=Math.sqrt(200*200-perpendicularSquared);
    const entry=Math.max(0,along-halfChord),exit=Math.min(length,along+halfChord);
    if(exit<entry) continue;
    const exposure=(exit-entry)/speed;
    loss+=2*(1+Math.floor((exposure+1e-9)/0.75));
  }
  return loss;
}
/** Deterministic, visible-state planning only. Every send updates the next plan's input. */
export function think(world:World, owner:number, difficulty:Difficulty, send:(sources:string[],target:string,ratio:number,owner:number)=>number):void {
  const race=(id:number)=>RACES[world.factions.find(f=>f.id===id)?.race??'agile'];
  const ownRace=race(owner);
  const owned=()=>world.colonies.filter(c=>c.owner===owner);
  const arrivals=(c:Colony):Arrival[]=>world.fleets.filter(f=>f.to===c.id&&f.count>0).map(f=>({time:distance(f,c)/RACES[f.race].speed,owner:f.owner,count:f.count,effectiveCount:Math.max(0,f.count-estimateCannonLoss(world,f,c,f.owner,RACES[f.race].speed)),attack:RACES[f.race].attack,order:f.id}));
  // The same weighted attrition as Simulation, including production under each new owner.
  const project=(c:Colony,extra:Arrival[]=[])=>{
    let holder=c.owner,units=c.units,time=0;
    for(const a of [...arrivals(c),...extra].sort((a,b)=>a.time-b.time||a.order-b.order)) {
      if(a.effectiveCount<=0) continue;
      if(holder>0&&c.kind==='nest') units+=(a.time-time)*c.production*race(holder).production;
      time=a.time;
      if(a.owner===holder) units+=a.effectiveCount;
      else {
        const strength=a.effectiveCount*a.attack-units*race(holder).defense;
        if(strength>1e-9) {holder=a.owner;units=strength/a.attack;}
        else units=Math.max(0,-strength/race(holder).defense);
      }
    }
    return {owner:holder,units,time};
  };
  // Prefix deficits, not net sums: late friendly arrivals cannot cover early attacks.
  const requirements=(c:Colony)=>{
    let deficit=0;
    const result:{time:number;units:number}[]=[];
    for(const a of arrivals(c).sort((a,b)=>a.time-b.time||a.order-b.order)) {
      if(a.effectiveCount<=0) continue;
      if(a.owner===owner) deficit-=a.effectiveCount;
      else {
        deficit+=a.effectiveCount*a.attack/ownRace.defense;
        const growth=c.kind==='nest'?a.time*c.production*ownRace.production:0;
        result.push({time:a.time,units:Math.ceil(deficit-growth+4)});
      }
    }
    return result;
  };
  const reserve=(c:Colony)=>Math.max(difficulty==='hard'?5:difficulty==='normal'?8:10,...requirements(c).map(r=>r.units));
  const extra=(source:Colony,target:Colony,count:number,index:number):Arrival=>({time:distance(source,target)/ownRace.speed,owner,count,effectiveCount:Math.max(0,count-estimateCannonLoss(world,source,target,owner,ownRace.speed)),attack:ownRace.attack,order:1e12+index});
  for(const target of owned()) {
    for(const requirement of requirements(target)) {
      const deadline=requirement.time;
      // Re-read projections after each dispatched reinforcement.
      let need=Math.max(0,...requirements(target).filter(r=>r.time<=deadline).map(r=>r.units-target.units));
      for(const source of owned().filter(c=>c!==target&&distance(c,target)/ownRace.speed<=deadline).sort((a,b)=>distance(a,target)-distance(b,target)||a.id.localeCompare(b.id))) {
        if(need<=0) break;
        const loss=estimateCannonLoss(world,source,target,owner,ownRace.speed);
        const n=Math.min(Math.max(0,Math.floor(source.units-reserve(source))),Math.ceil(need)+loss);
        if(n>loss) need-=Math.max(0,send([source.id],target.id,n/source.units,owner)-loss);
      }
    }
  }
  const margin=difficulty==='easy'?1.5:difficulty==='normal'?1.25:1.12;
  const candidates=world.colonies.filter(c=>c.owner!==owner);
  // Productive nests and useful firing positions have explicit strategic value.
  const value=(c:Colony)=>c.kind==='nest'?12+Math.min(20,c.production*8):10+Math.min(12,world.colonies.filter(t=>t.owner!==owner&&t.owner>0&&distance(t,c)<=400).length*4);
  const score=(c:Colony)=>{
    const nearest=Math.min(...owned().map(s=>distance(s,c)/ownRace.speed));
    const pathLoss=Math.min(...owned().map(s=>estimateCannonLoss(world,s,c,owner,ownRace.speed)));
    const growth=c.owner>0&&c.kind==='nest'?nearest*c.production*race(c.owner).production:0;
    return (c.units+growth)*race(c.owner).defense/ownRace.attack+nearest*2+pathLoss-value(c)-(c.owner===0?8:0);
  };
  candidates.sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id));
  for(const target of candidates) {
    if(target.owner===owner||project(target).owner===owner) continue; // already covered in transit
    const sources=owned().map(c=>({c,available:Math.max(0,Math.floor(c.units-reserve(c)))})).filter(s=>s.available>estimateCannonLoss(world,s.c,target,owner,ownRace.speed)).sort((a,b)=>distance(a.c,target)-distance(b.c,target)||a.c.id.localeCompare(b.c.id));
    const plan:Arrival[]=[];
    let viable=false;
    for(let i=0;i<sources.length;i++) {
      const {c,available}=sources[i];
      plan.push(extra(c,target,available,i));
      const projected=project(target,plan);
      const buffer=3+(target.units*(margin-1)*race(target.owner).defense/ownRace.attack);
      if(projected.owner!==owner||projected.units<buffer) continue;
      // Minimal final contribution meeting the projected safety margin. Earlier sources
      // may soften defenders; production between their arrivals is accounted for.
      let low=1,high=available;
      while(low<high) {
        const mid=Math.floor((low+high)/2);plan[i]=extra(c,target,mid,i);
        const result=project(target,plan);
        if(result.owner===owner&&result.units>=buffer) high=mid;else low=mid+1;
      }
      plan[i]=extra(c,target,low,i);viable=true;break;
    }
    if(!viable) continue;
    for(let i=0;i<plan.length;i++) {
      const source=sources[i].c;
      // Recheck ownership and available units at dispatch, never fabricate resources.
      if(source.owner===owner&&source.units>0) send([source.id],target.id,plan[i].count/source.units,owner);
    }
    if(difficulty!=='hard') break; // One main offensive objective; urgent defense above remains unrestricted.
  }
}
