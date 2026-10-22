import { describe, expect, it } from 'vitest';
import { MusicDirector, type MusicOutput } from '../src/audio/MusicDirector';
import { LEVELS } from '../src/data/levels';
import type { World } from '../src/core/types';

function fixture() {
  const calls: unknown[][] = [];
  const audio: MusicOutput = { music: t => { calls.push(['music', t]); }, setIntensity: n => { calls.push(['intensity', n]); }, setPaused: p => { calls.push(['paused', p]); } };
  const director = new MusicDirector(audio);
  const level = { ...LEVELS[0], colonies: [
    { id: 'a', x: 0, y: 0, owner: 1, kind: 'nest' as const, units: 100 },
    { id: 'b', x: 100, y: 0, owner: 2, kind: 'nest' as const, units: 100 },
  ] };
  const world: World = { elapsed: 0, colonies: level.colonies.map(c => ({ ...c, production: 1 })), fleets: [], factions: level.factions, roads: level.roads, energy: {}, status: 'playing', stats: { sent: 0, kills: 0, captures: 0, lost: 0, skills: 0 }, events: [] };
  director.startLevel(level); director.update(world);
  const advance = (seconds: number) => { for (let i = 0; i < seconds * 4; i++) { world.elapsed += .25; director.update(world); } };
  const attack = () => { world.fleets = [2, 3, 4].map(owner => ({ id: owner, owner, race: 'agile', from: 'b', to: 'a', x: 50, y: 0, count: 80, initialCount: 80 })); };
  return { director, calls, world, level, advance, attack };
}

describe('MusicDirector', () => {
  it('maps all four acts and gives level 13 its own finale', () => {
    const { director } = fixture();
    for (const biome of ['meadow', 'roots', 'marsh', 'amber'] as const) {
      director.startLevel({ ...LEVELS[0], biome }); expect(director.diagnostics().cue).toBe(biome);
    }
    director.startLevel({ ...LEVELS[0], id: 13 }); expect(director.diagnostics().cue).toBe('finale');
    director.menu(); expect(director.diagnostics().cue).toBe('menu');
  });
  it('does not treat one starting nest or initial imbalance as crisis', () => {
    const { director, advance, level, world } = fixture();
    level.colonies[1].units = world.colonies[1].units = 900;
    director.startLevel(level); advance(60);
    expect(director.diagnostics().intensity).toBe(0);
  });
  it('aggregates all enemy factions, escalates pressure, then recovers at idle', () => {
    const { director, world, advance, attack } = fixture();
    attack(); advance(20); expect(director.diagnostics().intensity).toBe(2);
    world.fleets = []; advance(60); expect(director.diagnostics().intensity).toBe(0);
  });
  it('ignores neutral strength and rejects a single small collision', () => {
    const { director, world, advance } = fixture();
    world.colonies.push({ ...world.colonies[0], id: 'neutral', owner: 0, units: 1e8 });
    world.stats.kills = 1; advance(30); expect(director.diagnostics().intensity).toBe(0);
  });
  it('smooths input and enforces minimum eight-second layer residence', () => {
    const { director, advance, attack, world } = fixture();
    attack(); advance(4); expect(director.diagnostics().intensity).toBe(0);
    advance(5); expect(director.diagnostics().intensity).toBe(2);
    world.fleets = []; advance(5); expect(director.diagnostics().intensity).toBe(2);
  });
  it('freezes while paused and discards resume gaps even without paused ticks', () => {
    const { director, world, advance, attack } = fixture();
    attack(); advance(10); director.setPaused(true);
    const before = director.diagnostics(); advance(100);
    expect(director.diagnostics()).toEqual(before);
    director.setPaused(false); world.elapsed += 1000; director.update(world);
    expect(director.diagnostics().modelSeconds).toBe(before.modelSeconds);
    advance(1); expect(director.diagnostics().modelSeconds).toBe(before.modelSeconds + 1);
  });
  it('resets retries, releases pause, and prevents result overwrite by stale ticks', () => {
    const { director, level, advance, attack, calls } = fixture();
    attack(); advance(20); director.setPaused(true); director.startLevel(level);
    expect(director.diagnostics()).toMatchObject({ intensity: 0, paused: false, pressure: 0, modelSeconds: 0 });
    director.result(false); const count = calls.length; advance(40);
    expect(calls.length).toBe(count); expect(director.diagnostics().cue).toBe('defeat');
    director.result(true); expect(director.diagnostics().cue).toBe('victory');
  });
  it('reads frozen world without mutation and keeps extreme inputs serializable', () => {
    const { director, world } = fixture();
    world.colonies[0].units = NaN; world.colonies[1].units = Infinity;
    world.stats.kills = NaN; world.stats.lost = Infinity;
    world.elapsed = NaN; director.update(world);
    world.elapsed = 1; director.update(world);
    world.elapsed = 2;
    const freeze = (v: unknown) => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } };
    freeze(world); expect(() => director.update(world)).not.toThrow();
    const d = director.diagnostics();
    expect(Number.isFinite(d.pressure)).toBe(true);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });
  it('detects sustained engagement and recent territorial loss without transient event buffers', () => {
    const { director, advance, world } = fixture();
    for (let i = 0; i < 20; i++) { world.stats.kills += 20; world.stats.captures++; advance(1); }
    expect(director.diagnostics().intensity).toBe(2);
    expect(world.events).toEqual([]);
  });
});
