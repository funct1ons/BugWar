#!/usr/bin/env python3
"""Bug War — offline procedural audio generator (Python standard library only).

Generates every sound the game ships with, so the repository needs no binary
samples and no network at runtime:

  public/audio/music-menu.wav      loopable menu theme   (>= 24 s)
  public/audio/music-battle.wav    loopable battle theme (>= 24 s)
  public/audio/music-victory.wav   short victory cue
  public/audio/music-defeat.wav    short defeat cue
  public/audio/sfx-hover.wav       ... sfx-click.wav, sfx-select.wav,
  public/audio/sfx-dispatch.wav       sfx-march.wav, sfx-impact.wav,
  public/audio/sfx-capture.wav        sfx-capture.wav, sfx-skill.wav

Everything is synthesised from oscillators, physical-ish models (Karplus-Strong
plucks, membrane drums, mallet bars, breath flutes), filtered noise and a
Schroeder reverb.  No sine-only melodies: every cue is layered from several
voices with harmony, rhythm and register movement.

Design rules enforced here:
  * 44.1 kHz, 16-bit PCM, stereo music / mono SFX.
  * Music loops are rendered with a reverb tail that is *folded back* onto the
    head of the buffer, so the decay of the last bar is already present when the
    loop repeats.  A 2 ms raised-cosine edge fade guarantees a click-free seam.
  * Soft-knee limiting + peak normalisation (music -1 dBFS, SFX -3..-7 dBFS).
  * Deterministic: a fixed seed reproduces every byte.

Usage
-----
    python scripts/generate-audio.py                 # (re)generate + report
    python scripts/generate-audio.py --analyze-only  # measure existing files
    python scripts/generate-audio.py --only menu,skill
    python scripts/generate-audio.py --check         # exit 1 on a failed check

All audio is original synthesis produced by this script (no third-party
samples); it may be shipped with the game as CC0 / public domain.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import struct
import sys
import time
import wave
from array import array

# --------------------------------------------------------------------------- #
# constants
# --------------------------------------------------------------------------- #

SR = 44100
TAU = math.pi * 2.0
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_OUT = os.path.join(ROOT, "public", "audio")

MUSIC_FILES = {
    "menu": "music-menu.wav",
    "battle": "music-battle.wav",
    "victory": "music-victory.wav",
    "defeat": "music-defeat.wav",
}
SFX_FILES = {
    "hover": "sfx-hover.wav",
    "click": "sfx-click.wav",
    "select": "sfx-select.wav",
    "dispatch": "sfx-dispatch.wav",
    "march": "sfx-march.wav",
    "impact": "sfx-impact.wav",
    "capture": "sfx-capture.wav",
    "skill": "sfx-skill.wav",
}
# The two end-of-round cues are music files; AudioSystem may also fire them as a
# one-shot SFX through play('victory' | 'defeat'), hence the shared file names.
LOOPING = {"menu": True, "battle": True, "victory": False, "defeat": False}

RNG = random.Random(0x5EEDB06)


# --------------------------------------------------------------------------- #
# small helpers
# --------------------------------------------------------------------------- #

def midi_hz(m: float) -> float:
    return 440.0 * 2.0 ** ((float(m) - 69.0) / 12.0)


def db_to_lin(db: float) -> float:
    return 10.0 ** (db / 20.0)


def lin_to_db(x: float) -> float:
    return -999.0 if x <= 1e-12 else 20.0 * math.log10(x)


_NOTE_BASE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def note(name: str) -> int:
    """'D4' -> 62, 'F#5' -> 78, 'Bb3' -> 58."""
    letter = name[0].upper()
    acc = 0
    i = 1
    while i < len(name) and name[i] in "#b":
        acc += 1 if name[i] == "#" else -1
        i += 1
    return 12 * (int(name[i:]) + 1) + _NOTE_BASE[letter] + acc


def new_buf(n: int) -> array:
    return array("d", bytes(8 * n))


def pan_gains(pan: float) -> tuple[float, float]:
    pan = -1.0 if pan < -1.0 else (1.0 if pan > 1.0 else pan)
    theta = (pan + 1.0) * (math.pi * 0.25)
    return math.cos(theta), math.sin(theta)


def mix_note(bl: array, br: array, t0: float, sig: list, gain: float,
             pan: float) -> None:
    """Mix a mono voice into a stereo buffer at t0 seconds."""
    if gain == 0.0 or not sig:
        return
    i0 = int(t0 * SR)
    off = 0
    if i0 < 0:
        off = -i0
        i0 = 0
    n = len(sig) - off
    if n <= 0:
        return
    avail = len(bl) - i0
    if avail <= 0:
        return
    if n > avail:
        n = avail
    gl, gr = pan_gains(pan)
    gl *= gain
    gr *= gain
    for j in range(n):
        s = sig[off + j]
        bl[i0 + j] += s * gl
        br[i0 + j] += s * gr


def add_mono(buf: array, t0: float, sig: list, gain: float) -> None:
    if gain == 0.0 or not sig:
        return
    i0 = max(0, int(t0 * SR))
    n = min(len(sig), len(buf) - i0)
    for j in range(n):
        buf[i0 + j] += sig[j] * gain


def shape_ends(sig: list, attack_ms: float = 4.0, release_ms: float = 25.0) -> list:
    """In-place anti-click ramps, returns the same list."""
    n = len(sig)
    a = min(n, max(1, int(attack_ms * 0.001 * SR)))
    for i in range(a):
        sig[i] *= 0.5 - 0.5 * math.cos(math.pi * i / a)
    r = min(n, max(1, int(release_ms * 0.001 * SR)))
    for i in range(r):
        sig[n - 1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / r)
    return sig


def smooth_adsr(n: int, attack: float, release: float, sustain: float = 1.0,
                swell: float = 0.0) -> list:
    env = [sustain] * n
    a = min(n, max(1, int(attack * SR)))
    for i in range(a):
        env[i] *= 0.5 - 0.5 * math.cos(math.pi * i / a)
    r = min(n, max(1, int(release * SR)))
    for i in range(r):
        env[n - 1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / r)
    if swell:
        for i in range(n):
            env[i] *= 1.0 + swell * math.sin(math.pi * i / n)
    return env


# --------------------------------------------------------------------------- #
# instruments
# --------------------------------------------------------------------------- #

def syn_pluck(freq: float, dur: float, tau: float = 0.9, bright: float = 0.5,
              sub: float = 0.16, pick: float = 0.35) -> list:
    """Karplus-Strong plucked string (lute / harp family) with fractional delay."""
    n = max(16, int(dur * SR))
    delay = SR / freq
    size = int(math.ceil(delay)) + 2
    line = new_buf(size)

    # excitation: noise burst, one-pole shaped, gently combed like a plectrum
    prev = 0.0
    lp_a = 0.05 + 0.5 * bright
    for i in range(size):
        w = RNG.uniform(-1.0, 1.0)
        prev += (w - prev) * lp_a
        line[i] = prev * (1.0 - 0.5 * pick) + (line[i - 1] * 0.5 * pick if i else 0.0)
    mean = sum(line) / size
    for i in range(size):
        line[i] -= mean

    out = [0.0] * n
    idx = 0
    prev_y = 0.0
    smooth = 0.5 - 0.32 * bright
    # one loop pass through the delay line per period -> tau is seconds
    decay = math.exp(-1.0 / max(0.02, tau) / max(20.0, freq))
    for i in range(n):
        rp = idx - delay
        while rp < 0.0:
            rp += size
        i0 = int(rp)
        frac = rp - i0
        i1 = i0 + 1
        if i1 >= size:
            i1 -= size
        y = line[i0] + (line[i1] - line[i0]) * frac
        out[i] = y
        line[idx] = (y + (prev_y - y) * smooth) * decay
        prev_y = y
        idx += 1
        if idx >= size:
            idx = 0

    if sub > 0.0:
        ph = 0.0
        step = TAU * freq / SR
        mul = math.exp(-1.0 / (0.30 * SR))
        e = 0.55
        for i in range(n):
            out[i] += sub * e * math.sin(ph)
            ph += step
            e *= mul
    return shape_ends(out, 2.5, 30.0)


def syn_marimba(freq: float, dur: float, hard: float = 0.5) -> list:
    """Wooden mallet bar: three bar modes (1 : 3.98 : 9.2) + mallet click."""
    n = max(16, int(dur * SR))
    base = 0.50 * (261.0 / max(90.0, freq)) ** 0.35
    specs = ((1.0, 1.00, 1.00), (3.98, 0.32, 0.34), (9.20, 0.16, 0.12))
    k = len(specs)
    ph = [0.0] * k
    step = [TAU * freq * s[0] / SR for s in specs]
    amp = [s[1] * (0.6 + 0.5 * hard) ** (i + 1) for i, s in enumerate(specs)]
    mul = [math.exp(-1.0 / (base * s[2] * SR)) for s in specs]
    e = [1.0] * k
    out = [0.0] * n
    for i in range(n):
        s = 0.0
        for p in range(k):
            s += amp[p] * e[p] * math.sin(ph[p])
            ph[p] += step[p]
            e[p] *= mul[p]
        out[i] = s
    # mallet click
    c = min(n, int(0.008 * SR))
    nlp = 0.0
    for i in range(c):
        w = RNG.uniform(-1.0, 1.0)
        nlp += (w - nlp) * 0.55
        out[i] += (w - nlp) * 0.14 * (1.0 - i / c) * (0.4 + hard)
    return shape_ends(out, 2.0, 22.0)


def syn_flute(freq: float, dur: float, attack: float = 0.075,
              release: float = 0.16, vibrato: float = 0.006,
              breath: float = 0.080) -> list:
    """Soft wooden flute: harmonic tone + band-limited breath noise."""
    n = max(16, int(dur * SR))
    env = smooth_adsr(n, attack, release, 1.0, swell=0.07)
    out = [0.0] * n
    ph = 0.0
    step = TAU * freq / SR
    vph = 0.0
    vstep = TAU * 5.1 / SR
    nlp = 0.0
    for i in range(n):
        vib = 1.0 + vibrato * math.sin(vph)
        vph += vstep
        ph += step * vib
        s = (math.sin(ph)
             + 0.24 * math.sin(2.0 * ph + 0.4)
             + 0.085 * math.sin(3.0 * ph + 1.1))
        w = RNG.uniform(-1.0, 1.0)
        nlp += (w - nlp) * 0.30
        s += breath * (w - nlp)
        out[i] = s * env[i]
    return shape_ends(out, 3.0, 18.0)


def syn_bass(freq: float, dur: float, drive: float = 0.35) -> list:
    """Rounded low string / tub: sine fundamental, soft second, filtered top."""
    n = max(16, int(dur * SR))
    env = smooth_adsr(n, 0.012, 0.09, 1.0, swell=0.05)
    out = [0.0] * n
    ph = 0.0
    step = TAU * freq / SR
    ph2 = 0.0
    step2 = TAU * freq * 2.0 / SR
    e2 = 1.0
    mul2 = math.exp(-1.0 / (0.35 * SR))
    lp = 0.0
    for i in range(n):
        v = math.sin(ph) + 0.34 * math.sin(ph2) * e2 + 0.10 * math.sin(ph * 3.0)
        v = v / (1.0 + drive * abs(v))
        lp += (v - lp) * 0.42
        out[i] = lp * env[i]
        ph += step
        ph2 += step2
        e2 *= mul2
    return shape_ends(out, 3.0, 26.0)


def make_table(harmonics) -> list:
    """Single-cycle wavetable from harmonic amplitudes (index 0 = 1st)."""
    size = 4096
    tbl = [0.0] * size
    for k, a in enumerate(harmonics, start=1):
        if not a:
            continue
        step = TAU * k / size
        for i in range(size):
            tbl[i] += a * math.sin(step * i)
    peak = max(abs(v) for v in tbl) or 1.0
    inv = 1.0 / peak
    return [v * inv for v in tbl]


PAD_TABLE = make_table((1.0, 0.46, 0.28, 0.16, 0.10, 0.062, 0.038, 0.022))
HORN_TABLE = make_table((1.0, 0.66, 0.44, 0.28, 0.18, 0.115, 0.072, 0.045, 0.028))


def syn_table_voice(freq: float, dur: float, table: list, attack: float = 0.4,
                    release: float = 0.8, vibrato: float = 0.004,
                    rate: float = 4.3, lp: float = 0.55,
                    tremolo: float = 0.0) -> list:
    """Sustained harmonic instrument (soft horn / string pad) from a wavetable."""
    n = max(16, int(dur * SR))
    env = smooth_adsr(n, attack, release, 1.0)
    size = len(table)
    out = [0.0] * n
    pos = 0.0
    step = freq * size / SR
    vph = 0.0
    vstep = TAU * rate / SR
    tph = 0.0
    tstep = TAU * 0.55 / SR
    lpv = 0.0
    for i in range(n):
        pos += step * (1.0 + vibrato * math.sin(vph))
        vph += vstep
        while pos >= size:
            pos -= size
        i0 = int(pos)
        frac = pos - i0
        i1 = i0 + 1
        if i1 >= size:
            i1 -= size
        v = table[i0] + (table[i1] - table[i0]) * frac
        lpv += (v - lpv) * lp
        amp = env[i]
        if tremolo:
            tph += tstep
            amp *= 1.0 + tremolo * math.sin(tph)
        out[i] = lpv * amp
    return shape_ends(out, 4.0, 30.0)


def syn_bell(freq: float, dur: float, tau: float = 0.55) -> list:
    """Inharmonic struck bell / celesta."""
    n = max(16, int(dur * SR))
    specs = ((1.0, 1.00, 1.00), (2.76, 0.50, 0.62),
             (5.40, 0.26, 0.36), (8.93, 0.12, 0.22))
    k = len(specs)
    ph = [0.0] * k
    step = [TAU * freq * s[0] / SR for s in specs]
    e = [1.0] * k
    mul = [math.exp(-1.0 / (tau * s[2] * SR)) for s in specs]
    out = [0.0] * n
    for i in range(n):
        s = 0.0
        for p in range(k):
            s += specs[p][1] * e[p] * math.sin(ph[p])
            ph[p] += step[p]
            e[p] *= mul[p]
        out[i] = s * 0.5
    return shape_ends(out, 2.0, 45.0)


DRUM_PRESETS = {
    #        start  end  dur   tau   noise nlp   sweep
    "low":  (132.0, 58.0, 0.62, 0.165, 0.55, 0.30, 0.045),
    "mid":  (208.0, 116.0, 0.40, 0.100, 0.45, 0.40, 0.030),
    "high": (336.0, 208.0, 0.26, 0.060, 0.38, 0.46, 0.020),
    "rim":  (1040.0, 780.0, 0.12, 0.028, 0.85, 0.62, 0.010),
    "heart": (96.0, 52.0, 0.45, 0.14, 0.28, 0.22, 0.060),
}


def syn_drum(kind: str = "low") -> list:
    """Pitch-swept membrane + noise transient: tribal frame / hand drums."""
    f_start, f_end, dur, tau, noise, nlp, sweep = DRUM_PRESETS[kind]
    n = max(16, int(dur * SR))
    out = [0.0] * n
    ph = 0.0
    f = f_start
    smul = math.exp(-1.0 / (sweep * SR))
    env = 1.0
    emul = math.exp(-1.0 / (tau * SR))
    nl = 0.0
    for i in range(n):
        ph += TAU * f / SR
        f = f_end + (f - f_end) * smul
        nl += (RNG.uniform(-1.0, 1.0) - nl) * nlp
        click = nl * math.exp(-i / (0.0035 * SR))
        out[i] = math.sin(ph) * env + noise * click
        env *= emul
    return shape_ends(out, 1.5, 30.0)


def syn_shaker(dur: float = 0.16, tone: float = 0.5) -> list:
    """Seed-pod / gourd shaker: band-passed noise with a fast swell."""
    n = max(16, int(dur * SR))
    out = [0.0] * n
    env = smooth_adsr(n, 0.006, dur * 0.55, 1.0)
    a1 = 1.0 - math.exp(-TAU * (1500.0 + 1800.0 * tone) / SR)
    a2 = 1.0 - math.exp(-TAU * (7000.0 + 3000.0 * tone) / SR)
    l1 = 0.0
    l2 = 0.0
    for i in range(n):
        w = RNG.uniform(-1.0, 1.0)
        l1 += (w - l1) * a1
        l2 += (w - l2) * a2
        out[i] = (l2 - l1) * env[i]
    return out


def syn_noise_sweep(dur: float, f0: float, f1: float, shape: float = 1.4,
                    width: float = 2.2) -> list:
    """Whoosh: band-passed noise with an exponential cutoff sweep."""
    n = max(16, int(dur * SR))
    out = [0.0] * n
    l1 = 0.0
    l2 = 0.0
    a1 = a2 = 0.0
    for i in range(n):
        u = i / (n - 1)
        if i % 64 == 0:
            fc = f0 * (f1 / f0) ** (u ** shape)
            a1 = 1.0 - math.exp(-TAU * (fc / width) / SR)
            a2 = 1.0 - math.exp(-TAU * (fc * width) / SR)
        w = RNG.uniform(-1.0, 1.0)
        l1 += (w - l1) * a1
        l2 += (w - l2) * a2
        out[i] = (l2 - l1) * math.sin(math.pi * u) ** 1.2
    return out


def syn_chirp(freq: float, dur: float, rise: float = 0.3) -> list:
    n = max(16, int(dur * SR))
    out = [0.0] * n
    ph = 0.0
    for i in range(n):
        u = i / (n - 1)
        f = freq * (1.0 + rise * math.sin(math.pi * u))
        ph += TAU * f / SR
        out[i] = math.sin(ph) * math.sin(math.pi * u) ** 1.6
    return out


# --------------------------------------------------------------------------- #
# ambience (nature beds)
# --------------------------------------------------------------------------- #

def add_wind(bl: array, br: array, dur: float, gain: float = 1.0,
             seed_phase: float = 0.0) -> None:
    n = min(len(bl), int(dur * SR))
    for ch in (0, 1):
        b = 0.0
        slow = 0.0
        ph = seed_phase + (0.0 if ch == 0 else 2.1)
        dst = bl if ch == 0 else br
        for i in range(n):
            w = RNG.uniform(-1.0, 1.0)
            b = 0.995 * b + 0.05 * w
            slow += (b - slow) * 0.0009
            v = b - slow * 3.2
            t = i / SR
            amp = (0.52
                   + 0.24 * math.sin(TAU * 0.061 * t + ph)
                   + 0.16 * math.sin(TAU * 0.173 * t + ph * 1.7))
            dst[i] += v * amp * gain


def add_rustle(bl: array, br: array, dur: float, count: int = 6,
               gain: float = 0.02) -> None:
    """Dry leaf / grass swishes."""
    for _ in range(count):
        t0 = RNG.uniform(0.4, max(0.5, dur - 1.0))
        length = RNG.uniform(0.30, 0.95)
        f0 = RNG.uniform(900.0, 2600.0)
        f1 = f0 * RNG.uniform(0.6, 1.7)
        sig = syn_noise_sweep(length, f0, f1, shape=0.8, width=1.8)
        pan = RNG.uniform(-0.85, 0.85)
        mix_note(bl, br, t0, sig, gain * RNG.uniform(0.6, 1.2), pan)


def add_birds(bl: array, br: array, dur: float, count: int = 5,
              gain: float = 0.03) -> None:
    for _ in range(count):
        t0 = RNG.uniform(0.6, max(0.8, dur - 1.2))
        pan = RNG.uniform(-0.9, 0.9)
        base = RNG.uniform(2300.0, 4100.0)
        for c in range(RNG.randint(2, 4)):
            if t0 > dur:
                break
            length = RNG.uniform(0.045, 0.085)
            sig = syn_chirp(base * RNG.uniform(0.94, 1.06), length,
                            rise=RNG.uniform(0.1, 0.4))
            mix_note(bl, br, t0, sig, gain * RNG.uniform(0.7, 1.0), pan)
            t0 += length + RNG.uniform(0.035, 0.09)


def add_crickets(bl: array, br: array, dur: float, count: int = 6,
                 gain: float = 0.006) -> None:
    for _ in range(count):
        t0 = RNG.uniform(0.4, max(0.6, dur - 0.8))
        length = RNG.uniform(0.22, 0.55)
        freq = RNG.uniform(3600.0, 4600.0)
        rate = RNG.uniform(21.0, 31.0)
        pan = RNG.uniform(-0.8, 0.8)
        n = int(length * SR)
        sig = [0.0] * n
        ph = 0.0
        am = 0.0
        for i in range(n):
            ph += TAU * freq / SR
            am += TAU * rate / SR
            env = math.sin(math.pi * i / n) ** 1.2
            sig[i] = math.sin(ph) * (0.55 + 0.45 * math.sin(am)) * env
        mix_note(bl, br, t0, sig, gain, pan)


# --------------------------------------------------------------------------- #
# reverb (Schroeder comb + allpass, wrap-free; loop tails are folded later)
# --------------------------------------------------------------------------- #

def _comb_into(src: array, dst: array, delay: int, feedback: float,
               damp: float) -> None:
    line = new_buf(delay)
    idx = 0
    lp = 0.0
    for i in range(len(src)):
        y = line[idx]
        lp = y * (1.0 - damp) + lp * damp
        line[idx] = src[i] + lp * feedback
        dst[i] += y
        idx += 1
        if idx >= delay:
            idx = 0


def _allpass(src: array, delay: int, g: float) -> array:
    n = len(src)
    out = new_buf(n)
    line = new_buf(delay)
    idx = 0
    for i in range(n):
        d = line[idx]
        v = src[i] + g * d
        out[i] = d - g * v
        line[idx] = v
        idx += 1
        if idx >= delay:
            idx = 0
    return out


def add_reverb(bl: array, br: array, wet: float = 0.22, room: float = 0.82,
               damp: float = 0.34) -> None:
    n = len(bl)
    acc_l = new_buf(n)
    acc_r = new_buf(n)
    for d in (1557, 1617, 1491, 1422):
        _comb_into(bl, acc_l, d, room, damp)
    for d in (1583, 1601, 1487, 1451):
        _comb_into(br, acc_r, d, room, damp)
    wl = _allpass(acc_l, 225, 0.5)
    wl = _allpass(wl, 556, 0.5)
    wr = _allpass(acc_r, 223, 0.5)
    wr = _allpass(wr, 553, 0.5)
    for i in range(n):
        bl[i] += wet * wl[i]
        br[i] += wet * wr[i]


# --------------------------------------------------------------------------- #
# mastering EQ (RBJ biquads)
# --------------------------------------------------------------------------- #

def _eq_coeffs(kind: str, freq: float, db: float, q: float = 0.8,
               sr: int = SR):
    a = 10.0 ** (db / 40.0)
    w0 = TAU * freq / sr
    cosw = math.cos(w0)
    sinw = math.sin(w0)
    if kind == "peak":
        alpha = sinw / (2.0 * q)
        return (1.0 + alpha * a, -2.0 * cosw, 1.0 - alpha * a,
                1.0 + alpha / a, -2.0 * cosw, 1.0 - alpha / a)
    if kind == "low":
        alpha = sinw * 0.5 * math.sqrt((a + 1.0 / a) * (1.0 / 1.0 - 1.0) + 2.0)
        sq = 2.0 * math.sqrt(a) * alpha
        return (a * ((a + 1.0) - (a - 1.0) * cosw + sq),
                2.0 * a * ((a - 1.0) - (a + 1.0) * cosw),
                a * ((a + 1.0) - (a - 1.0) * cosw - sq),
                (a + 1.0) + (a - 1.0) * cosw + sq,
                -2.0 * ((a - 1.0) + (a + 1.0) * cosw),
                (a + 1.0) + (a - 1.0) * cosw - sq)
    # high shelf
    alpha = sinw * 0.5 * math.sqrt((a + 1.0 / a) * (1.0 / 1.0 - 1.0) + 2.0)
    sq = 2.0 * math.sqrt(a) * alpha
    return (a * ((a + 1.0) + (a - 1.0) * cosw + sq),
            -2.0 * a * ((a - 1.0) + (a + 1.0) * cosw),
            a * ((a + 1.0) + (a - 1.0) * cosw - sq),
            (a + 1.0) - (a - 1.0) * cosw + sq,
            2.0 * ((a - 1.0) - (a + 1.0) * cosw),
            (a + 1.0) - (a - 1.0) * cosw - sq)


def biquad_inplace(x: array, coeffs) -> None:
    b0, b1, b2, a0, a1, a2 = coeffs
    b0 /= a0
    b1 /= a0
    b2 /= a0
    a1 /= a0
    a2 /= a0
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        v = x[i]
        y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1
        x1 = v
        y2 = y1
        y1 = y
        x[i] = y


def master_eq(bufs, low_db: float = -2.5, mid_db: float = 3.0,
              high_db: float = 6.0) -> None:
    """Gentle tone shaping: trim sub-bass, open up the presence and the air."""
    chain = (
        _eq_coeffs("low", 110.0, low_db, 0.7),
        _eq_coeffs("peak", 1800.0, mid_db, 0.75),
        _eq_coeffs("high", 3200.0, high_db),
    )
    for b in bufs:
        for c in chain:
            biquad_inplace(b, c)


# --------------------------------------------------------------------------- #
# composer
# --------------------------------------------------------------------------- #

CHORDS = {
    "Dm": (62, 65, 69), "F": (65, 69, 72), "C": (60, 64, 67), "G": (55, 59, 62),
    "Am": (57, 60, 64), "Em": (64, 67, 71), "Bb": (58, 62, 65), "Gm": (55, 58, 62),
    "A": (57, 61, 64), "D": (62, 66, 69),
}
ROOTS = {"Dm": 38, "F": 41, "C": 36, "G": 43, "Am": 45, "Em": 40,
         "Bb": 46, "Gm": 43, "A": 45, "D": 38, "D": 38}


def chord_tone(chord, step: int) -> int:
    k = len(chord)
    octave, idx = divmod(int(step), k)
    return chord[idx] + 12 * octave


class Piece:
    """A stereo score buffer with instrument helpers and a note census."""

    def __init__(self, bpm: float, bars: int, beats_per_bar: float = 4.0,
                 tail: float = 2.6, loop: bool = True):
        self.bpm = bpm
        self.spb = 60.0 / bpm
        self.bpb = beats_per_bar
        self.bars = bars
        self.loop = loop
        self.loop_len = bars * beats_per_bar * self.spb
        self.tail = tail
        self.n = int((self.loop_len + tail) * SR) + 1
        self.bl = new_buf(self.n)
        self.br = new_buf(self.n)
        self.census = {}

    # --- helpers ---------------------------------------------------------- #
    def bt(self, bar: float, beat: float = 0.0) -> float:
        return (bar * self.bpb + beat) * self.spb

    def total(self) -> float:
        return self.n / SR

    def add(self, t: float, sig: list, gain: float, pan: float,
            name: str) -> None:
        mix_note(self.bl, self.br, t, sig, gain, pan)
        self.census[name] = self.census.get(name, 0) + 1

    # --- instruments ------------------------------------------------------ #
    def pluck(self, t, midi, dur, gain=0.24, pan=0.0, tau=0.9, bright=0.5,
              sub=0.16):
        self.add(t, syn_pluck(midi_hz(midi), dur, tau=tau, bright=bright,
                              sub=sub), gain, pan, "pluck")

    def marimba(self, t, midi, dur, gain=0.13, pan=0.0, hard=0.5):
        self.add(t, syn_marimba(midi_hz(midi), dur, hard=hard), gain, pan,
                 "marimba")

    def flute(self, t, midi, dur, gain=0.22, pan=0.0):
        a = min(0.075, dur * 0.35)
        r = min(0.16, dur * 0.45)
        self.add(t, syn_flute(midi_hz(midi), dur, attack=a, release=r),
                 gain, pan, "flute")

    def bass(self, t, midi, dur, gain=0.28, pan=0.0):
        self.add(t, syn_bass(midi_hz(midi), dur), gain, pan, "bass")

    def pad(self, t, midi, dur, gain=0.07, pan=0.0, attack=0.4, release=0.9):
        self.add(t, syn_table_voice(midi_hz(midi), dur, PAD_TABLE,
                                    attack=attack, release=release,
                                    vibrato=0.0035, rate=4.1, lp=0.5,
                                    tremolo=0.06), gain, pan, "pad")

    def horn(self, t, midi, dur, gain=0.08, pan=0.0, attack=0.07,
             release=0.22):
        self.add(t, syn_table_voice(midi_hz(midi), dur, HORN_TABLE,
                                    attack=attack, release=release,
                                    vibrato=0.0022, rate=5.0, lp=0.8),
                 gain, pan, "horn")

    def bell(self, t, midi, dur, gain=0.06, pan=0.0, tau=0.55):
        self.add(t, syn_bell(midi_hz(midi), dur, tau=tau), gain, pan, "bell")

    def drum(self, t, kind="low", gain=0.2, pan=0.0):
        self.add(t, syn_drum(kind), gain, pan, "drum_" + kind)

    def shaker(self, t, gain=0.06, pan=0.0):
        self.add(t, syn_shaker(0.16, tone=0.5), gain, pan, "shaker")


# --------------------------------------------------------------------------- #
# composition: menu (D dorian, 84 BPM, 12 bars = 34.29 s)
# --------------------------------------------------------------------------- #

MENU_BPM = 84
MENU_BARS = 12
MENU_PROG = ["Dm", "F", "C", "G", "Am", "F", "G", "Dm", "Dm", "F", "C", "G"]


def build_menu() -> Piece:
    p = Piece(MENU_BPM, MENU_BARS, tail=2.9)

    # 1. harmonic bed: soft pad + low root, one chord per bar
    for bar, ch in enumerate(MENU_PROG):
        t0 = p.bt(bar, 0.0)
        dur = 3.92 * p.spb
        for k, midi in enumerate(CHORDS[ch]):
            p.pad(t0, midi, dur, gain=0.058, pan=-0.45 + 0.45 * k,
                  attack=0.45, release=0.85)
        p.pad(t0, ROOTS[ch] + 12, dur, gain=0.040, pan=0.0,
              attack=0.62, release=1.0)

    # 2. bass: root on the downbeat, push on beat 2.5, fifth answer
    for bar, ch in enumerate(MENU_PROG):
        r = ROOTS[ch]
        p.bass(p.bt(bar, 0.0), r, 1.75 * p.spb, gain=0.27)
        p.bass(p.bt(bar, 2.5), r, 1.25 * p.spb, gain=0.21)
        if bar % 2 == 1:
            p.bass(p.bt(bar, 3.5), r + 7, 0.45 * p.spb, gain=0.15)

    # 3. marimba ostinato: two-octave arpeggio, sparse intro, accents 1 & 3
    pattern = (0, 1, 2, 3, 4, 3, 2, 1)
    for bar, ch in enumerate(MENU_PROG):
        chord = CHORDS[ch]
        for s, step in enumerate(pattern):
            if bar < 4 and s % 2 == 1:
                continue
            midi = chord_tone(chord, step)
            accent = 1.0 if s in (0, 4) else 0.72
            pan = -0.34 if s % 2 == 0 else 0.34
            p.marimba(p.bt(bar, s * 0.5), midi, 0.55 * p.spb,
                      gain=0.135 * accent, pan=pan, hard=0.45)

    # 4. flute melody, statement (bars 4-7) and variation (bars 8-11)
    melody = [
        (4, 0.0, note("A4"), 1.0), (4, 1.0, note("C5"), 1.0),
        (4, 2.0, note("D5"), 1.8),
        (5, 0.0, note("C5"), 1.4), (5, 1.5, note("A4"), 0.5),
        (5, 2.0, note("F4"), 1.8),
        (6, 0.0, note("G4"), 1.0), (6, 1.0, note("A4"), 1.0),
        (6, 2.0, note("B4"), 1.8),
        (7, 0.0, note("A4"), 1.0), (7, 1.0, note("F4"), 1.0),
        (7, 2.0, note("D4"), 1.8),
        (8, 0.0, note("D5"), 0.9), (8, 1.0, note("F5"), 0.9),
        (8, 2.0, note("E5"), 0.9), (8, 3.0, note("D5"), 0.9),
        (9, 0.0, note("C5"), 1.4), (9, 1.5, note("A4"), 0.5),
        (9, 2.0, note("C5"), 0.9), (9, 3.0, note("F5"), 0.9),
        (10, 0.0, note("E5"), 1.2), (10, 1.2, note("D5"), 0.8),
        (10, 2.0, note("C5"), 1.8),
        (11, 0.0, note("B4"), 1.0), (11, 1.0, note("D5"), 1.0),
        (11, 2.0, note("A4"), 1.8),
    ]
    for bar, beat, midi, beats in melody:
        dur = beats * p.spb * 1.06
        p.flute(p.bt(bar, beat), midi, dur, gain=0.23, pan=0.14)

    # 5. lute doubling an octave below in the variation (adds body)
    for bar, beat, midi, beats in melody[12:]:
        p.pluck(p.bt(bar, beat), midi - 12, beats * p.spb, gain=0.10,
                pan=-0.18, tau=0.8, bright=0.4, sub=0.10)
        # and a celesta sparkle an octave above, kept very soft
        p.marimba(p.bt(bar, beat), midi + 12, beats * p.spb * 0.9,
                  gain=0.048, pan=0.30, hard=0.65)

    # 6. light percussion enters at bar 4
    for bar in range(4, MENU_BARS):
        for beat in (0.5, 1.5, 2.5, 3.5):
            p.shaker(p.bt(bar, beat), gain=0.072 if beat != 1.5 else 0.058,
                     pan=-0.1)
        p.drum(p.bt(bar, 0.0), "low", gain=0.15, pan=0.0)
        if bar >= 8:
            p.drum(p.bt(bar, 2.5), "mid", gain=0.085, pan=0.16)
    for beat, kind in ((3.25, "high"), (3.5, "mid"), (3.75, "high")):
        p.drum(p.bt(11, beat), kind, gain=0.07, pan=-0.2)

    # 7. celesta accents marking the phrases
    p.bell(p.bt(4, 0.0), note("A5"), 2.4, gain=0.045, pan=0.30)
    p.bell(p.bt(8, 0.0), note("D6"), 2.6, gain=0.042, pan=-0.28)
    p.bell(p.bt(11, 2.0), note("A5"), 1.8, gain=0.032, pan=0.30)

    # 8. nature: wind, leaves, distant birds, night insects
    add_wind(p.bl, p.br, p.total(), gain=0.026, seed_phase=0.4)
    add_rustle(p.bl, p.br, p.total(), count=7, gain=0.016)
    add_birds(p.bl, p.br, p.total(), count=5, gain=0.030)
    add_crickets(p.bl, p.br, p.total(), count=6, gain=0.0055)
    return p


# --------------------------------------------------------------------------- #
# composition: battle (D dorian, 132 BPM, 16 bars = 29.09 s)
# --------------------------------------------------------------------------- #

BATTLE_BPM = 132
BATTLE_BARS = 16
BATTLE_PROG = ["Dm", "Dm", "F", "G", "Dm", "Dm", "F", "G",
               "Am", "Am", "F", "G", "Dm", "Dm", "F", "G"]


def build_battle() -> Piece:
    p = Piece(BATTLE_BPM, BATTLE_BARS, tail=2.6)

    # 1. sustained harmonic glue (low level; keeps the loop continuous)
    for bar, ch in enumerate(BATTLE_PROG):
        t0 = p.bt(bar, 0.0)
        dur = 3.95 * p.spb
        for k, midi in enumerate(CHORDS[ch]):
            p.pad(t0, midi, dur, gain=0.035, pan=-0.40 + 0.40 * k,
                  attack=0.18, release=0.30)

    # 2. tribal drum kit
    for bar in range(BATTLE_BARS):
        p.drum(p.bt(bar, 0.0), "low", gain=0.48, pan=0.0)
        p.drum(p.bt(bar, 1.75), "low", gain=0.34, pan=-0.05)
        p.drum(p.bt(bar, 2.5), "low", gain=0.39, pan=0.05)
        p.drum(p.bt(bar, 1.0), "mid", gain=0.21, pan=0.18)
        p.drum(p.bt(bar, 3.0), "mid", gain=0.23, pan=0.18)
        for s in range(16):
            accent = 1.0 if s % 4 == 0 else (0.55 if s % 2 == 0 else 0.34)
            p.shaker(p.bt(bar, s * 0.25), gain=0.100 * accent,
                     pan=-0.28 if s % 2 else 0.28)
        if bar >= 2:
            for beat in (0.5, 1.5, 2.5, 3.5):
                p.drum(p.bt(bar, beat), "rim", gain=0.085, pan=-0.32)
        if bar in (7, 15):
            for s, (beat, kind) in enumerate(((3.0, "mid"), (3.25, "mid"),
                                              (3.5, "high"), (3.75, "high"))):
                p.drum(p.bt(bar, beat), kind, gain=0.16 + 0.035 * s,
                       pan=-0.24 + 0.16 * s)

    # 3. bass ostinato, 8ths with octave lift
    offsets = (0, 0, 12, 7, 0, 7, 12, 7)
    for bar, ch in enumerate(BATTLE_PROG):
        r = ROOTS[ch]
        for s, off in enumerate(offsets):
            p.bass(p.bt(bar, s * 0.5), r + off, 0.42 * p.spb,
                   gain=0.22 if s % 4 == 0 else 0.17, pan=0.0)

    # 4. plucked march figure (agile swarm), 16ths with stereo alternation
    steps = (0, 2, 1, 2, 0, 2, 3, 2, 0, 2, 1, 2, 0, 2, 3, 4)
    for bar in range(2, BATTLE_BARS):
        chord = CHORDS[BATTLE_PROG[bar]]
        for s, step in enumerate(steps):
            midi = chord_tone(chord, step) - 12
            gain = 0.070 * (1.0 if s % 4 == 0 else 0.68)
            p.pluck(p.bt(bar, s * 0.25), midi, 0.20, gain=gain,
                    pan=0.36 if s % 2 else -0.36, tau=0.28, bright=0.72,
                    sub=0.08)

    # 5. horn stabs (harmony + tribal-war signal)
    for bar in range(4, BATTLE_BARS):
        chord = CHORDS[BATTLE_PROG[bar]]
        for beat in (0.0, 2.5):
            for k, midi in enumerate(chord):
                p.horn(p.bt(bar, beat), midi, 0.46 * p.spb, gain=0.055,
                       pan=-0.35 + 0.35 * k, attack=0.05, release=0.18)

    # 6. flute call, two phrases
    melody = [
        (5, 0.0, note("A4"), 0.5), (5, 0.5, note("B4"), 0.5),
        (5, 1.0, note("C5"), 1.0), (5, 2.0, note("D5"), 1.5),
        (6, 0.0, note("E5"), 0.5), (6, 0.5, note("D5"), 0.5),
        (6, 1.0, note("C5"), 1.0), (6, 2.0, note("A4"), 1.5),
        (7, 0.0, note("G4"), 0.5), (7, 0.5, note("A4"), 0.5),
        (7, 1.0, note("B4"), 1.0), (7, 2.0, note("D5"), 1.5),
        (12, 0.0, note("D5"), 0.5), (12, 0.5, note("E5"), 0.5),
        (12, 1.0, note("F5"), 1.0), (12, 2.0, note("G5"), 1.5),
        (13, 0.0, note("F5"), 0.5), (13, 0.5, note("E5"), 0.5),
        (13, 1.0, note("D5"), 1.0), (13, 2.0, note("C5"), 1.5),
        (14, 0.0, note("C5"), 0.5), (14, 0.5, note("D5"), 0.5),
        (14, 1.0, note("F5"), 1.0), (14, 2.0, note("E5"), 1.5),
        (15, 0.0, note("D5"), 0.5), (15, 0.5, note("C5"), 0.5),
        (15, 1.0, note("B4"), 1.0), (15, 2.0, note("A4"), 1.0),
        (15, 3.0, note("G4"), 1.0),
    ]
    for bar, beat, midi, beats in melody:
        p.flute(p.bt(bar, beat), midi, beats * p.spb * 1.02,
                gain=0.19, pan=0.12)
    for bar, beat, midi, beats in melody[-9:]:
        p.horn(p.bt(bar, beat), midi - 12, beats * p.spb, gain=0.050,
               pan=-0.15, attack=0.05, release=0.16)
        p.marimba(p.bt(bar, beat), midi + 12, beats * p.spb * 0.9,
                  gain=0.052, pan=0.28, hard=0.7)

    # 7. marimba counter-line in the middle section
    for bar in (9, 10, 11, 12):
        chord = CHORDS[BATTLE_PROG[bar]]
        for s, beat in enumerate((0.5, 1.5, 2.5, 3.5)):
            midi = chord_tone(chord, 2 + s % 3)
            p.marimba(p.bt(bar, beat), midi, 0.26, gain=0.085,
                      pan=0.22 if s % 2 else -0.22, hard=0.55)

    # 8. ambience: dry wind over the field
    add_wind(p.bl, p.br, p.total(), gain=0.020, seed_phase=1.7)
    add_rustle(p.bl, p.br, p.total(), count=4, gain=0.012)
    return p


# --------------------------------------------------------------------------- #
# composition: victory / defeat cues
# --------------------------------------------------------------------------- #

def build_victory() -> Piece:
    p = Piece(120, 4, tail=1.9, loop=False)
    prog = ["D", "G", "A", "D"]

    for bar, ch in enumerate(prog):
        t0 = p.bt(bar, 0.0)
        dur = 3.9 * p.spb
        for k, midi in enumerate(CHORDS[ch]):
            p.horn(t0, midi, dur, gain=0.070, pan=-0.40 + 0.40 * k,
                   attack=0.10, release=0.35)
        p.bass(t0, ROOTS[ch], 2.0 * p.spb, gain=0.26)
        p.bass(p.bt(bar, 2.0), ROOTS[ch], 1.8 * p.spb, gain=0.20)

    fanfare = [
        (0, 0.0, note("D5"), 0.5), (0, 0.5, note("F#5"), 0.5),
        (0, 1.0, note("A5"), 1.0), (0, 2.0, note("A5"), 1.0),
        (0, 3.0, note("G5"), 1.0),
        (1, 0.0, note("G5"), 0.5), (1, 0.5, note("F#5"), 0.5),
        (1, 1.0, note("E5"), 1.0), (1, 2.0, note("D5"), 1.5),
        (2, 0.0, note("E5"), 0.5), (2, 0.5, note("F#5"), 0.5),
        (2, 1.0, note("A5"), 1.0), (2, 2.0, note("B5"), 1.0),
        (2, 3.0, note("A5"), 1.0),
        (3, 0.0, note("A5"), 1.0), (3, 1.0, note("F#5"), 1.0),
        (3, 2.0, note("D5"), 2.0),
    ]
    for bar, beat, midi, beats in fanfare:
        p.horn(p.bt(bar, beat), midi, beats * p.spb * 1.05, gain=0.20,
               pan=0.05, attack=0.03, release=0.12)
        p.marimba(p.bt(bar, beat), midi, 0.32, gain=0.075,
                  pan=-0.3 if beat == 0 else 0.3, hard=0.6)

    for s, step in enumerate((0, 2, 1, 3, 2, 4, 3, 5)):
        p.marimba(p.bt(2, s * 0.5), chord_tone(CHORDS["A"], step), 0.30,
                  gain=0.065, pan=0.3 if s % 2 else -0.3, hard=0.65)

    for bar in range(4):
        p.drum(p.bt(bar, 0.0), "low", gain=0.32)
        p.drum(p.bt(bar, 2.0), "low", gain=0.24)
        p.drum(p.bt(bar, 1.0), "mid", gain=0.17, pan=0.15)
        p.drum(p.bt(bar, 3.0), "mid", gain=0.18, pan=0.15)
        for beat in (0.5, 1.5, 2.5, 3.5):
            p.shaker(p.bt(bar, beat), gain=0.06, pan=-0.12)
    for beat, kind in ((2.0, "high"), (2.25, "high"), (2.5, "mid"), (2.75, "mid")):
        p.drum(p.bt(2, beat), kind, gain=0.13, pan=0.1)
    p.drum(p.bt(3, 0.0), "low", gain=0.36)

    p.bell(p.bt(3, 0.0), note("D6"), 3.0, gain=0.10, pan=0.0, tau=0.8)
    p.bell(p.bt(0, 0.0), note("A5"), 1.6, gain=0.05, pan=0.25)

    add_wind(p.bl, p.br, p.total(), gain=0.014, seed_phase=2.6)
    return p


def build_defeat() -> Piece:
    p = Piece(78, 3, tail=1.8, loop=False)
    prog = ["Dm", "Bb", "Gm"]

    for bar, ch in enumerate(prog):
        t0 = p.bt(bar, 0.0)
        dur = 3.9 * p.spb
        for k, midi in enumerate(CHORDS[ch]):
            p.pad(t0, midi, dur, gain=0.105, pan=-0.45 + 0.45 * k,
                  attack=0.55, release=1.2)
        p.pad(t0, ROOTS[ch] + 12, dur, gain=0.070, attack=0.7, release=1.3)
        p.bass(t0, ROOTS[ch], 3.0 * p.spb, gain=0.26)

    line = [
        (0, 0.0, note("A4"), 1.5), (0, 1.5, note("G4"), 0.5),
        (0, 2.0, note("F4"), 2.0),
        (1, 0.0, note("F4"), 1.5), (1, 1.5, note("D4"), 0.5),
        (1, 2.0, note("Bb3"), 2.0),
        (2, 0.0, note("D4"), 1.5), (2, 1.5, note("C4"), 0.5),
        (2, 2.0, note("Bb3"), 2.0),
    ]
    for bar, beat, midi, beats in line:
        p.flute(p.bt(bar, beat), midi, beats * p.spb * 1.1, gain=0.24,
                pan=-0.10)

    for bar, gain in ((0, 0.16), (1, 0.12), (2, 0.09)):
        p.drum(p.bt(bar, 0.0), "heart", gain=gain)
        p.drum(p.bt(bar, 2.0), "heart", gain=gain * 0.7)

    p.bell(p.bt(2, 3.0), note("D4"), 3.0, gain=0.09, pan=0.15, tau=0.9)
    add_wind(p.bl, p.br, p.total(), gain=0.016, seed_phase=4.1)
    return p


# --------------------------------------------------------------------------- #
# SFX (mono)
# --------------------------------------------------------------------------- #

def sfx_buffer(dur: float) -> array:
    return new_buf(int(dur * SR) + 1)


def build_sfx_hover() -> array:
    buf = sfx_buffer(0.13)
    add_mono(buf, 0.0, syn_pluck(midi_hz(note("E6")), 0.10, tau=0.20,
                                 bright=0.75, sub=0.0), 0.55)
    add_mono(buf, 0.004, syn_bell(midi_hz(note("B6")), 0.09, tau=0.09), 0.20)
    return buf


def build_sfx_click() -> array:
    buf = sfx_buffer(0.18)
    add_mono(buf, 0.0, syn_marimba(midi_hz(note("D5")), 0.14, hard=0.7), 0.90)
    add_mono(buf, 0.0, syn_drum("rim"), 0.30)
    add_mono(buf, 0.012, syn_bell(midi_hz(note("A5")), 0.12, tau=0.10), 0.22)
    return buf


def build_sfx_select() -> array:
    buf = sfx_buffer(0.46)
    add_mono(buf, 0.0, syn_bell(midi_hz(note("D5")), 0.40, tau=0.18), 0.62)
    add_mono(buf, 0.085, syn_bell(midi_hz(note("A5")), 0.33, tau=0.20), 0.50)
    add_mono(buf, 0.03, syn_marimba(midi_hz(note("D6")), 0.18, hard=0.4), 0.18)
    return buf


def build_sfx_dispatch() -> array:
    buf = sfx_buffer(0.86)
    add_mono(buf, 0.0, syn_noise_sweep(0.34, 460.0, 3200.0, shape=1.1), 0.55)
    add_mono(buf, 0.055, syn_pluck(midi_hz(note("D4")), 0.30, tau=0.30,
                                   bright=0.65, sub=0.25), 0.55)
    add_mono(buf, 0.16, syn_pluck(midi_hz(note("A4")), 0.26, tau=0.26,
                                  bright=0.7, sub=0.15), 0.35)
    add_mono(buf, 0.30, syn_drum("mid"), 0.22)
    return buf


def build_sfx_march() -> array:
    buf = sfx_buffer(1.12)
    # three footsteps in a 132 BPM feel, low + rim + a shaker scuff
    for i, t0 in enumerate((0.0, 0.226, 0.453)):
        add_mono(buf, t0, syn_drum("mid" if i % 2 else "low"),
                 0.42 if i % 2 == 0 else 0.30)
        add_mono(buf, t0 + 0.01, syn_shaker(0.13, tone=0.35), 0.28)
        add_mono(buf, t0 + 0.02, syn_pluck(midi_hz(note("D3")), 0.12, tau=0.18,
                                           bright=0.3, sub=0.0), 0.18)
    return buf


def build_sfx_impact() -> array:
    buf = sfx_buffer(0.78)
    add_mono(buf, 0.0, syn_drum("low"), 0.95)
    add_mono(buf, 0.0, syn_noise_sweep(0.26, 2600.0, 260.0, shape=0.65), 0.60)
    add_mono(buf, 0.0, syn_noise_sweep(0.16, 6200.0, 1400.0, shape=0.8), 0.50)
    add_mono(buf, 0.006, syn_pluck(midi_hz(note("D3")), 0.28, tau=0.22,
                                   bright=0.35, sub=0.35), 0.40)
    add_mono(buf, 0.02, syn_drum("rim"), 0.55)
    add_mono(buf, 0.03, syn_bell(midi_hz(note("D6")), 0.18, tau=0.10), 0.40)
    add_mono(buf, 0.09, syn_drum("heart"), 0.35)
    return buf


def build_sfx_capture() -> array:
    buf = sfx_buffer(1.06)
    for i, (t0, name) in enumerate(((0.0, "D5"), (0.10, "F5"), (0.20, "A5"),
                                    (0.30, "D6"))):
        add_mono(buf, t0, syn_bell(midi_hz(note(name)), 0.60 - 0.05 * i,
                                   tau=0.26), 0.52)
        add_mono(buf, t0, syn_marimba(midi_hz(note(name)) - 12, 0.22,
                                      hard=0.5), 0.22)
    add_mono(buf, 0.10, syn_shaker(0.50, tone=0.8), 0.10)
    return buf


def build_sfx_skill() -> array:
    buf = sfx_buffer(1.38)
    add_mono(buf, 0.0, syn_noise_sweep(0.85, 300.0, 5200.0, shape=2.0), 0.50)
    # rising harmonic swell
    ph = 0.0
    n = int(0.90 * SR)
    sig = [0.0] * n
    for i in range(n):
        u = i / (n - 1)
        f = midi_hz(note("D4")) * (2.0 ** (2.0 * u))
        ph += TAU * f / SR
        sig[i] = (math.sin(ph) + 0.4 * math.sin(2.0 * ph)
                  + 0.18 * math.sin(3.0 * ph)) * (u ** 2.0)
    add_mono(buf, 0.0, sig, 0.32)
    add_mono(buf, 0.62, syn_bell(midi_hz(note("D6")), 0.60, tau=0.35), 0.62)
    add_mono(buf, 0.68, syn_drum("low"), 0.55)
    add_mono(buf, 0.66, syn_marimba(midi_hz(note("A5")), 0.40, hard=0.8), 0.32)
    add_mono(buf, 0.72, syn_bell(midi_hz(note("A6")), 0.40, tau=0.28), 0.28)
    return buf


SFX_BUILDERS = {
    "hover": build_sfx_hover,
    "click": build_sfx_click,
    "select": build_sfx_select,
    "dispatch": build_sfx_dispatch,
    "march": build_sfx_march,
    "impact": build_sfx_impact,
    "capture": build_sfx_capture,
    "skill": build_sfx_skill,
}


# --------------------------------------------------------------------------- #
# mastering
# --------------------------------------------------------------------------- #

def fold_loop_tail(bl: array, br: array, loop_len_s: float, tail_s: float,
                   fade_head_s: float = 0.20) -> None:
    """Add the rendered tail back onto the head, then truncate to the loop."""
    L = int(loop_len_s * SR)
    T = min(int(tail_s * SR), max(0, len(bl) - L))
    fade_n = int(fade_head_s * SR)
    start_fade = max(0, T - fade_n)
    for i in range(T):
        g = 1.0
        if i > start_fade and fade_n > 0:
            g = (T - i) / fade_n
        bl[i] += bl[L + i] * g
        br[i] += br[L + i] * g
    del bl[L:]
    del br[L:]


def strip_dc(*bufs) -> list[float]:
    """Remove any DC offset from one or more buffers (in place)."""
    means = []
    for b in bufs:
        n = len(b)
        if n == 0:
            means.append(0.0)
            continue
        m = sum(b) / n
        for i in range(n):
            b[i] -= m
        means.append(m)
    return means


def soft_limit_normalize(bufs, target_peak_db: float,
                         knee: float = 0.70) -> tuple[float, float]:
    """Pre-scale to unity, soft-knee clip the loudest peaks, normalise.

    Returns (peak, rms) in linear units.
    """
    peak = 0.0
    for b in bufs:
        for v in b:
            a = -v if v < 0.0 else v
            if a > peak:
                peak = a
    if peak <= 1e-9:
        return 0.0, 0.0
    pre = 1.0 / peak
    span = 1.0 - knee
    new_peak = 0.0
    sq = 0.0
    count = 0
    for b in bufs:
        for i in range(len(b)):
            v = b[i] * pre
            a = -v if v < 0.0 else v
            if a > knee:
                v = (1.0 if v > 0.0 else -1.0) * (
                    knee + span * math.tanh((a - knee) / span))
                a = knee + span * math.tanh((a - knee) / span)
            b[i] = v
            if a > new_peak:
                new_peak = a
            sq += v * v
            count += 1
    rms = math.sqrt(sq / max(1, count))
    if new_peak <= 1e-9:
        return 0.0, 0.0
    scale = db_to_lin(target_peak_db) / new_peak
    for b in bufs:
        for i in range(len(b)):
            b[i] *= scale
    return new_peak * scale, rms * scale


def edge_fade_mono(buf: array, in_ms: float = 1.5, out_ms: float = 30.0) -> None:
    n = len(buf)
    a = min(n, max(1, int(in_ms * 0.001 * SR)))
    for i in range(a):
        buf[i] *= 0.5 - 0.5 * math.cos(math.pi * i / a)
    r = min(n, max(1, int(out_ms * 0.001 * SR)))
    for i in range(r):
        buf[n - 1 - i] *= 0.5 - 0.5 * math.cos(math.pi * i / r)


def edge_fade_stereo(bl: array, br: array, in_ms: float = 2.0,
                     out_ms: float = 2.0) -> None:
    n = len(bl)
    a = min(n, max(1, int(in_ms * 0.001 * SR)))
    for i in range(a):
        g = 0.5 - 0.5 * math.cos(math.pi * i / a)
        bl[i] *= g
        br[i] *= g
    r = min(n, max(1, int(out_ms * 0.001 * SR)))
    for i in range(r):
        g = 0.5 - 0.5 * math.cos(math.pi * i / r)
        bl[n - 1 - i] *= g
        br[n - 1 - i] *= g


def tail_fade(bl: array, br: array, seconds: float) -> None:
    n = len(bl)
    r = min(n, max(1, int(seconds * SR)))
    for i in range(r):
        g = 0.5 + 0.5 * math.cos(math.pi * i / r)
        bl[n - 1 - i] *= g
        br[n - 1 - i] *= g


# --------------------------------------------------------------------------- #
# WAV I/O
# --------------------------------------------------------------------------- #

def write_wav(path: str, channels, sr: int = SR, dither: bool = True) -> int:
    nch = len(channels)
    n = len(channels[0])
    data = array("h")

    def quant(v: float) -> int:
        # keep exact digital silence silent (loop edges must stay at 0)
        if v == 0.0:
            return 0
        s = v * 32767.0
        if dither:
            s += RNG.random() - RNG.random()
        # symmetric rounding (int() truncates toward zero and biases the mean)
        iv = int(s + 0.5) if s >= 0.0 else -int(0.5 - s)
        if iv > 32767:
            return 32767
        if iv < -32768:
            return -32768
        return iv

    app = data.append
    if nch == 2:
        a, b = channels
        for i in range(n):
            app(quant(a[i]))
            app(quant(b[i]))
    else:
        a = channels[0]
        for i in range(n):
            app(quant(a[i]))
    if sys.byteorder == "big":
        data.byteswap()
    with wave.open(path, "wb") as w:
        w.setnchannels(nch)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(data.tobytes())
    return os.path.getsize(path)


def read_wav(path: str):
    with wave.open(path, "rb") as w:
        nch = w.getnchannels()
        sw = w.getsampwidth()
        sr = w.getframerate()
        nfr = w.getnframes()
        raw = w.readframes(nfr)
    if sw != 2:
        raise ValueError(f"{path}: expected 16-bit PCM, got {sw * 8}-bit")
    data = array("h")
    data.frombytes(raw)
    if sys.byteorder == "big":
        data.byteswap()
    chans = [data[c::nch] for c in range(nch)]
    return sr, nch, nfr, chans, os.path.getsize(path)


def analyze_file(path: str) -> dict:
    sr, nch, nfr, chans, size = read_wav(path)
    peak = 0
    sq = 0.0
    clipped = 0
    total = 0
    for ch in chans:
        for v in ch:
            a = v if v >= 0 else -v
            if a > peak:
                peak = a
            if a >= 32767 or a <= -32768:
                clipped += 1
            sq += float(v) * v
            total += 1
    rms = math.sqrt(sq / max(1, total))
    dc = sum((sum(ch) / max(1, len(ch))) for ch in chans) / nch
    first = [int(ch[0]) for ch in chans]
    last = [int(ch[-1]) for ch in chans]
    seam = max(abs(last[i] - first[i]) for i in range(nch))
    win = min(nfr, int(0.10 * sr))
    head_rms = math.sqrt(sum(float(v) * v for ch in chans
                             for v in ch[:win]) / max(1, win * nch))
    tail_rms = math.sqrt(sum(float(v) * v for ch in chans
                             for v in ch[-win:]) / max(1, win * nch))
    # trailing/leading silence: amplitude always below -80 dBFS over a 50 ms window
    sil_n = min(nfr, int(0.05 * sr))
    head_silent = all(abs(v) < 33 for ch in chans for v in ch[:sil_n])
    tail_silent = all(abs(v) < 33 for ch in chans for v in ch[-sil_n:])
    return {
        "path": path,
        "file": os.path.basename(path),
        "bytes": size,
        "sample_rate": sr,
        "channels": nch,
        "bits": 16,
        "frames": nfr,
        "duration_s": round(nfr / sr, 3),
        "peak_dbfs": round(lin_to_db(peak / 32768.0), 3),
        "rms_dbfs": round(lin_to_db(rms / 32768.0), 3),
        "crest_db": round(lin_to_db(peak / max(1e-9, rms)), 3),
        "dc_lsb": round(dc, 3),
        "clipped_samples": clipped,
        "first_sample": first,
        "last_sample": last,
        "seam_delta": seam,
        "head_100ms_dbfs": round(lin_to_db(head_rms / 32768.0), 3),
        "tail_100ms_dbfs": round(lin_to_db(tail_rms / 32768.0), 3),
        "head_silent_50ms": head_silent,
        "tail_silent_50ms": tail_silent,
        "edge_zero": all(v == 0 for v in first + last),
    }


# --------------------------------------------------------------------------- #
# generation pipeline
# --------------------------------------------------------------------------- #

def master_loop(p: Piece, target_peak_db: float, wet: float,
                seam_ms: float = 2.0) -> tuple[float, float]:
    add_reverb(p.bl, p.br, wet=wet)
    fold_loop_tail(p.bl, p.br, p.loop_len, p.tail)
    master_eq((p.bl, p.br))
    strip_dc(p.bl, p.br)
    peak, rms = soft_limit_normalize((p.bl, p.br), target_peak_db)
    strip_dc(p.bl, p.br)
    edge_fade_stereo(p.bl, p.br, seam_ms, seam_ms)
    return lin_to_db(peak), lin_to_db(rms)


def master_one_shot(p: Piece, target_peak_db: float, wet: float,
                    fade_out_s: float) -> tuple[float, float]:
    add_reverb(p.bl, p.br, wet=wet)
    n = int((p.loop_len + p.tail) * SR)
    del p.bl[n:]
    del p.br[n:]
    master_eq((p.bl, p.br))
    strip_dc(p.bl, p.br)
    peak, rms = soft_limit_normalize((p.bl, p.br), target_peak_db)
    tail_fade(p.bl, p.br, fade_out_s)
    strip_dc(p.bl, p.br)
    edge_fade_stereo(p.bl, p.br, 5.0, 2.0)
    return lin_to_db(peak), lin_to_db(rms)


def master_sfx(buf: array, target_peak_db: float,
               fade_out_ms: float = 40.0) -> tuple[float, float]:
    strip_dc(buf)
    peak, rms = soft_limit_normalize((buf,), target_peak_db)
    edge_fade_mono(buf, 1.5, fade_out_ms)
    strip_dc(buf)
    edge_fade_mono(buf, 1.0, 1.0)
    return lin_to_db(peak), lin_to_db(rms)


def generate(out_dir: str, only: list[str] | None = None) -> list[dict]:
    os.makedirs(out_dir, exist_ok=True)
    wanted = (lambda k: True) if not only else (lambda k: k in only)
    results = []
    timings = {}

    music_specs = {
        "menu": (build_menu, -1.0, 0.24, True, 0.0),
        "battle": (build_battle, -1.0, 0.20, True, 0.0),
        "victory": (build_victory, -1.0, 0.24, False, 0.9),
        "defeat": (build_defeat, -1.0, 0.26, False, 1.4),
    }

    for key, (builder, peak_db, wet, loop, fade_out) in music_specs.items():
        if not wanted(key):
            continue
        t0 = time.perf_counter()
        piece = builder()
        if loop:
            pk, rm = master_loop(piece, peak_db, wet)
        else:
            pk, rm = master_one_shot(piece, peak_db, wet, fade_out)
        path = os.path.join(out_dir, MUSIC_FILES[key])
        size = write_wav(path, (piece.bl, piece.br))
        timings[key] = time.perf_counter() - t0
        print(f"  {MUSIC_FILES[key]:<20} {len(piece.bl) / SR:6.2f}s "
              f"{size / 1e6:5.2f} MB  peak {pk:6.2f} dB  rms {rm:6.2f} dB  "
              f"({timings[key]:.1f}s render)  voices={sum(piece.census.values())}")
        results.append({
            "key": key, "loop": loop, "census": piece.census,
            "render_s": round(timings[key], 2), "master_peak_dbfs": round(pk, 2),
            "master_rms_dbfs": round(rm, 2),
        })

    sfx_specs = {
        "hover": (-7.0, 25.0), "click": (-5.0, 30.0), "select": (-5.0, 90.0),
        "dispatch": (-4.0, 90.0), "march": (-5.0, 60.0),
        "impact": (-3.0, 80.0), "capture": (-4.0, 150.0),
        "skill": (-3.0, 220.0),
    }
    for key, (peak_db, fade_ms) in sfx_specs.items():
        if not wanted(key):
            continue
        t0 = time.perf_counter()
        buf = SFX_BUILDERS[key]()
        pk, rm = master_sfx(buf, peak_db, fade_ms)
        path = os.path.join(out_dir, SFX_FILES[key])
        size = write_wav(path, (buf,))
        timings[key] = time.perf_counter() - t0
        print(f"  {SFX_FILES[key]:<20} {len(buf) / SR:6.2f}s "
              f"{size / 1e3:5.1f} kB  peak {pk:6.2f} dB  rms {rm:6.2f} dB  "
              f"({timings[key]:.2f}s render)")
        results.append({
            "key": key, "loop": False, "census": {}, "render_s": round(timings[key], 2),
            "master_peak_dbfs": round(pk, 2), "master_rms_dbfs": round(rm, 2),
        })
    return results


def report(out_dir: str) -> list[dict]:
    rows = []
    seen = set()
    for name in list(MUSIC_FILES.values()) + list(SFX_FILES.values()):
        if name in seen:
            continue
        seen.add(name)
        path = os.path.join(out_dir, name)
        if not os.path.exists(path):
            continue
        info = analyze_file(path)
        info["loop"] = name.startswith("music-") and (
            "menu" in name or "battle" in name)
        rows.append(info)
    return rows


def print_report(rows: list[dict]) -> None:
    print(json.dumps(rows, indent=1))


def check_report(rows: list[dict]) -> int:
    failures = 0
    print("\nchecks")
    for r in rows:
        problems = []
        if r["clipped_samples"]:
            problems.append(f"{r['clipped_samples']} clipped samples")
        if r["peak_dbfs"] > -0.5:
            problems.append(f"peak {r['peak_dbfs']} dBFS too hot")
        if abs(r["dc_lsb"]) > 2.0:
            problems.append(f"dc {r['dc_lsb']} lsb")
        if r["loop"] and r["seam_delta"] > 0.02:
            problems.append(f"loop seam {r['seam_delta']}")
        if r["path"].endswith(("menu.wav", "battle.wav")) and r["duration_s"] < 24.0:
            problems.append(f"loop shorter than 24 s ({r['duration_s']} s)")
        if not r["edge_zero"]:
            problems.append("edge sample not zero")
        if problems:
            failures += 1
            print(f"  FAIL {r['file']}: " + ", ".join(problems))
        else:
            print(f"  ok   {r['file']}")
    return 1 if failures else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        description="Generate every Bug War WAV with the Python standard library.")
    ap.add_argument("--out", default=DEFAULT_OUT, help="output directory")
    ap.add_argument("--only", default="",
                    help="comma separated keys, e.g. menu,skill (default: all)")
    ap.add_argument("--seed", type=lambda s: int(s, 0), default=0x5EEDB06)
    ap.add_argument("--analyze-only", action="store_true")
    ap.add_argument("--no-analyze", action="store_true")
    ap.add_argument("--check", action="store_true",
                    help="exit non-zero when a measured check fails")
    args = ap.parse_args(argv)

    global RNG
    RNG = random.Random(args.seed)
    only = [s.strip() for s in args.only.split(",") if s.strip()]

    started = time.perf_counter()
    if not args.analyze_only:
        print(f"generating audio -> {args.out}")
        generate(args.out, only or None)
        print(f"generated in {time.perf_counter() - started:.1f}s")

    rows = report(args.out)
    if not args.no_analyze:
        print_report(rows)
    if args.check:
        return check_report(rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
