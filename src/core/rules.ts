import { RACES, type BuildingKind, type Fleet } from './types';

/**
 * Battle constants shared by the simulation, the AI planner and the codex.
 * This is the single source of truth so displayed numbers cannot drift from gameplay.
 */

/** One cannon firepower anchor: the garrison count and the damage/interval it grants. */
export interface CannonFirepowerNode { garrison:number; damage:number; cooldown:number }

/**
 * Cannon firepower scales with the live garrison. Between anchors the value is
 * linearly interpolated; below the first and above the last anchor it is clamped.
 * The last anchor is the firepower cap: extra defenders add no damage or rate.
 */
export const CANNON_FIREPOWER_NODES: readonly CannonFirepowerNode[] = [
  { garrison: 0, damage: 4, cooldown: 0.9 },
  { garrison: 10, damage: 6, cooldown: 0.8 },
  { garrison: 30, damage: 8, cooldown: 0.65 },
  { garrison: 60, damage: 10, cooldown: 0.5 },
] as const;

/** Garrison needed for maximum firepower; more troops do not make the cannon stronger. */
export const CANNON_GARRISON_CAP = CANNON_FIREPOWER_NODES[CANNON_FIREPOWER_NODES.length - 1].garrison;

/** Empty-tower reference values; also what an unselected cannon displays in the codex. */
export const CANNON_BASE_FIREPOWER: CannonFirepowerNode = CANNON_FIREPOWER_NODES[0];

export interface CannonFirepower extends CannonFirepowerNode {
  /** True once the garrison reached the firepower cap; extra troops change nothing. */
  capped: boolean;
  /** Long-run damage per second at this garrison. */
  dps: number;
}

const round4 = (value: number) => Number(value.toFixed(4));

/** Pure garrison → firepower lookup shared by the simulation, the AI and the codex. */
export function cannonFirepower(units: number): CannonFirepower {
  const garrison = Number.isFinite(units) ? Math.max(0, units) : 0;
  const capped = garrison >= CANNON_GARRISON_CAP;
  const clamped = Math.min(garrison, CANNON_GARRISON_CAP);
  let index = 0;
  while (index < CANNON_FIREPOWER_NODES.length - 2 && clamped > CANNON_FIREPOWER_NODES[index + 1].garrison) index += 1;
  const low = CANNON_FIREPOWER_NODES[index], high = CANNON_FIREPOWER_NODES[index + 1];
  const span = high.garrison - low.garrison;
  const t = span > 0 ? (clamped - low.garrison) / span : 1;
  const damage = round4(low.damage + (high.damage - low.damage) * t);
  const cooldown = round4(low.cooldown + (high.cooldown - low.cooldown) * t);
  return { garrison, damage, cooldown, capped, dps: round4(damage / cooldown) };
}

/**
 * Shots a ready cannon can land while a fleet stays inside its range for `exposure`
 * seconds: one ready shot plus one per completed interval. The epsilon keeps exact
 * multiples (0.9/0.45…) from rounding down. The AI route estimate and the codex
 * growth table share this rule; the simulation tracks the same cadence as a charge.
 */
export function cannonHitsForExposure(exposure: number, cooldown: number): number {
  if (!Number.isFinite(exposure) || exposure < 0) return 0;
  if (!Number.isFinite(cooldown) || cooldown <= 0) return 1;
  return 1 + Math.floor((exposure + 1e-9) / cooldown);
}

/** Expected losses for one cannon at the current garrison across `exposure` seconds. */
export function cannonLossForExposure(units: number, exposure: number): number {
  const firepower = cannonFirepower(units);
  return round4(firepower.damage * cannonHitsForExposure(exposure, firepower.cooldown));
}

export const BATTLE_RULES = {
  nestProduction: 1,
  /** Natural growth stops here; a garrison above the cap is kept, never truncated. */
  productionCap: 100,
  /** Hatchery base rate: the production building that trades a slower role for more troops. */
  hatcheryProduction: 1.5,
  /** One-segment speed boost granted by leaving a friendly wind colony. Never stacks. */
  windSpeedMultiplier: 1.35,
  /** Extra troops a Brood fleet receives when it first takes a neutral production colony. */
  broodCaptureBonus: 8,
  /** Settled defenders only; neutrals and road clashes keep their race defence. */
  garrisonDefenseMultiplier: 1.2,
  cannonRange: 250,
  /** Empty-tower base; a garrisoned cannon interpolates upwards, see CANNON_FIREPOWER_NODES. */
  cannonDamage: CANNON_BASE_FIREPOWER.damage,
  cannonCooldown: CANNON_BASE_FIREPOWER.cooldown,
  energyRate: 2,
  skillCost: 100,
  skillRadius: 135,
  skillDamage: 18,
} as const;

/** Additional defence of an occupied building; never used for marching fleets. */
export function garrisonDefenseMultiplier(owner: number): number {
  return owner > 0 ? BATTLE_RULES.garrisonDefenseMultiplier : 1;
}

/** True for the two building kinds that generate troops on their own. */
export function isProductive(kind: BuildingKind): boolean {
  return kind === 'nest' || kind === 'hatchery';
}

/** Base production of a building kind before the map override and the owner's race. */
export function defaultProduction(kind: BuildingKind): number {
  if (kind === 'nest') return BATTLE_RULES.nestProduction;
  if (kind === 'hatchery') return BATTLE_RULES.hatcheryProduction;
  // Cannons and wind do not grow troops, so a map override cannot make them productive.
  return 0;
}

/**
 * Travel speed of one fleet for the current segment: race speed times the wind boost
 * carried by `haste`. The multiplier always comes from the constant, so a stale or
 * repeated value on the fleet can never stack.
 */
export function fleetSpeed(fleet: Fleet): number {
  const race = RACES[fleet.race] ?? RACES.agile;
  const boosted = Number.isFinite(fleet.haste) && (fleet.haste as number) > 0;
  return race.speed * (boosted ? BATTLE_RULES.windSpeedMultiplier : 1);
}

/**
 * Road clashes: hostile fleets sharing a road meet instead of slipping past each other.
 * The radius is the contact tolerance of the swept collision test, the pause is how long
 * the survivors hold position before resuming their itinerary.
 */
export const ROAD_CLASH = {
  radius: 10,
  pause: 0.25,
} as const;
