export type RaceId = 'agile' | 'fast' | 'strong' | 'brood';
export type BuildingKind = 'nest' | 'cannon' | 'hatchery' | 'wind';
export type Difficulty = 'easy' | 'normal' | 'hard';
/** One undirected road segment between two colony ids. Self-pairs are not roads. */
export type Road = readonly [string,string];
/** Omitted objective means elimination; capture only requires taking the marked colony. */
export interface CaptureObjective { type:'capture'; target:string }
export interface ColonyConfig { id:string; x:number; y:number; owner:number; kind:BuildingKind; units:number; production?:number }
export interface FactionConfig { id:number; race:RaceId }
export interface LevelConfig { id:number; name:string; subtitle:string; biome:'meadow'|'roots'|'marsh'|'amber'; par:number; openingGrace?:Partial<Record<Difficulty,number>>; factions:FactionConfig[]; colonies:ColonyConfig[]; roads:Road[]; tip:string; objective?:CaptureObjective }
export interface Colony extends ColonyConfig { production:number }
/** from/to are the current segment. route holds nodes AFTER to; destination is the final order target. */
export interface Fleet { id:number; owner:number; race:RaceId; from:string; to:string; x:number; y:number; count:number; initialCount:number; route?:string[]; destination?:string; haste?:number; engaging?:boolean; combatPause?:number }
export interface GameEvent { type:'dispatch'|'impact'|'capture'|'shot'|'skill'|'end'|'clash'|'brood'; x:number; y:number; owner:number; targetX?:number; targetY?:number; amount?:number }
export interface World { elapsed:number; colonies:Colony[]; fleets:Fleet[]; factions:FactionConfig[]; roads:Road[]; objective?:CaptureObjective; energy:Record<number,number>; status:'playing'|'won'|'lost'; stats:{sent:number; kills:number; captures:number; lost:number; skills:number; casualties?:number}; events:GameEvent[] }
/** Reconstruction, not claimed original game statistics. Brood trades 10% combat strength for expansion rewards. */
export const RACES: Record<RaceId,{name:string;speed:number;attack:number;defense:number;production:number}> = {
  agile:{name:'Agile',speed:100,attack:1,defense:1,production:1},
  fast:{name:'Fast',speed:145,attack:0.8,defense:0.8,production:1},
  strong:{name:'Strong',speed:72,attack:1.35,defense:1.3,production:1},
  brood:{name:'Brood',speed:100,attack:0.9,defense:0.9,production:1},
};
