import { describe, it, expect } from 'vitest';
import { think, estimateCannonLoss } from '../src/core/ai';
import { Simulation } from '../src/core/Simulation';
import {
  BATTLE_RULES,
  CANNON_BASE_FIREPOWER,
  CANNON_FIREPOWER_NODES,
  CANNON_GARRISON_CAP,
  cannonFirepower,
  cannonHitsForExposure,
  cannonLossForExposure,
} from '../src/core/rules';
import { renderCodex } from '../src/data/codex';
import type { ColonyConfig, Fleet, LevelConfig, Road } from '../src/core/types';

const TICK = 0.05;
/** Mirrors the display formatter used by the codex renderer. */
const shown = (value: number) => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

const colony = (id: string, owner: number, units = 0, x = 0, kind: 'nest' | 'cannon' = 'nest'): ColonyConfig =>
  ({ id, owner, units, x, y: 300, kind, production: 0 });
const level = (colonies: ColonyConfig[], roads: Road[]): LevelConfig =>
  ({ id: 1, name: 'cannon', subtitle: '', biome: 'meadow', par: 100, tip: '', factions: [{ id: 1, race: 'agile' }, { id: 2, race: 'agile' }, { id: 3, race: 'agile' }], colonies, roads });
const sim = (colonies: ColonyConfig[], roads: Road[] = []) => new Simulation(level(colonies, roads), 'agile', 'easy');

/** A tower plus a parked hostile fleet that never leaves the firing circle. */
const towerSim = (units: number, owner = 1, fleetOwner = 2) => {
  const s = sim([{ ...colony('gun', owner, units, 0, 'cannon') }, colony('home', fleetOwner, 0, 9000)]);
  const fleet: Fleet = { id: 1, owner: fleetOwner, race: 'agile', from: 'home', to: 'home', x: 0, y: 300, count: 1e6, initialCount: 1e6 };
  s.world.fleets.push(fleet);
  return { s, fleet };
};
/** One fixed step per call; the fleet is re-parked so only the tower decides the cadence. */
const run = (s: Simulation, fleet: Fleet, ticks: number) => {
  const shots: { tick: number; amount: number }[] = [];
  for (let tick = 1; tick <= ticks; tick++) {
    fleet.x = 0; fleet.y = 300; fleet.count = 1e6;
    s.step(TICK);
    for (const event of s.drainEvents()) if (event.type === 'shot') shots.push({ tick, amount: event.amount ?? 0 });
  }
  return shots;
};

describe('cannon firepower table', () => {
  it('publishes the approved garrison nodes as the single source', () => {
    expect(CANNON_FIREPOWER_NODES.map((node) => [node.garrison, node.damage, node.cooldown])).toEqual([
      [0, 2, 0.9],
      [10, 3, 0.8],
      [30, 5, 0.65],
      [60, 6, 0.5],
    ]);
    expect(CANNON_GARRISON_CAP).toBe(60);
    expect(CANNON_BASE_FIREPOWER).toEqual({ garrison: 0, damage: 2, cooldown: 0.9 });
    // The empty-tower constants stay the base of the same table, the range is untouched.
    expect(BATTLE_RULES.cannonDamage).toBe(CANNON_BASE_FIREPOWER.damage);
    expect(BATTLE_RULES.cannonCooldown).toBe(CANNON_BASE_FIREPOWER.cooldown);
    expect(BATTLE_RULES.cannonRange).toBe(200);
  });

  it('interpolates linearly between nodes', () => {
    expect(cannonFirepower(0)).toMatchObject({ garrison: 0, damage: 2, cooldown: 0.9, capped: false });
    expect(cannonFirepower(5)).toMatchObject({ garrison: 5, damage: 2.5, cooldown: 0.85 });
    expect(cannonFirepower(10)).toMatchObject({ damage: 3, cooldown: 0.8 });
    expect(cannonFirepower(20)).toMatchObject({ damage: 4, cooldown: 0.725 });
    expect(cannonFirepower(30)).toMatchObject({ damage: 5, cooldown: 0.65 });
    expect(cannonFirepower(45)).toMatchObject({ damage: 5.5, cooldown: 0.575 });
    expect(cannonFirepower(59.5)).toMatchObject({ damage: 5.9833, cooldown: 0.5025, capped: false });
    // One decimal step near a node stays continuous instead of jumping.
    expect(cannonFirepower(10.5).damage).toBeCloseTo(3.05, 6);
    expect(cannonFirepower(10.5).cooldown).toBeCloseTo(0.7963, 6);
  });

  it('caps firepower at 60 defenders and never buffs past the cap', () => {
    for (const units of [60, 61, 120, 1e6]) {
      expect(cannonFirepower(units)).toMatchObject({ damage: 6, cooldown: 0.5, capped: true, dps: 12 });
    }
    expect(cannonFirepower(60).capped).toBe(true);
    expect(cannonFirepower(59.9).capped).toBe(false);
  });

  it('sanitizes defensive input to the base profile', () => {
    for (const units of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(cannonFirepower(units)).toMatchObject({ garrison: 0, damage: 2, cooldown: 0.9, capped: false });
    }
  });

  it('derives ready-shot counts and route losses from the same helper', () => {
    expect(cannonHitsForExposure(0, 0.9)).toBe(1);
    expect(cannonHitsForExposure(0.9, 0.9)).toBe(2);
    expect(cannonHitsForExposure(4, 0.9)).toBe(5);
    expect(cannonHitsForExposure(-1, 0.9)).toBe(0);
    expect(cannonHitsForExposure(Number.NaN, 0.9)).toBe(0);
    expect(cannonHitsForExposure(1, 0)).toBe(1);
    expect(cannonLossForExposure(0, 4)).toBe(10);
    expect(cannonLossForExposure(60, 4)).toBe(54);
    expect(cannonLossForExposure(20, 4)).toBe(24);
  });
});

describe('simulation fires with the live garrison', () => {
  it('keeps the empty tower at the base damage and interval', () => {
    const { s, fleet } = towerSim(0);
    const shots = run(s, fleet, 40);
    // Ready on the first tick, then one shot per 0.90 s (18 ticks).
    expect(shots.map((shot) => shot.tick)).toEqual([1, 19, 37]);
    expect(shots.every((shot) => shot.amount === 2)).toBe(true);
    expect(s.world.colonies[0].units).toBe(0);
  });

  it('shoots harder and faster at the 60-defender cap', () => {
    const { s, fleet } = towerSim(60);
    const shots = run(s, fleet, 40);
    // One shot per 0.50 s (10 ticks).
    expect(shots.map((shot) => shot.tick)).toEqual([1, 11, 21, 31]);
    expect(shots.every((shot) => shot.amount === 6)).toBe(true);
    expect(s.world.colonies[0].units).toBe(60);
  });

  it('uses the interpolated values between nodes while garrison changes', () => {
    for (const [units, damage] of [[5, 2.5], [20, 4], [45, 5.5]] as const) {
      const { s, fleet } = towerSim(units);
      const shots = run(s, fleet, 40);
      expect(shots[0].tick).toBe(1);
      expect(shots.every((shot) => shot.amount === damage)).toBe(true);
      expect(shots.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('never resets or banks an immediate shot when the garrison changes', () => {
    const { s, fleet } = towerSim(0);
    expect(run(s, fleet, 1).map((shot) => shot.tick)).toEqual([1]);
    // Reinforce right after a shot: the shorter interval starts now, not instantly.
    s.world.colonies[0].units = 60;
    expect(run(s, fleet, 10).map((shot) => shot.tick)).toEqual([10]);
    // Strip the tower: the longer empty-tower interval applies, without a reset burst.
    s.world.colonies[0].units = 0;
    expect(run(s, fleet, 18).map((shot) => shot.tick)).toEqual([18]);
  });

  it('retains partial progress when reinforced or stripped mid-recharge', () => {
    const reinforced = towerSim(0);
    run(reinforced.s, reinforced.fleet, 1);
    expect(run(reinforced.s, reinforced.fleet, 9)).toHaveLength(0); // half of 0.90 s
    reinforced.s.world.colonies[0].units = 60;
    expect(run(reinforced.s, reinforced.fleet, 5)).toEqual([{ tick: 5, amount: 6 }]);

    const stripped = towerSim(60);
    run(stripped.s, stripped.fleet, 1);
    expect(run(stripped.s, stripped.fleet, 5)).toHaveLength(0); // half of 0.50 s
    stripped.s.world.colonies[0].units = 0;
    expect(run(stripped.s, stripped.fleet, 9)).toEqual([{ tick: 9, amount: 2 }]);
  });

  it('cannot farm extra shots by toggling the garrison every tick', () => {
    const { s, fleet } = towerSim(0);
    const shotTicks: number[] = [];
    for (let tick = 1; tick <= 40; tick++) {
      s.world.colonies[0].units = tick % 2 ? 60 : 0;
      fleet.x = 0; fleet.y = 300; fleet.count = 1e6;
      s.step(TICK);
      if (s.drainEvents().some((event) => event.type === 'shot')) shotTicks.push(tick);
    }
    expect(shotTicks[0]).toBe(1);
    expect(shotTicks.length).toBeLessThanOrEqual(4); // never faster than the 60-defender cadence
    for (let index = 1; index < shotTicks.length; index++) {
      expect(shotTicks[index] - shotTicks[index - 1]).toBeGreaterThanOrEqual(10);
    }
  });

  it('keeps the existing ownership rules: enemy towers shoot us, neutral towers never fire, buildings are not targets', () => {
    const enemy = towerSim(60, 2, 1);
    const hits = run(enemy.s, enemy.fleet, 20);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((shot) => shot.amount === 6)).toBe(true);

    const neutral = towerSim(60, 0, 1);
    expect(run(neutral.s, neutral.fleet, 40)).toHaveLength(0);
    expect(neutral.s.world.fleets[0].count).toBe(1e6);

    const building = sim([colony('gun', 1, 0, 0, 'cannon'), colony('enemy', 2, 10, 100)]);
    building.step(1);
    expect(building.drainEvents().some((event) => event.type === 'shot')).toBe(false);
    expect(building.world.colonies[1].units).toBe(10);
  });
});

describe('AI loss estimation uses the real garrison', () => {
  const world = (units: number) => sim([colony('gun', 1, units, 500, 'cannon'), colony('a', 2, 100, 0)]);

  it('matches the shared exposure helper instead of the old constant', () => {
    const empty = world(0);
    expect(estimateCannonLoss(empty.world, { x: 0, y: 300 }, { x: 1000, y: 300 }, 2, 100)).toBe(10);
    expect(estimateCannonLoss(empty.world, { x: 0, y: 300 }, { x: 1000, y: 300 }, 2, 100))
      .toBe(cannonLossForExposure(0, 4));

    empty.world.colonies[0].units = 60;
    expect(estimateCannonLoss(empty.world, { x: 0, y: 300 }, { x: 1000, y: 300 }, 2, 100)).toBe(54);
    expect(estimateCannonLoss(empty.world, { x: 0, y: 300 }, { x: 1000, y: 300 }, 2, 100))
      .toBe(cannonLossForExposure(60, 4));

    empty.world.colonies[0].units = 20;
    expect(estimateCannonLoss(empty.world, { x: 0, y: 300 }, { x: 1000, y: 300 }, 2, 100)).toBe(24);
  });

  it('prices a garrisoned tower as a loss the planner must actually pay', () => {
    const plan = (units: number) => {
      const s = sim([colony('gun', 1, units, 500, 'cannon'), colony('a', 2, 30, 0)], [['a', 'gun']]);
      think(s.world, 2, 'easy', (sources, target, ratio, owner) => s.dispatch(sources, target, ratio, owner));
      return s;
    };
    expect(plan(0).world.fleets.some((fleet) => fleet.owner === 2)).toBe(true);
    // 20 usable attackers cannot cross 30 estimated damage from the full garrison.
    expect(plan(60).world.fleets).toHaveLength(0);
  });
});

describe('codex and selection panel share the same numbers', () => {
  it('shows the baseline plus the full growth table without a selection', () => {
    const html = renderCodex({ tab: 'buildings', entryId: 'building-cannon' });
    expect(html).toContain(`>${shown(BATTLE_RULES.cannonDamage)}</strong>`);
    expect(html).toContain(`>${shown(BATTLE_RULES.cannonCooldown)} 秒</strong>`);
    expect(html).toContain('驻军加成');
    expect(html).toContain('驻军火力成长');
    for (const node of CANNON_FIREPOWER_NODES) {
      const profile = cannonFirepower(node.garrison);
      const cap = node.garrison >= CANNON_GARRISON_CAP ? '（上限）' : '';
      expect(html).toContain(`<tr><th>${shown(node.garrison)} 人${cap}</th><td>${shown(profile.damage)}</td><td>${shown(profile.cooldown)} 秒</td><td>${shown(profile.dps)}</td></tr>`);
    }
    expect(html).toContain(`${shown(CANNON_GARRISON_CAP)} 人封顶`);
    expect(html).not.toContain('战场实测');
  });

  it('explains the live panel before anything is selected', () => {
    const html = renderCodex({ tab: 'buildings', entryId: 'building-cannon', inBattle: true, selectedColonies: [] });
    expect(html).toContain('战场实测');
    expect(html).toContain('选中炮塔');
    expect(html).toContain('成长表');
  });

  it('shows current damage, interval, garrison bonus and cap progress for selected cannons', () => {
    const html = renderCodex({
      tab: 'buildings',
      entryId: 'building-cannon',
      inBattle: true,
      selectedColonies: [
        { id: 't1', owner: 1, kind: 'cannon', units: 24, production: 0 },
        { id: 't2', owner: 3, kind: 'cannon', units: 90, production: 0 },
        { id: 't3', owner: 0, kind: 'cannon', units: 90, production: 0 },
      ],
    });
    const profile = cannonFirepower(24);
    expect(html).toContain('战场实测 · 已选炮塔');
    expect(html).toContain(`驻军 ${shown(24)} · 单发 ${shown(profile.damage)} 伤害 / ${shown(profile.cooldown)} 秒`);
    expect(html).toContain(`驻军加成 +${shown(profile.damage - CANNON_BASE_FIREPOWER.damage)} 伤害`);
    expect(html).toContain(`间隔缩短 ${shown(CANNON_BASE_FIREPOWER.cooldown - profile.cooldown)} 秒`);
    expect(html).toContain(`再驻 ${shown(Math.ceil(CANNON_GARRISON_CAP - 24))} 人达到上限`);
    expect(html).toContain(`${shown(CANNON_GARRISON_CAP)} 人火力上限`);
    expect(html).toContain('中立炮塔不射击');
  });
});
