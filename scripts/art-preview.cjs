// Local file contact sheet; no server and no application changes.
const { chromium } = require('playwright');
const path = require('path');
const art = path.resolve(__dirname, '../public/art');
const output = path.resolve(__dirname, '../test-results/art-sheet.png');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1600,height:1320},deviceScaleFactor:1});
 const fs=require('fs');
 const uri=n=>'data:image/svg+xml;base64,'+fs.readFileSync(path.join(art,n)).toString('base64');
 await page.setContent(`<body style="margin:0;background:#152523;color:#ddd5b8;font:16px Georgia"><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${['meadow','roots','marsh','amber'].map(k=>`<div>${k}<img style="width:100%;display:block" src="${uri('background-'+k+'.svg')}"></div>`).join('')}</div><div style="display:flex;align-items:center;gap:32px;padding:20px">${['nest.svg','cannon.svg','emblem.svg','bug-agile.svg','bug-fast.svg','bug-strong.svg'].map(n=>`<div>${n}<br><img src="${uri(n)}" style="image-rendering:auto;${n.startsWith('bug')?'width:192px':''}"></div>`).join('')}</div></body>`);
 await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode())));
 fs.mkdirSync(path.dirname(output),{recursive:true});
 await page.screenshot({path:output,fullPage:true});
 // Raster frame edges must remain transparent; verifies clipping survives browser rendering.
 for(const n of ['agile','fast','strong']){
  const result=await page.evaluate(async src=>{const i=new Image();i.src=src;await i.decode();const c=document.createElement('canvas');c.width=96;c.height=32;const x=c.getContext('2d');x.drawImage(i,0,0);const d=x.getImageData(0,0,96,32).data;let count=0;for(let y=0;y<32;y++)for(const xx of [0,23,24,47,48,71,72,95])if(d[(y*96+xx)*4+3])count++;return count},uri('bug-'+n+'.svg'));
  if(result)throw Error(n+' frame edge pixels '+result);
 }
 console.log('PASS Chromium: 10 images decoded; sprite cell edges transparent; test-results/art-sheet.png written');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
