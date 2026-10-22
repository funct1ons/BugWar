import { describe, it, expect } from 'vitest';
import { hasRoad, neighboursOf, roadDistances } from '../src/core/roads';
import { Simulation } from '../src/core/Simulation';
import { RACES, type Difficulty, type LevelConfig, type RaceId } from '../src/core/types';
import { LEVELS } from '../src/data/levels';

/**
 * Fixed-road campaign contract. Every stage ships a hand-placed, undirected network:
 * one dispatch may only cross a single road, so these edges are the whole strategic map.
 * The checks below are geometric and structural; winnability and balance are covered by
 * the campaign robot matrix and still need human playtesting.
 */
interface Point { x: number; y: number }
const pointOf = (level: LevelConfig, id: string): Point => {
  const colony = level.colonies.find(c => c.id === id);
  if (!colony) throw new Error(`level ${level.id} has no colony ${id}`);
  return { x: colony.x, y: colony.y };
};
const distanceOf = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const crossOf = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const withinBox = (a: Point, b: Point, p: Point) =>
  Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
/** True when two segments share any point, including a collinear overlap. */
function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = crossOf(q1, q2, p1), d2 = crossOf(q1, q2, p2), d3 = crossOf(p1, p2, q1), d4 = crossOf(p1, p2, q2);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && withinBox(q1, q2, p1)) return true;
  if (d2 === 0 && withinBox(q1, q2, p2)) return true;
  if (d3 === 0 && withinBox(p1, p2, q1)) return true;
  if (d4 === 0 && withinBox(p1, p2, q2)) return true;
  return false;
}
/** Shortest distance from a point to a segment (clamped, so far projections do not count). */
function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distanceOf(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return distanceOf(p, { x: a.x + t * dx, y: a.y + t * dy });
}
const segmentDistance = (p1: Point, p2: Point, q1: Point, q2: Point) => Math.min(
  pointSegmentDistance(p1, q1, q2), pointSegmentDistance(p2, q1, q2),
  pointSegmentDistance(q1, p1, p2), pointSegmentDistance(q2, p1, p2),
);
/** A building's art is 132px wide and its number plate sits ~70px below centre. */
const BUILDING_CLEARANCE = 160;
/** Separate roads must stay visually apart so no painted corner reads as a road junction. */
const ROAD_CLEARANCE = 24;
const degrees = (level: LevelConfig) =>
  new Map(level.colonies.map(c => [c.id, neighboursOf(level.roads, c.id).length] as const));

describe('fixed campaign roads', () => {
  it('ships eighteen legal undirected road lists', () => {
    expect(LEVELS).toHaveLength(18);
    for (const level of LEVELS) {
      const known = new Set(level.colonies.map(c => c.id));
      expect(Array.isArray(level.roads)).toBe(true);
      expect(level.roads.length).toBeGreaterThanOrEqual(level.colonies.length - 1);
      // Bounded density: hand-built fronts, not a complete graph with automatic nearest neighbours.
      expect(level.roads.length).toBeLessThanOrEqual(level.colonies.length + 3);
      expect(level.roads.length).toBeLessThan(level.colonies.length * (level.colonies.length - 1) / 2);
      const seen = new Set<string>();
      for (const [a, b] of level.roads) {
        expect(known.has(a), `level ${level.id} road endpoint ${a}`).toBe(true);
        expect(known.has(b), `level ${level.id} road endpoint ${b}`).toBe(true);
        expect(a).not.toBe(b);
        const key = [a, b].sort().join(':');
        expect(seen.has(key), `level ${level.id} duplicate road ${key}`).toBe(false);
        seen.add(key);
        // Undirected: the same pair must resolve from either end.
        expect(hasRoad(level.roads, b, a)).toBe(true);
      }
      for (const colony of level.colonies) {
        expect(neighboursOf(level.roads, colony.id).length, `level ${level.id} isolated ${colony.id}`).toBeGreaterThan(0);
      }
    }
  });

  it('connects every enemy and neutral building to the player start', () => {
    for (const level of LEVELS) {
      const start = level.colonies.find(c => c.id === 'a');
      expect(start?.owner, `level ${level.id} player start`).toBe(1);
      const hops = roadDistances(level.roads, ['a']);
      for (const colony of level.colonies) {
        expect(hops.has(colony.id), `level ${level.id}: ${colony.id} is unreachable from a`).toBe(true);
      }
      for (const colony of level.colonies.filter(c => c.owner > 1)) {
        expect(hops.get(colony.id), `level ${level.id}: enemy ${colony.id} must cost at least one hop`).toBeGreaterThan(0);
      }
      // Every stage keeps at least one route choice instead of a single forced corridor.
      expect(level.roads.length, `level ${level.id} has no alternative route`).toBeGreaterThanOrEqual(level.colonies.length);
    }
  });

  it('never paints a road through an unrelated building', () => {
    for (const level of LEVELS) {
      for (const [a, b] of level.roads) {
        const from = pointOf(level, a), to = pointOf(level, b);
        for (const colony of level.colonies) {
          if (colony.id === a || colony.id === b) continue;
          const clearance = pointSegmentDistance({ x: colony.x, y: colony.y }, from, to);
          expect(clearance, `level ${level.id}: road ${a}-${b} passes through ${colony.id}`).toBeGreaterThanOrEqual(BUILDING_CLEARANCE);
        }
      }
    }
  });

  it('keeps separate roads visually apart so no crossing fakes a junction', () => {
    for (const level of LEVELS) {
      for (let i = 0; i < level.roads.length; i++) {
        for (let j = i + 1; j < level.roads.length; j++) {
          const [a1, b1] = level.roads[i], [a2, b2] = level.roads[j];
          // Roads may meet at a shared building; that is a real junction.
          if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) continue;
          const p1 = pointOf(level, a1), p2 = pointOf(level, b1), q1 = pointOf(level, a2), q2 = pointOf(level, b2);
          expect(segmentsIntersect(p1, p2, q1, q2), `level ${level.id}: road ${a1}-${b1} crosses ${a2}-${b2}`).toBe(false);
          expect(segmentDistance(p1, p2, q1, q2), `level ${level.id}: road ${a1}-${b1} nearly touches ${a2}-${b2}`).toBeGreaterThanOrEqual(ROAD_CLEARANCE);
        }
      }
    }
  });

  it('keeps stage one a two-step mouse-first tutorial', () => {
    const level = LEVELS[0];
    // Baseline for the real-mouse first capture: a→b must be a legal road.
    expect(hasRoad(level.roads, 'a', 'b')).toBe(true);
    // a must not reach the enemy nest directly; d only opens through b or c.
    expect(hasRoad(level.roads, 'a', 'd')).toBe(false);
    // a has exactly one exit: the bridgehead b. The enemy can never bypass b to
    // hit the player's home, so the tutorial's first order is always safe.
    expect(neighboursOf(level.roads, 'a')).toEqual(['b']);
    expect(neighboursOf(level.roads, 'd').sort()).toEqual(['b', 'c']);
    expect(roadDistances(level.roads, ['a']).get('d')).toBe(2);
    // Losing b cuts the whole eastern half off; c is the optional second nest.
    const withoutBridgehead = roadDistances(level.roads.filter(([x, y]) => x !== 'b' && y !== 'b'), ['a']);
    expect([...withoutBridgehead.keys()]).toEqual(['a']);

    const sim = new Simulation(level);
    expect(sim.dispatch(['a'], 'b', .5)).toBeGreaterThan(0);
    expect(sim.world.fleets.map(f => [f.from, f.to])).toEqual([['a', 'b']]);
    const remaining = sim.world.colonies.find(c => c.id === 'a')!.units;
    // The illegal a→d order costs nothing and creates no phantom fleet.
    expect(sim.dispatch(['a'], 'd', .5)).toBe(0);
    expect(sim.world.fleets).toHaveLength(1);
    expect(sim.world.colonies.find(c => c.id === 'a')!.units).toBe(remaining);
  });

  it('keeps stage two rear garrisons off the enemy gates', () => {
    const level = LEVELS[1];
    expect(level.colonies.find(c => c.id === 'b')?.owner).toBe(1);
    expect(hasRoad(level.roads, 'a', 'b')).toBe(true);
    // The owned rear pair may only feed b/c one hop at a time; e and f sit behind d.
    expect(neighboursOf(level.roads, 'a').sort()).toEqual(['b', 'c']);
    for (const gate of ['e', 'f']) {
      expect(hasRoad(level.roads, 'a', gate), `level 2: a must not reach ${gate}`).toBe(false);
      expect(neighboursOf(level.roads, gate)).toEqual(['d']);
    }
    const hops = roadDistances(level.roads, ['a']);
    expect(hops.get('e')).toBe(3);
    expect(hops.get('f')).toBe(3);
    const withoutBridgehead = roadDistances(level.roads.filter(([x, y]) => x !== 'd' && y !== 'd'), ['a']);
    expect(withoutBridgehead.has('e')).toBe(false);
    expect(withoutBridgehead.has('f')).toBe(false);
    // Both forward nests sit one hop from the rear, and b↔c lets the pair team up.
    expect(roadDistances(level.roads, ['a']).get('b')).toBe(1);
    expect(roadDistances(level.roads, ['a']).get('c')).toBe(1);
    expect(roadDistances(level.roads, ['b']).get('c')).toBe(1);
  });

  it('does not change roads with race or difficulty', () => {
    const races = Object.keys(RACES) as RaceId[];
    const difficulties: Difficulty[] = ['easy', 'normal', 'hard'];
    for (const level of LEVELS) {
      const snapshot = JSON.stringify(level.roads);
      for (const race of races) for (const difficulty of difficulties) {
        const sim = new Simulation(level, race, difficulty);
        expect(sim.world.roads, `level ${level.id} ${race}/${difficulty}`).toEqual(level.roads);
      }
      expect(JSON.stringify(level.roads)).toBe(snapshot);
    }
  });

  it('uses distinct hand-built templates with strategic gates', () => {
    const signatures = LEVELS.map(level => level.roads.map(([a, b]) => [a, b].sort().join(':')).sort().join(','));
    expect(new Set(signatures).size).toBe(LEVELS.length);
    // Every cannon sits on a through route, so each one is a real gate, never a dead end.
    for (const level of LEVELS) {
      for (const cannon of level.colonies.filter(c => c.kind === 'cannon')) {
        expect(neighboursOf(level.roads, cannon.id).length, `level ${level.id}: cannon ${cannon.id} is a dead end`).toBeGreaterThanOrEqual(2);
      }
    }
    // Bridgehead hubs (four roads) exist; some enemy capitals are only reachable through a gate.
    expect(LEVELS.filter(level => [...degrees(level).values()].some(d => d >= 4)).length).toBeGreaterThanOrEqual(3);
    expect(LEVELS.filter(level => level.colonies.some(c => c.owner > 1 && neighboursOf(level.roads, c.id).length <= 2)).length).toBeGreaterThanOrEqual(2);
  });
});
