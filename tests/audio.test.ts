import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioSystem } from '../src/audio/AudioSystem';

afterEach(() => vi.restoreAllMocks());

describe('audio regressions', () => {
  it('uses conservative defaults and returns detached serializable diagnostics', () => {
    const audio = new AudioSystem();
    const snapshot = audio.diagnostics();
    expect([snapshot.master, snapshot.music, snapshot.sfx]).toEqual([0.72, 0.55, 0.65]);
    snapshot.failedFiles.push('external mutation');
    expect(audio.diagnostics().failedFiles).toEqual([]);
    expect(() => JSON.stringify(snapshot)).not.toThrow();
    audio.dispose();
  });

  it('retains the rolling burst history and admits new hits after expiry', () => {
    const audio = new AudioSystem();
    let starts = 0;
    const source = () => ({ connect() {}, disconnect() {}, playbackRate: { value: 1 }, start() { starts++; } });
    // Deliberately finish voices immediately; burst limiting must work independently
    // of both the simultaneous-voice cap and individual sound throttles.
    const internals = audio as unknown as {
      ctx: unknown; sfxBus: unknown; decoded: Map<string, unknown>;
      activeSfx: Set<unknown>; now: () => number;
    };
    let clock = 0;
    internals.now = () => clock;
    internals.ctx = {
      state: 'running', currentTime: 0,
      createBufferSource: source,
      createGain: () => ({ gain: { value: 1 }, connect() {} }),
    };
    internals.sfxBus = {};
    internals.decoded.set('sfx-click.wav', {});
    for (let i = 0; i < 25; i++) {
      clock = i * 40;
      audio.play(i % 2 ? 'hover' : 'click');
      internals.decoded.set('sfx-hover.wav', {});
      internals.activeSfx.clear();
    }
    expect(starts).toBe(24);
    expect(audio.diagnostics().throttledPlays).toBe(1);
    clock = 1100;
    audio.play('click');
    expect(starts).toBe(25);
  });

  it.each(['missing', 'unsupported'])('falls back honestly when OGG is %s', async (mode) => {
    const audio = new AudioSystem();
    const internals = audio as unknown as {
      ctx: unknown; load: (file: string) => Promise<unknown>;
      decode: () => Promise<unknown>;
    };
    internals.ctx = {};
    const buffer = { duration: 48 };
    let decodes = 0;
    internals.decode = async () => {
      decodes++;
      if (mode === 'unsupported' && decodes === 1) throw new Error('codec');
      return buffer;
    };
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: !(mode === 'missing' && url.endsWith('.ogg')), status: 404,
        arrayBuffer: async () => new ArrayBuffer(4) };
    }));
    expect(await internals.load('music-menu.ogg')).toBe(buffer);
    expect(urls.map(url => url.split('/').pop())).toEqual(['music-menu.ogg', 'music-menu.mp3']);
    expect(audio.diagnostics().decodedFiles).toEqual(['music-menu.mp3']);
    expect(audio.diagnostics().fallbackFiles).toEqual(['music-menu.mp3']);
    expect(audio.diagnostics().failedFiles).toEqual([]);
    expect(audio.diagnostics().pendingLoads).toBe(0);
    expect(await internals.load('music-menu.ogg')).toBe(buffer);
    expect(urls).toHaveLength(2);
    vi.unstubAllGlobals();
  });

  it('reports the actual compressed decode without a fictitious WAV', async () => {
    const audio = new AudioSystem();
    const internals = audio as unknown as { ctx: unknown; load: (file: string) => Promise<unknown>; decode: () => Promise<unknown> };
    internals.ctx = {};
    internals.decode = async () => ({});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })));
    await internals.load('music-battle.ogg');
    expect(audio.diagnostics().decodedFiles).toEqual(['music-battle.ogg']);
    expect(audio.diagnostics().fallbackFiles).toEqual([]);
    vi.unstubAllGlobals();
  });

});
