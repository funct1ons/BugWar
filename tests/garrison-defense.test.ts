import { describe, it, expect } from 'vitest';
import { Simulation } from '../src/core/Simulation';
import { think } from '../src/core/ai';
import { BATTLE_RULES, garrisonDefenseMultiplier } from '../src/core/rules';
import { RACES, type ColonyConfig, type LevelConfig, type RaceId } from '../src/core/types';

const fixture = (kind: ColonyConfig['kind'], owner: number, attacker: RaceId = 'agile', defender: RaceId = 'agile') => {
  const level: LevelConfig = {
    id: 1, name: 'defense', subtitle: '', biome: 'meadow', par: 100, tip: '',
    factions: [{ id: 1, race: attacker }, { id: 2, race: defender }],
    colonies: [
      { id: 'a', owner: 1, units: 20, x: 0, y: 300, kind: 'nest', production: 0 },
      { id: 'b', owner, units: 100, x: 10, y: 300, kind, production: 0 },
    ], roads: [['a', 'b']],
  };
  const s = new Simulation(level, attacker, 'easy');
  // A real arriving fleet: an owned cannon fires its capped 10-damage shell first.
  s.world.fleets.push({ id: 1, owner: 1, race: attacker, from: 'a', to: 'b', x: 10, y: 300, count: 20, initialCount: 20 });
  s.step(.05);
  return s;
};

describe('AI safety margin for reinforced non-producing garrisons', () => {
  // Wind has neither production nor cannon fire: only real garrison strength and
  // the planner's extra capture margin can determine whether this order is viable.
  const reinforced = (defenders: number, attackers: number) => {
    const level: LevelConfig = {
      id: 1, name: 'reinforced wind', subtitle: '', biome: 'meadow', par: 100, tip: '',
      factions: [{ id: 1, race: 'fast' }, { id: 2, race: 'agile' }],
      colonies: [
        { id: 'a', owner: 1, units: attackers, x: 0, y: 300, kind: 'wind', production: 0 },
        { id: 'b', owner: 2, units: defenders, x: 200, y: 300, kind: 'wind', production: 0 },
      ], roads: [['a', 'b']],
    };
    const sim = new Simulation(level, 'fast', 'normal');
    const orders: { sources: string[]; target: string; sent: number }[] = [];
    think(sim.world, 1, 'hard', (sources, target, ratio, owner) => {
      const sent = sim.dispatch(sources, target, ratio, owner);
      orders.push({ sources, target, sent });
      return sent;
    });
    return { sim, orders };
  };

  it.each([1000, 2000])('attacks %i real defenders without waiting for an unbounded extra margin', defenders => {
    const realCaptureCost = defenders * RACES.agile.defense * garrisonDefenseMultiplier(2) / RACES.fast.attack;
    // Enough for full combat cost + capped hard-mode buffer + reserve, but NOT
    // enough for the old 12%-of-all-defenders buffer (183 / 363 troops).
    const { sim, orders } = reinforced(defenders, realCaptureCost + 60);
    expect(orders).toHaveLength(1);
    expect(orders[0].sources).toEqual(['a']);
    expect(orders[0].target).toBe('b');
    expect(orders[0].sent).toBeGreaterThan(realCaptureCost);
    expect(orders[0].sent).toBeLessThanOrEqual(realCaptureCost + 22);
    expect(sim.world.fleets).toHaveLength(1);
    expect(sim.world.fleets[0].count).toBe(orders[0].sent);
    expect(sim.world.colonies[1].units).toBe(defenders);
  });

  it.each([1000, 2000])('does not cap the actual strength of %i defenders or send an insufficient attack', defenders => {
    const realCaptureCost = defenders * RACES.agile.defense * garrisonDefenseMultiplier(2) / RACES.fast.attack;
    const { sim, orders } = reinforced(defenders, realCaptureCost - 100);
    expect(orders).toEqual([]);
    expect(sim.world.fleets).toEqual([]);
    expect(sim.world.colonies[0].units).toBe(realCaptureCost - 100);
    expect(sim.world.colonies[1].units).toBe(defenders);
  });
});

describe('owned garrison defense', () => {
  it('exports the approved ownership-only multiplier', () => {
    expect(BATTLE_RULES.garrisonDefenseMultiplier).toBe(1.2);
    for (const owner of [1, 2, 3, 4]) expect(garrisonDefenseMultiplier(owner)).toBe(1.2);
    for (const owner of [0, -1]) expect(garrisonDefenseMultiplier(owner)).toBe(1);
  });
  for (const kind of ['nest', 'hatchery', 'cannon', 'wind'] as const) {
    it(`${kind}: owned defenders get 1.2 while neutral defenders do not`, () => {
      const owned = fixture(kind, 2);
      const neutral = fixture(kind, 0);
      expect(owned.world.colonies[1].owner).toBe(2);
      expect(owned.world.colonies[1].units).toBeCloseTo(100 - (kind === 'cannon' ? 10 : 20) / 1.2);
      expect(neutral.world.colonies[1].owner).toBe(0);
      expect(neutral.world.colonies[1].units).toBeCloseTo(80);
    });
  }
  it('does not apply the building multiplier to road encounters', () => {
    const s = fixture('nest', 2);
    s.world.fleets = [
      { id: 2, owner: 1, race: 'fast', from: 'a', to: 'b', x: 5, y: 300, count: 100, initialCount: 100 },
      { id: 3, owner: 2, race: 'strong', from: 'b', to: 'a', x: 5, y: 300, count: 100, initialCount: 100 },
    ];
    const [fast, strong] = s.world.fleets;
    s.step(.05);
    expect(fast.count).toBeCloseTo(Math.max(0, 100 - 100 * RACES.strong.attack / RACES.fast.defense));
    expect(strong.count).toBeCloseTo(100 - 100 * RACES.fast.attack / RACES.strong.defense);
  });
  it.each(['fast', 'strong', 'brood'] as const)('multiplies %s racial defense rather than replacing or adding to it', defender => {
    const s = fixture('nest', 2, 'fast', defender);
    expect(s.world.colonies[1].units).toBeCloseTo(100 - 20 * RACES.fast.attack / (RACES[defender].defense * 1.2));
  });
});
