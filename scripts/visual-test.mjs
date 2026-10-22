// Independent visual acceptance for the Sunlit Garden build.
//
// The existing scripts/browser-test.mjs already covers the long functional
// journey.  This file deliberately stays focused on the art/UI integration:
// the approved cover, owner textures, all 13 layouts, HUD occlusion, three
// viewports, modals, result screens and extreme unit-number plates.
//
// It serves the existing dist/ through scripts/serve.mjs on VISUAL_PORT (4181
// by default), uses the system Edge, and writes test-results/visual-*.png plus
// test-results/visual-report.json.  Every synthetic world edit is labelled as a
// fixture; no fixture is presented as a natural playthrough.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.VISUAL_PORT || 4181);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const TEST_URL = `${ORIGIN}/?test=1`;
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUTPUT = path.join(ROOT, 'test-results');
const REPORT_FILE = path.join(OUTPUT, 'visual-report.json');
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];
const BOUNDARIES = {
  designSize: '1600x900',
  hudTop: 792,
  minCoverBrightness: 0.45,
  numberPlatePaddingPx: 2,
  minControlSizePx: 2,
  hitTestTolerancePx: 1,
  crossViewportTolerancePx: 2,
  note: 'HUD top is the measured .battle-bottom top in 1600x900 design coordinates; 792 is the design baseline.',
};
const FIXTURES = [];
const CHECKS = [];
const SCREENSHOTS = [];
const PAGE_ERRORS = [];
const CONSOLE_ERRORS = [];
const FAILED_REQUESTS = [];
const NETWORK_FAILURES = [];
const CANCELLED_FIXTURE_MUSIC = [];
const MUSIC_CANCELLATION_CHECKS = [];
let syntheticMusicAbortPhase = null;
const EXTERNAL_REQUESTS = [];
const report = {
  startedAt: new Date().toISOString(),
  url: TEST_URL,
  normalUrl: `${ORIGIN}/`,
  port: PORT,
  boundaries: BOUNDARIES,
  fixtures: FIXTURES,
  checks: CHECKS,
  screenshots: SCREENSHOTS,
  menu: null,
  campaign: null,
  modals: [],
  layouts: [],
  textures: null,
  extremeNumbers: null,
  results: null,
  viewports: [],
  requests: null,
  error: null,
  passed: false,
};

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function check(name, ok, detail) {
  const entry = { name, ok: Boolean(ok), detail };
  CHECKS.push(entry);
  if (!ok) console.error(`FAIL ${name}${detail === undefined ? '' : `: ${JSON.stringify(detail)}`}`);
  else console.log(`ok   ${name}`);
  return Boolean(ok);
}

function must(name, ok, detail) {
  if (!check(name, ok, detail)) throw new Error(`${name}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
}

function fixture(name, description, values) {
  const entry = { name, synthetic: true, description, values };
  FIXTURES.push(entry);
  return entry;
}

async function shot(page, name) {
  const relative = `test-results/visual-${name}.png`;
  await page.screenshot({ path: path.join(ROOT, relative) });
  SCREENSHOTS.push(relative);
  return relative;
}

function attachDiagnostics(page, label) {
  page.on('pageerror', error => PAGE_ERRORS.push(`${label}: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') CONSOLE_ERRORS.push(`${label}: ${message.text()}`);
  });
  page.on('response', response => {
    if (response.status() >= 400) FAILED_REQUESTS.push(`${label} ${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    const failure = request.failure()?.errorText ?? 'failed';
    // The 13-layout loop deliberately starts several cues before their downloads
    // can finish. AudioSystem must abort obsolete loads, not leak them. Do NOT
    // suppress HTTP errors, SFX/art failures, other network errors, or normal play.
    const music = /\/audio\/music-(meadow|roots|marsh|amber|finale)-(?:base|motion|power)\.(?:ogg|mp3)$/.exec(request.url());
    if (label === 'test' && failure === 'net::ERR_ABORTED' && music) {
      const phase = syntheticMusicAbortPhase ?? 'Other scripted fixture/menu/result switch';
      // Read the cue captured synchronously at AbortSignal dispatch, NOT later:
      // the 13-layout fixture can return to the same cue before this callback.
      // An aborted CURRENT cue is still a failure, even in a synthetic phase.
      MUSIC_CANCELLATION_CHECKS.push(page.evaluate(url => {
        const records = window.__VISUAL_AUDIO_ABORTS__ ?? [];
        const index = records.findIndex(record => record.url === url);
        return index < 0 ? null : records.splice(index, 1)[0];
      }, request.url()).then(abort => {
        if (abort?.wantedCue && abort.wantedCue !== music[1]) CANCELLED_FIXTURE_MUSIC.push({ phase,
          url: request.url(), failure, cancelledCue: music[1], wantedCueAtAbort: abort.wantedCue,
          signalAbortAt: abort.at,
          reason: 'Native AbortSignal observed synchronously; the director already wanted a different cue.' });
        else NETWORK_FAILURES.push(`${label} ${failure} ${request.url()} (wanted at abort: ${abort?.wantedCue ?? 'unverified'})`);
      }).catch(error => NETWORK_FAILURES.push(`${label} ${failure} ${request.url()} (cannot verify cancellation: ${error.message})`)));
    } else NETWORK_FAILURES.push(`${label} ${failure} ${request.url()}`);
  });
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith(ORIGIN) && !url.startsWith('data:') && !url.startsWith('blob:')) EXTERNAL_REQUESTS.push(`${label} ${url}`);
  });
}

async function startServer() {
  await fs.access(path.join(ROOT, 'dist/index.html')).catch(() => {
    throw new Error('dist/index.html is missing; run npm run build before scripts/visual-test.mjs.');
  });
  return await new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [path.join(ROOT, 'scripts/serve.mjs')], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(PORT) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    let settled = false;
    const settle = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        try { server.kill(); } catch { /* already gone */ }
        reject(error);
      } else {
        resolve(server);
      }
    };
    const timer = setTimeout(() => settle(new Error(`server did not become ready on ${PORT}. ${output.trim()}`)), 12000);
    server.stdout.on('data', data => {
      output += data;
      if (output.includes('Bug War offline')) settle();
    });
    server.stderr.on('data', data => { output += data; });
    server.once('exit', code => settle(new Error(`server exited ${code}; is port ${PORT} already in use? ${output.trim()}`)));
    server.once('error', error => settle(error));
  });
}

async function stopServer(server) {
  if (!server || server.exitCode !== null) return;
  server.kill();
  await Promise.race([
    new Promise(resolve => server.once('exit', resolve)),
    delay(2500),
  ]);
  if (server.exitCode === null) {
    try { server.kill('SIGKILL'); } catch { /* already gone */ }
    await delay(300);
  }
}

function launchOptions() {
  return EDGE ? { executablePath: EDGE, headless: true } : { channel: 'msedge', headless: true };
}

async function waitForGame(page) {
  await page.waitForFunction(() => window.__BUGWAR__?.scene?.ready === true, undefined, { timeout: 15000 });
  await page.waitForSelector('.menu-screen');
}

async function hitTest(page, label) {
  return await page.evaluate(label => {
    const ui = document.getElementById('ui');
    if (!ui) return [{ label, reason: '#ui missing' }];
    const uiRect = ui.getBoundingClientRect();
    const blocked = [];
    const controls = [...ui.querySelectorAll('[data-action]')].filter(element => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 1 && rect.height > 1 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
    });
    for (const element of controls) {
      const rect = element.getBoundingClientRect();
      const action = element.dataset.action;
      if (rect.left < uiRect.left - 1 || rect.top < uiRect.top - 1 || rect.right > uiRect.right + 1 || rect.bottom > uiRect.bottom + 1) {
        blocked.push({ label, action, reason: 'outside #ui', rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } });
      }
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) {
        blocked.push({ label, action, reason: 'outside viewport', point: { x, y } });
        continue;
      }
      const hit = document.elementFromPoint(x, y);
      if (!hit || !(hit === element || element.contains(hit))) {
        blocked.push({ label, action, reason: 'covered', by: hit ? `${hit.tagName}.${typeof hit.className === 'string' ? hit.className : ''}` : null });
      }
    }
    return blocked;
  }, label);
}

async function readMenu(page) {
  return await page.evaluate(() => {
    const cover = document.querySelector('img.menu-cover');
    const ui = document.getElementById('ui')?.getBoundingClientRect();
    const result = { cover: null, oldHeroEmblem: [] };
    if (cover) {
      const rect = cover.getBoundingClientRect();
      const style = getComputedStyle(cover);
      let brightness = null;
      let variance = null;
      let chroma = null;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        context.drawImage(cover, 0, 0, 160, 90);
        const data = context.getImageData(0, 0, 160, 90).data;
        let sum = 0, sumSquares = 0, chromaSum = 0;
        for (let index = 0; index < data.length; index += 4) {
          const luma = (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) / 255;
          sum += luma;
          sumSquares += luma * luma;
          chromaSum += Math.max(data[index], data[index + 1], data[index + 2]) - Math.min(data[index], data[index + 1], data[index + 2]);
        }
        const pixels = data.length / 4;
        brightness = sum / pixels;
        variance = sumSquares / pixels - brightness * brightness;
        chroma = chromaSum / pixels / 255;
      } catch { /* a tainted/zero-size image is reported through the fields */ }
      result.cover = {
        src: cover.getAttribute('src'),
        currentSrc: cover.currentSrc,
        complete: cover.complete,
        naturalWidth: cover.naturalWidth,
        naturalHeight: cover.naturalHeight,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        insideUi: Boolean(ui) && rect.left >= ui.left - 1 && rect.top >= ui.top - 1 && rect.right <= ui.right + 1 && rect.bottom <= ui.bottom + 1,
        visible: rect.width > 200 && rect.height > 100 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05,
        brightness,
        variance,
        chroma,
      };
    }
    for (const element of document.querySelectorAll('.hero-emblem')) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 1 && rect.height > 1) result.oldHeroEmblem.push({ kind: 'class', className: String(element.className), width: rect.width, height: rect.height });
    }
    for (const image of document.querySelectorAll('.menu-screen img')) {
      const source = image.getAttribute('src') ?? '';
      if (/emblem\.svg/i.test(source)) {
        const rect = image.getBoundingClientRect();
        if (Math.max(rect.width, rect.height) > 120) result.oldHeroEmblem.push({ kind: 'large-emblem', src: source, width: rect.width, height: rect.height });
      }
    }
    return result;
  });
}

async function bugThumbnails(page) {
  return await page.evaluate(() => {
    const ui = document.getElementById('ui');
    if (!ui) return [];
    return [...ui.querySelectorAll('img')]
      .filter(image => /bug-(agile|fast|strong)(?:-\d)?\.svg/i.test(image.getAttribute('src') ?? image.currentSrc))
      .map(image => {
        const rect = image.getBoundingClientRect();
        const style = getComputedStyle(image);
        let crop = null;
        // An <img> reports overflow:clip in Edge by default; that is not a real
        // single-frame crop. Start at the parent so .bug-frame is found.
        let ancestor = image.parentElement;
        for (let depth = 0; ancestor && depth < 4; depth++, ancestor = ancestor.parentElement) {
          const computed = getComputedStyle(ancestor);
          const bounds = ancestor.getBoundingClientRect();
          if (computed.overflow !== 'visible' && bounds.width > 0 && bounds.height > 0) {
            crop = { width: bounds.width, height: bounds.height, overflow: computed.overflow, tag: ancestor.tagName, className: String(ancestor.className) };
            break;
          }
        }
        return {
          src: image.getAttribute('src'),
          currentSrc: image.currentSrc,
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          box: { width: rect.width, height: rect.height },
          objectFit: style.objectFit,
          objectPosition: style.objectPosition,
          crop,
        };
      });
  });
}

async function campaignState(page) {
  return await page.evaluate(() => {
    const acts = [...document.querySelectorAll('.act-index > *')].map(element => element.textContent?.trim() ?? '');
    const levels = [...document.querySelectorAll('.level-card')];
    const layout = document.querySelector('.campaign-layout')?.getBoundingClientRect();
    const ui = document.getElementById('ui')?.getBoundingClientRect();
    return {
      acts,
      levels: levels.length,
      disabledLevels: levels.filter(level => level.hasAttribute('disabled')).length,
      layoutInsideUi: Boolean(layout && ui) && layout.left >= ui.left - 1 && layout.top >= ui.top - 1 && layout.right <= ui.right + 1 && layout.bottom <= ui.bottom + 1,
    };
  });
}

async function openModal(page, action, screenshotName, expectedSelector, expectedCount) {
  await page.locator(`[data-action=${action}]`).first().click();
  await page.waitForSelector('#modal .modal-card');
  const state = await page.evaluate(selector => {
    const modal = document.getElementById('modal');
    const card = modal?.querySelector('.modal-card');
    const close = modal?.querySelector('.modal-close');
    if (!modal || !card || !close) return { present: false };
    const cardRect = card.getBoundingClientRect();
    const closeRect = close.getBoundingClientRect();
    const hit = document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2);
    return {
      present: true,
      cardInsideViewport: cardRect.left >= -1 && cardRect.top >= -1 && cardRect.right <= innerWidth + 1 && cardRect.bottom <= innerHeight + 1,
      cardInsideUi: (() => { const ui = document.getElementById('ui')?.getBoundingClientRect(); return Boolean(ui) && cardRect.left >= ui.left - 1 && cardRect.top >= ui.top - 1 && cardRect.right <= ui.right + 1 && cardRect.bottom <= ui.bottom + 1; })(),
      closeHit: Boolean(hit && (hit === close || close.contains(hit))),
      matches: modal.querySelectorAll(selector).length,
      card: { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height },
    };
  }, expectedSelector);
  check(`modal ${action} is visible inside the viewport`, state.present && state.cardInsideViewport && state.cardInsideUi && state.closeHit, state);
  if (expectedCount !== undefined) check(`modal ${action} has ${expectedCount} expected content blocks`, state.matches === expectedCount, { matches: state.matches });
  await shot(page, screenshotName);
  const modalReport = { action, ...state };
  report.modals.push(modalReport);
  await page.locator('#modal .modal-close').click();
  await page.waitForFunction(() => !document.getElementById('modal'));
  return state;
}

async function measureNumberPlate(page, colonyId) {
  return await page.evaluate(id => {
    const app = window.__BUGWAR__;
    const scene = app.scene;
    const colony = scene.sim.world.colonies.find(item => item.id === id);
    const view = scene.views.get(id);
    if (!colony || !view) return { found: false, reason: 'colony/view missing' };
    const number = view.number.getBounds();
    const ui = document.getElementById('ui').getBoundingClientRect();
    const scale = ui.height / 900;
    const hud = document.querySelector('.battle-bottom')?.getBoundingClientRect();
    const hudTop = hud ? (hud.top - ui.top) / scale : null;

    let plate = null;
    let plateSource = null;
    if (view.plate?.getBounds) {
      const bounds = view.plate.getBounds();
      plate = { left: bounds.x, top: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height };
      plateSource = 'views.plate';
    } else {
      const luma = color => {
        const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      };
      const candidates = [];
      for (const object of scene.children.list) {
        const buffer = object.commandBuffer;
        if (!Array.isArray(buffer)) continue;
        let fill = 0xffffff;
        let points = [];
        const push = (x, y) => { if (Number.isFinite(x) && Number.isFinite(y)) points.push([x, y]); };
        for (let index = 0; index < buffer.length;) {
          const command = buffer[index++];
          if (command === 0) { // ARC
            const x = buffer[index++], y = buffer[index++], radius = buffer[index++];
            index += 4;
            push(x - radius, y - radius);
            push(x + radius, y + radius);
          } else if (command === 1) { // BEGIN_PATH
            points = [];
          } else if (command === 2) { // CLOSE_PATH
            // closedness is implied by every FILL_PATH
          } else if (command === 3) { // FILL_RECT
            const x = buffer[index++], y = buffer[index++], width = buffer[index++], height = buffer[index++];
            candidates.push({ left: x, top: y, right: x + width, bottom: y + height, width, height, color: fill, luma: luma(fill) });
          } else if (command === 4 || command === 5) { // LINE_TO / MOVE_TO
            const x = buffer[index++], y = buffer[index++];
            push(x, y);
          } else if (command === 6) { // LINE_STYLE
            index += 3;
          } else if (command === 7) { // FILL_STYLE
            fill = buffer[index++];
            index += 1;
          } else if (command === 8) { // FILL_PATH
            if (points.length) {
              const xs = points.map(point => point[0]);
              const ys = points.map(point => point[1]);
              const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
              candidates.push({ left, top, right, bottom, width: right - left, height: bottom - top, color: fill, luma: luma(fill) });
            }
            points = [];
          } else if (command === 9) { // STROKE_PATH
            // no fill payload
          } else if (command === 10 || command === 11) { // triangles
            index += 6;
          } else if (command === 14 || command === 15) { // SAVE / RESTORE
            // no payload
          } else if (command === 16 || command === 17) { // TRANSLATE / SCALE
            index += 2;
          } else if (command === 18) { // ROTATE
            index += 1;
          } else if (command === 21) { // GRADIENT_FILL_STYLE
            index += 8;
          } else if (command === 22) { // GRADIENT_LINE_STYLE
            index += 6;
          } else {
            break; // unknown command: stop instead of desynchronising the buffer
          }
        }
      }
      const centerX = number.centerX;
      const centerY = number.centerY;
      const plausible = candidates.filter(candidate =>
        centerX >= candidate.left - 0.5 && centerX <= candidate.right + 0.5 &&
        centerY >= candidate.top - 0.5 && centerY <= candidate.bottom + 0.5 &&
        candidate.width >= 36 && candidate.width <= 220 && candidate.height >= 14 && candidate.height <= 80,
      );
      plausible.sort((left, right) => (right.luma - left.luma) || (left.width * left.height - right.width * right.height));
      if (plausible.length) {
        plate = plausible[0];
        plateSource = 'graphics';
      }
    }

    const result = {
      found: true,
      owner: view.owner,
      texture: view.image.texture?.key,
      units: colony.units,
      number: {
        left: number.left, top: number.top, right: number.right, bottom: number.bottom,
        width: number.width, height: number.height, centerX: number.centerX, centerY: number.centerY,
        text: view.number.text,
        fontSize: view.number.style?.fontSize ?? null,
      },
      plate,
      plateSource,
      hudTop,
      candidates: plate ? undefined : null,
    };
    if (plate) {
      const padding = 2;
      result.plateInField = plate.left >= -1 && plate.top >= -1 && plate.right <= 1601 && (hudTop === null || plate.bottom <= hudTop + 1);
      result.numberInsidePlate =
        number.left >= plate.left + padding - 1 && number.right <= plate.right - padding + 1 &&
        number.top >= plate.top + padding - 1 && number.bottom <= plate.bottom - padding + 1;
      result.usableWidth = plate.width - padding * 2;
      result.numberFitsWidth = number.width <= result.usableWidth + 0.5;
    }
    return result;
  }, colonyId);
}

function formatUnits(value) {
  const n = Math.max(0, Number.isFinite(value) ? value : 0);
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.floor(n));
}

async function layoutRows(page) {
  return await page.evaluate(() => {
    const app = window.__BUGWAR__;
    const rows = [];
    for (let index = 0; index < 13; index++) {
      app.start(index);
      const ui = document.getElementById('ui').getBoundingClientRect();
      const scale = ui.height / 900;
      const rect = element => {
        const bounds = element.getBoundingClientRect();
        return { x: (bounds.left - ui.left) / scale, y: (bounds.top - ui.top) / scale, width: bounds.width / scale, height: bounds.height / scale };
      };
      const intersects = (a, b) => a.x < b.x + b.width - 1e-6 && a.x + a.width > b.x + 1e-6 && a.y < b.y + b.height - 1e-6 && a.y + a.height > b.y + 1e-6;
      const tip = document.getElementById('battle-tip');
      const grace = document.getElementById('opening-grace');
      const topElement = document.querySelector('.battle-top');
      const bottomElement = document.querySelector('.battle-bottom');
      const titleElement = document.querySelector('.battle-title');
      const scoresElement = document.getElementById('faction-scores');
      const top = rect(topElement);
      const bottom = rect(bottomElement);
      const tipRect = tip ? rect(tip) : null;
      const graceRect = grace && !grace.hidden ? rect(grace) : null;
      const obstacles = [];
      if (tipRect) obstacles.push({ name: 'battle-tip', ...tipRect });
      if (graceRect) obstacles.push({ name: 'opening-grace', ...graceRect });
      const badgeClashes = [];
      const numberIssues = [];
      const outOfField = [];
      let maxNumberBottom = 0;
      for (const [id, view] of app.scene.views) {
        const badge = view.badge.getBounds();
        const number = view.number.getBounds();
        maxNumberBottom = Math.max(maxNumberBottom, number.bottom);
        for (const obstacle of obstacles) if (intersects(badge, obstacle)) badgeClashes.push({ id, obstacle: obstacle.name });
        if (intersects(badge, top)) badgeClashes.push({ id, obstacle: 'battle-top' });
        if (intersects(badge, bottom)) badgeClashes.push({ id, obstacle: 'battle-bottom' });
        if (number.bottom >= bottom.y) numberIssues.push({ id, bottom: number.bottom, hudTop: bottom.y });
        if (badge.x < 0 || badge.y < 0 || badge.right > 1600 || badge.bottom > 900) outOfField.push({ id, kind: 'badge' });
        if (number.x < 0 || number.y < 0 || number.right > 1600 || number.bottom > 900) outOfField.push({ id, kind: 'number' });
      }
      const headerClear = titleElement && scoresElement
        ? titleElement.getBoundingClientRect().right <= scoresElement.getBoundingClientRect().left + 1
        : false;
      rows.push({
        level: index + 1,
        name: app.scene.level?.name ?? null,
        colonies: app.scene.views.size,
        maxNumberBottom: Number(maxNumberBottom.toFixed(2)),
        hudTop: Number(bottom.y.toFixed(2)),
        badgeClashes,
        numberIssues,
        outOfField,
        headerClear,
        tipClear: !tipRect || (tipRect.y > top.y + top.height && tipRect.y + tipRect.height < bottom.y),
        tipGraceOverlap: Boolean(tipRect && graceRect && intersects(tipRect, graceRect)),
        graceVisible: Boolean(graceRect),
      });
    }
    return rows;
  });
}

async function hudGeometry(page) {
  return await page.evaluate(() => {
    const ui = document.getElementById('ui');
    const rect = element => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const uiRect = ui.getBoundingClientRect();
    const topSelectors = ['.battle-back', '.battle-title', '#faction-scores', '.battle-clock', '.battle-top [data-action=settings]'];
    const bottomSelectors = ['.selection-info', '.dispatch-panel', '.skill-button', '.bottom-help'];
    const missing = [];
    const elements = [];
    for (const selector of [...topSelectors, ...bottomSelectors]) {
      const element = document.querySelector(selector);
      if (!element) { missing.push(selector); continue; }
      elements.push({ selector, ...rect(element) });
    }
    const overlaps = [];
    for (let left = 0; left < elements.length; left++) {
      for (let right = left + 1; right < elements.length; right++) {
        const a = elements[left], b = elements[right];
        const horizontal = a.x < b.x + b.width - 1 && a.x + a.width > b.x + 1;
        const vertical = a.y < b.y + b.height - 1 && a.y + a.height > b.y + 1;
        if (horizontal && vertical) overlaps.push(`${a.selector} x ${b.selector}`);
      }
    }
    const outsideUi = elements.filter(element =>
      element.x < uiRect.left - 1 || element.y < uiRect.top - 1 ||
      element.x + element.width > uiRect.right + 1 || element.y + element.height > uiRect.bottom + 1,
    ).map(element => element.selector);
    const tip = document.querySelector('#battle-tip');
    const grace = document.querySelector('#opening-grace');
    const bottom = document.querySelector('.battle-bottom');
    const tipRect = tip ? rect(tip) : null;
    const graceRect = grace && !grace.hidden ? rect(grace) : null;
    const tipClear = !tipRect || !bottom || tipRect.y + tipRect.height < bottom.getBoundingClientRect().top;
    const tipGraceOverlap = Boolean(tipRect && graceRect &&
      tipRect.x < graceRect.x + graceRect.width && tipRect.x + tipRect.width > graceRect.x &&
      tipRect.y < graceRect.y + graceRect.height && tipRect.y + tipRect.height > graceRect.y);
    const canvas = document.querySelector('canvas');
    return { missing, overlaps, outsideUi, tipClear, tipGraceOverlap, canvasVisible: Boolean(canvas && canvas.getBoundingClientRect().width > 0 && canvas.getBoundingClientRect().height > 0), elements };
  });
}

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  let server;
  let browser;
  try {
    server = await startServer();
    browser = await chromium.launch(launchOptions());
    report.edge = { executablePath: EDGE, version: browser.version(), headless: true };
    const context = await browser.newContext({ viewport: VIEWPORTS[0], deviceScaleFactor: 1 });

    // Normal URL: the test hook must only exist with ?test=1.
    const normal = await context.newPage();
    attachDiagnostics(normal, 'normal');
    await normal.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
    await normal.waitForSelector('.menu-screen', { timeout: 15000 });
    const hook = await normal.evaluate(() => typeof window.__BUGWAR__);
    must('normal URL does not expose the test hook', hook === 'undefined', { url: `${ORIGIN}/`, typeofHook: hook });
    await normal.close();

    const page = await context.newPage();
    // Observation only: forward the original request/signal unchanged. Capture
    // cancellation-time intent before rapid fixtures can change it again.
    await page.addInitScript(() => {
      const originalFetch = window.fetch.bind(window);
      window.__VISUAL_AUDIO_ABORTS__ = [];
      window.fetch = (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href).href;
        if (/\/audio\/music-(?:meadow|roots|marsh|amber|finale)-(?:base|motion|power)\.(?:ogg|mp3)$/.test(url)) {
          init?.signal?.addEventListener('abort', () => {
            window.__VISUAL_AUDIO_ABORTS__.push({ url,
              wantedCue: window.__BUGWAR__?.music.diagnostics().cue ?? null, at: performance.now() });
          }, { once: true });
        }
        return originalFetch(input, init);
      };
    });
    attachDiagnostics(page, 'test');
    const coverResponses = [];
    page.on('response', response => {
      if (/\/art\/cover\.svg(?:\?|$)/.test(response.url())) {
        coverResponses.push({ status: response.status(), contentType: response.headers()['content-type'] ?? '', url: response.url() });
      }
    });
    await page.goto(TEST_URL, { waitUntil: 'domcontentloaded' });
    await waitForGame(page);
    await page.waitForTimeout(300);

    // 1. Approved cover, real pixels, and no old hero emblem.
    await page.waitForFunction(() => {
      const image = document.querySelector('img.menu-cover');
      return Boolean(image && image.complete && image.naturalWidth === 1600 && image.naturalHeight === 900);
    }, undefined, { timeout: 15000 }).catch(() => {});
    const menu = await readMenu(page);
    report.menu = { ...menu, coverResponses };
    must('approved cover img.menu-cover exists', Boolean(menu.cover), menu);
    const cover = menu.cover;
    must('approved cover has src art/cover.svg', Boolean(cover) && /art\/cover\.svg$/i.test(cover.currentSrc || cover.src || ''), cover);
    must('approved cover decodes at 1600x900', Boolean(cover) && cover.complete && cover.naturalWidth === 1600 && cover.naturalHeight === 900, cover);
    must('approved cover is visible inside #ui', Boolean(cover) && cover.visible && cover.insideUi, cover);
    must('cover.svg request is a successful SVG response', coverResponses.some(response => response.status === 200 && /image\/svg\+xml/i.test(response.contentType)), coverResponses);
    must('approved cover renders as bright sunlit pixels, not a dark placeholder', Boolean(cover) && cover.brightness !== null && cover.brightness >= BOUNDARIES.minCoverBrightness, { brightness: cover?.brightness, variance: cover?.variance, chroma: cover?.chroma });
    must('menu no longer shows the old hero emblem', menu.oldHeroEmblem.length === 0, menu.oldHeroEmblem);
    await shot(page, '1920-menu');

    const shownThumbs = await bugThumbnails(page);
    check('menu has no full-sheet bug thumbnails', shownThumbs.every(thumbnail => thumbnail.box.height === 0 || thumbnail.box.width / thumbnail.box.height < 1.2), shownThumbs);

    // 2. Modals from the menu.  These are real UI interactions, not fixtures.
    await openModal(page, 'lore', '1920-modal-lore', '.lore-grid article', 4);
    await openModal(page, 'help', '1920-modal-help', '.guide-grid article', 4);
    await openModal(page, 'settings', '1920-modal-settings', '[data-setting=difficulty]', 1);
    await openModal(page, 'achievements', '1920-modal-achievements', '.achievement', 12);
    await openModal(page, 'credits', '1920-modal-credits', '.credits-columns article', 2);

    // 3. Campaign: four acts, 13 levels, no layout clipping at the large size.
    await page.locator('[data-action=campaign]').first().click();
    await page.waitForSelector('.campaign-screen');
    const campaign = await campaignState(page);
    report.campaign = campaign;
    must('campaign lists four acts', campaign.acts.length === 4 && campaign.acts.every(act => act.length > 0), campaign.acts);
    must('campaign renders 13 level cards', campaign.levels === 13, campaign.levels);
    must('campaign layout stays inside #ui', campaign.layoutInsideUi, campaign);
    await shot(page, '1920-campaign');
    const campaignThumbs = await bugThumbnails(page);
    must('campaign UI uses the default blue unit sheet', campaignThumbs.length > 0 && campaignThumbs.every(thumbnail => /bug-(agile|fast|strong)\.svg$/i.test(thumbnail.src ?? '')), campaignThumbs);
    must('campaign UI crops unit sheets to one 24x32 frame', campaignThumbs.every(thumbnail => {
      const box = thumbnail.crop ?? thumbnail.box;
      return box.height > 0 && box.width / box.height < 1.2;
    }), campaignThumbs);
    must('campaign unit thumbnails decode as 96x32 sheets', campaignThumbs.every(thumbnail => thumbnail.naturalWidth === 96 && thumbnail.naturalHeight === 32), campaignThumbs);

    // Fixtures below mutate a ?test=1 world; they are explicitly not natural play.
    fixture('multi-faction + three unit races', 'Owners 1-4 receive boosted units and direct Simulation.dispatch orders while paused; verifies owner-specific textures and all three unit sheets are visible. Not a natural match.', { level: 9, owners: [1, 2, 3, 4], races: ['agile', 'fast', 'strong'] });
    fixture('capture texture switch', 'A single colony is boosted and dispatched by the test into a neutral nest; the capture itself resolves normally, but the setup is synthetic. Not a natural clear.', { level: 1, source: 'a', target: 'b' });
    fixture('extreme number plate', 'Display-only units injection (up to 1e12) on one colony to verify the number shrinks inside its plate. Not a gameplay/balance check.', { values: [38, 12345, 1e9, 1e12] });
    fixture('victory/defeat result screens', 'Ownership is forced through the test hook; verifies result UI and labels only, not a natural completion.', { victory: 'all colonies owner=1', defeat: 'all colonies owner=2' });

    // 4. All 13 live layouts: numbers above HUD, badges clear of hints/HUD, header clear.
    await page.evaluate(() => {
      const app = window.__BUGWAR__;
      for (let level = 1; level <= 13; level++) app.save.data.results.agile[level] = { stars: 3, time: 60, lost: 0 };
    });
    await page.evaluate(() => window.__BUGWAR__.start(0));
    await page.waitForSelector('.battle-screen');
    await page.waitForTimeout(250);
    await shot(page, '1920-battle');
    syntheticMusicAbortPhase = '13 layouts and three chapter screenshot switches';
    const layouts = await layoutRows(page);
    report.layouts = layouts;
    for (const row of layouts) {
      check(`level ${row.level} unit numbers stay above the HUD`, row.numberIssues.length === 0 && row.maxNumberBottom < row.hudTop, row);
      check(`level ${row.level} badges do not overlap tips/HUD`, row.badgeClashes.length === 0 && row.outOfField.length === 0, row);
      check(`level ${row.level} battle tip is clear of header, HUD and opening grace`, row.tipClear && !row.tipGraceOverlap, row);
      check(`level ${row.level} header title and faction scores do not overlap`, row.headerClear, row);
    }
    for (const index of [4, 7, 12]) {
      await page.evaluate(level => window.__BUGWAR__.start(level), index);
      await page.waitForTimeout(150);
      await shot(page, `level-${String(index + 1).padStart(2, '0')}`);
    }

    // 5. Multi-owner / all three race sheets, on level 9 (four factions).
    await page.evaluate(() => { window.__BUGWAR__.start(8); window.__BUGWAR__.scene.paused = true; });
    await page.waitForSelector('.battle-screen');
    await page.waitForFunction(() => { const d = window.__BUGWAR__.audio.diagnostics();
      return d.pendingLoads === 0 && !d.crossfading;
    }, undefined, { timeout: 45000 });
    syntheticMusicAbortPhase = null;
    const multi = await page.evaluate(() => {
      const app = window.__BUGWAR__;
      const scene = app.scene;
      scene.paused = true;
      const world = scene.sim.world;
      const target = world.colonies.find(colony => colony.owner === 0);
      world.colonies.forEach(colony => { if (colony.owner > 0) colony.units = 800; });
      const owners = [...new Set(world.colonies.map(colony => colony.owner).filter(owner => owner > 0))].sort();
      for (const owner of owners) {
        const source = world.colonies.find(colony => colony.owner === owner && colony.kind === 'nest') ?? world.colonies.find(colony => colony.owner === owner);
        if (source && target) scene.sim.dispatch([source.id], target.id, 0.5, owner);
      }
      // Paused synthetic positioning: stage the already-dispatched fleets midway
      // along their routes so the screenshot can actually show every army away
      // from its roof. This is not evidence of real elapsed travel or balance.
      for (const fleet of world.fleets) {
        const source = world.colonies.find(colony => colony.id === fleet.from);
        const destination = world.colonies.find(colony => colony.id === fleet.to);
        fleet.x = (source.x + destination.x) / 2;
        fleet.y = (source.y + destination.y) / 2;
      }
      return { owners, colonies: world.colonies.length, races: world.factions.map(faction => faction.race), positionSetup: 'Synthetic paused fleets staged halfway along their dispatched routes; not real elapsed travel.' };
    });
    await page.waitForTimeout(350);
    const textures = await page.evaluate(() => {
      const scene = window.__BUGWAR__.scene;
      const world = scene.sim.world;
      const views = [...scene.views.entries()].map(([id, view]) => {
        const colony = world.colonies.find(item => item.id === id);
        return {
          id,
          owner: view.owner,
          kind: colony?.kind,
          expectedOwner: colony?.owner,
          texture: view.image.texture?.key,
          hasImage: Boolean(view.image), hasNumber: Boolean(view.number), hasBadge: Boolean(view.badge),
          number: view.number?.text, badge: view.badge?.text,
          tint: view.image?.tintTopLeft,
          visible: view.image?.visible !== false && view.image?.alpha > 0,
        };
      });
      const sprites = [];
      for (const [fleetId, list] of scene.bugs) for (const sprite of list) sprites.push({ fleetId, texture: sprite.texture?.key, tint: sprite.tintTopLeft, visible: sprite.visible && sprite.alpha > 0 });
      return {
        views,
        fleets: world.fleets.map(fleet => ({ id: fleet.id, owner: fleet.owner, race: fleet.race, count: fleet.count })),
        sprites,
        visualUnits: scene.visualUnits,
        races: world.factions.map(faction => faction.race),
      };
    });
    report.textures = { fixture: 'multi-faction', ...multi, ...textures };
    must('every colony view still exposes image/number/badge and owner', textures.views.length > 0 && textures.views.every(view => view.hasImage && view.hasNumber && view.hasBadge && Number.isInteger(view.owner)), textures.views);
    must('owner textures are used for every colony rather than one tinted sheet', textures.views.every(view => {
      const match = /^(nest|cannon)-(\d+)$/.exec(view.texture ?? '');
      const legacy = (view.texture === 'nest' || view.texture === 'cannon') && view.expectedOwner === 0;
      return (match && Number(match[2]) === view.expectedOwner && match[1] === view.kind) || legacy;
    }), textures.views);
    must('colony textures are not globally tinted', textures.views.every(view => view.tint === undefined || view.tint === 0xffffff), textures.views);
    must('multi-faction fixture shows owners 1-4 on the battlefield', [1, 2, 3, 4].every(owner => textures.views.some(view => view.owner === owner)), textures.views.map(view => view.owner));
    must('multi-faction fixture exposes all three unit races', ['agile', 'fast', 'strong'].every(race => textures.fleets.some(fleet => fleet.race === race) && textures.sprites.some(sprite => sprite.texture?.startsWith(`bug-${race}-`))), textures);
    must('fleet sprites use owner-specific race textures', textures.sprites.length > 0 && textures.sprites.every(sprite => {
      const fleet = textures.fleets.find(fleet => fleet.id === sprite.fleetId);
      return fleet && sprite.texture === `bug-${fleet.race}-${fleet.owner}`;
    }), textures.sprites.slice(0, 20));
    must('fleet sprites are not globally tinted', textures.sprites.every(sprite => sprite.tint === undefined || sprite.tint === 0xffffff), textures.sprites.slice(0, 20));
    must('multi-faction screenshot has visible unit sprites', textures.sprites.length > 0 && textures.sprites.every(sprite => sprite.visible) && textures.visualUnits > 0, { sprites: textures.sprites.length, visualUnits: textures.visualUnits });
    await shot(page, '1920-multi-faction');

    // 6. Real capture resolution, synthetic setup: texture and number must switch.
    await page.evaluate(() => window.__BUGWAR__.start(0));
    await page.waitForSelector('.battle-screen');
    await page.waitForTimeout(150);
    const beforeCapture = await page.evaluate(() => {
      const app = window.__BUGWAR__;
      const scene = app.scene;
      const target = scene.sim.world.colonies.find(colony => colony.id === 'b');
      const source = scene.sim.world.colonies.find(colony => colony.id === 'a');
      source.units = 300;
      const result = { targetTexture: scene.views.get('b')?.image?.texture?.key, targetOwner: target?.owner, sourceUnits: source.units, targetUnits: target?.units };
      scene.sim.dispatch(['a'], 'b', 1, 1);
      return result;
    });
    await page.waitForFunction(() => window.__BUGWAR__.scene.sim.world.colonies.find(colony => colony.id === 'b')?.owner === 1, undefined, { timeout: 20000 });
    await page.waitForFunction(() => {
      const view = window.__BUGWAR__.scene.views.get('b');
      return Boolean(view && view.owner === 1 && /^nest-1$/.test(view.image?.texture?.key ?? ''));
    }, undefined, { timeout: 5000 });
    const afterCapture = await page.evaluate(() => {
      const app = window.__BUGWAR__;
      const scene = app.scene;
      const colony = scene.sim.world.colonies.find(item => item.id === 'b');
      colony.units = 1234;
      return {
        targetTexture: scene.views.get('b')?.image?.texture?.key,
        targetOwner: colony.owner,
        badge: scene.views.get('b')?.badge?.text,
        numberBefore: scene.views.get('b')?.number?.text,
      };
    });
    await page.waitForTimeout(250);
    const numberAfter = await page.evaluate(() => {
      const scene = window.__BUGWAR__.scene;
      return { number: scene.views.get('b')?.number?.text, units: scene.sim.world.colonies.find(colony => colony.id === 'b')?.units };
    });
    report.textures.capture = { beforeCapture, afterCapture, numberAfter };
    must('capture switches the target to the owner-1 nest texture', /^nest-1$/.test(afterCapture.targetTexture ?? ''), { beforeCapture, afterCapture });
    must('capture updates the ownership badge', /己方/.test(afterCapture.badge ?? ''), afterCapture.badge);
    must('number plate text updates after capture', numberAfter.number === formatUnits(numberAfter.units), { number: numberAfter.number, units: numberAfter.units });
    await shot(page, '1920-capture-owner');

    // 7. Extreme display-only numbers must remain inside the white plate.
    await page.evaluate(() => {
      const app = window.__BUGWAR__;
      if (app.scene.sim) app.scene.paused = true;
    });
    const extremeValues = [38, 12345, 1e9, 1e12];
    const extreme = [];
    for (const value of extremeValues) {
      await page.evaluate(units => {
        const colony = window.__BUGWAR__.scene.sim.world.colonies.find(item => item.id === 'a');
        if (colony) colony.units = units;
        window.__BUGWAR__.scene.paused = true;
      }, value);
      await page.waitForTimeout(180);
      const measured = await measureNumberPlate(page, 'a');
      measured.requested = value;
      measured.formatted = formatUnits(value);
      extreme.push(measured);
      check(`number ${formatUnits(value)} fits its plate`, measured.found && measured.numberFitsWidth && measured.numberInsidePlate && measured.plateInField, measured);
      must(`number ${formatUnits(value)} renders the formatted text`, measured.found && measured.number.text === formatUnits(value), measured);
    }
    report.extremeNumbers = { fixture: 'display-only extreme units', values: extreme };
    await shot(page, '1920-extreme-number');

    // 8. Explicit result-screen fixtures (not natural clears).
    await page.evaluate(() => {
      const app = window.__BUGWAR__;
      app.start(0);
      const world = app.scene.sim.world;
      world.colonies.forEach(colony => { colony.owner = 1; });
      world.fleets = world.fleets.filter(fleet => fleet.owner === 1);
      app.scene.sim.checkEnd?.();
    });
    await page.waitForSelector('.result-card.won', { timeout: 10000 });
    const victory = await page.evaluate(() => ({
      className: document.querySelector('.result-card')?.className,
      title: document.querySelector('.result-card h1')?.textContent,
      stats: [...document.querySelectorAll('.result-stats strong')].map(element => element.textContent),
    }));
    report.results = { victory: { fixture: 'forced ownership', ...victory } };
    check('victory fixture shows the won result card', /won/.test(victory.className ?? '') && Boolean(victory.title), victory);
    await shot(page, '1920-victory-fixture');

    await page.evaluate(() => {
      const app = window.__BUGWAR__;
      app.start(0);
      const world = app.scene.sim.world;
      world.colonies.forEach(colony => { if (colony.owner === 1) colony.owner = 2; });
      world.fleets = world.fleets.filter(fleet => fleet.owner !== 1);
      app.scene.sim.checkEnd?.();
    });
    await page.waitForSelector('.result-card.lost', { timeout: 10000 });
    const defeat = await page.evaluate(() => ({
      className: document.querySelector('.result-card')?.className,
      title: document.querySelector('.result-card h1')?.textContent,
      stats: [...document.querySelectorAll('.result-stats strong')].map(element => element.textContent),
    }));
    report.results.defeat = { fixture: 'forced ownership', ...defeat };
    check('defeat fixture shows the lost result card', /lost/.test(defeat.className ?? '') && Boolean(defeat.title), defeat);
    await shot(page, '1920-defeat-fixture');

    // 9. Menu / battle / modal at all three viewports.
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(180);
      await page.evaluate(() => window.__BUGWAR__.renderMenu());
      await page.waitForSelector('.menu-screen');
      await page.waitForTimeout(120);
      await shot(page, `${viewport.width}-menu`);
      const menuState = await readMenu(page);
      const menuCover = menuState.cover;
      const menuBlocked = await hitTest(page, `menu@${viewport.width}`);
      check(`${viewport.width} menu cover remains visible and decoded`, Boolean(menuCover) && menuCover.complete && menuCover.visible, menuCover);
      check(`${viewport.width} menu controls are not clipped or covered`, menuBlocked.length === 0, menuBlocked);
      check(`${viewport.width} menu cover paints real pixels`, Boolean(menuCover) && menuCover.brightness >= BOUNDARIES.minCoverBrightness, menuCover);

      await page.evaluate(() => window.__BUGWAR__.start(0));
      await page.waitForSelector('.battle-screen');
      await page.waitForTimeout(250);
      await shot(page, `${viewport.width}-battle`);
      const hud = await hudGeometry(page);
      const battleBlocked = await hitTest(page, `battle@${viewport.width}`);
      const numberBottom = await page.evaluate(() => {
        const scene = window.__BUGWAR__.scene;
        const ui = document.getElementById('ui').getBoundingClientRect();
        const scale = ui.height / 900;
        const bottom = document.querySelector('.battle-bottom').getBoundingClientRect();
        return {
          max: Math.max(...[...scene.views.values()].map(view => view.number.getBounds().bottom)),
          hudTop: (bottom.top - ui.top) / scale,
        };
      });
      check(`${viewport.width} battle HUD sections do not overlap`, hud.overlaps.length === 0 && hud.missing.length === 0, hud);
      check(`${viewport.width} battle controls stay inside #ui`, hud.outsideUi.length === 0 && battleBlocked.length === 0, { outsideUi: hud.outsideUi, blocked: battleBlocked });
      check(`${viewport.width} battle tip and opening grace are clear of the HUD`, hud.tipClear && !hud.tipGraceOverlap && hud.canvasVisible, hud);
      check(`${viewport.width} battle numbers stay above the HUD`, numberBottom.max < numberBottom.hudTop, numberBottom);
      report.viewports.push({ ...viewport, menu: { cover: menuCover, blocked: menuBlocked }, battle: { hud, blocked: battleBlocked, numberBottom } });

      await page.locator('[data-action=settings]').first().click();
      await page.waitForSelector('#modal .modal-card');
      const modal = await page.evaluate(() => {
        const card = document.querySelector('#modal .modal-card');
        const close = document.querySelector('#modal .modal-close');
        const cardRect = card.getBoundingClientRect();
        const closeRect = close.getBoundingClientRect();
        const hit = document.elementFromPoint(closeRect.left + closeRect.width / 2, closeRect.top + closeRect.height / 2);
        return {
          insideViewport: cardRect.left >= -1 && cardRect.top >= -1 && cardRect.right <= innerWidth + 1 && cardRect.bottom <= innerHeight + 1,
          closeHit: Boolean(hit && (hit === close || close.contains(hit))),
          card: { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height },
        };
      });
      check(`${viewport.width} settings modal fits the viewport without occlusion`, modal.insideViewport && modal.closeHit, modal);
      await shot(page, `${viewport.width}-modal`);
      report.viewports[report.viewports.length - 1].modal = modal;
      await page.locator('#modal .modal-close').click();
      await page.waitForFunction(() => !document.getElementById('modal'));
    }

    // Do not count teardown of a still-loading current cue as a product failure.
    // Finish its real download/decode first; failures of a wanted cue remain fatal.
    await page.waitForFunction(() => window.__BUGWAR__.audio.diagnostics().pendingLoads === 0, undefined, { timeout: 45000 });
    await page.waitForLoadState('networkidle', { timeout: 45000 });
    await Promise.all(MUSIC_CANCELLATION_CHECKS);
    report.passed = true;
  } catch (error) {
    report.error = String(error?.stack ?? error);
  } finally {
    await Promise.all(MUSIC_CANCELLATION_CHECKS);
    try { if (browser) await browser.close(); } catch (error) { PAGE_ERRORS.push(`browser close: ${error.message}`); }
    await stopServer(server);
    report.finishedAt = new Date().toISOString();
    report.requests = {
      pageErrors: PAGE_ERRORS,
      consoleErrors: CONSOLE_ERRORS,
      failedRequests: FAILED_REQUESTS,
      networkFailures: NETWORK_FAILURES,
      cancelledFixtureMusicRequests: CANCELLED_FIXTURE_MUSIC,
      externalRequests: EXTERNAL_REQUESTS,
    };
    const failedChecks = CHECKS.filter(entry => !entry.ok);
    report.passed = !report.error && PAGE_ERRORS.length === 0 && CONSOLE_ERRORS.length === 0 && FAILED_REQUESTS.length === 0 &&
      NETWORK_FAILURES.length === 0 && EXTERNAL_REQUESTS.length === 0 && failedChecks.length === 0;
    await fs.writeFile(REPORT_FILE, JSON.stringify(report, null, 2));
    const relative = path.relative(ROOT, REPORT_FILE).replace(/\\/g, '/');
    if (report.passed) {
      console.log(`PASS visual acceptance: ${CHECKS.length} checks, ${SCREENSHOTS.length} screenshots, 0 page errors / failed requests / external requests; ${relative} written.`);
    } else {
      console.error(`FAIL visual acceptance (${failedChecks.length} failed checks${report.error ? ', fatal error' : ''}); ${relative} written.`);
      console.error(report.error ?? failedChecks.map(entry => `${entry.name}: ${JSON.stringify(entry.detail)}`).join('\n'));
      process.exitCode = 1;
    }
  }
}

await main();
