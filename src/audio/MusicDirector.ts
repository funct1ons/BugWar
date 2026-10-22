import type { LevelConfig, World } from '../core/types';
import { isProductive } from '../core/rules';
import type { MusicIntensity, ScoreId } from './score';

/** AudioSystem owns bar-boundary scheduling; this director only requests layers. */
export interface MusicOutput {
  music(track: ScoreId | 'battle'): void;
  setIntensity(level: MusicIntensity): void;
  setPaused(paused: boolean): void;
}
const finite = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1e9, n)) : 0;
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export class MusicDirector {
  private mode: 'menu' | 'battle' | 'result' = 'menu';
  private cue: ScoreId = 'menu';
  private paused = false;
  private intensity: MusicIntensity = 0;
  private clock: number | null = null;
  private pending = 0;
  private time = 0;
  private changed = 0;
  private pressure = 0;
  private activity = 0;
  private baselineRatio = 1;
  private initialNests = 1;
  private peakNests = 1;
  private previous = { kills: 0, casualties: 0, captures: 0, lost: 0 };
  private signals = { balance: 0, incoming: 0, nestLoss: 0, density: 0 };

  constructor(private readonly audio: MusicOutput) {}

  menu() {
    this.mode = 'menu'; this.cue = 'menu';
    this.setPaused(false); this.intensity = 0;
    this.audio.setIntensity(0); this.audio.music(this.cue);
  }

  startLevel(level: LevelConfig) {
    this.mode = 'battle'; this.cue = level.id === 13 || level.id === 18 ? 'finale' : level.biome;
    this.clock = null; this.pending = this.time = this.changed = 0;
    this.pressure = this.activity = 0; this.intensity = 0;
    this.previous = { kills: 0, casualties: 0, captures: 0, lost: 0 };
    const own = level.colonies.filter(c => c.owner === 1);
    const units = own.reduce((s, c) => s + finite(c.units), 0);
    const enemy = level.colonies.filter(c => c.owner > 1).reduce((s, c) => s + finite(c.units), 0);
    this.baselineRatio = (enemy + 20) / (units + 20);
    this.initialNests = this.peakNests = Math.max(1, own.filter(c => isProductive(c.kind)).length);
    this.signals = { balance: 0, incoming: 0, nestLoss: 0, density: 0 };
    this.setPaused(false); this.audio.setIntensity(0); this.audio.music(this.cue);
  }

  setPaused(paused: boolean) {
    if (this.paused !== paused) this.clock = null;
    this.paused = paused; this.audio.setPaused(paused);
  }

  result(won: boolean) {
    this.mode = 'result'; this.cue = won ? 'victory' : 'defeat';
    this.setPaused(false); this.intensity = 0;
    this.audio.setIntensity(0); this.audio.music(this.cue);
  }

  update(world: World, paused = this.paused) {
    if (this.mode !== 'battle') return;
    if (paused !== this.paused) this.setPaused(paused);
    if (this.paused) return;
    if (world.status !== 'playing') return;
    if (!Number.isFinite(world.elapsed)) { this.clock = null; return; }
    if (this.clock === null) { this.clock = world.elapsed; return; }
    const dt = Math.min(1, Math.max(0, world.elapsed - this.clock));
    this.clock = world.elapsed; this.pending += dt; this.time += dt;
    if (this.pending < .75) return;
    const step = this.pending; this.pending = 0;
    let own = 0, enemy = 0, incoming = 0, engaged = 0, nests = 0;
    const targets = new Map(world.colonies.map(c => [c.id, c]));
    for (const c of world.colonies) {
      if (c.owner === 1) { own += finite(c.units); if (isProductive(c.kind)) nests++; }
      else if (c.owner > 1) enemy += finite(c.units);
    }
    for (const f of world.fleets) {
      const count = finite(f.count), target = targets.get(f.destination ?? f.to);
      if (f.owner === 1) own += count;
      else if (f.owner > 1) enemy += count;
      if (f.owner > 1 && target?.owner === 1) incoming += count;
      if (f.engaging || f.owner > 0 && target && target.owner > 0 && target.owner !== f.owner) engaged += count;
    }
    this.peakNests = Math.max(this.peakNests, nests);
    // Cumulative statistics survive scene event-buffer draining. Deltas therefore cannot
    // miss captures/impacts between samples; outgoing hostile fleets supply sustained combat.
    const stats = { kills: finite(world.stats.kills), casualties: finite(world.stats.casualties ?? 0), captures: finite(world.stats.captures), lost: finite(world.stats.lost) };
    const delta = (key: keyof typeof stats) => Math.max(0, stats[key] - this.previous[key]);
    const losses = delta('lost');
    const impulse = (delta('kills') + delta('casualties')) / 35 + (delta('captures') + losses) * .5;
    this.previous = stats;
    this.activity = Math.min(2, this.activity * Math.exp(-step / 7) + impulse);
    const balance = clamp(((enemy + 20) / (own + 20) / Math.max(.05, this.baselineRatio) - 1) / 2);
    const threat = clamp(incoming / Math.max(25, own * .65));
    const nestLoss = clamp((Math.max(this.initialNests, this.peakNests) - nests) / Math.max(this.initialNests, this.peakNests));
    const density = clamp(this.activity + engaged / Math.max(40, own + enemy) * 2);
    this.signals = { balance, incoming: threat, nestLoss, density };
    const raw = clamp(Math.max(threat, nestLoss * .75 + balance * .3, balance * .65, Math.min(1, losses) * .85, density * .8));
    this.pressure += (raw - this.pressure) * (1 - Math.exp(-step / (raw > this.pressure ? 2 : 5)));
    let next = this.intensity;
    if (this.intensity === 0 && this.pressure > .28) next = 1;
    if (this.pressure > .65) next = 2;
    if (this.intensity === 2 && this.pressure < .43) next = 1;
    if (this.intensity === 1 && this.pressure < .16) next = 0;
    if (next !== this.intensity && this.time - this.changed >= 8) {
      this.intensity = next; this.changed = this.time;
      this.audio.setIntensity(next);
    }
  }

  diagnostics() {
    return { mode: this.mode, cue: this.cue, paused: this.paused, intensity: this.intensity,
      modelSeconds: this.time, heldSeconds: this.time - this.changed,
      pressure: this.pressure, activity: this.activity, signals: { ...this.signals } };
  }
}
