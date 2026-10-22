/**
 * Battle constants shared by the simulation, the AI planner and the codex.
 * This is the single source of truth so displayed numbers cannot drift from gameplay.
 */
export const BATTLE_RULES = {
  nestProduction: 1,
  cannonRange: 200,
  cannonDamage: 2,
  cannonCooldown: 0.75,
  energyRate: 2,
  skillCost: 100,
  skillRadius: 135,
  skillDamage: 18,
} as const;
