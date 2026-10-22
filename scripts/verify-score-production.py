"""Development-only source, corrupt-cache and full-render reproduction audit.
Run generate-score.py once, then this script with --regenerate to create the
separate output used for comparison. Requires the documented score-tools.
No subjective listening or human-artistic certification is performed.
"""
from pathlib import Path
import datetime, hashlib, importlib.util, io, json, math, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'test-results/score-tools'))
import imageio_ffmpeg
sha=lambda data:hashlib.sha256(data).hexdigest()
m=json.loads((ROOT/'public/audio/score-manifest.json').read_text(encoding='utf8'))
cache=ROOT/'test-results/orchestra-source'
tree=json.loads((cache/('tree-'+m['source']['treeSha']+'.json')).read_text())
blobs={e['path']:e['sha'] for e in tree['tree'] if e['type']=='blob'}
spec=importlib.util.spec_from_file_location('verify_score_generator',ROOT/'scripts/generate-score.py')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
if '--regenerate' in sys.argv:
 s.OUT=ROOT/'test-results/repro-audio'
 s.MASTERS=ROOT/'test-results/repro-masters'
 s.main()
r=json.loads((ROOT/'test-results/repro-audio/score-manifest.json').read_text(encoding='utf8'))
assert set(m['cues'])==set(r['cues']) and len(m['source']['samples'])==437
assert m['source']['commit']==s.SOURCE_COMMIT and m['source']['treeSha']==s.SOURCE_TREE
assert sha((ROOT/'scripts/generate-score.py').read_bytes())==m['renderer']['generatorSha256']
source_bytes=0
for item in m['source']['samples']:
 data=(cache/item['path']).read_bytes();source_bytes+=len(data)
 assert sha(data)==item['sha256'],item['path']
 assert s.blob_sha(data)==blobs[item['path']],item['path']
assert sha((cache/'LICENSE').read_bytes())==m['source']['licenseSha256']
# Deliberately corrupt a disposable probe, never the actual source cache.
item=min(m['source']['samples'],key=lambda e:(cache/e['path']).stat().st_size)
probe=ROOT/'test-results/source-integrity-probe.wav';probe.write_bytes(b'INTENTIONAL CORRUPT CACHE')
url='https://raw.githubusercontent.com/sgossner/VSCO-2-CE/'+s.SOURCE_COMMIT+'/'+s.urllib.parse.quote(item['path'])
s.fetch(url,probe,blobs[item['path']]);assert sha(probe.read_bytes())==item['sha256']
original_open=s.urllib.request.urlopen;original_sleep=s.time.sleep
try:
 def no_network(*args,**kwargs):raise AssertionError('A valid cache must not download again')
 s.urllib.request.urlopen=no_network;s.fetch(url,probe,blobs[item['path']])
 probe.write_bytes(b'INTENTIONAL CORRUPT CACHE')
 s.urllib.request.urlopen=lambda *a,**k:io.BytesIO(b'INTENTIONAL WRONG DOWNLOAD')
 s.time.sleep=lambda _:None
 try:s.fetch(url,probe,blobs[item['path']]);raise AssertionError('Invalid source download was accepted')
 except RuntimeError as e:assert 'blob mismatch' in str(e)
finally:s.urllib.request.urlopen=original_open;s.time.sleep=original_sleep
probe.unlink()

def ogg_without_stream_identity(data):
 result=bytearray();at=0;pages=0
 while at<len(data):
  assert data[at:at+4]==b'OggS'
  segments=data[at+26];length=27+segments+sum(data[at+27:at+27+segments]);page=bytearray(data[at:at+length])
  # Only serial and its dependent page CRC. All granules, sequence, packets, and lacing remain.
  page[14:18]=b'\0'*4;page[22:26]=b'\0'*4;result.extend(page);at+=length;pages+=1
 assert at==len(data)
 return bytes(result),pages
ff=imageio_ffmpeg.get_ffmpeg_exe()
repro=[]
for cue_id,cue in m['cues'].items():
 other=r['cues'][cue_id]
 assert len(cue['files'])==len(other['files'])
 for f,g in zip(cue['files'],other['files']):
  assert f['file']==g['file'];name=f['file'];a=(ROOT/'public/audio'/name).read_bytes();b=(ROOT/'test-results/repro-audio'/name).read_bytes()
  assert sha(a)==f['sha256'] and sha(b)==g['sha256']
  assert f['masterSha256']==g['masterSha256']
  row={'file':name,'identicalWavMasterSHA256':True,'identicalContainerBytes':a==b}
  if name.endswith('.ogg'):
   aa,pages=ogg_without_stream_identity(a);bb,_=ogg_without_stream_identity(b)
   assert aa==bb,'Non-identity OGG content differs: '+name
   row.update(identicalExceptOggSerialAndCRC=True,pages=pages)
  else:assert a==b
  def pcm_digest(path):
   raw=subprocess.check_output([ff,'-v','error','-i',str(path),'-f','f32le','-acodec','pcm_f32le','-'])
   return sha(raw)
  a_pcm=pcm_digest(ROOT/'public/audio'/name);b_pcm=pcm_digest(ROOT/'test-results/repro-audio'/name)
  assert a_pcm==b_pcm;row.update(identicalDecodedPCM=True,decodedPCMSHA256=a_pcm);repro.append(row)
assert len(repro)==36
checks=[c['decodedSumChecks'][fmt] for c in m['cues'].values() for fmt in ['ogg','mp3']]
loop_checks={fmt:[c['decodedSumChecks'][fmt] for c in m['cues'].values() if c['loop']] for fmt in ['ogg','mp3']}
timp=[t for c in m['cues'].values() for t in c['timpaniRenderedChecks']]
report={
 'testedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Independent final asset/source integrity, actual cache rejection, musical-event cadence and deterministic render evidence. Not human listening.',
 'source':{'commit':s.SOURCE_COMMIT,'treeSha':s.SOURCE_TREE,'selectedWavCount':len(m['source']['samples']),'selectedWavBytes':source_bytes,'allSourceSHA256AndGitBlobSHA1Match':True,'licenseSHA256':m['source']['licenseSha256'],'officialPageCC0DeclarationPresent':'Licensed under CC0' in (cache/'official-community.html').read_text(encoding='utf8'),'corruptDisposableCacheRefetchedAndVerified':True,'validCacheAvoidsNetwork':True,'wrongDownloadedBlobRejected':True},
 'generatorSHA256':m['renderer']['generatorSha256'],'musicFiles':len(repro),'musicBytes':m['distributionBytes'],
 'maximumDecodedFullMixTruePeak4x':max(c['truePeak4x'] for c in checks),'maximumDecodedFullMixTruePeakDbFS':20*math.log10(max(c['truePeak4x'] for c in checks)),
 'loopEndpointDifference':{fmt:{'min':min(c['boundaryJump'] for c in cs),'max':max(c['boundaryJump'] for c in cs),'allLessThanLocalAdjacentDifference99Percentile':all(c['boundaryJump']<c['adjacentDelta99Percentile'] for c in cs)} for fmt,cs in loop_checks.items()},
 'endingChecks':{id:{**m['cues'][id]['endingChecks'],'finalSecondRMS':{fmt:m['cues'][id]['decodedSumChecks'][fmt]['finalSecondRms'] for fmt in ['ogg','mp3']}} for id in ['victory','defeat']},
 'timpani':{'calibratedSamples':len(m['source']['timpaniCalibration']['samples']),'renderedVariants':len(timp),'targetMidiRange':[min(t['targetMidi'] for t in timp),max(t['targetMidi'] for t in timp)],'maxPrincipalModalErrorCents':max(abs(t['errorCents']) for t in timp),'note':'Principal (1,1) modal band reference, not a perceptual pitch or human-audition certificate.'},
 'reproduction':{'productionSeconds':m['productionSeconds'],'separateOutputReproductionSeconds':r['productionSeconds'],'identicalWavMasters':18,'identicalDecodedMusicFiles':36,'identicalMP3Containers':18,'oggHasRandomSerialAndDependentCRC':True,'files':repro},
 'passed':True}
(ROOT/'docs/verification/score-production-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf8',newline='\n')
print(json.dumps({k:v for k,v in report.items() if k!='reproduction'},ensure_ascii=False,indent=2))
