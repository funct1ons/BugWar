import { findDispatchPath, hasRoad } from '../core/roads';
import type { Colony, Road, World } from '../core/types';

/**
 * Pure road geometry and preview helpers for BattleScene.
 *
 * Roads are straight by contract: a fleet travels from colony centre to colony
 * centre, so the visible lane is the same edge, only trimmed at both ends so it
 * starts outside the building art instead of running underneath it. Nothing in
 * this module invents a connection: adjacency questions are delegated to
 * core/roads.hasRoad, and a preview segment is always a real road segment.
 */

/** Trim each end of a lane so it starts outside the nest/cannon art and plate. */
export const ROAD_CLEARANCE = 82;
/** Keep a short lane readable even when two colonies sit unusually close. */
export const ROAD_MIN_GAP = 26;

export type RoadColony = Pick<Colony, 'id' | 'x' | 'y'>;

export interface RoadSegment {
  readonly from: string;
  readonly to: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export interface RoadPreview {
  /** Selected sources, as a set for cheap membership checks. */
  readonly sources: Set<string>;
  /** Rendered road segments touching at least one source. */
  readonly segments: RoadSegment[];
  /** Colonies directly connected to at least one source (core/roads.hasRoad). */
  readonly targets: Set<string>;
  /** Real segments linking a hovered colony to a source; empty when not adjacent. */
  readonly hoverSegments: RoadSegment[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
const finitePoint = (p: RoadColony) => Number.isFinite(p.x) && Number.isFinite(p.y);

function asSet(ids: Iterable<string>): Set<string> {
  return new Set(ids);
}

/**
 * Straight, endpoint-trimmed lanes for rendering. Duplicate and reversed road
 * declarations collapse to one segment; invalid ids and zero-length edges are
 * skipped so a bad level fixture can never produce NaNs or invisible hit lanes.
 */
export function roadSegments(
  roads: readonly Road[],
  colonies: readonly RoadColony[],
  clearance = ROAD_CLEARANCE,
): RoadSegment[] {
  const byId = new Map(colonies.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const segments: RoadSegment[] = [];
  const padLimit = Math.max(0, clearance);
  for (const [a, b] of roads) {
    if (!a || !b || a === b) continue;
    const key = pairKey(a, b);
    if (seen.has(key)) continue;
    const from = byId.get(a);
    const to = byId.get(b);
    if (!from || !to || !finitePoint(from) || !finitePoint(to)) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 1e-6)) continue;
    seen.add(key);
    const ux = dx / length;
    const uy = dy / length;
    const pad = Math.min(padLimit, Math.max(0, (length - ROAD_MIN_GAP) / 2));
    segments.push({
      from: a,
      to: b,
      x1: from.x + ux * pad,
      y1: from.y + uy * pad,
      x2: to.x - ux * pad,
      y2: to.y - uy * pad,
    });
  }
  return segments;
}

/** Road segments touching any selected source. No source means no preview. */
export function previewRoads(segments: readonly RoadSegment[], sources: Iterable<string>): RoadSegment[] {
  const sourceSet = asSet(sources);
  if (!sourceSet.size) return [];
  return segments.filter((s) => sourceSet.has(s.from) || sourceSet.has(s.to));
}

/**
 * The source set a preview should paint. Dragging from a nest that is not part of
 * the current selection previews the pending single-source order; otherwise the
 * whole selection is shown. Keeping this pure makes the drag/click contract
 * testable independently of Phaser.
 */
export function previewSourceSet(selected: Iterable<string>, dragSource?: string | null): Set<string> {
  const sourceSet = asSet(selected);
  if (dragSource && !sourceSet.has(dragSource)) return new Set([dragSource]);
  return sourceSet;
}

/** Every colony directly adjacent to any source, including friendly ones. */
export function adjacentTargets(roads: readonly Road[], sources: Iterable<string>): Set<string> {
  const sourceSet = asSet(sources);
  const targets = new Set<string>();
  if (!sourceSet.size) return targets;
  for (const [a, b] of roads) {
    if (sourceSet.has(a) && hasRoad(roads, a, b)) targets.add(b);
    if (sourceSet.has(b) && hasRoad(roads, b, a)) targets.add(a);
  }
  return targets;
}

/**
 * Sources with a direct road to the target. Kept for legacy geometry tests and
 * the direct-edge helpers above; live orders use reachableSources() so the UI
 * and Simulation ask the exact same routing question.
 */
export function directSources(roads: readonly Road[], sources: Iterable<string>, target: string): string[] {
  if (!target) return [];
  const found: string[] = [];
  for (const source of asSet(sources)) {
    if (source !== target && hasRoad(roads, source, target)) found.push(source);
  }
  return found;
}

/** The slice of a live world needed to answer a dispatch-routing question. */
export type DispatchWorld = Pick<World, 'roads' | 'colonies'>;

export interface ReachableSource {
  readonly source: string;
  /** Full node list from source to target, inclusive; `path[0]` is the source. */
  readonly path: string[];
}

/**
 * Core returns the dispatch route; tolerate a bare intermediate list by pinning
 * both endpoints. A path shorter than one segment is not a route.
 */
function normalizePath(path: readonly string[] | null, from: string, to: string): string[] | null {
  if (!path || !path.length) return null;
  const nodes = [...path];
  if (nodes[0] !== from) nodes.unshift(from);
  if (nodes[nodes.length - 1] !== to) nodes.push(to);
  if (nodes.length < 2) return null;
  for (const node of nodes) if (typeof node !== 'string' || !node) return null;
  return nodes;
}

/**
 * Selected sources that can reach `target` along owned intermediates, with the
 * exact path core/roads.findDispatchPath chose. Source order is preserved so the
 * preview and the dispatch call stay deterministic and identical.
 */
export function reachableSources(
  world: DispatchWorld,
  sources: Iterable<string>,
  target: string,
  owner: number,
): ReachableSource[] {
  if (!target || !Number.isInteger(owner) || owner <= 0) return [];
  const found: ReachableSource[] = [];
  for (const source of asSet(sources)) {
    if (!source || source === target) continue;
    const path = normalizePath(findDispatchPath(world, source, target, owner), source, target);
    if (path) found.push({ source, path });
  }
  return found;
}

/** Every colony (any owner) reachable from at least one source through owned intermediates. */
export function reachableTargets(world: DispatchWorld, sources: Iterable<string>, owner: number): Set<string> {
  const sourceSet = asSet(sources);
  const targets = new Set<string>();
  if (!sourceSet.size || owner <= 0) return targets;
  for (const colony of world.colonies) {
    if (!colony?.id || sourceSet.has(colony.id)) continue;
    if (reachableSources(world, sourceSet, colony.id, owner).length) targets.add(colony.id);
  }
  return targets;
}

/** Map each consecutive pair of a real path to its rendered road segment. */
export function pathSegments(path: readonly string[], segments: readonly RoadSegment[]): RoadSegment[] {
  const byPair = new Map(segments.map((segment) => [pairKey(segment.from, segment.to), segment]));
  const found: RoadSegment[] = [];
  for (let i = 1; i < path.length; i++) {
    const segment = byPair.get(pairKey(path[i - 1], path[i]));
    if (segment && !found.includes(segment)) found.push(segment);
  }
  return found;
}

export interface RoutePreview {
  /** Selected sources, as a set for cheap membership checks. */
  readonly sources: Set<string>;
  /** Per-source real routes to the hovered colony (union is drawn). */
  readonly hoverRoutes: ReachableSource[];
  /** All colonies reachable from any source, friendly or not. */
  readonly targets: Set<string>;
  /** First real route to the hovered colony, inclusive; empty when unreachable. */
  readonly hoverPath: string[];
  /** Real road segments of every hovered route, de-duplicated. */
  readonly hoverSegments: RoadSegment[];
}

/**
 * One preview snapshot for path-based orders: reachable target rings and the
 * actual multi-edge route to the hovered colony. The route always comes from
 * core/roads.findDispatchPath — never a synthetic straight line between colonies.
 */
export function routePreview(
  world: DispatchWorld,
  segments: readonly RoadSegment[],
  sources: Iterable<string>,
  owner: number,
  hoverId?: string | null,
): RoutePreview {
  const sourceSet = asSet(sources);
  const targets = reachableTargets(world, sourceSet, owner);
  const hover = hoverId && !sourceSet.has(hoverId) ? hoverId : '';
  const hoverRoutes = hover ? reachableSources(world, sourceSet, hover, owner) : [];
  const hoverSegments: RoadSegment[] = [];
  for (const route of hoverRoutes) {
    for (const segment of pathSegments(route.path, segments)) if (!hoverSegments.includes(segment)) hoverSegments.push(segment);
  }
  return { sources: sourceSet, hoverRoutes, targets, hoverPath: hoverRoutes[0]?.path ?? [], hoverSegments };
}

/**
 * One preview snapshot for selection painting:
 *   segments      real roads around the sources,
 *   targets       direct neighbours for target rings,
 *   hoverSegments roads between the hovered colony and a source (never a
 *                 synthetic line across the map, and empty for non-neighbours).
 */
export function roadPreview(
  roads: readonly Road[],
  segments: readonly RoadSegment[],
  sources: Iterable<string>,
  hoverId?: string | null,
): RoadPreview {
  const sourceSet = asSet(sources);
  const highlighted = previewRoads(segments, sourceSet);
  const targets = adjacentTargets(roads, sourceSet);
  const hover = hoverId && !sourceSet.has(hoverId) ? hoverId : '';
  const hoverSegments = hover
    ? highlighted.filter((s) => s.from === hover || s.to === hover)
    : [];
  return { sources: sourceSet, segments: highlighted, targets, hoverSegments };
}
