// This feature must not silently replace the previously accepted art, score or saves.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {transform} from 'esbuild';
const baseline='2ad4b4d57e511f02f2c0fcd5d6aea8d63285cb59';
const frozen=['public/art','public/audio','src/audio','src/storage'];
const sha=b=>createHash('sha256').update(b).digest('hex');
const names=execFileSync('git',['ls-tree','-r','--name-only',baseline,'--',...frozen],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const rows=[];
for(const path of names){
 const before=execFileSync('git',['show',`${baseline}:${path}`],{maxBuffer:32*1024*1024});
 const after=await fs.readFile(path);
 rows.push({path,bytes:after.length,sha256:sha(after),baselineSha256:sha(before),same:after.equals(before)});
}
const changes=execFileSync('git',['diff','--name-only',baseline,'--',...frozen],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
const extras=execFileSync('git',['ls-files','--others','--exclude-standard','--',...frozen],{encoding:'utf8'}).trim().split(/\r?\n/).filter(Boolean);
// Compare the structured gameplay data as well as frozen bytes. Roads, tips and par
// times are the intentional map edits; starting armies, ownership and race stats are not.
const loadTs=async source=>{
 const {code}=await transform(source,{loader:'ts',format:'esm',target:'es2022'});
 return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
};
const oldLevels=await loadTs(execFileSync('git',['show',`${baseline}:src/data/levels.ts`],{encoding:'utf8'}));
const newLevels=await loadTs(await fs.readFile('src/data/levels.ts','utf8'));
const stableLevel=({roads,tip,par,...level})=>level;
const initialCampaignUnchanged=JSON.stringify(oldLevels.LEVELS.map(stableLevel))===JSON.stringify(newLevels.LEVELS.map(stableLevel));
const oldTypes=await loadTs(execFileSync('git',['show',`${baseline}:src/core/types.ts`],{encoding:'utf8'}));
const newTypes=await loadTs(await fs.readFile('src/core/types.ts','utf8'));
const raceParametersUnchanged=JSON.stringify(oldTypes.RACES)===JSON.stringify(newTypes.RACES);
const report={generatedAt:new Date().toISOString(),baseline,scope:'Fixed roads and codex only; previous art, score, audio implementation and storage implementation remain byte-identical. Map initial state and race parameters are compared structurally.',saveKey:'bugwar-verdant-v1',saveVersion:1,files:rows.length,changedTrackedPaths:changes,extraPaths:extras,initialCampaignUnchanged,raceParametersUnchanged,rows,passed:rows.every(r=>r.same)&&changes.length===0&&extras.length===0&&initialCampaignUnchanged&&raceParametersUnchanged};
await fs.mkdir('test-results',{recursive:true});
await fs.writeFile('test-results/roads-scope-report.json',JSON.stringify(report,null,2));
assert.equal(report.passed,true,'Frozen assets, storage, initial map state or race parameters changed; inspect roads-scope-report.json');
console.log(JSON.stringify({passed:report.passed,baseline,files:rows.length,frozen,initialCampaignUnchanged,raceParametersUnchanged},null,2));
