import type { Road } from './types';

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
