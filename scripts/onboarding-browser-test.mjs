// Slow, visible-state stage-2 pilot: real UI input, never advances or rewrites the world.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

await fs.mkdir('test-results',{recursive:true});
const port=Number(process.env.ONBOARDING_PORT||4178);
const server=spawn(process.execPath,['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
let browser;
const report={
 level:2,difficulty:'normal',race:'agile',openingWait:12,commandInterval:4,
 skippedCommandSlots:[3],skills:0,multiselect:false,worldWrites:0,
 fixture:'Only previous stage 1 completion is seeded in localStorage to unlock stage 2. No stage 2 progress, resources, time or terminal state is injected.',
 policy:'Read displayed (floored) current garrisons. Nearest neutral affordable with 50% + 5 reserve margin; otherwise nearest enemy affordable with 75% + 20 margin; otherwise use current owned-subgraph hop distances to the visible frontier; largest rear sends 75% to an adjacent owned building (including cannons) one hop closer, with fixed descending node-ID tie-break among equal-hop neighbours; if no rear can supply, a frontier may merge into an adjacent frontier only in increasing fixed node-ID order, preventing garrison-driven A-B-A reversal. One manual order per slot, never automatic forwarding. No fleet prediction, enemy interception or planner.',
 commands:[],errors:[],failed:[]
};
try{
 await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',c=>reject(Error(`Server exited ${c}`)));});
 browser=await chromium.launch({headless:true,executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 await page.addInitScript(()=>localStorage.setItem('bugwar-verdant-v1',JSON.stringify({version:1,settings:{difficulty:'normal'},results:{agile:{'1':{stars:3,time:100,lost:0}}}})));
 page.on('pageerror',e=>report.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)report.failed.push(`${r.status()} ${r.url()}`);});
 await page.goto(`http://127.0.0.1:${port}/?test=1`);
 await page.waitForFunction(()=>window.__BUGWAR__?.scene.ready);
 // The save key is verified against the live SaveSystem rather than silently skipping locked stages.
 await page.locator('[data-action=campaign]').first().click();
 assert.equal(await page.locator('[data-action=level][data-value="1"]').isEnabled(),true,'previous-stage fixture unlocks only the intended next stage');
 await page.locator('[data-action=level][data-value="1"]').click();
 assert.equal(await page.evaluate(()=>window.__BUGWAR__.save.data.settings.difficulty),'normal');
 assert.equal(await page.evaluate(()=>window.__BUGWAR__.scene.level.id),2,'pilot actually entered stage 2');
 report.startingColonies=await page.evaluate(()=>window.__BUGWAR__.scene.sim.world.colonies.map(({id,owner,units})=>({id,owner,units:Math.floor(units)})));
 report.graceSeconds=await page.evaluate(()=>window.__BUGWAR__.scene.sim.openingGrace);
 await page.screenshot({path:'test-results/onboarding-02-start.png'});
 const box=await page.locator('canvas').boundingBox();
 const click=(x,y,options)=>page.mouse.click(box.x+x*box.width/1600,box.y+y*box.height/900,options);
 const start=Date.now();let next=12,slots=0,final,snapshot=false;
 while(Date.now()-start<180000){
  const w=await page.evaluate(()=>{const w=window.__BUGWAR__.scene.sim.world;return {status:w.status,elapsed:w.elapsed,stats:w.stats,roads:w.roads,colonies:w.colonies.map(c=>({...c,units:Math.floor(c.units)}))};});
  if(w.status!=='playing'){final=w;break;}
  if(w.elapsed+.0001>=next){
   next+=4;slots++;
   if(slots!==3){
    const own=w.colonies.filter(c=>c.owner===1),targets=w.colonies.filter(c=>c.owner!==1);
    const adjacent=(a,b)=>w.roads.some(([x,y])=>x===a.id&&y===b.id||y===a.id&&x===b.id);
    const pairs=own.flatMap(a=>targets.filter(b=>adjacent(a,b)).map(b=>({a,b,d:Math.hypot(a.x-b.x,a.y-b.y)})));
    const neutral=pairs.filter(p=>p.b.owner===0&&p.a.units*.5>p.b.units+5).sort((a,b)=>a.d-b.d)[0];
    const enemy=pairs.filter(p=>p.b.owner>1&&p.a.units*.75>p.b.units+20).sort((a,b)=>a.d-b.d)[0];
    let order=neutral?{source:neutral.a,target:neutral.b,ratio:.5}:enemy?{source:enemy.a,target:enemy.b,ratio:.75}:null;
    if(!order&&targets.length){
     const hops=new Map(),queue=own.filter(c=>targets.some(t=>adjacent(c,t)));
     for(const c of queue)hops.set(c.id,0);
     for(let i=0;i<queue.length;i++)for(const c of own)if(!hops.has(c.id)&&adjacent(queue[i],c)){hops.set(c.id,hops.get(queue[i].id)+1);queue.push(c);}
     const rear=own.filter(c=>c.units>20&&(hops.get(c.id)??0)>0&&own.some(n=>adjacent(c,n)&&hops.get(n.id)===hops.get(c.id)-1)).toSorted((a,b)=>b.units-a.units)[0];
     const nextHop=rear&&own.filter(c=>adjacent(rear,c)&&hops.get(c.id)===hops.get(rear.id)-1).toSorted((a,b)=>b.id.localeCompare(a.id))[0];
     if(rear&&nextHop)order={source:rear,target:nextHop,ratio:.75};
     else {
      const source=own.filter(c=>c.units>20&&hops.get(c.id)===0&&own.some(n=>hops.get(n.id)===0&&adjacent(c,n)&&c.id.localeCompare(n.id)<0)).toSorted((a,b)=>b.units-a.units)[0];
      const target=source&&own.filter(n=>hops.get(n.id)===0&&adjacent(source,n)&&source.id.localeCompare(n.id)<0).toSorted((a,b)=>a.id.localeCompare(b.id))[0];
      if(source&&target)order={source,target,ratio:.75};
     }
    }
    if(order){
     assert.ok(adjacent(order.source,order.target),'pilot never issues a nonadjacent order');
     await page.locator(`[data-action=ratio][data-value="${order.ratio}"]`).click();
     await click(50,450,{button:'right'}); // Explicitly clear the previous source selection.
     await click(order.source.x,order.source.y);await click(order.target.x,order.target.y);
     report.commands.push({time:+w.elapsed.toFixed(2),source:order.source.id,target:order.target.id,ratio:order.ratio});
    }
   }
  }
  if(!snapshot&&w.elapsed>=32){snapshot=true;await page.screenshot({path:'test-results/onboarding-02-battle.png'});}
  await page.waitForTimeout(100);
 }
 assert.ok(final,'slow UI pilot exceeded 180 real seconds');
 Object.assign(report,{status:final.status,elapsed:+final.elapsed.toFixed(2),stats:final.stats});
 assert.equal(final.status,'won','standard second level is reachable without high-frequency planning');
 await page.waitForSelector('.result-card.won');await page.screenshot({path:'test-results/onboarding-02-victory.png'});
 assert.equal(await page.evaluate(()=>window.__BUGWAR__.save.unlocked('agile')),3,'real stage-2 victory persists and unlocks stage 3');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);report.passed=true;
 await fs.writeFile('test-results/onboarding-browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}catch(error){await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/onboarding-browser-report.json',JSON.stringify({...report,passed:false,error:String(error)},null,2));throw error;}
finally{await browser?.close();server.kill();}
