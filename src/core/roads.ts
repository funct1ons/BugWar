import type { Colony, Road, World } from './types';

/**
 * Roads are undirected, so a segment matches in either direction.
 * A colony is intentionally never its own neighbour; self-pairs are not roads.
 */
export function hasRoad(roads: readonly Road[], from: string, to: string): boolean {
  if (!from || !to || from === to) return false;
  for (const [a, b] of roads) {
    if ((a === from && b === to) || (a === to && b === from)) return true;
  }
  return false;
}

/** Unique undirected neighbours of a colony in road declaration order; self-pairs are skipped. */
export function neighboursOf(roads: readonly Road[], id: string): string[] {
  const found: string[] = [];
  for (const [a, b] of roads) {
    const other = a === id ? b : b === id ? a : null;
    if (!other || other === id || found.includes(other)) continue;
    found.push(other);
  }
  return found;
}

/** Breadth-first hop distance over the undirected road graph from one or more seeds. */
export function roadDistances(roads: readonly Road[], seeds: Iterable<string>): Map<string, number> {
  const distance = new Map<string, number>();
  const queue: string[] = [];
  for (const seed of seeds) {
    if (!seed || distance.has(seed)) continue;
    distance.set(seed, 0);
    queue.push(seed);
  }
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    const next = distance.get(id)! + 1;
    for (const neighbour of neighboursOf(roads, id)) {
      if (distance.has(neighbour)) continue;
      distance.set(neighbour, next);
      queue.push(neighbour);
    }
  }
  return distance;
}

/** Detached copy so a live world can never mutate the level definition (and vice versa). */
export function cloneRoads(roads: readonly Road[]): Road[] {
  return roads.map(([a, b]) => [a, b] as const);
}

/** One candidate walk during the shortest-route search. */
interface Walk {
  node: string;
  path: string[];
  distance: number;
}

const pathKey = (path: readonly string[]): string => path.join('\u0000');

/**
 * Deterministic shortest walk: total Euclidean length first, then fewer hops, then the
 * lexicographically smallest node sequence. This keeps the route stable across runs and
 * frame partitions even when two roads have exactly the same length.
 */
function preferWalk(candidate: Walk, current: Walk): boolean {
  if (candidate.distance < current.distance - 1e-9) return true;
  if (candidate.distance > current.distance + 1e-9) return false;
  if (candidate.path.length !== current.path.length) return candidate.path.length < current.path.length;
  return pathKey(candidate.path) < pathKey(current.path);
}

/**
 * Legal multi-hop dispatch route between two colonies.
 *
 * The source must belong to `owner`; every intermediate stop must also belong to `owner`,
 * while the final target may have any owner (including an enemy or a neutral colony).
 * Roads are the only connections: this is a shortest-way search over the declared road
 * graph, never a straight line and never a fallback. `null` means the order is impossible,
 * so callers can reject it without charging or spawning anything.
 */
export function findDispatchPath(
  world: Pick<World, 'roads' | 'colonies'>,
  from: string,
  to: string,
  owner: number,
): string[] | null {
  if (!from || !to || from === to || !Number.isFinite(owner) || owner <= 0) return null;
  const colonies = new Map<string, Colony>();
  for (const colony of world.colonies) if (colony && typeof colony.id === 'string') colonies.set(colony.id, colony);
  const source = colonies.get(from), target = colonies.get(to);
  if (!source || !target || source.owner !== owner) return null;
  const best = new Map<string, Walk>([[from, { node: from, path: [from], distance: 0 }]]);
  const frontier: Walk[] = [best.get(from)!];
  const settled = new Set<string>();
  while (frontier.length) {
    let pick = 0;
    for (let i = 1; i < frontier.length; i++) if (preferWalk(frontier[i], frontier[pick])) pick = i;
    const current = frontier.splice(pick, 1)[0];
    if (settled.has(current.node)) continue;
    settled.add(current.node);
    if (current.node === to) return [...current.path];
    const previous = colonies.get(current.node);
    if (!previous) continue;
    for (const neighbour of neighboursOf(world.roads, current.node)) {
      if (current.path.includes(neighbour)) continue;
      const colony = colonies.get(neighbour);
      if (!colony) continue;
      // Intermediates are strictly ours; only the final order target may be foreign.
      if (neighbour !== to && colony.owner !== owner) continue;
      const walk: Walk = {
        node: neighbour,
        path: [...current.path, neighbour],
        distance: current.distance + Math.hypot(colony.x - previous.x, colony.y - previous.y),
      };
      const known = best.get(neighbour);
      if (known && !preferWalk(walk, known)) continue;
      best.set(neighbour, walk);
      frontier.push(walk);
    }
  }
  return null;
}
