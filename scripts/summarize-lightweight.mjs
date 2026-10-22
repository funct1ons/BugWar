import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const read = async name => JSON.parse(await fs.readFile(`test-results/${name}`, 'utf8'));
const unit = await read('lightweight-unit.json');
const raw = await fs.readFile('test-results/lightweight-unit.log');
const log = raw.toString(raw[0] === 255 && raw[1] === 254 ? 'utf16le' : 'utf8').replace(/\x1b\[[0-9;]*m/g, '');
const campaign = [];
for (const line of log.split(/\r?\n/)) {
  const start = line.indexOf('CAMPAIGN_RESULT ');
  if (start >= 0) campaign.push(...JSON.parse(line.slice(start + 'CAMPAIGN_RESULT '.length).trim()));
}
const matrix = campaign.filter(r => ['easy', 'normal'].includes(r.difficulty) && ['agile-pulse', 'fast-pulse', 'strong-pulse', 'brood-pulse'].includes(r.strategy));
if (matrix.length !== 144 || matrix.some(r => r.status !== 'won')) throw Error('Expected 144 naturally won four-race easy/normal campaign runs');
const balance = Object.fromEntries(['easy', 'normal'].map(d => {
  const rows = matrix.filter(r => r.difficulty === d);
  const times = rows.map(r => r.time).sort((a,b) => a-b);
  return [d, { runs: rows.length, wins: rows.filter(r => r.status === 'won').length, medianSeconds: (times[35]+times[36])/2, maxSeconds: times.at(-1) }];
}));
const browser = {};
await fs.mkdir('docs/verification', {recursive:true});
for (const name of ['lightweight-browser', 'browser', 'roads-codex', 'visual', 'score-browser']) {
  const report = await read(`${name}-report.json`);
  if (!report.passed || report.error || report.errors?.length || report.failedRequests?.length || report.externalRequests?.length) throw Error(`${name} failed`);
  browser[name] = { passed: true, errors: report.errors?.length ?? 0, failedRequests: report.failedRequests?.length ?? 0, externalRequests: report.externalRequests?.length ?? 0 };
  if (name === 'lightweight-browser') await fs.writeFile('docs/verification/lightweight-browser-report.json', JSON.stringify(report, null, 2) + '\n');
}
const assets = await fs.readdir('dist/assets');
const js = assets.find(n => /^index-.*\.js$/.test(n));
const sha256 = crypto.createHash('sha256').update(await fs.readFile(`dist/assets/${js}`)).digest('hex');
const summary = { testedAt: new Date().toISOString(), scope: 'Lightweight 18-map upgrade; real Edge integration plus explicitly labelled synthetic fixtures and deterministic natural campaign robots, not human playtesting.', unit: { passed: unit.numPassedTests, skipped: unit.numPendingTests, failed: unit.numFailedTests, success: unit.success }, build: {js, sha256}, browser, naturalCampaign: { methodology: 'Unmodified game simulation, legal orders, four pulse strategies across 18 levels at easy/normal; no injected captures or unit buffs.', balance, runs: matrix } };
await fs.writeFile('docs/verification/lightweight-release-summary.json', JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({unit:summary.unit, build:summary.build, browser, balance}, null, 2));
