import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const read=async n=>JSON.parse(await fs.readFile(`test-results/${n}.json`,'utf8'));
const unit=await read('garrison-unit');assert.equal(unit.success,true);assert.equal(unit.numFailedTests,0);
const raw=await fs.readFile('test-results/garrison-unit.log');const log=raw.toString(raw[0]===255&&raw[1]===254?'utf16le':'utf8').replace(/\x1b\[[0-9;]*m/g,'');
const rows=[];const onboarding=[];
for(const line of log.split(/\r?\n/)){for(const [marker,dst] of [['CAMPAIGN_RESULT ',rows],['ONBOARDING ',onboarding]]){const p=line.indexOf(marker);if(p>=0){const r=JSON.parse(line.slice(p+marker.length).trim());dst.push(...(Array.isArray(r)?r:[r]));}}}
const matrix=rows.filter(r=>['easy','normal'].includes(r.difficulty)&&['agile-pulse','fast-pulse','strong-pulse','brood-pulse'].includes(r.strategy));
assert.equal(matrix.length,144);assert.ok(matrix.every(r=>r.status==='won'));assert.equal(onboarding.length,18);assert.ok(onboarding.every(r=>r.status==='won'));
const balance=Object.fromEntries(['easy','normal'].map(d=>{const r=matrix.filter(r=>r.difficulty===d),t=r.map(r=>r.time).sort((a,b)=>a-b);return [d,{runs:r.length,wins:r.filter(r=>r.status==='won').length,medianSeconds:(t[35]+t[36])/2,maxSeconds:t.at(-1)}]}));
const browser={};
for(const name of ['lightweight-browser','browser','roads-codex','visual','score-browser','onboarding-browser']){const r=await read(`${name}-report`);assert.equal(r.passed,true,name);assert.ok(!r.error,name);for(const k of ['errors','failedRequests','externalRequests','missing','external'])assert.equal(r[k]?.length??0,0,`${name}.${k}`);browser[name]={passed:true,testedAt:r.testedAt??null};await fs.writeFile(`docs/verification/garrison-${name}-report.json`,JSON.stringify(r,null,2)+'\n');}
const js=(await fs.readdir('dist/assets')).find(n=>/^index-.*\.js$/.test(n));const sha256=crypto.createHash('sha256').update(await fs.readFile(`dist/assets/${js}`)).digest('hex');
const summary={testedAt:new Date().toISOString(),scope:'Owned garrison defense x1.2; cannon range250 damage4/6/8/10. Deterministic robots plus real Edge and explicitly labelled controlled fixtures; not human playtesting.',unit:{passed:unit.numPassedTests,failed:unit.numFailedTests,skipped:unit.numPendingTests,success:unit.success},build:{js,sha256},browser,naturalCampaign:{methodology:'Unmodified simulation; legal orders and existing pulse strategies, 900s cap unchanged; timeout is not a win. No injected captures or troops.',balance,runs:matrix},onboarding:{methodology:'Same visible-state low-frequency bot, delays 8/10/12s, periods3/3.5/4s, optional skipped action, no skill or future planning.',runs:onboarding}};
await fs.writeFile('docs/verification/garrison-release-summary.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({unit:summary.unit,build:summary.build,balance,onboardingWins:onboarding.length,browser},null,2));
