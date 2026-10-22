import { RACES, type RaceId, type Difficulty, type LevelConfig, type World, type GameEvent, type Fleet, type Colony } from './types';
import { think, THINK_INTERVAL } from './ai';
const TICK=0.05;
const safe=(n:number,fallback=0)=>Number.isFinite(n)?Math.max(0,Math.min(1e12,n)):fallback;
export class Simulation {
  world:World;
  public readonly openingGrace:number;
  private accumulator=0;
  private nextFleet=1;
  private aiClock=0;
  private shots=new Map<string,number>();
  constructor(level:LevelConfig,race:RaceId='agile',private difficulty:Difficulty='normal') {
    this.openingGrace=safe(level.openingGrace?.[difficulty]??0);
    this.world={elapsed:0, colonies:level.colonies.map(c=>({...c,x:safe(c.x),y:safe(c.y),units:safe(c.units),production:c.kind==='cannon'?0:safe(c.production ?? 1)})), factions:level.factions.map(f=>({...f,race:f.id===1?race:f.race})),fleets:[],energy:{},status:'playing',stats:{sent:0,kills:0,captures:0,lost:0,skills:0,casualties:0},events:[]};
    for(const f of this.world.factions) this.world.energy[f.id]=0;
  }
  private race(owner:number) { return RACES[this.world.factions.find(f=>f.id===owner)?.race ?? 'agile']; }
  drainEvents():GameEvent[] { return this.world.events.splice(0); }
  dispatch(sources:string[],target:string,ratio=0.5,owner=1):number {
    const w=this.world,t=w.colonies.find(c=>c.id===target);
    if(w.status!=='playing'||!t||owner<=0||!Number.isFinite(ratio)||ratio<=0) return 0;
    ratio=Math.min(1,ratio);
    let sent=0;
    for(const id of new Set(sources)) {
      const c=w.colonies.find(c=>c.id===id);
      if(!c||c===t||c.owner!==owner) continue;
      c.units=safe(c.units);
      const n=Math.min(Math.floor(c.units),Math.floor(c.units*ratio+1e-9));
      if(n<1) continue;
      c.units-=n;sent+=n;
      w.fleets.push({id:this.nextFleet++,owner,race:w.factions.find(f=>f.id===owner)?.race??'agile',from:c.id,to:t.id,x:c.x,y:c.y,count:n,initialCount:n});
      w.events.push({type:'dispatch',x:c.x,y:c.y,targetX:t.x,targetY:t.y,owner,amount:n});
    }
    if(owner===1) w.stats.sent+=sent;
    return sent;
  }
  castSkill(owner:number,x:number,y:number):boolean {
    const w=this.world;
    if(w.status!=='playing'||owner<=0||!w.factions.some(f=>f.id===owner)||!Number.isFinite(x)||!Number.isFinite(y)||safe(w.energy[owner])<100) return false;
    w.energy[owner]=0;
    // Reconstructed area pulse: radius 135, removes up to 18 enemy units, never captures.
    for(const c of w.colonies) if(c.owner!==owner&&c.owner!==0&&Math.hypot(c.x-x,c.y-y)<=135) {const n=Math.min(c.units,18);c.units-=n;this.casualties(owner,c.owner,n,0);}
    for(const f of w.fleets) if(f.owner!==owner&&Math.hypot(f.x-x,f.y-y)<=135) {const n=Math.min(f.count,18);f.count-=n;this.casualties(owner,f.owner,n,0);}
    w.fleets=w.fleets.filter(f=>f.count>1e-9);
    if(owner===1) w.stats.skills++;
    w.events.push({type:'skill',owner,x,y,amount:18});this.checkEnd();return true;
  }
  step(dt:number):void {
    if(!Number.isFinite(dt)||dt<=0||this.world.status!=='playing') return;
    // Bound pathological caller deltas to 30 seconds; normal frames retain their remainder.
    this.accumulator+=Math.min(dt,30);
    while(this.accumulator+1e-10>=TICK&&this.world.status==='playing') {this.accumulator-=TICK;this.tick();}
  }
  private tick():void {
    const w=this.world;w.elapsed+=TICK;
    for(const c of w.colonies) {c.units=safe(c.units);if(c.owner>0&&c.kind==='nest') c.units=safe(c.units+safe(c.production)*this.race(c.owner).production*TICK);}
    for(const f of w.factions) w.energy[f.id]=Math.min(100,safe(w.energy[f.id])+TICK*2);
    for(const c of w.colonies.filter(c=>c.kind==='cannon'&&c.owner>0)) {
      let cooldown=(this.shots.get(c.id)??0)-TICK;
      if(cooldown<=0) {
        const enemy=w.fleets.find(f=>f.owner!==c.owner&&f.count>0&&Math.hypot(f.x-c.x,f.y-c.y)<=200);
        if(enemy) {const n=Math.min(enemy.count,2);enemy.count-=n;this.casualties(c.owner,enemy.owner,n,0);w.events.push({type:'shot',owner:c.owner,x:c.x,y:c.y,targetX:enemy.x,targetY:enemy.y,amount:n});cooldown=0.75;}
      }
      this.shots.set(c.id,cooldown);
    }
    for(const f of [...w.fleets].sort((a,b)=>a.id-b.id)) {
      if(f.count<=0) continue;
      const t=w.colonies.find(c=>c.id===f.to);if(!t) {f.count=0;continue;}
      const d=Math.hypot(t.x-f.x,t.y-f.y),move=RACES[f.race].speed*TICK;
      if(d<=move) {f.x=t.x;f.y=t.y;this.arrive(f,t);f.count=0;}
      else {f.x+=(t.x-f.x)*move/d;f.y+=(t.y-f.y)*move/d;}
    }
    w.fleets=w.fleets.filter(f=>f.count>1e-9);
    this.checkEnd();
    this.aiClock+=TICK;
    if(w.status==='playing'&&w.elapsed+1e-9>=this.openingGrace&&this.aiClock+1e-9>=THINK_INTERVAL[this.difficulty]) {
      this.aiClock=0;
      for(const f of w.factions.filter(f=>f.id>=2&&f.id<=4).sort((a,b)=>a.id-b.id)) think(w,f.id,this.difficulty,(s,t,r,o)=>this.dispatch(s,t,r,o));
    }
  }
  private arrive(f:Fleet,c:Colony):void {
    const w=this.world;
    w.events.push({type:'impact',x:c.x,y:c.y,owner:f.owner,amount:f.count});
    if(c.owner===f.owner) {c.units=safe(c.units+f.count);return;}
    const old=c.owner,attack=RACES[f.race].attack,defense=this.race(old).defense;
    const strength=f.count*attack-c.units*defense;
    if(strength>1e-9) {
      const lost=c.units*defense/attack;this.casualties(f.owner,old,c.units,lost);
      c.units=strength/attack;c.owner=f.owner;
      if(f.owner===1) w.stats.captures++;
      if(old===1) w.stats.lost++;
      w.events.push({type:'capture',owner:f.owner,x:c.x,y:c.y,amount:c.units});
    } else {const killed=Math.min(c.units,f.count*attack/defense);c.units=Math.max(0,c.units-killed);this.casualties(f.owner,old,killed,f.count);}
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
  private checkEnd():void {
    const w=this.world;
    const alive=(owner:number)=>w.colonies.some(c=>c.owner===owner)||w.fleets.some(f=>f.owner===owner&&f.count>0);
    const enemies=w.colonies.some(c=>c.owner>1)||w.fleets.some(f=>f.owner>1&&f.count>0);
    if(!alive(1)) w.status='lost';else if(!enemies) w.status='won';
    if(w.status!=='playing') w.events.push({type:'end',owner:w.status==='won'?1:0,x:800,y:450});
  }
}
export function rateVictory(time:number,lost:number,par:number):number {
  const baseline=Number.isFinite(par)&&par>0?par:120;
  const score=safe(time,baseline*4)/baseline+Math.floor(safe(lost,1000))*0.5;
  return score<=0.8?5:score<=1.2?4:score<=1.8?3:score<=2.6?2:1;
}
