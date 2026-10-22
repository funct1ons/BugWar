import { RACES, type BuildingKind, type Colony, type Difficulty, type Fleet, type RaceId, type World } from './types';
import { findDispatchPath, hasRoad, roadDistances } from './roads';
import { BATTLE_RULES, cannonFirepower, cannonHitsForExposure, fleetSpeed, isProductive } from './rules';
export const THINK_INTERVAL: Record<Difficulty,number> = {easy:4,normal:2.7,hard:0.75};
type RaceInfo = (typeof RACES)[RaceId];
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y);
interface Arrival { time:number; owner:number; count:number; effectiveCount:number; attack:number; order:number }
/** Full legal multi-hop route plus the costs a planner must pay for it. */
interface Route { path:string[]; distance:number; eta:number; loss:number }
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
 *
 * Fixed roads now support multi-hop orders: a fleet leaves the selected colony, passes
 * through friendly colonies without merging, and stops at the final target. The planner
 * uses the SAME `findDispatchPath` search as the simulation, follows the actual roads, and
 * prices the whole itinerary (travel time per segment including wind, cannon exposure along
 * every segment, and hostile fleets already marching the other way).
 * No hidden information, no resources and no teleports: only troops that exist are spent.
 */
export function think(world:World, owner:number, difficulty:Difficulty, send:(sources:string[],target:string,ratio:number,owner:number)=>number):void {
  const race=(id:number):RaceInfo=>RACES[world.factions.find(f=>f.id===id)?.race??'agile']??RACES.agile;
  const ownRace=race(owner);
  const own=world.colonies.filter(c=>c.owner===owner);
  if(!own.length) return;
  const colonies=new Map(world.colonies.map(c=>[c.id,c] as const));
  // Ownership cannot change inside a planning pass; only units and in-flight fleets do.
  const adjacentOwned=(c:Colony)=>own.filter(s=>s!==c&&hasRoad(world.roads,s.id,c.id));
  const adjacentForeign=(c:Colony)=>world.colonies.filter(t=>t!==c&&t.owner!==owner&&hasRoad(world.roads,c.id,t.id));
  /** Speed of a fleet that departs from this colony: the owner's race plus a wind boost. */
  const segmentSpeed=(from:Colony)=>ownRace.speed*(from.kind==='wind'&&from.owner===owner?BATTLE_RULES.windSpeedMultiplier:1);
  /** Hostile fleets already marching the opposite way on a road we intend to walk. */
  const interceptionOn=(a:Colony,b:Colony):number=>{
    let loss=0;
    for(const enemy of world.fleets) {
      if(enemy.owner===owner||enemy.owner<=0||!(enemy.count>0)||enemy.from!==b.id||enemy.to!==a.id) continue;
      loss+=enemy.count*race(enemy.owner).attack/ownRace.defense;
    }
    return loss;
  };
  const destinationOf=(f:Fleet)=>f.destination??f.route?.[f.route.length-1]??f.to;
  /** Remaining travel time and expected losses of an in-flight fleet up to one itinerary node. */
  const remainingTo=(fleet:Fleet,targetId:string):{eta:number;loss:number}|null=>{
    const nodes=[fleet.to,...(fleet.route??[])];
    const index=nodes.indexOf(targetId);
    if(index<0) return null;
    const first=colonies.get(fleet.to);
    if(!first) return null;
    const fleetRace=race(fleet.owner);
    let eta=0,loss=0;
    const firstSpeed=fleetSpeed(fleet);
    eta+=distance(fleet,first)/firstSpeed;
    loss+=estimateCannonLoss(world,fleet,first,fleet.owner,firstSpeed);
    for(let i=1;i<=index;i++) {
      const a=colonies.get(nodes[i-1]),b=colonies.get(nodes[i]);
      if(!a||!b) return null;
      const speed=fleetRace.speed*(a.kind==='wind'&&a.owner===fleet.owner?BATTLE_RULES.windSpeedMultiplier:1);
      eta+=distance(a,b)/speed;
      loss+=estimateCannonLoss(world,a,b,fleet.owner,speed);
    }
    return {eta,loss};
  };
  const arrivals=(c:Colony):Arrival[]=>{
    const list:Arrival[]=[];
    for(const fleet of world.fleets) {
      if(!(fleet.count>0)||destinationOf(fleet)!==c.id) continue;
      const remaining=remainingTo(fleet,c.id);
      if(!remaining) continue;
      list.push({time:remaining.eta,owner:fleet.owner,count:fleet.count,effectiveCount:Math.max(0,fleet.count-remaining.loss),attack:race(fleet.owner).attack,order:fleet.id});
    }
    return list;
  };
  /** Cap-aware natural growth: only production kinds grow, and never past the shared cap. */
  const grow=(holder:number,kind:BuildingKind,production:number,units:number,seconds:number):number=>{
    if(holder<=0||!isProductive(kind)||!(seconds>0)||units>=BATTLE_RULES.productionCap) return units;
    const rate=production*race(holder).production;
    return rate>0?Math.min(BATTLE_RULES.productionCap,units+rate*seconds):units;
  };
  // The same weighted attrition as Simulation, including production under each new owner.
  const project=(c:Colony,extra:Arrival[]=[])=>{
    let holder=c.owner,units=c.units,time=0;
    for(const a of [...arrivals(c),...extra].sort((a,b)=>a.time-b.time||a.order-b.order)) {
      if(a.effectiveCount<=0) continue;
      units=grow(holder,c.kind,c.production,units,a.time-time);
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
  /** Unmodified steady-state projection, cached so route checks stay cheap inside one pass. */
  const baseProjections=new Map<string,{owner:number;units:number;time:number}>();
  const projectBase=(c:Colony)=>{
    const cached=baseProjections.get(c.id);
    if(cached) return cached;
    const result=project(c);
    baseProjections.set(c.id,result);
    return result;
  };
  /**
   * Route cache so defence, logistics and offence share one shortest-path search per pair.
   * Besides length and travel time, a route is only legal while every intermediate stop is
   * still projected to be ours when the fleet passes: marching through a colony that is about
   * to fall would strand the batch there, so it is priced out instead of assumed free.
   */
  const routes=new Map<string,Route|null>();
  const routeTo=(source:Colony,target:Colony):Route|null=>{
    const key=`${source.id}>${target.id}`;
    if(routes.has(key)) return routes.get(key)!;
    let route:Route|null=null;
    const path=findDispatchPath(world,source.id,target.id,owner);
    if(path&&path.length>1) {
      let total=0,eta=0,loss=0,valid=true;
      for(let i=1;i<path.length;i++) {
        const a=colonies.get(path[i-1]),b=colonies.get(path[i]);
        if(!a||!b) {valid=false;break;}
        const length=distance(a,b),speed=segmentSpeed(a);
        total+=length;eta+=length/speed;
        loss+=estimateCannonLoss(world,a,b,owner,speed)+interceptionOn(a,b);
        // Intermediate stops (never the final order target) must survive the passage.
        if(i<path.length-1&&projectBase(b).owner!==owner) valid=false;
      }
      if(valid) route={path,distance:total,eta,loss};
    }
    routes.set(key,route);
    return route;
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
        const capped=Math.min(c.units,BATTLE_RULES.productionCap);
        const growth=isProductive(c.kind)?Math.max(0,Math.min(BATTLE_RULES.productionCap,capped+a.time*c.production*ownRace.production)-capped):0;
        result.push({time:a.time,units:Math.ceil(deficit-growth+4)});
      }
    }
    return result;
  };
  const reserve=(c:Colony)=>Math.max(difficulty==='hard'?5:difficulty==='normal'?8:10,...requirements(c).map(r=>r.units));
  const extra=(target:Colony,count:number,index:number,route:Route):Arrival=>({time:route.eta,owner,count,effectiveCount:Math.max(0,count-route.loss),attack:ownRace.attack,order:1e12+index});
  // Track real orders so logistics never re-spends the same garrison in one pass.
  const committed=new Set<string>();
  const order=(source:string,target:string,ratio:number)=>{
    const sent=send([source],target,ratio,owner);
    if(sent>0) committed.add(source);
    return sent;
  };
  // Defence first: any owned colony with a legal route may reinforce, in time for this attack.
  // Each route is priced for cannons and hostile interception, so a "free" long march is not
  // assumed. A single garrison may still answer several separate threatened neighbours.
  for(const target of own) {
    for(const requirement of requirements(target)) {
      const deadline=requirement.time;
      // Re-read projections after each dispatched reinforcement.
      let need=Math.max(0,...requirements(target).filter(r=>r.time<=deadline).map(r=>r.units-target.units));
      const sources=own
        .filter(s=>s!==target&&s.units>0)
        .map(s=>({s,route:routeTo(s,target)}))
        .filter((x):x is {s:Colony;route:Route}=>!!x.route&&x.route.eta<=deadline)
        .sort((a,b)=>a.route.eta-b.route.eta||a.s.id.localeCompare(b.s.id));
      for(const {s,route} of sources) {
        if(need<=0) break;
        const n=Math.min(Math.max(0,Math.floor(s.units-reserve(s))),Math.ceil(need)+route.loss);
        if(n<=route.loss) continue;
        need-=Math.max(0,order(s.id,target.id,n/s.units)-route.loss);
      }
    }
  }
  // Rear supply: inland colonies push their surplus ONE road hop toward the front. One-hop
  // logistics is still legal under multi-hop orders and keeps the chain stable; the offensive
  // planner below is the part that now projects whole routes instead of neighbouring targets.
  // Enemy contact defines the operational front first; only when no enemy is adjacent do
  // neutral targets count as the front. Otherwise a neutral-only branch could pin a colony
  // as a "front" forever and starve the real war front. Distance is BFS over FRIENDLY roads
  // only, so a foreign colony can never shorten (or sever) a supply route. Strictly
  // decreasing distance prevents ping-pong; the batch is never relayed again in this pass.
  // Every occupied foreign colony is an enemy, including player 1: for factions 2-4 the
  // player is a belligerent, not neutral. Only owner 0 falls through to the fallback branch.
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
  // The capture objective is the fastest win for the player, so the planner values the marked
  // colony above every other target without being told anything hidden.
  const objectiveTarget=owner===1&&world.objective?.type==='capture'?world.objective.target:null;
  // Productive buildings (nests AND hatcheries) and useful firing positions have value; wind
  // colonies are worth taking for the travel boost they grant the next departing fleet.
  const value=(c:Colony)=>objectiveTarget===c.id?1e6:isProductive(c.kind)?12+Math.min(20,c.production*8):c.kind==='wind'?13:10+Math.min(12,world.colonies.filter(t=>t.owner!==owner&&t.owner>0&&distance(t,c)<=400).length*4);
  const growthDuring=(c:Colony,seconds:number):number=>{
    if(c.owner<=0||!isProductive(c.kind)) return 0;
    const capped=Math.min(c.units,BATTLE_RULES.productionCap);
    return Math.max(0,Math.min(BATTLE_RULES.productionCap,capped+seconds*c.production*race(c.owner).production)-capped);
  };
  const score=(c:Colony,route:Route)=>{
    const growth=growthDuring(c,route.eta);
    return (c.units+growth)*race(c.owner).defense/ownRace.attack+route.eta*2+route.loss-value(c)-(c.owner===0?8:0);
  };
  // Every foreign colony reachable through friendly territory is a legal multi-hop target.
  // Sources are priced by their own route, so a deep strike behind an owned corridor is
  // allowed while a hostile/neutral intermediate still blocks it (findDispatchPath enforces it).
  const candidates=world.colonies
    .filter(target=>target.owner!==owner)
    .map(target=>({
      target,
      options:own
        .filter(source=>source.id!==target.id)
        .map(source=>({source,route:routeTo(source,target)}))
        .filter((option):option is {source:Colony;route:Route}=>!!option.route)
        .sort((a,b)=>a.route.eta-b.route.eta||a.source.id.localeCompare(b.source.id)),
    }))
    .filter(candidate=>candidate.options.length>0)
    .map(candidate=>({...candidate,rank:score(candidate.target,candidate.options[0].route)}))
    .sort((a,b)=>a.rank-b.rank||a.target.id.localeCompare(b.target.id));
  for(const {target,options} of candidates) {
    if(target.owner===owner||project(target).owner===owner) continue; // already covered in transit
    const sources=options
      .map(option=>({...option,available:Math.max(0,Math.floor(option.source.units-reserve(option.source)))}))
      .filter(option=>option.source.units>0&&option.available>option.route.loss);
    const plan:Arrival[]=[];
    let viable=false;
    for(let i=0;i<sources.length;i++) {
      const {source,route,available}=sources[i];
      plan.push(extra(target,available,i,route));
      const projected=project(target,plan);
      const buffer=3+(target.units*(margin-1)*race(target.owner).defense/ownRace.attack);
      if(projected.owner!==owner||projected.units<buffer) continue;
      // Minimal final contribution meeting the projected safety margin. Earlier sources
      // may soften defenders; production and travel time between arrivals are accounted for.
      let low=1,high=available;
      while(low<high) {
        const mid=Math.floor((low+high)/2);plan[i]=extra(target,mid,i,route);
        const result=project(target,plan);
        if(result.owner===owner&&result.units>=buffer) high=mid;else low=mid+1;
      }
      plan[i]=extra(target,low,i,route);viable=true;break;
    }
    if(!viable) continue;
    for(let i=0;i<plan.length;i++) {
      const source=sources[i].source;
      // Recheck ownership and available units at dispatch, never fabricate resources.
      if(source.owner!==owner||!(source.units>0)) continue;
      const count=Math.min(plan[i].count,Math.max(0,Math.floor(source.units)));
      if(count<1) continue;
      order(source.id,target.id,count/source.units);
    }
    if(difficulty!=='hard') break; // One main offensive objective; urgent defence above remains unrestricted.
  }
}
