import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { SCORE, type ScoreId, scoreSeconds } from '../src/audio/score';

interface ProductionManifest {
  source: { commit: string; treeSha: string; licenseSha256: string; samples: { path: string; sha256: string }[];
    timpaniCalibration: { samples: Record<string, { drum: number; principalModeHz: number }> } };
  renderer: { generatorSha256: string };
  cues: Record<ScoreId, { frames: number;
    files: { file: string; sha256: string; frames: number }[];
    events: { role: string; instrument: string; midi: number; beat: number }[];
    endingChecks: null | { lastMelodyMidi: number; tonicMidi: number; finalBarHasNoAttacks: boolean };
    timpaniRenderedChecks: { source: string; targetMidi: number; errorCents: number }[];
  }>;
}
const manifest = JSON.parse(readFileSync(new URL('../public/audio/score-manifest.json', import.meta.url), 'utf8')) as ProductionManifest;

const root = new URL('../public/audio/', import.meta.url);
const files = Object.values(SCORE).flatMap(cue => cue.files.flatMap(file => [file, file.replace(/\.ogg$/, '.mp3')]));
const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const sfx = {
  capture: '0bbd944dcfd722a7f23410c5ea3969eb684218d41a1036e34074b6ab998ce255',
  click: 'e701121d949c5690084c1fb366ffae6ed099a6124e10f8e56ec78873b01a5c6a',
  dispatch: 'c16ad908120220d303cd6b433a2fa68c74ab4b68927a26205f66d45899fa3c09',
  hover: '93ef43e375383df85d0a90fdd5d56602a74f10a979cd8730a2d1da73c18699dd',
  impact: 'ee92ff31e9e745f0bd014c9ed645df8a58b14b32fc36d7d448921dc1f0c512a8',
  march: '47b214dc118d57646166e25d95387c541d7db1f9a380bf3021a7d3a02af56bd2',
  select: 'f440e371a5dea76ed45aa02ca86a1602cf360ab9c3ecb38af53bbe51477d01ee',
  skill: '86fa723d431d0b6542119cdf936d56cf62db046e44878cf2074328c912d70658',
};

describe('distributed orchestral score', () => {
  it('contains exactly eight themes, eighteen logical stems and both codecs, not stale synthetic masters', () => {
    expect(Object.keys(SCORE).sort()).toEqual(['amber','defeat','finale','marsh','meadow','menu','roots','victory']);
    expect(files).toHaveLength(36);
    expect(readdirSync(root).filter(file => file.startsWith('music-')).sort()).toEqual([...files].sort());
    expect(readdirSync(root).filter(file => file.endsWith('.wav')).sort()).toEqual(Object.keys(sfx).map(n => `sfx-${n}.wav`).sort());
  });
  it.each(files)('%s is a real non-placeholder local compressed asset', file => {
    const data = readFileSync(new URL(file, root));
    expect(data.length).toBeGreaterThan(20000);
    if (file.endsWith('.ogg')) expect(data.subarray(0,4).toString()).toBe('OggS');
    else expect(data.subarray(0,3).toString() === 'ID3' || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0)).toBe(true);
  });
  it('does not distribute repeated placeholders under different music names', () => {
    expect(new Set(files.map(file => hash(readFileSync(new URL(file, root))))).size).toBe(36);
  });
  it.each(Object.entries(sfx))('preserves the approved %s sound effect byte-for-byte', (name, expected) => {
    expect(hash(readFileSync(new URL(`sfx-${name}.wav`, root)))).toBe(expected);
  });
  it('ships pinned recorded-source provenance and the exact rendering script hash', () => {
    expect(readFileSync(new URL('SCORE-LICENSES.txt', root), 'utf8')).toMatch(/CC0/i);
    expect(hash(readFileSync(new URL('VSCO-CC0-LICENSE.txt', root)))).toBe(manifest.source.licenseSha256);
    expect(manifest.source.commit).toBe('440300901dfe9275fd84e0b7763af1f8443ae62e');
    expect(manifest.source.treeSha).toBe('0ecebcfca0c7e0fe501f71964027f8f59fa0e432');
    expect(manifest.source.samples).toHaveLength(437);
    expect(new Set(manifest.source.samples.map(s => s.path)).size).toBe(437);
    expect(manifest.source.samples.every(s => /^[0-9a-f]{64}$/.test(s.sha256))).toBe(true);
    expect(manifest.renderer.generatorSha256).toBe(hash(readFileSync(new URL('../scripts/generate-score.py', import.meta.url))));
  });
  it('binds all delivered codec bytes and exact lengths to the production manifest', () => {
    const entries = Object.values(manifest.cues).flatMap(c => c.files);
    expect(entries.map(f => f.file).sort()).toEqual([...files].sort());
    for (const [id, cue] of Object.entries(manifest.cues)) {
      const frames = Math.round(scoreSeconds(SCORE[id as ScoreId]) * 44100);
      expect(cue.frames).toBe(frames);
      for (const file of cue.files) {
        expect(file.frames).toBe(frames);
        expect(hash(readFileSync(new URL(file.file, root)))).toBe(file.sha256);
      }
    }
  });
  it.each(['victory','defeat'] as const)('%s actually plays its final tonic before the release bar', id => {
    const cue = manifest.cues[id];
    const melody = cue.events.filter(e => e.role === 'melody').sort((a,b) => a.beat-b.beat);
    expect(melody.at(-1)?.midi).toBe(50);
    expect(melody.at(-1)?.beat).toBeGreaterThan(25.9);
    expect(cue.endingChecks?.lastMelodyMidi).toBe(cue.endingChecks?.tonicMidi);
    expect(cue.endingChecks?.finalBarHasNoAttacks).toBe(true);
    expect(cue.events.every(e => e.beat < 28)).toBe(true);
  });
  it('calibrates all five timpani and renders real pitched, bounded modal references', () => {
    const calibration = Object.values(manifest.source.timpaniCalibration.samples);
    expect(calibration.length).toBeGreaterThanOrEqual(20);
    expect(new Set(calibration.map(c => c.drum)).size).toBe(5);
    expect(calibration.every(c => c.principalModeHz > 70 && c.principalModeHz < 215)).toBe(true);
    const checks = Object.values(manifest.cues).flatMap(c => c.timpaniRenderedChecks);
    expect(checks.length).toBeGreaterThan(50);
    expect(new Set(checks.map(c => c.targetMidi)).size).toBeGreaterThan(4);
    expect(checks.every(c => Math.abs(c.errorCents) <= 25 && c.targetMidi >= 38 && c.targetMidi <= 57)).toBe(true);
  });
});
