import { SCORE, type ScoreId, type MusicIntensity } from './score';
/** Sample-clock adaptive score playback. OGG with same-name MP3 fallback;
 * eight WAV SFX remain resident. No timer drives musical scheduling. */

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

export type MusicTrack = ScoreId | 'battle';
export type SoundName =
  | 'hover'
  | 'click'
  | 'select'
  | 'dispatch'
  | 'march'
  | 'impact'
  | 'capture'
  | 'skill'
  | 'victory'
  | 'defeat';

/** Read-only snapshot used by browser acceptance tests / the debug overlay. */
export interface AudioDiagnostics {
  /** 'uninitialized' before the first AudioContext, 'unsupported' without Web Audio. */
  contextState: 'uninitialized' | 'unsupported' | 'running' | 'suspended' | 'closed' | 'interrupted';
  /** Number of decoded AudioBuffers currently in memory. */
  decodedBuffers: number;
  /** Decoded file names (short names, not URLs). */
  decodedFiles: string[];
  /** In-flight fetch/decode operations. */
  pendingLoads: number;
  /** Actual failed preferred formats followed by a successful MP3 decode. */
  fallbackFiles: string[];
  /** Files that failed to load; playback for them is silently skipped. */
  failedFiles: string[];
  /** Playing one-shot SFX voices (excludes the music sources). */
  activeVoices: number;
  activeMusicSources: number;
  currentTrack: MusicTrack | null;
  /** Track requested but not yet audible (loading / waiting for unlock). */
  pendingTrack: MusicTrack | null;
  currentTrackTime: number;
  currentTrackDuration: number;
  musicLoop: boolean;
  crossfading: boolean;
  /** Current gain reduction (dB, <= 0) reported by the master compressor. */
  limiterReduction: number;
  /** Requests dropped by the per-sound throttle or the voice budget. */
  throttledPlays: number;
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  baseUrl: string;
  intensity: MusicIntensity;
  requestedIntensity: MusicIntensity;
  paused: boolean;
  activeLayers: { name: string; file: string; gain: number; targetGain: number; startedAt: number }[];
  /** Effective pause multiplier on the sample-clock envelope (not its target). */
  pauseGain: number;
  targetPauseGain: number;
  pendingIntensity: MusicIntensity | null;
  mixSettledAt: number | null;
  scheduledTransitionTime: number | null;
  nextBarTime: number | null;
  decodedBytes: number;
  /** Music cache is capped at current + outgoing + pending cue (max 9 stems).
   * Byte budget is soft while these playback-critical buffers are pinned. */
  cacheBudgetBytes: number;
  cacheOverBudgetBytes: number;
}

interface MusicVoice {
  track: ScoreId;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  ended: boolean;
  layer: string;
  index: number;
  target: number;
}
interface MusicGroup {
  track: ScoreId; voices: MusicVoice[]; startedAt: number;
  intensity: MusicIntensity;
  pendingMix: { intensity: MusicIntensity; at: number } | null;
  duckGain: GainNode;
  mixAt: number;
  mixSettledAt: number;
}

interface SfxVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

const DEFAULT_SETTINGS: AudioSettings = {
  master: 0.72,
  music: 0.55,
  sfx: 0.65,
  muted: false,
};

const SFX_FILES: Record<SoundName, string> = {
  hover: 'sfx-hover.wav',
  click: 'sfx-click.wav',
  select: 'sfx-select.wav',
  dispatch: 'sfx-dispatch.wav',
  march: 'sfx-march.wav',
  impact: 'sfx-impact.wav',
  capture: 'sfx-capture.wav',
  skill: 'sfx-skill.wav',
  // End-of-round cues are music files; play() can fire them as one-shots too.
  victory: 'music-victory.ogg',
  defeat: 'music-defeat.ogg',
};

const SFX_GAIN: Record<SoundName, number> = {
  hover: 0.5,
  click: 0.7,
  select: 0.75,
  dispatch: 0.85,
  march: 0.55,
  impact: 0.9,
  capture: 0.8,
  skill: 0.9,
  victory: 0.95,
  defeat: 0.95,
};

/** Minimum gap between two requests of the same sound (milliseconds). */
const SFX_THROTTLE: Record<SoundName, number> = {
  hover: 55,
  click: 45,
  select: 80,
  dispatch: 110,
  march: 170,
  impact: 65,
  capture: 150,
  skill: 280,
  victory: 1200,
  defeat: 1200,
};

/** Random detune (fraction) applied to one-shots so repeated hits feel natural. */
const SFX_DETUNE: Record<SoundName, number> = {
  hover: 0.012,
  click: 0.01,
  select: 0.006,
  dispatch: 0.02,
  march: 0.025,
  impact: 0.03,
  capture: 0.008,
  skill: 0.006,
  victory: 0,
  defeat: 0,
};

const UI_BANK: SoundName[] = [
  'hover', 'click', 'select', 'dispatch', 'march', 'impact', 'capture', 'skill',
];

/** Network-only deadline; never used for musical timing. Each codec gets its own budget. */
const FORMAT_NETWORK_DEADLINE_MS = 15_000;
const MAX_SFX_VOICES = 16;
const MAX_SFX_BURST = 24;
const SFX_BURST_WINDOW_MS = 1000;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function assetBase(): string {
  const env = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env;
  const base = env?.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

type AudioContextCtor = typeof AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as typeof globalThis & { webkitAudioContext?: AudioContextCtor };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  return typeof Ctor === 'function' ? Ctor : null;
}

export class AudioSystem {
  settings: AudioSettings;

  private ctx: AudioContext | null = null;
  private masterBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;

  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly loadControllers = new Map<string, AbortController>();
  private readonly decoded = new Map<string, AudioBuffer>();
  private readonly failed = new Set<string>();
  private pendingLoads = 0;
  private readonly fallbacks = new Set<string>();
  private uiBankPromise: Promise<unknown> | null = null;

  private readonly activeSfx = new Set<SfxVoice>();
  private readonly recentSfx: number[] = [];
  private readonly lastPlayed = new Map<SoundName, number>();
  private throttledPlays = 0;

  private currentMusic: MusicVoice | null = null;
  private group: MusicGroup | null = null;
  private previousGroup: MusicGroup | null = null;
  private readonly musicGroups = new Set<MusicGroup>();
  private requestedIntensity: MusicIntensity = 0;
  private paused = false;
  private scheduledTransitionTime: number | null = null;
  private readonly cacheBudgetBytes = 192 * 1024 * 1024;
  private readonly fadingMusic = new Set<MusicVoice>();
  private pendingTrack: MusicTrack | null = null;
  private musicRequest = 0;
  private crossfadeUntil = 0;

  private disposed = false;
  private unsupported = false;
  private applied: AudioSettings = { master: -1, music: -1, sfx: -1, muted: false };

  private gestureCleanup: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

  constructor(settings?: Partial<AudioSettings>) {
    this.settings = { ...DEFAULT_SETTINGS };
    if (settings) {
      this.settings.master = clamp01(settings.master ?? this.settings.master);
      this.settings.music = clamp01(settings.music ?? this.settings.music);
      this.settings.sfx = clamp01(settings.sfx ?? this.settings.sfx);
      this.settings.muted = Boolean(settings.muted ?? this.settings.muted);
    }
    this.installGestureHooks();
  }

  // --------------------------------------------------------------------- //
  // public API (docs/architecture.md contract)
  // --------------------------------------------------------------------- //

  /** Create/resume the AudioContext. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (this.disposed) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
        await ctx.resume();
      }
    } catch {
      // The gesture was not trusted yet; the next pointer/key event retries.
    }

    this.applyVolumes();
    if (ctx.state !== 'running') return;

    // The first user gesture has been consumed: stop listening for unlock.
    this.removeGestureHooks();

    // UI sounds are small (~0.5 MB total) — have them decoded before the first
    // hover so the very first interaction is audible.
    void this.ensureUiBank();

    if (this.pendingTrack) {
      const track = this.pendingTrack;
      this.pendingTrack = null;
      void this.startMusic(track);
    }
  }

  /** Start a music track; looping tracks cross-fade, short cues play once. */
  music(track: MusicTrack): void {
    if (this.disposed) return;
    const id = track === 'battle' ? 'meadow' : track;
    if (!Object.prototype.hasOwnProperty.call(SCORE, id)) return;
    this.applyVolumes();
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.settleTransition();
    if (this.pendingTrack === id) return;
    ++this.musicRequest;
    if (this.group?.track === id && this.group.voices.some(v => !v.ended)) {
      this.pendingTrack = null;
      this.pruneMusicCache();
      return;
    }
    this.cancelFutureSwitch();
    if (this.group?.track === id && this.group.voices.some(v => !v.ended)) {
      this.pendingTrack = null;
      this.pruneMusicCache();
      return;
    }
    this.pendingTrack = id;
    this.pruneMusicCache();
    if (ctx.state === 'running') void this.startMusic(id);
  }

  /** Mix changes are scheduled on the cue's AudioContext bar grid, never timers. */
  setIntensity(level: MusicIntensity): void {
    if (this.disposed || ![0, 1, 2].includes(level)) return;
    this.requestedIntensity = level;
    this.scheduleMix();
  }

  /** Keep the clock running; pause ducks the score and suppresses motion/power. */
  setPaused(paused: boolean): void {
    if (this.disposed || this.paused === paused) return;
    this.paused = paused;
    this.scheduleMix();
  }

  /** Fire a one-shot sound effect. Unknown names and excess hits are ignored. */
  play(name: SoundName): void {
    if (this.disposed) return;
    const file = SFX_FILES[name];
    if (!file) return;

    this.applyVolumes();
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (this.settings.muted || this.settings.sfx <= 0) return;

    const now = this.now();
    // compact the rolling burst window in place (do not clear it here!)
    let keep = 0;
    for (let i = 0; i < this.recentSfx.length; i += 1) {
      const t = this.recentSfx[i];
      if (now - t < SFX_BURST_WINDOW_MS) {
        this.recentSfx[keep] = t;
        keep += 1;
      }
    }
    this.recentSfx.length = keep;
    const gap = SFX_THROTTLE[name] ?? 0;
    const last = this.lastPlayed.get(name);
    if (last !== undefined && now - last < gap) {
      this.throttledPlays += 1;
      return;
    }

    if (this.recentSfx.length >= MAX_SFX_BURST || this.activeSfx.size >= MAX_SFX_VOICES) {
      this.throttledPlays += 1;
      return;
    }
    const buffer = this.decoded.get(file) ?? this.decoded.get(file.replace(/\.ogg$/, '.mp3'));
    if (!buffer) {
      // Not decoded yet: warm it up and drop this request rather than fire a
      // late, out-of-sync sound.
      void this.load(file);
      this.throttledPlays += 1;
      return;
    }

    this.lastPlayed.set(name, now);
    this.recentSfx.push(now);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const detune = SFX_DETUNE[name] ?? 0;
    if (detune > 0) source.playbackRate.value = 1 + (Math.random() * 2 - 1) * detune;

    const gain = ctx.createGain();
    gain.gain.value = SFX_GAIN[name] ?? 1;
    source.connect(gain);
    gain.connect(this.sfxBus as GainNode);

    const voice: SfxVoice = { source, gain };
    this.activeSfx.add(voice);
    source.onended = () => {
      this.activeSfx.delete(voice);
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
      try {
        gain.disconnect();
      } catch {
        /* already disconnected */
      }
    };
    try {
      source.start();
    } catch {
      this.activeSfx.delete(voice);
    }
  }

  /** Merge settings; volumes and mute take effect immediately. */
  configure(settings: Partial<AudioSettings>): void {
    if (!settings) return;
    if (typeof settings.master === 'number') this.settings.master = clamp01(settings.master);
    if (typeof settings.music === 'number') this.settings.music = clamp01(settings.music);
    if (typeof settings.sfx === 'number') this.settings.sfx = clamp01(settings.sfx);
    if (typeof settings.muted === 'boolean') this.settings.muted = settings.muted ? true : false;
    this.applyVolumes();
  }

  /**
   * Read-only snapshot for browser acceptance checks (context state, decoded
   * assets, live voice count, current track, live mix settings).
   */
  diagnostics(): AudioDiagnostics {
    const ctx = this.ctx;
    this.settleTransition();
    const current = this.currentMusic;
    const state: AudioDiagnostics['contextState'] = ctx
      ? (ctx.state as AudioDiagnostics['contextState'])
      : this.unsupported
        ? 'unsupported'
        : 'uninitialized';
    const trackEnded = Boolean(current && current.ended && !current.source.loop);
    const now = this.currentTime();
    const audibleGroup = this.group && now < this.group.startedAt ? this.previousGroup : this.group;
    if (audibleGroup) this.settleMix(audibleGroup);
    const mix = this.group;
    return {
      contextState: state,
      decodedBuffers: this.decoded.size,
      decodedFiles: [...this.decoded.keys()].sort(),
      pendingLoads: this.pendingLoads,
      failedFiles: [...this.failed].sort(),
      fallbackFiles: [...this.fallbacks].sort(),
      activeVoices: this.activeSfx.size,
      activeMusicSources: (this.group?.voices.filter(v => !v.ended).length ?? 0) + this.fadingMusic.size,
      currentTrack: current && !trackEnded ? current.track : null,
      pendingTrack: this.pendingTrack,
      currentTrackTime: current && !trackEnded ? this.trackTime(current) : 0,
      currentTrackDuration: current?.source.buffer?.duration ?? 0,
      musicLoop: current ? current.source.loop : false,
      crossfading: this.crossfadeUntil > this.currentTime(),
      limiterReduction: this.limiterReduction(),
      throttledPlays: this.throttledPlays,
      master: this.settings.master,
      music: this.settings.music,
      sfx: this.settings.sfx,
      muted: this.settings.muted,
      baseUrl: assetBase(),
      intensity: audibleGroup?.intensity ?? 0,
      requestedIntensity: this.requestedIntensity,
      paused: this.paused,
      pauseGain: audibleGroup?.duckGain.gain.value ?? 1,
      targetPauseGain: this.paused ? 0.32 : 1,
      pendingIntensity: mix?.pendingMix?.intensity ?? null,
      mixSettledAt: mix && now < mix.mixSettledAt ? mix.mixSettledAt : null,
      activeLayers: this.group?.voices.filter(v => !v.ended).map(v => ({ name: v.layer, file: SCORE[v.track].files[v.index], gain: v.gain.gain.value * this.group!.duckGain.gain.value, targetGain: v.target, startedAt: v.startedAt })) ?? [],
      scheduledTransitionTime: mix && now < mix.mixSettledAt ? mix.mixAt : null,
      nextBarTime: this.group ? this.nextBar(this.group) : null,
      decodedBytes: [...this.decoded.values()].reduce((n, b) => n + (b.length || 0) * (b.numberOfChannels || 0) * 4, 0),
      cacheBudgetBytes: this.cacheBudgetBytes,
      cacheOverBudgetBytes: Math.max(0, [...this.decoded.values()].reduce((n, b) => n + (b.length || 0) * (b.numberOfChannels || 0) * 4, 0) - this.cacheBudgetBytes),
    };
  }

  /** Stop everything, close the context and drop decoded buffers. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.musicRequest += 1;
    this.pendingTrack = null;
    this.removeGestureHooks();
    if (this.visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    for (const voice of this.group?.voices ?? []) {
      this.stopSource(voice.source);
      voice.source.disconnect();
      voice.gain.disconnect();
    }
    for (const group of this.musicGroups) group.duckGain.disconnect();
    this.musicGroups.clear();
    this.group = null;
    this.previousGroup = null;
    this.currentMusic = null;
    for (const voice of this.fadingMusic) { this.stopSource(voice.source); voice.source.disconnect(); voice.gain.disconnect(); }
    this.fadingMusic.clear();
    for (const voice of [...this.activeSfx]) {
      this.stopSource(voice.source);
    }
    this.activeSfx.clear();

    try {
      this.masterBus?.disconnect();
      this.musicBus?.disconnect();
      this.sfxBus?.disconnect();
      this.limiter?.disconnect();
    } catch {
      /* ignore */
    }
    this.masterBus = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.limiter = null;

    const ctx = this.ctx;
    this.ctx = null;
    for (const controller of this.loadControllers.values()) controller.abort();
    this.loadControllers.clear();
    this.buffers.clear();
    this.decoded.clear();
    this.lastPlayed.clear();
    this.recentSfx.length = 0;
    if (ctx) {
      void ctx.close().catch(() => undefined);
    }
  }

  // --------------------------------------------------------------------- //
  // context / buses / volumes
  // --------------------------------------------------------------------- //

  private ensureContext(): AudioContext | null {
    if (this.disposed) return null;
    if (this.ctx) return this.ctx;
    const Ctor = audioContextCtor();
    if (!Ctor) {
      this.unsupported = true;
      return null;
    }
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      this.unsupported = true;
      return null;
    }
    this.ctx = ctx;

    const master = ctx.createGain();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    // Bus protection: 16 concurrent one-shots can sum above 0 dBFS even when
    // every WAV is peak-normalised.  A compressor on the master insert keeps
    // the mix from clipping without flattening normal playback.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 8;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    master.gain.value = 0;
    music.gain.value = 0;
    sfx.gain.value = 0;
    music.connect(master);
    sfx.connect(master);
    master.connect(limiter);
    limiter.connect(ctx.destination);
    this.masterBus = master;
    this.musicBus = music;
    this.sfxBus = sfx;
    this.limiter = limiter;

    this.applied = { master: -1, music: -1, sfx: -1, muted: false };
    this.applyVolumes(true);
    this.installVisibilityHandler();

    // Warm the UI bank while the context is suspended; decode works either way.
    void this.ensureUiBank();
    return ctx;
  }

  private applyVolumes(immediate = false): void {
    const ctx = this.ctx;
    if (!ctx || !this.masterBus || !this.musicBus || !this.sfxBus) return;

    const s = this.settings;
    const master = clamp01(s.master);
    const music = clamp01(s.music);
    const sfx = clamp01(s.sfx);
    const muted = Boolean(s.muted);
    if (
      master === this.applied.master &&
      music === this.applied.music &&
      sfx === this.applied.sfx &&
      muted === this.applied.muted
    ) {
      return;
    }
    this.applied = { master, music, sfx, muted };

    const now = ctx.currentTime;
    const ramp = (param: AudioParam, target: number) => {
      param.cancelScheduledValues(now);
      if (immediate) {
        param.setValueAtTime(target, now);
      } else {
        param.setValueAtTime(param.value, now);
        param.setTargetAtTime(target, now, 0.04);
      }
    };
    ramp(this.masterBus.gain, muted ? 0 : master);
    ramp(this.musicBus.gain, music);
    ramp(this.sfxBus.gain, sfx);
  }

  private now(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  private currentTime(): number {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private trackTime(voice: MusicVoice): number {
    const elapsed = Math.max(0, this.currentTime() - voice.startedAt);
    const duration = voice.source.buffer?.duration ?? 0;
    if (voice.source.loop && duration > 0) return elapsed % duration;
    return Math.min(elapsed, duration);
  }

  private limiterReduction(): number {
    if (!this.limiter) return 0;
    const value = this.limiter.reduction;
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
  }

  // --------------------------------------------------------------------- //
  // loading
  // --------------------------------------------------------------------- //

  private urlFor(file: string): string {
    return `${assetBase()}audio/${file}`;
  }

  private load(file: string): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(file);
    if (cached) return cached;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);

    const controller = new AbortController();
    this.loadControllers.set(file, controller);
    const managed = file.startsWith('music-') && this.keptMusicFiles().has(file);
    const cancelled = () => this.disposed || controller.signal.aborted || (managed && !this.keptMusicFiles().has(file));
    const promise = (async (): Promise<AudioBuffer | null> => {
      const candidates = file.endsWith('.ogg') ? [file, file.replace(/\.ogg$/, '.mp3')] : [file];
      try {
        for (const candidate of candidates) {
          try {
            if (cancelled()) return null;
            const data = await this.fetchFormat(candidate, controller.signal);
            // Abort cannot interrupt decodeAudioData itself: recheck ownership
            // immediately before expensive decoding and discard late results.
            if (cancelled()) return null;
            const buffer = await this.decode(ctx, data);
            if (cancelled()) return null;
            this.decoded.set(candidate, buffer);
            if (candidate !== file) this.fallbacks.add(candidate);
            return buffer;
          } catch {
            if (cancelled()) return null;
            // A missing/unsupported preferred format is not an asset failure.
          }
        }
        if (!cancelled()) this.failed.add(file);
        return null;
      } finally {
        this.pendingLoads = Math.max(0, this.pendingLoads - 1);
        if (this.loadControllers.get(file) === controller) this.loadControllers.delete(file);
      }
    })();

    this.pendingLoads += 1;
    this.buffers.set(file, promise);
    return promise;
  }

  /** Bound fetch AND body reading even if a transport ignores AbortSignal.
   * A format timeout aborts only its child request, so MP3 still gets a fresh
   * deadline. Asset eviction/dispose aborts the parent and clears this timer. */
  private async fetchFormat(file: string, parent: AbortSignal): Promise<ArrayBuffer> {
    if (parent.aborted) throw new Error('Audio asset cancelled');
    const format = new AbortController();
    let rejectDeadline!: (reason: Error) => void;
    const deadline = new Promise<never>((_, reject) => { rejectDeadline = reject; });
    const cancel = () => {
      format.abort();
      rejectDeadline(new Error('Audio asset cancelled'));
    };
    parent.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => {
      format.abort();
      rejectDeadline(new Error('Audio format network deadline exceeded'));
    }, FORMAT_NETWORK_DEADLINE_MS);
    try {
      const network = (async () => {
        const res = await fetch(this.urlFor(file), { signal: format.signal });
        if (format.signal.aborted) throw new Error('Audio format cancelled');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        if (format.signal.aborted) throw new Error('Audio format cancelled');
        return data;
      })();
      return await Promise.race([network, deadline]);
    } finally {
      clearTimeout(timer);
      parent.removeEventListener('abort', cancel);
    }
  }

  private decode(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise<AudioBuffer>((resolve, reject) => {
      let settled = false;
      const ok = (buffer: AudioBuffer) => {
        if (settled) return;
        settled = true;
        resolve(buffer);
      };
      const fail = (error?: DOMException | Error | null) => {
        if (settled) return;
        settled = true;
        reject(error ?? new Error('decodeAudioData failed'));
      };
      try {
        const maybePromise = ctx.decodeAudioData(
          data,
          ok,
          (error: DOMException) => fail(error),
        );
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(ok, (error: unknown) => fail(error instanceof Error ? error : null));
        }
      } catch (error) {
        fail(error instanceof Error ? error : null);
      }
    });
  }

  private ensureUiBank(): Promise<unknown> {
    if (this.uiBankPromise) return this.uiBankPromise;
    if (!this.ctx) return Promise.resolve(null);
    this.uiBankPromise = Promise.all(UI_BANK.map((name) => this.load(SFX_FILES[name])));
    return this.uiBankPromise;
  }

  // --------------------------------------------------------------------- //
  // music
  // --------------------------------------------------------------------- //

  private async startMusic(track: MusicTrack): Promise<void> {
    const id = track === 'battle' ? 'meadow' : track;
    const token = ++this.musicRequest;
    this.pendingTrack = id;
    const buffers = await Promise.all(SCORE[id].files.map(file => this.load(file)));
    if (this.disposed || token !== this.musicRequest) { this.pruneMusicCache(); return; }
    this.pendingTrack = null;
    if (!buffers[0]) { this.pruneMusicCache(); return; }
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') { this.pendingTrack = id; return; }
    this.swapMusic(id, buffers);
    this.pruneMusicCache();
  }

  private nextBar(group: MusicGroup): number {
    const cue = SCORE[group.track];
    const bar = 60 / cue.bpm * cue.beatsPerBar;
    const now = this.currentTime();
    if (now < group.startedAt) return group.startedAt;
    return group.startedAt + (Math.floor((now - group.startedAt + 0.000001) / bar) + 1) * bar;
  }

  private layerTargetFor(index: number): number {
    return index <= (this.paused ? 0 : this.requestedIntensity) ? 1 : 0;
  }

  private targetFor(index: number): number {
    return this.layerTargetFor(index) * (this.paused ? 0.32 : 1);
  }

  private hold(param: AudioParam, now: number): void {
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
    else { param.cancelScheduledValues(now); param.setValueAtTime(param.value, now); }
  }

  private scheduleMix(): void {
    this.settleTransition();
    const group = this.group;
    if (!group) return;
    const now = this.currentTime();
    const at = this.nextBar(group);
    this.configureMix(group, at, 0.12);
    for (const voice of group.voices) {
      this.hold(voice.gain.gain, now);
      voice.target = this.targetFor(voice.index);
      voice.gain.gain.setTargetAtTime(this.layerTargetFor(voice.index), at, 0.12);
    }
  }

  /** Harmonic policy: outgoing cue fades to silence before the new downbeat;
   * incoming cue fades up after it. Stingers take over in 80 ms instead. */
  private swapMusic(track: ScoreId, buffers: (AudioBuffer | null)[]): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    this.settleTransition();
    const now = ctx.currentTime;
    const previous = this.group;
    // At most one outgoing cue: rapid stingers cannot accumulate tails.
    for (const voice of [...this.fadingMusic]) {
      this.stopSource(voice.source);
      voice.source.disconnect(); voice.gain.disconnect();
      voice.ended = true;
      this.fadingMusic.delete(voice);
    }
    const urgent = !SCORE[track].loop;
    const at = previous ? (urgent ? now + 0.08 : this.nextBar(previous)) : now + 0.02;
    const fadeStart = Math.max(now, at - (urgent ? 0.08 : 0.3));
    if (previous) {
      for (const voice of previous.voices) {
        this.fadingMusic.add(voice);
        this.hold(voice.gain.gain, now);
        voice.gain.gain.setValueAtTime(voice.gain.gain.value, fadeStart);
        voice.gain.gain.linearRampToValueAtTime(0, at);
        this.stopSource(voice.source, at);
      }
    }
    const duckGain = ctx.createGain();
    duckGain.gain.value = this.paused ? 0.32 : 1;
    duckGain.connect(this.musicBus);
    const group: MusicGroup = { track, voices: [], startedAt: at,
      intensity: 0, pendingMix: null, duckGain,
      mixAt: at, mixSettledAt: at + 0.15 };
    this.musicGroups.add(group);
    this.configureMix(group, at, 0.12);
    group.mixSettledAt = Math.max(at + 0.15, group.mixSettledAt);
    buffers.forEach((buffer, index) => {
      if (!buffer) return;
      // A corrupt/misaligned optional layer must never drift against the base.
      if (index && (buffer.length !== buffers[0]!.length || buffer.sampleRate !== buffers[0]!.sampleRate)) {
        this.failed.add(SCORE[track].files[index]);
        return;
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = SCORE[track].loop;
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
      const gain = ctx.createGain();
      const target = this.targetFor(index);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(this.layerTargetFor(index), at + 0.15);
      source.connect(gain);
      gain.connect(group.duckGain);
      const voice: MusicVoice = { track, source, gain, startedAt: at, ended: false,
        index, layer: ['base', 'motion', 'power'][index], target };
      group.voices.push(voice);
      source.onended = () => {
        voice.ended = true;
        this.fadingMusic.delete(voice);
        source.disconnect(); gain.disconnect();
        if (group.voices.every(v => v.ended)) {
          group.duckGain.disconnect();
          this.musicGroups.delete(group);
        }
        if (this.group === group && group.voices.every(v => v.ended)) {
          this.group = null; this.currentMusic = null;
        }
        this.settleTransition();
        this.pruneMusicCache();
      };
      try { source.start(at); } catch { voice.ended = true; source.disconnect(); gain.disconnect(); }
    });
    this.previousGroup = previous;
    this.group = group;
    this.currentMusic = group.voices[0] ?? null;
    this.scheduledTransitionTime = at;
    this.crossfadeUntil = at + 0.15;
  }

  private settleMix(group: MusicGroup): void {
    if (group.pendingMix && this.currentTime() >= group.pendingMix.at) {
      group.intensity = group.pendingMix.intensity;
      group.pendingMix = null;
    }
  }

  private configureMix(group: MusicGroup, at: number, tau: number): void {
    this.settleMix(group);
    this.hold(group.duckGain.gain, this.currentTime());
    group.duckGain.gain.setTargetAtTime(this.paused ? 0.32 : 1, at, tau);
    group.pendingMix = { intensity: this.paused ? 0 : this.requestedIntensity, at };
    group.mixAt = at;
    group.mixSettledAt = at + 6 * tau; // <= 0.25% residual, not instantaneous.
    this.scheduledTransitionTime = at;
  }

  private settleTransition(): void {
    if (this.group) this.settleMix(this.group);
    if (this.group && this.currentTime() >= this.group.startedAt) this.previousGroup = null;
  }

  private cancelFutureSwitch(): void {
    const group = this.group;
    if (!group || group.startedAt <= this.currentTime()) return;
    this.group = this.previousGroup;
    this.previousGroup = null;
    for (const voice of group.voices) {
      voice.source.onended = null;
      this.stopSource(voice.source);
      voice.source.disconnect(); voice.gain.disconnect();
    }
    group.duckGain.disconnect();
    this.musicGroups.delete(group);
    const now = this.currentTime();
    if (this.group) this.configureMix(this.group, now, 0.04);
    for (const voice of this.group?.voices ?? []) {
      this.fadingMusic.delete(voice);
      // Web Audio permits replacing a scheduled stop before it has occurred.
      this.stopSource(voice.source, now + 1e9);
      this.hold(voice.gain.gain, now);
      voice.target = this.targetFor(voice.index);
      voice.gain.gain.setTargetAtTime(this.layerTargetFor(voice.index), now, 0.04);
    }
    this.currentMusic = this.group?.voices[0] ?? null;
    this.scheduledTransitionTime = null;
  }

  private keptMusicFiles(): Set<string> {
    const files = new Set<string>();
    const add = (track: MusicTrack) => SCORE[track === 'battle' ? 'meadow' : track].files.forEach(f => files.add(f));
    if (this.pendingTrack) add(this.pendingTrack);
    if (this.group) add(this.group.track);
    for (const voice of this.fadingMusic) if (!voice.ended) add(voice.track);
    return files;
  }

  /** No historical music LRU: only playing/outgoing/loading cues are pinned.
   * SFX stay resident. Promise entries are evicted with their decoded buffers. */
  private pruneMusicCache(): void {
    const keep = this.keptMusicFiles();
    for (const file of this.decoded.keys()) {
      const preferred = file.replace(/\.mp3$/, '.ogg');
      if (file.startsWith('music-') && !keep.has(preferred)) this.decoded.delete(file);
    }
    for (const file of this.buffers.keys()) {
      if (file.startsWith('music-') && !keep.has(file)) {
        this.loadControllers.get(file)?.abort();
        this.buffers.delete(file);
      }
    }
  }

  private stopSource(source: AudioBufferSourceNode, when?: number): void {
    try {
      if (when === undefined) source.stop();
      else source.stop(when);
    } catch {
      /* never started or already stopped */
    }
  }

  // --------------------------------------------------------------------- //
  // page lifecycle
  // --------------------------------------------------------------------- //

  private installGestureHooks(): void {
    if (typeof window === 'undefined') return;
    const handler = () => {
      void this.unlock();
    };
    const options: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', handler, options);
    window.addEventListener('keydown', handler, options);
    window.addEventListener('touchstart', handler, options);
    this.gestureCleanup = () => {
      window.removeEventListener('pointerdown', handler, options);
      window.removeEventListener('keydown', handler, options);
      window.removeEventListener('touchstart', handler, options);
      this.gestureCleanup = null;
    };
  }

  private removeGestureHooks(): void {
    if (this.gestureCleanup) this.gestureCleanup();
  }

  private installVisibilityHandler(): void {
    if (typeof document === 'undefined' || this.visibilityHandler) return;
    this.visibilityHandler = () => {
      if (this.disposed || !this.ctx) return;
      if (document.visibilityState === 'visible' && this.ctx.state === 'suspended') {
        void this.unlock();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityHandler);
  }
}

export default AudioSystem;
