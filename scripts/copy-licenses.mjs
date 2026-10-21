import fs from 'node:fs/promises';
await fs.mkdir('dist/licenses',{recursive:true});
for(const file of ['LICENSE.md','LICENSE.txt','LICENSE']){try{await fs.copyFile(`node_modules/phaser/${file}`,'dist/licenses/Phaser-MIT.txt');break;}catch{}}
await fs.copyFile('ASSET-LICENSES.md','dist/licenses/ASSET-LICENSES.md');
