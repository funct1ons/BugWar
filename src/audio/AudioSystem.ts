/**
 * Bug War — Web Audio playback layer.
 *
 * Every sound is a real local WAV under `public/audio/` (generated offline by
 * `scripts/generate-audio.py`); nothing is fetched from the network at runtime.
 * All asset URLs go through `import.meta.env.BASE_URL`, so the game also works
 * from a sub-directory deployment or the offline static bundle.
 *
 * Behaviour highlights:
 *  - Lazy AudioContext creation, resumed on the first real user gesture
 *    (autoplay policy), with a pending-track queue so `music()` may be called
 *    before the page has been unlocked.
 *  - Music tracks are decoded once, looped sample-accurately and swapped with
 *    an equal-power cross-fade (two sources are alive for the fade window).
 *  - SFX are decoded once from the UI bank, throttled per sound, rate-limited
 *    in bursts and capped by a global voice budget.
 *  - `master` / `music` / `sfx` / `muted` apply in real time through three gain
 *    buses; `configure()` and direct `settings` writes both take effect.
 *  - Audio is strictly optional: any fetch/decode failure is remembered, logged
 *    once and never breaks the game loop.
 */

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
}

export type MusicTrack = 'menu' | 'battle' | 'victory' | 'defeat';
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
}

interface MusicVoice {
  track: MusicTrack;
  source: AudioBufferSourceNode;
  gain: GainNode;
  startedAt: number;
  ended: boolean;
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

const MUSIC_FILES: Record<MusicTrack, string> = {
  menu: 'music-menu.wav',
  battle: 'music-battle.wav',
  victory: 'music-victory.wav',
  defeat: 'music-defeat.wav',
};

const LOOPING_MUSIC: Record<MusicTrack, boolean> = {
  menu: true,
  battle: true,
  victory: false,
  defeat: false,
};

const MUSIC_LEVEL: Record<MusicTrack, number> = {
  menu: 0.95,
  battle: 1.0,
  victory: 1.0,
  defeat: 1.0,
};

/** Cross-fade length in seconds. Short cues come in a little faster. */
const MUSIC_FADE: Record<MusicTrack, number> = {
  menu: 1.1,
  battle: 1.1,
  victory: 0.45,
  defeat: 0.6,
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
  victory: 'music-victory.wav',
  defeat: 'music-defeat.wav',
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
  private readonly decoded = new Map<string, AudioBuffer>();
  private readonly failed = new Set<string>();
  private pendingLoads = 0;
  private uiBankPromise: Promise<unknown> | null = null;

  private readonly activeSfx = new Set<SfxVoice>();
  private readonly recentSfx: number[] = [];
  private readonly lastPlayed = new Map<SoundName, number>();
  private throttledPlays = 0;

  private currentMusic: MusicVoice | null = null;
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
    await this.ensureUiBank();

    if (this.pendingTrack) {
      const track = this.pendingTrack;
      this.pendingTrack = null;
      void this.startMusic(track);
    }
  }

  /** Start a music track; looping tracks cross-fade, short cues play once. */
  music(track: MusicTrack): void {
    if (this.disposed) return;
    if (!(track in MUSIC_FILES)) return;

    this.applyVolumes();
    const ctx = this.ensureContext();
    if (!ctx) return;

    const active = this.currentMusic;
    if (active && active.track === track) {
      const stillPlaying = !active.ended || active.source.loop;
      if (stillPlaying) {
        // Already audible: nothing to do (do not restart or re-fade).
        this.musicRequest += 1; // Cancel any older in-flight track switch.
        this.pendingTrack = null;
        return;
      }
    }

    this.pendingTrack = track;
    if (ctx.state !== 'running') {
      void this.unlock();
      return;
    }
    void this.startMusic(track);
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
    const buffer = this.decoded.get(file);
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
    const current = this.currentMusic;
    const state: AudioDiagnostics['contextState'] = ctx
      ? (ctx.state as AudioDiagnostics['contextState'])
      : this.unsupported
        ? 'unsupported'
        : 'uninitialized';
    const trackEnded = Boolean(current && current.ended && !current.source.loop);
    return {
      contextState: state,
      decodedBuffers: this.decoded.size,
      decodedFiles: [...this.decoded.keys()].sort(),
      pendingLoads: this.pendingLoads,
      failedFiles: [...this.failed].sort(),
      activeVoices: this.activeSfx.size,
      activeMusicSources: (current && !trackEnded ? 1 : 0) + this.fadingMusic.size,
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

    if (this.currentMusic) {
      this.stopSource(this.currentMusic.source);
      this.currentMusic = null;
    }
    for (const voice of this.fadingMusic) this.stopSource(voice.source);
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

    const promise = (async (): Promise<AudioBuffer | null> => {
      try {
        const res = await fetch(this.urlFor(file));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const array = await res.arrayBuffer();
        const buffer = await this.decode(ctx, array);
        if (this.disposed) return null;
        this.decoded.set(file, buffer);
        return buffer;
      } catch (error) {
        this.failed.add(file);
        if (typeof console !== 'undefined' && typeof console.warn === 'function') {
          console.warn(`[audio] could not load ${file}`, error);
        }
        return null;
      } finally {
        this.pendingLoads = Math.max(0, this.pendingLoads - 1);
      }
    })();

    this.pendingLoads += 1;
    this.buffers.set(file, promise);
    return promise;
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
    const token = ++this.musicRequest;
    const buffer = await this.load(MUSIC_FILES[track]);
    if (this.disposed || token !== this.musicRequest) return;
    this.pendingTrack = null;
    if (!buffer) return;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') {
      // Still locked: remember the request, unlock() will pick it up.
      this.pendingTrack = track;
      return;
    }
    this.swapMusic(track, buffer);
  }

  private swapMusic(track: MusicTrack, buffer: AudioBuffer): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;

    const now = ctx.currentTime;
    const fade = MUSIC_FADE[track] ?? 1.0;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = LOOPING_MUSIC[track];
    if (source.loop) {
      source.loopStart = 0;
      source.loopEnd = buffer.duration;
    }
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    source.connect(gain);
    gain.connect(this.musicBus);

    const previous = this.currentMusic;
    if (previous) this.fadeOutMusic(previous, fade);

    const voice: MusicVoice = { track, source, gain, startedAt: now, ended: false };
    source.onended = () => {
      voice.ended = true;
      this.fadingMusic.delete(voice);
      if (this.currentMusic === voice) this.currentMusic = null;
      try {
        source.disconnect();
      } catch {
        /* ignore */
      }
      try {
        gain.disconnect();
      } catch {
        /* ignore */
      }
    };

    try {
      source.start(now);
    } catch {
      return;
    }
    this.currentMusic = voice;
    this.pendingTrack = null;
    this.crossfadeUntil = now + fade;

    // Equal-power fade-in (sqrt/sine) so the crossfade does not dip in the middle.
    const target = MUSIC_LEVEL[track] ?? 1;
    const curve = new Float32Array(32);
    for (let i = 0; i < curve.length; i += 1) {
      const t = i / (curve.length - 1);
      curve[i] = Math.max(0.0001, Math.sin((Math.PI / 2) * t) * target);
    }
    try {
      gain.gain.setValueCurveAtTime(curve, now, fade);
    } catch {
      gain.gain.linearRampToValueAtTime(target, now + fade);
    }
  }

  private fadeOutMusic(voice: MusicVoice, seconds: number): void {
    const ctx = this.ctx;
    if (!ctx) {
      this.stopSource(voice.source);
      return;
    }
    this.fadingMusic.add(voice);
    const now = ctx.currentTime;
    const start = Math.max(0.0001, voice.gain.gain.value);
    const steps = 24;
    const curve = new Float32Array(steps);
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      curve[i] = Math.max(0, Math.cos((Math.PI / 2) * t) * start);
    }
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(start, now);
      voice.gain.gain.setValueCurveAtTime(curve, now, Math.max(0.05, seconds));
    } catch {
      voice.gain.gain.setValueAtTime(start, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + seconds);
    }
    this.stopSource(voice.source, now + Math.max(0.05, seconds) + 0.05);
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
