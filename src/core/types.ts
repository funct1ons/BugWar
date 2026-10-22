export type RaceId = 'agile' | 'fast' | 'strong';
export type BuildingKind = 'nest' | 'cannon';
export type Difficulty = 'easy' | 'normal' | 'hard';
export interface ColonyConfig { id:string; x:number; y:number; owner:number; kind:BuildingKind; units:number; production?:number }
export interface FactionConfig { id:number; race:RaceId }
export interface LevelConfig { id:number; name:string; subtitle:string; biome:'meadow'|'roots'|'marsh'|'amber'; par:number; openingGrace?:Partial<Record<Difficulty,number>>; factions:FactionConfig[]; colonies:ColonyConfig[]; tip:string }
export interface Colony extends ColonyConfig { production:number }
export interface Fleet { id:number; owner:number; race:RaceId; from:string; to:string; x:number; y:number; count:number; initialCount:number }
export interface GameEvent { type:'dispatch'|'impact'|'capture'|'shot'|'skill'|'end'; x:number; y:number; owner:number; targetX?:number; targetY?:number; amount?:number }
export interface World { elapsed:number; colonies:Colony[]; fleets:Fleet[]; factions:FactionConfig[]; energy:Record<number,number>; status:'playing'|'won'|'lost'; stats:{sent:number; kills:number; captures:number; lost:number; skills:number; casualties?:number}; events:GameEvent[] }
/** Conservative reconstruction, not claimed original game statistics. */
export const RACES: Record<RaceId,{name:string;speed:number;attack:number;defense:number;production:number}> = {
  agile:{name:'Agile',speed:100,attack:1,defense:1,production:1},
  fast:{name:'Fast',speed:145,attack:0.8,defense:0.8,production:1},
  strong:{name:'Strong',speed:72,attack:1.35,defense:1.3,production:1},
};
