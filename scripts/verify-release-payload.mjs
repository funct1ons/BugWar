// Compare the actually unpacked/tested archive to the current accepted build.
// The ZIP cannot contain a report of its own final hash; keep this report alongside it.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.env.OFFLINE_ROOT;
assert.ok(root,'Set OFFLINE_ROOT to the directory unpacked from the release ZIP');
async function walk(dir,prefix=''){
 const rows=[];
 for(const e of await fs.readdir(dir,{withFileTypes:true})){
  const relative=path.posix.join(prefix,e.name);
  if(e.isDirectory())rows.push(...await walk(path.join(dir,e.name),relative));else rows.push(relative);
 }
 return rows.sort();
}
const sha=b=>createHash('sha256').update(b).digest('hex');
const build=await walk('dist');
const accepted=JSON.parse(await fs.readFile('test-results/roads-build-report.json','utf8'));
assert.deepEqual((await walk('src')).map(p=>`src/${p}`).sort(),accepted.inputs.filter(row=>row.path.startsWith('src/')).map(row=>row.path).sort(),'Source file list changed after the accepted build');
for(const row of accepted.inputs){
 const bytes=await fs.readFile(row.path);
 assert.equal(bytes.length,row.bytes,`Source bytes changed after build: ${row.path}`);
 assert.equal(sha(bytes),row.sha256,`Source hash changed after build: ${row.path}`);
}
assert.deepEqual(build,[...accepted.rows.map(row=>row.path)].sort(),'Build file list changed after browser acceptance');
for(const row of accepted.rows){
 const bytes=await fs.readFile(path.join('dist',row.path));
 assert.equal(bytes.length,row.bytes,`Build bytes changed after acceptance: ${row.path}`);
 assert.equal(sha(bytes),row.sha256,`Build hash changed after acceptance: ${row.path}`);
}
const unpacked=await walk(path.join(root,'dist'));
assert.deepEqual(unpacked,build,'Unpacked archive has a different runtime file list');
const payload=[...build.map(p=>`dist/${p}`),'Start-Game.ps1','Start-Game.cmd','ASSET-LICENSES.md'];
const rows=[];
for(const relative of payload){
 const [local,archived]=await Promise.all([fs.readFile(relative),fs.readFile(path.join(root,relative))]);
 rows.push({path:relative,bytes:local.length,sha256:sha(local),unpackedSha256:sha(archived),same:local.equals(archived)});
}
const zipPath='release/BugWar-VerdantCrown-Windows.zip',zip=await fs.readFile(zipPath);
const report={scope:'Accepted browser build, current runtime, launcher and asset licence equality for the final ZIP after extraction; documentation can only describe its packaging-time snapshot.',acceptedBuildRecordedAt:accepted.generatedAt,sourceSha256:accepted.sourceSha256,unpackedRoot:root,zipPath,zipBytes:zip.length,zipSha256:sha(zip),files:rows.length,rows,passed:rows.every(r=>r.same)};
await fs.mkdir('test-results',{recursive:true});
await fs.writeFile('test-results/roads-release-payload-report.json',JSON.stringify(report,null,2));
assert.equal(report.passed,true,'Archive differs from the accepted runtime');
console.log(JSON.stringify({passed:report.passed,files:report.files,zipPath,zipBytes:report.zipBytes,zipSha256:report.zipSha256},null,2));
