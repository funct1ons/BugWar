import { RACES, type RaceId, type Difficulty, type LevelConfig, type World, type GameEvent, type Fleet, type Colony } from './types';
import { think, THINK_INTERVAL } from './ai';
import { cloneRoads, findDispatchPath, hasRoad } from './roads';
import { BATTLE_RULES, ROAD_CLASH, cannonFirepower, defaultProduction, fleetSpeed, isProductive } from './rules';
const TICK=0.05;
const safe=(n:number,fallback=0)=>Number.isFinite(n)?Math.max(0,Math.min(1e12,n)):fallback;
const raceOf=(race:RaceId)=>RACES[race]??RACES.agile;
/** A fleet's planned movement inside one fixed tick, kept so clashes can use the swept path. */
interface Motion { fleet:Fleet; x0:number; y0:number; x1:number; y1:number; arrival:Colony|null; moving:boolean }
export class Simulation {
  world:World;
  public readonly openingGrace:number;
  private accumulator=0;
  private nextFleet=1;
  private aiClock=0;
  // Fire readiness per cannon, normalised to 0..1 instead of a stored interval. The garrison
  // sets how fast this charge fills: changes affect the remaining recharge immediately,
  // but never reset accumulated progress or grant an extra immediate shot.
  private cannonCharge=new Map<string,number>();
  // Neutral colonies that already granted the Brood capture bonus. A colony can be taken
  // from neutral only once, so this is belt-and-braces against any future rule change.
  private broodBonuses=new Set<string>();
  constructor(level:LevelConfig,race:RaceId='agile',private difficulty:Difficulty='normal') {
    this.openingGrace=safe(level.openingGrace?.[difficulty]??0);
    this.world={
      elapsed:0,
      colonies:level.colonies.map(c=>{
        // Only production kinds keep a (possibly overridden) rate. A map can never turn a
        // cannon or a wind colony into a producer, and hatcheries default above nests.
        const raw=c.kind==='nest'||c.kind==='hatchery'?(Number.isFinite(c.production)?Math.max(0,c.production as number):defaultProduction(c.kind)):0;
        return {...c,x:safe(c.x),y:safe(c.y),units:safe(c.units),production:raw};
      }),
      factions:level.factions.map(f=>({...f,race:f.id===1?race:f.race})),
      roads:cloneRoads(level.roads),
      objective:level.objective?{...level.objective}:undefined,
      fleets:[],
      energy:{},
      status:'playing',
      stats:{sent:0,kills:0,captures:0,lost:0,skills:0,casualties:0},
      events:[],
    };
    for(const f of this.world.factions) this.world.energy[f.id]=0;
  }
  private race(owner:number) { return raceOf(this.world.factions.find(f=>f.id===owner)?.race ?? 'agile'); }
  private ownerRaceId(owner:number):RaceId { return this.world.factions.find(f=>f.id===owner)?.race ?? 'agile'; }
  drainEvents():GameEvent[] { return this.world.events.splice(0); }
  /**
   * Multi-hop order. Every selected source is validated on its own through the shared
   * `findDispatchPath` search: the source must be ours, intermediate stops must stay ours and
   * only the final target may be foreign. Illegal picks cost nothing and emit nothing.
   */
  dispatch(sources:string[],target:string,ratio=0.5,owner=1):number {
    const w=this.world,t=w.colonies.find(c=>c.id===target);
    if(w.status!=='playing'||!t||owner<=0||!Number.isFinite(ratio)||ratio<=0) return 0;
    ratio=Math.min(1,ratio);
    let sent=0;
    for(const id of new Set(sources)) {
      const c=w.colonies.find(c=>c.id===id);
      if(!c||c.owner!==owner||c===t) continue;
      const path=findDispatchPath(w,c.id,t.id,owner);
      if(!path||path.length<2) continue;
      const next=w.colonies.find(x=>x.id===path[1]);
      if(!next) continue;
      c.units=safe(c.units);
      const n=Math.min(Math.floor(c.units),Math.floor(c.units*ratio+1e-9));
      if(n<1) continue;
      c.units-=n;sent+=n;
      const fleet:Fleet={id:this.nextFleet++,owner,race:this.ownerRaceId(owner),from:c.id,to:next.id,x:c.x,y:c.y,count:n,initialCount:n,destination:t.id};
      const rest=path.slice(2);
      if(rest.length) fleet.route=rest;
      // Wind only boosts the segment the fleet departs on; a later stop re-evaluates its own kind.
      if(c.kind==='wind') fleet.haste=BATTLE_RULES.windSpeedMultiplier;
      w.fleets.push(fleet);
      w.events.push({type:'dispatch',x:c.x,y:c.y,targetX:t.x,targetY:t.y,owner,amount:n});
    }
    if(owner===1) w.stats.sent+=sent;
    return sent;
  }
  castSkill(owner:number,x:number,y:number):boolean {
    const w=this.world;
    if(w.status!=='playing'||owner<=0||!w.factions.some(f=>f.id===owner)||!Number.isFinite(x)||!Number.isFinite(y)||safe(w.energy[owner])<BATTLE_RULES.skillCost) return false;
    w.energy[owner]=0;
    // Reconstructed area pulse: fixed radius/damage from BATTLE_RULES; never captures.
    const {skillRadius,skillDamage}=BATTLE_RULES;
    for(const c of w.colonies) if(c.owner!==owner&&c.owner!==0&&Math.hypot(c.x-x,c.y-y)<=skillRadius) {const n=Math.min(c.units,skillDamage);c.units-=n;this.casualties(owner,c.owner,n,0);}
    for(const f of w.fleets) if(f.owner!==owner&&Math.hypot(f.x-x,f.y-y)<=skillRadius) {const n=Math.min(f.count,skillDamage);f.count-=n;this.casualties(owner,f.owner,n,0);}
    w.fleets=w.fleets.filter(f=>f.count>1e-9);
    if(owner===1) w.stats.skills++;
    w.events.push({type:'skill',owner,x,y,amount:skillDamage});this.checkEnd();return true;
  }
  step(dt:number):void {
    if(!Number.isFinite(dt)||dt<=0||this.world.status!=='playing') return;
    // Bound pathological caller deltas to 30 seconds; normal frames retain their remainder.
    this.accumulator+=Math.min(dt,30);
    while(this.accumulator+1e-10>=TICK&&this.world.status==='playing') {this.accumulator-=TICK;this.tick();}
  }
  private tick():void {
    const w=this.world;w.elapsed+=TICK;
    for(const c of w.colonies) {
      c.units=safe(c.units);
      if(c.owner<=0||!isProductive(c.kind)) continue;
      const rate=safe(c.production)*this.race(c.owner).production;
      // Natural growth stops at the cap. A garrison above the cap (an over-cap reinforcement)
      // is left untouched instead of being truncated back down.
      if(!(rate>0)||c.units>=BATTLE_RULES.productionCap) continue;
      c.units=Math.min(BATTLE_RULES.productionCap,c.units+rate*TICK);
    }
    for(const f of w.factions) w.energy[f.id]=Math.min(BATTLE_RULES.skillCost,safe(w.energy[f.id])+TICK*BATTLE_RULES.energyRate);
    for(const c of w.colonies.filter(c=>c.kind==='cannon'&&c.owner>0)) {
      // Firepower is read from the live garrison every tick; ownership rules are unchanged
      // (owner>0 only, never neutral towers, never buildings). One idle shot is banked at most.
      const firepower=cannonFirepower(c.units);
      let charge=Math.min(1,(this.cannonCharge.get(c.id)??1)+TICK/firepower.cooldown);
      if(charge>=1-1e-9) {
        const enemy=w.fleets.find(f=>f.owner!==c.owner&&f.count>0&&Math.hypot(f.x-c.x,f.y-c.y)<=BATTLE_RULES.cannonRange);
        if(enemy) {const n=Math.min(enemy.count,firepower.damage);enemy.count-=n;this.casualties(c.owner,enemy.owner,n,0);w.events.push({type:'shot',owner:c.owner,x:c.x,y:c.y,targetX:enemy.x,targetY:enemy.y,amount:n});charge=Math.max(0,charge-1);}
      }
      this.cannonCharge.set(c.id,charge);
    }
    this.moveFleets();
    w.fleets=w.fleets.filter(f=>f.count>1e-9);
    // A capture objective may already have ended the battle inside this tick; never let a
    // later arrival undo it or let the AI issue more orders after the fact.
    if(w.status!=='playing') return;
    this.checkEnd();
    this.aiClock+=TICK;
    if(w.status==='playing'&&w.elapsed+1e-9>=this.openingGrace&&this.aiClock+1e-9>=THINK_INTERVAL[this.difficulty]) {
      this.aiClock=0;
      for(const f of w.factions.filter(f=>f.id>=2&&f.id<=4).sort((a,b)=>a.id-b.id)) think(w,f.id,this.difficulty,(s,t,r,o)=>this.dispatch(s,t,r,o));
    }
  }
  /**
   * Fixed-step fleet movement. Every fleet advances along its current road segment only; a
   * hostile pair on the same road is resolved by a swept collision test, so even a very high
   * speed cannot tunnel past the other fleet inside one tick. A fleet holding position after a
   * clash stays in the tick as a stationary participant: another hostile batch running into the
   * paused group clashes with it instead of slipping through the gap.
   */
  private moveFleets():void {
    const w=this.world;
    const ordered=[...w.fleets].filter(f=>f.count>0).sort((a,b)=>a.id-b.id);
    const motions:Motion[]=[];
    for(const fleet of ordered) {
      fleet.x=safe(fleet.x);fleet.y=safe(fleet.y);
      const held=fleet.combatPause??0;
      const remaining=held>0?Math.max(0,safe(held)-TICK):0;
      if(held>0) fleet.combatPause=remaining;
      const paused=remaining>1e-9;
      const target=w.colonies.find(c=>c.id===fleet.to);
      if(!target) {fleet.count=0;continue;}
      if(paused) {motions.push({fleet,x0:fleet.x,y0:fleet.y,x1:fleet.x,y1:fleet.y,arrival:null,moving:false});continue;}
      const step=fleetSpeed(fleet)*TICK;
      const dx=target.x-fleet.x,dy=target.y-fleet.y,d=Math.hypot(dx,dy);
      if(d<=step+1e-9) motions.push({fleet,x0:fleet.x,y0:fleet.y,x1:target.x,y1:target.y,arrival:target,moving:d>1e-9});
      else motions.push({fleet,x0:fleet.x,y0:fleet.y,x1:fleet.x+dx/d*step,y1:fleet.y+dy/d*step,arrival:null,moving:true});
    }
    const clashed=this.resolveRoadClashes(motions);
    for(const motion of motions) {
      if(w.status!=='playing') break;
      if(clashed.has(motion.fleet.id)) continue; // contact already placed and paused this fleet
      motion.fleet.x=motion.x1;motion.fleet.y=motion.y1;
      if(motion.arrival) this.reach(motion.fleet,motion.arrival);
    }
  }
  /**
   * Hostile fleets sharing a road meet automatically, in first-contact time order.
   * Simultaneous contacts use one snapshot, so a multi-way fight never depends on
   * fleet array order or owner order. Stopped trajectories stay stopped for this tick. Both sides use BOTH races' attack and defense (no
   * first-attacker bonus), hold position briefly, then continue their remaining itinerary.
   *
   * A fleet's attack is counted exactly ONCE: when several hostile fleets touch it at the
   * same time its fire is split over them in proportion to their strength, so a three-way
   * encounter never lets a fleet fight every opponent with its full army at once.
   */
  private resolveRoadClashes(motions:Motion[]):Set<number> {
    const w=this.world;
    interface Contact { a:Motion; b:Motion; t:number }
    const roadKey=(f:Fleet)=>f.from<f.to?`${f.from}\u0000${f.to}`:`${f.to}\u0000${f.from}`;
    const stopped=new Map<number,number>();
    const allClashed=new Set<number>();
    const position=(m:Motion,t:number)=>{
      const at=Math.min(t,stopped.get(m.fleet.id)??1);
      return {x:m.x0+(m.x1-m.x0)*at,y:m.y0+(m.y1-m.y0)*at};
    };
    let time=0;
    while(true) {
      const candidates:Contact[]=[];
      for(let i=0;i<motions.length;i++) for(let j=i+1;j<motions.length;j++) {
        const a=motions[i],b=motions[j];
        if(a.fleet.owner===b.fleet.owner) continue;
        const movingA=a.moving&&!stopped.has(a.fleet.id),movingB=b.moving&&!stopped.has(b.fleet.id);
        // Held groups do not exchange again, but a moving reinforcement can join them.
        if(!movingA&&!movingB) continue;
        if(!a.fleet.from||!a.fleet.to||roadKey(a.fleet)!==roadKey(b.fleet)) continue;
        if(!(a.fleet.count>1e-9)||!(b.fleet.count>1e-9)) continue;
        const pa=position(a,time),pb=position(b,time);
        const rx=pa.x-pb.x,ry=pa.y-pb.y;
        const dx=(movingA?a.x1-a.x0:0)-(movingB?b.x1-b.x0:0);
        const dy=(movingA?a.y1-a.y0:0)-(movingB?b.y1-b.y0:0);
        const distance=rx*rx+ry*ry-ROAD_CLASH.radius*ROAD_CLASH.radius;
        let dt=0;
        if(distance>1e-9) {
          const speed=dx*dx+dy*dy,dot=rx*dx+ry*dy;
          const discriminant=dot*dot-speed*distance;
          if(speed<=1e-12||dot>=0||discriminant<0) continue;
          dt=(-dot-Math.sqrt(discriminant))/speed;
          if(dt>1-time+1e-9) continue;
        }
        candidates.push({a,b,t:Math.min(1,time+dt)});
      }
      if(!candidates.length) break;
      time=Math.min(...candidates.map(c=>c.t));
      // Only simultaneous, reachable contacts share fire. Later contacts are recomputed
      // after casualties and trajectory truncation, never from the predicted full path.
      const contacts=candidates.filter(c=>Math.abs(c.t-time)<=1e-9);
      // Damage is accumulated from the pre-clash snapshot, then applied once per fleet.
      const incoming=new Map<Fleet,Map<number,number>>();
      const totalIncoming=new Map<Fleet,number>();
      const contactAt=new Map<number,{motion:Motion;t:number}>();
      const hit=new Map<number,Set<number>>();
      // Every fleet the snapshot knows about, plus who it is actually touching this tick.
      const known=new Map<number,Fleet>();
      const opposing=new Map<number,Set<number>>();
      for(const {a,b} of contacts) {
        known.set(a.fleet.id,a.fleet);known.set(b.fleet.id,b.fleet);
        for(const [self,other] of [[a,b],[b,a]] as const) {
          const set=opposing.get(self.fleet.id)??new Set<number>();
          set.add(other.fleet.id);opposing.set(self.fleet.id,set);
        }
      }
      /** Share of an attacker's army facing one opponent: split only when fire is divided. */
      const share=(attacker:Fleet,target:Fleet):number=>{
        const others=opposing.get(attacker.id);
        if(!others||others.size<2) return 1;
        let total=0;
        for(const id of [...others].sort((a,b)=>a-b)) total+=Math.max(0,known.get(id)?.count??0);
        // A full army never disappears into a division by zero; fall back to an even split.
        return total>1e-9?Math.max(0,target.count)/total:1/others.size;
      };
      const addDamage=(target:Fleet,attacker:number,amount:number)=>{
        const byOwner=incoming.get(target)??new Map<number,number>();
        byOwner.set(attacker,(byOwner.get(attacker)??0)+amount);
        incoming.set(target,byOwner);
        totalIncoming.set(target,(totalIncoming.get(target)??0)+amount);
      };
      const link=(first:number,second:number)=>{
        const others=hit.get(first)??new Set<number>();
        others.add(second);hit.set(first,others);
      };
      for(const {a,b,t} of contacts) {
        const raceA=raceOf(a.fleet.race),raceB=raceOf(b.fleet.race);
        addDamage(b.fleet,a.fleet.owner,a.fleet.count*raceA.attack*share(a.fleet,b.fleet)/raceB.defense);
        addDamage(a.fleet,b.fleet.owner,b.fleet.count*raceB.attack*share(b.fleet,a.fleet)/raceA.defense);
        link(a.fleet.id,b.fleet.id);link(b.fleet.id,a.fleet.id);
        for(const motion of [a,b]) {
          const known=contactAt.get(motion.fleet.id);
          if(!known||t<known.t) contactAt.set(motion.fleet.id,{motion,t});
        }
      }
      // Connected clashing fleets share a road; resolve each connected group as one encounter.
      const groups:number[][]=[];
      const seen=new Set<number>();
      for(const id of [...contactAt.keys()].sort((a,b)=>a-b)) {
        if(seen.has(id)) continue;
        const group:number[]=[];const queue=[id];seen.add(id);
        while(queue.length) {
          const current=queue.shift()!;group.push(current);
          for(const next of hit.get(current)??[]) if(!seen.has(next)) {seen.add(next);queue.push(next);}
        }
        groups.push(group.sort((a,b)=>a-b));
      }
      const losses=new Map<number,number>();
      const clashed=new Set<number>();
      for(const group of groups) for(const id of group) {
        const entry=contactAt.get(id)!;
        const fleet=entry.motion.fleet;
        const total=totalIncoming.get(fleet)??0;
        const loss=Math.min(fleet.count,Math.max(0,total));
        const motion=entry.motion;
        const point=position(motion,entry.t);
        fleet.x=point.x;fleet.y=point.y;
        fleet.count=safe(fleet.count-loss);
        fleet.combatPause=ROAD_CLASH.pause;
        losses.set(id,loss);clashed.add(id);
      }
      for(const group of groups) {
        let amount=0;
        for(const id of group) {
          const fleet=contactAt.get(id)!.motion.fleet;
          const loss=losses.get(id)??0;
          amount+=loss;
          if(!(loss>0)) continue;
          if(fleet.owner===1) {w.stats.casualties=(w.stats.casualties??0)+loss;continue;}
          const total=totalIncoming.get(fleet)??0;
          const byPlayer=incoming.get(fleet)?.get(1)??0;
          if(byPlayer>0&&total>0) w.stats.kills+=loss*byPlayer/total;
        }
        const anchor=contactAt.get(group[0])!;
        const motion=anchor.motion;
        const point=position(motion,anchor.t);
        w.events.push({type:'clash',owner:0,x:point.x,y:point.y,amount});
      }
      for(const id of clashed) {
        if(!stopped.has(id)) stopped.set(id,time);
        allClashed.add(id);
      }
    }
    return allClashed;
  }
  /**
   * Fleet reaches the next stop of its itinerary.
   * Friendly stop with an itinerary: pass through without touching the garrison, unless the
   * next leg is no longer legal — then halt and merge here instead of attacking a surprise
   * hostile stop. Hostile stop: normal arrival combat, and the itinerary ends even on capture.
   */
  private reach(f:Fleet,c:Colony):void {
    const w=this.world;
    w.events.push({type:'impact',x:c.x,y:c.y,owner:f.owner,amount:f.count});
    if(c.owner===f.owner) {
      const route=f.route;
      if(route&&route.length) {
        const next=w.colonies.find(x=>x.id===route[0]);
        // A middle stop must still be ours; the FINAL order target may have any owner (a hostile
        // or neutral final colony is exactly what the order was sent to attack).
        const final=route.length===1;
        if(next&&hasRoad(w.roads,c.id,next.id)&&(final||next.owner===f.owner)) {
          f.from=c.id;f.to=next.id;
          const rest=route.slice(1);
          if(rest.length) f.route=rest;else delete f.route;
          // Wind is re-evaluated at every departure, so a boost never carries into a second leg.
          if(c.kind==='wind') f.haste=BATTLE_RULES.windSpeedMultiplier;else delete f.haste;
          f.x=c.x;f.y=c.y;
          return;
        }
        c.units=safe(c.units+f.count);f.count=0;delete f.route;
        return;
      }
      c.units=safe(c.units+f.count);f.count=0;
      return;
    }
    const old=c.owner,attack=raceOf(f.race).attack,defense=this.race(old).defense;
    const strength=f.count*attack-c.units*defense;
    if(strength>1e-9) {
      const lost=c.units*defense/attack;this.casualties(f.owner,old,c.units,lost);
      c.units=strength/attack;c.owner=f.owner;
      if(f.owner===1) w.stats.captures++;
      if(old===1) w.stats.lost++;
      w.events.push({type:'capture',owner:f.owner,x:c.x,y:c.y,amount:c.units});
      this.grantBroodBonus(f,c,old);
      // A capture objective ends the battle the instant the player takes the marked colony.
      // Nothing later in this same tick (an enemy arrival, a skill, the AI) may undo it.
      if(f.owner===1&&w.objective?.type==='capture'&&c.id===w.objective.target) this.finish('won');
    } else {const killed=Math.min(c.units,f.count*attack/defense);c.units=Math.max(0,c.units-killed);this.casualties(f.owner,old,killed,f.count);}
    f.count=0;
  }
  /**
   * Brood expansion reward: the first capture of a NEUTRAL production colony (nest or
   * hatchery) adds troops on top of the surviving force, so it may legitimately exceed the
   * production cap. Recaptures of an already-owned colony never pay again.
   */
  private grantBroodBonus(f:Fleet,c:Colony,previousOwner:number):void {
    if(previousOwner!==0||f.race!=='brood'||!isProductive(c.kind)||this.broodBonuses.has(c.id)) return;
    this.broodBonuses.add(c.id);
    c.units=safe(c.units+BATTLE_RULES.broodCaptureBonus);
    this.world.events.push({type:'brood',owner:c.owner,x:c.x,y:c.y,amount:BATTLE_RULES.broodCaptureBonus});
  }
  private casualties(attacker:number,defender:number,killed:number,lost:number):void {
    const stats=this.world.stats;
    if(attacker===1) {
      if(defender>1) stats.kills+=killed;
      stats.casualties=(stats.casualties??0)+lost;
    } else if(defender===1) {
      stats.casualties=(stats.casualties??0)+killed;
      if(attacker>1) stats.kills+=lost;
    }
  }
  private finish(status:'won'|'lost'):void {
    const w=this.world;
    if(w.status!=='playing') return;
    w.status=status;
    w.events.push({type:'end',owner:status==='won'?1:0,x:800,y:450});
  }
  private checkEnd():void {
    const w=this.world;
    if(w.status!=='playing') return;
    const alive=(owner:number)=>w.colonies.some(c=>c.owner===owner)||w.fleets.some(f=>f.owner===owner&&f.count>0);
    const enemies=w.colonies.some(c=>c.owner>1)||w.fleets.some(f=>f.owner>1&&f.count>0);
    // A capture objective is a win condition, not a loss condition: an enemy holding the
    // marked colony from the start only means the player still has to take it.
    const captured=w.objective?.type==='capture'&&w.colonies.some(c=>c.id===w.objective!.target&&c.owner===1);
    if(!alive(1)) this.finish('lost');else if(captured||!enemies) this.finish('won');
  }
}
export function rateVictory(time:number,lost:number,par:number):number {
  const baseline=Number.isFinite(par)&&par>0?par:120;
  const score=safe(time,baseline*4)/baseline+Math.floor(safe(lost,1000))*0.5;
  return score<=0.8?5:score<=1.2?4:score<=1.8?3:score<=2.6?2:1;
}
