import { describe, it, expect } from 'vitest';
import { hasRoad } from '../src/core/roads';
import type { Road } from '../src/core/types';
import {
  ROAD_CLEARANCE,
  ROAD_MIN_GAP,
  adjacentTargets,
  directSources,
  previewRoads,
  previewSourceSet,
  roadPreview,
  roadSegments,
  type RoadColony,
} from '../src/game/roadRender';

/**
 * Pure renderer contract for the fixed-road scheme:
 *  - lanes are the same straight centre-to-centre edges fleets travel,
 *  - only real roads are ever highlighted,
 *  - a non-adjacent hover produces no preview segment at all,
 *  - dispatch source filtering delegates to core/roads.hasRoad.
 */

const colonies: RoadColony[] = [
  { id: 'a', x: 200, y: 460 },
  { id: 'b', x: 600, y: 300 },
  { id: 'c', x: 600, y: 700 },
  { id: 'd', x: 1000, y: 460 },
  { id: 'e', x: 1400, y: 300 },
];
const roads: Road[] = [
  ['a', 'b'],
  ['b', 'c'],
  ['c', 'd'],
  ['b', 'e'],
];
const segmentKeys = (segments: { from: string; to: string }[]) => segments.map((s) => `${s.from}-${s.to}`);
const sorted = (values: Iterable<string>) => [...values].sort();

describe('road renderer geometry', () => {
  it('draws one straight lane per road, trimmed outside the building art', () => {
    const segments = roadSegments(roads, colonies);
    expect(segments).toHaveLength(roads.length);
    const ab = segments.find((s) => s.from === 'a' && s.to === 'b')!;
    const a = colonies[0], b = colonies[1];
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    expect(Math.hypot(ab.x2 - ab.x1, ab.y2 - ab.y1)).toBeCloseTo(length - ROAD_CLEARANCE * 2, 6);
    // Both trimmed ends stay on the exact centre-to-centre line, so bugs that walk
    // straight between colonies move along the drawn lane.
    expect((ab.x1 - a.x) * (b.y - a.y) - (ab.y1 - a.y) * (b.x - a.x)).toBeCloseTo(0, 6);
    expect((ab.x2 - a.x) * (b.y - a.y) - (ab.y2 - a.y) * (b.x - a.x)).toBeCloseTo(0, 6);
    // No lane reaches underneath either colony centre.
    expect(Math.hypot(ab.x1 - a.x, ab.y1 - a.y)).toBeCloseTo(ROAD_CLEARANCE, 6);
    expect(Math.hypot(ab.x2 - b.x, ab.y2 - b.y)).toBeCloseTo(ROAD_CLEARANCE, 6);
  });

  it('keeps a short lane readable instead of letting the trim erase it', () => {
    const short: RoadColony[] = [
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 100, y: 0 },
    ];
    const [lane] = roadSegments([['a', 'b']], short);
    expect(lane.x1).toBeCloseTo((100 - ROAD_MIN_GAP) / 2, 6);
    expect(lane.x2 - lane.x1).toBeCloseTo(ROAD_MIN_GAP, 6);
    expect(lane.y1).toBe(0);
  });

  it('collapses reversed duplicates and skips self, missing, zero-length and non-finite edges', () => {
    const duplicated: Road[] = [
      ['b', 'a'],
      ['a', 'b'],
      ['a', 'a'],
      ['a', 'ghost'],
    ];
    expect(roadSegments(duplicated, colonies)).toHaveLength(1);
    const broken: RoadColony[] = [
      { id: 'a', x: Number.NaN, y: 0 },
      { id: 'b', x: 100, y: 0 },
      { id: 'c', x: 100, y: 0 },
    ];
    expect(roadSegments([['a', 'b'], ['b', 'b'], ['b', 'c']], broken)).toEqual([]);
  });
});

describe('road adjacency and dispatch filtering', () => {
  it('reads roads as undirected direct neighbours, never as a complete graph', () => {
    expect(sorted(adjacentTargets(roads, ['a']))).toEqual(['b']);
    expect(sorted(adjacentTargets(roads, ['b']))).toEqual(['a', 'c', 'e']);
    expect(sorted(adjacentTargets(roads, ['a', 'c']))).toEqual(['b', 'd']);
    expect(adjacentTargets(roads, ['d']).has('e')).toBe(false);
    expect(hasRoad(roads, 'a', 'd')).toBe(false);
    expect(directSources(roads, ['b'], 'a')).toEqual(['b']);
    expect(directSources([['a', 'b']], ['a'], 'b')).toEqual(['a']);
  });

  it('returns only road-connected sources in selection order and skips self-targets', () => {
    expect(directSources(roads, ['c', 'a', 'd'], 'b')).toEqual(['c', 'a']);
    expect(directSources(roads, ['a', 'd'], 'e')).toEqual([]);
    expect(directSources(roads, ['b'], 'b')).toEqual([]);
    expect(directSources(roads, new Set(['a', 'b', 'c']), 'b')).toEqual(['a', 'c']);
  });

  it('treats an empty road list as no connectivity and never as a fallback', () => {
    expect(adjacentTargets([], ['a']).size).toBe(0);
    expect(directSources([], ['a'], 'b')).toEqual([]);
  });
});

describe('selection preview contract', () => {
  const segments = roadSegments(roads, colonies);

  it('highlights only lanes touching a selected source', () => {
    const preview = roadPreview(roads, segments, ['a']);
    expect(segmentKeys(preview.segments)).toEqual(['a-b']);
    expect(sorted(preview.targets)).toEqual(['b']);
    expect(preview.hoverSegments).toEqual([]);
  });

  it('multi-select highlights the union of real lanes and only adjacent targets', () => {
    const preview = roadPreview(roads, segments, new Set(['a', 'c']));
    expect(segmentKeys(preview.segments)).toEqual(['a-b', 'b-c', 'c-d']);
    expect(sorted(preview.targets)).toEqual(['b', 'd']);
    for (const target of preview.targets) {
      expect([...preview.sources].some((source) => hasRoad(roads, source, target))).toBe(true);
    }
    expect(preview.segments.some((s) => s.from === 'e' || s.to === 'e')).toBe(false);
  });

  it('never fabricates a cross-road preview for a non-adjacent hover', () => {
    const preview = roadPreview(roads, segments, ['a'], 'c');
    expect(preview.targets.has('c')).toBe(false);
    expect(preview.hoverSegments).toEqual([]);
    expect(preview.segments.some((s) => s.from === 'c' || s.to === 'c')).toBe(false);

    const far = roadPreview(roads, segments, ['a'], 'd');
    expect(far.hoverSegments).toEqual([]);
    expect(far.segments).toHaveLength(1);
    expect(far.segments[0]).toMatchObject({ from: 'a', to: 'b' });
  });

  it('emphasises only the actual lane when hovering a direct neighbour', () => {
    const preview = roadPreview(roads, segments, ['a'], 'b');
    expect(segmentKeys(preview.hoverSegments)).toEqual(['a-b']);
    const multi = roadPreview(roads, segments, ['a', 'c'], 'b');
    expect(segmentKeys(multi.hoverSegments)).toEqual(['a-b', 'b-c']);
  });

  it('returns an empty preview without a source and does not duplicate segments', () => {
    expect(roadPreview(roads, segments, []).segments).toEqual([]);
    expect(roadPreview(roads, segments, []).targets.size).toBe(0);
    const duplicated: Road[] = [['a', 'b'], ['b', 'a']];
    const lanes = roadSegments(duplicated, colonies);
    expect(previewRoads(lanes, ['a'])).toHaveLength(1);
    expect(previewRoads(lanes, ['d'])).toEqual([]);
  });

  it('previews a pending drag source alone, or the whole selection when it is selected', () => {
    expect([...previewSourceSet([], 'a')]).toEqual(['a']);
    expect([...previewSourceSet(['a', 'c'], null)]).toEqual(['a', 'c']);
    expect([...previewSourceSet(['a', 'c'], 'a')]).toEqual(['a', 'c']);
    expect([...previewSourceSet(['a', 'c'], 'd')]).toEqual(['d']);
    expect(previewSourceSet([], null).size).toBe(0);
  });
});
