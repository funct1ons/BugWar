import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

const port = Number(process.env.SCORE_TEST_PORT || 4185);
const origin = `http://127.0.0.1:${port}`;
const output = 'test-results';
await fs.mkdir(output, { recursive: true });
// Independent acceptance oracle, intentionally not derived from the playback configuration.
const cues = [
  { id: 'menu', bpm: 96, bars: 48, stems: [''] },
  ...[['meadow',108],['roots',100],['marsh',92],['amber',116],['finale',120]].map(([id,bpm]) => ({ id,bpm,bars:48,stems:['-base','-motion','-power'] })),
  { id: 'victory', bpm:108, bars:8, stems:[''] },
  { id: 'defeat', bpm:76, bars:8, stems:[''] },
];
const report = { testedAt: new Date().toISOString(), scope: 'Real Edge decode/mixing/scheduling and synthetic battle-state fixtures; not human subjective listening.', errors: [], failedRequests: [], externalRequests: [] };
const server = spawn(process.execPath, ['scripts/serve.mjs'], { env:{...process.env,PORT:String(port)},stdio:'pipe' });
let browser;
try {
  await new Promise((resolve,reject) => { server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error(`Server exited ${code}`))); });
  browser = await chromium.launch({ executablePath:process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true });
  report.browser = browser.version();
  const page = await browser.newPage({viewport:{width:1600,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)report.failedRequests.push(`${r.status()} ${r.url()}`);});
  page.on('request',r=>{if(!r.url().startsWith(origin)&&!r.url().startsWith('data:')&&!r.url().startsWith('blob:'))report.externalRequests.push(r.url());});
  await page.goto(`${origin}/?test=1`);
  await page.waitForFunction(()=>window.__BUGWAR__?.scene.ready);
  report.beforeGesture = await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  assert.equal(report.beforeGesture.activeMusicSources,0);
  assert.notEqual(report.beforeGesture.contextState,'running');
  await page.locator('[data-action=campaign]').first().click();
  await page.waitForFunction(()=>window.__BUGWAR__.audio.diagnostics().currentTrack==='menu');
  // Decode every distributed codec independently; explicitly inspect full aligned mixtures.
  report.assets = await page.evaluate(async(cues)=>{
    const ctx = new AudioContext({sampleRate:44100});
    const rows=[];
    try {
      for(const format of ['ogg','mp3'])for(const cue of cues){
        const buffers=[];const files=[];
        for(const suffix of cue.stems){
          const name=`music-${cue.id}${suffix}.${format}`;
          const response=await fetch(`audio/${name}`);if(!response.ok)throw Error(`Missing ${name}`);
          const bytes=await response.arrayBuffer();const buffer=await ctx.decodeAudioData(bytes);
          if(buffer.numberOfChannels!==2)throw Error(`Nonstereo ${name}`);
          buffers.push(buffer);files.push({file:name,bytes:bytes.byteLength,frames:buffer.length,sampleRate:buffer.sampleRate});
        }
        const frames=buffers[0].length, rate=buffers[0].sampleRate;
        const expected=Math.round(cue.bars*4*60/cue.bpm*rate);
        if(buffers.some(b=>b.length!==frames))throw Error(`Unsynchronized ${cue.id} ${format}`);
        if(Math.abs(frames-expected)>1)throw Error(`Wrong frame count ${cue.id} ${format}: ${frames} vs ${expected}`);
        let peak=0,energy=0,clipped=0,seam=0;
        const windows=[];const channelData=buffers.map(b=>[b.getChannelData(0),b.getChannelData(1)]);
        for(let channel=0;channel<2;channel++){
          let first=0,last=0,windowEnergy=0,windowFrames=0;
          for(let i=0;i<frames;i++){
            let v=0;for(const data of channelData)v+=data[channel][i];
            if(!Number.isFinite(v))throw Error(`Non-finite ${cue.id}`);
            const a=Math.abs(v);peak=Math.max(peak,a);energy+=v*v;if(a>=.999)clipped++;
            if(i===0)first=v;if(i===frames-1)last=v;
            windowEnergy+=v*v;windowFrames++;
            if(windowFrames===rate){windows.push(Math.sqrt(windowEnergy/windowFrames));windowEnergy=0;windowFrames=0;}
          }
          seam=Math.max(seam,Math.abs(first-last));
        }
        windows.sort((a,b)=>a-b);
        const p10=windows[Math.floor(windows.length*.1)]||0,p95=windows[Math.floor(windows.length*.95)]||0;
        rows.push({cue:cue.id,format,files,seconds:frames/rate,mixPeak:peak,mixRms:Math.sqrt(energy/(frames*2)),clippedSamples:clipped,endpointDifference:seam,windowP10:p10,windowP95:p95,dynamicRatio:p95/Math.max(1e-8,p10)});
      }
    } finally { await ctx.close(); }
    return rows;
  },cues);
  assert.equal(report.assets.length,16);
  assert.equal(report.assets.flatMap(r=>r.files).length,36);
  for(const row of report.assets){
    assert.ok(row.mixRms>.005&&row.mixRms<.45,`usable score signal ${row.cue}/${row.format}`);
    assert.ok(row.mixPeak<.99&&row.clippedSamples===0,`full layered mix headroom ${row.cue}/${row.format}`);
    if(!['victory','defeat'].includes(row.cue))assert.ok(row.endpointDifference<.04,`bounded loop edge ${row.cue}/${row.format}`);
    assert.ok(row.dynamicRatio>1.15,`not flat constant-volume score ${row.cue}/${row.format}`);
  }
  report.levels=[];
  // Actual app start paths; fixture only unlocks levels, not a claimed campaign playthrough.
  for(let index=0;index<18;index++){
    await page.evaluate(index=>{
      const a=window.__BUGWAR__;for(let i=1;i<=18;i++)a.save.data.results.agile[i]={stars:3,time:100,lost:0};
      a.start(index);a.scene.paused=true;
    },index);
    const cue=['meadow','meadow','meadow','roots','roots','roots','marsh','marsh','marsh','amber','amber','roots','finale','meadow','marsh','roots','amber','finale'][index];
    await page.waitForFunction(cue=>{const d=window.__BUGWAR__.audio.diagnostics();return d.currentTrack===cue&&d.pendingLoads===0&&!d.crossfading;},cue,{timeout:30000});
    const row=await page.evaluate(()=>({level:window.__BUGWAR__.levelIndex+1,audio:window.__BUGWAR__.audio.diagnostics(),director:window.__BUGWAR__.music.diagnostics()}));
    assert.equal(row.director.cue,cue);assert.equal(row.audio.musicLoop,true);
    assert.equal(row.audio.activeLayers.length,3);
    assert.equal(new Set(row.audio.activeLayers.map(l=>l.startedAt)).size,1,'stems share one sample clock');
    assert.ok(row.audio.decodedBytes<=row.audio.cacheBudgetBytes,'settled cache budget');
    report.levels.push(row);
  }
  // A detached clone supplies repeatable pressure fixtures: the real simulation is not edited.
  // Accelerate only the director's model clock; WebAudio transitions still use real time.
  report.pressureFixture=await page.evaluate(()=>{
    const a=window.__BUGWAR__;a.scene.onTick=()=>{};
    const w=structuredClone(a.scene.sim.world);w.elapsed=0;w.status='playing';
    const target=w.colonies.find(c=>c.owner===1);
    w.fleets=[2,3,4].map(owner=>({id:owner,owner,race:'agile',from:'fixture',to:target.id,x:target.x+100,y:target.y,count:200,initialCount:200}));
    a.music.setPaused(false);
    for(let i=0;i<85;i++){w.elapsed=i*.25;a.music.update(w,false);}
    window.__SCORE_QA_WORLD__=w;
    return {fixture:true,method:'Detached world clone, synthetic 600-unit multi-faction incoming attack; no writes to live simulation.',director:a.music.diagnostics()};
  });
  assert.equal(report.pressureFixture.director.intensity,2);
  await page.waitForFunction(()=>{const d=window.__BUGWAR__.audio.diagnostics();return d.intensity===2&&d.scheduledTransitionTime===null;},undefined,{timeout:15000});
  report.pressureFixture.audio=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  assert.ok(report.pressureFixture.audio.activeLayers.every(l=>l.gain>.9));
  report.recoveryFixture=await page.evaluate(()=>{
    const a=window.__BUGWAR__,w=window.__SCORE_QA_WORLD__;w.fleets=[];
    for(let i=0;i<260;i++){w.elapsed+=.25;a.music.update(w,false);}
    delete window.__SCORE_QA_WORLD__;return a.music.diagnostics();
  });
  assert.equal(report.recoveryFixture.intensity,0);
  // Engine-level scheduling with director tick frozen. Sources must never restart on intensity changes.
  await page.evaluate(()=>{const a=window.__BUGWAR__;a.audio.setPaused(false);a.audio.setIntensity(0);});
  await page.waitForFunction(()=>{const d=window.__BUGWAR__.audio.diagnostics();return d.intensity===0&&d.scheduledTransitionTime===null;},{},{timeout:15000});
  const before=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  await page.evaluate(()=>window.__BUGWAR__.audio.setIntensity(2));
  report.escalationScheduled=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  assert.equal(report.escalationScheduled.requestedIntensity,2);
  await page.waitForFunction(()=>{const d=window.__BUGWAR__.audio.diagnostics();return d.intensity===2&&d.scheduledTransitionTime===null;},undefined,{timeout:15000});
  report.escalated=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  assert.deepEqual(report.escalated.activeLayers.map(l=>l.startedAt),before.activeLayers.map(l=>l.startedAt));
  assert.ok(report.escalated.activeLayers.every(l=>l.gain>.9),'all orchestral layers audible');
  await page.evaluate(()=>{const a=window.__BUGWAR__.audio;a.setIntensity(0);a.setIntensity(1);a.setIntensity(2);a.setIntensity(0);});
  await page.waitForFunction(()=>{const d=window.__BUGWAR__.audio.diagnostics();return d.intensity===0&&d.scheduledTransitionTime===null;},undefined,{timeout:15000});
  report.cancelledTransitions=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  assert.ok(report.cancelledTransitions.activeLayers.slice(1).every(l=>l.gain<.01));
  await page.evaluate(()=>window.__BUGWAR__.audio.setPaused(true));
  await page.waitForFunction(()=>{const d=window.__BUGWAR__.audio.diagnostics();return d.paused&&d.pauseGain<.34&&d.scheduledTransitionTime===null;},undefined,{timeout:15000});
  report.paused=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  assert.equal(report.paused.paused,true);assert.ok(report.paused.pauseGain>.3&&report.paused.pauseGain<.34,'actual pause duck is audible, not just a target flag');
  await page.evaluate(()=>{const a=window.__BUGWAR__.audio;a.setPaused(false);a.setIntensity(2);a.music('victory');});
  await page.waitForFunction(()=>{const d=window.__BUGWAR__.audio.diagnostics();return d.currentTrack==='victory'&&!d.crossfading;});
  await page.waitForTimeout(3000);report.terminal=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  assert.equal(report.terminal.currentTrack,'victory');assert.equal(report.terminal.musicLoop,false);assert.equal(report.terminal.activeMusicSources,1);
  await page.waitForFunction(()=>window.__BUGWAR__.audio.diagnostics().activeMusicSources===0,undefined,{timeout:25000});
  report.victoryEnded=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  assert.equal(report.victoryEnded.currentTrack,null);
  await page.evaluate(()=>window.__BUGWAR__.audio.music('defeat'));
  await page.waitForFunction(()=>window.__BUGWAR__.audio.diagnostics().currentTrack==='defeat');
  report.defeatStarted=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  assert.equal(report.defeatStarted.musicLoop,false);
  await page.waitForFunction(()=>window.__BUGWAR__.audio.diagnostics().activeMusicSources===0,undefined,{timeout:35000});
  report.defeatEnded=await page.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  assert.equal(report.defeatEnded.currentTrack,null);
  // Real codec fallback for all three synchronized stems.
  const fallbackContext=await browser.newContext();
  await fallbackContext.route('**/*.ogg',route=>route.fulfill({status:200,contentType:'audio/ogg',body:'intentional invalid OGG fixture'}));
  const fallback=await fallbackContext.newPage();await fallback.goto(`${origin}/?test=1`);await fallback.waitForFunction(()=>window.__BUGWAR__?.scene.ready);
  await fallback.locator('[data-action=campaign]').first().click();await fallback.locator('[data-action=level][data-value="0"]').click();
  await fallback.waitForFunction(()=>{const d=window.__BUGWAR__.audio.diagnostics();return d.currentTrack==='meadow'&&d.pendingLoads===0&&!d.crossfading;},undefined,{timeout:45000});
  report.mp3Fallback=await fallback.evaluate(()=>window.__BUGWAR__.audio.diagnostics());
  for(const stem of ['base','motion','power'])assert.ok(report.mp3Fallback.fallbackFiles.includes(`music-meadow-${stem}.mp3`));
  assert.deepEqual(report.mp3Fallback.failedFiles,[]);assert.equal(new Set(report.mp3Fallback.activeLayers.map(l=>l.startedAt)).size,1);
  await fallbackContext.close();
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedRequests,[]);assert.deepEqual(report.externalRequests,[]);
  report.passed=true;
}catch(error){report.passed=false;report.error=String(error);throw error;}
finally{
  await fs.writeFile(`${output}/score-browser-report.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));await browser?.close();server.kill();
}
