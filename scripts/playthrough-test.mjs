// A visible-state bot operates only real mouse/keyboard/UI controls. No game-state writes.
import { chromium } from '@playwright/test';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const compiled=await build({stdin:{contents:"export {think} from './src/core/ai.ts';export {Simulation} from './src/core/Simulation.ts';export {LEVELS} from './src/data/levels.ts';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'esm',platform:'node'});
const {think,Simulation,LEVELS}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const port=4177,server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
let browser;const report={mode:'real-time normal level 1, UI-only deterministic visible-state pilot',orders:0,skills:0,stateWrites:0};
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
 browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/?test=1`);await page.waitForFunction(()=>window.__BUGWAR__?.scene.ready);await page.locator('[data-action=campaign]').first().click();await page.locator('[data-action=level][data-value="0"]').click();
 const start=Date.now();let final;
 while(Date.now()-start<150000){
  const observed=await page.evaluate(()=>window.__BUGWAR__.scene.sim.world);if(observed.status!=='playing'){final=observed;break;}
  const mirror=new Simulation(LEVELS[0],'agile','normal');mirror.world=observed;mirror.nextFleet=Math.max(0,...observed.fleets.map(f=>f.id))+1;const orders=[];
  think(observed,1,'normal',(sources,target,ratio,owner)=>{const quantised=Math.min(1,Math.ceil(ratio*4)/4);const sent=mirror.dispatch(sources,target,quantised,owner);if(sent)orders.push({sources,target,ratio:quantised});return sent;});
  for(const order of orders){
   await page.locator(`[data-action=ratio][data-value="${order.ratio}"]`).click();await page.mouse.click(50,450,{button:'right'});
   for(const id of order.sources){const source=observed.colonies.find(c=>c.id===id);await page.mouse.click(source.x,source.y);}
   const target=observed.colonies.find(c=>c.id===order.target);await page.mouse.click(target.x,target.y);report.orders++;
  }
  if(observed.energy[1]>=100){const target=observed.colonies.filter(c=>c.owner>1).sort((a,b)=>b.units-a.units)[0];if(target){await page.keyboard.press('a');await page.mouse.click(target.x,target.y);report.skills++;}}
  await page.waitForTimeout(650);
 }
 assert.ok(final,'pilot timeout');report.status=final.status;report.elapsed=final.elapsed;report.stats=final.stats;report.browserErrors=errors;
 await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/10-natural-victory.png'});assert.equal(final.status,'won');assert.deepEqual(errors,[]);report.passed=true;
 await fs.writeFile('test-results/playthrough-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/playthrough-report.json',JSON.stringify({...report,passed:false,error:String(error)},null,2));throw error;}finally{await browser?.close();server.kill();}
