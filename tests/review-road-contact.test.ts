import { it, expect } from 'vitest';
import { Simulation } from '../src/core/Simulation';
import { RACES, type LevelConfig, type Fleet } from '../src/core/types';

function setup() {
  const level: LevelConfig = {
    id: 1, name: 'review', subtitle: '', biome: 'meadow', par: 100, tip: '',
    factions: [{ id: 1, race: 'fast' }, { id: 2, race: 'strong' }, { id: 3, race: 'agile' }],
    colonies: [
      { id: 'a', owner: 1, units: 1, x: 0, y: 0, kind: 'nest', production: 0 },
      { id: 'b', owner: 2, units: 1, x: 100, y: 0, kind: 'nest', production: 0 },
    ], roads: [['a', 'b']], openingGrace: { easy: 999, normal: 999, hard: 999 },
  };
  return new Simulation(level, 'fast', 'easy');
}
function fleet(id: number, owner: number, count: number, x: number, race: Fleet['race'] = 'fast', held = false): Fleet {
  return { id, owner, race, count, initialCount: count, from: owner === 1 ? 'a' : 'b', to: owner === 1 ? 'b' : 'a', x, y: 0, ...(held ? { combatPause: .25 } : {}) };
}

it('review: stopping at the first road encounter must not damage an unreachable later group', () => {
  const s = setup();
  const moving = fleet(1, 1, 20, 0);
  const first = fleet(2, 2, 100, 0, 'strong', true);
  const later = fleet(3, 2, 100, RACES.fast.speed * .05 + 9, 'strong', true);
  s.world.fleets = [moving, first, later];
  s.step(.05);
  expect(moving.x).toBe(0);
  expect(moving.count).toBe(0);
  expect(later.count).toBe(100);
  expect(first.count).toBeCloseTo(100 - 20 * RACES.fast.attack / RACES.strong.defense);
});

it('a surviving fleet also stops at first contact rather than attacking a distant group', () => {
  const s = setup();
  const moving = fleet(1, 1, 100, 0);
  const first = fleet(2, 2, 1, 0, 'strong', true);
  const later = fleet(3, 2, 100, 16, 'strong', true);
  s.world.fleets = [later, moving, first];
  s.step(.05);
  expect(moving.x).toBe(0);
  expect(moving.count).toBeCloseTo(100 - RACES.strong.attack / RACES.fast.defense);
  expect(first.count).toBe(0);
  expect(later.count).toBe(100);
});

it('a later reinforcement can hit a newly stopped survivor using its remaining strength', () => {
  const s = setup();
  const moving = fleet(1, 1, 100, 0);
  const first = fleet(2, 2, 1, 0, 'strong', true);
  const reinforcement = fleet(3, 2, 20, 12);
  s.world.fleets = [moving, first, reinforcement];
  s.step(.05);
  expect(moving.x).toBe(0);
  expect(moving.count).toBeCloseTo(100 - RACES.strong.attack / RACES.fast.defense - 20);
  expect(reinforcement.x).toBeCloseTo(10);
  expect(reinforcement.count).toBe(0);
});

it('same-place three-way contact splits fire fairly with attack/defense, independent of order', () => {
  const run = (reverse: boolean) => {
    const s = setup();
    const fleets = [fleet(1, 1, 100, 0), fleet(2, 2, 100, 0, 'strong'), fleet(3, 3, 100, 0, 'agile')];
    // All three are departing, so no pair is under an existing holding truce.
    for (const f of fleets) { f.from = 'a'; f.to = 'b'; }
    s.world.fleets = reverse ? [...fleets].reverse() : fleets;
    s.step(.05);
    return fleets.map(f => f.count);
  };
  const counts = run(false);
  expect(run(true)).toEqual(counts);
  expect(counts[0]).toBeCloseTo(Math.max(0, 100 - 50 * (RACES.strong.attack + RACES.agile.attack) / RACES.fast.defense));
  expect(counts[1]).toBeCloseTo(100 - 50 * (RACES.fast.attack + RACES.agile.attack) / RACES.strong.defense);
  expect(counts[2]).toBeCloseTo(Math.max(0, 100 - 50 * (RACES.fast.attack + RACES.strong.attack) / RACES.agile.defense));
});

it('stops at radius entry, not closest approach or a short-road endpoint', () => {
  const s = setup();
  s.world.colonies[1].x = 20;
  const a = fleet(1, 1, 100, 0);
  const b = fleet(2, 2, 100, 20);
  a.haste = 10; b.haste = 10;
  s.world.fleets = [a, b];
  s.step(.05);
  expect(a.x).toBeCloseTo(5);
  expect(b.x).toBeCloseTo(15);
  expect(s.world.events.filter(e => e.type === 'impact')).toHaveLength(0);
});
