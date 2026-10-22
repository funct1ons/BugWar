// Independent Edge acceptance. Controlled fixtures are explicitly separate from natural input.
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import ts from 'typescript';
// Load independent gameplay constants, not copied UI strings or duplicated balance values.
const loadConstants=async path=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(await fs.readFile(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
const {RACES}=await loadConstants('src/core/types.ts');
const {BATTLE_RULES}=await loadConstants('src/core/rules.ts');
const port=Number(process.env.ROADS_PORT||4182),out='test-results';
await fs.mkdir(out,{recursive:true});
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
const report={passed:false,errors:[],failedRequests:[],checks:[],fixture:'Only explicitly labelled fixture sections mutate world state. Natural first-stage input is not represented as a campaign clear.'};let browser,page;
async function checkCodex(page){
 const rows=[];
 const open=async()=>{const button=page.locator('[data-action="codex"]:visible').last();assert.ok(await button.count(),'visible codex entry point');await button.click();await page.locator('#modal [role="dialog"]').waitFor();};
 const close=async()=>{await page.keyboard.press('Escape');await page.waitForSelector('#modal',{state:'detached'});};
 const time=()=>page.evaluate(()=>window.__BUGWAR__.scene.sim?.world.elapsed);
 const paused=()=>page.evaluate(()=>window.__BUGWAR__.scene.paused);
 const categoryButtons=()=>page.locator('#modal [data-action="codex-tab"]');
 const entryButtons=()=>page.locator('#modal [data-action="codex-entry"]');
 const detail=()=>page.locator('#modal .codex-detail');
 const checkNumber=async(label,value)=>{
  // Match the labelled stat, not an earlier prose mention (e.g. 射程 before 生产 0).
  const stats=await detail().locator('.codex-stat, .codex-fact').evaluateAll(es=>es.map(e=>({label:e.querySelector('span')?.textContent?.trim(),value:e.querySelector('strong, b')?.textContent})));
  const stat=stats.find(s=>new RegExp(`^(?:${label})$`).test(s.label||''));
  const match=stat?.value?.match(/\d+(?:\.\d+)?/);
  assert.ok(match,`numeric ${label} is readable`);assert.equal(Number(match[0]),value,`${label} matches actual gameplay value`);
 };
 // Fresh session, original save: locked races must remain readable, not unlocked.
 const reloadResponse=await page.reload();assert.equal(reloadResponse?.status(),200,'fresh menu document served successfully');await page.waitForFunction(()=>window.__BUGWAR__?.scene.ready);
 assert.equal(await page.evaluate(()=>window.__BUGWAR__.screen),'menu');await open();
 assert.equal(await categoryButtons().count(),3,'race/building/command categories');
 const categories=await categoryButtons().evaluateAll(es=>es.map(e=>({id:e.dataset.value,title:e.textContent.trim()})));
 assert.match(categories.map(c=>c.title).join(' '),/虫族|族群/);assert.match(categories.map(c=>c.title).join(' '),/建筑/);assert.match(categories.map(c=>c.title).join(' '),/指挥/);
 const expectedEntries={races:['race-agile','race-fast','race-strong'],buildings:['building-nest','building-cannon'],command:['command-roads','command-storm','command-ownership','command-controls']};
 const seen=new Set(),contents=[];
 for(const category of categories){
  await page.locator(`[data-action="codex-tab"][data-value="${category.id}"]`).click();
  const entries=await entryButtons().evaluateAll(es=>es.map(e=>({id:e.dataset.value,title:e.textContent.trim(),disabled:e.disabled})));
  assert.deepEqual(entries.map(e=>e.id),expectedEntries[category.id],`all entries in ${category.title}`);
  for(const entry of entries){
   assert.equal(entry.disabled,false,'locked entry is readable');
   await page.locator(`[data-action="codex-entry"][data-value="${entry.id}"]`).click();
   const text=await detail().innerText();assert.ok(text.length>60,`substantive detail for ${entry.id}`);seen.add(entry.id);contents.push({category:category.id,id:entry.id,text});
   const raceId=entry.id.replace(/^race-/,'');
   if(RACES[raceId]){
    const race=RACES[raceId];
    const stats=await detail().locator('.codex-stat').evaluateAll(es=>es.map(e=>({label:e.querySelector('span')?.textContent,value:Number(e.querySelector('strong')?.textContent.match(/\d+(?:\.\d+)?/)?.[0])})));
    for(const [label,key]of [['行军速度','speed'],['攻击倍率','attack'],['防御倍率','defense'],['生产倍率','production']])assert.equal(stats.find(s=>s.label===label)?.value,race[key],`${raceId}: displayed ${label} matches RACES`);
    assert.match(text,/优势|擅长|适合/);assert.match(text,/弱|短板|注意|代价|劣势|局限/);
    if(raceId!=='agile')assert.match(text,/锁定|未解锁/,'locked status readable');
    const art=await detail().locator('.codex-bug-sheet').evaluate(img=>({loaded:img.complete&&img.naturalWidth>0,width:img.clientWidth,windowWidth:img.parentElement.clientWidth,overflow:getComputedStyle(img.parentElement).overflowX}));
    assert.equal(art.loaded,true);assert.equal(art.overflow,'hidden');assert.ok(Math.abs(art.width/art.windowWidth-4)<.15,'sprite sheet is cropped to one of four frames');
   }
   if(/cannon|tower/.test(entry.id)||/炮塔/.test(entry.title)){
    assert.match(text,/不生产|不会生产|生产[^\d]{0,8}0/);await checkNumber('射程|范围',BATTLE_RULES.cannonRange);await checkNumber('单发伤害',BATTLE_RULES.cannonDamage);await checkNumber('射击冷却',BATTLE_RULES.cannonCooldown);
   }
   if(/nest/.test(entry.id)||/生产巢/.test(entry.title))await checkNumber('默认生产',BATTLE_RULES.nestProduction);
   rows.push({category:category.id,entry:entry.id,chars:text.length});
  }
 }
 for(const id of Object.keys(RACES))assert.ok(seen.has(`race-${id}`),`all races include ${id}`);
 const allText=contents.map(c=>c.text).join('\n');
 assert.match(allText,/相邻/);assert.match(allText,/无向|双向/);assert.match(allText,/不会自动|不自动|手动/);assert.match(allText,/25/);assert.match(allText,/50/);assert.match(allText,/75/);assert.match(allText,/100/);assert.match(allText,/取整|整数|向下/);assert.match(allText,/友|增援/);assert.match(allText,/胜|获胜/);
 const storm=contents.find(c=>c.id==='command-storm');assert.ok(storm,'skill documented');await page.locator('[data-action="codex-entry"][data-value="command-storm"]').click();await checkNumber('施放消耗',BATTLE_RULES.skillCost);await checkNumber('作用半径',BATTLE_RULES.skillRadius);await checkNumber('每个目标',BATTLE_RULES.skillDamage);assert.match(storm.text,/不.*(?:占领|归属|所有权)/);
 // Keyboard is exercised through actual Tab/Enter, not DOM event dispatch.
 await categoryButtons().first().click();await categoryButtons().first().focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.codex-shell').getAttribute('data-codex-tab'),'buildings');await page.keyboard.press('ArrowDown');assert.equal(await detail().getAttribute('data-codex-detail'),'building-cannon');await entryButtons().first().focus();await page.keyboard.press('Enter');assert.equal(await detail().getAttribute('data-codex-detail'),'building-nest');await page.keyboard.press('Tab');assert.ok(await page.locator('#modal :focus').count(),'keyboard can navigate dialog');
 for(const viewport of [{width:1280,height:720},{width:1366,height:768},{width:1600,height:900}]){
  await page.setViewportSize(viewport);
  const layout=await page.locator('#modal [role="dialog"]').evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,scrollWidth:document.documentElement.scrollWidth,windowWidth:innerWidth};});
  assert.ok(layout.left>=-1&&layout.top>=-1&&layout.right<=viewport.width+1&&layout.bottom<=viewport.height+1,`codex dialog fits ${viewport.width}`);assert.ok(layout.scrollWidth<=layout.windowWidth+1,'no page horizontal overflow');
  for(const category of categories){
   await page.locator(`[data-action="codex-tab"][data-value="${category.id}"]`).click();
   for(let i=0;i<await entryButtons().count();i++){
   const button=entryButtons().nth(i);await button.scrollIntoViewIfNeeded();await button.focus();await page.keyboard.press('Enter');
   const overflow=await detail().evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(overflow.scroll<=overflow.width+1,'detail has no horizontal overflow');
   const box=await button.boundingBox();assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1,'entry reachable without clipping');
  }
  const scrolling=await page.locator('#modal').evaluate(root=>[...root.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+4&&/auto|scroll/.test(getComputedStyle(e).overflowY)).map(e=>{e.dataset.acceptanceScroll='1';return {height:e.clientHeight,scroll:e.scrollHeight};}));
  for(let i=0;i<scrolling.length;i++){
   const target=page.locator('[data-acceptance-scroll="1"]').nth(i);await target.evaluate(el=>el.scrollTop=0);await target.hover();await page.mouse.wheel(0,420);await page.waitForTimeout(150);assert.ok(await target.evaluate(el=>el.scrollTop>0),'real wheel scrolls overflowing codex');
  }
   await page.screenshot({path:`${out}/codex-${category.id}-${viewport.width}x${viewport.height}.png`});
  }
 }
 await close();
 await page.locator('[data-action="campaign"]').first().click();await open();await close();
 await page.locator('[data-action="level"][data-value="0"]').click();assert.equal(await paused(),false);await open();assert.equal(await paused(),true);
 const frozen=await time();
 for(let i=0;i<await categoryButtons().count();i++){
  await categoryButtons().nth(i).click();for(let j=0;j<await entryButtons().count();j++){await entryButtons().nth(j).click();assert.equal(await paused(),true);}
 }
 await page.waitForTimeout(450);assert.equal(await time(),frozen,'switching all categories/entries never resumes');await close();assert.equal(await paused(),false);await page.waitForTimeout(250);assert.ok(await time()>frozen,'close restores prior running state');
 // Two downs without an intervening up generate a real repeated keydown in Edge.
 await page.keyboard.down('p');assert.equal(await paused(),true);
 const holdTime=await time();await page.keyboard.down('p');await page.waitForTimeout(180);
 assert.equal(await paused(),true,'holding P must not repeatedly toggle pause');assert.equal(await time(),holdTime);assert.equal(await page.evaluate(()=>window.__BUGWAR__.modal),'pause');
 await page.keyboard.up('p');await page.keyboard.press('p');assert.equal(await paused(),false,'a separate second P press resumes');
 // P inside a codex opened from running battle cannot leak to the scene.
 await open();const codexTime=await time();await page.keyboard.press('p');await page.waitForTimeout(180);
 assert.equal(await page.evaluate(()=>window.__BUGWAR__.modal),'codex');assert.equal(await paused(),true);assert.equal(await time(),codexTime);await close();assert.equal(await paused(),false);
 // Natural pause -> keyboard C -> codex -> Escape returns to the existing pause.
 await page.keyboard.press('p');assert.equal(await paused(),true);assert.equal(await page.evaluate(()=>window.__BUGWAR__.modal),'pause');
 const alreadyPaused=await time();await page.keyboard.press('c');assert.equal(await page.evaluate(()=>window.__BUGWAR__.modal),'codex');await page.keyboard.press('p');assert.equal(await paused(),true);assert.equal(await page.evaluate(()=>window.__BUGWAR__.modal),'codex');await categoryButtons().last().click();await page.keyboard.press('Escape');assert.equal(await paused(),true);assert.equal(await page.evaluate(()=>window.__BUGWAR__.modal),'pause');await page.waitForTimeout(250);assert.equal(await time(),alreadyPaused);
 await page.keyboard.press('c');await page.locator('#modal [data-action="close"]').first().click();assert.equal(await paused(),true);assert.equal(await page.evaluate(()=>window.__BUGWAR__.modal),'pause');
 await page.keyboard.press('Escape');assert.equal(await paused(),false);
 assert.equal(await page.evaluate(()=>window.__BUGWAR__.save.data.version),1);assert.equal(await page.evaluate(()=>window.__BUGWAR__.save.raceUnlocked('fast')),false,'reading locked races never unlocks them');
 return {entries:rows,categories,viewports:[1280,1366,1600],pauseKeyboard:{repeatIgnored:true,secondPressResumes:true,codexBlocksP:true},priorPauseInput:'P → C → Escape / close'};
}
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 page=await browser.newPage({viewport:{width:1600,height:900}});page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{if(r.status()>=400)report.failedRequests.push(`${r.status()} ${r.url()}`);});
 await page.goto(`http://127.0.0.1:${port}/?test=1`);await page.waitForFunction(()=>window.__BUGWAR__?.scene.ready);
 await page.locator('[data-action=campaign]').first().click();await page.locator('[data-action=level][data-value="0"]').click();
 const snapshot=()=>page.evaluate(()=>{const s=window.__BUGWAR__.scene,w=s.sim.world;return {paused:s.paused,elapsed:w.elapsed,roads:w.roads,colonies:w.colonies.map(c=>({...c})),fleets:w.fleets.map(f=>({...f})),stats:{...w.stats},selected:[...s.selected]};});
 const click=async(c,options)=>{const b=await page.locator('canvas').boundingBox();await page.mouse.click(b.x+c.x*b.width/1600,b.y+c.y*b.height/900,options);};
 const clear=()=>click({x:80,y:450},{button:'right'});
 const drag=async(a,d)=>{const b=await page.locator('canvas').boundingBox();await page.mouse.move(b.x+a.x*b.width/1600,b.y+a.y*b.height/900);await page.mouse.down();await page.mouse.move(b.x+d.x*b.width/1600,b.y+d.y*b.height/900,{steps:12});await page.mouse.up();};
 let w=await snapshot();assert.ok(Array.isArray(w.roads),'roads required; no implicit complete graph');
 const edge=(a,b)=>w.roads.some(([x,y])=>x===a&&y===b||x===b&&y===a);
 assert.ok(edge('a','b'));assert.ok(!edge('a','d'));
 const a=w.colonies.find(c=>c.id==='a'),b=w.colonies.find(c=>c.id==='b'),d=w.colonies.find(c=>c.id==='d');
 // Timing fixture: suppress AI opening only; normal production and travel continue.
 // No unit/resource/ownership/terminal-state injection. Not a natural balance/clear claim.
 await page.evaluate(()=>window.__BUGWAR__.scene.sim.openingGrace=100000); // labelled timing fixture: suppress AI only
 for(const mode of ['click','drag']){
  await clear();await click(a);const before=await snapshot();
  if(mode==='click')await click(d);else await drag(a,d);
  const after=await snapshot();assert.deepEqual(after.stats,before.stats,`${mode}: illegal order changes no statistics`);assert.equal(after.fleets.filter(f=>f.owner===1).length,0);
  // Normal production may increase units; an illegal order must never deduct them.
  assert.ok(after.colonies.find(c=>c.id==='a').units>=before.colonies.find(c=>c.id==='a').units,`${mode}: illegal order deducted units`);
  assert.equal(await page.locator('#toast.show').isVisible(),true,'illegal order produces new visible toast');const text=await page.locator('#toast.show').innerText();assert.match(text,/相邻|道路|连接|adjacent|road/i,'illegal road order has visible feedback');report.checks.push(`${mode}: illegal a-d rejected without resource/stat debit`);
 }
 await clear();await click(a);await click(b);
 await page.waitForFunction(()=>window.__BUGWAR__.scene.sim.world.fleets.some(f=>f.owner===1&&f.from==='a'&&f.to==='b'));
 for(let i=0;i<12;i++){
  w=await snapshot();for(const f of w.fleets){assert.ok(edge(f.from,f.to),`fleet ${f.from}-${f.to} has actual edge`);const src=w.colonies.find(c=>c.id===f.from),dst=w.colonies.find(c=>c.id===f.to);assert.ok(Math.abs((f.x-src.x)*(dst.y-src.y)-(f.y-src.y)*(dst.x-src.x))<1,'fleet stays on road segment');}
  await page.waitForTimeout(100);
 }
 await page.waitForFunction(()=>window.__BUGWAR__.scene.sim.world.colonies.find(c=>c.id==='b').owner===1,undefined,{timeout:20000});
 const captured=await snapshot();await page.waitForTimeout(2500);assert.equal((await snapshot()).stats.sent,captured.stats.sent,'capture does not automatically forward troops');report.checks.push('real UI a-b capture with AI-grace timing fixture, road travel, no automatic onward dispatch');
 await page.screenshot({path:`${out}/roads-ui-capture-timing-fixture.png`});
 // Ownership/resource fixture for isolated friendly-selection semantics. No clear claim.
 await page.evaluate(()=>{const app=window.__BUGWAR__;app.start(0);const w=app.scene.sim.world;app.scene.sim.openingGrace=100000;for(const c of w.colonies){if(['a','b','d'].includes(c.id)){c.owner=1;c.units=200;}else c.owner=2;}});
 await clear();await click(a);await click(d);
 w=await snapshot();assert.deepEqual(w.selected,['d'],'nonadjacent friendly click reselects it');assert.equal(w.stats.sent,0);
 await clear();await click(a);const reinforcementBefore=await snapshot();await click(b);w=await snapshot();
 assert.ok(w.fleets.some(f=>f.owner===1&&f.from==='a'&&f.to==='b'),'adjacent friendly click reinforces');assert.ok(w.stats.sent>reinforcementBefore.stats.sent);
 // Construct mixed legal/illegal source set from current road graph rather than
 // assuming another particular pair in the final authored topology.
 const mixed=await page.evaluate(()=>{const app=window.__BUGWAR__;app.start(0);app.scene.sim.openingGrace=100000;const w=app.scene.sim.world;
  for(const target of w.colonies){const legal=w.colonies.find(c=>c.id!==target.id&&w.roads.some(([a,b])=>a===c.id&&b===target.id||b===c.id&&a===target.id));const illegal=w.colonies.find(c=>c.id!==target.id&&!w.roads.some(([a,b])=>a===c.id&&b===target.id||b===c.id&&a===target.id));if(!legal||!illegal)continue;
   for(const c of w.colonies){c.owner=c.id===target.id?2:[legal.id,illegal.id].includes(c.id)?1:0;c.units=200;}
   return {legal:{...legal},illegal:{...illegal},target:{...target}};
  }throw Error('No mixed-source topology in stage 1');});
 await clear();await click(mixed.legal);await page.keyboard.down('Shift');await click(mixed.illegal);await page.keyboard.up('Shift');
 const mixedBefore=await snapshot();assert.equal(mixedBefore.selected.length,2);await click(mixed.target);w=await snapshot();
 assert.ok(w.fleets.some(f=>f.from===mixed.legal.id&&f.to===mixed.target.id));assert.ok(!w.fleets.some(f=>f.from===mixed.illegal.id));assert.ok(w.colonies.find(c=>c.id===mixed.illegal.id).units>=mixedBefore.colonies.find(c=>c.id===mixed.illegal.id).units);
 report.checks.push('fixture: friendly adjacent reinforcement, nonadjacent reselect, mixed legal-source filtering');
 assert.equal(await page.locator('#toast.show').isVisible(),true);assert.match(await page.locator('#toast.show').innerText(),/相邻|保留|部分/,'partial dispatch visibly explains skipped sources');
 // AI fixture: fresh stage, no player orders. Accelerated simulation is not a natural completion.
 report.ai=await page.evaluate(()=>{
  const app=window.__BUGWAR__,rows=[];
  for(let i=0;i<13;i++){
   // Unlock fixture: only PREVIOUS stages completed; never forge the stage under test.
   app.save.data.results.agile={};
   for(let previous=1;previous<=i;previous++)app.save.data.results.agile[previous]={stars:3,time:100,lost:0};
   app.start(i);
   if(app.scene.level?.id!==i+1)throw Error(`AI fixture entered ${app.scene.level?.id}, expected ${i+1}`);
   const s=app.scene.sim,w=s.world,ids=new Set();
   for(let j=0;j<1200&&w.status==='playing';j++){
    s.step(.05);
    for(const f of w.fleets){
     if(!w.roads.some(([a,b])=>a===f.from&&b===f.to||b===f.from&&a===f.to))throw Error(`AI illegal edge level ${i+1}: ${f.from}-${f.to}`);
     if(f.owner>1)ids.add(f.id);
    }
    s.drainEvents();
   }
   if(!ids.size)throw Error(`AI fixture observed no enemy fleet in actual level ${app.scene.level.id}`);
   rows.push({level:app.scene.level.id,distinctEnemyFleets:ids.size});
  }
  return rows;
 });
 assert.equal(report.ai.length,13);assert.ok(report.ai.every((r,i)=>r.level===i+1&&r.distinctEnemyFleets>0));
 // Navigation/unlock fixture only: compare actual SVG paths to live world roads
 // and the scene's permanently drawn trimmed lane objects for each actual level.
 report.network=await page.evaluate(()=>{
  const app=window.__BUGWAR__;app.renderCampaign();
  const thumbs=[...document.querySelectorAll('.level-card .minimap')].map(svg=>[...svg.querySelectorAll('path,line')].map(el=>{
   if(el.tagName.toLowerCase()==='line')return ['x1','y1','x2','y2'].map(k=>Number(el.getAttribute(k)));
   const d=el.getAttribute('d')||'';if(!/^\s*M[\d. ,+-]+L[\d. ,+-]+\s*$/i.test(d))throw Error(`Non-straight thumbnail lane: ${d}`);
   return d.match(/[-+]?(?:\d*\.)?\d+/g).map(Number);
  }));
  if(thumbs.length!==13)throw Error(`Expected 13 thumbnails, got ${thumbs.length}`);
  const key=(a,b)=>[a,b].sort().join(':');const rows=[];
  for(let i=0;i<13;i++){
   app.start(i);const scene=app.scene,w=scene.sim.world;
   if(scene.level.id!==i+1)throw Error('Network fixture failed actual level identity');
   const expected=w.roads.map(([a,b])=>key(a,b)).sort();
   const identify=(x,y)=>{const c=w.colonies.find(c=>Math.abs(c.x-x)<.01&&Math.abs(c.y-100-y)<.01);if(!c)throw Error(`Thumbnail endpoint ${x},${y} is not a colony in ${i+1}`);return c.id;};
   const actual=thumbs[i].map(([x1,y1,x2,y2])=>key(identify(x1,y1),identify(x2,y2))).sort();
   if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(`Thumbnail differs from actual roads level ${i+1}`);
   const lanes=scene.roadLanes;
   if(!Array.isArray(lanes)||JSON.stringify(lanes.map(l=>key(l.from,l.to)).sort())!==JSON.stringify(expected))throw Error(`Rendered road lanes differ level ${i+1}`);
   if(!scene.roadBase.visible||!scene.roadBase.commandBuffer.length)throw Error(`No visible road graphics level ${i+1}`);
   for(const lane of lanes){const a=w.colonies.find(c=>c.id===lane.from),b=w.colonies.find(c=>c.id===lane.to);for(const [x,y]of [[lane.x1,lane.y1],[lane.x2,lane.y2]])if(Math.abs((x-a.x)*(b.y-a.y)-(y-a.y)*(b.x-a.x))>1)throw Error('Trimmed road is not on logical fleet path');}
   rows.push({level:scene.level.id,edges:expected.length,thumbnailEdges:actual.length,visibleLanes:lanes.length});
  }
  return rows;
 });
 await page.screenshot({path:`${out}/roads-final-layout.png`});
 // Explicit UI-only fixture: select a friendly cannon and vary its garrison. Not a natural capture or campaign win.
 const selectCannon=async units=>page.evaluate(units=>{
  const app=window.__BUGWAR__;app.start(2);const scene=app.scene;
  scene.paused=true;
  const tower=scene.sim.world.colonies.find(c=>c.kind==='cannon');
  if(!tower)throw Error('No cannon in level 3 fixture');
  tower.owner=1;tower.units=units;scene.selected.clear();scene.selected.add(tower.id);app.updateHUD();
  return tower.id;
 },units);
 report.cannonSelection=[];
 for(const [units,damage,interval]of [[0,'2','0.9'],[20,'4','0.725'],[60,'6','0.5'],[90,'6','0.5']]){
  const id=await selectCannon(units);
  const panel=page.locator('#cannon-selection');await panel.waitFor({state:'visible'});
  const text=await panel.innerText();
  assert.ok(text.includes(damage)&&text.includes(interval),`live cannon ${units}: ${text}`);
  assert.match(text,/60/);
  assert.equal(await panel.locator(`[data-cannon-id="${id}"]`).count(),1);
  report.cannonSelection.push({units,text});
 }
 await page.screenshot({path:`${out}/cannon-selection-cap.png`});
 for(const width of [1280,1366,1600]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(80);
  const box=await page.locator('#cannon-selection').boundingBox();
  assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=901,`cannon panel fits ${width}`);
 }
 await page.setViewportSize({width:1600,height:900});
 await page.evaluate(()=>{const app=window.__BUGWAR__,s=app.scene;const tower=s.sim.world.colonies.find(c=>c.kind==='cannon');s.sim.world.colonies.push({...tower,id:'cannon-panel-fixture',units:20});s.selected.add('cannon-panel-fixture');app.lastHUD=0;app.updateHUD();});
 assert.equal(await page.locator('#cannon-selection [data-cannon-id]').count(),2,'multi-selection presents both towers');
 await page.evaluate(()=>{const app=window.__BUGWAR__;app.scene.selected.clear();app.lastHUD=0;app.updateHUD();});
 assert.equal(await page.locator('#cannon-selection:visible').count(),0,'no empty panel without a selected cannon');
 report.codex=await checkCodex(page);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);report.passed=true;
}catch(e){report.error=String(e);if(page)await page.screenshot({path:`${out}/roads-failure.png`}).catch(()=>{});throw e;}
finally{await fs.writeFile(`${out}/roads-codex-report.json`,JSON.stringify(report,null,2));await browser?.close();server.kill();}
