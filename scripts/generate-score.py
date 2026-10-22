"""Reproducible recorded-orchestra score. Python 3.12; see docs/score-production.md."""
from pathlib import Path
import sys, json, re, hashlib, urllib.request, urllib.parse, concurrent.futures, time, subprocess, math
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'test-results/score-tools'))
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
import imageio_ffmpeg
SR = 44100
SEED = 20260719
CACHE = ROOT/'test-results/orchestra-source'
OUT = ROOT/'public/audio'
MASTERS = ROOT/'test-results/score-masters'
REPO = 'sgossner/VSCO-2-CE'
SOURCE_COMMIT = '440300901dfe9275fd84e0b7763af1f8443ae62e'
SOURCE_TREE = '0ecebcfca0c7e0fe501f71964027f8f59fa0e432'
# Principal (1,1) modal bands, not the loudest overtone or a claimed missing fundamental.
# Several kettle recordings have a louder 3:2 upper mode. Measure each velocity/RR separately.
TIMPANI_BANDS = {1:(80,105), 2:(112,135), 3:(130,155), 4:(158,180), 5:(180,205)}
UNPITCHED = {'snare','cymbal','triangle','drum'}
FAMILIES = {
 'violin':'Strings/Violin Section/susVib', 'violin-short':'Strings/Violin Section/Spic',
 'viola':'Strings/Viola Section/susvib', 'cello':'Strings/Cello Section/susvib',
 'cello-short':'Strings/Cello Section/spic', 'bass':'Strings/Solo Contrabass/SusNV',
 'flute':'Woodwinds/Flute/susNV','oboe':'Woodwinds/Oboe/Sus',
 'clarinet':'Woodwinds/Clarinet/susLong','bassoon':'Woodwinds/Bassoon/sus',
 'horn':'Brass/F Horn/sus','trumpet':'Brass/Trumpet/sus','trombone':'Brass/Tenor Trombone/sus',
 'harp':'Strings/Harp','timpani':'Percussion/Timpani',
 'snare':'Percussion/Snare2-HitSN','cymbal':'Percussion/cymbal-crash1',
 'triangle':'Percussion/Triangle3-Hit_v','drum':'Percussion/BDrumNewhit',
}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def blob_sha(data): return hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
def fetch(url, path, expected_blob=None):
 if path.exists():
  if expected_blob is None or blob_sha(path.read_bytes())==expected_blob: return
  print('Rejecting corrupt/stale cache:',path,flush=True)
 path.parent.mkdir(parents=True, exist_ok=True)
 for attempt in range(5):
  try:
   data=urllib.request.urlopen(url, timeout=120).read()
   if expected_blob is not None and blob_sha(data)!=expected_blob:
    raise RuntimeError('Pinned Git blob mismatch: '+url)
   path.write_bytes(data); return
  except Exception:
   if attempt==4: raise
   time.sleep(2+attempt)
def sources():
 CACHE.mkdir(parents=True,exist_ok=True)
 pin=CACHE/('tree-'+SOURCE_TREE+'.json')
 fetch(f'https://api.github.com/repos/{REPO}/git/trees/{SOURCE_TREE}?recursive=1',pin)
 tree=json.loads(pin.read_text())
 if tree['sha']!=SOURCE_TREE or tree.get('truncated'): raise RuntimeError('Invalid pinned source tree')
 blobs={x['path']:x['sha'] for x in tree['tree'] if x['type']=='blob'}
 base=f'https://raw.githubusercontent.com/{REPO}/{SOURCE_COMMIT}/'
 fetch(base+'LICENSE',CACHE/'LICENSE',blobs['LICENSE'])
 fetch('https://versilian-studios.com/vsco-community/',CACHE/'official-community.html')
 license_text=(CACHE/'LICENSE').read_text()
 if 'CC0' not in license_text and 'Creative Commons' not in license_text: raise RuntimeError('Unrecognized license')
 selected={}
 for name, folder in FAMILIES.items():
  paths=[x['path'] for x in tree['tree'] if x['path'].lower().endswith('.wav') and (str(Path(x['path']).parent).replace('\\','/')==folder or (name in ['snare','cymbal','triangle','drum'] and x['path'].startswith(folder)))]
  # All multisamples / two velocity layers; retain round robins for shorts and percussion.
  if name not in ['harp','cymbal','triangle']:
   paths=[p for p in paths if re.search(r'_v[123]_',p) or re.search(r'_v[12]\.wav',p)]
  if not paths: raise RuntimeError(name+' no samples')
  selected[name]=paths
 allpaths=sorted(set(p for ps in selected.values() for p in ps))
 def download(p): fetch(base+urllib.parse.quote(p),CACHE/p,blobs[p])
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool: list(pool.map(download,allpaths))
 print('Downloaded/verified',len(allpaths),'recorded samples',flush=True)
 return selected,SOURCE_COMMIT

def modal_frequency(audio, band):
 # Window after the attack, before the release; zero-padding improves peak interpolation,
 # not physical frequency resolution. This is an objective modal reference, not a listening test.
 x=audio[round(.12*SR):round(.65*SR)].astype('float64')
 if len(x)<4096: raise RuntimeError('Timpani recording too short to calibrate')
 n=2**18; magnitude=np.abs(np.fft.rfft((x-x.mean())*np.hanning(len(x)),n))
 lo=max(1,math.ceil(band[0]*n/SR)); hi=min(len(magnitude)-2,math.floor(band[1]*n/SR))
 k=lo+int(np.argmax(magnitude[lo:hi+1])); y=np.log(magnitude[k-1:k+2]+1e-20)
 offset=.5*(y[0]-y[2])/(y[0]-2*y[1]+y[2])
 return (k+float(np.clip(offset,-.5,.5)))*SR/n
NOTE={'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}
def pitch(path):
 m=re.search(r'(?:_|^)([A-G])(#?)(-?\d)(?:_|\.)',Path(path).name)
 # VSCO filename convention: C3 = MIDI 60 (C4 scientific).
 return (int(m[3])+2)*12+NOTE[m[1]]+bool(m[2]) if m else 48
class Orchestra:
 def __init__(self, selected):
  self.bank={}; self.cache={}; self.timpani_calibration={}; self.timpani_renders={}
  for name,paths in selected.items():
   self.bank[name]=[]
   for path in paths:
    audio,sr=sf.read(CACHE/path,dtype='float32',always_2d=True)
    audio=audio.mean(axis=1)
    if sr!=SR: audio=resample_poly(audio,SR,sr).astype('float32')
    # Trim only digital/near digital silence; do not shave instrumental attacks.
    nz=np.flatnonzero(np.abs(audio)>0.00012)
    if len(nz): audio=audio[max(0,int(nz[0])-220):]
    v=re.search(r'_v(\d)',path); root=pitch(path)
    if name=='timpani':
     drum=int(re.search(r'Timpani(\d)',path)[1]); hz=modal_frequency(audio,TIMPANI_BANDS[drum])
     root=69+12*math.log2(hz/440)
     self.timpani_calibration[path]={'drum':drum,'principalModeHz':hz,'referenceMidi':root,'searchBandHz':list(TIMPANI_BANDS[drum])}
    self.bank[name].append((root, int(v[1]) if v else 2, audio,path))
 def note(self,name,note,duration,velocity,variant):
  bank=self.bank[name]; per=name in UNPITCHED
  targetv=1 if velocity<0.61 else 2 if name.startswith('violin') else 3
  nearest=min(abs(p-note) for p,v,a,s in bank) if not per else 0
  if name=='timpani':
   roots={drum:float(np.median([x[0] for x in bank if self.timpani_calibration[x[3]]['drum']==drum])) for drum in TIMPANI_BANDS}
   drum=min(roots,key=lambda d:abs(roots[d]-note))
   opts=[x for x in bank if self.timpani_calibration[x[3]]['drum']==drum]
  else: opts=[x for x in bank if per or abs(x[0]-note)==nearest]
  vd=min(abs(x[1]-targetv) for x in opts); opts=[x for x in opts if abs(x[1]-targetv)==vd]
  p,v,a,path=opts[variant%len(opts)]
  key=(path,note if not per else p,round(duration,2))
  if key not in self.cache:
   ratio=2**((note-p)/12) if not per else 1
   # Polyphase pitch conversion of recorded samples, not oscillator synthesis.
   ratioq=round(1000/ratio)
   x=resample_poly(a,ratioq,1000).astype('float32') if ratioq!=1000 else a.copy()
   sustain=name not in ['harp','violin-short','cello-short','timpani','snare','cymbal','triangle','drum']
   gate=max(400,int(duration*SR)); release=int((.32 if sustain else .12)*SR)
   if sustain and len(x)<gate+release:
    # Crossfaded sustain extension inside the recording, only for long notes.
    start=int(len(x)*.35); end=int(len(x)*.82); segment=x[start:end]
    cross=min(2205,len(segment)//4)
    while len(x)<gate+release and len(segment)>cross:
     x[-cross:]=x[-cross:]*np.linspace(1,0,cross)+segment[:cross]*np.linspace(0,1,cross)
     x=np.concatenate((x,segment[cross:]))
   if sustain:
    x=x[:gate+release].copy()
    attack=min(441,len(x)//8); x[:attack]*=np.linspace(0,1,attack)
    if len(x)>gate: x[gate:]*=np.linspace(1,0,len(x)-gate)**1.4
   else:
    x=x[:min(len(x),max(gate+release,int(.45*SR)))].copy()
    fade=min(2205,len(x)//5); x[-fade:]*=np.linspace(1,0,fade)
   # Fixed per-recording RMS calibration; velocity/dynamics remain in performance.
   rms=np.sqrt(np.mean(a*a)+1e-12)
   x*= min(5.0,.12/max(.015,float(rms)))
   if name=='timpani':
    target_hz=440*2**((note-69)/12); measured=modal_frequency(x,(target_hz*.94,target_hz*1.06))
    error=1200*math.log2(measured/target_hz)
    self.timpani_renders[key]={'source':path,'targetMidi':note,'sourceReferenceMidi':p,'shiftSemitones':note-p,'targetHz':target_hz,'renderedPrincipalModeHz':measured,'errorCents':error}
    if abs(error)>25: raise RuntimeError(f'Timpani modal tuning error {error:.1f} cents: {key}')
   self.cache[key]=x
  return self.cache[key]
# Separate eight-bar subjects, not a transposition of a common five-note loop.
THEMES={
 'menu':[[0,2,4,8],[7,4,2],[3,5,7,10],[9,7,5],[4,6,8,11],[10,8,6],[5,4,2,1],[2,4,1,0]],
 'meadow':[[4,7,9,8,7],[5,4,2],[0,2,4,7],[6,5,3],[2,4,6,9],[8,7,4],[5,3,2,1],[2,1,0]],
 'roots':[[0,4,3],[2,1,0,-2],[3,6,5],[4,2,1],[5,4,7,6],[3,2,0],[1,3,2,-1],[1,0]],
 'marsh':[[7,6,3,2],[4,3,1],[5,8,7,4],[3,2,0],[2,5,4,1],[0,-1,2],[3,1,-1,-2],[1,0]],
 'amber':[[0,4,7,6,4],[2,5,8,7],[9,8,5,3],[4,2,1],[5,7,10,9],[8,6,4],[3,5,2,1],[4,1,0]],
 'finale':[[0,2,4,8],[7,9,11,10],[8,7,5,4],[6,8,7],[9,11,12,9],[8,6,5],[4,2,5,1],[2,4,1,0]],
 'victory':[[0,2,4,8],[7,9,11],[10,8,7,5],[6,8,9],[11,10,8],[7,5,4],[2,1,0],[]],
 'defeat':[[4,3,0],[2,1,-1],[0,3,2],[1,-1,-3],[0,2,4],[3,1,0],[-1,0],[]],
}
# Modal degrees, expressed per two-bar harmonic unit. Development switches harmonic regions.
PROGRESS={
 'menu':[[0,5,3,4],[2,5,1,4],[5,2,3,4],[3,0,1,4],[0,3,5,4],[2,3,4,4]],
 'meadow':[[0,3,5,4],[0,1,3,4],[5,2,1,4],[3,0,5,4],[0,5,3,4],[1,3,4,4]],
 'roots':[[0,5,3,4],[0,2,5,4],[3,6,2,4],[5,3,1,4],[0,3,5,4],[2,5,4,4]],
 'marsh':[[0,3,6,4],[5,2,3,4],[2,5,1,4],[6,3,0,4],[0,5,3,4],[1,6,4,4]],
 'amber':[[0,5,1,4],[3,0,2,4],[5,1,6,4],[2,3,5,4],[0,3,1,4],[5,2,4,4]],
 'finale':[[0,3,5,4],[5,2,3,4],[1,5,6,4],[3,0,2,4],[0,5,3,4],[1,3,4,4]],
 'victory':[[0,3,4,0]],'defeat':[[0,5,4,0]],
}
PAN={'violin':-.4,'violin-short':-.37,'viola':-.12,'cello':.25,'cello-short':.24,'bass':.35,'flute':-.16,'oboe':.13,'clarinet':-.06,'bassoon':.2,'horn':-.25,'trumpet':.16,'trombone':.33,'harp':-.52,'timpani':.23,'snare':-.2,'cymbal':.3,'triangle':-.3,'drum':.02}
LEVEL={'violin':.34,'viola':.24,'cello':.32,'bass':.23,'flute':.36,'oboe':.33,'clarinet':.34,'bassoon':.3,'horn':.38,'trumpet':.27,'trombone':.27,'harp':.35,'violin-short':.28,'cello-short':.3,'timpani':.34,'snare':.19,'cymbal':.24,'triangle':.18,'drum':.25}
def compose(cue,bpm,bars,loop):
 rng=np.random.default_rng(SEED+list(THEMES).index(cue)*101)
 minor=cue in ['roots','marsh','defeat']; scale=[0,2,3,5,7,8,10] if minor else [0,2,4,5,7,9,11]
 tonic={'menu':50,'meadow':55,'roots':50,'marsh':57,'amber':53,'finale':50,'victory':50,'defeat':50}[cue]
 def degree(d): return tonic+12*(d//7)+scale[d%7]
 events=[]; single=cue in ['menu','victory','defeat']
 def add(layer,inst,beat,d,dur,vel=.6,octave=0,role='part'):
  if not loop and beat>=bars*4-5: return
  layer=0 if single else layer
  midi=degree(d)+octave
  if inst=='timpani':
   while midi>57: midi-=12
   while midi<38: midi+=12
  events.append({'stem':layer,'instrument':inst,'role':role,'beat':round(max(0,beat+rng.uniform(-.018,.018)),5),'midi':midi,'beats':round(dur*rng.uniform(.96,1.025),4),'velocity':round(vel*rng.uniform(.94,1.06),4),'variant':int(rng.integers(0,9999))})
 for bar in range(bars):
  section=bar//8; local=bar%8; beat=bar*4
  harmonic=PROGRESS[cue][min(section,len(PROGRESS[cue])-1)][local//2]
  dynamic=[.64,.72,.52,.67,.85,.68][section%6]
  if cue=='defeat': dynamic=.5-.025*bar
  if cue=='victory': dynamic=.8 if bar<5 else .58
  # Complete base: low strings, evolving inner voices and an audible melodic protagonist.
  for d,inst,octave,vel in [(harmonic,'cello',-12,.57),(harmonic,'bass',-24,.4),(harmonic+2,'viola',0,.44),(harmonic+4,'violin',0,.38)]:
   add(0,inst,beat,d,3.6,vel*dynamic/.7,octave)
  melody=THEMES[cue][local]
  if section==2: melody=[x-2 for x in reversed(melody)]
  if section==3: melody=[x+(2 if i%2==0 else -1) for i,x in enumerate(melody)]
  # Shared nest-lantern subject resurfaces in each region's recap, not in every bar.
  if section==4 and local<4: melody=THEMES['menu'][local]
  if section==5 and local>=6: melody=THEMES[cue][local]
  durations=([1.5,.5,1,1] if len(melody)==4 else [1,.5,.5,1,1] if len(melody)==5 else [1.5,1,1.5] if len(melody)==3 else [2,2] if len(melody)==2 else [4])
  lead={'menu':['oboe','violin','flute','clarinet','violin','oboe'],'meadow':['flute','violin','clarinet','flute','violin','oboe'],'roots':['cello','horn','bassoon','clarinet','violin','cello'],'marsh':['oboe','clarinet','flute','oboe','violin','clarinet'],'amber':['violin','oboe','clarinet','violin','flute','violin'],'finale':['horn','violin','oboe','violin','horn','violin'],'victory':['trumpet'],'defeat':['cello']}[cue]
  inst=lead[section%len(lead)]; t=0
  for i,d in enumerate(melody):
   dur=durations[i]; add(0,inst,beat+t,d,dur*.91,(.72 if inst!='cello' else .9)*dynamic/.7,12 if inst in ['flute','violin','oboe'] else 0,role='melody'); t+=dur
  # Breathing answering line, in contrary motion; never simply double the main melody.
  if local%2 and section!=2:
   for j,d in enumerate([harmonic+4,harmonic+3,harmonic+2]): add(0,'clarinet' if inst!='clarinet' else 'oboe',beat+1+j,d,.7,.36,0)
  if cue in ['menu','marsh','meadow','victory']:
   for j in range(4 if local%4 else 8): add(0,'harp',beat+j*.5,harmonic+[0,2,4,6,7,4,2,4][j],1.8,.42,12)
  # Independent rhythmic layer: region-specific patterns and orchestrated rests.
  if not single or cue=='menu':
   count=8 if cue in ['amber','finale'] else 6 if cue=='roots' else 4
   offsets=([0,.75,1.5,2,2.75,3.5] if count==6 else [j*4/count for j in range(count)])
   for j,pos in enumerate(offsets):
    d=harmonic+[0,4,2,4,7,4,2,4][j]
    add(1,'cello-short' if cue=='roots' else 'violin-short',beat+pos,d,.27 if count==8 else .4,.51*dynamic/.7,0 if cue=='roots' else 12)
   if local in [2,3,6,7]:
    for j in range(4): add(1,'harp',beat+j,harmonic+[0,4,7,9][j],1.3,.46,0)
   if cue in ['amber','finale'] and local%2:
    for pos in [1,3,3.5]: add(1,'snare',beat+pos,0,.3,.5)
   if cue in ['meadow','marsh','menu'] and local in [0,4]: add(1,'triangle',beat,0,2,.38)
  # Power adds chordal root/fifth/third brass support and tuned percussion, with rests.
  if not single or cue=='victory':
   if local in [0,1,4,5,6,7]:
    for j,d in enumerate([harmonic,harmonic+4,harmonic+2]):
     add(2,'horn',beat+[0,1.5,3][j],d,[1.3,1.3,.8][j],.66*dynamic/.7)
     if section in [1,4,5] or cue in ['finale','victory']:
      add(2,'trumpet',beat+[0,1.5,3][j],d+7,[1.2,1.2,.7][j],.49*dynamic/.7)
    add(2,'trombone',beat,harmonic,3.2,.5,-12)
   if local%2==0 or local==7:
    for pos,d in [(0,harmonic),(2,harmonic+4)]: add(2,'timpani',beat+pos,d,1.7,.55,-12)
   if local in [0,4] and section!=2: add(2,'cymbal',beat,0,4,.45)
   if local in [0,7] and section in [1,4]: add(2,'drum',beat,0,2,.6)
  # Endings sustain the tonic, then reserve over five beats for decay.
  if not loop and bar==6:
   for inst,d,octave in [('cello',0,-12),('viola',2,0),('violin',4,0),('horn',0,0)]: add(0,inst,beat, d,2,.5 if cue=='victory' else .28,octave)
 if not loop:
  last=max((e for e in events if e['role']=='melody'),key=lambda e:e['beat'])
  if last['midi']!=tonic: raise RuntimeError(cue+' lead does not resolve to the actual tonic')
  if any(e['beat']>=bars*4-4 for e in events): raise RuntimeError(cue+' has attacks in the final release bar')
 return events

def spatialize(dry,loop):
 # Shared deterministic early reflections + diffuse, decaying multitap room.
 wet=dry.copy(); n=len(dry)
 for delay,gain in [(0.031,.13),(.047,.11),(.073,.09),(.113,.08),(.173,.065),(.251,.053),(.367,.043),(.521,.032),(.733,.023),(1.019,.014),(1.411,.008),(1.877,.004)]:
  k=round(delay*SR)
  if loop: wet+=np.roll(dry[:,::-1],k,axis=0)*gain
  else: wet[k:]+=dry[:-k,::-1]*gain
 return wet

def contract():
 text=(ROOT/'src/audio/score.ts').read_text(encoding='utf8')
 result={}
 for cue in THEMES:
  if cue in ['menu','victory','defeat']:
   m=re.search(rf"{cue}: \{{.*?bpm: (\d+), beatsPerBar: (\d+), bars: (\d+), loop: (true|false)",text)
   if not m: raise RuntimeError('Contract parse '+cue)
   bpm,beats,bars=map(int,m.group(1,2,3)); loop=m[4]=='true'
  else:
   m=re.search(rf"{cue}: battle\('{cue}', '[^']+', (\d+)\)",text); bpm=int(m[1]); beats=4; bars=48;loop=True
  if beats!=4: raise RuntimeError('Only 4/4 score supported')
  result[cue]=(bpm,bars,loop)
 return result

def main():
 started=time.time(); selected,commit=sources(); orch=Orchestra(selected)
 OUT.mkdir(exist_ok=True,parents=True); MASTERS.mkdir(exist_ok=True,parents=True)
 ff=imageio_ffmpeg.get_ffmpeg_exe()
 manifest={'version':1,'seed':SEED,'sampleRate':SR,'source':{'repository':'https://github.com/'+REPO,'commit':commit,'treeSha':SOURCE_TREE,'verification':'Every cached or downloaded WAV and LICENSE checked against pinned Git blob SHA-1; SHA-256 recorded below','license':'CC0-1.0','official':'https://versilian-studios.com/vsco-community/','licenseSha256':sha(CACHE/'LICENSE'),'samples':[{'path':p,'sha256':sha(CACHE/p)} for p in sorted(set(p for ps in selected.values() for p in ps))]},'renderer':{'python':sys.version,'numpy':np.__version__,'soundfile':sf.__version__,'generatorSha256':sha(Path(__file__))},'cues':{}}
 for cue,(bpm,bars,loop) in contract().items():
  print('Rendering',cue,flush=True); t0=time.time(); n=round(bars*4*60/bpm*SR); single=cue in ['menu','victory','defeat']; stems=1 if single else 3
  orch.timpani_renders.clear()
  audio=[np.zeros((n,2),dtype='float32') for _ in range(stems)]
  events=compose(cue,bpm,bars,loop)
  for e in events:
   inst=e['instrument']; x=orch.note(inst,e['midi'],e['beats']*60/bpm,e['velocity'],e['variant'])
   start=round(e['beat']*60/bpm*SR); pan=PAN[inst]; gains=np.array([math.sqrt((1-pan)/2),math.sqrt((1+pan)/2)],dtype='float32')*LEVEL[inst]*e['velocity']
   target=audio[e['stem']]; length=min(len(x),n-start)
   if length>0: target[start:start+length]+=x[:length,None]*gains
   if loop and len(x)>length:
    tail=x[length:]; target[:min(len(tail),n)]+=tail[:n,None]*gains
  audio=[spatialize(a,loop) for a in audio]
  if not loop:
   fade=round(1.5*SR)
   for a in audio: a[-fade:]*=np.linspace(1,0,fade)[:,None]**1.6
  full=sum(audio)
  # Shared bus gain protects all intensity combinations, not separately normalized stems.
  envelope=sum(np.abs(a) for a in audio)
  conservative_peak=float(np.max(envelope)); tp=float(np.max(np.abs(resample_poly(full,4,1,axis=0))))
  gain=min(.77/max(conservative_peak,1e-9),.77/max(tp,1e-9))
  del envelope,full
  files=[]; decoded={'ogg':[], 'mp3':[]}
  for index,a in enumerate(audio):
   a*=gain
   name='music-'+cue+('' if single else '-'+['base','motion','power'][index])
   master=MASTERS/(name+'.wav'); sf.write(master,a,SR,subtype='PCM_24')
   for ext in ['ogg','mp3']:
    path=OUT/(name+'.'+ext)
    codec=['-c:a','libvorbis','-q:a','5'] if ext=='ogg' else ['-c:a','libmp3lame','-b:a','160k','-write_xing','1']
    subprocess.run([ff,'-y','-v','error','-i',str(master),*codec,'-map_metadata','-1',str(path)],check=True)
    # Decode with ffmpeg: MP3 priming/gapless trim must recover the exact master length.
    raw=subprocess.check_output([ff,'-v','error','-i',str(path),'-f','f32le','-acodec','pcm_f32le','-'])
    d=np.frombuffer(raw,dtype='<f4').reshape(-1,2)
    if len(d)!=n: raise RuntimeError(f'{path}: decoded {len(d)} != {n}')
    decoded[ext].append(d.copy())
    files.append({'file':path.name,'format':ext,'bytes':path.stat().st_size,'sha256':sha(path),'frames':n,'sampleRate':SR,'seconds':n/SR,'peak':float(np.max(np.abs(d))),'truePeak4x':float(np.max(np.abs(resample_poly(d,4,1,axis=0)))),'rms':float(np.sqrt(np.mean(d*d))),'boundaryJump':float(np.max(np.abs(d[0]-d[-1]))),'masterSha256':sha(master)})
  sums={}
  for fmt, layers in decoded.items():
   summed=sum(layers)
   jump=float(np.max(np.abs(summed[0]-summed[-1])))
   delta=np.abs(np.diff(summed,axis=0))
   sums[fmt]={'truePeak4x':float(np.max(np.abs(resample_poly(summed,4,1,axis=0)))), 'boundaryJump':jump, 'adjacentDelta99Percentile':float(np.quantile(delta,.99)), 'rms':float(np.sqrt(np.mean(summed*summed))), 'finalSecondRms':float(np.sqrt(np.mean(summed[-SR:]*summed[-SR:])))}
  articulation={}
  for inst in sorted(set(e['instrument'] for e in events)):
   notes=[e for e in events if e['instrument']==inst]
   percussion=inst in UNPITCHED
   articulation[inst]={'events':len(notes),'distinctPitches':len(set(e['midi'] for e in notes)), 'velocityRange':[min(e['velocity'] for e in notes),max(e['velocity'] for e in notes)], 'recordedSamplesAvailable':len(orch.bank[inst]), 'maximumNearestSampleShiftSemitones':0 if percussion else max(min(abs(p-e['midi']) for p,v,a,s in orch.bank[inst]) for e in notes)}
  if 'timpani' in articulation:
   articulation['timpani']['maximumRenderedSampleShiftSemitones']=max(abs(x['shiftSemitones']) for x in orch.timpani_renders.values())
   articulation['timpani']['maximumRenderedModalErrorCents']=max(abs(x['errorCents']) for x in orch.timpani_renders.values())
  last_melody=max((e for e in events if e['role']=='melody'),key=lambda e:e['beat'])
  ending=None if loop else {'lastMelodyMidi':last_melody['midi'],'tonicMidi':50,'lastMelodyBeat':last_melody['beat'],'lastAttackBeat':max(e['beat'] for e in events),'finalBarHasNoAttacks':all(e['beat']<28 for e in events)}
  manifest['cues'][cue]={'endingChecks':ending,'timpaniRenderedChecks':list(orch.timpani_renders.values()),'bpm':bpm,'beatsPerBar':4,'bars':bars,'loop':loop,'frames':n,'seconds':n/SR,'busGain':gain,'sumTruePeak4x':sums['ogg']['truePeak4x'],'decodedSumChecks':sums,'articulationChecks':articulation,'sections':[{'bars':[s*8+1,min(bars,(s+1)*8)],'role':role} for s,role in enumerate(['statement','answer / expanded orchestration','contrary-motion episode','sequential development','nest-lantern recapitulation','dominant return']) if s*8<bars],'files':files,'events':events,'eventCount':len(events),'instruments':sorted(set(e['instrument'] for e in events)),'renderSeconds':round(time.time()-t0,2)}
  print(cue,'done',round(time.time()-t0,1),'sec; sum peak',manifest['cues'][cue]['sumTruePeak4x'],flush=True)
  orch.cache.clear()
 manifest['source']['timpaniCalibration']={'method':'Hann-windowed 0.12–0.65 s principal (1,1) modal band peak with log-parabolic interpolation; not loudest upper mode, and not a subjective listening test','samples':orch.timpani_calibration}
 manifest['productionSeconds']=round(time.time()-started,2)
 manifest['distributionBytes']=sum(x['bytes'] for c in manifest['cues'].values() for x in c['files'])
 (OUT/'score-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
 for old in ['music-battle.ogg','music-menu.wav','music-battle.wav','music-victory.wav','music-defeat.wav']:
  (OUT/old).unlink(missing_ok=True)
 print('COMPLETE',manifest['productionSeconds'],'seconds',manifest['distributionBytes'],'bytes',flush=True)
if __name__=='__main__': main()
