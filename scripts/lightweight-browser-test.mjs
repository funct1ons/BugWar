// New rules acceptance: real UI plus separately labelled, controlled simulation fixtures.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const port=Number(process.env.LIGHTWEIGHT_PORT||4185),base=`http://127.0.0.1:${port}`,out='test-results';
await fs.mkdir(out,{recursive:true});
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
const report={passed:false,errors:[],missing:[],external:[],fixtures:[],layouts:[],expectedMusicAborts:[]};
let browser,page;
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(Error(`Server exited ${code}`)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 page=await browser.newPage({viewport:{width:1600,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)report.missing.push(`${r.status()} ${r.url()}`);});
 page.on('requestfailed',r=>{const failure=`${r.url()}: ${r.failure()?.errorText}`;if(/music-/.test(r.url())&&/ERR_ABORTED/.test(failure))report.expectedMusicAborts.push(failure);else report.missing.push(failure);});
 page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))report.external.push(r.url());});
 const ready=()=>page.waitForFunction(()=>window.__BUGWAR__?.scene.ready);
 const point=async(x,y)=>{const box=await page.locator('canvas').boundingBox();return{x:box.x+x*box.width/1600,y:box.y+y*box.height/900};};
 const click=async(x,y,options)=>{const p=await point(x,y);await page.mouse.click(p.x,p.y,options);};
 const clickNode=async id=>{const c=await page.evaluate(id=>window.__BUGWAR__.scene.sim.world.colonies.find(c=>c.id===id),id);await click(c.x,c.y);};
 const clear=()=>click(65,450,{button:'right'});
 await page.goto(`${base}/?test=1`);await ready();
 await page.locator('[data-action=campaign]').first().click();
 assert.equal(await page.locator('.level-card').count(),18);assert.equal(await page.locator('.race-card').count(),4);assert.equal(await page.locator('.race-card:disabled').count(),3);
 report.freshCampaign={levels:18,races:4,lockedRaces:3};
 await page.locator('[data-action=level][data-value="0"]').click();
 await clickNode('a');const sent=await page.evaluate(()=>window.__BUGWAR__.scene.sim.world.stats.sent);await clickNode('d');
 assert.equal(await page.locator('#toast.show').innerText(),'无可用路径');assert.equal(await page.evaluate(()=>window.__BUGWAR__.scene.sim.world.stats.sent),sent);
 await page.waitForTimeout(2300);assert.equal(await page.locator('#toast.show').count(),0,'invalid route toast expires after about two seconds');
 report.blockedRoute={text:'无可用路径',noDebit:true,expires:true};
 // Controlled ownership/resource fixture. Real mouse sends ONE order; actual fixed-step travel is observed.
 await page.evaluate(()=>{const app=window.__BUGWAR__;app.start(0);app.scene.sim.openingGrace=100000;const w=app.scene.sim.world;for(const c of w.colonies){c.production=0;c.owner=c.id==='a'||c.id==='b'?1:c.id==='d'?2:0;c.units=c.id==='a'?80:c.id==='b'?100:0;}app.scene.ratio=.5;});
 report.fixtures.push('Friendly relay: start level1, freeze natural production/AI; a=80,b=100 friendly, d empty enemy. Only input command a→d uses real clicks; simulation travels normally. Not a natural campaign win.');
 await clear();await clickNode('a');const target=await page.evaluate(()=>window.__BUGWAR__.scene.sim.world.colonies.find(c=>c.id==='d'));const targetPoint=await point(target.x,target.y);await page.mouse.move(targetPoint.x,targetPoint.y);await page.waitForTimeout(80);
 await page.screenshot({path:`${out}/lightweight-route-preview.png`});
 await clickNode('d');
 const launched=await page.evaluate(()=>{const w=window.__BUGWAR__.scene.sim.world;return {fleet:w.fleets.find(f=>f.owner===1),source:w.colonies.find(c=>c.id==='a').units,relay:w.colonies.find(c=>c.id==='b').units,sent:w.stats.sent};});
 assert.equal(launched.source,40);assert.equal(launched.relay,100);assert.equal(launched.sent,40);assert.equal(launched.fleet.to,'b');assert.equal(launched.fleet.destination,'d');assert.deepEqual(launched.fleet.route,['d']);
 await page.waitForFunction(()=>window.__BUGWAR__.scene.sim.world.fleets.some(f=>f.owner===1&&f.from==='b'&&f.to==='d'),undefined,{timeout:12000});
 const passing=await page.evaluate(()=>{const w=window.__BUGWAR__.scene.sim.world;return{relay:w.colonies.find(c=>c.id==='b').units,count:w.fleets.find(f=>f.owner===1)?.count,sent:w.stats.sent};});
 assert.deepEqual(passing,{relay:100,count:40,sent:40});
 await page.screenshot({path:`${out}/lightweight-relay.png`});
 await page.waitForSelector('.result-card.won',{timeout:18000});report.relay={...passing,realMouseOrder:true,actualArrival:true};
 // Production cap is a simulation fixture, separate from the preceding moving order.
 report.cap=await page.evaluate(()=>{const app=window.__BUGWAR__;app.start(0);app.scene.sim.openingGrace=100000;app.scene.paused=true;const sim=app.scene.sim,w=sim.world,a=w.colonies.find(c=>c.id==='a');for(const c of w.colonies)c.production=0;a.production=1;a.units=99.98;sim.step(.1);const clamped=a.units;a.units=135;sim.step(1);const over=a.units;const sent=sim.dispatch(['a'],'b',.5);sim.step(1);return{clamped,over,sent,resumed:a.units};});
 assert.equal(report.cap.clamped,100);assert.equal(report.cap.over,135);assert.equal(report.cap.sent,67);assert.ok(Math.abs(report.cap.resumed-69)<1e-6);
 report.fixtures.push('Cap: paused scene, controlled garrison 99.98 then135; explicit Simulation.step and dispatch, not elapsed natural play.');
 // Head-on opposing departures traverse one real road; no artificial clock acceleration.
 await page.evaluate(()=>{const app=window.__BUGWAR__;app.start(0);app.scene.sim.openingGrace=100000;const s=app.scene.sim,w=s.world;for(const c of w.colonies){c.production=0;c.units=0;c.owner=c.id==='a'?1:c.id==='b'||c.id==='d'?2:0;}w.colonies.find(c=>c.id==='a').units=20;w.colonies.find(c=>c.id==='b').units=20;s.dispatch(['a'],'b',1,1);s.dispatch(['b'],'a',1,2);});
 report.fixtures.push('Road clash: equal20 opposing batches on real a–b edge, no production/AI; direct dispatch seeds both sides, then normal time/render.');
 await page.waitForFunction(()=>{const w=window.__BUGWAR__.scene.sim.world;return w.stats.kills>0&&(w.stats.casualties??0)>0;},undefined,{timeout:10000});
 report.clash=await page.evaluate(()=>{const w=window.__BUGWAR__.scene.sim.world;return{kills:w.stats.kills,casualties:w.stats.casualties,captures:w.stats.captures,owners:w.colonies.filter(c=>['a','b'].includes(c.id)).map(c=>c.owner)};});
 assert.equal(report.clash.captures,0);assert.deepEqual(report.clash.owners,[1,2]);assert.ok(report.clash.kills>0&&report.clash.casualties>0);
 await page.screenshot({path:`${out}/lightweight-clash.png`});
 // Real reload of a legacy three-race, thirteen-level save, not only an in-memory object.
 await page.evaluate(()=>{const a=window.__BUGWAR__,old=JSON.parse(JSON.stringify(a.save.data));old.results={agile:{},fast:{1:{stars:4,time:80,lost:0}},strong:{}};for(let id=1;id<=13;id++)old.results.agile[id]={stars:5,time:60,lost:0};old.achievements=['crown','perfection'];old.settings.music=.28;localStorage.setItem('bugwar-verdant-v1',JSON.stringify(old));});
 await page.reload();await ready();
 report.legacy=await page.evaluate(()=>{const a=window.__BUGWAR__;return{version:a.save.data.version,next:a.save.unlocked('agile'),brood:a.save.raceUnlocked('brood'),fast1:a.save.data.results.fast[1].stars,music:a.save.data.settings.music,achievements:a.save.data.achievements,emptyBrood:Object.keys(a.save.data.results.brood).length===0};});
 assert.equal(report.legacy.version,1);assert.equal(report.legacy.next,14);assert.equal(report.legacy.brood,true);assert.equal(report.legacy.fast1,4);assert.equal(report.legacy.music,.28);assert.ok(report.legacy.achievements.includes('crown')&&report.legacy.achievements.includes('perfection'));assert.ok(report.legacy.emptyBrood);
 // Navigation fixture only: unlock remaining levels to inspect every actual layout and new textures.
 await page.evaluate(()=>{const a=window.__BUGWAR__;for(let id=14;id<=18;id++)a.save.data.results.agile[id]={stars:3,time:100,lost:0};});
 for(let i=0;i<18;i++){
  const layout=await page.evaluate(i=>{const a=window.__BUGWAR__;a.start(i);a.scene.paused=true;const s=a.scene,ui=document.getElementById('ui').getBoundingClientRect(),scale=ui.height/900,hud=document.querySelector('.battle-bottom').getBoundingClientRect(),world=s.sim.world;return {level:s.level.id,kinds:[...new Set(world.colonies.map(c=>c.kind))],objective:world.objective??null,missingTextures:world.colonies.filter(c=>!s.textures.exists(`${c.kind}-${c.owner}`)).map(c=>`${c.kind}-${c.owner}`),maxNumberBottom:Math.max(...[...s.views.values()].map(v=>v.number.getBounds().bottom)),hudTop:(hud.top-ui.top)/scale};},i);
  assert.equal(layout.level,i+1);assert.deepEqual(layout.missingTextures,[]);assert.ok(layout.maxNumberBottom<layout.hudTop,`level${i+1} avoids bottom HUD`);report.layouts.push(layout);
 }
 assert.ok(report.layouts.some(l=>l.kinds.includes('hatchery')));assert.ok(report.layouts.some(l=>l.kinds.includes('wind')));assert.ok(report.layouts.filter(l=>l.objective).length>=2);
 await page.evaluate(()=>{const a=window.__BUGWAR__;a.renderCampaign();});
 for(const viewport of [{width:1280,height:720},{width:1366,height:768},{width:1600,height:900}]){
  await page.setViewportSize(viewport);const last=page.locator('.level-card').last();await last.scrollIntoViewIfNeeded();const rect=await last.boundingBox();assert.ok(rect&&rect.x>=-1&&rect.y>=-1&&rect.x+rect.width<=viewport.width+1&&rect.y+rect.height<=viewport.height+1,'last level remains reachable');await page.screenshot({path:`${out}/lightweight-campaign-${viewport.width}.png`});
 }
 await page.setViewportSize({width:1600,height:900});
 await page.locator('[data-action=race][data-value=brood]').click();assert.equal(await page.evaluate(()=>window.__BUGWAR__.race),'brood');
 await page.locator('[data-action=level][data-value="0"]').click();await page.waitForTimeout(350);await page.screenshot({path:`${out}/lightweight-brood.png`});
 const goal=report.layouts.find(l=>l.objective);
 await page.evaluate(index=>{const a=window.__BUGWAR__;a.race='agile';a.start(index);a.scene.sim.openingGrace=100000;const w=a.scene.sim.world;w.colonies.find(c=>c.id===w.objective.target).owner=1;},goal.level-1);
 await page.waitForSelector('.result-card.won');report.captureCore={level:goal.level,target:goal.objective.target,immediateWin:true};report.fixtures.push('Core objective: set only marked target owner to1; normal tick triggers goal victory while other enemies remain. Not natural campaign play.');
 await page.screenshot({path:`${out}/lightweight-core-victory.png`});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.missing,[]);assert.deepEqual(report.external,[]);report.passed=true;
 console.log(JSON.stringify(report,null,2));
}catch(error){report.error=String(error);if(page)await page.screenshot({path:`${out}/lightweight-failure.png`}).catch(()=>{});throw error;}
finally{await fs.writeFile(`${out}/lightweight-browser-report.json`,JSON.stringify(report,null,2));await browser?.close();server.kill();}
