"""Sunlit Garden - original procedural SVG art for Bug War: Verdant Crown.

Standard library only. Running this script rewrites the shipped art in this
folder:

    background-{meadow,roots,marsh,amber}.svg   1600x900 battlefields
    nest-0..4.svg / cannon-0..4.svg             160x160 owner variants
    nest.svg / cannon.svg                       neutral (owner 0) entries
    bug-{agile,fast,strong}-0..4.svg            96x32, four 24x32 gait frames
    bug-{agile,fast,strong}.svg                 blue (owner 1) entries
    emblem.svg                                  256x256 seed-core beetle

cover.svg is hand-authored through scripts/generate-cover.cjs and is never
read, rewritten or deleted here. Every shape below is drawn from coordinates;
no bitmap, font, external file or scripting is referenced.
"""

from pathlib import Path
import math
import random
import xml.etree.ElementTree as ET

ART = Path(__file__).resolve().parent

# The single ownership palette shared with the scene and the design contract.
OWNERS = ('#92A18B', '#327FC1', '#C85F48', '#8B70BA', '#C49336')

# --------------------------------------------------------------------- colour


def _n(v):
    if isinstance(v, int):
        return str(v)
    return ('%.3f' % v).rstrip('0').rstrip('.')


def _rgb(h):
    h = h.lstrip('#')
    return [int(h[i:i + 2], 16) for i in (0, 2, 4)]


def _hex(t):
    return '#%02X%02X%02X' % tuple(max(0, min(255, int(round(v)))) for v in t)


def mix(a, b, t):
    x, y = _rgb(a), _rgb(b)
    return _hex([x[i] + (y[i] - x[i]) * t for i in range(3)])


def light(c, t):
    return mix(c, '#FFFFFF', t)


def shade(c, t):
    return mix(c, '#233428', t)


def owner_tone(index):
    """Carapace / roof tones for one owner, from bright highlight to shadow."""
    c = OWNERS[index]
    return {
        'base': c,
        'hi': light(c, 0.58),
        'light': light(c, 0.34),
        'mid': light(c, 0.10),
        'deep': shade(c, 0.30),
        'ink': shade(c, 0.48),
        'dark': shade(c, 0.62),
    }

# ------------------------------------------------------------------- elements


def P(d, fill='none', extra=''):
    return '<path d="%s" fill="%s"%s/>' % (d, fill, (' ' + extra) if extra else '')


def L(d, color, w, extra=''):
    return P(d, 'none', 'stroke="%s" stroke-width="%s" stroke-linecap="round" '
                       'stroke-linejoin="round"%s' % (color, _n(w), (' ' + extra) if extra else ''))


def E(cx, cy, rx, ry, fill, extra=''):
    return '<ellipse cx="%s" cy="%s" rx="%s" ry="%s" fill="%s"%s/>' % (
        _n(cx), _n(cy), _n(rx), _n(ry), fill, (' ' + extra) if extra else '')


def C(cx, cy, r, fill='none', extra=''):
    return '<circle cx="%s" cy="%s" r="%s" fill="%s"%s/>' % (
        _n(cx), _n(cy), _n(r), fill, (' ' + extra) if extra else '')


def stops(items):
    out = []
    for item in items:
        off, col = item[0], item[1]
        op = item[2] if len(item) > 2 else None
        out.append('<stop offset="%s" stop-color="%s"%s/>' % (
            _n(off), col, '' if op is None else ' stop-opacity="%s"' % _n(op)))
    return ''.join(out)


def lin(gid, items, x1=0, y1=0, x2=0.8, y2=1):
    return '<linearGradient id="%s" x1="%s" y1="%s" x2="%s" y2="%s">%s</linearGradient>' % (
        gid, _n(x1), _n(y1), _n(x2), _n(y2), stops(items))


def rad(gid, items, cx=0.35, cy=0.25, r=0.9):
    return '<radialGradient id="%s" cx="%s" cy="%s" r="%s">%s</radialGradient>' % (
        gid, _n(cx), _n(cy), _n(r), stops(items))


def rrect(x, y, w, h, r):
    x2, y2 = x + w, y + h
    return ('M%s %sQ%s %s %s %sV%sQ%s %s %s %sH%sQ%s %s %s %sV%sQ%s %s %s %sZ'
            % (_n(x + r), _n(y), _n(x), _n(y), _n(x), _n(y + r), _n(y2 - r),
               _n(x), _n(y2), _n(x + r), _n(y2), _n(x2 - r),
               _n(x2), _n(y2), _n(x2), _n(y2 - r), _n(y + r),
               _n(x2), _n(y), _n(x2 - r), _n(y)))


def svg_write(name, w, h, defs, body):
    head = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
            'viewBox="0 0 %d %d">' % (w, h, w, h))
    text = '\n'.join([head, '<defs>'] + list(defs) + ['</defs>'] + list(body) + ['</svg>']) + '\n'
    with open(ART / name, 'w', encoding='utf8', newline='\n') as fh:
        fh.write(text)

# ------------------------------------------------------- shared garden pieces

LEAF_D = ('M0 0C-6-7-20-17-24-33C-29-51-26-74-13-90'
          'C-7-98 0-102 5-102C11-102 17-98 22-88'
          'C30-71 31-46 24-28C18-12 8-4 0 0Z')
LEAF_IN = 'M-3-12C-12-28-15-50-9-70C-5-52-2-30-3-12Z'
LEAF_EDGE = 'M0 0C-6-7-20-17-24-33C-29-51-26-74-13-90C-7-98 0-102 5-102'
LEAF_SHADE = ('M0 0C8-4 18-12 24-28C31-46 30-71 22-88C17-98 11-102 5-102'
              'C14-94 20-80 22-64C24-44 18-20 0 0Z')
LEAF_MID = 'M0-2C-2-30 0-66 4-100'
LEAF_VEIN = ('M-2-20Q-11-26-18-34M-3-38Q-13-44-20-54M-3-56Q-12-62-18-72'
             'M-1-72Q-7-78-11-86M2-24Q10-30 16-38M2-42Q9-48 16-58M2-60Q8-66 14-74'
             'M4-76Q8-82 10-88')

# Decor stays in the outer frame; the 13-level building centres live in the
# middle of the canvas and must remain quiet and legible.
EDGE_BANDS = ((0, 176, 108, 862), (1424, 1600, 104, 864),
              (34, 1566, 34, 156), (52, 1548, 766, 886))


def garden_defs():
    return [
        lin('leaf', [(0, '#EDF5B4'), (0.42, '#93C177'), (1, '#47875C')], x2=0.62),
        lin('leaf2', [(0, '#F6F9C8'), (0.46, '#AFD48C'), (1, '#5E9A6C')], x2=0.58),
        lin('leafDark', [(0, '#8CBB80'), (1, '#356B52')], x2=0.6),
        lin('stone', [(0, '#FFF9E6'), (0.5, '#E8E1C6'), (1, '#C4C5A8')], x2=0.3),
        lin('wood', [(0, '#F1DEAF'), (0.42, '#CBB181'), (1, '#96815B')], x2=0.25),
        lin('woodLit', [(0, '#F8EAC1'), (0.5, '#DFC793'), (1, '#B2986B')], x2=0.3),
        lin('copper', [(0, '#FFF1C2'), (0.45, '#DABC7C'), (1, '#A88C57')], x2=0.3),
        lin('reed', [(0, '#C4E0A4'), (0.5, '#93BF85'), (1, '#6C9E72')], x2=0.3),
        rad('pad', [(0, '#B4DCA6'), (0.6, '#84BC84'), (1, '#5E9A70')], cx=0.4, cy=0.35, r=0.85),
        rad('dew', [(0, '#FFFFFF', 0.96), (0.42, '#E4F7F1', 0.5), (1, '#5E9C92', 0.82)],
            cx=0.32, cy=0.2, r=0.95),
        rad('warm', [(0, '#FFF5D6', 0.9), (0.55, '#FFEFC5', 0.35), (1, '#FFEFC5', 0)],
            cx=0.5, cy=0.5, r=0.5),
        '<filter id="far"><feGaussianBlur stdDeviation="20"/></filter>',
        '<filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>',
    ]


def leaf(x, y, s, angle, fill='url(#leaf)', vein='#F3F8CE', extra=''):
    shadow = ''
    if s > 0.95:
        shadow = E(4 * s, 6 * s, 26 * s, 9 * s, '#6E8A62',
                   'opacity="%s" filter="url(#soft)"' % _n(min(0.2, 0.08 * s)))
    return ('<g transform="translate(%s %s) rotate(%s) scale(%s)"%s>'
            % (_n(x), _n(y), _n(angle), _n(s), (' ' + extra) if extra else '')
            + shadow
            + P(LEAF_D, fill, 'stroke="#3F7057" stroke-width="1.1" stroke-linejoin="round"')
            + P(LEAF_SHADE, '#2F6047', 'opacity=".13"')
            + P(LEAF_IN, '#FFFFFF', 'opacity=".16"')
            + L(LEAF_MID, vein, 2.6, 'opacity=".8"')
            + L(LEAF_VEIN, vein, 1.3, 'opacity=".6"')
            + '</g>')


def grass(x, y, s, color, extra=''):
    blades = ''
    for i in range(5):
        dx = -17 + i * 8.5
        h = -(42 + (i % 3) * 17)
        blades += 'M%s 0Q%s %s %s %s' % (_n(dx), _n(dx * 1.15), _n(h * 0.55),
                                         _n(dx * 1.55), _n(h))
    return '<g transform="translate(%s %s) scale(%s)"%s>%s</g>' % (
        _n(x), _n(y), _n(s), (' ' + extra) if extra else '', L(blades, color, 3.4))


def daisy(x, y, s, extra=''):
    out = ['<g transform="translate(%s %s) scale(%s)"%s>'
           % (_n(x), _n(y), _n(s), (' ' + extra) if extra else '')]
    out.append(L('M0 6Q-4 22 0 34', '#7E9C68', 2.4))
    out.append(P('M-1 18Q-9 14-13 6Q-5 7-1 18Z', 'url(#leaf2)'))
    out.append(P('M1 26Q9 22 13 14Q5 15 1 26Z', 'url(#leaf2)'))
    for i in range(8):
        a = math.tau * i / 8.0
        px, py = math.cos(a) * 10.5, math.sin(a) * 10.5
        out.append(E(px, py, 9.6, 3.8, '#FFFCEF',
                     'stroke="#EBDFB8" stroke-width=".7" transform="rotate(%.1f %s %s)"'
                     % (math.degrees(a), _n(px), _n(py))))
    out.append(C(0, 0, 5.6, '#E7C163'))
    out.append(C(-1.6, -1.8, 2.1, '#FCF1C6', 'opacity=".85"'))
    out.append('</g>')
    return ''.join(out)


def dew(x, y, r, rot=0, extra=''):
    return (E(x, y, r, r * 1.32, 'url(#dew)',
              'transform="rotate(%s %s %s)"%s' % (_n(rot), _n(x), _n(y),
                                                  (' ' + extra) if extra else ''))
            + C(x - r * 0.34, y - r * 0.52, r * 0.26, '#FFFFFF', 'opacity=".92"')
            + C(x + r * 0.30, y + r * 0.56, r * 0.15, '#FFFFFF', 'opacity=".45"'))


def stone(x, y, s, tone='url(#stone)', extra=''):
    return ('<g transform="translate(%s %s) scale(%s)"%s>'
            % (_n(x), _n(y), _n(s), (' ' + extra) if extra else '')
            + E(4, 12, 30, 8, '#6F8A6C', 'opacity=".16" filter="url(#soft)"')
            + P('M-30 4C-28-12-14-20 2-18C22-16 32-4 30 6C26 14 8 18-10 16'
                'C-22 15-31 11-30 4Z', tone, 'stroke="#AEAF92" stroke-width="1.1"')
            + L('M-24-1Q-12-12 4-12', '#FFFDF0', 3, 'opacity=".55"')
            + '</g>')


def flecks(rng, count, color, alpha, bands=EDGE_BANDS, lo=1.1, hi=3.0):
    d = ''
    for _ in range(count):
        x0, x1, y0, y1 = rng.choice(bands)
        x, y, r = rng.uniform(x0, x1), rng.uniform(y0, y1), rng.uniform(lo, hi)
        d += ('M%.1f %.1fm-%.1f 0a%.1f %.1f 0 1 0 %.1f 0a%.1f %.1f 0 1 0 -%.1f 0'
              % (x, y, r, r, r, 2 * r, r, r, 2 * r))
    return P(d, color, 'opacity="%s"' % _n(alpha))


def paver(x, y, w, h, rot=0.0, tone='url(#terra)'):
    """Flat flagstone: chamfered slab with a joint shadow and a lit top edge."""
    hw, hh = w / 2.0, h / 2.0
    slab = ('M%.1f %.1fL%.1f %.1fL%.1f %.1fL%.1f %.1fZ'
            % (-hw + 7, -hh, hw - 9, -hh + 3, hw - 5, hh - 3, -hw + 6, hh - 5))
    return ('<g transform="translate(%s %s) rotate(%s)">' % (_n(x), _n(y), _n(rot))
            + P(slab, '#8A7050', 'opacity=".16" transform="translate(3 5)"')
            + P(slab, tone, 'stroke="#B79A70" stroke-width="1.2"')
            + L('M%.1f %.1fL%.1f %.1f' % (-hw + 9, -hh + 3, hw - 11, -hh + 6),
                '#FFF7E2', 2.6, 'opacity=".55"')
            + L('M%.1f %.1fL%.1f %.1f' % (-hw + 8, hh - 7, hw - 8, hh - 5),
                '#A88A62', 1.8, 'opacity=".35"')
            + '</g>')

# --------------------------------------------------------------- battlefields


def foliage_mass(x, y, s, color, alpha=0.2):
    """Out-of-focus greenery that joins border props into one soft mass."""
    return ('<g filter="url(#far)" opacity="%s">' % _n(alpha)
            + E(x, y, 48 * s, 36 * s, color)
            + E(x + 30 * s, y + 16 * s, 34 * s, 26 * s, color)
            + E(x - 26 * s, y + 20 * s, 32 * s, 24 * s, color) + '</g>')


def leaf_group(rng, x, y, s, angle, n, fill='url(#leaf)', vein='#F3F8CE',
               spread=44, shrink=(0.66, 1.14), scatter=0.2, alpha=None):
    out = []
    for _ in range(n):
        a = angle + rng.uniform(-spread, spread)
        sc = s * rng.uniform(*shrink)
        ox = x + rng.uniform(-scatter, scatter) * 100 * s
        oy = y + rng.uniform(-scatter * 0.7, scatter * 0.7) * 100 * s
        out.append(leaf(ox, oy, sc, a, fill, vein))
    body = ''.join(out)
    return body if alpha is None else '<g opacity="%s">%s</g>' % (_n(alpha), body)


def fern(rng, x, y, s, angle, fill='url(#leaf2)'):
    out = ['<g transform="translate(%s %s) rotate(%s) scale(%s)">'
           % (_n(x), _n(y), _n(angle), _n(s))]
    out.append(L('M0 0C3-30-1-64 2-96', '#6E9C69', 2.6))
    for i in range(7):
        t = 0.16 + i * 0.12
        y0 = -96 * t
        length = 30 * (1 - t * 0.82)
        ln = length
        out.append(P('M1 %.1fC%.1f %.1f %.1f %.1f %.1f %.1f'
                     'C%.1f %.1f %.1f %.1f 1 %.1fZ'
                     % (y0, -ln * 0.55, y0 - 7, -ln, y0 - 13, -ln * 0.95, y0 - 18,
                        -ln * 0.45, y0 - 12, -ln * 0.15, y0 - 4, y0 + 1), fill))
        out.append(P('M3 %.1fC%.1f %.1f %.1f %.1f %.1f %.1f'
                     'C%.1f %.1f %.1f %.1f 3 %.1fZ'
                     % (y0 - 5, ln * 0.55, y0 - 12, ln, y0 - 18, ln * 0.95, y0 - 23,
                        ln * 0.45, y0 - 17, ln * 0.15, y0 - 9, y0 - 4), fill))
    out.append('</g>')
    return ''.join(out)


def reed(rng, x, y, s, lean, color='#7FA96F'):
    out = [L('M%s %sQ%s %s %s %s' % (_n(x), _n(y), _n(x + lean * 22), _n(y - 90 * s),
                                     _n(x + lean * 44), _n(y - 168 * s)), color, 4.6 * s)]
    out.append(L('M%s %sQ%s %s %s %s' % (_n(x + 12), _n(y), _n(x + 12 + lean * 30), _n(y - 70 * s),
                                         _n(x + 12 + lean * 62), _n(y - 122 * s)), color, 3 * s))
    for k in range(3):
        ly = y - (40 + k * 34) * s
        out.append(P('M%s %sC%s %s %s %s %s %sC%s %s %s %s %s %sZ'
                     % (_n(x + lean * (6 + k * 6)), _n(ly),
                        _n(x + lean * 26), _n(ly - 12 * s), _n(x + lean * 64), _n(ly - 20 * s),
                        _n(x + lean * 74), _n(ly - 4 * s),
                        _n(x + lean * 40), _n(ly + 12 * s), _n(x + lean * 12), _n(ly + 10 * s),
                        _n(x + lean * (5 + k * 5)), _n(ly)), 'url(#reed)'))
    hx, hy = x + lean * 46, y - 174 * s
    out.append(E(hx, hy, 5 * s, 13 * s, '#A8C58A',
                 'transform="rotate(%s %s %s)"' % (_n(-lean * 14), _n(hx), _n(hy))))
    return ''.join(out)


def _smooth_closed(pts):
    n = len(pts)
    d = 'M%.1f %.1f' % ((pts[-1][0] + pts[0][0]) / 2, (pts[-1][1] + pts[0][1]) / 2)
    for i in range(n):
        p = pts[i]
        q = pts[(i + 1) % n]
        d += 'Q%.1f %.1f %.1f %.1f' % (p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
    return d + 'Z'


def border_bed(rng, inset=76, amp=54, step=122, fill='url(#bed)', shadow='#7E9A6A'):
    """Garden border ring with a soft irregular inner contour around the field."""
    w = 1600 - inset * 2
    h = 900 - inset * 2
    pts = []
    nx = max(3, int(w / step))
    ny = max(2, int(h / step))
    for i in range(nx):
        pts.append((inset + w * i / nx, inset + rng.uniform(0, amp)))
    for i in range(ny):
        pts.append((1600 - inset - rng.uniform(0, amp), inset + h * i / ny))
    for i in range(nx):
        pts.append((1600 - inset - w * i / nx, 900 - inset - rng.uniform(0, amp)))
    for i in range(ny):
        pts.append((inset + rng.uniform(0, amp), 900 - inset - h * i / ny))
    contour = _smooth_closed(pts)
    svg = (P('M0 0H1600V900H0Z' + contour, fill, 'fill-rule="evenodd"')
           + L(contour, shadow, 24, 'opacity=".12" filter="url(#soft)"')
           + L(contour, shadow, 4, 'opacity=".14"'))
    return svg, pts


def edge_fuzz(rng, pts, palette, seed_kind='grass', count=22, scale=(0.32, 0.62)):
    """Small plants sitting on the border contour break up the field edge."""
    out = []
    picks = rng.sample(pts, min(count, len(pts)))
    for px, py in picks:
        s = rng.uniform(*scale)
        color = rng.choice(palette)
        if seed_kind == 'grass' or rng.random() < 0.45:
            out.append(grass(px, py + 6, s, color))
        else:
            out.append(leaf_group(rng, px, py + 8, s * 1.5, rng.uniform(-60, 60), 2,
                                  rng.choice(['url(#leaf)', 'url(#leaf2)'])))
        if rng.random() < 0.18:
            out.append(C(px + rng.uniform(-10, 10), py + rng.uniform(-4, 8),
                         rng.uniform(1.4, 2.6), rng.choice(['#FFFDF0', '#E7C163']),
                         'opacity=".8"'))
    return ''.join(out)


def leaf_shadow(x, y, s, angle, color='#8FAE78', alpha=0.1):
    return ('<g filter="url(#far)" opacity="%s"><g transform="translate(%s %s) '
            'rotate(%s) scale(%s)">%s</g></g>'
            % (_n(alpha), _n(x), _n(y), _n(angle), _n(s), P(LEAF_D, color)))


def bg_meadow():
    """Morning dew meadow: warm air, pale green floor, leafy rim, open middle."""
    rng = random.Random(1201)
    defs = garden_defs() + [
        lin('field', [(0, '#FBF6D2'), (0.38, '#ECEFBC'), (0.72, '#DDE7AF'), (1, '#C9DCA0')],
            x1=0.15, x2=0.45),
        rad('sun', [(0, '#FFFEF4', 0.96), (0.52, '#FFFBEA', 0.46), (1, '#FFF8E1', 0)],
            cx=0.19, cy=0.07, r=0.78),
        rad('sun2', [(0, '#FFFCEF', 0.7), (1, '#FFFCEF', 0)], cx=0.5, cy=0.5, r=0.5),
        lin('bed', [(0, '#D8E7B0'), (0.5, '#C4DA9A'), (1, '#AFCB86')], x1=0.2, x2=0.6),
    ]
    b = [P('M0 0H1600V900H0Z', 'url(#field)')]
    b.append(E(250, 60, 960, 680, 'url(#sun)'))
    b.append(E(1360, 880, 520, 340, 'url(#sun2)'))
    bed, contour = border_bed(rng, shadow='#7E9A6A')
    b.append(bed)
    b.append(edge_fuzz(rng, contour, ('#7FA56B', '#8BAF72'), count=26))
    b.append(leaf_shadow(330, 300, 5.2, 58, '#8FAE78', 0.13))
    b.append(leaf_shadow(1240, 640, 4.4, -72, '#8FAE78', 0.1))
    # Out-of-focus foliage ties the rim together without touching the middle.
    b.append(foliage_mass(-30, 130, 2.6, '#A9C893', 0.5))
    b.append(foliage_mass(1600, 200, 2.5, '#A3C48F', 0.46))
    b.append(foliage_mass(50, 820, 2.3, '#A9C893', 0.44))
    b.append(foliage_mass(1540, 800, 2.2, '#A3C48F', 0.42))
    b.append(foliage_mass(700, -60, 2.1, '#B4CF9C', 0.36))
    b.append(foliage_mass(1020, -50, 1.8, '#B4CF9C', 0.3))
    # Left and right framing: large leaves with dew, smaller ones deeper in.
    b.append(leaf_group(rng, 34, 316, 2.45, 30, 3))
    b.append(leaf_group(rng, 118, 196, 1.05, -24, 2, fill='url(#leaf2)', alpha=.9))
    b.append(leaf_group(rng, 1572, 330, 2.15, -31, 3))
    b.append(leaf_group(rng, 1508, 470, 1.05, -62, 2, fill='url(#leaf2)', alpha=.85))
    b.append(leaf_group(rng, 66, 760, 1.45, 40, 2))
    b.append(leaf_group(rng, 1470, 806, 1.6, -16, 3))
    b.append(leaf_group(rng, 668, 22, 1.15, 166, 2, fill='url(#leaf2)', alpha=.92))
    b.append(leaf_group(rng, 972, 10, 1.0, 192, 2, fill='url(#leaf2)', alpha=.8))
    b.append(leaf_group(rng, 250, 92, 0.72, 148, 2, fill='url(#leaf2)', alpha=.6))
    b.append(leaf_group(rng, 1330, 84, 0.7, 196, 2, fill='url(#leaf2)', alpha=.55))
    b.append(leaf_group(rng, 196, 886, 0.8, 22, 2, fill='url(#leaf2)', alpha=.7))
    b.append(leaf_group(rng, 1300, 890, 0.75, -20, 2, fill='url(#leaf2)', alpha=.65))
    # Grass, clover, daisies, pebbles and dew keep the miniature garden scale.
    for x, y, s, c in ((96, 862, 1.5, '#7FA56B'), (236, 898, 1.15, '#8BAF72'),
                       (1478, 874, 1.35, '#7FA56B'), (1352, 900, 1.1, '#8BAF72'),
                       (168, 742, 0.8, '#8BAF72'), (1424, 690, 0.78, '#7FA56B'),
                       (54, 470, 0.7, '#8BAF72'), (1548, 552, 0.66, '#7FA56B')):
        b.append(grass(x, y, s, c))
    b.append(grass(120, 250, 0.62, '#8BAF72', 'opacity=".8"'))
    b.append(grass(1488, 268, 0.58, '#8BAF72', 'opacity=".8"'))
    b.append(daisy(206, 808, 1.25))
    b.append(daisy(1408, 838, 1.05))
    b.append(daisy(120, 512, 0.8))
    b.append(daisy(1500, 640, 0.72))
    b.append(daisy(292, 878, 0.66))
    b.append(daisy(1268, 902, 0.6))
    b.append(stone(1478, 596, 0.6))
    b.append(stone(104, 388, 0.44))
    b.append(stone(1338, 866, 0.5))
    b.append(dew(150, 168, 7.6, 12))
    b.append(dew(1512, 366, 6.4, -24))
    b.append(dew(96, 676, 5.4, 8))
    b.append(dew(1442, 726, 4.6, 6))
    b.append(flecks(rng, 40, '#FFFBE4', 0.34))
    b.append(flecks(rng, 30, '#8FB97D', 0.24, lo=1.4, hi=3.6))
    b.append(flecks(rng, 14, '#FFFDF0', 0.22, bands=((180, 380, 200, 320), (1240, 1420, 600, 740)),
                    lo=1.2, hi=2.4))
    return defs, b


def bg_roots():
    """Sunlit root forest: warm bark buttresses, canopy light, open mossy floor."""
    rng = random.Random(2207)
    defs = garden_defs() + [
        lin('field', [(0, '#FBF4D4'), (0.36, '#F0E5BE'), (0.7, '#E2D9AE'), (1, '#CFD2A0')],
            x1=0.15, x2=0.52),
        rad('sun', [(0, '#FFFDF2', 0.94), (0.5, '#FFF9E3', 0.44), (1, '#FFF6DC', 0)],
            cx=0.64, cy=0.06, r=0.8),
        rad('sun2', [(0, '#FFF9E0', 0.6), (1, '#FFF9E0', 0)], cx=0.5, cy=0.5, r=0.5),
        rad('moss', [(0, '#9CC47F', 0.36), (1, '#9CC47F', 0)]),
        lin('shaft', [(0, '#FFFCE8', 0.5), (1, '#FFFCE8', 0)], x2=0.15),
        lin('bark', [(0, '#F3E3B6'), (0.3, '#D6BC8C'), (0.7, '#B09468'), (1, '#8E7A55')],
            x1=0.1, x2=0.7),
        lin('bed', [(0, '#EEE3BA'), (0.5, '#DCCEA0'), (1, '#C8BA87')], x1=0.2, x2=0.6),
    ]
    b = [P('M0 0H1600V900H0Z', 'url(#field)')]
    b.append(E(1120, 20, 900, 640, 'url(#sun)'))
    b.append(E(300, 880, 620, 380, 'url(#sun2)'))
    bed, contour = border_bed(rng, shadow='#8E8A5E')
    b.append(bed)
    b.append(edge_fuzz(rng, contour, ('#88AC6C', '#9ABE7E'), count=24))
    b.append(leaf_shadow(380, 330, 4.8, 66, '#A79F6C', 0.1))
    b.append(leaf_shadow(1200, 620, 4.2, -70, '#A79F6C', 0.09))
    b.append('<g filter="url(#far)">')
    for x0, wd in ((280, 110), (690, 86), (1110, 140)):
        b.append(P('M%d 0H%dL%d 900H%dZ' % (x0, x0 + wd, x0 + wd + 220, x0 + 220),
                   'url(#shaft)', 'opacity=".32"'))
    b.append('</g>')
    b.append(foliage_mass(-20, 210, 2.4, '#A7C48D', 0.42))
    b.append(foliage_mass(1610, 260, 2.4, '#A7C48D', 0.4))
    b.append(foliage_mass(700, -70, 2.2, '#B0C99A', 0.34))
    # Buttress roots hug the frame; the floor between them stays empty.
    b.append(P('M0 138C108 186 146 286 166 384C186 482 232 542 224 628'
               'C216 726 148 786 66 810L0 830Z', 'url(#bark)',
               'stroke="#8A7551" stroke-width="1.8" stroke-linejoin="round"'))
    b.append(L('M24 176C114 226 138 320 156 414C174 506 212 560 204 640',
               '#F8E8BC', 4.4, 'opacity=".45"'))
    for k in range(5):
        b.append(L('M%d %dC%d %d %d %d %d %d' % (18 + k * 26, 172 + k * 24, 60 + k * 30, 300 + k * 30,
                                                 30 + k * 26, 500 + k * 40, 44 + k * 20, 700 + k * 22),
                   '#8A7551', 1.6, 'opacity=".32"'))
    b.append(P('M0 604C86 634 122 692 132 754C142 810 108 866 48 894L0 900Z', 'url(#bark)',
               'stroke="#8A7551" stroke-width="1.8"'))
    b.append(L('M18 640C86 668 112 720 118 780', '#F8E8BC', 3.6, 'opacity=".42"'))
    b.append(P('M1600 108C1500 160 1462 258 1442 356C1424 452 1376 512 1382 604'
               'C1388 704 1458 768 1548 792L1600 806Z', 'url(#bark)',
               'stroke="#8A7551" stroke-width="1.8" stroke-linejoin="round"'))
    b.append(L('M1576 146C1484 198 1460 292 1442 386C1426 478 1388 532 1394 614',
               '#F8E8BC', 4.2, 'opacity=".45"'))
    for k in range(4):
        b.append(L('M1578 %dC%d %d %d %d %d %d' % (158 + k * 30, 1520 - k * 24, 300 + k * 34,
                                                   1520 - k * 20, 480 + k * 40, 1522 - k * 16, 660 + k * 26),
                   '#8A7551', 1.6, 'opacity=".3"'))
    b.append(P('M1600 828C1524 850 1490 878 1482 900L1600 900Z', 'url(#bark)',
               'stroke="#8A7551" stroke-width="1.6"'))
    # Root arcs creep in from the corners, never crossing the playfield.
    b.append(L('M0 52C136 92 224 168 282 272', '#B99C6E', 17))
    b.append(L('M0 58C134 96 218 172 276 274', '#EFDDB2', 6, 'opacity=".5"'))
    b.append(L('M1600 36C1462 88 1380 168 1318 278', '#B99C6E', 15))
    b.append(L('M1600 42C1464 92 1384 172 1324 280', '#EFDDB2', 5, 'opacity=".45"'))
    b.append(L('M252 902C312 828 314 756 278 696', '#B99C6E', 12))
    b.append(L('M1352 906C1300 832 1302 758 1340 704', '#B99C6E', 11))
    b.append('<g filter="url(#far)">')
    b.append(E(120, 320, 160, 130, 'url(#moss)', 'opacity=".6"'))
    b.append(E(1466, 640, 170, 140, 'url(#moss)', 'opacity=".52"'))
    b.append(E(238, 806, 160, 120, 'url(#moss)', 'opacity=".5"'))
    b.append(E(1330, 240, 130, 100, 'url(#moss)', 'opacity=".4"'))
    b.append('</g>')
    # Ferns, mossy stones, fungi and small leaves on the frame only.
    b.append(fern(rng, 168, 866, 1.25, 8))
    b.append(fern(rng, 1436, 880, 1.15, -6, fill='url(#leaf)'))
    b.append(fern(rng, 70, 470, 0.8, 22))
    b.append(leaf_group(rng, 56, 686, 1.15, -46, 2, fill='url(#leaf2)'))
    b.append(leaf_group(rng, 1534, 226, 1.1, 128, 2, fill='url(#leaf2)'))
    b.append(leaf_group(rng, 1500, 906, 1.2, -18, 2))
    b.append(leaf_group(rng, 240, 46, 0.8, 158, 2, fill='url(#leaf2)', alpha=.7))
    b.append(leaf_group(rng, 1290, 40, 0.78, 188, 2, fill='url(#leaf2)', alpha=.62))
    b.append(grass(200, 880, 1.25, '#88AC6C'))
    b.append(grass(1408, 890, 1.15, '#88AC6C'))
    b.append(grass(92, 700, 0.7, '#88AC6C'))
    b.append(stone(1492, 742, 0.62))
    b.append(stone(64, 404, 0.5))
    b.append(stone(120, 812, 0.55))
    b.append(dew(214, 252, 6.4, 18))
    b.append(dew(1418, 402, 5.4, -12))
    b.append(dew(120, 748, 4.8, 10))
    b.append(daisy(1462, 876, 0.66))
    b.append(daisy(286, 902, 0.6))
    for fx, fy, fs in ((176, 906, 0.85), (1508, 878, 0.7)):
        b.append(P('M%s %sC%s %s %s %s %s %sC%s %s %s %s %s %sZ'
                   % (_n(fx - 9 * fs), _n(fy), _n(fx - 11 * fs), _n(fy - 16 * fs), _n(fx), _n(fy - 14 * fs),
                      _n(fx + 9 * fs), _n(fy - 16 * fs), _n(fx + 11 * fs), _n(fy),
                      _n(fx + 4 * fs), _n(fy + 2 * fs), _n(fx - 4 * fs), _n(fy + 2 * fs)),
                   'url(#copper)', 'stroke="#A98C58" stroke-width="1"'))
        b.append(P('M%s %sV%s' % (_n(fx), _n(fy - 14 * fs), _n(fy + 2 * fs)), 'url(#woodLit)',
                   'stroke="#94805A" stroke-width="1"'))
    b.append(flecks(rng, 34, '#FFF8DA', 0.3))
    b.append(flecks(rng, 26, '#B49B6C', 0.24, lo=1.2, hi=3.4))
    return defs, b


def bg_marsh():
    """Clear wetland: cool mint water sheet, reed and lily framing at the rim."""
    rng = random.Random(3313)
    defs = garden_defs() + [
        lin('field', [(0, '#EEFAF2'), (0.34, '#DCF0EA'), (0.7, '#CBE6E3'), (1, '#B6D9D6')],
            x1=0.12, x2=0.48),
        rad('sun', [(0, '#FFFFFF', 0.9), (0.52, '#F4FCF8', 0.38), (1, '#F0FBF6', 0)],
            cx=0.76, cy=0.06, r=0.8),
        lin('sheen', [(0, '#FFFFFF', 0.5), (0.55, '#E2F8F3', 0.2), (1, '#D8F3EC', 0)],
            x2=0.45),
        rad('glowpad', [(0, '#FFFFFF', 0.6), (1, '#FFFFFF', 0)], cx=0.5, cy=0.5, r=0.5),
        rad('water', [(0, '#CFEAE6', 0.5), (1, '#CFEAE6', 0)], cx=0.5, cy=0.5, r=0.5),
        lin('bed', [(0, '#DBEED4'), (0.5, '#C4DEC5'), (1, '#ADCEB8')], x1=0.2, x2=0.6),
    ]
    b = [P('M0 0H1600V900H0Z', 'url(#field)')]
    b.append(E(1250, 40, 840, 560, 'url(#sun)'))
    b.append(E(240, 760, 620, 420, 'url(#water)'))
    bed, contour = border_bed(rng, shadow='#7FAE9E')
    b.append(bed)
    b.append(edge_fuzz(rng, contour, ('#7FA96F', '#8FB87C'), count=22))
    b.append(leaf_shadow(360, 280, 4.6, 60, '#8FB8A8', 0.09))
    b.append(leaf_shadow(1240, 620, 4.0, -68, '#8FB8A8', 0.08))
    b.append('<g filter="url(#far)" opacity=".55">')
    b.append(E(300, 170, 440, 180, 'url(#glowpad)'))
    b.append(E(760, 110, 380, 140, 'url(#glowpad)'))
    b.append(E(1320, 760, 380, 190, 'url(#glowpad)'))
    b.append('</g>')
    # Short water sheen bands stay in the outer thirds; no band crosses the middle.
    for y, x0, x1, o in ((232, 0, 470, 0.52), (392, 1150, 1600, 0.42),
                         (540, 0, 420, 0.4), (668, 1200, 1600, 0.38),
                         (790, 0, 380, 0.34)):
        b.append(P('M%d %dQ%d %d %d %dV%dQ%d %d %d %dH%dZ'
                   % (x0, y, (x0 + x1) // 2, y - 26, x1, y, y + 62,
                      x1 - 70, y + 40, (x0 + x1) // 2, y + 54, x0),
                   'url(#sheen)', 'opacity="%s"' % _n(o)))
    b.append(foliage_mass(-30, 150, 2.3, '#A6C9A6', 0.4))
    b.append(foliage_mass(1610, 180, 2.3, '#A6C9A6', 0.38))
    b.append(foliage_mass(80, 830, 2.1, '#9FC7A2', 0.36))
    b.append(foliage_mass(1530, 820, 2.1, '#9FC7A2', 0.34))
    # Reed beds and lily pads hold the rim.
    for x, y, s, lean in ((52, 906, 1.5, 1), (118, 898, 1.15, 1), (172, 872, 0.8, 1),
                          (1470, 900, 1.4, -1), (1528, 886, 1.1, -1), (1560, 860, 0.75, -1),
                          (30, 470, 0.8, 1), (1570, 520, 0.72, -1)):
        b.append(reed(rng, x, y, s, lean))
    b.append('<g>')
    for cx, cy, r_, ox in ((120, 762, 54, 1), (1452, 806, 46, -1), (1500, 690, 34, -1),
                           (250, 890, 38, 1)):
        b.append(E(cx + 8, cy + 8, r_ * 1.05, r_ * 0.42, '#5F9F8C', 'opacity=".16"'))
        b.append(C(cx, cy, r_, 'url(#pad)'))
        b.append(P('M%s %sL%s %sA%s %s 0 0 0 %s %sZ'
                   % (_n(cx), _n(cy), _n(cx + ox * r_), _n(cy - r_ * 0.24),
                      _n(r_), _n(r_), _n(cx), _n(cy - r_)), 'url(#field)',
                   'opacity=".95"'))
        b.append(C(cx, cy, r_, 'none', 'stroke="#5E9A72" stroke-width="1.3"'))
        b.append(L('M%s %sQ%s %s %s %s' % (_n(cx - r_ * 0.5), _n(cy - r_ * 0.3),
                                           _n(cx), _n(cy + r_ * 0.5), _n(cx + r_ * 0.5), _n(cy + r_ * 0.2)),
                   '#8FC09A', 1.4, 'opacity=".7"'))
    b.append('</g>')
    b.append(C(1452, 748, 6, '#FFF9E4', 'stroke="#E7D9B2" stroke-width=".9"'))
    b.append(C(1452, 748, 2.4, '#EBC469'))
    b.append(C(120, 700, 5.4, '#FFF9E4', 'stroke="#E7D9B2" stroke-width=".9"'))
    b.append(C(120, 700, 2.2, '#EBC469'))
    b.append(leaf_group(rng, 1544, 420, 1.0, -58, 2, fill='url(#leaf2)'))
    b.append(leaf_group(rng, 52, 300, 0.95, -44, 2, fill='url(#leaf2)'))
    b.append(leaf_group(rng, 780, 20, 1.0, 174, 2, fill='url(#leaf2)', alpha=.7))
    b.append(leaf_group(rng, 1180, 14, 0.9, 188, 2, fill='url(#leaf2)', alpha=.6))
    b.append(leaf_group(rng, 430, 892, 0.85, 18, 2, fill='url(#leaf2)', alpha=.7))
    b.append(grass(1420, 892, 1.05, '#7FA96F'))
    b.append(grass(330, 902, 0.95, '#7FA96F'))
    b.append(daisy(1502, 890, 0.62))
    b.append(daisy(74, 862, 0.6))
    b.append(dew(1468, 640, 7, 0))
    b.append(dew(120, 704, 5.6, 0))
    for cx, cy in ((300, 660), (1320, 380), (420, 300), (1240, 640)):
        b.append(L('M%s %sQ%s %s %s %s' % (_n(cx - 34), _n(cy), _n(cx), _n(cy - 10),
                                           _n(cx + 34), _n(cy)), '#9CCFC8', 2,
                   'opacity=".3"'))
        b.append(L('M%s %sQ%s %s %s %s' % (_n(cx - 22), _n(cy + 14), _n(cx), _n(cy + 6),
                                           _n(cx + 22), _n(cy + 14)), '#9CCFC8', 1.6,
                   'opacity=".22"'))
    b.append(flecks(rng, 34, '#FFFFFF', 0.34))
    b.append(flecks(rng, 26, '#8FC0B6', 0.22, lo=1.2, hi=3.4))
    return defs, b


def bg_amber():
    """Warm amber courtyard: sunlit tan floor, terrace rim, fallen leaves."""
    rng = random.Random(4409)
    defs = garden_defs() + [
        lin('field', [(0, '#FBF0CD'), (0.34, '#F3E2B4'), (0.7, '#E8D3A4'), (1, '#D8C191')],
            x1=0.12, x2=0.5),
        rad('sun', [(0, '#FFFCEB', 0.92), (0.5, '#FFF6DE', 0.42), (1, '#FFF2D6', 0)],
            cx=0.22, cy=0.07, r=0.8),
        rad('pool', [(0, '#FFE9AE', 0.4), (1, '#FFE9AE', 0)], cx=0.5, cy=0.5, r=0.5),
        lin('terra', [(0, '#F7E3BC'), (0.5, '#E4C79B'), (1, '#C8A97E')], x2=0.3),
        lin('dryLeaf', [(0, '#FBE0A4'), (0.5, '#E4BB78'), (1, '#BC8C50')], x2=0.5),
        lin('bed', [(0, '#F4E1B9'), (0.5, '#E5CCA2'), (1, '#D4B98E')], x1=0.2, x2=0.6),
    ]
    b = [P('M0 0H1600V900H0Z', 'url(#field)')]
    b.append(E(320, 60, 900, 620, 'url(#sun)'))
    b.append(E(1320, 880, 560, 380, 'url(#pool)', 'opacity=".5"'))
    bed, contour = border_bed(rng, shadow='#A8895F')
    b.append(bed)
    b.append(edge_fuzz(rng, contour, ('#B99A6A', '#C7A97A'), count=22))
    b.append(leaf_shadow(360, 300, 4.6, 62, '#C0A578', 0.1))
    b.append(leaf_shadow(1230, 640, 4.2, -66, '#C0A578', 0.09))
    b.append(foliage_mass(-40, 120, 2.2, '#C9B183', 0.4))
    b.append(foliage_mass(1610, 140, 2.1, '#C9B183', 0.36))
    b.append(foliage_mass(40, 850, 2.0, '#C0A97F', 0.34))
    b.append(foliage_mass(1560, 830, 2.0, '#C0A97F', 0.32))
    # Terrace slabs along the frame: a garden edge, not a road.
    for x, y, w, h, r in ((52, 226, 118, 46, -6), (60, 320, 104, 44, -3),
                          (46, 420, 112, 46, -8), (66, 520, 100, 42, -4),
                          (50, 622, 110, 46, -7), (70, 724, 100, 42, -2),
                          (1548, 210, 118, 46, 5), (1540, 306, 106, 44, 3),
                          (1552, 406, 112, 46, 7), (1538, 506, 100, 42, 4),
                          (1550, 608, 110, 46, 6), (1536, 706, 100, 42, 3),
                          (250, 882, 112, 44, -4), (392, 890, 100, 42, 2),
                          (1288, 886, 108, 44, 4), (1420, 892, 96, 42, -3)):
        b.append(paver(x, y, w, h, r))
    for x, y, s, a in ((150, 570, 0.7, 148), (1498, 262, 0.64, -142),
                       (1522, 690, 0.72, -160), (96, 186, 0.58, 132),
                       (1392, 852, 0.68, 168), (236, 930, 0.6, 176),
                       (1452, 160, 0.52, -128), (128, 356, 0.5, 118)):
        b.append(leaf(x, y, s, a, 'url(#dryLeaf)', '#FBF0CE'))
    b.append(leaf_group(rng, 1566, 452, 1.1, -50, 2, fill='url(#leaf2)'))
    b.append(leaf_group(rng, 44, 762, 1.0, 36, 2, fill='url(#leaf2)'))
    b.append(leaf_group(rng, 700, 16, 0.9, 172, 2, fill='url(#leaf2)', alpha=.6))
    b.append(leaf_group(rng, 1080, 12, 0.85, 190, 2, fill='url(#leaf2)', alpha=.55))
    b.append(grass(1452, 886, 1.1, '#B99A6A'))
    b.append(grass(184, 896, 1.05, '#B99A6A'))
    b.append(grass(1476, 300, 0.6, '#B99A6A', 'opacity=".8"'))
    b.append(daisy(1500, 942, 0.6))
    b.append(daisy(110, 862, 0.56))
    b.append(stone(1462, 786, 0.5))
    b.append(stone(96, 664, 0.44))
    b.append(dew(1560, 490, 6, 14))
    b.append(dew(112, 404, 5, 6))
    b.append(C(1494, 826, 7, '#E1B06A', 'opacity=".5"'))
    b.append(C(150, 300, 5.4, '#E7C583', 'opacity=".45"'))
    b.append(flecks(rng, 32, '#FFF3CE', 0.32))
    b.append(flecks(rng, 26, '#C08F55', 0.22, lo=1.2, hi=3.2))
    return defs, b


# ------------------------------------------------------------- nest structure


def nest_art(index):
    """Seedpod watch-nest: overlapping pod valves on a timber raft, owner roof."""
    O = owner_tone(index)
    defs = [
        rad('own', [(0, O['hi']), (0.38, O['base']), (0.82, O['deep']), (1, O['ink'])],
            cx=0.34, cy=0.18, r=0.95),
        lin('ownSoft', [(0, O['light']), (0.55, O['base']), (1, O['deep'])], x2=0.6),
        lin('wood', [(0, '#F1DEAF'), (0.42, '#CBB181'), (1, '#96815B')], x2=0.25),
        lin('woodLit', [(0, '#F9EDC6'), (0.5, '#E2CB98'), (1, '#B69A6C')], x2=0.3),
        lin('stone', [(0, '#FFF9E6'), (0.5, '#E9E2C7'), (1, '#C2C3A6')], x2=0.3),
        lin('brass', [(0, '#FFF2C4'), (0.5, '#DCBE7E'), (1, '#A88C57')], x2=0.3),
        rad('cavity', [(0, '#8AA08A'), (0.4, '#445F52'), (1, '#22332F')], cx=0.5, cy=0.18, r=0.95),
        lin('leaf', [(0, '#EDF5B4'), (0.42, '#93C177'), (1, '#47875C')], x2=0.62),
        lin('leaf2', [(0, '#F6F9C8'), (0.46, '#AFD48C'), (1, '#5E9A6C')], x2=0.58),
        rad('dew', [(0, '#FFFFFF', 0.96), (0.42, '#E4F7F1', 0.5), (1, '#5E9C92', 0.82)],
            cx=0.32, cy=0.2, r=0.95),
        rad('glow', [(0, '#FFF6D2', 0.85), (1, '#FFF0C2', 0)], cx=0.5, cy=0.5, r=0.5),
        '<filter id="soft"><feGaussianBlur stdDeviation="3.6"/></filter>',
        '<filter id="blur"><feGaussianBlur stdDeviation="9"/></filter>',
    ]
    b = []
    b.append('<g filter="url(#blur)" opacity=".34">')
    b.append(E(84, 148, 52, 9, '#82987A'))
    b.append(E(84, 144, 32, 5, '#63795D'))
    b.append('</g>')
    # Stone step, timber raft, then the pod body sitting on it.
    b.append(P('M24 141C38 131 122 131 138 141C145 148 120 154 81 154'
               'C42 154 17 148 24 141Z', 'url(#stone)', 'stroke="#ACA98B" stroke-width="1.3"'))
    b.append(L('M32 139C52 131 112 131 132 139', '#FFFCF0', 2.2, 'opacity=".5"'))
    b.append(P('M28 133C42 123 120 123 134 133C141 140 118 146 81 146'
               'C44 146 21 140 28 133Z', 'url(#wood)', 'stroke="#8F7A54" stroke-width="1.3"'))
    b.append(L('M38 131C58 124 106 124 126 131', '#F7E8BC', 2.2, 'opacity=".55"'))
    b.append(P('M30 132C21 116 23 93 37 74C49 56 65 46 81 46C97 46 113 56 125 74'
               'C139 93 141 116 132 132Z', 'url(#own)',
               'stroke="%s" stroke-width="2.3" stroke-linejoin="round"' % O['ink']))
    # Three overlapping valves read as a seedpod rather than a smooth dome.
    b.append(P('M31 131C22 115 25 92 39 73C48 59 61 49 74 46C61 69 55 99 55 131Z',
               'url(#ownSoft)',
               'stroke="%s" stroke-width="1.6" stroke-linejoin="round"' % O['deep']))
    b.append(P('M131 131C140 115 137 92 123 73C114 59 101 49 88 46C101 69 107 99 107 131Z',
               'url(#ownSoft)',
               'stroke="%s" stroke-width="1.6" stroke-linejoin="round"' % O['deep']))
    b.append(P('M55 131C58 101 64 72 81 53C98 72 104 101 107 131Z', 'url(#own)',
               'stroke="%s" stroke-width="1.7" stroke-linejoin="round"' % O['ink']))
    b.append(L('M57 129C60 100 66 73 81 55C96 73 102 100 105 129', O['hi'], 1.3, 'opacity=".5"'))
    # Pod ribs, rim light and a shadowed flank give the volume its scale.
    b.append(L('M33 117C52 125 110 125 129 117', O['deep'], 1.7, 'opacity=".42"'))
    b.append(L('M36 127C54 134 108 134 126 127', O['deep'], 1.7, 'opacity=".32"'))
    b.append(L('M39 75C50 57 65 48 79 46', O['hi'], 3.4, 'opacity=".58"'))
    b.append(L('M131 130C140 113 140 90 127 69', O['dark'], 3.6, 'opacity=".7"'))
    # Short seed tip instead of a flame-like fin.
    b.append(P('M81 47C78 41 79 34 84 29C88 35 89 42 85 47Z', 'url(#ownSoft)',
               'stroke="%s" stroke-width="1.2" stroke-linejoin="round"' % O['deep']))
    b.append(L('M82 45C81 39 82 35 84 32', O['hi'], 1.2, 'opacity=".65"'))
    # Doorway keeps timber, stone and a warm interior, never the owner colour.
    b.append(P('M62 132V104C62 92 70 85 81 85C92 85 100 92 100 104V132Z',
               'url(#woodLit)', 'stroke="#8E7952" stroke-width="1.4"'))
    b.append(P('M68 132V106C68 97 74 92 81 92C88 92 94 97 94 106V132Z',
               'url(#cavity)', 'stroke="#3A5048" stroke-width="1"'))
    b.append(E(81, 127, 8, 7, 'url(#glow)', 'opacity=".7"'))
    b.append(L('M72 132V106C72 100 75 96 78 94', '#DFEDDE', 1.5, 'opacity=".4"'))
    b.append(C(81, 118, 2.2, '#FFF7D8', 'opacity=".8"'))
    b.append(P('M58 132H104L109 140H53Z', 'url(#stone)', 'stroke="#A9A98C" stroke-width="1.1"'))
    b.append(C(64, 100, 1.4, '#FFF4CC', 'opacity=".85"'))
    b.append(C(98, 100, 1.4, '#FFF4CC', 'opacity=".85"'))
    # Lamp above the arch and two small warm windows on the valves.
    b.append(E(81, 78, 8.5, 8.5, 'url(#glow)'))
    b.append(C(81, 78, 3.2, '#FFF6D2'))
    b.append(C(81, 78, 1.4, '#FFFEF4'))
    for wx in (48, 114):
        b.append(P('M%d 105V100C%d 96 %d 94 %d 94C%d 94 %d 96 %d 100V105Z'
                   % (wx - 4, wx - 4, wx - 2, wx, wx + 2, wx + 4, wx + 4),
                   'url(#wood)', 'stroke="#8E7952" stroke-width="1"'))
        b.append(E(wx, 101, 2.4, 2.4, '#FFF6D4', 'opacity=".92"'))
    # Miniature garden details only; no salad of base leaves.
    b.append(E(46, 148, 4.2, 2.4, 'url(#stone)', 'stroke="#ACA98B" stroke-width=".8"'))
    b.append(E(117, 149, 3.6, 2.2, 'url(#stone)', 'stroke="#ACA98B" stroke-width=".8"'))
    b.append(grass(56, 152, 0.3, '#87AC6C'))
    b.append(grass(106, 153, 0.28, '#87AC6C'))
    b.append(E(50, 94, 3.6, 4.4, 'url(#dew)'))
    b.append(C(48.9, 92.4, 1, '#FFFFFF', 'opacity=".9"'))
    b.append(C(120, 76, 1.8, '#FFFCEF', 'opacity=".8"'))
    return (160, 160), defs, b

# ----------------------------------------------------------- cannon structure


def cannon_art(index):
    """Resonance cannon: owner-coloured horn on a bright timber cradle."""
    O = owner_tone(index)
    defs = [
        rad('own', [(0, O['hi']), (0.36, O['base']), (0.8, O['deep']), (1, O['ink'])],
            cx=0.3, cy=0.22, r=0.95),
        lin('ownSoft', [(0, O['light']), (0.55, O['mid']), (1, O['deep'])], x2=0.4),
        lin('wood', [(0, '#F1DEAF'), (0.42, '#CBB181'), (1, '#96815B')], x2=0.25),
        lin('woodLit', [(0, '#F9EDC6'), (0.5, '#E2CB98'), (1, '#B69A6C')], x2=0.3),
        lin('stone', [(0, '#FFF9E6'), (0.5, '#E9E2C7'), (1, '#C2C3A6')], x2=0.3),
        lin('copper', [(0, '#FFF2C4'), (0.45, '#DABC7C'), (1, '#A2874F')], x2=0.3),
        rad('cavity', [(0, '#8AA08A'), (0.42, '#415C50'), (1, '#22332F')], cx=0.5, cy=0.2, r=0.95),
        lin('leaf', [(0, '#EDF5B4'), (0.42, '#93C177'), (1, '#47875C')], x2=0.62),
        lin('leaf2', [(0, '#F6F9C8'), (0.46, '#AFD48C'), (1, '#5E9A6C')], x2=0.58),
        rad('dew', [(0, '#FFFFFF', 0.96), (0.42, '#E4F7F1', 0.5), (1, '#5E9C92', 0.82)],
            cx=0.32, cy=0.2, r=0.95),
        rad('glow', [(0, '#FFF6D2', 0.9), (1, '#FFF0C2', 0)], cx=0.5, cy=0.5, r=0.5),
        '<filter id="soft"><feGaussianBlur stdDeviation="3.6"/></filter>',
        '<filter id="blur"><feGaussianBlur stdDeviation="9"/></filter>',
    ]
    b = []
    b.append('<g filter="url(#blur)" opacity=".36">')
    b.append(E(84, 148, 50, 8.4, '#82987A'))
    b.append(E(84, 144, 30, 4.4, '#63795D'))
    b.append('</g>')
    # Stone plinth and the timber cradle that carries the horn.
    b.append(P('M22 139C36 127 126 127 140 139C148 147 122 154 81 154'
               'C40 154 14 147 22 139Z', 'url(#stone)', 'stroke="#ACA98B" stroke-width="1.3"'))
    b.append(L('M30 138C52 129 112 129 134 138', '#FFFCF0', 2.4, 'opacity=".5"'))
    b.append(P('M30 133L44 117H118L132 130L118 140H44Z', 'url(#wood)',
               'stroke="#8F7A54" stroke-width="1.3"'))
    b.append(L('M45 120H117', '#F7E8BC', 2.2, 'opacity=".55"'))
    # A-frame legs are wider than the barrel so the silhouette stays a tripod.
    b.append(P('M46 137L62 79L74 83L58 139Z', 'url(#wood)',
               'stroke="#8F7A54" stroke-width="1.3"'))
    b.append(P('M116 138L100 85L88 89L104 140Z', 'url(#wood)',
               'stroke="#8F7A54" stroke-width="1.3"'))
    b.append(L('M52 113L110 123', '#A88E60', 5))
    b.append(L('M52 110L110 120', '#EBD8A8', 1.8, 'opacity=".55"'))
    # Horn: one large ownership block with a flared copper mouth.
    b.append('<g transform="translate(84 84) rotate(-36)">')
    b.append(P('M-52-15C-63-15-65 15-52 15Z', 'url(#ownSoft)',
               'stroke="%s" stroke-width="1.4" stroke-linejoin="round"' % O['ink']))
    b.append(P('M-52-13H10C22-13 30-12 36-8C40-5 42-2 42 0C42 2 40 5 36 8'
               'C30 12 22 13 10 13H-52Z', 'url(#own)',
               'stroke="%s" stroke-width="1.9" stroke-linejoin="round"' % O['ink']))
    b.append(L('M-48-9H8', O['hi'], 2.8, 'opacity=".6"'))
    b.append(L('M-50 10H8C22 10 32 6 40 1', O['dark'], 3, 'opacity=".72"'))
    b.append(L('M-34-11C-30-4-30 4-34 11', O['deep'], 1.5, 'opacity=".5"'))
    b.append(L('M-14-11C-10-4-10 4-14 11', O['deep'], 1.5, 'opacity=".45"'))
    b.append(P(rrect(-36, -15.5, 9, 31, 2.4), 'url(#copper)', 'stroke="#96824F" stroke-width="1"'))
    b.append(P(rrect(-6, -15.5, 9, 31, 2.4), 'url(#copper)', 'stroke="#96824F" stroke-width="1"'))
    b.append(L('M-34-13V13M-4-13V13', '#FFF5CE', 1.1, 'opacity=".6"'))
    b.append(P('M20-13C36-13 46-20 50-22C54-16 56 16 50 22C46 20 36 13 20 13Z',
               'url(#copper)', 'stroke="#8E7A4C" stroke-width="1.3"'))
    b.append(E(49, 0, 5, 15, 'url(#cavity)', 'stroke="#6E6444" stroke-width="1"'))
    b.append(E(49, 0, 3, 9.4, 'url(#glow)', 'opacity=".92"'))
    b.append(C(49, 0, 1.4, '#FFFCEF'))
    b.append(E(-20, 0, 3.4, 3.4, 'url(#copper)', 'stroke="#8E7A4C" stroke-width=".9"'))
    b.append('</g>')
    # Timber fork and rope lashing under the horn.
    b.append(P('M72 130L86 98L96 102L84 132Z', 'url(#woodLit)',
               'stroke="#957F57" stroke-width="1.2"'))
    b.append(L('M85 104L93 100', '#F7E8BC', 1.6, 'opacity=".6"'))
    b.append(L('M74 122L96 118M74 126L96 122', '#A88E60', 2.4, 'opacity=".7"'))
    # Muzzle spark, grass and dew at miniature scale.
    b.append(E(128, 50, 14, 14, 'url(#glow)'))
    b.append(C(126, 52, 2.6, '#FFF9DC'))
    b.append(P('M126 43L129 50L126 57L123 50Z', '#FFF6CE', 'opacity=".85"'))
    b.append(E(126, 149, 3.8, 2.2, 'url(#stone)', 'stroke="#ACA98B" stroke-width=".8"'))
    b.append(grass(58, 153, 0.3, '#87AC6C'))
    b.append(grass(104, 154, 0.28, '#87AC6C'))
    b.append(E(136, 134, 3.6, 4.4, 'url(#dew)'))
    b.append(C(134.9, 132.4, 1, '#FFFFFF', 'opacity=".9"'))
    return (160, 160), defs, b

# -------------------------------------------------------------- insect frames

JOINT = '#6B5B44'
JOINT_LIGHT = '#C9B88F'
BUG_INK = '#4A4030'


def leg(ax, ay, kx, ky, tx, ty, w):
    d = 'M%s %sL%s %sL%s %s' % (_n(ax), _n(ay), _n(kx), _n(ky), _n(tx), _n(ty))
    return L(d, BUG_INK, w + 0.38) + L(d, JOINT, w)


def bug_defs(index):
    O = owner_tone(index)
    d = [
        rad('own', [(0, O['hi']), (0.34, O['light']), (0.8, O['base']), (1, O['deep'])],
            cx=0.34, cy=0.24, r=0.96),
        lin('shell', [(0, O['light']), (1, O['deep'])], x2=0.35),
        rad('eye', [(0, '#4E655B'), (0.5, '#26362F'), (1, '#16211E')], cx=0.34, cy=0.24, r=0.9),
    ]
    for f in range(4):
        d.append('<clipPath id="cell%d" clipPathUnits="userSpaceOnUse">'
                 '<rect x="0" y="0" width="24" height="32"/></clipPath>' % f)
    return O, d


def cell_agile(f, O):
    o = [E(12, 27.5, 5, 1.8, '#7E9670', 'opacity=".16"')]
    for side in (-1, 1):
        for k in range(3):
            ph = math.sin((f / 4.0 + k * 0.3 + (0 if side < 0 else 0.5)) * math.tau) * 1.15
            ax, ay = 12 + side * 2.1, 12.6 + k * 3.0
            kx, ky = 12 + side * (5.0 + k * 0.5), 10.4 + k * 5.4 + ph
            tx, ty = 12 + side * (7.8 + k * 0.6), 8.8 + k * 8.0 - ph * 0.7
            o.append(leg(ax, ay, kx, ky, tx, ty, 1.0))
            o.append(C(kx, ky, 0.62, JOINT_LIGHT))
    # Gaster, narrow petiole, thorax and head: a natural ant silhouette.
    o.append(P('M12 18.1C15.1 18.4 16.9 21.2 16.7 24.3C16.5 27 14.6 28.6 12 28.6'
               'C9.4 28.6 7.5 27 7.3 24.3C7.1 21.2 8.9 18.4 12 18.1Z', 'url(#own)',
               'stroke="%s" stroke-width=".8"' % O['ink']))
    o.append(L('M9.6 21.2C9.2 23.2 9.6 25.2 10.8 26.6', O['hi'], .8, 'opacity=".55"'))
    o.append(P('M11 16.6H13V19.6H11Z', O['deep']))
    o.append(P('M12 10.2C13.9 10.4 14.9 12.2 14.9 14.1C14.9 16.1 13.8 17.6 12 17.6'
               'C10.2 17.6 9.1 16.1 9.1 14.1C9.1 12.2 10.1 10.4 12 10.2Z', 'url(#own)',
               'stroke="%s" stroke-width=".8"' % O['ink']))
    o.append(P('M12 5C13.9 5 15.2 6.5 15.2 8.4C15.2 10.3 13.9 11.4 12 11.4'
               'C10.1 11.4 8.8 10.3 8.8 8.4C8.8 6.5 10.1 5 12 5Z', 'url(#own)',
               'stroke="%s" stroke-width=".8"' % O['ink']))
    o.append(E(11.2, 7, 1.5, 1, O['hi'], 'opacity=".45"'))
    o.append(P('M10.6 5C10 4.1 10.1 3.2 10.9 2.6C11 3.5 11.3 4.2 11.9 4.7Z', JOINT))
    o.append(P('M13.4 5C14 4.1 13.9 3.2 13.1 2.6C13 3.5 12.7 4.2 12.1 4.7Z', JOINT))
    for ex in (9.9, 14.1):
        o.append(E(ex, 8.2, 0.78, 1, 'url(#eye)'))
        o.append(C(ex - 0.15 if ex < 12 else ex + 0.15, 7.8, 0.26, '#FFFFFF', 'opacity=".85"'))
    o.append(L('M10.6 5.4C9.8 4.6 9.2 3.6 9 2.8L8.9 2.6', JOINT, 0.8))
    o.append(L('M8.9 2.6L7.8 1.7', JOINT, 0.7))
    o.append(L('M13.4 5.4C14.2 4.6 14.8 3.6 15 2.8L15.1 2.6', JOINT, 0.8))
    o.append(L('M15.1 2.6L16.2 1.7', JOINT, 0.7))
    o.append(C(7.8, 1.7, 0.44, '#C8B183'))
    o.append(C(16.2, 1.7, 0.44, '#C8B183'))
    return o


def cell_fast(f, O):
    o = [E(12, 27.6, 4.4, 1.6, '#7E9670', 'opacity=".14"')]
    for side in (-1, 1):
        for k in range(3):
            ph = math.sin((f / 4.0 + k * 0.32 + (0 if side < 0 else 0.52)) * math.tau) * 1.5
            ax, ay = 12 + side * 1.9, 12.2 + k * 2.9
            kx, ky = 12 + side * (6.2 + k * 0.4), 10.2 + k * 5.6 + ph
            tx, ty = 12 + side * (9.0 + k * 0.2), 8.4 + k * 8.6 - ph * 0.8
            o.append(leg(ax, ay, kx, ky, tx, ty, 0.82))
            o.append(C(kx, ky, 0.5, JOINT_LIGHT))
    # Needle-legged runner: slim lanceolate abdomen and a small head.
    o.append(P('M12 16.8C14 17.6 14.9 20.8 14.6 23.8C14.3 26.6 13.2 28 12 28.2'
               'C10.8 28 9.7 26.6 9.4 23.8C9.1 20.8 10 17.6 12 16.8Z', 'url(#own)',
               'stroke="%s" stroke-width=".72"' % O['ink']))
    o.append(L('M12.7 28C13.4 26.2 13.7 23.4 13.5 20.6', O['hi'], .7, 'opacity=".5"'))
    o.append(L('M11.2 27.6L10.4 29.6', JOINT, 0.75))
    o.append(L('M12.8 27.6L13.6 29.6', JOINT, 0.75))
    o.append(P('M12 9.4C13.4 9.6 14.1 11.6 14.1 14.2C14.1 16.6 13.2 17.8 12 17.8'
               'C10.8 17.8 9.9 16.6 9.9 14.2C9.9 11.6 10.6 9.6 12 9.4Z', 'url(#own)',
               'stroke="%s" stroke-width=".72"' % O['ink']))
    o.append(P('M12 5.4C13.4 5.4 14.4 6.6 14.4 8C14.4 9.5 13.4 10.4 12 10.4'
               'C10.6 10.4 9.6 9.5 9.6 8C9.6 6.6 10.6 5.4 12 5.4Z', 'url(#own)',
               'stroke="%s" stroke-width=".72"' % O['ink']))
    o.append(P('M10.9 5.4C10.5 4.6 10.6 3.9 11.2 3.4C11.3 4.1 11.5 4.6 11.9 5Z', JOINT))
    o.append(P('M13.1 5.4C13.5 4.6 13.4 3.9 12.8 3.4C12.7 4.1 12.5 4.6 12.1 5Z', JOINT))
    for ex in (10.5, 13.5):
        o.append(E(ex, 7.9, 0.62, 0.82, 'url(#eye)'))
        o.append(C(ex - 0.1 if ex < 12 else ex + 0.1, 7.6, 0.2, '#FFFFFF', 'opacity=".8"'))
    o.append(L('M10.8 5.8C9.8 4.7 9 3.4 8.6 2.4L7.6 1.3', JOINT, 0.72))
    o.append(L('M13.2 5.8C14.2 4.7 15 3.4 15.4 2.4L16.4 1.3', JOINT, 0.72))
    o.append(C(7.6, 1.3, 0.38, '#C8B183'))
    o.append(C(16.4, 1.3, 0.38, '#C8B183'))
    o.append(L('M11 13.4C11.4 15.4 11.4 16.6 11.2 17.4', O['hi'], .6, 'opacity=".5"'))
    return o


def cell_strong(f, O):
    o = [E(12, 27.8, 6.2, 2, '#7E9670', 'opacity=".16"')]
    for side in (-1, 1):
        for k in range(3):
            ph = math.sin((f / 4.0 + k * 0.34 + (0 if side < 0 else 0.5)) * math.tau) * 0.9
            ax, ay = 12 + side * 3.2, 13.4 + k * 3.4
            kx, ky = 12 + side * (6.0 + k * 0.3), 11.6 + k * 5.4 + ph
            tx, ty = 12 + side * (8.3 + k * 0.1), 9.8 + k * 8.4 - ph * 0.6
            o.append(leg(ax, ay, kx, ky, tx, ty, 1.62))
            o.append(C(kx, ky, 0.95, JOINT_LIGHT))
    # Armoured beetle: broad elytra over a short head with a blunt horn.
    o.append(P('M12 9.2C15.8 9.4 18.3 12.8 18.5 17.6C18.7 22.6 16.4 27.2 12 27.6'
               'C7.6 27.2 5.3 22.6 5.5 17.6C5.7 12.8 8.2 9.4 12 9.2Z', 'url(#own)',
               'stroke="%s" stroke-width="1.15"' % O['ink']))
    o.append(L('M8.6 13.6C7.6 18 7.9 22.4 9 25.6', O['hi'], 1.4, 'opacity=".5"'))
    o.append(L('M12 10.6V26.8', O['deep'], 1, 'opacity=".55"'))
    o.append(P('M12 6.2C15 6.2 16.8 7.8 16.9 10C15.4 11.4 8.6 11.4 7.1 10'
               'C7.2 7.8 9 6.2 12 6.2Z', 'url(#shell)',
               'stroke="%s" stroke-width="1"' % O['ink']))
    o.append(P('M12 3.9C13.6 3.9 14.7 4.8 14.7 6C14.7 7.2 13.6 7.9 12 7.9'
               'C10.4 7.9 9.3 7.2 9.3 6C9.3 4.8 10.4 3.9 12 3.9Z', 'url(#own)',
               'stroke="%s" stroke-width=".9"' % O['ink']))
    o.append(P('M11 4.2L11.6 1.9H12.4L13 4.2Z', 'url(#shell)',
               'stroke="%s" stroke-width=".8"' % O['ink']))
    for ex in (10.4, 13.6):
        o.append(E(ex, 6.2, 0.55, 0.72, 'url(#eye)'))
        o.append(C(ex, 5.9, 0.18, '#FFFFFF', 'opacity=".8"'))
    o.append(L('M10.6 4.4C9.8 3.6 9.3 3.1 9 2.6', JOINT, 0.9))
    o.append(L('M13.4 4.4C14.2 3.6 14.7 3.1 15 2.6', JOINT, 0.9))
    o.append(E(8.9, 2.5, 1, 0.85, '#C8B183', 'stroke="%s" stroke-width=".4"' % BUG_INK))
    o.append(E(15.1, 2.5, 1, 0.85, '#C8B183', 'stroke="%s" stroke-width=".4"' % BUG_INK))
    o.append(L('M9.4 18.6C10.4 20.6 10.8 23 10.4 25.4', O['hi'], 0.9, 'opacity=".35"'))
    return o


def bug_art(index, kind):
    O, defs = bug_defs(index)
    body = []
    for f in range(4):
        if kind == 'agile':
            cells = cell_agile(f, O)
        elif kind == 'fast':
            cells = cell_fast(f, O)
        else:
            cells = cell_strong(f, O)
        body.append('<g transform="translate(%d 0)" data-frame="%d" data-bounds="0 0 24 32">'
                    '<g clip-path="url(#cell%d)">%s</g></g>' % (f * 24, f, f, ''.join(cells)))
    return (96, 32), defs, body

# -------------------------------------------------------------------- emblem


def emblem_art():
    """Seed-core beetle inside a ring of thirteen watch-lights. Bright, not gilded."""
    defs = [
        lin('ivory', [(0, '#FFFDF4'), (0.55, '#F9F0D8'), (1, '#E6D9B6')], x2=0.4),
        lin('sage', [(0, '#E8F2D2'), (0.55, '#C2DAA8'), (1, '#9CC08C')], x2=0.35),
        lin('cream', [(0, '#FFFCEB'), (1, '#F0E0BA')], x2=0.4),
        rad('halo', [(0, '#FFFDF0', 0.96), (0.55, '#FCF8E2', 0.55), (1, '#F8F4DE', 0)],
            cx=0.5, cy=0.5, r=0.5),
        rad('seed', [(0, '#FFF8D2'), (0.32, '#F4D384'), (0.72, '#E0AE5C'), (1, '#BE8B42')],
            cx=0.38, cy=0.3, r=0.85),
        rad('lamp', [(0, '#FFFEF6'), (0.45, '#FCE8B2'), (1, '#E4BE74')], cx=0.35, cy=0.3, r=0.8),
        lin('ring', [(0, '#E9F1DA'), (1, '#C8DAB6')], x2=0.6),
        rad('warm', [(0, '#FFEFC0', 0.9), (1, '#FFEFC0', 0)], cx=0.5, cy=0.5, r=0.5),
        lin('leaf', [(0, '#E4F1AE'), (0.45, '#9BC47C'), (1, '#5E9A6C')], x2=0.62),
        lin('leaf2', [(0, '#F6F9C8'), (0.46, '#AFD48C'), (1, '#5E9A6C')], x2=0.58),
        rad('eye', [(0, '#4E655B'), (0.5, '#26362F'), (1, '#16211E')], cx=0.35, cy=0.25, r=0.9),
        '<filter id="soft"><feGaussianBlur stdDeviation="5"/></filter>',
        '<filter id="blur"><feGaussianBlur stdDeviation="2.4"/></filter>',
    ]
    b = [C(128, 128, 126, 'url(#halo)')]
    # Ring of thirteen returning lights.
    b.append(C(128, 128, 110, 'none', 'stroke="url(#ring)" stroke-width="2.4"'))
    b.append(C(128, 128, 99, 'none', 'stroke="#EAF1DC" stroke-width="1.4"'))
    for j in range(13):
        a = -math.pi / 2 + j * math.tau / 13
        ca, sa = math.cos(a), math.sin(a)
        b.append(L('M%s %sL%s %s' % (_n(128 + ca * 112), _n(128 + sa * 112),
                                     _n(128 + ca * 118), _n(128 + sa * 118)),
                   '#D9E5C6', 1.6, 'opacity=".9"'))
        lx, ly = 128 + ca * 104.5, 128 + sa * 104.5
        b.append(C(lx, ly, 9, 'url(#warm)'))
        b.append(C(lx, ly, 4.4, 'url(#lamp)', 'stroke="#DCBF81" stroke-width=".8"'))
        b.append(C(lx - 1.1, ly - 1.3, 1.2, '#FFFDF2', 'opacity=".9"'))
    b.append(E(128, 208, 46, 10, '#8C9C78', 'opacity=".16" filter="url(#soft)"'))
    # Six small legs keep it an insect, not a heraldic crest.
    for sx in (-1, 1):
        for k, (y0, y1, y2) in enumerate(((122, 138, 150), (140, 158, 172), (160, 178, 192))):
            x0, x1, x2 = 128 + sx * 20, 128 + sx * (36 + k * 1.5), 128 + sx * (46 + k * 2)
            b.append(L('M%s %sQ%s %s %s %s' % (_n(x0), _n(y0), _n(x1), _n(y1), _n(x2), _n(y2)),
                       '#7C8E6C', 3.4))
            b.append(C(x2, y2, 2, '#C9BC93'))
    # Elytra, pronotum, head, antennae.
    b.append(P('M128 106C106 108 96 128 98 152C100 178 112 196 128 202'
               'C144 196 156 178 158 152C160 128 150 108 128 106Z', 'url(#ivory)',
               'stroke="#D8CBA6" stroke-width="2"'))
    b.append(P('M104 142C104 124 112 111 126 108C112 126 108 148 112 170'
               'C104 164 104 152 104 142Z', 'url(#sage)', 'opacity=".45"'))
    b.append(L('M128 110V198', '#D5C8A2', 2.2, 'opacity=".8"'))
    b.append(L('M108 130C112 117 120 111 128 109', '#FFFDF0', 2.6, 'opacity=".7"'))
    b.append(P('M128 92C140 92 149 100 150 112C143 120 113 120 106 112'
               'C107 100 116 92 128 92Z', 'url(#sage)', 'stroke="#9FBF8E" stroke-width="1.6"'))
    b.append(P('M128 78C136 78 142 84 142 92C142 98 136 102 128 102'
               'C120 102 114 98 114 92C114 84 120 78 128 78Z', 'url(#cream)',
               'stroke="#D8CAA4" stroke-width="1.6"'))
    b.append(L('M118 80Q106 72 100 58', '#7C8E6C', 3.2))
    b.append(L('M138 80Q150 72 156 58', '#7C8E6C', 3.2))
    b.append(C(100, 58, 3.2, '#E4C179'))
    b.append(C(156, 58, 3.2, '#E4C179'))
    for ex in (121, 135):
        b.append(E(ex, 92, 2.4, 3, 'url(#eye)'))
        b.append(C(ex - 0.6 if ex < 128 else ex + 0.6, 90.6, 0.9, '#EFF7EC', 'opacity=".8"'))
    # The seed core is the brightest thing in the emblem.
    b.append(E(128, 154, 22, 28, 'url(#warm)', 'opacity=".6"'))
    b.append(P('M128 132C116 142 112 158 128 176C144 158 140 142 128 132Z', 'url(#seed)',
               'stroke="#DDB76C" stroke-width="1.4"'))
    b.append(P('M128 140C122 148 121 158 128 167C135 158 134 148 128 140Z', '#FFF8D8',
               'opacity=".55"'))
    b.append(C(124, 150, 2.6, '#FFFDF0', 'opacity=".9"'))
    b.append(leaf(78, 208, 0.62, -42, 'url(#leaf)'))
    b.append(leaf(178, 208, 0.58, 42, 'url(#leaf2)'))
    b.append(C(174, 132, 2.6, '#FFFCEF', 'opacity=".8"'))
    return (256, 256), defs, b

# --------------------------------------------------------------- write+verify


def build():
    for kind, fn in (('meadow', bg_meadow), ('roots', bg_roots),
                     ('marsh', bg_marsh), ('amber', bg_amber)):
        defs, body = fn()
        svg_write('background-%s.svg' % kind, 1600, 900, defs, body)

    for index in range(5):
        (w, h), defs, body = nest_art(index)
        svg_write('nest-%d.svg' % index, w, h, defs, body)
        (w, h), defs, body = cannon_art(index)
        svg_write('cannon-%d.svg' % index, w, h, defs, body)
        for kind in ('agile', 'fast', 'strong'):
            (w, h), defs, body = bug_art(index, kind)
            svg_write('bug-%s-%d.svg' % (kind, index), w, h, defs, body)

    # Compatibility entries: neutral buildings for owner 0, blue insects for the UI.
    for kind in ('nest', 'cannon'):
        (ART / ('%s.svg' % kind)).write_bytes((ART / ('%s-0.svg' % kind)).read_bytes())
    for kind in ('agile', 'fast', 'strong'):
        (ART / ('bug-%s.svg' % kind)).write_bytes((ART / ('bug-%s-1.svg' % kind)).read_bytes())

    (w, h), defs, body = emblem_art()
    svg_write('emblem.svg', w, h, defs, body)


def verify():
    expected = {'background-%s.svg' % k: (1600, 900) for k in ('meadow', 'roots', 'marsh', 'amber')}
    expected.update({'%s-%d.svg' % (k, i): (160, 160) for k in ('nest', 'cannon') for i in range(5)})
    expected.update({'%s.svg' % k: (160, 160) for k in ('nest', 'cannon')})
    expected.update({'bug-%s-%d.svg' % (k, i): (96, 32)
                     for k in ('agile', 'fast', 'strong') for i in range(5)})
    expected.update({'bug-%s.svg' % k: (96, 32) for k in ('agile', 'fast', 'strong')})
    expected['emblem.svg'] = (256, 256)

    ns = {'s': 'http://www.w3.org/2000/svg'}
    report = []
    for name, (w, h) in sorted(expected.items()):
        root = ET.parse(ART / name).getroot()
        assert root.get('width') == str(w) and root.get('height') == str(h), name
        assert root.get('viewBox') == '0 0 %d %d' % (w, h), name
        ids = {e.get('id') for e in root.iter() if e.get('id')}
        for e in root.iter():
            assert not e.tag.endswith('script'), name
            assert not e.tag.endswith('image'), name
            for k, v in e.attrib.items():
                assert 'href' not in k, (name, k)
                assert 'http' not in v, (name, k)
                if 'url(' in v:
                    assert v.startswith('url(#') and v[5:-1] in ids, (name, v)
        if name.startswith('bug-'):
            frames = root.findall('s:g', ns)
            assert len(frames) == 4, name
            for i, g in enumerate(frames):
                assert g.get('transform') == 'translate(%d 0)' % (24 * i), (name, i)
                assert g.get('data-bounds') == '0 0 24 32', (name, i)
                clip = root.find('.//s:clipPath[@id="cell%d"]' % i, ns)
                assert clip.get('clipPathUnits') == 'userSpaceOnUse', (name, i)
                assert clip[0].attrib == {'x': '0', 'y': '0', 'width': '24', 'height': '32'}, (name, i)
                assert g[0].get('clip-path') == 'url(#cell%d)' % i, (name, i)
        report.append('PASS %s: XML, %dx%d, local references only%s'
                      % (name, w, h, '; four clipped 24x32 frames' if name.startswith('bug-') else ''))
    return report


if __name__ == '__main__':
    build()
    print('\n'.join(verify()))
    print('cover.svg is authored by scripts/generate-cover.cjs and was not touched.')
