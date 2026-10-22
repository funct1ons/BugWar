import Phaser from 'phaser';
import { Simulation } from '../core/Simulation';
import { formatUnits } from '../ui/format';
import type { Colony, Difficulty, GameEvent, LevelConfig, RaceId } from '../core/types';

export const COLORS=[0x949a90,0x8ed8a7,0xdd9479,0xb5a1d0,0xd7b46b];
export const HEX=['#949a90','#8ed8a7','#dd9479','#b5a1d0','#d7b46b'];
const colonyLabel=(c:Pick<Colony,'owner'|'kind'>)=>`${c.owner===1?'己方':c.owner===0?'中立':'敌方'} · ${c.kind==='nest'?'生产巢':'炮塔'}`;
// A light faction glaze preserves the material and engraving of the insect artwork.
const UNIT_TINTS=COLORS.map(c=>{const mix=(v:number)=>Math.round(255*.54+v*.46);return(mix((c>>16)&255)<<16)|(mix((c>>8)&255)<<8)|mix(c&255);});
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
 showMenu(){if(!this.ready)return;this.clearBoard();this.sim=null;this.level=null;this.paused=false;this.game.canvas.style.cursor='default';this.bg.setTexture('bg-roots');
  for(let i=0;i<8;i++){const s=this.add.sprite(0,0,'bug-agile',0).setScale(.58).setTint(0xc0b692).setAlpha(.23).setDepth(3);this.menuBugs.push(s);}
 }
 start(level:LevelConfig,race:RaceId,difficulty:Difficulty){this.clearBoard();this.level=level;this.sim=new Simulation(level,race,difficulty);this.selected.clear();this.paused=false;this.skillArmed=false;this.notified=false;this.bg.setTexture(`bg-${level.biome}`);
  for(const c of this.sim.world.colonies){
   const image=this.add.image(c.x,c.y-9,c.kind).setDisplaySize(c.kind==='nest'?125:116,c.kind==='nest'?125:116).setDepth(7);
   const number=this.add.text(c.x,c.y+53,String(Math.floor(c.units)),{fontFamily:'Georgia, serif',fontSize:'24px',color:'#eee7ce',stroke:'#101b19',strokeThickness:2}).setResolution(2).setOrigin(.5).setDepth(13);
   const badge=this.add.text(c.x,c.y-66,colonyLabel(c),{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'13px',color:'#e7e0c2',stroke:'#11221f',strokeThickness:2,letterSpacing:1}).setResolution(2).setOrigin(.5).setDepth(12);
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
 private renderMenu(){for(let i=0;i<this.menuBugs.length;i++){const angle=this.clock*.025+i*.84;const b=this.menuBugs[i];b.setPosition(1180+Math.cos(angle)*320,540+Math.sin(angle)*240).setRotation(angle+Math.PI/2).setFrame(Math.floor(this.clock*6+i)%4);}this.ambient();
 }
 private renderColonies(){const g=this.ground;for(const c of this.sim!.world.colonies){const v=this.views.get(c.id)!;const color=COLORS[c.owner];const selected=this.selected.has(c.id);
  // Contact shadow and a fine ownership rim keep the architecture's material colour.
  g.fillStyle(0x020a0a,.28);g.fillEllipse(c.x+4,c.y+33,118,31);g.fillStyle(0x020a0a,.12);g.fillEllipse(c.x,c.y+30,140,45);
  g.fillStyle(color,c.owner===0?.035:.055);g.fillEllipse(c.x,c.y+18,136,82);
  g.lineStyle(selected?1.8:1,color,selected?.82:.34);g.strokeEllipse(c.x,c.y+20,130,78);
  if(selected){g.lineStyle(1,0xd0bb82,.58);g.strokeEllipse(c.x,c.y+20,145,92);for(const sign of [-1,1]){g.lineBetween(c.x+sign*77,c.y+17,c.x+sign*85,c.y+17);g.lineBetween(c.x-3,c.y+20+sign*49,c.x+3,c.y+20+sign*49);}}
  const fx=c.x+60,fy=c.y-39,wave=this.reducedMotion?0:Math.sin(this.clock*2.1+c.x)*1.3;
  g.lineStyle(1.3,0xbba66f,.82);g.lineBetween(fx,fy-29,fx,fy+21);g.fillStyle(0xd7c491,.85);g.fillCircle(fx,fy-31,1.8);
  g.fillStyle(color,.92);g.fillPoints([{x:fx+1,y:fy-28},{x:fx+23,y:fy-24+wave},{x:fx+19,y:fy-16+wave},{x:fx+1,y:fy-12}],true);
  g.lineStyle(.7,0xe7e0c2,.36);g.lineBetween(fx+3,fy-25,fx+18,fy-22+wave);
  // Brass-edged field label rather than a floating cartoon bubble.
  g.fillStyle(0x101e1c,.94);g.fillRoundedRect(c.x-35,c.y+37,70,32,4);g.lineStyle(.8,selected?0xbfa165:color,selected?.8:.42);g.strokeRoundedRect(c.x-35,c.y+37,70,32,4);
  g.lineStyle(.7,0xc7b88c,.26);g.lineBetween(c.x-27,c.y+40,c.x+27,c.y+40);
  const text=formatUnits(c.units);if(v.number.text!==text)v.number.setText(text);v.badge.setAlpha(selected?1:.96);
  if(c.kind==='cannon'&&selected){g.lineStyle(1,color,.12);g.strokeCircle(c.x,c.y,200);}
  if(v.owner!==c.owner){v.owner=c.owner;v.badge.setText(colonyLabel(c));v.image.setAlpha(.55);this.tweens.add({targets:v.image,alpha:1,duration:700});}
 }}
 private renderFleets(){const w=this.sim!.world;const alive=new Set(w.fleets.map(f=>f.id));for(const[id,list]of this.bugs)if(!alive.has(id)){list.forEach(s=>s.destroy());this.bugs.delete(id);}let total=0;
  for(const f of w.fleets){const source=w.colonies.find(c=>c.id===f.from)!;const target=w.colonies.find(c=>c.id===f.to)!;const angle=Math.atan2(target.y-source.y,target.x-source.x);const count=Math.min(36,Math.ceil(f.count),Math.max(0,1000-total));total+=count;
   let sprites=this.bugs.get(f.id);if(!sprites){sprites=[];this.bugs.set(f.id,sprites);}while(sprites.length<count)sprites.push(this.add.sprite(f.x,f.y,`bug-${f.race}`,0).setDepth(9).setTint(UNIT_TINTS[f.owner]));while(sprites.length>count)sprites.pop()!.destroy();
   this.ground.lineStyle(.8,COLORS[f.owner],f.owner===1?.13:.075);this.ground.lineBetween(source.x,source.y,target.x,target.y);
   const traveled=Math.hypot(f.x-source.x,f.y-source.y);
   sprites.forEach((s,i)=>{const row=Math.floor(i/4);const side=(i%4-1.5)*8+(f.id%7-3)*4;const trail=Math.min(Math.max(0,traveled-18),row*9+(f.id%5)*3);const wave=this.reducedMotion?0:Math.sin(this.clock*19+i)*1.4;const x=f.x-Math.cos(angle)*trail-Math.sin(angle)*(side+wave),y=f.y-Math.sin(angle)*trail+Math.cos(angle)*(side+wave);s.setPosition(x,y).setRotation(angle+Math.PI/2).setFrame(Math.floor(this.clock*12+i)%4).setScale(f.race==='strong'?.64:.54);});
   if(f.count>36){this.ground.fillStyle(COLORS[f.owner],.65);this.ground.fillCircle(f.x,f.y,4);}
  }this.visualUnits=total;
 }
 private renderEffects(dt:number){const g=this.top;this.fx=this.fx.filter(f=>f.age<f.life);for(const f of this.fx){f.age+=dt;const p=Math.min(1,f.age/f.life),a=1-p,e=f.event,color=COLORS[e.owner]??0xc9b98b;
  if(e.type==='shot'){
   const tx=e.targetX??e.x,ty=e.targetY??e.y,travel=Math.min(1,p*2.5),px=e.x+(tx-e.x)*travel,py=e.y-22+(ty-e.y+22)*travel;
   if(travel<1){g.lineStyle(1.1,0xdbbd7c,a*.7);g.lineBetween(e.x+(px-e.x)*.76,e.y-22+(py-e.y+22)*.76,px,py);g.fillStyle(0xcda96b,.16);g.fillCircle(px,py,7);g.fillStyle(0xf1e4bc,.92);g.fillCircle(px,py,2.2);}
   else {g.lineStyle(1,0xc3aa78,a*.6);g.strokeCircle(tx,ty,3+p*9);for(let i=0;i<4;i++){const angle=i*1.7+p;g.fillStyle(0xdcc391,a*.7);g.fillCircle(tx+Math.cos(angle)*p*13,ty+Math.sin(angle)*p*11,1.2);}}
  }else if(e.type==='skill'){
   const radius=135*Math.min(1,p*2.8);g.fillStyle(0x99b99f,a*.065);g.fillCircle(e.x,e.y,radius);g.lineStyle(1.3,0xc2d0af,a*.6);g.strokeCircle(e.x,e.y,radius);g.lineStyle(.7,0xbba575,a*.42);g.strokeCircle(e.x,e.y,Math.max(0,radius-7));
   for(let i=0;i<(this.reducedMotion?10:26);i++){const theta=i*2.399+p*3.2,r=20+((i*17+p*85)%113),x=e.x+Math.cos(theta)*r,y=e.y+Math.sin(theta)*r;g.lineStyle(.7,i%3?0xa7c3a9:0xd7bf88,a*.4);g.lineBetween(x,y,x-Math.cos(theta+.5)*9,y-Math.sin(theta+.5)*9);g.fillStyle(i%3?0xc7d7b9:0xe4d4a5,a*.9);g.fillEllipse(x,y,3.2,1.7);}
  }else if(e.type==='capture'){
   g.lineStyle(1.3,color,a*.65);g.strokeEllipse(e.x,e.y+18,104+p*48,63+p*30);g.lineStyle(.7,0xc9b37d,a*.5);g.strokeEllipse(e.x,e.y+18,115+p*55,70+p*33);
   for(let i=0;i<(this.reducedMotion?4:10);i++){const angle=i*2.4,r=20+i%3*12,x=e.x+Math.cos(angle)*r,y=e.y+15+Math.sin(angle)*r*.45-p*(35+i%4*8);g.fillStyle(0xe6d5a9,a*.7);g.fillEllipse(x,y,1.5,3.5);}
  }else {g.lineStyle(1,color,a*.55);g.strokeEllipse(e.x,e.y+15,40+p*45,22+p*26);for(let i=0;i<4;i++){const angle=i*Math.PI/2+.7;g.fillStyle(color,a*.65);g.fillCircle(e.x+Math.cos(angle)*(13+p*19),e.y+Math.sin(angle)*(10+p*15),1.5*a);}}
 }}
 private renderInput(){const g=this.top,p=this.input.activePointer;if(this.paused)return;if(this.skillArmed){this.game.canvas.style.cursor='crosshair';g.fillStyle(0x8fe8b8,.12);g.fillCircle(p.x,p.y,135);g.lineStyle(2,0xdaf5c7,.8);g.strokeCircle(p.x,p.y,135);return;}
  const hover=this.hit(p.x,p.y);this.game.canvas.style.cursor=hover?'pointer':'default';if(hover){g.lineStyle(2,0xf5e0a5,.55);g.strokeEllipse(hover.x,hover.y+15,145,98);}
  if(this.drag?.active&&!this.drag.source){const x=Math.min(this.drag.x,p.x),y=Math.min(this.drag.y,p.y),w=Math.abs(p.x-this.drag.x),h=Math.abs(p.y-this.drag.y);g.fillStyle(0xa2f4c1,.07);g.fillRect(x,y,w,h);g.lineStyle(1,0xbcf5d2,.8);g.strokeRect(x,y,w,h);}
  const preview=this.drag?.source&&!this.selected.has(this.drag.source)?new Set([this.drag.source]):this.selected;
  if(preview.size&&p.y>160&&p.y<780&&(hover||this.drag?.source)){for(const id of preview){const c=this.sim!.world.colonies.find(c=>c.id===id);if(!c||c===hover)continue;const tx=hover?.x??p.x,ty=hover?.y??p.y;g.lineStyle(2,0xe9d391,.6);const a=Math.atan2(ty-c.y,tx-c.x);g.lineBetween(c.x+Math.cos(a)*65,c.y+Math.sin(a)*65,tx-Math.cos(a)*70,ty-Math.sin(a)*70);const ex=tx-Math.cos(a)*72,ey=ty-Math.sin(a)*72;g.fillStyle(0xe9d391,.9);g.fillTriangle(ex,ey,ex-Math.cos(a-.55)*13,ey-Math.sin(a-.55)*13,ex-Math.cos(a+.55)*13,ey-Math.sin(a+.55)*13);}}
 }
 private ambient(){if(this.reducedMotion)return;const g=this.top,count=this.level?.biome==='marsh'?22:12;for(let i=0;i<count;i++){const x=(i*177+Math.sin(this.clock*.13+i)*23)%1550+25,y=185+(i*87)%560+Math.sin(this.clock*.24+i*2)*15,alpha=.12+Math.sin(this.clock*.7+i)*.08;g.fillStyle(0xc4be8c,alpha*.2);g.fillCircle(x,y,5);g.fillStyle(i%3?0xd9c591:0xabc3aa,alpha);g.fillCircle(x,y,.9+i%2*.35);}}
}
