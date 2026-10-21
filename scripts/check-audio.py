"""Independent PCM asset acceptance checks; standard library only."""
from pathlib import Path
import array, json, math, wave
report = {}
for path in sorted(Path('public/audio').glob('*.wav')):
    with wave.open(str(path), 'rb') as wav:
        assert wav.getsampwidth() == 2, path
        channels, rate, frames = wav.getnchannels(), wav.getframerate(), wav.getnframes()
        samples = array.array('h', wav.readframes(frames))
    peak = max(abs(v) for v in samples) / 32768
    rms = math.sqrt(sum(v*v for v in samples) / len(samples)) / 32768
    clipped = sum(abs(v) >= 32760 for v in samples)
    duration = frames / rate
    seam = max(abs(samples[c] - samples[-channels+c]) for c in range(channels)) / 32768
    report[path.name] = {'seconds': round(duration, 3), 'channels': channels, 'sampleRate': rate, 'peak': round(peak, 6), 'rms': round(rms, 6), 'clippedSamples': clipped, 'endpointDifference': round(seam, 6)}
    assert 0.001 < rms < 0.5, (path, 'silence or excessive level')
    assert peak < 0.99 and clipped == 0, (path, 'clipping')
    assert duration > (24 if path.name in ['music-menu.wav', 'music-battle.wav'] else .025), path
    if path.name in ['music-menu.wav', 'music-battle.wav']:
        assert seam < .03, (path, 'loop discontinuity')
assert len(report) == 12, f'Expected 12 real assets, got {len(report)}'
Path('test-results').mkdir(exist_ok=True)
Path('test-results/audio-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
