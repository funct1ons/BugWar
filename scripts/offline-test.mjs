import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const port=4176,base=`http://127.0.0.1:${port}`,release=Boolean(process.env.OFFLINE_ROOT);
const server=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','Start-Game.ps1','-Port',String(port),'-NoBrowser'],{stdio:'pipe',cwd:process.env.OFFLINE_ROOT||process.cwd()});
let browser;
const report={server:'Windows PowerShell 5.1 native TCP HTTP',unpackedRelease:release,requests:0,errors:[],failed:[],external:[]};
try{
 await new Promise((resolve,reject)=>{let log='';server.stdout.on('data',chunk=>{log+=chunk;if(log.includes('http://'))resolve();});server.once('error',reject);server.once('exit',code=>reject(new Error(`Offline launcher exited ${code}`)));setTimeout(()=>reject(new Error('Offline launcher startup timeout')),10000).unref();});
 browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1600,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('response',r=>{report.requests++;if(r.status()>=400)report.failed.push(`${r.status()} ${r.url()}`);});page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))report.external.push(r.url());});
 await page.goto(`${base}/?test=1`);await page.waitForFunction(()=>window.__BUGWAR__?.scene.ready);
 await page.locator('[data-action=campaign]').first().click();await page.locator('[data-action=level][data-value="0"]').click();
 await page.mouse.click(320,465);await page.mouse.click(730,330);await page.waitForFunction(()=>window.__BUGWAR__.scene.sim.world.colonies.find(c=>c.id==='b').owner===1);
 await page.waitForFunction(()=>window.__BUGWAR__.audio.diagnostics().contextState==='running'&&window.__BUGWAR__.audio.diagnostics().decodedBuffers>=9);
 report.audio=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
 report.realMouseCapture=await page.evaluate(()=>window.__BUGWAR__.scene.sim.world.stats.captures>0);
 assert.equal(report.realMouseCapture,true);assert.deepEqual(report.errors,[]);assert.deepEqual(report.failed,[]);assert.deepEqual(report.external,[]);report.passed=true;
 await fs.mkdir('test-results',{recursive:true});await page.screenshot({path:`test-results/${release?'11-release-offline':'09-powershell-offline'}.png`});await fs.writeFile(`test-results/${release?'offline-release':'offline'}-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser?.close();server.kill();}
