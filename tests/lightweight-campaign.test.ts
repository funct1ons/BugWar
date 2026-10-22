import { describe, it, expect } from 'vitest';
import { LEVELS } from '../src/data/levels';
import { ACTS, BRIEFINGS, actForLevel } from '../src/data/lore';
import { RACES, type RaceId } from '../src/core/types';
import { roadDistances } from '../src/core/roads';
import { Simulation } from '../src/core/Simulation';
import { CAMPAIGN_LEVEL_COUNT, RACE_UNLOCK_LEVELS } from '../src/storage/SaveSystem';

/**
 * Fast structural contract for the 18-level campaign. The long robot matrix in
 * campaign.test.ts owns winnability; this file keeps the added content honest without
 * spending minutes of simulation time on every run.
 */
const NEW_LEVELS = LEVELS.filter(l => l.id >= 14);
const LEGACY_LEVELS = LEVELS.filter(l => l.id <= 13);
const races = Object.keys(RACES) as RaceId[];
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('lightweight campaign contract', () => {
  it('ships 18 levels and keeps the original thirteen ids in place', () => {
    expect(CAMPAIGN_LEVEL_COUNT).toBe(18);
    expect(LEVELS).toHaveLength(18);
    expect(LEVELS.map(l => l.id)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    expect(new Set(LEVELS.map(l => l.biome))).toEqual(new Set(['meadow', 'roots', 'marsh', 'amber']));
    expect(races).toEqual(['agile', 'fast', 'strong', 'brood']);
    expect(RACE_UNLOCK_LEVELS).toEqual({ agile: 0, fast: 2, strong: 4, brood: 7 });
    // The original campaign keeps its a..l style layouts; only kinds/objectives may evolve.
    const legacyIds:Record<number,string[]>={1:'a b c d'.split(' '),2:'a b c d e f'.split(' '),3:'a b c d e f'.split(' '),4:'a b c d e f g h'.split(' '),5:'a b c d e f g h'.split(' '),6:'a b c d e f g h i'.split(' '),7:'a b c d e f g h'.split(' '),8:'a b c d e f g h i'.split(' '),9:'a b c d e f g h i'.split(' '),10:'a b c d e f g h i'.split(' '),11:'a b c d e f g h i j'.split(' '),12:'a b c d e f g h i j'.split(' '),13:'a b c d e f g h i j k l'.split(' ')};
    for (const level of LEGACY_LEVELS) {
      expect(level.colonies.map(c => c.id)).toEqual(legacyIds[level.id]);
      expect(level.factions.some(f => f.id === 1)).toBe(true);
      expect(level.objective === undefined || level.objective.type === 'capture').toBe(true);
    }
    // A single race per faction, and the campaign actually shows all four races somewhere.
    for (const level of LEVELS) {
      expect(new Set(level.factions.map(f => f.id)).size).toBe(level.factions.length);
      expect(level.factions.every(f => races.includes(f.race))).toBe(true);
      expect(level.factions.find(f => f.id === 1)).toBeTruthy();
    }
    expect(new Set(LEVELS.flatMap(l => l.factions.map(f => f.race)))).toEqual(new Set(races));
  });

  it('appends five distinct handcrafted maps with spaced, reachable colonies', () => {
    expect(NEW_LEVELS.map(l => l.id)).toEqual([14, 15, 16, 17, 18]);
    const positions = new Set(LEVELS.map(l => JSON.stringify(l.colonies.map(c => [c.x, c.y]))));
    expect(positions.size).toBe(LEVELS.length);
    for (const level of NEW_LEVELS) {
      expect(level.colonies.length).toBeGreaterThanOrEqual(6);
      expect(level.colonies.length).toBeLessThanOrEqual(10);
      expect(level.colonies.find(c => c.id === 'a')?.owner).toBe(1);
      const hops = roadDistances(level.roads, ['a']);
      for (const colony of level.colonies) {
        expect(hops.has(colony.id), `level ${level.id}: ${colony.id} unreachable`).toBe(true);
        expect(colony.x).toBeGreaterThanOrEqual(120);
        expect(colony.x).toBeLessThanOrEqual(1480);
        expect(colony.y - 80).toBeGreaterThanOrEqual(130);
        expect(colony.y + 80).toBeLessThanOrEqual(790);
        for (const other of level.colonies) if (other !== colony) expect(distance(colony, other)).toBeGreaterThanOrEqual(160);
        if (colony.owner > 1) expect(hops.get(colony.id)).toBeGreaterThan(0);
      }
      // Two to four minutes is a design target, expressed as par rather than a hard timer.
      expect(level.par).toBeGreaterThanOrEqual(120);
      expect(level.par).toBeLessThanOrEqual(300);
    }
  });

  it('introduces hatcheries and wind nodes without mixing several special kinds', () => {
    const kindsOf = (level: typeof LEVELS[number]) => new Set(level.colonies.filter(c => c.kind === 'hatchery' || c.kind === 'wind').map(c => c.kind));
    // Both new building kinds appear in the original journey (4 and 8) and in the added maps.
    expect(LEGACY_LEVELS.some(l => l.colonies.some(c => c.kind === 'hatchery'))).toBe(true);
    expect(LEGACY_LEVELS.some(l => l.colonies.some(c => c.kind === 'wind'))).toBe(true);
    expect(NEW_LEVELS.filter(l => kindsOf(l).size > 0).length).toBeGreaterThanOrEqual(3);
    for (const level of NEW_LEVELS) expect(kindsOf(level).size).toBeLessThanOrEqual(1);
    // Hatcheries and wind nodes are never cannons with production: kinds are exclusive.
    for (const level of LEVELS) expect(level.colonies.every(c => ['nest', 'cannon', 'hatchery', 'wind'].includes(c.kind))).toBe(true);
  });

  it('keeps elimination the default and exposes capture objectives early and in the finale', () => {
    const capture = LEVELS.filter(l => l.objective);
    expect(capture.length).toBeGreaterThanOrEqual(2);
    expect(capture.some(l => l.id <= 13), 'capture must not be hidden behind level 13').toBe(true);
    const finale = LEVELS.find(l => l.id === 18)!;
    expect(finale.objective?.type).toBe('capture');
    for (const level of capture) {
      const objective = level.objective!;
      const target = level.colonies.find(c => c.id === objective.target);
      expect(target, `level ${level.id}: missing capture target`).toBeTruthy();
      expect(target!.owner).toBeGreaterThan(1);
      expect(target!.id).not.toBe('a');
      expect(roadDistances(level.roads, ['a']).has(target!.id)).toBe(true);
      expect(level.tip.length).toBeGreaterThan(0);
    }
    for (const level of LEVELS.filter(l => !l.objective)) expect(level.objective).toBeUndefined();
    expect(finale.tip).toContain('核心');
  });

  it('extends briefings and acts for 18 without rewriting the original ending', () => {
    expect(BRIEFINGS).toHaveLength(18);
    expect(BRIEFINGS.every(text => text.length > 0)).toBe(true);
    expect(BRIEFINGS[12]).toContain('树心就在前方');
    expect(actForLevel(13)).toBe(3);
    expect(actForLevel(14)).toBe(4);
    expect(ACTS.length).toBeGreaterThanOrEqual(5);
    for (let id = 1; id <= 18; id++) expect(ACTS[actForLevel(id)]).toBeTruthy();
    // The original act mapping is unchanged for 1..13.
    expect([1, 2, 3, 5, 6, 7, 9, 10, 12, 13].map(actForLevel)).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 1, 3]);
  });

  it('constructs every added map for all four player races', () => {
    for (const level of NEW_LEVELS) for (const race of races) {
      const sim = new Simulation(level, race, 'normal');
      expect(sim.world.colonies.every(c => Number.isFinite(c.units) && c.units >= 0)).toBe(true);
      expect(sim.world.factions.find(f => f.id === 1)?.race).toBe(race);
      expect(sim.world.roads).toEqual(level.roads);
      sim.step(1);
      expect(sim.world.colonies.every(c => Number.isFinite(c.units) && c.units >= 0)).toBe(true);
      expect(sim.world.fleets.every(f => Number.isFinite(f.count) && f.count > 0)).toBe(true);
    }
  });
});
