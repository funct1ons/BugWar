// Independent, no-dependency acceptance for the 36 formal SVG assets.
//
// The browser contact sheet (scripts/art-preview.cjs) proves what Edge actually
// decodes and clips.  This suite checks the source contract that the raster
// sheet cannot: declared dimensions, self-contained markup, default aliases and
// that owner variants carry a substantial, genuinely different body colour.
//
// The project deliberately does not ship @types/node; Vitest resolves Node
// built-ins at runtime, so the two imports below are suppressed for tsc.
// @ts-ignore -- runtime Node built-in provided by Vitest
import { createHash } from 'node:crypto';
// @ts-ignore -- runtime Node built-in provided by Vitest
import fs from 'node:fs';
// @ts-ignore -- runtime Node built-in provided by Vitest
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const ART_DIR = path.resolve(env.BUGWAR_ART_DIR || 'public/art');
const IS_FORMAL_DIR = !env.BUGWAR_ART_DIR;
// The approved cover is promoted byte-for-byte; docs/design-previews is a
// temporary design workspace and is not a runtime/test dependency.
const APPROVED_COVER_SHA256 = '6abc652dedcea92021a66fa02f1fb1728ac30647a216eec9ec49f988d8e7942a';
const RACES = ['agile', 'fast', 'strong'] as const;
const OWNERS = [0, 1, 2, 3, 4] as const;
const OWNER_HEX = ['#92A18B', '#327FC1', '#C85F48', '#8B70BA', '#C49336'] as const;
const OWNER_NAMES = ['neutral', 'blue', 'red', 'purple', 'gold'] as const;

interface Expected { width: number; height: number; viewBox: string }
const EXPECTED: Record<string, Expected> = {};
const expectSize = (name: string, width: number, height: number) => {
  EXPECTED[name] = { width, height, viewBox: `0 0 ${width} ${height}` };
};

expectSize('cover.svg', 1600, 900);
for (const biome of ['meadow', 'roots', 'marsh', 'amber']) expectSize(`background-${biome}.svg`, 1600, 900);
for (const owner of OWNERS) {
  expectSize(`nest-${owner}.svg`, 160, 160);
  expectSize(`cannon-${owner}.svg`, 160, 160);
}
for (const race of RACES) for (const owner of OWNERS) expectSize(`bug-${race}-${owner}.svg`, 96, 32);
expectSize('nest.svg', 160, 160);
expectSize('cannon.svg', 160, 160);
for (const race of RACES) expectSize(`bug-${race}.svg`, 96, 32);
expectSize('emblem.svg', 256, 256);

const REQUIRED = Object.keys(EXPECTED);
const BUG_OWNER_FILES = RACES.flatMap(race => OWNERS.map(owner => `bug-${race}-${owner}.svg`));
const BUILDING_OWNER_FILES = OWNERS.flatMap(owner => [`nest-${owner}.svg`, `cannon-${owner}.svg`]);
const DEFAULT_PAIRS: Array<[string, string]> = [
  ['nest.svg', 'nest-0.svg'],
  ['cannon.svg', 'cannon-0.svg'],
  ...RACES.map(race => [`bug-${race}.svg`, `bug-${race}-1.svg`] as [string, string]),
];

const existing = fs.existsSync(ART_DIR)
  ? (fs.readdirSync(ART_DIR) as string[]).filter(file => file.toLowerCase().endsWith('.svg')).sort()
  : [];
const missing = REQUIRED.filter(file => !existing.includes(file));
const complete = missing.length === 0 && existing.length >= REQUIRED.length;

function read(name: string): string {
  return fs.readFileSync(path.join(ART_DIR, name), 'utf8') as string;
}

function attrsOf(svg: string): Record<string, string> {
  const tag = /<svg\b([^>]*)>/i.exec(svg)?.[1] ?? '';
  const attrs: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z_:][\w:.-]*)\s*=\s*["']([^"']*)["']/g)) attrs[match[1]] = match[2];
  return attrs;
}

function numeric(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value.replace(/px$/i, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function canonical(svg: string): string {
  return svg
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .trim();
}

interface RGB { r: number; g: number; b: number }
interface Lab { L: number; a: number; b: number }
interface ColorEntry { rgb: RGB; lab: Lab; luma: number; chroma: number; weight: number }

function parseColor(input: string): RGB | null {
  let value = input.trim().toLowerCase();
  if (!value || value === 'none' || value === 'transparent' || value === 'currentcolor' || value.startsWith('url(')) return null;
  const short = /^#([0-9a-f]{3,4})$/.exec(value);
  if (short) {
    return {
      r: parseInt(short[1][0] + short[1][0], 16),
      g: parseInt(short[1][1] + short[1][1], 16),
      b: parseInt(short[1][2] + short[1][2], 16),
    };
  }
  const long = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(value);
  if (long) {
    const hex = long[1];
    return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16) };
  }
  const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
  if (rgb) {
    const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    if (parts.length === 3) {
      const channel = (part: string) => part.endsWith('%') ? Math.round(parseFloat(part) * 2.55) : parseFloat(part);
      const result = { r: channel(parts[0]), g: channel(parts[1]), b: channel(parts[2]) };
      if ([result.r, result.g, result.b].every(Number.isFinite)) return result;
    }
    return null;
  }
  const hsl = /^hsla?\(([^)]+)\)$/.exec(value);
  if (hsl) {
    const parts = hsl[1].split(/[\s,/]+/).filter(Boolean).slice(0, 3);
    if (parts.length === 3) {
      const hue = ((parseFloat(parts[0]) % 360) + 360) % 360 / 360;
      const saturation = parseFloat(parts[1]) / 100;
      const lightness = parseFloat(parts[2]) / 100;
      if (![hue, saturation, lightness].every(Number.isFinite)) return null;
      const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
      const p = 2 * lightness - q;
      const channel = (t: number) => {
        let value = t;
        if (value < 0) value += 1;
        if (value > 1) value -= 1;
        if (value < 1 / 6) return p + (q - p) * 6 * value;
        if (value < 1 / 2) return q;
        if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
        return p;
      };
      return {
        r: Math.round(channel(hue + 1 / 3) * 255),
        g: Math.round(channel(hue) * 255),
        b: Math.round(channel(hue - 1 / 3) * 255),
      };
    }
  }
  return null;
}

function rgbToLab(rgb: RGB): Lab {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const r = linear(rgb.r), g = linear(rgb.g), b = linear(rgb.b);
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
  const fx = f(x), fy = f(y), fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function colorCounts(svg: string): Map<string, { rgb: RGB; count: number }> {
  const counts = new Map<string, { rgb: RGB; count: number }>();
  const add = (raw: string) => {
    const rgb = parseColor(raw);
    if (!rgb) return;
    const key = `${rgb.r},${rgb.g},${rgb.b}`;
    const previous = counts.get(key);
    counts.set(key, { rgb, count: (previous?.count ?? 0) + 1 });
  };
  for (const match of svg.matchAll(/(?:fill|stroke|stop-color|flood-color|color)\s*=\s*["']([^"']+)["']/gi)) add(match[1]);
  for (const match of svg.matchAll(/(?:fill|stroke|stop-color|flood-color|color)\s*:\s*([^;"'}]+)/gi)) add(match[1]);
  return counts;
}

function colorEntries(svg: string): ColorEntry[] {
  return [...colorCounts(svg).values()]
    .map(({ rgb, count }) => {
      const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
      const chroma = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
      return { rgb, lab: rgbToLab(rgb), luma, chroma, weight: count * (0.25 + chroma / 255) };
    })
    // Near-white highlights and near-black joints are not ownership colour.
    .filter(entry => entry.chroma >= 8 && entry.luma > 0.04 && entry.luma < 0.94);
}

function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a.L - b.L, a.a - b.a, a.b - b.b);
}

function massNear(entries: ColorEntry[], target: Lab, radius = 30): number {
  return entries.reduce((sum, entry) => sum + (deltaE(entry.lab, target) <= radius ? entry.weight : 0), 0);
}

function fnv(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

const PALETTE_LAB = OWNER_HEX.map(hex => rgbToLab(parseColor(hex)!));

describe('formal art set', () => {
  it('ships all 36 formal SVG files', () => {
    expect(existing.length, `${ART_DIR} must contain at least 36 SVG files`).toBeGreaterThanOrEqual(36);
    expect(missing, `missing formal SVG files (${missing.length}/36): ${missing.join(', ')}`).toEqual([]);
  });

  (IS_FORMAL_DIR ? it : it.skip)('cover.svg is the approved cover, byte-for-byte', () => {
    const bytes = fs.readFileSync(path.join(ART_DIR, 'cover.svg'));
    const hash = createHash('sha256').update(bytes).digest('hex');
    expect(hash, 'cover.svg must be promoted from the approved source without re-encoding or edits').toBe(APPROVED_COVER_SHA256);
  });
});

// Missing assets are already a hard failure above; skip the detailed checks so
// integration output stays readable until the generator has produced the set.
const deep = complete ? describe : describe.skip;

deep('formal SVG dimensions and viewBox', () => {
  it.each(REQUIRED)('%s', name => {
    const attrs = attrsOf(read(name));
    const expected = EXPECTED[name];
    expect(numeric(attrs.width), `${name} width attribute`).toBe(expected.width);
    expect(numeric(attrs.height), `${name} height attribute`).toBe(expected.height);
    const viewBox = (attrs.viewBox ?? '').split(/[\s,]+/).filter(Boolean).map(Number).join(' ');
    expect(viewBox, `${name} viewBox`).toBe(expected.viewBox);
  });

  it.each([...RACES.flatMap(race => OWNERS.map(owner => [`bug-${race}-${owner}.svg`, 96, 32] as const))])(
    '%s is a 96x32 four-frame sheet',
    (name, width, height) => {
      const attrs = attrsOf(read(name));
      expect(numeric(attrs.width)).toBe(width);
      expect(numeric(attrs.height)).toBe(height);
      expect(width / 4).toBe(24);
      expect(attrs.viewBox?.replace(/,/g, ' ').replace(/\s+/g, ' ').trim()).toBe('0 0 96 32');
    },
  );
});

deep('formal SVG markup is self-contained', () => {
  const forbidden: Array<[RegExp, string]> = [
    [/<script\b/i, '<script>'],
    [/<foreignObject\b/i, '<foreignObject>'],
    [/<metadata\b/i, '<metadata>'],
    [/<iframe\b/i, '<iframe>'],
    [/<object\b/i, '<object>'],
    [/<embed\b/i, '<embed>'],
    [/<link\b/i, '<link>'],
    [/@import\b/i, '@import'],
    [/<\?xml-stylesheet\b/i, 'xml-stylesheet'],
    [/<!DOCTYPE[^>]*SYSTEM/i, 'external DOCTYPE'],
    [/(?:xlink:)?href\s*=\s*["']\s*(?:https?:|\/\/|file:|ftp:)/i, 'external href'],
    [/\bsrc\s*=\s*["']\s*(?:https?:|\/\/|file:|ftp:)/i, 'external src'],
    [/url\(\s*["']?\s*(?:https?:|\/\/|file:|ftp:)/i, 'external url()'],
    [/javascript:/i, 'javascript: URL'],
    [/\son[a-z]+\s*=/i, 'inline event handler'],
  ];

  it.each(existing)('%s', name => {
    const svg = read(name);
    expect(svg, `${name} root element`).toMatch(/<svg\b/i);
    expect(svg, `${name} closing element`).toMatch(/<\/svg>/i);
    const found = forbidden.filter(([pattern]) => pattern.test(svg)).map(([, label]) => label);
    expect(found, `${name} must not contain external or executable content`).toEqual([]);
    const images = [...svg.matchAll(/<image\b[^>]*>/gi)].map(match => match[0]).filter(tag => !/(?:xlink:)?href\s*=\s*["']\s*data:/i.test(tag));
    expect(images, `${name} must not contain non-embedded raster images`).toEqual([]);
  });
});

deep('default UI SVG files match the documented owner variant', () => {
  it.each(DEFAULT_PAIRS)('%s equals %s', (defaultFile, ownerFile) => {
    expect(canonical(read(defaultFile)), `${defaultFile} is the compatibility alias of ${ownerFile}`)
      .toBe(canonical(read(ownerFile)));
  });
});

deep('owner variants carry a substantial, distinct body colour', () => {
  const families: Array<{ label: string; files: string[] }> = [
    { label: 'nest', files: OWNERS.map(owner => `nest-${owner}.svg`) },
    { label: 'cannon', files: OWNERS.map(owner => `cannon-${owner}.svg`) },
    ...RACES.map(race => ({ label: `bug-${race}`, files: OWNERS.map(owner => `bug-${race}-${owner}.svg`) })),
  ];

  for (const family of families) {
    it(`${family.label} uses five visibly different owner colours`, () => {
      const variants = family.files.map((file, owner) => {
        const svg = read(file);
        const entries = colorEntries(svg);
        expect(entries.length, `${file} has no chromatic colour literals`).toBeGreaterThan(0);
        const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
        const masses = PALETTE_LAB.map(target => massNear(entries, target) / total);
        const massSum = masses.reduce((sum, mass) => sum + mass, 0) || 1;
        const histogram = masses.map(mass => mass / massSum);
        return { owner, file, masses, histogram, hash: fnv(canonical(svg)) };
      });

      for (const variant of variants) {
        const own = variant.masses[variant.owner];
        const otherMax = Math.max(...variants.filter(other => other.owner !== variant.owner).map(other => other.masses[variant.owner]));
        const matrix = variants.map(other => `${other.owner}:${other.masses.map(mass => (mass * 100).toFixed(1)).join('/')}`).join(' ');
        const detail = `${variant.file}: expected ${OWNER_NAMES[variant.owner]} (${OWNER_HEX[variant.owner]}) mass=${(own * 100).toFixed(1)}%; ` +
          `max sibling=${(otherMax * 100).toFixed(1)}%; matrix(owner -> 0/1/2/3/4)=${matrix}`;
        // Not a mere "palette hex appears somewhere" check.  The owner colour
        // must be a meaningful share of the actual chromatic colour mass AND
        // measurably stronger than in every sibling variant.  Shared garden
        // greens/wood are allowed; they are why an absolute-dominance test
        // would be wrong.
        expect(own, detail).toBeGreaterThanOrEqual(0.04);
        expect(own - otherMax, detail).toBeGreaterThanOrEqual(0.025);
      }

      expect(new Set(variants.map(variant => variant.hash)).size, 'owner files must not be copies').toBe(variants.length);
      for (let left = 0; left < variants.length; left++) {
        for (let right = left + 1; right < variants.length; right++) {
          // Palette-share L1 distance is intentionally used instead of a mean
          // Lab distance: shared garden greens/wood dominate the mean and would
          // hide a real owner-colour swap.  Copies produce zero distance.
          const distance = variants[left].histogram.reduce((sum, value, index) => sum + Math.abs(value - variants[right].histogram[index]), 0);
          expect(distance, `${variants[left].file} vs ${variants[right].file} palette-share distance`).toBeGreaterThanOrEqual(0.08);
        }
      }
    });
  }
});

deep('sunlit full-scene SVGs are not dark night art', () => {
  const scenes = ['cover.svg', 'background-meadow.svg', 'background-roots.svg', 'background-marsh.svg', 'background-amber.svg'];
  it.each(scenes)('%s keeps a bright overall palette', name => {
    const counts = colorCounts(read(name));
    expect(counts.size, `${name} has no colour literals`).toBeGreaterThan(0);
    let total = 0, luminance = 0, dark = 0;
    for (const { rgb, count } of counts.values()) {
      const chroma = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
      const weight = count * (0.2 + chroma / 255);
      const luma = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
      total += weight;
      luminance += luma * weight;
      if (luma < 0.12) dark += weight;
    }
    const mean = luminance / total;
    const darkShare = dark / total;
    // Loose coarse guard, deliberately not a per-pixel art-quality threshold:
    // the approved sunlit scenes must not regress to the old dark night style.
    expect(mean, `${name} mean luminance ${mean.toFixed(3)}; dark share ${darkShare.toFixed(3)}`).toBeGreaterThan(0.35);
    expect(darkShare, `${name} dark share ${darkShare.toFixed(3)}`).toBeLessThan(0.4);
  });
});

deep('scene palette exports stay available to the rest of the game', () => {
  it('exports the five owner HEX and numeric COLORS entries in owner order', () => {
    const source = fs.readFileSync(path.resolve('src/game/BattleScene.ts'), 'utf8') as string;
    const hexBody = /export\s+const\s+HEX\s*(?::[^=]+)?=\s*\[([\s\S]*?)\]/.exec(source)?.[1];
    const colorBody = /export\s+const\s+COLORS\s*(?::[^=]+)?=\s*\[([\s\S]*?)\]/.exec(source)?.[1];
    expect(hexBody, 'BattleScene must still export HEX').toBeTruthy();
    expect(colorBody, 'BattleScene must still export COLORS').toBeTruthy();
    const hexes = [...hexBody!.matchAll(/['"](#[0-9a-f]{6})['"]/gi)].map(match => match[1].toUpperCase());
    const colors = [...colorBody!.matchAll(/0x([0-9a-f]{6})/gi)].map(match => parseInt(match[1], 16));
    expect(hexes).toEqual(OWNER_HEX.map(hex => hex.toUpperCase()));
    expect(colors).toEqual(OWNER_HEX.map(hex => parseInt(hex.slice(1), 16)));
  });
});
