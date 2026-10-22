/** Shared production/playback contract. Music is rendered offline, never synthesized at runtime. */
export type ScoreId = 'menu' | 'meadow' | 'roots' | 'marsh' | 'amber' | 'finale' | 'victory' | 'defeat';
export type MusicIntensity = 0 | 1 | 2;
export interface ScoreCue {
  id: ScoreId;
  title: string;
  bpm: number;
  beatsPerBar: number;
  bars: number;
  loop: boolean;
  files: readonly string[];
}
const battle = (id: ScoreId, title: string, bpm: number): ScoreCue => ({
  id, title, bpm, beatsPerBar: 4, bars: 48, loop: true,
  files: [`music-${id}-base.ogg`, `music-${id}-motion.ogg`, `music-${id}-power.ogg`],
});
export const SCORE: Record<ScoreId, ScoreCue> = {
  menu: { id: 'menu', title: '巢灯与远方', bpm: 96, beatsPerBar: 4, bars: 48, loop: true, files: ['music-menu.ogg'] },
  meadow: battle('meadow', '初晴的原野', 108),
  roots: battle('roots', '根脉的守望', 100),
  marsh: battle('marsh', '苇影与归途', 92),
  amber: battle('amber', '琥珀之冠', 116),
  finale: battle('finale', '十三盏灯的交响', 120),
  victory: { id: 'victory', title: '巢灯重燃', bpm: 108, beatsPerBar: 4, bars: 8, loop: false, files: ['music-victory.ogg'] },
  defeat: { id: 'defeat', title: '归途未尽', bpm: 76, beatsPerBar: 4, bars: 8, loop: false, files: ['music-defeat.ogg'] },
};
export const scoreSeconds = (cue: ScoreCue): number => cue.bars * cue.beatsPerBar * 60 / cue.bpm;
