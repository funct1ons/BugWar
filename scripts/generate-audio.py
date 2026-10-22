"""Legacy synthesized score + source of the unchanged eight SFX, CC0.
This historical generator must NOT overwrite the current orchestral score.
python -m pip install --target test-results/audio-tools numpy soundfile
python scripts/generate-audio.py --output test-results/legacy-audio
Only copy the eight sfx-*.wav when intentionally regenerating SFX.
Current orchestral production: scripts/generate-score.py.
"""
from pathlib import Path
import argparse
import sys, json
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'test-results/audio-tools'))
import numpy as np
import soundfile as sf
SR = 44100
rng = np.random.default_rng(5192026)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT / 'public/audio')
OUT = parser.parse_args().output.resolve()
if OUT == (ROOT / 'public/audio').resolve() and (OUT / 'SCORE-LICENSES.txt').exists():
    raise SystemExit('Refusing to overwrite the orchestral score. Use --output test-results/legacy-audio for historical/SFX regeneration; current music uses generate-score.py.')
OUT.mkdir(parents=True, exist_ok=True)

def smooth_noise(n, width=80):
    return np.convolve(rng.normal(size=n), np.ones(width)/width, mode='same')

def voice(note, dur, kind):
    n = int(dur*SR); t = np.arange(n)/SR
    f = 440*2**((note-69)/12)
    phase = 2*np.pi*f*(t + .00035*np.sin(2*np.pi*4.7*t)*np.minimum(t, .6))
    if kind == 'pluck':
        # Dispersive nylon string modes, different losses and noisy finger contact.
        x = sum(np.sin(phase*k*np.sqrt(1+.00012*k*k)+rng.uniform(-.08,.08))*
                np.exp(-t*(1.5+.36*k))/k**1.65 for k in range(1,13))
        x += .16*smooth_noise(n, 12)*np.exp(-t*65)
        env = np.minimum(1,t/.005)*np.minimum(1,(dur-t)/.12)
    elif kind == 'flute':
        breath = smooth_noise(n, 24)
        x = (np.sin(phase)+.22*np.sin(2*phase+.08)+.065*np.sin(3*phase))
        x *= 1+.06*smooth_noise(n, 700)
        x += .35*breath + .07*breath*np.sin(phase)
        env = np.minimum(1,t/.22)**1.4*np.minimum(1,(dur-t)/.38)
        env *= .83+.17*np.sin(np.pi*t/dur)
    elif kind == 'wood':
        x = sum(np.sin(2*np.pi*f*k*t)*np.exp(-t*d)*a for k,d,a in [(1,24,1),(2.71,38,.3),(4.13,60,.12)])
        x += .16*smooth_noise(n, 7)*np.exp(-t*90)
        env = np.minimum(1,t/.002)*np.minimum(1,(dur-t)/.04)
    else:
        # Soft bow harmonics, slow independent attack, restrained rosin noise.
        x = sum(np.sin(phase*k + .06*np.sin(t*(k+.7)))/k**(1.8 if kind=='warm' else 1.45) for k in range(1,9))
        x += .055*smooth_noise(n, 35)
        env = np.sin(np.pi*np.minimum(1,t/dur))**.65
        env *= np.minimum(1,t/.65)*np.minimum(1,(dur-t)/.8)
    x *= env
    return x

def render(key, duration, loop):
    mix = np.zeros((int(duration*SR),2)); census = {}
    def add(at, note, dur, kind, gain, pan=0):
        x = voice(note,dur,kind)*gain
        i = int(at*SR); count = min(len(x),len(mix)-i)
        if count <= 0: return
        mix[i:i+count,0] += x[:count]*np.sqrt((1-pan)/2)
        mix[i:i+count,1] += x[:count]*np.sqrt((1+pan)/2)
        census[kind] = census.get(kind,0)+1
    # D-A-B-F#-E: open fifth, a step of light, then a gentle return.
    motif = [(0,62,1.15),(1.7,69,.95),(3.1,71,1.45),(5.3,66,1.1),(7.1,64,1.9)]
    if key in ('menu','battle'):
        phrase_starts = [2,17,33] if key=='menu' else [3,18,34]
        for p, at in enumerate(phrase_starts):
            for off,n,d in motif:
                if p==1: n +=  (-2 if key=='menu' else 5)
                add(at+off,n,d,'flute',.15 if p!=2 else .18,-.18)
            # Not block triads: isolated lower answers in the spaces between breaths.
            add(at+10,57 if p!=1 else 55,2.5,'pluck',.14,.32)
            add(at+12,62 if p!=1 else 60,2.1,'pluck',.10,.22)
        for at,n in [(0,38),(13,43),(28,35),(40,38)]:
            add(at,n,8,'bow',.08,-.15)
            if at>0: add(at+1, n+19,7,'warm',.043,.35)
        step = 1.65 if key=='battle' else 3.6
        for j,at in enumerate(np.arange(1,duration-2,step)):
            # Two-bar breathing gaps, no relentless ostinato.
            if j%8 in (5,6): continue
            add(at+rng.uniform(-.025,.025),[50,57,62,54][j%4],1.7,'pluck',.08 if key=='battle' else .06,.4)
            if key=='battle' and j%3==0: add(at+.3,45,.22,'wood',.045,-.4)
        if key=='menu':
            add(37,66,7,'warm',.055,.1)
    else:
        for off,n,d in motif:
            add(1+off,n if key=='victory' else n-12,d*1.2,'flute',.16,-.15)
            if key=='victory': add(1.3+off,n-12,2.4,'pluck',.10,.4)
        add(0,38,9,'bow',.11,-.25)
        add(4,57 if key=='victory' else 55,8,'warm',.07,.3)
        add(9,62 if key=='victory' else 50,4,'pluck',.13,.1)
        if key=='victory': add(8,66,6,'bow',.065,-.1)
    # Quiet leaf/water texture, smoothly modulated rather than discrete beeps.
    n = len(mix); t = np.arange(n)/SR
    for c in range(2):
        mix[:,c] += .007*smooth_noise(n,180)*( .5+.5*np.sin(t*.37+c))
    # Sparse early reflections + diffuse, dark decaying room taps.
    dry = mix.copy()
    for delay,g in [(.037,.09),(.071,.07),(.127,.06),(.211,.045),(.347,.033),(.563,.022),(.827,.014)]:
        shift=int(delay*SR)
        tap=np.roll(dry[:,::-1],shift,axis=0)*g
        if not loop: tap[:shift]=0
        mix += tap
    mix -= mix.mean(axis=0)
    mix *= 10**(-3/20)/np.max(np.abs(mix))
    # Very short seam ramps retain ambience without a long periodic silence.
    fade=int((.015 if loop else .08)*SR)
    mix[:fade] *= np.linspace(0,1,fade)[:,None]
    end=int((.015 if loop else 2.2)*SR)
    mix[-end:] *= np.linspace(1,0,end)[:,None]**1.5
    mix[0]=0; mix[-1]=0
    return mix,census

rows=[]
for key,duration,loop in [('menu',48,True),('battle',48,True),('victory',16,False),('defeat',16,False)]:
    audio,census=render(key,duration,loop)
    path=OUT/f'music-{key}.wav'
    sf.write(path,audio,SR,subtype='PCM_16')
    master,_=sf.read(path)
    ogg=path.with_suffix('.ogg')
    # Windows libvorbis encoder needs more stack than Python's main thread.
    import threading
    threading.stack_size(16*1024*1024)
    errors=[]
    def encode():
        try: sf.write(ogg,master,SR,format='OGG',subtype='VORBIS')
        except Exception as error: errors.append(error)
    worker=threading.Thread(target=encode); worker.start(); worker.join()
    if errors: raise errors[0]
    decoded,rate=sf.read(ogg)
    assert rate==SR and len(decoded)==len(master) and np.isfinite(decoded).all()
    rows.append(dict(track=key,seconds=duration,voices=census,wavBytes=path.stat().st_size,oggBytes=ogg.stat().st_size,peak=float(abs(master).max()),rms=float(np.sqrt(np.mean(master**2)))))
# Small tactile cues: wood/finger/string, never bells or pure sine beeps.
for key,dur,notes in [('hover',.13,[65]),('click',.18,[55]),('select',.46,[62,69]),('dispatch',.86,[50,57]),('march',1.12,[43,45,43]),('impact',.78,[36,42]),('capture',1.06,[62,69,71]),('skill',1.38,[50,57,62,64])]:
    x=np.zeros(int(dur*SR))
    for j,note in enumerate(notes):
        at=int(j*.13*SR); length=(len(x)-at)/SR
        part=voice(note,length,'wood' if key in ('hover','click','march','impact') else 'pluck')
        x[at:at+len(part)] += part
    x-=x.mean(); x*=.50/max(abs(x))
    f=min(300,len(x)//4); x[:f]*=np.linspace(0,1,f); x[-f:]*=np.linspace(1,0,f)
    x[0]=x[-1]=0
    sf.write(OUT/f'sfx-{key}.wav',x,SR,subtype='PCM_16')
(OUT/'score-manifest.json').write_text(json.dumps({'license':'CC0-1.0','seed':5192026,'music':rows},indent=2)+'\n')
print(json.dumps(rows,indent=2))
assert sum(r['oggBytes'] for r in rows)<3_000_000
