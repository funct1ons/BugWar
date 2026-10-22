import { RACES, type Colony, type Difficulty, type World } from './types';
import { hasRoad, roadDistances } from './roads';
import { BATTLE_RULES, cannonFirepower, cannonHitsForExposure } from './rules';
export const THINK_INTERVAL: Record<Difficulty,number> = {easy:4,normal:2.7,hard:0.75};
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
interface Arrival { time:number; owner:number; count:number; effectiveCount:number; attack:number; order:number }
/** Conservative ready-to-fire estimate over the clipped straight-line/circle chord.
 * Uses each cannon's real garrison firepower (damage and interval interpolated from the
 * shared table), not a fixed constant. Does not assume that another fleet will absorb
 * shots or that a cannon is cooling down.
 */
export function estimateCannonLoss(world:World,from:{x:number;y:number},to:{x:number;y:number},owner:number,speed:number):number {
  if(!Number.isFinite(speed)||speed<=0) return 0;
  const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy);
  let loss=0;
  for(const cannon of world.colonies) {
    if(cannon.kind!=='cannon'||cannon.owner<=0||cannon.owner===owner) continue;
    const firepower=cannonFirepower(cannon.units);
    if(length===0) {if(distance(from,cannon)<=BATTLE_RULES.cannonRange) loss+=firepower.damage;continue;}
    const ux=dx/length,uy=dy/length,cx=cannon.x-from.x,cy=cannon.y-from.y;
    const along=cx*ux+cy*uy,perpendicularSquared=Math.max(0,cx*cx+cy*cy-along*along);
    const range=BATTLE_RULES.cannonRange;
    if(perpendicularSquared>range*range) continue;
    const halfChord=Math.sqrt(range*range-perpendicularSquared);
    const entry=Math.max(0,along-halfChord),exit=Math.min(length,along+halfChord);
    if(exit<entry) continue;
    const exposure=(exit-entry)/speed;
    loss+=firepower.damage*cannonHitsForExposure(exposure,firepower.cooldown);
  }
  return loss;
}
/** Deterministic, visible-state planning only. Every send updates the next plan's input.
 * Fixed roads: a colony can only receive troops from (or send troops to) a directly
 * connected neighbour. There is no waypoint routing; rear garrisons advance one hop at a
 * time along friendly roads instead.
 */
export function think(world:World, owner:number, difficulty:Difficulty, send:(sources:string[],target:string,ratio:number,owner:number)=>number):void {
  const race=(id:number)=>RACES[world.factions.find(f=>f.id===id)?.race??'agile'];
  const ownRace=race(owner);
  const own=world.colonies.filter(c=>c.owner===owner);
  // Ownership cannot change inside a planning pass; only units and in-flight fleets do.
  const adjacentOwned=(c:Colony)=>own.filter(s=>s!==c&&hasRoad(world.roads,s.id,c.id));
  const adjacentForeign=(c:Colony)=>world.colonies.filter(t=>t!==c&&t.owner!==owner&&hasRoad(world.roads,c.id,t.id));
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
  // Track real orders so logistics never re-spends the same garrison in one pass.
  const committed=new Set<string>();
  const order=(source:string,target:string,ratio:number)=>{
    const sent=send([source],target,ratio,owner);
    if(sent>0) committed.add(source);
    return sent;
  };
  // Defence first: only direct friends may reinforce, and only in time for this attack.
  // A single garrison may still answer several separate threatened neighbours.
  for(const target of own) {
    for(const requirement of requirements(target)) {
      const deadline=requirement.time;
      // Re-read projections after each dispatched reinforcement.
      let need=Math.max(0,...requirements(target).filter(r=>r.time<=deadline).map(r=>r.units-target.units));
      for(const source of adjacentOwned(target).filter(c=>distance(c,target)/ownRace.speed<=deadline).sort((a,b)=>distance(a,target)-distance(b,target)||a.id.localeCompare(b.id))) {
        if(need<=0) break;
        const loss=estimateCannonLoss(world,source,target,owner,ownRace.speed);
        const n=Math.min(Math.max(0,Math.floor(source.units-reserve(source))),Math.ceil(need)+loss);
        if(n<=loss) continue;
        need-=Math.max(0,order(source.id,target.id,n/source.units)-loss);
      }
    }
  }
  // Rear supply: inland colonies push their surplus ONE road hop toward the front.
  // Enemy contact defines the operational front first; only when no enemy is adjacent do
  // neutral targets count as the front. Otherwise a neutral-only branch could pin a colony
  // as a "front" forever and starve the real war front. Distance is BFS over FRIENDLY roads
  // only, so a foreign colony can never shorten (or sever) a supply route. Strictly
  // decreasing distance prevents ping-pong; the batch is never relayed again in this pass.
  // Every occupied foreign colony is an enemy, including player 1: for factions 2-4 the
  // player is a belligerent, not neutral (adjacentForeign already excludes ourselves).
  // Only owner 0 (truly neutral) falls through to the fallback branch below.
  const enemyContact=own.filter(c=>adjacentForeign(c).some(t=>t.owner>0)).map(c=>c.id);
  const frontSeeds=enemyContact.length?enemyContact:own.filter(c=>adjacentForeign(c).length>0).map(c=>c.id);
  if(frontSeeds.length) {
    const ownIds=new Set(own.map(c=>c.id));
    const friendlyRoads=world.roads.filter(([a,b])=>ownIds.has(a)&&ownIds.has(b));
    const frontDistance=roadDistances(friendlyRoads,frontSeeds);
    const hops=(c:Colony)=>frontDistance.get(c.id)??Infinity;
    for(const source of [...own].sort((a,b)=>a.id.localeCompare(b.id))) {
      if(committed.has(source.id)) continue;
      const sourceHop=hops(source);
      if(!Number.isFinite(sourceHop)) continue;
      const available=Math.floor(source.units-reserve(source));
      if(available<2) continue;
      const target=adjacentOwned(source)
        .filter(c=>hops(c)<sourceHop&&project(c).owner===owner)
        .sort((a,b)=>hops(a)-hops(b)||a.id.localeCompare(b.id))[0];
      if(!target) continue;
      const loss=estimateCannonLoss(world,source,target,owner,ownRace.speed);
      const count=available-loss;
      if(count<2) continue;
      order(source.id,target.id,count/source.units);
    }
  }
  const margin=difficulty==='easy'?1.5:difficulty==='normal'?1.25:1.12;
  // Only direct road neighbours are legal targets: a key nest behind a chokepoint cannot be
  // reached over a waypoint, so it must be captured through the intervening colonies.
  const candidates=world.colonies.filter(c=>c.owner!==owner&&adjacentOwned(c).length>0);
  // Productive nests and useful firing positions have explicit strategic value.
  const value=(c:Colony)=>c.kind==='nest'?12+Math.min(20,c.production*8):10+Math.min(12,world.colonies.filter(t=>t.owner!==owner&&t.owner>0&&distance(t,c)<=400).length*4);
  const score=(c:Colony)=>{
    const sources=adjacentOwned(c);
    const nearest=Math.min(...sources.map(s=>distance(s,c)/ownRace.speed));
    const pathLoss=Math.min(...sources.map(s=>estimateCannonLoss(world,s,c,owner,ownRace.speed)));
    const growth=c.owner>0&&c.kind==='nest'?nearest*c.production*race(c.owner).production:0;
    return (c.units+growth)*race(c.owner).defense/ownRace.attack+nearest*2+pathLoss-value(c)-(c.owner===0?8:0);
  };
  candidates.sort((a,b)=>score(a)-score(b)||a.id.localeCompare(b.id));
  for(const target of candidates) {
    if(target.owner===owner||project(target).owner===owner) continue; // already covered in transit
    // Sources are re-read per target: hard mode may reuse the same colony while real
    // troops remain, while easier modes stop after one offensive objective below.
    const sources=adjacentOwned(target).map(c=>({c,available:Math.max(0,Math.floor(c.units-reserve(c)))})).filter(s=>s.available>estimateCannonLoss(world,s.c,target,owner,ownRace.speed)).sort((a,b)=>distance(a.c,target)-distance(b.c,target)||a.c.id.localeCompare(b.c.id));
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
      if(source.owner===owner&&source.units>0) order(source.id,target.id,plan[i].count/source.units);
    }
    if(difficulty!=='hard') break; // One main offensive objective; urgent defense above remains unrestricted.
  }
}
