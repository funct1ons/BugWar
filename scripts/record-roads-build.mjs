// Run once immediately after the unified build, before the browser acceptance suite.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
async function walk(dir,prefix=''){
 const rows=[];
 for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  const relative=path.posix.join(prefix,entry.name);
  if(entry.isDirectory())rows.push(...await walk(path.join(dir,entry.name),relative));
  else {const bytes=await fs.readFile(path.join(dir,entry.name));rows.push({path:relative,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 }
 return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
const inputs=(await walk('src')).map(row=>({...row,path:`src/${row.path}`}));
for(const file of ['package.json','package-lock.json','tsconfig.json','index.html','vite.config.ts']){
 const bytes=await fs.readFile(file);inputs.push({path:file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
inputs.sort((a,b)=>a.path.localeCompare(b.path));
const report={generatedAt:new Date().toISOString(),baseline:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runtime:process.version,method:'Source/build-input and runtime manifests recorded immediately before the unified browser suite. Packaging must preserve every file, byte count and hash.',sourceSha256:createHash('sha256').update(JSON.stringify(inputs)).digest('hex'),inputs,rows:await walk('dist')};
await fs.mkdir('test-results',{recursive:true});
await fs.writeFile('test-results/roads-build-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({files:report.rows.length,javascript:report.rows.filter(row=>row.path.endsWith('.js'))},null,2));
