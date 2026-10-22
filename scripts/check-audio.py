"""Independent standard-library SFX PCM / distributed score inventory checks.
Actual OGG/MP3 decode, sample alignment and full-mix checks: npm run test:score.
"""
from pathlib import Path
import array, hashlib, json, math, wave
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/audio'
report = {'sfx': {}, 'musicFiles': [], 'scope': 'PCM checks for unchanged SFX; exact hash/inventory/production metadata binding for compressed score. Browser acceptance decodes the music.'}
names = ['hover', 'click', 'select', 'dispatch', 'march', 'impact', 'capture', 'skill']
for name in names:
    path = OUT / f'sfx-{name}.wav'
    with wave.open(str(path), 'rb') as wav:
        assert wav.getsampwidth() == 2, path
        channels, rate, frames = wav.getnchannels(), wav.getframerate(), wav.getnframes()
        samples = array.array('h', wav.readframes(frames))
    peak = max(abs(v) for v in samples) / 32768
    rms = math.sqrt(sum(v*v for v in samples) / len(samples)) / 32768
    clipped = sum(abs(v) >= 32760 for v in samples)
    seam = max(abs(samples[c] - samples[-channels+c]) for c in range(channels)) / 32768
    report['sfx'][path.name] = dict(seconds=round(frames / rate, 6), channels=channels, sampleRate=rate,
        peak=round(peak, 6), rms=round(rms, 6), clippedSamples=clipped,
        endpointDifference=round(seam, 6), sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    assert rate == 44100 and channels == 1, path
    assert 0.001 < rms < 0.5 and peak < 0.99 and clipped == 0, path
    assert frames / rate > .025, path
assert len(list(OUT.glob('*.wav'))) == 8, 'Only the eight SFX PCM files are distributed; score masters are development artifacts.'
bases = ['music-menu', 'music-victory', 'music-defeat']
bases += [f'music-{cue}-{layer}' for cue in ['meadow', 'roots', 'marsh', 'amber', 'finale'] for layer in ['base', 'motion', 'power']]
expected = {f'{name}.{ext}' for name in bases for ext in ['ogg', 'mp3']}
actual = {p.name for p in OUT.glob('music-*')}
assert actual == expected, {'missing': sorted(expected - actual), 'unexpected': sorted(actual - expected)}
for name in sorted(expected):
    data = (OUT / name).read_bytes()
    assert len(data) > 20000, (name, 'empty or implausibly small cue')
    report['musicFiles'].append(dict(file=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest()))
assert (OUT / 'SCORE-LICENSES.txt').is_file(), 'Missing sample license notice'
manifest = json.loads((OUT / 'score-manifest.json').read_text(encoding='utf-8'))
assert manifest['renderer']['generatorSha256'] == hashlib.sha256((ROOT / 'scripts/generate-score.py').read_bytes()).hexdigest(), 'Generator differs from distributed manifest'
assert manifest['source']['commit'] == '440300901dfe9275fd84e0b7763af1f8443ae62e'
assert manifest['source']['treeSha'] == '0ecebcfca0c7e0fe501f71964027f8f59fa0e432'
assert hashlib.sha256((OUT / 'VSCO-CC0-LICENSE.txt').read_bytes()).hexdigest() == manifest['source']['licenseSha256']
manifest_files = {f['file']: f for cue in manifest['cues'].values() for f in cue['files']}
assert set(manifest_files) == expected
for row in report['musicFiles']:
    assert row['sha256'] == manifest_files[row['file']]['sha256'], row['file']
    assert row['bytes'] == manifest_files[row['file']]['bytes'], row['file']
for cue_id in ['victory', 'defeat']:
    cue = manifest['cues'][cue_id]
    melody = sorted((e for e in cue['events'] if e['role'] == 'melody'), key=lambda e: e['beat'])
    assert melody[-1]['midi'] == 50 and all(e['beat'] < 28 for e in cue['events']), cue_id
report['productionChecks'] = {'generatorHashMatches': True, 'allMusicHashesMatchManifest': True,
    'sourceCommitAndTreePinned': True, 'fullSourceLicenseHashMatches': True, 'bothEndingsActuallyResolveToTonic': True}
report['musicBytes'] = sum(row['bytes'] for row in report['musicFiles'])
report['passed'] = True
(ROOT / 'test-results').mkdir(exist_ok=True)
(ROOT / 'test-results/audio-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
print(json.dumps(report, indent=2))
