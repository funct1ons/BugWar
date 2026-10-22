#!/usr/bin/env node
// Independent art contact sheet for the 36 formal SVG assets.
//
// - No application server, no source changes and no game state.
// - Real system Edge decodes every file; SVG dimensions and the four-frame
//   unit-sheet boundaries are checked in the raster, not by trusting markup.
// - A light paper contact sheet is written to test-results/art-sheet.png.
//
// BUGWAR_ART_DIR / ART_SHEET_OUT are local dry-run overrides used while the
// formal assets are still being produced. The default is the real public/art
// directory and test-results/art-sheet.png.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ART = path.resolve(process.env.BUGWAR_ART_DIR || path.join(ROOT, 'public/art'));
const OUTPUT = path.resolve(process.env.ART_SHEET_OUT || path.join(ROOT, 'test-results/art-sheet.png'));

const RACES = ['agile', 'fast', 'strong'];
const OWNERS = [0, 1, 2, 3, 4];
const OWNER_LABEL = ['neutral #92A18B', 'blue #327FC1', 'red #C85F48', 'purple #8B70BA', 'gold #C49336'];
const EXPECTED = new Map();
const add = (name, width, height) => EXPECTED.set(name, { width, height });

add('cover.svg', 1600, 900);
for (const biome of ['meadow', 'roots', 'marsh', 'amber']) add(`background-${biome}.svg`, 1600, 900);
for (const owner of OWNERS) {
  add(`nest-${owner}.svg`, 160, 160);
  add(`cannon-${owner}.svg`, 160, 160);
}
for (const race of RACES) for (const owner of OWNERS) add(`bug-${race}-${owner}.svg`, 96, 32);
add('nest.svg', 160, 160);
add('cannon.svg', 160, 160);
for (const race of RACES) add(`bug-${race}.svg`, 96, 32);
add('emblem.svg', 256, 256);

const REQUIRED = [...EXPECTED.keys()];
const BUG_FILES = [
  ...RACES.flatMap(race => OWNERS.map(owner => `bug-${race}-${owner}.svg`)),
  ...RACES.map(race => `bug-${race}.svg`),
];
const DEFAULT_PAIRS = [
  ['nest.svg', 'nest-0.svg', 160, 160],
  ['cannon.svg', 'cannon-0.svg', 160, 160],
  ...RACES.map(race => [`bug-${race}.svg`, `bug-${race}-1.svg`, 96, 32]),
];

const failures = [];
const fail = message => { failures.push(message); console.error(`FAIL ${message}`); };
const escape = value => String(value).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

function loadPlaywright() {
  for (const id of ['playwright', '@playwright/test']) {
    try { return require(id); } catch { /* try the next package */ }
  }
  throw new Error('Playwright is not installed (expected playwright or @playwright/test).');
}

function edgeLaunchOptions() {
  const configured = process.env.EDGE_PATH;
  const candidates = [
    configured,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  const executablePath = candidates.find(file => fs.existsSync(file));
  return executablePath ? { executablePath, headless: true } : { channel: 'msedge', headless: true };
}

function dataUri(file) {
  return `data:image/svg+xml;base64,${fs.readFileSync(path.join(ART, file)).toString('base64')}`;
}

function imageCard(file, className = '') {
  const dims = EXPECTED.get(file);
  const size = dims ? `${dims.width}\u00d7${dims.height}` : 'extra';
  return `<figure class="card ${className}" data-file="${escape(file)}">
    <div class="frame">${className.includes('bug') ? '<span class="grid"></span>' : ''}<img data-art="${escape(file)}" alt="${escape(file)}" src="${dataUri(file)}"></div>
    <figcaption><b>${escape(file)}</b><span>${size}</span></figcaption>
  </figure>`;
}

function sheetHtml(edgeVersion, extraFiles) {
  const backgrounds = ['meadow', 'roots', 'marsh', 'amber'].map(biome => imageCard(`background-${biome}.svg`, 'scene'));
  const buildings = [
    ...OWNERS.map(owner => imageCard(`nest-${owner}.svg`, 'building')),
    ...OWNERS.map(owner => imageCard(`cannon-${owner}.svg`, 'building')),
    imageCard('nest.svg', 'building'),
    imageCard('cannon.svg', 'building'),
  ];
  const bugs = BUG_FILES.map(file => imageCard(file, 'bug'));
  const emblem = imageCard('emblem.svg', 'emblem');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    :root { color: #26352e; background: #f4f0e3; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 13px/1.35 "Segoe UI", "Microsoft YaHei", sans-serif; }
    .sheet { width: 1720px; padding: 30px 36px 44px; }
    header { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 2px solid #b9c3a8; padding-bottom: 13px; }
    h1 { margin: 0; font: 30px/1.1 Georgia, "Songti SC", serif; letter-spacing: 1px; }
    h2 { margin: 30px 0 10px; font: 16px/1.2 Georgia, serif; letter-spacing: .6px; color: #45594b; }
    .meta { text-align: right; color: #5d6d60; font-size: 11px; line-height: 1.7; }
    .grid { display: grid; gap: 12px; }
    .scenes { grid-template-columns: 1fr 1fr; }
    .buildings { grid-template-columns: repeat(6, 1fr); }
    .bugs { grid-template-columns: repeat(6, 1fr); }
    .card { margin: 0; background: #fffdf7; border: 1px solid #d8d2bf; border-radius: 6px; padding: 8px; box-shadow: 0 1px 0 #fff inset; }
    .card .frame { position: relative; display: flex; align-items: center; justify-content: center; min-height: 0; background: #fbf8ee; border-radius: 3px; overflow: hidden; }
    .card img { display: block; max-width: 100%; height: auto; }
    .card.scene .frame { aspect-ratio: 16/9; }
    .card.scene img { width: 100%; }
    .card.building img { width: 128px; height: 128px; }
    .card.bug .frame { background-color: #f7f3e6; background-image: conic-gradient(#e7e0ce 25%, #fffdf7 0 50%, #e7e0ce 0 75%, #fffdf7 0); background-size: 14px 14px; }
    .card.bug img { width: 192px; height: 64px; }
    .card.bug .grid { position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 47px, #c65c4b99 47px 48px, transparent 48px 96px); pointer-events: none; }
    .card.emblem img { width: 160px; height: 160px; }
    figcaption { display: flex; justify-content: space-between; gap: 8px; margin-top: 7px; font-size: 10.5px; color: #4b5e50; }
    figcaption b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    figcaption span { color: #849180; white-space: nowrap; }
    .legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; color: #5a6b5e; font-size: 11px; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
    .note { margin-top: 10px; color: #6d7c6f; font-size: 11px; }
    .extras { color: #8a5a3a; }
  </style></head><body><main class="sheet">
    <header><div><h1>Bug War \u00b7 Sunlit Garden \u00b7 formal art contact sheet</h1>
      <div class="legend">${OWNER_LABEL.map((label, index) => `<span><i style="background:${label.split(' ')[1]}"></i>${escape(label)}</span>`).join('')}</div></div>
      <div class="meta">${REQUIRED.length} formal SVGs (${BUG_FILES.length} unit sheets)<br>System Edge ${escape(edgeVersion)} \u00b7 light paper background<br>${new Date().toISOString()}</div></header>
    <h2>Approved cover + four battle scenes (1600\u00d7900)</h2>
    <div class="grid scenes">${imageCard('cover.svg', 'scene')}${backgrounds[0]}${backgrounds.slice(1).join('')}</div>
    <h2>Ownership buildings (160\u00d7160) + emblem (256\u00d7256)</h2>
    <div class="grid buildings">${buildings.join('')}${emblem}</div>
    <h2>Unit sheets (96\u00d732, four 24\u00d732 frames; checkerboard = transparent)</h2>
    <div class="note">Red lines mark the four frame boundaries. Owner variants 0\u20134, then the three blue default UI entries.</div>
    <div class="grid bugs">${bugs.join('')}</div>
    ${extraFiles.length ? `<p class="note extras">Extra SVG files in this directory (decoded but not part of the 36-file contract): ${extraFiles.map(escape).join(', ')}</p>` : ''}
  </main></body></html>`;
}

async function main() {
  if (!fs.existsSync(ART)) throw new Error(`Art directory not found: ${ART}`);
  const found = new Set(fs.readdirSync(ART).filter(file => file.toLowerCase().endsWith('.svg')));
  const missing = REQUIRED.filter(file => !found.has(file));
  if (missing.length) {
    throw new Error(`formal art set is incomplete: ${missing.length} missing of ${REQUIRED.length}\n  ${missing.join('\n  ')}`);
  }
  const extras = [...found].filter(file => !EXPECTED.has(file)).sort();

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch(edgeLaunchOptions());
  try {
    const page = await browser.newPage({ viewport: { width: 1720, height: 1200 }, deviceScaleFactor: 1 });
    page.setDefaultTimeout(30000);
    await page.setContent(sheetHtml(browser.version(), extras), { waitUntil: 'load' });

    const decode = await page.evaluate(async () => {
      const images = [...document.querySelectorAll('img[data-art]')];
      const results = await Promise.all(images.map(async image => {
        try { await image.decode(); } catch { /* report below */ }
        return {
          file: image.dataset.art,
          complete: image.complete,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
        };
      }));
      return results;
    });
    const decodeByName = new Map(decode.map(item => [item.file, item]));
    for (const file of REQUIRED) {
      const result = decodeByName.get(file);
      const expected = EXPECTED.get(file);
      if (!result || !result.complete || result.naturalWidth === 0) {
        fail(`${file}: Edge did not decode the SVG`);
        continue;
      }
      if (result.naturalWidth !== expected.width || result.naturalHeight !== expected.height) {
        fail(`${file}: decoded ${result.naturalWidth}\u00d7${result.naturalHeight}, expected ${expected.width}\u00d7${expected.height}`);
      }
    }
    if (decode.length !== REQUIRED.length) fail(`rendered ${decode.length} images, expected ${REQUIRED.length}`);

    // Raster checks use the already-decoded images.  Drawing at natural size
    // verifies the clipping that actually reaches the game renderer.
    const raster = await page.evaluate(async ({ bugFiles, pairs }) => {
      const byName = new Map([...document.querySelectorAll('img[data-art]')].map(image => [image.dataset.art, image]));
      const draw = (file, width, height) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(byName.get(file), 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height).data;
      };
      const bugs = {};
      for (const file of bugFiles) {
        const data = draw(file, 96, 32);
        const edgeAlpha = [];
        for (const x of [0, 23, 24, 47, 48, 71, 72, 95]) {
          let alpha = 0;
          for (let y = 0; y < 32; y++) alpha += data[(y * 96 + x) * 4 + 3];
          if (alpha) edgeAlpha.push({ x, alpha });
        }
        const frames = [0, 1, 2, 3].map(index => {
          let opaque = 0;
          for (let y = 0; y < 32; y++) for (let x = index * 24; x < index * 24 + 24; x++) if (data[(y * 96 + x) * 4 + 3]) opaque++;
          return opaque;
        });
        bugs[file] = { edgeAlpha, frames };
      }
      const defaults = {};
      for (const [defaultFile, ownerFile, width, height] of pairs) {
        const a = draw(defaultFile, width, height);
        const b = draw(ownerFile, width, height);
        let different = 0;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) different++;
        defaults[defaultFile] = { ownerFile, different, total: a.length };
      }
      const luminance = {};
      for (const file of ['cover.svg', 'background-meadow.svg', 'background-roots.svg', 'background-marsh.svg', 'background-amber.svg']) {
        const data = draw(file, 160, 90);
        let sum = 0;
        for (let i = 0; i < data.length; i += 4) sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
        luminance[file] = Number((sum / (data.length / 4)).toFixed(3));
      }
      return { bugs, defaults, luminance };
    }, {
      bugFiles: BUG_FILES,
      pairs: DEFAULT_PAIRS,
    });

    for (const [file, result] of Object.entries(raster.bugs)) {
      if (result.edgeAlpha.length) fail(`${file}: frame boundary pixels are opaque (${result.edgeAlpha.map(item => `x=${item.x}`).join(', ')})`);
      const empty = result.frames.map((count, index) => count ? null : index + 1).filter(Boolean);
      if (empty.length) fail(`${file}: frames ${empty.join(', ')} are empty`);
    }
    for (const [file, result] of Object.entries(raster.defaults)) {
      if (result.different) fail(`${file}: raster differs from ${result.ownerFile} (${result.different}/${result.total} channel bytes)`);
    }
    for (const [file, luminance] of Object.entries(raster.luminance)) {
      console.log(`INFO ${file}: raster mean luminance ${luminance.toFixed(3)} (sunlit check belongs to tests/art.test.ts)`);
    }

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    await page.screenshot({ path: OUTPUT, fullPage: true });
    console.log(`INFO contact sheet: ${path.relative(ROOT, OUTPUT).replace(/\\/g, '/')} (${REQUIRED.length} formal files${extras.length ? ` + ${extras.length} extra` : ''})`);
  } finally {
    await browser.close();
  }

  if (failures.length) throw new Error(`${failures.length} art check(s) failed:\n- ${failures.join('\n- ')}`);
  console.log(`PASS system Edge: ${REQUIRED.length} formal SVGs decoded at the contracted sizes; all ${BUG_FILES.length} unit sheets have transparent frame boundaries and non-empty frames; defaults match their owner files; test-results/art-sheet.png written.`);
}

main().catch(error => {
  console.error(`FAIL ${error.message}`);
  process.exitCode = 1;
});
