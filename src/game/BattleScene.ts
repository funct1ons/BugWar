import Phaser from 'phaser';
import { Simulation } from '../core/Simulation';
import { formatUnits } from '../ui/format';
import type { Colony, Difficulty, GameEvent, LevelConfig, RaceId } from '../core/types';

export const COLORS=[0x9aa79b,0x80e5ae,0xf18f75,0xb4a3f3,0xf0c36d];
export const HEX=['#9aa79b','#80e5ae','#f18f75','#b4a3f3','#f0c36d'];
interface ColonyView { image:Phaser.GameObjects.Image; number:Phaser.GameObjects.Text; badge:Phaser.GameObjects.Text; owner:number }
interface Effect { event:GameEvent; age:number; life:number }
export class BattleScene extends Phaser.Scene {
 sim:Simulation|null=null; level:LevelConfig|null=null; selected=new Set<string>(); ratio=.5; paused=false; skillArmed=false; ready=false; reducedMotion=false; fps=60; visualUnits=0;
 onTick:()=>void=()=>{}; onAction:(name:string)=>void=()=>{}; onEnd:(status:string)=>void=()=>{};
 private bg!:Phaser.GameObjects.Image; private ground!:Phaser.GameObjects.Graphics; private top!:Phaser.GameObjects.Graphics;
 private views=new Map<string,ColonyView>(); private bugs=new Map<number,Phaser.GameObjects.Sprite[]>(); private fx:Effect[]=[];
 private drag:{x:number;y:number;source:string|null;active:boolean}|null=null; private clock=0; private notified=false; private menuBugs:Phaser.GameObjects.Sprite[]=[];
 constructor(){super('battle');}
 preload(){ const base=import.meta.env.BASE_URL; for(const biome of ['meadow','roots','marsh','amber'])this.load.svg(`bg-${biome}`,`${base}art/background-${biome}.svg`);for(const name of ['nest','cannon','emblem','bug-agile','bug-fast','bug-strong'])this.load.svg(name,`${base}art/${name}.svg`); }
 create(){
  for(const race of ['agile','fast','strong']){const tex=this.textures.get(`bug-${race}`);for(let i=0;i<4;i++)tex.add(i,0,i*24,0,24,32);}
  this.bg=this.add.image(800,450,'bg-meadow').setDisplaySize(1600,900); this.ground=this.add.graphics().setDepth(1);this.top=this.add.graphics().setDepth(30);
  this.input.mouse?.disableContextMenu();
  this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>this.down(p));this.input.on('pointermove',(p:Phaser.Input.Pointer)=>{if(this.drag&&Phaser.Math.Distance.Between(this.drag.x,this.drag.y,p.x,p.y)>12)this.drag.active=true;});
  this.input.on('pointerup',(p:Phaser.Input.Pointer)=>this.up(p));
  this.input.keyboard?.on('keydown',(e:KeyboardEvent)=>{
   if(!this.sim||this.paused||this.sim.world.status!=='playing')return;
   if(e.code==='Space'){e.preventDefault();this.selectAll();}
   if(e.code==='KeyA'){e.preventDefault();this.armSkill();}
   if(e.code==='Escape'){this.skillArmed=false;this.selected.clear();this.onAction('cancel');}
  });
  this.ready=true;this.showMenu();
 }
 showMenu(){if(!this.ready)return;this.clearBoard();this.sim=null;this.level=null;this.paused=false;this.game.canvas.style.cursor='default';this.bg.setTexture('bg-meadow');
  for(let i=0;i<24;i++){const s=this.add.sprite(0,0,'bug-agile',0).setScale(.75).setTint(i%3?0x93c99d:0xeac589).setAlpha(.6).setDepth(3);this.menuBugs.push(s);}
 }
 start(level:LevelConfig,race:RaceId,difficulty:Difficulty){this.clearBoard();this.level=level;this.sim=new Simulation(level,race,difficulty);this.selected.clear();this.paused=false;this.skillArmed=false;this.notified=false;this.bg.setTexture(`bg-${level.biome}`);
  for(const c of this.sim.world.colonies){
   const image=this.add.image(c.x,c.y-9,c.kind).setDisplaySize(c.kind==='nest'?125:116,c.kind==='nest'?125:116).setDepth(7);
   const number=this.add.text(c.x,c.y+53,String(Math.floor(c.units)),{fontFamily:'Georgia, serif',fontSize:'26px',fontStyle:'bold',color:'#ffffff',stroke:'#12251c',strokeThickness:5}).setOrigin(.5).setDepth(13);
   const badge=this.add.text(c.x,c.y-66,c.kind==='cannon'?'哨戒炮塔':'生产虫巢',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'12px',color:HEX[c.owner],stroke:'#173025',strokeThickness:3,letterSpacing:2}).setOrigin(.5).setDepth(12);
   this.views.set(c.id,{image,number,badge,owner:c.owner});
  }
  this.onTick();
 }
 private clearBoard(){for(const v of this.views.values()){v.image.destroy();v.number.destroy();v.badge.destroy();}this.views.clear();for(const b of this.bugs.values())b.forEach(s=>s.destroy());this.bugs.clear();this.menuBugs.forEach(b=>b.destroy());this.menuBugs=[];this.fx=[];this.drag=null;this.selected.clear();this.ground?.clear();this.top?.clear();}
 selectAll(){if(!this.sim)return;this.selected=new Set(this.sim.world.colonies.filter(c=>c.owner===1).map(c=>c.id));this.onAction('select');this.onTick();}
 armSkill(){if(!this.sim||this.sim.world.energy[1]<100){this.onAction('not-ready');return;}this.skillArmed=!this.skillArmed;this.onAction('select');this.onTick();}
 private hit(x:number,y:number):Colony|undefined{return this.sim?.world.colonies.find(c=>Math.hypot(c.x-x,c.y-y)<68);}
 private down(p:Phaser.Input.Pointer){if(!this.sim||this.paused||this.sim.world.status!=='playing')return;if(p.rightButtonDown()){this.skillArmed=false;this.selected.clear();this.onTick();return;}if(p.y<160||p.y>782)return;
  if(this.skillArmed){if(this.sim.castSkill(1,p.x,p.y)){this.skillArmed=false;this.onAction('cast');}return;}
  const c=this.hit(p.x,p.y);this.drag={x:p.x,y:p.y,source:c?.owner===1?c.id:null,active:false};
 }
 cancelGesture(){this.drag=null;}
 private up(p:Phaser.Input.Pointer){const d=this.drag;this.drag=null;if(!this.sim||this.paused||!d)return;const hit=this.hit(p.x,p.y);const shift=p.event instanceof MouseEvent&&p.event.shiftKey;
  if(d.active){if(d.source&&hit&&hit.id!==d.source){if(!this.selected.has(d.source))this.selected=new Set([d.source]);this.send(hit.id);}else if(!d.source){if(!shift)this.selected.clear();for(const c of this.sim.world.colonies)if(c.owner===1&&c.x>=Math.min(d.x,p.x)&&c.x<=Math.max(d.x,p.x)&&c.y>=Math.min(d.y,p.y)&&c.y<=Math.max(d.y,p.y))this.selected.add(c.id);this.onAction('select');}}
  else if(hit){if(hit.owner===1){if(this.selected.size&&!this.selected.has(hit.id)&&!shift)this.send(hit.id);else if(shift){if(this.selected.has(hit.id))this.selected.delete(hit.id);else this.selected.add(hit.id);this.onAction('select');}else{this.selected=new Set([hit.id]);this.onAction('select');}}else if(this.selected.size)this.send(hit.id);else this.onAction('invalid');}
  else if(!shift)this.selected.clear();this.onTick();
 }
 private send(target:string){const n=this.sim!.dispatch([...this.selected],target,this.ratio,1);this.onAction(n>0?'dispatch':'invalid');this.onTick();}
 update(_time:number,delta:number){this.clock+=Math.min(delta,100)/1000;this.fps=this.game.loop.actualFps;const dt=Math.min(delta/1000,.15);
  this.ground.clear();this.top.clear();
  if(!this.sim){this.renderMenu();return;}
  if(!this.paused){this.sim.step(dt);for(const e of this.sim.drainEvents()){if(e.type!=='dispatch')this.fx.push({event:e,age:0,life:e.type==='skill'?1.8:e.type==='capture'?1.4:.55});if(e.type==='capture'||e.type==='impact'||e.type==='shot')this.onAction(e.type);}}
  for(const id of this.selected)if(this.sim.world.colonies.find(c=>c.id===id)?.owner!==1)this.selected.delete(id);
  this.renderColonies();this.renderFleets();this.renderEffects(this.paused?0:dt);this.renderInput();this.ambient();
  if(this.sim.world.status!=='playing'&&!this.notified){this.notified=true;this.onEnd(this.sim.world.status);}
  this.onTick();
 }
 private renderMenu(){const g=this.ground;for(let i=0;i<this.menuBugs.length;i++){const angle=this.clock*.08+i*.62;const b=this.menuBugs[i];b.setPosition(1120+Math.cos(angle)*250,500+Math.sin(angle)*185).setRotation(angle+Math.PI/2).setFrame(Math.floor(this.clock*8+i)%4);}
  g.lineStyle(1,0xc6aa67,.14);g.strokeCircle(1120,485,245);g.strokeCircle(1120,485,280);this.ambient();
 }
 private renderColonies(){const g=this.ground;for(const c of this.sim!.world.colonies){const v=this.views.get(c.id)!;const color=COLORS[c.owner];const selected=this.selected.has(c.id);
  g.fillStyle(0x020b08,.3);g.fillEllipse(c.x+5,c.y+30,122,43);g.fillStyle(color,c.owner===0?.08:.13);g.fillEllipse(c.x,c.y+15,146,92);
  g.lineStyle(selected?3:1.5,color,selected?.9:.5);g.strokeEllipse(c.x,c.y+18,132,86);
  if(selected){g.lineStyle(1,0xe8d697,.4+Math.sin(this.clock*4)*.2);g.strokeEllipse(c.x,c.y+18,148,102);for(let i=0;i<4;i++){const a=this.clock*.4+i*Math.PI/2;g.fillStyle(0xf6dc94,.8);g.fillCircle(c.x+Math.cos(a)*73,c.y+18+Math.sin(a)*49,3);}}
  // Fabric pennant and pole identify allegiance without flattening the hand-painted structure.
  const fx=c.x+36,fy=c.y-40;g.lineStyle(2,0xd9c692,.85);g.lineBetween(fx,fy-30,fx,fy+18);g.fillStyle(color,.95);g.fillTriangle(fx,fy-30,fx+27,fy-24+Math.sin(this.clock*3+c.x)*2,fx,fy-12);
  g.fillStyle(0x081812,.89);g.fillRoundedRect(c.x-38,c.y+35,76,38,16);g.lineStyle(1,color,.55);g.strokeRoundedRect(c.x-38,c.y+35,76,38,16);
  const text=formatUnits(c.units);if(v.number.text!==text)v.number.setText(text);
  v.image.setScale((c.kind==='nest'?125:116)/160*(1+(this.reducedMotion?0:Math.sin(this.clock*1.8+c.x)*.009)));
  if(c.kind==='cannon'&&selected){g.lineStyle(1,color,.13);g.strokeCircle(c.x,c.y,200);}
  if(v.owner!==c.owner){v.owner=c.owner;v.badge.setColor(HEX[c.owner]);v.image.setAlpha(.4);this.tweens.add({targets:v.image,alpha:1,duration:500});}
 }}
 private renderFleets(){const w=this.sim!.world;const alive=new Set(w.fleets.map(f=>f.id));for(const[id,list]of this.bugs)if(!alive.has(id)){list.forEach(s=>s.destroy());this.bugs.delete(id);}let total=0;
  for(const f of w.fleets){const source=w.colonies.find(c=>c.id===f.from)!;const target=w.colonies.find(c=>c.id===f.to)!;const angle=Math.atan2(target.y-source.y,target.x-source.x);const count=Math.min(36,Math.ceil(f.count),Math.max(0,1000-total));total+=count;
   let sprites=this.bugs.get(f.id);if(!sprites){sprites=[];this.bugs.set(f.id,sprites);}while(sprites.length<count)sprites.push(this.add.sprite(f.x,f.y,`bug-${f.race}`,0).setDepth(9).setTint(COLORS[f.owner]));while(sprites.length>count)sprites.pop()!.destroy();
   this.ground.lineStyle(1,COLORS[f.owner],.12);this.ground.lineBetween(source.x,source.y,target.x,target.y);
   const traveled=Math.hypot(f.x-source.x,f.y-source.y);
   sprites.forEach((s,i)=>{const row=Math.floor(i/4);const side=(i%4-1.5)*8+(f.id%7-3)*4;const trail=Math.min(Math.max(0,traveled-18),row*9+(f.id%5)*3);const wave=this.reducedMotion?0:Math.sin(this.clock*19+i)*1.4;const x=f.x-Math.cos(angle)*trail-Math.sin(angle)*(side+wave),y=f.y-Math.sin(angle)*trail+Math.cos(angle)*(side+wave);s.setPosition(x,y).setRotation(angle+Math.PI/2).setFrame(Math.floor(this.clock*12+i)%4).setScale(f.race==='strong'?.64:.54);});
   if(f.count>36){this.ground.fillStyle(COLORS[f.owner],.65);this.ground.fillCircle(f.x,f.y,4);}
  }this.visualUnits=total;
 }
 private renderEffects(dt:number){const g=this.top;this.fx=this.fx.filter(f=>f.age<f.life);for(const f of this.fx){f.age+=dt;const p=f.age/f.life,a=1-p,e=f.event,color=COLORS[e.owner]??0xe8d89c;
  if(e.type==='shot'){g.lineStyle(3,0xf8d796,a);g.lineBetween(e.x,e.y-24,e.targetX??e.x,e.targetY??e.y);g.fillStyle(0xffe8b3,a);g.fillCircle(e.targetX??e.x,e.targetY??e.y,7*a);}
  else if(e.type==='skill'){g.lineStyle(5,0xd2f7c0,a);g.strokeCircle(e.x,e.y,135*Math.min(1,p*3));g.fillStyle(0x87e6bc,a*.09);g.fillCircle(e.x,e.y,135);for(let i=0;i<36;i++){const theta=i*2.4+p*7,r=25+((i*13+p*110)%115);g.fillStyle(i%2?0xf6d992:0xa4ffc8,a);g.fillEllipse(e.x+Math.cos(theta)*r,e.y+Math.sin(theta)*r,7,3);}}
  else {g.lineStyle(e.type==='capture'?4:2,color,a);g.strokeEllipse(e.x,e.y+15,60+p*155,36+p*85);for(let i=0;i<8;i++){const angle=i*Math.PI/4;g.fillStyle(color,a);g.fillCircle(e.x+Math.cos(angle)*(20+p*60),e.y+Math.sin(angle)*(15+p*40),3*a);}}
 }}
 private renderInput(){const g=this.top,p=this.input.activePointer;if(this.paused)return;if(this.skillArmed){this.game.canvas.style.cursor='crosshair';g.fillStyle(0x8fe8b8,.12);g.fillCircle(p.x,p.y,135);g.lineStyle(2,0xdaf5c7,.8);g.strokeCircle(p.x,p.y,135);return;}
  const hover=this.hit(p.x,p.y);this.game.canvas.style.cursor=hover?'pointer':'default';if(hover){g.lineStyle(2,0xf5e0a5,.55);g.strokeEllipse(hover.x,hover.y+15,145,98);}
  if(this.drag?.active&&!this.drag.source){const x=Math.min(this.drag.x,p.x),y=Math.min(this.drag.y,p.y),w=Math.abs(p.x-this.drag.x),h=Math.abs(p.y-this.drag.y);g.fillStyle(0xa2f4c1,.07);g.fillRect(x,y,w,h);g.lineStyle(1,0xbcf5d2,.8);g.strokeRect(x,y,w,h);}
  const preview=this.drag?.source&&!this.selected.has(this.drag.source)?new Set([this.drag.source]):this.selected;
  if(preview.size&&p.y>160&&p.y<780&&(hover||this.drag?.source)){for(const id of preview){const c=this.sim!.world.colonies.find(c=>c.id===id);if(!c||c===hover)continue;const tx=hover?.x??p.x,ty=hover?.y??p.y;g.lineStyle(2,0xe9d391,.6);const a=Math.atan2(ty-c.y,tx-c.x);g.lineBetween(c.x+Math.cos(a)*65,c.y+Math.sin(a)*65,tx-Math.cos(a)*70,ty-Math.sin(a)*70);const ex=tx-Math.cos(a)*72,ey=ty-Math.sin(a)*72;g.fillStyle(0xe9d391,.9);g.fillTriangle(ex,ey,ex-Math.cos(a-.55)*13,ey-Math.sin(a-.55)*13,ex-Math.cos(a+.55)*13,ey-Math.sin(a+.55)*13);}}
 }
 private ambient(){if(this.reducedMotion)return;const g=this.top;for(let i=0;i<28;i++){const x=(i*177+Math.sin(this.clock*.2+i)*23)%1550+25,y=180+(i*87)%570+Math.sin(this.clock*.4+i*2)*18;g.fillStyle(i%3?0xffe3a1:0xb4ffc1,.16+Math.sin(this.clock+i)*.12);g.fillCircle(x,y,1.4+i%2);}}
}
