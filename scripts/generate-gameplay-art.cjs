#!/usr/bin/env node
// Deterministic generator for the brood race and the hatchery / wind buildings.
//
// Draws three families that must sit beside the existing Sunlit Garden set
// without looking like recolours of it:
//
//   hatchery-0..4.svg / hatchery.svg       160x160  petal cradle holding eggs
//   wind-0..4.svg / wind.svg               160x160  leaf-blade vane in a breeze
//   bug-brood-0..4.svg / bug-brood.svg     96x32    four 24x32 walk frames
//
// Ownership follows the shipped contract exactly: the same five faction HEX
// entries drive every gradient, `hatchery.svg` / `wind.svg` are the neutral
// (owner 0) alias and `bug-brood.svg` is the blue (owner 1) UI alias, matching
// nest/cannon and bug-agile/fast/strong.
//
// Only coordinates and gradients are emitted: no bitmap, no font, no external
// reference, no scripting. Running the script is idempotent - the same Node
// produces the same bytes - so recreation can be verified:
//
//   node scripts/generate-gameplay-art.cjs           # (re)write the 18 files
//   node scripts/generate-gameplay-art.cjs --check   # fail if disk drifted
//
// The existing nest/cannon/agile/fast/strong art is never read or rewritten.

const fs = require('node:fs');
const path = require('node:path');

const ART = path.resolve(__dirname, '..', 'public/art');

// The single ownership palette shared with src/game/BattleScene.ts, the SVG
// contract and docs/art-direction.md.  Index order is the owner id.
const OWNERS = ['#92A18B', '#327FC1', '#C85F48', '#8B70BA', '#C49336'];
const OWNER_NAMES = ['neutral', 'blue', 'red', 'purple', 'gold'];
const OWNER_COUNT = OWNERS.length;
const FRAMES = 4;
const CELL_W = 24;
const CELL_H = 32;

const BROOD_LABEL = 'Brood drone: four-frame walk cycle';
const HATCHERY_LABEL = 'Hatchery: petal cradle holding warm guarded eggs';
const WIND_LABEL = 'Wind vane: leaf blades turning in the garden breeze';

// ------------------------------------------------------------------ numbers

/** Compact, stable number formatting (ints plain, fractions to 3 decimals). */
function n(value) {
  if (!Number.isFinite(value)) throw new Error(`non-finite coordinate: ${value}`);
  if (Number.isInteger(value)) return String(value);
  const fixed = value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return fixed === '-0' ? '0' : fixed;
}

const clamp = value => Math.max(0, Math.min(255, Math.round(value)));

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function rgbToHex(rgb) {
  return '#' + rgb.map(channel => clamp(channel).toString(16).toUpperCase().padStart(2, '0')).join('');
}

function mix(a, b, t) {
  const left = hexToRgb(a);
  const right = hexToRgb(b);
  return rgbToHex(left.map((channel, index) => channel + (right[index] - channel) * t));
}

const light = (color, t) => mix(color, '#FFFFFF', t);
const shade = (color, t) => mix(color, '#233428', t);

/** Carapace / roof / vane tones for one owner, bright highlight to shadow. */
function ownerTone(index) {
  const color = OWNERS[index];
  return {
    base: color,
    hi: light(color, 0.58),
    light: light(color, 0.34),
    mid: light(color, 0.1),
    deep: shade(color, 0.3),
    ink: shade(color, 0.48),
    dark: shade(color, 0.62),
  };
}

// ----------------------------------------------------------------- elements

function P(d, fill = 'none', extra = '') {
  return `<path d="${d}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
}

function L(d, color, width, extra = '') {
  return P(d, 'none',
    `stroke="${color}" stroke-width="${n(width)}" stroke-linecap="round" ` +
    `stroke-linejoin="round"${extra ? ' ' + extra : ''}`);
}

function E(cx, cy, rx, ry, fill, extra = '') {
  return `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="${n(rx)}" ry="${n(ry)}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
}

function C(cx, cy, r, fill = 'none', extra = '') {
  return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="${fill}"${extra ? ' ' + extra : ''}/>`;
}

function stops(items) {
  return items.map(([offset, color, opacity]) =>
    `<stop offset="${n(offset)}" stop-color="${color}"` +
    `${opacity === undefined ? '' : ` stop-opacity="${n(opacity)}"`}/>`).join('');
}

function lin(id, items, x1 = 0, y1 = 0, x2 = 0.8, y2 = 1) {
  return `<linearGradient id="${id}" x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}">` +
    `${stops(items)}</linearGradient>`;
}

function rad(id, items, cx = 0.35, cy = 0.25, r = 0.9) {
  return `<radialGradient id="${id}" cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}">${stops(items)}</radialGradient>`;
}

function rrect(x, y, w, h, r) {
  const x2 = x + w;
  const y2 = y + h;
  return `M${n(x + r)} ${n(y)}Q${n(x)} ${n(y)} ${n(x)} ${n(y + r)}V${n(y2 - r)}` +
    `Q${n(x)} ${n(y2)} ${n(x + r)} ${n(y2)}H${n(x2 - r)}Q${n(x2)} ${n(y2)} ${n(x2)} ${n(y2 - r)}` +
    `V${n(y + r)}Q${n(x2)} ${n(y)} ${n(x2 - r)} ${n(y)}Z`;
}

/** Garden grass tuft, matching the shared blades used by nest/cannon. */
function grass(x, y, scale, color) {
  let blades = '';
  for (let index = 0; index < 5; index++) {
    const dx = -17 + index * 8.5;
    const height = -(42 + (index % 3) * 17);
    blades += `M${n(dx)} 0Q${n(dx * 1.15)} ${n(height * 0.55)} ${n(dx * 1.55)} ${n(height)}`;
  }
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(scale)})">${L(blades, color, 3.4)}</g>`;
}

/** A garden leaf used only as a small decorative flourish. */
const LEAF_D = 'M0 0C-6-7-20-17-24-33C-29-51-26-74-13-90C-7-98 0-102 5-102' +
  'C11-102 17-98 22-88C30-71 31-46 24-28C18-12 8-4 0 0Z';
const LEAF_SHADE = 'M0 0C8-4 18-12 24-28C31-46 30-71 22-88C17-98 11-102 5-102' +
  'C14-94 20-80 22-64C24-44 18-20 0 0Z';
const LEAF_MID = 'M0-2C-2-30 0-66 4-100';
const LEAF_VEIN = 'M-2-20Q-11-26-18-34M-3-38Q-13-44-20-54M-3-56Q-12-62-18-72' +
  'M2-24Q10-30 16-38M2-42Q9-48 16-58M2-60Q8-66 14-74';

function leaf(x, y, scale, angle, fill = 'url(#leaf)') {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)}) scale(${n(scale)})">` +
    P(LEAF_D, fill, 'stroke="#3F7057" stroke-width="1.6" stroke-linejoin="round"') +
    P(LEAF_SHADE, '#2F6047', 'opacity=".13"') +
    L(LEAF_MID, '#F3F8CE', 2.6, 'opacity=".8"') +
    L(LEAF_VEIN, '#F3F8CE', 1.3, 'opacity=".6"') +
    '</g>';
}

// -------------------------------------------------------------- shared defs

/** Stone, timber, copper, cavity and garden gradients shared by all buildings. */
function gardenDefs(ownStops) {
  return [
    rad('own', ownStops, 0.34, 0.2, 0.95),
    lin('wood', [[0, '#F1DEAF'], [0.42, '#CBB181'], [1, '#96815B']], 0, 0, 0.25, 1),
    lin('woodLit', [[0, '#F9EDC6'], [0.5, '#E2CB98'], [1, '#B69A6C']], 0, 0, 0.3, 1),
    lin('stone', [[0, '#FFF9E6'], [0.5, '#E9E2C7'], [1, '#C2C3A6']], 0, 0, 0.3, 1),
    lin('copper', [[0, '#FFF2C4'], [0.45, '#DABC7C'], [1, '#A2874F']], 0, 0, 0.3, 1),
    rad('cavity', [[0, '#9AAE94'], [0.42, '#4A6455'], [1, '#22332F']], 0.5, 0.22, 0.95),
    lin('leaf', [[0, '#EDF5B4'], [0.42, '#93C177'], [1, '#47875C']], 0, 0, 0.62, 1),
    lin('leaf2', [[0, '#F6F9C8'], [0.46, '#AFD48C'], [1, '#5E9A6C']], 0, 0, 0.58, 1),
    rad('dew', [[0, '#FFFFFF', 0.96], [0.42, '#E4F7F1', 0.5], [1, '#5E9C92', 0.82]], 0.32, 0.2, 0.95),
    rad('glow', [[0, '#FFF6D2', 0.85], [1, '#FFF0C2', 0]], 0.5, 0.5, 0.5),
    '<filter id="soft"><feGaussianBlur stdDeviation="3.6"/></filter>',
    '<filter id="blur"><feGaussianBlur stdDeviation="9"/></filter>',
  ];
}

// ----------------------------------------------------------------- hatchery
//
// Silhouette cue: a LOW, WIDE lotus bowl of five owner-coloured petals whose
// open cup is packed with pale eggs (one already cracking open).  The nest art
// is a tall closed seedpod with a door, the cannon is a tripod horn: at 32 px
// this reads as "eggs in a flower bowl" and cannot be confused with either.

const PETAL = 'M0 0C-12-13-22-33-19-51C-16-66-8-78 0-84C8-78 16-66 19-51C22-33 12-13 0 0Z';
const PETAL_MID = 'M0-7C-1-31 0-57 1-76';
const PETAL_RIBS = 'M-1-24Q-8-30-13-38M-1-42Q-9-48-15-57M-1-60Q-7-66-10-72' +
  'M1-28Q8-34 13-42M1-46Q8-52 14-60M1-62Q6-68 9-73';

function petal(x, y, angle, scale, fill, tone) {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)}) scale(${n(scale)})">` +
    P(PETAL, fill, `stroke="${tone.ink}" stroke-width="2" stroke-linejoin="round"`) +
    P('M0-4C-8-16-15-34-13-50C-11-64-5-75 0-80C-6-66-8-44-6-26C-5-16-3-8 0-4Z',
      '#FFFFFF', 'opacity=".14"') +
    L(PETAL_MID, tone.hi, 2.4, 'opacity=".55"') +
    L(PETAL_RIBS, tone.hi, 1.2, 'opacity=".4"') +
    '</g>';
}

function egg(x, y, rx, ry, angle, spots) {
  const parts = [
    E(0, 0, rx, ry, 'url(#egg)', 'stroke="#B99461" stroke-width="1"'),
    E(-rx * 0.3, -ry * 0.26, rx * 0.34, ry * 0.3, '#FFFFFF', 'opacity=".6"'),
  ];
  for (const [sx, sy, sr] of spots) parts.push(E(sx * rx, sy * ry, sr, sr * 1.15, '#D9BC8B', 'opacity=".55"'));
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})">${parts.join('')}</g>`;
}

function hatcheryArt(index) {
  const O = ownerTone(index);
  const defs = gardenDefs([[0, O.hi], [0.38, O.base], [0.82, O.deep], [1, O.ink]]);
  defs.push(lin('ownSoft', [[0, O.light], [0.55, O.base], [1, O.deep]], 0, 0, 0.5, 1));
  defs.push(rad('egg', [[0, '#FFFDF3'], [0.44, '#F8EAC6'], [0.8, '#E7CE9C'], [1, '#C4A06C']], 0.34, 0.22, 0.92));
  defs.push(lin('grub', [[0, '#FFF9E8'], [0.55, '#F2E0BC'], [1, '#DCC49A']], 0, 0, 0.4, 1));

  const b = [];
  // Ground shadow, stone step and the timber pedestal the bowl sits on.
  b.push('<g filter="url(#blur)" opacity=".34">');
  b.push(E(82, 149, 52, 9, '#82987A'));
  b.push(E(82, 145, 32, 5, '#63795D'));
  b.push('</g>');
  b.push(P('M26 143C40 134 120 134 136 143C143 149 118 155 81 155' +
    'C44 155 19 149 26 143Z', 'url(#stone)', 'stroke="#ACA98B" stroke-width="1.3"'));
  b.push(L('M34 141C54 133 112 133 130 141', '#FFFCF0', 2.2, 'opacity=".5"'));
  b.push(P('M57 139C63 131 101 131 107 139C111 146 96 150 82 150' +
    'C68 150 53 146 57 139Z', 'url(#wood)', 'stroke="#8F7A54" stroke-width="1.2"'));
  b.push(L('M62 136C70 132 94 132 102 136', '#F7E8BC', 2, 'opacity=".55"'));

  // Five petals: three rising behind the cup, two flaring to the sides.
  b.push(petal(82, 130, -42, 0.84, 'url(#ownSoft)', O));
  b.push(petal(82, 130, 42, 0.84, 'url(#ownSoft)', O));
  b.push(petal(82, 132, -80, 0.62, 'url(#ownSoft)', O));
  b.push(petal(82, 132, 80, 0.62, 'url(#ownSoft)', O));
  b.push(petal(82, 132, 0, 0.9, 'url(#own)', O));

  // Open cup: shadowed interior and the warm glow of a guarded clutch.
  b.push(E(82, 116, 33, 12, 'url(#cavity)'));
  b.push(E(82, 118, 26, 8, '#1E2C26', 'opacity=".45"'));
  b.push(E(82, 108, 30, 14, 'url(#glow)', 'opacity=".6"'));

  // The clutch: three whole eggs plus one hatching at the right.
  b.push(egg(65.5, 105.5, 8.4, 10.8, -13, [[-0.1, -0.25, 0.7], [0.25, 0.3, 0.6], [0.05, 0.62, 0.5]]));
  b.push(egg(80.5, 102, 9.2, 11.8, 2, [[0.15, -0.2, 0.8], [-0.25, 0.25, 0.6], [0.2, 0.55, 0.5]]));
  b.push(egg(94.5, 105.5, 7.8, 10.2, 14, [[-0.2, -0.15, 0.7], [0.2, 0.35, 0.6]]));
  // Cracked shell shard with the grub that just hatched out of it.
  b.push(P('M97.5 104.5C103 104.5 107.5 108 107.5 112.5C107.5 117 104 119.5 99.5 119.5' +
    'L101 116.8L98.5 117.2L99.4 114.4L96.8 114.2L97.7 111.5L95.5 110.8Z',
    'url(#egg)', 'stroke="#B99461" stroke-width="1" stroke-linejoin="round"'));
  b.push(P('M88 94.4C90.8 93.4 93.8 94.8 94.5 97.8C95.1 100.6 93.3 103.1 90.3 103.4' +
    'C87.5 103.6 85.4 101.5 85.4 98.7C85.4 96.4 86.4 95 88 94.4Z',
    'url(#grub)', 'stroke="#C4A878" stroke-width=".9"'));
  b.push(E(88.6, 98.2, 0.82, 1.02, '#2A3A32'));
  b.push(E(91.6, 98.4, 0.82, 1.02, '#2A3A32'));
  b.push(C(88.3, 97.8, 0.27, '#FFFFFF', 'opacity=".85"'));
  b.push(C(91.3, 98, 0.27, '#FFFFFF', 'opacity=".85"'));
  b.push(L('M88.8 100.6Q89.6 101.4 90.6 100.6', '#8A6A46', 0.55, 'opacity=".8"'));

  // Front lip of the bowl: the dominant ownership block, drawn over the eggs.
  b.push(P('M44 116C46 129 60 139 82 139C104 139 118 129 120 116' +
    'C113 127 99 131 82 131C65 131 51 127 44 116Z', 'url(#own)',
    `stroke="${O.ink}" stroke-width="1.5" stroke-linejoin="round"`));
  b.push(L('M47 118C55 128 68 132 82 132C96 132 109 128 117 118', O.hi, 1.7, 'opacity=".55"'));
  b.push(L('M60 133C68 137 76 138 82 138M104 133C96 137 88 138 82 138', O.deep, 1.1, 'opacity=".4"'));

  // Front petals flaring under the lip so the cradle still reads as petals.
  b.push(petal(82, 130, -122, 0.5, 'url(#ownSoft)', O));
  b.push(petal(82, 130, 122, 0.5, 'url(#ownSoft)', O));

  // Garden dressing: sprout, stones, grass, dew, warm sparks.
  b.push(leaf(46, 149, 0.22, -26, 'url(#leaf2)'));
  b.push(leaf(120, 147, 0.19, 22, 'url(#leaf)'));
  b.push(E(44, 150, 4, 2.3, 'url(#stone)', 'stroke="#ACA98B" stroke-width=".8"'));
  b.push(E(118, 151, 3.4, 2.1, 'url(#stone)', 'stroke="#ACA98B" stroke-width=".8"'));
  b.push(grass(58, 154, 0.28, '#87AC6C'));
  b.push(grass(104, 155, 0.26, '#87AC6C'));
  b.push(E(52, 82, 3.4, 4.2, 'url(#dew)'));
  b.push(C(50.9, 80.4, 1, '#FFFFFF', 'opacity=".9"'));
  b.push(E(111, 74, 2.6, 3.2, 'url(#dew)'));
  b.push(C(116, 96, 1.7, '#FFFCEF', 'opacity=".8"'));
  b.push(C(70, 88, 1.3, '#FFF6D2', 'opacity=".75"'));
  b.push(C(96, 118, 1.6, '#FFF7DA', 'opacity=".55"'));

  return { width: 160, height: 160, defs, body: b, label: HATCHERY_LABEL };
}

// --------------------------------------------------------------------- wind
//
// Silhouette cue: one tall mast carrying four owner-coloured leaf blades in a
// pinwheel, with cream swirl arcs crossing the frame.  The cannon is a low
// tripod with a horizontal horn, so mast-plus-pinwheel is unmistakable at 32 px.

const VANE = 'M0 0C-6-9-10-21-9.5-31C-9-41-5.5-50 0-56C5.5-50 9-41 9.5-31C10-21 6-9 0 0Z';
const VANE_MID = 'M0-6C-0.6-21 0-37 1-50';
const VANE_RIBS = 'M-0.6-16Q-5-21-7.4-27M-0.4-28Q-5-33-7.6-39M-0.2-40Q-4-45-5.8-49' +
  'M0.8-20Q5-25 7.4-31M0.8-32Q5-37 7.6-43M1-44Q4-48 5.4-51';

function vane(x, y, angle, fill, tone) {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(angle)})">` +
    P(VANE, fill, `stroke="${tone.ink}" stroke-width="1.4" stroke-linejoin="round"`) +
    P('M0-4C-5-12-7.5-23-7-33C-6.5-42-4-48 0-52C-5.5-38-6-24-3.5-14Z',
      '#FFFFFF', 'opacity=".18"') +
    L(VANE_MID, tone.hi, 1.4, 'opacity=".6"') +
    L(VANE_RIBS, tone.hi, 0.85, 'opacity=".42"') +
    '</g>';
}

function windArt(index) {
  const O = ownerTone(index);
  const defs = gardenDefs([[0, O.hi], [0.36, O.base], [0.8, O.deep], [1, O.ink]]);
  defs.push(lin('ownSoft', [[0, O.light], [0.55, O.mid], [1, O.deep]], 0, 0, 0.45, 1));

  const b = [];
  // Ground shadow and the stone footing that anchors the mast.
  b.push('<g filter="url(#blur)" opacity=".34">');
  b.push(E(84, 148, 50, 8.6, '#82987A'));
  b.push(E(84, 144, 30, 4.6, '#63795D'));
  b.push('</g>');
  b.push(P('M38 143C50 133 114 133 126 143C133 150 110 155 82 155' +
    'C54 155 31 150 38 143Z', 'url(#stone)', 'stroke="#ACA98B" stroke-width="1.3"'));
  b.push(L('M46 141C62 134 106 134 120 141', '#FFFCF0', 2.2, 'opacity=".5"'));
  b.push(P('M52 148H112L106 139H58Z', 'url(#stone)', 'stroke="#B4B396" stroke-width=".9" opacity=".8"'));

  // Wind flow is behind the mast so the blades read against it.  Each gust is
  // a wide pale underlay plus a bright core, which survives a 32 px downscale.
  const gust = (d, width) =>
    L(d, '#F4FADF', width * 2.4, 'opacity=".34"') + L(d, '#FBFFEC', width, 'opacity=".85"');
  b.push(gust('M16 100C32 78 52 66 74 60', 2.4));
  b.push(gust('M22 114C38 94 58 82 78 76', 1.8));
  b.push(gust('M132 42C120 56 108 64 94 68', 2));
  b.push(gust('M136 60C126 72 116 78 104 82', 1.4));
  b.push(gust('M30 52C30 42 40 36 48 40C55 43 55 53 47 55C41 56 38 50 42 47', 1.6));
  b.push(gust('M52 34C64 24 80 20 94 24', 1.8));

  // Timber foot, tapered mast, lit edge and grain.
  b.push(P('M68 141H96L99 131H65Z', 'url(#wood)', 'stroke="#8F7A54" stroke-width="1.2"'));
  b.push(L('M70 133H94', '#F7E8BC', 1.8, 'opacity=".55"'));
  b.push(P('M77 133L79.5 64H85.5L88 133Z', 'url(#wood)', 'stroke="#8F7A54" stroke-width="1.2"'));
  b.push(L('M80.4 70V129', '#F7E8BC', 1.5, 'opacity=".5"'));
  b.push(L('M83.4 74V127', '#A88E60', 0.8, 'opacity=".45"'));

  // Copper collar and hub; the four leaf blades turn around it.
  b.push(P(rrect(74.5, 61, 15, 6, 2.4), 'url(#copper)', 'stroke="#96824F" stroke-width=".9"'));
  b.push(P(rrect(72.5, 58.5, 19, 5, 2.2), 'url(#copper)', 'stroke="#8E7A4C" stroke-width=".9"'));
  b.push(vane(82, 61, 35, 'url(#own)', O));
  b.push(vane(82, 61, 125, 'url(#ownSoft)', O));
  b.push(vane(82, 61, 215, 'url(#own)', O));
  b.push(vane(82, 61, 305, 'url(#ownSoft)', O));
  b.push(C(82, 61, 7, 'none', 'stroke="#FFF5CE" stroke-width=".8" opacity=".5"'));
  b.push(C(82, 61, 4.6, 'url(#copper)', 'stroke="#8E7A4C" stroke-width="1"'));
  b.push(C(82, 61, 1.9, '#6E6444'));
  b.push(C(81.4, 60.4, 0.7, '#FFFCEF', 'opacity=".9"'));

  // Loose seeds and leaf flecks riding the same gust.
  b.push(C(96, 44, 1.3, '#FFFDF0', 'opacity=".8"'));
  b.push(C(112, 52, 1, '#FFFDF0', 'opacity=".65"'));
  b.push(C(30, 96, 1.1, '#FFFDF0', 'opacity=".6"'));

  // Leaves caught in the breeze plus grounded garden dressing.
  b.push(leaf(38, 86, 0.16, 28, 'url(#leaf2)'));
  b.push(leaf(118, 32, 0.14, -34, 'url(#leaf)'));
  b.push(leaf(112, 108, 0.13, 62, 'url(#leaf2)'));
  b.push(E(42, 150, 4, 2.3, 'url(#stone)', 'stroke="#ACA98B" stroke-width=".8"'));
  b.push(E(124, 151, 3.4, 2.1, 'url(#stone)', 'stroke="#ACA98B" stroke-width=".8"'));
  b.push(grass(60, 154, 0.28, '#87AC6C'));
  b.push(grass(102, 155, 0.26, '#87AC6C'));
  b.push(E(128, 128, 3.4, 4.2, 'url(#dew)'));
  b.push(C(126.9, 126.4, 1, '#FFFFFF', 'opacity=".9"'));
  b.push(C(48, 66, 1.5, '#FFFCEF', 'opacity=".8"'));
  b.push(C(120, 84, 1.2, '#FFFCEF', 'opacity=".7"'));

  return { width: 160, height: 160, defs, body: b, label: WIND_LABEL };
}

// -------------------------------------------------------------------- brood
//
// Silhouette cue: an egg-shaped abdomen split by two shells - a pale cracked
// cradle behind it and an owner-coloured scalloped dorsal plate over it - on a
// short six-legged garden insect with a round head and big friendly eyes.
// Agile is an ant with a petiole, fast is a slim lanceolate runner, strong is a
// wide beetle under elytra; the brood's shelled egg abdomen is its own read.

const BUG_INK = '#4A4030';
const JOINT = '#6B5B44';
const JOINT_LIGHT = '#C9B88F';

function bugLeg(ax, ay, kx, ky, tx, ty, width) {
  const d = `M${n(ax)} ${n(ay)}L${n(kx)} ${n(ky)}L${n(tx)} ${n(ty)}`;
  return L(d, BUG_INK, width + 0.38) + L(d, JOINT, width);
}

function broodDefs(index) {
  const O = ownerTone(index);
  const defs = [
    rad('own', [[0, O.hi], [0.34, O.light], [0.8, O.base], [1, O.deep]], 0.34, 0.24, 0.96),
    lin('shell', [[0, O.light], [1, O.deep]], 0, 0, 0.35, 1),
    lin('plate', [[0, O.mid], [0.55, O.base], [1, O.dark]], 0, 0, 0.4, 1),
    lin('cradle', [[0, '#FFFCF0'], [0.55, '#F7E7C4'], [1, '#DEC9A0']], 0, 0, 0.4, 1),
    rad('eye', [[0, '#4E655B'], [0.5, '#26362F'], [1, '#16211E']], 0.34, 0.24, 0.9),
  ];
  for (let frame = 0; frame < FRAMES; frame++) {
    defs.push(`<clipPath id="cell${frame}" clipPathUnits="userSpaceOnUse">` +
      `<rect x="0" y="0" width="${CELL_W}" height="${CELL_H}"/></clipPath>`);
  }
  return { O, defs };
}

function broodCell(frame, O) {
  const cell = [];
  const bob = Math.sin((frame / FRAMES) * Math.PI * 2) * 0.4;
  cell.push(E(12, 28.1, 6.4, 1.9, '#7E9670', 'opacity=".16"'));

  // Six jointed legs, alternating tripods per frame.
  for (const side of [-1, 1]) {
    for (let pair = 0; pair < 3; pair++) {
      const phase = Math.sin((frame / FRAMES + pair * 0.3 + (side < 0 ? 0 : 0.5)) * Math.PI * 2) * 1.1;
      const ax = 12 + side * 2.6;
      const ay = 13.4 + pair * 3.1;
      const kx = 12 + side * (5.6 + pair * 0.35);
      const ky = 11.2 + pair * 5.2 + phase;
      const tx = 12 + side * (8.4 + pair * 0.15);
      const ty = 9.4 + pair * 7.4 - phase * 0.8;
      cell.push(bugLeg(ax, ay, kx, ky, tx, ty, 1.12));
      cell.push(C(kx, ky, 0.62, JOINT_LIGHT));
    }
  }

  cell.push(`<g transform="translate(0 ${n(bob)})">`);
  // Owner-coloured egg abdomen.
  cell.push(P('M12 13.6C15.7 14 17.9 17.4 17.7 21.5C17.5 25.3 15.2 28.2 12 28.2' +
    'C8.8 28.2 6.5 25.3 6.3 21.5C6.1 17.4 8.3 14 12 13.6Z', 'url(#own)',
    `stroke="${O.ink}" stroke-width=".8"`));
  cell.push(L('M8.6 18.2C7.8 20.2 7.9 22.4 8.7 24', O.hi, 0.7, 'opacity=".5"'));
  // Upper shell plate: a dark cap with a scalloped seam.
  cell.push(P('M6.5 20.2C7.1 16.4 9.1 14.2 12 13.6C14.9 14.2 16.9 16.4 17.5 20.2' +
    'L15.9 19.1L14.2 20.2L12.4 19L10.6 20.1L9 19L7.7 19.9Z', 'url(#plate)',
    `stroke="${O.ink}" stroke-width=".65" stroke-linejoin="round"`));
  cell.push(L('M8.3 16.6C9.4 15.6 10.6 15.1 11.8 15', O.hi, 0.55, 'opacity=".6"'));
  cell.push(L('M10.4 17.4L11.2 18.5L10.5 19.4', O.ink, 0.4, 'opacity=".45"'));
  // Lower shell: the cracked cup the grub is still standing in.
  cell.push(P('M5.9 21.8C5.9 25.9 8.6 28.8 12 28.8C15.4 28.8 18.1 25.9 18.1 21.8' +
    'L16.3 23.4L14.5 22.1L12.5 23.6L10.5 22.2L8.5 23.6L6.6 22Z', 'url(#cradle)',
    'stroke="#C2B08B" stroke-width=".55" stroke-linejoin="round"'));
  cell.push(L('M7.5 22.8C7.2 24.8 8.1 27 9.9 28.1', '#FFFFFF', 0.65, 'opacity=".65"'));
  cell.push(E(9.8, 25.8, 0.6, 0.7, '#E7D6AE', 'opacity=".85"'));
  cell.push(E(14.2, 26.8, 0.5, 0.6, '#E7D6AE', 'opacity=".8"'));
  cell.push('</g>');

  // Narrow waist, eggshell ruff, then the round friendly head.
  cell.push(P(rrect(9.8, 10.6, 4.4, 4.6, 1.6), 'url(#shell)',
    `stroke="${O.ink}" stroke-width=".7"`));
  cell.push(P('M9.6 10.2C10.4 9.6 13.6 9.6 14.4 10.2L14 11.6C13 11 11 11 10 11.6Z',
    'url(#cradle)', 'stroke="#C2B08B" stroke-width=".45" stroke-linejoin="round"'));
  cell.push(P('M12 4C14.9 4 16.5 5.9 16.5 8C16.5 10.2 14.9 11.2 12 11.2' +
    'C9.1 11.2 7.5 10.2 7.5 8C7.5 5.9 9.1 4 12 4Z', 'url(#own)',
    `stroke="${O.ink}" stroke-width=".8"`));
  cell.push(E(10.7, 6.2, 1.6, 1.1, O.hi, 'opacity=".4"'));
  for (const eyeX of [10.1, 13.9]) {
    cell.push(E(eyeX, 7.6, 0.86, 1.06, 'url(#eye)'));
    cell.push(C(eyeX + (eyeX < 12 ? -0.16 : 0.16), 7.2, 0.27, '#FFFFFF', 'opacity=".85"'));
  }
  cell.push(L('M10.8 9.4Q12 10.3 13.2 9.4', BUG_INK, 0.5, 'opacity=".55"'));
  cell.push(L('M10.4 4.5C9.6 3.7 9.2 2.9 9.1 2.3', JOINT, 0.8));
  cell.push(C(9.1, 2.2, 0.45, '#C8B183'));
  cell.push(L('M13.6 4.5C14.4 3.7 14.8 2.9 14.9 2.3', JOINT, 0.8));
  cell.push(C(14.9, 2.2, 0.45, '#C8B183'));
  return cell;
}

function broodArt(index) {
  const { O, defs } = broodDefs(index);
  const body = [];
  for (let frame = 0; frame < FRAMES; frame++) {
    body.push(`<g transform="translate(${frame * CELL_W} 0)" data-frame="${frame}" ` +
      `data-bounds="0 0 ${CELL_W} ${CELL_H}"><g clip-path="url(#cell${frame})">` +
      `${broodCell(frame, O).join('')}</g></g>`);
  }
  return { width: 96, height: 32, defs, body, label: BROOD_LABEL };
}

// --------------------------------------------------------------------- write

function render(name, art) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${art.width}" height="${art.height}" ` +
      `viewBox="0 0 ${art.width} ${art.height}" role="img" aria-label="${art.label}">`,
    `<title>${art.label}</title>`,
    '<defs>',
    ...art.defs,
    '</defs>',
    ...art.body,
    '</svg>',
  ].join('\n') + '\n';
}

function buildAll() {
  const rendered = new Map();
  for (let owner = 0; owner < OWNER_COUNT; owner++) {
    rendered.set(`hatchery-${owner}.svg`, render(`hatchery-${owner}.svg`, hatcheryArt(owner)));
    rendered.set(`wind-${owner}.svg`, render(`wind-${owner}.svg`, windArt(owner)));
    rendered.set(`bug-brood-${owner}.svg`, render(`bug-brood-${owner}.svg`, broodArt(owner)));
  }
  // Compatibility aliases, exactly as shipped for nest/cannon and the races.
  rendered.set('hatchery.svg', rendered.get('hatchery-0.svg'));
  rendered.set('wind.svg', rendered.get('wind-0.svg'));
  rendered.set('bug-brood.svg', rendered.get('bug-brood-1.svg'));
  return rendered;
}

const EXPECTED_SIZE = name => {
  if (/^bug-brood(?:-[0-4])?\.svg$/.test(name)) return { width: 96, height: 32 };
  if (/^(?:hatchery|wind)(?:-[0-4])?\.svg$/.test(name)) return { width: 160, height: 160 };
  return null;
};

const FORBIDDEN = [
  [/<script\b/i, '<script>'],
  [/<foreignObject\b/i, '<foreignObject>'],
  [/<metadata\b/i, '<metadata>'],
  [/<image\b/i, '<image>'],
  [/\bhref\s*=/i, 'href'],
  [/@import\b/i, '@import'],
  [/\son[a-z]+\s*=/i, 'inline event handler'],
  [/(?:xlink:)?href\s*=\s*["']?\s*(?:https?:|file:|ftp:|\/\/)/i, 'remote href'],
  [/url\(\s*["']?\s*(?:https?:|file:|ftp:|\/\/)/i, 'remote url()'],
  [/javascript:/i, 'javascript:'],
];

function validate(files) {
  const problems = [];
  for (const [name, svg] of files) {
    const expected = EXPECTED_SIZE(name);
    if (!expected) {
      problems.push(`${name}: not part of the brood/hatchery/wind contract`);
      continue;
    }
    if (!svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ')) problems.push(`${name}: missing SVG root namespace`);
    if (!svg.includes(`width="${expected.width}" height="${expected.height}"`)) problems.push(`${name}: wrong declared size`);
    if (!svg.includes(`viewBox="0 0 ${expected.width} ${expected.height}"`)) problems.push(`${name}: wrong viewBox`);
    if (!svg.includes('role="img"') || !svg.includes('aria-label="')) problems.push(`${name}: missing accessible label`);
    if (!svg.includes('<title>')) problems.push(`${name}: missing <title>`);
    if (!svg.trimEnd().endsWith('</svg>')) problems.push(`${name}: not closed`);
    for (const [pattern, label] of FORBIDDEN) {
      if (pattern.test(svg)) problems.push(`${name}: contains ${label}`);
    }    // Every url(#id) reference must resolve inside this file.
    const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
    for (const match of svg.matchAll(/url\(#([^)]+)\)/g)) {
      if (!ids.has(match[1])) problems.push(`${name}: dangling reference url(#${match[1]})`);
    }
    if (name.startsWith('bug-brood')) {
      const frames = [...svg.matchAll(/<g transform="translate\((\d+) 0\)" data-frame="(\d+)" /g)];
      if (frames.length !== FRAMES) problems.push(`${name}: expected ${FRAMES} frames, found ${frames.length}`);
      frames.forEach((frame, position) => {
        if (Number(frame[1]) !== position * CELL_W) problems.push(`${name}: frame ${position} offset ${frame[1]}`);
        if (Number(frame[2]) !== position) problems.push(`${name}: frame ${position} data-frame ${frame[2]}`);
      });
      for (let frame = 0; frame < FRAMES; frame++) {
        if (!svg.includes(`<clipPath id="cell${frame}" clipPathUnits="userSpaceOnUse">` +
          `<rect x="0" y="0" width="${CELL_W}" height="${CELL_H}"/></clipPath>`)) {
          problems.push(`${name}: cell${frame} is not a userSpace ${CELL_W}x${CELL_H} clip`);
        }
        if (!svg.includes(`clip-path="url(#cell${frame})"`)) problems.push(`${name}: cell${frame} clip not applied`);
      }
      const chunks = svg.split(/<g transform="translate\(\d+ 0\)" data-frame="\d"/).slice(1);
      const signatures = chunks.map(chunk => chunk.replace(/cell\d/g, 'cell'));
      if (chunks.length !== FRAMES) problems.push(`${name}: frame chunks ${chunks.length}`);
      if (new Set(signatures).size !== FRAMES) problems.push(`${name}: gait frames are not four distinct poses`);
    }
  }
  const aliases = [
    ['hatchery.svg', 'hatchery-0.svg'],
    ['wind.svg', 'wind-0.svg'],
    ['bug-brood.svg', 'bug-brood-1.svg'],
  ];
  for (const [alias, source] of aliases) {
    if (files.get(alias) !== files.get(source)) problems.push(`${alias}: is not the byte alias of ${source}`);
  }
  return problems;
}

function main(argv) {
  const check = argv.includes('--check');
  const files = buildAll();
  const problems = validate(files);
  if (problems.length) {
    for (const problem of problems) console.error(`FAIL ${problem}`);
    return 1;
  }
  let drifted = 0;
  for (const [name, svg] of files) {
    const target = path.join(ART, name);
    if (check) {
      const actual = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
      if (actual !== svg) {
        console.error(`DRIFT ${name}`);
        drifted++;
      }
    } else {
      fs.writeFileSync(target, svg, 'utf8');
    }
  }
  if (check) {
    if (drifted) {
      console.error(`${drifted} file(s) differ from the generator; re-run without --check to rebuild.`);
      return 1;
    }
    console.log(`PASS ${files.size} brood/hatchery/wind SVGs reproduce byte-for-byte`);
    return 0;
  }
  console.log(`WROTE ${files.size} brood/hatchery/wind SVGs in public/art`);
  for (let owner = 0; owner < OWNER_COUNT; owner++) {
    console.log(`  owner ${owner} (${OWNER_NAMES[owner]} ${OWNERS[owner]}): ` +
      'hatchery, wind, four-frame brood');
  }
  console.log('Existing nest/cannon/agile/fast/strong art was not touched.');
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { OWNERS, ownerTone, hatcheryArt, windArt, broodArt, buildAll, validate };
