import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';
import { SCORE, scoreSeconds } from '../src/audio/score';

class Param {
  private initial = 1;
  events: [string, number, number][] = [];
  get value() { return this.at(Context.latest?.currentTime ?? 0); }
  set value(v: number) { this.initial = v; }
  // Evaluate the WebAudio ramp / exponential law against the context clock.
  at(time: number) {
    let value = this.initial, previous = 0;
    let target: { from: number; to: number; start: number } | null = null;
    const evaluate = (t: number): number => target
      ? target.to + (target.from - target.to) * Math.exp(-(t - target.start) / 0.12) : value;
    for (const [type, v, at] of this.events) {
      if (time < at) {
        return type === 'ramp' ? value + (v - value) * (time - previous) / (at - previous) : evaluate(time);
      }
      value = evaluate(at);
      target = null;
      if (type === 'target') target = { from: value, to: v, start: at };
      else value = v;
      previous = at;
    }
    return evaluate(time);
  }
  setValueAtTime(v: number, t: number) { this.events.push(['set', v, t]); }
  linearRampToValueAtTime(v: number, t: number) { this.events.push(['ramp', v, t]); }
  setTargetAtTime(v: number, t: number) { this.events.push(['target', v, t]); }
  cancelScheduledValues(t: number) { this.events = this.events.filter(e => e[2] < t); }
  cancelAndHoldAtTime(t: number) { const v = this.at(t); this.cancelScheduledValues(t); this.setValueAtTime(v, t); }
}
class Source {
  buffer: any; loop = false; loopStart = 0; loopEnd = 0;
  playbackRate = { value: 1 }; onended: (() => void) | null = null;
  starts: number[] = []; stops: number[] = [];
  connect() {} disconnect() {}
  start(t = 0) { this.starts.push(t); }
  stop(t = 0) { this.stops.push(t); }
}
class Context {
  static latest: Context;
  state = 'suspended'; currentTime = 0; destination = {};
  sources: Source[] = []; gains: { gain: Param; connect(): void; disconnect(): void }[] = [];
  constructor() { Context.latest = this; }
  createGain() { const g = { gain: new Param(), connect() {}, disconnect() {} }; this.gains.push(g); return g; }
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createDynamicsCompressor() { return { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, reduction: 0, connect() {}, disconnect() {} }; }
  async resume() { this.state = 'running'; }
  async close() { this.state = 'closed'; }
  async decodeAudioData() { return { duration: 100, length: 4410000, numberOfChannels: 2, sampleRate: 44100 }; }
}
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function setup() {
  vi.stubGlobal('AudioContext', Context);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
  return new AudioSystem();
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('adaptive score clock', () => {
  it('uses the shared score math and short nonlooping outcomes', () => {
    for (const cue of Object.values(SCORE)) {
      expect(cue.beatsPerBar).toBe(4);
      expect(cue.bars).toBe(cue.loop ? 48 : 8);
      expect(scoreSeconds(cue)).toBeCloseTo(cue.bars * 240 / cue.bpm, 8);
    }
  });
  it('queues before unlock, deduplicates, starts all stems on one clock and does not restart', async () => {
    const a = setup(); a.music('battle'); a.music('meadow');
    expect(Context.latest.sources).toHaveLength(0);
    expect(a.diagnostics().pendingTrack).toBe('meadow');
    await a.unlock(); await flush();
    const ctx = Context.latest;
    a.music('meadow'); await flush();
    expect(ctx.sources).toHaveLength(3);
    expect(ctx.sources.map(s => s.starts[0])).toEqual([0.02, 0.02, 0.02]);
    expect(ctx.sources.every(s => s.loop && s.loopEnd === 100)).toBe(true);
    ctx.currentTime = 1; a.music('battle'); await flush();
    expect(ctx.sources).toHaveLength(3);
    expect(a.diagnostics().activeLayers.map(l => l.targetGain)).toEqual([1, 0, 0]);
    a.dispose();
  });
  it('quantizes mix changes mathematically, replaces old automation, ducks and restores intensity', async () => {
    const a = setup(); await a.unlock(); a.music('meadow'); await flush();
    const ctx = Context.latest; ctx.currentTime = 1;
    a.setIntensity(2);
    const at = 0.02 + 240 / 108;
    expect(a.diagnostics().scheduledTransitionTime).toBeCloseTo(at, 9);
    const gains = ctx.gains.slice(-3);
    expect(gains[2].gain.events.at(-1)).toEqual(['target', 1, at]);
    ctx.currentTime = 1.1; a.setIntensity(0);
    expect(gains[2].gain.events.filter(e => e[0] === 'target')).toEqual([['target', 0, at]]);
    a.setIntensity(2); a.setPaused(true);
    expect(a.diagnostics().requestedIntensity).toBe(2);
    expect(a.diagnostics().activeLayers.map(l => l.targetGain)).toEqual([0.32, 0, 0]);
    a.setPaused(false);
    expect(a.diagnostics().activeLayers.map(l => l.targetGain)).toEqual([1, 1, 1]);
    expect(ctx.sources).toHaveLength(3); a.dispose();
  });
  it('cancels scheduled switches, quantizes cue changes and lets outcomes take over quickly', async () => {
    const a = setup(); await a.unlock(); a.music('meadow'); await flush();
    const ctx = Context.latest; ctx.currentTime = 1;
    a.music('roots'); await flush();
    expect(ctx.sources[3].starts[0]).toBeCloseTo(0.02 + 240 / 108);
    a.music('meadow');
    expect(a.diagnostics().currentTrack).toBe('meadow');
    expect(ctx.sources[3].stops.at(-1)).toBe(0);
    a.music('roots'); await flush(); a.music('victory'); await flush();
    expect(a.diagnostics().currentTrack).toBe('victory');
    const win = ctx.sources.at(-1)!;
    expect(win.starts[0]).toBeCloseTo(1.08);
    expect(win.loop).toBe(false);
    ctx.currentTime = 2;
    win.onended?.();
    expect(a.diagnostics().currentTrack).toBeNull();
    a.dispose();
  });
  it('discards stale async requests and releases music cache/promise entries and disposed decodes', async () => {
    const a = setup(); await a.unlock(); await flush();
    let finish!: () => void;
    const fetcher = vi.mocked(fetch);
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response); }));
    a.music('menu'); a.music('defeat'); await flush(); finish(); await flush();
    expect(a.diagnostics().currentTrack).toBe('defeat');
    expect(a.diagnostics().decodedFiles).not.toContain('music-menu.ogg');
    expect(a.diagnostics().decodedBytes).toBe(9 * 4410000 * 2 * 4);
    a.dispose(); await flush();
    expect(a.diagnostics().decodedBytes).toBe(0);
    expect(a.diagnostics().activeMusicSources).toBe(0);
  });
  it('evicts finished outgoing cue while keeping WAV SFX resident and degrades missing optional stems', async () => {
    const a = setup(); await a.unlock(); a.music('menu'); await flush();
    const ctx = Context.latest; ctx.currentTime = 1;
    vi.mocked(fetch).mockImplementation(async input => ({ ok: !String(input).includes('-power'), status: 404, arrayBuffer: async () => new ArrayBuffer(4) } as Response));
    a.music('marsh'); await flush();
    expect(a.diagnostics().activeLayers.map(l => l.name)).toEqual(['base', 'motion']);
    expect(a.diagnostics().failedFiles).toContain('music-marsh-power.ogg');
    ctx.currentTime = 4; ctx.sources[0].onended?.();
    expect(a.diagnostics().decodedFiles).not.toContain('music-menu.ogg');
    expect(a.diagnostics().decodedFiles.filter(f => f.startsWith('sfx-'))).toHaveLength(8);
    a.dispose();
  });
  it('keeps the playing base if the next base fails, and never caches late disposed decodes', async () => {
    const a = setup(); await a.unlock(); a.music('menu'); await flush();
    Context.latest.currentTime = 1;
    vi.mocked(fetch).mockImplementation(async input => ({ ok: !String(input).includes('-base'), status: 404, arrayBuffer: async () => new ArrayBuffer(4) } as Response));
    a.music('roots'); await flush();
    expect(a.diagnostics().currentTrack).toBe('menu');
    expect(a.diagnostics().failedFiles).toContain('music-roots-base.ogg');
    expect(a.diagnostics().decodedFiles.some(f => f.includes('roots'))).toBe(false);
    let release!: () => void;
    vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { release = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response); }));
    a.music('victory'); a.dispose(); release(); await flush();
    expect(a.diagnostics().decodedFiles).toEqual([]);
    expect(a.diagnostics().pendingLoads).toBe(0);
    expect(a.diagnostics().activeMusicSources).toBe(0);
  });

  it('reports effective intensity and audible gains only as the clock crosses the bar and settles', async () => {
    const a = setup(); await a.unlock(); a.music('meadow'); await flush();
    const ctx = Context.latest; ctx.currentTime = 1;
    a.setIntensity(2);
    const at = 0.02 + 240 / 108;
    ctx.currentTime = at - 0.01;
    expect(a.diagnostics().intensity).toBe(0);
    expect(a.diagnostics().pendingIntensity).toBe(2);
    expect(a.diagnostics().activeLayers[2].gain).toBe(0);
    ctx.currentTime = at + 0.12;
    expect(a.diagnostics().intensity).toBe(2);
    expect(a.diagnostics().activeLayers[2].gain).toBeCloseTo(1 - Math.exp(-1), 8);
    expect(a.diagnostics().scheduledTransitionTime).toBeCloseTo(at);
    expect(a.diagnostics().mixSettledAt).toBeCloseTo(at + 0.72);
    ctx.currentTime = at + 0.8;
    expect(a.diagnostics().mixSettledAt).toBeNull();
    expect(a.diagnostics().activeLayers[2].gain).toBeGreaterThan(0.998);
    a.setPaused(true);
    const pauseAt = 0.02 + 2 * 240 / 108;
    expect(a.diagnostics().pauseGain).toBe(1);
    expect(a.diagnostics().targetPauseGain).toBe(0.32);
    ctx.currentTime = pauseAt - 0.01;
    expect(a.diagnostics().intensity).toBe(2);
    expect(a.diagnostics().pauseGain).toBe(1);
    ctx.currentTime = pauseAt + 0.12;
    expect(a.diagnostics().intensity).toBe(0);
    expect(a.diagnostics().pauseGain).toBeCloseTo(0.32 + 0.68 / Math.E, 8);
    expect(a.diagnostics().activeLayers[0].gain).toBeCloseTo(a.diagnostics().pauseGain, 8);
    ctx.currentTime = pauseAt + 0.8;
    expect(a.diagnostics().pauseGain).toBeCloseTo(0.32, 2);
    a.setPaused(false);
    const restoreAt = 0.02 + 3 * 240 / 108;
    ctx.currentTime = restoreAt - 0.01;
    expect(a.diagnostics().intensity).toBe(0);
    expect(a.diagnostics().pauseGain).toBeCloseTo(0.32, 2);
    ctx.currentTime = restoreAt + 0.8;
    expect(a.diagnostics().intensity).toBe(2);
    expect(a.diagnostics().pauseGain).toBeCloseTo(1, 2);
    expect(a.diagnostics().activeLayers[2].gain).toBeGreaterThan(0.99);
    a.dispose();
  });
  it('aborts stale fetches before decode, suppresses fallback and failures, and aborts dispose', async () => {
    const a = setup(); await a.unlock(); await flush();
    const ctx = Context.latest;
    const decode = vi.spyOn(ctx, 'decodeAudioData');
    const requests: { signal: AbortSignal; finish(): void; url: string }[] = [];
    vi.mocked(fetch).mockImplementation((url, options) => new Promise(resolve => {
      requests.push({ signal: options!.signal as AbortSignal, url: String(url),
        finish: () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response) });
    }));
    a.music('roots'); a.music('marsh'); a.music('amber');
    expect(requests).toHaveLength(9);
    expect(requests.slice(0, 6).every(r => r.signal.aborted)).toBe(true);
    requests.slice(0, 6).forEach(r => r.finish()); await flush();
    expect(decode).not.toHaveBeenCalled();
    expect(a.diagnostics().failedFiles).toEqual([]);
    expect(requests.every(r => r.url.endsWith('.ogg'))).toBe(true);
    a.dispose();
    expect(requests.every(r => r.signal.aborted)).toBe(true);
    requests.slice(6).forEach(r => r.finish()); await flush();
    expect(decode).not.toHaveBeenCalled();
    expect(a.diagnostics().pendingLoads).toBe(0);
  });

  it('rechecks ownership after the response body arrives, before expensive decoding', async () => {
    const a = setup(); await a.unlock(); await flush();
    const decode = vi.spyOn(Context.latest, 'decodeAudioData');
    const bodies: (() => void)[] = [];
    vi.mocked(fetch).mockImplementation(async () => ({ ok: true,
      arrayBuffer: () => new Promise<ArrayBuffer>(resolve => bodies.push(() => resolve(new ArrayBuffer(4)))) } as Response));
    a.music('roots'); await flush();
    expect(bodies).toHaveLength(3);
    a.music('menu');
    bodies.splice(0, 3).forEach(release => release()); await flush();
    expect(decode).not.toHaveBeenCalled();
    a.dispose(); bodies.forEach(release => release()); await flush();
    expect(decode).not.toHaveBeenCalled();
    expect(a.diagnostics().failedFiles).toEqual([]);
    expect(a.diagnostics().pendingLoads).toBe(0);
  });

  it('bounds each format fetch/body to 15s, retries MP3 independently and degrades optional stems', async () => {
    const a = setup(); await a.unlock(); await flush();
    vi.useFakeTimers();
    const attempts: { url: string; signal: AbortSignal }[] = [];
    vi.mocked(fetch).mockImplementation(async (input, options) => {
      const url = String(input);
      attempts.push({ url, signal: options!.signal as AbortSignal });
      if (url.includes('-power')) return new Promise<Response>(() => {}); // stuck fetch
      if (url.includes('-motion.ogg')) return { ok: true,
        arrayBuffer: () => new Promise<ArrayBuffer>(() => {}) } as Response; // stuck body
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
    });
    a.music('meadow'); await flush();
    expect(Context.latest.sources).toHaveLength(0);
    expect(attempts).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(attempts).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(1); await flush();
    expect(attempts.filter(r => r.url.endsWith('.mp3'))).toHaveLength(2);
    expect(attempts.find(r => r.url.endsWith('-motion.ogg'))!.signal.aborted).toBe(true);
    expect(attempts.find(r => r.url.endsWith('-motion.mp3'))!.signal.aborted).toBe(false);
    expect(a.diagnostics().fallbackFiles).toContain('music-meadow-motion.mp3');
    expect(Context.latest.sources).toHaveLength(0); // power's second codec still has its own budget
    await vi.advanceTimersByTimeAsync(15_000); await flush();
    expect(Context.latest.sources).toHaveLength(2);
    expect(a.diagnostics().activeLayers.map(l => l.name)).toEqual(['base', 'motion']);
    expect(a.diagnostics().failedFiles).toEqual(['music-meadow-power.ogg']);
    expect(a.diagnostics().pendingLoads).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    a.dispose();
  });
  it('cleans network deadlines on eviction/dispose without waiting or falling back', async () => {
    const a = setup(); await a.unlock(); await flush();
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.mocked(fetch).mockImplementation((_, options) => {
      signals.push(options!.signal as AbortSignal);
      return new Promise<Response>(() => {});
    });
    a.music('roots'); await flush();
    expect(vi.getTimerCount()).toBe(3);
    a.music('marsh'); await flush();
    expect(signals.slice(0, 3).every(signal => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(3);
    expect(a.diagnostics().pendingLoads).toBe(3);
    a.dispose(); await flush();
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(a.diagnostics().pendingLoads).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(signals).toHaveLength(6); // no MP3 on cancellation
    expect(a.diagnostics().failedFiles).toEqual([]);
  });

});
