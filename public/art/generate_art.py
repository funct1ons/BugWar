"""Original procedural vector artwork for BugWar; standard library only."""
from pathlib import Path
import math
import xml.etree.ElementTree as ET
P=Path(__file__).parent

def svg(name,w,h,body,defs=''):
    text=f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>{defs}</defs>{body}</svg>'''
    (P/name).write_text(text,encoding='utf-8')

def path(d,fill,stroke='#172f29',sw=2,extra=''):
    return f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round" {extra}/>'
def ellipse(x,y,rx,ry,fill,stroke='none',sw=1,extra=''):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>'
def leaf(x,y,s,angle,color):
    b=f'<g transform="translate({x} {y}) rotate({angle}) scale({s})">'
    b+=path('M0 0 C-28 -30 -20 -76 0 -100 C20 -71 24 -28 0 0Z',color,'#203d30',1.6)
    b+=path('M0 -3 C-24 -34 -17 -77 0 -98 Q-7 -49 0 -3Z','#e5e8ac','none',0,extra='opacity=".12"')
    b+=path('M1 -7 Q16 -45 1 -94 Q22 -57 13 -28Z','#0c3329','none',0,extra='opacity=".18"')
    for j in range(6):
        yv=-17-j*12; reach=17*math.sin((j+1)*math.pi/8)
        b+=path(f'M-2 {yv} Q{-reach*.7:.2f} {yv-3} {-reach:.2f} {yv-13} M-2 {yv-3} Q{reach*.6:.2f} {yv-7} {reach:.2f} {yv-17}','none','#d0d6a1',.75,extra='opacity=".35"')
    b+=path('M0 -3 Q-5 -45 0 -89','none','#dce1ac',1.2,extra='opacity=".55"')
    return b+'</g>'

palettes={
'meadow':('#8ea76b','#415d3d','#c9c28a','#293e2c','#8eaf58','#d7e5ac'),
'roots':('#284d3b','#122f2b','#687b4a','#102723','#447d54','#aac38a'),
'marsh':('#51867d','#183f48','#90b8a2','#12333c','#4a9c81','#b2e9d3'),
'amber':('#a88443','#4f4430','#d2b36d','#302e25','#a98d47','#f7dda0')}
for biome,(light,dark,soil,ink,green,glow) in palettes.items():
    defs=f'''<radialGradient id="ground" cx="50%" cy="45%" r="72%"><stop stop-color="{light}"/><stop offset=".58" stop-color="{dark}"/><stop offset="1" stop-color="{ink}"/></radialGradient><radialGradient id="arena"><stop stop-color="{soil}" stop-opacity=".48"/><stop offset="1" stop-color="{soil}" stop-opacity="0"/></radialGradient><linearGradient id="rock" x2=".7" y2="1"><stop stop-color="{soil}"/><stop offset="1" stop-color="{ink}"/></linearGradient><radialGradient id="dew" cx="30%" cy="25%"><stop stop-color="#fff7d4"/><stop offset=".3" stop-color="{glow}" stop-opacity=".8"/><stop offset="1" stop-color="{glow}" stop-opacity="0"/></radialGradient>'''
    b='<rect width="1600" height="900" fill="url(#ground)"/>'
    b+=ellipse(800,458,790,365,'url(#arena)')
    # Contoured soil beds: intentionally aligned around the playable clearing.
    for i in range(9):
        y=270+i*52
        b+=path(f'M80 {y+30} C350 {y-40} 480 {y+45} 760 {y} S1240 {y-30} 1530 {y+18}','none',glow,.8,extra='opacity=".065"')
    if biome=='marsh':
        for x,y,rx in [(270,360,230),(1230,570,275),(790,720,340)]:
            b+=ellipse(x,y,rx,45,'#397e80',extra='opacity=".24"')
            for k in range(5):
                b+=path(f'M{x-rx+k*18} {y+k*6} Q{x} {y+28+k*6} {x+rx-k*18} {y+k*6}','none',glow,1,extra='opacity=".18"')
    # Authored islands of ground detail; no high-frequency noise over the whole field.
    # Elliptical quiet zones protect the four nests visible in the integration capture.
    quiet=[(320,480,105,80),(730,335,110,85),(845,655,115,85),(1275,480,110,85)]
    clusters=[(290,290,64),(470,345,80),(650,230,70),(940,270,95),
              (1190,305,80),(1360,360,50),(440,585,85),(600,490,100),
              (840,470,75),(1040,420,80),(1110,595,95),(1280,660,65),
              (300,680,70),(570,710,80),(990,725,70),(760,570,50)]
    for ci,(cx,cy,radius) in enumerate(clusters):
        b+=f'<g opacity="{.27 if biome=="amber" else .23}">'
        for k in range(34):
            a=k*2.39996+ci*.7
            rr=radius*math.sqrt((k+.5)/34)
            x=cx+math.cos(a)*rr; y=cy+math.sin(a)*rr*.43
            if any(((x-qx)/rx)**2+((y-qy)/ry)**2<1 for qx,qy,rx,ry in quiet):continue
            x=round(x,2); y=round(y,2)
            b+=ellipse(x,y,1.2+(k%4)*.65,.7+(k%3)*.45,soil if k%3 else ink)
            if k%3==0:
                b+=ellipse(x+1,y-1,.9,.45,glow)
            if k%5==0:
                # Moss lobes form small lobulated groups, not isolated polka dots.
                for m in range(4):
                    b+=ellipse(round(x+math.cos(m*2.2)*4,2),round(y+math.sin(m*2.2)*2,2),3+m%2,1.6,green)
            if k%11==0:
                b+=path(f'M{x-3} {y+2} q1 -6 -3 -9 M{x} {y+2} q1 -9 5 -12','none',green,1)
        b+='</g>'
        if ci%2==0:
            b+=path(f'M{cx-28} {cy+17} l17 -5 8 3 18 -9 10 2 m-28 4 3 9 -7 6','none',ink,.85,extra='opacity=".16"')
        if ci in [1,4,7,10,13]:
            b+=f'<g opacity=".24">'+leaf(cx+18,cy-17,.19,ci*41,soil)+'</g>'
    # Biome-specific silhouettes, composed along the clearing's perimeter.
    if biome=='marsh':
        for x,y in [(95,290),(1490,360),(210,790),(1360,785),(510,175)]:
            for k in range(5):
                xx=x+k*9
                b+=path(f'M{xx} {y+18} Q{xx-14} {y-48} {xx+7} {y-99}','none','#769d78',2)
                b+=path(f'M{xx+7} {y-75} l2 -24','none','#594e36',7)
            b+=ellipse(x+27,y+24,46,7,'none',glow,1,extra='opacity=".3"')
    if biome=='meadow':
        for x,y in [(210,170),(480,765),(1340,175),(1410,762)]:
            for k in range(5):
                xx=x+k*13; yy=y+(k%3)*9
                b+=path(f'M{xx} {yy+23} Q{xx-7} {yy+9} {xx} {yy}','none','#73864d',2)
                for a in range(5):
                    angle=a*math.tau/5
                    b+=ellipse(round(xx+math.cos(angle)*4,2),round(yy+math.sin(angle)*4,2),3.5,3,'#e6dfb3')
                b+=ellipse(xx,yy,2.5,2.5,'#d4ad51')
    if biome=='amber':
        for x,y in [(190,205),(1380,198),(340,760),(1240,775)]:
            b+=path(f'M{x-38} {y+12} Q{x-20} {y-45} {x+44} {y-24} Q{x+17} {y-5} {x+28} {y+17} Q{x} {y+31} {x-38} {y+12}Z','#aa7a3d','#574732',2)
            b+=path(f'M{x-35} {y+12} Q{x} {y-12} {x+39} {y-22} M{x-2} {y-3} l-11 -15 M{x+8} {y-8} l11 17','none','#e5bd70',1.5)
    # Finite, tapered root buttresses. Opposite sides have different growth paths.
    for side in [0,1]:
        b+=f'<g transform="translate({1600 if side else 0} 0) scale({-1 if side else 1} 1)">'
        for j,(start,length,base,lean) in enumerate([(-45,620,72,114),(935,-540,82,142),(-25,350,142,57)]):
            if side:
                start+=37; length*=.83 if j==0 else 1.08; lean*=.72; base+=19
            points=[]
            for n in range(41):
                t=n/40
                cy=start+length*t
                cx=base+lean*t+22*math.sin(t*6+j*2+side)*math.sin(math.pi*t)
                width=(48 if biome=='roots' else 33)*(1-t)**1.25*(1+.15*math.sin(t*29+j))+.4
                points.append((cx,cy,width))
            outline=[(x-w,y) for x,y,w in points]+[(x+w,y) for x,y,w in reversed(points)]
            d='M'+' L'.join(f'{x:.2f} {y:.2f}' for x,y in outline)+'Z'
            b+=path(d,'#71583b' if biome=='roots' else dark,ink,2.5)
            # Broken bark fissures follow grain but terminate at irregular lengths.
            for k in range(3):
                for segment in range(3):
                    begin=2+segment*11+(k*3+j)%5; end=min(begin+7+k,38)
                    pts=[]
                    for n in range(begin,end):
                        x,y,w=points[n]; xx=x+(k-1)*w*.51+math.sin(n*1.9+k)*1.6
                        pts.append((xx,y))
                    d='M'+' L'.join(f'{x:.2f} {y:.2f}' for x,y in pts)
                    b+=path(d,'none',ink,1.8,extra='opacity=".65"')
                    b+=path(d,'none',soil,.65,extra='transform="translate(2 0)" opacity=".28"')
            for n,direction in [(13,1),(25,-1),(32,1)]:
                x,y,w=points[n]; endx=x+direction*(40+w); endy=y+length*.12
                b+=path(f'M{x:.2f} {y:.2f} Q{x+direction*26:.2f} {y+length*.04:.2f} {endx:.2f} {endy:.2f} Q{x+direction*15:.2f} {y+length*.03:.2f} {x-direction*w*.4:.2f} {y-8:.2f}Z','#71583b' if biome=='roots' else dark,ink,1.4)
        b+='</g>'
    # Broad foliage clusters form an authored border rhythm with larger corner masses.
    for side in [0,1]:
        for j in range(18):
            y=60+j*49
            x=25+35*math.sin(j*1.8)
            if side:x=1600-x
            for k in range(3):
                angle=(-65+j%4*19+k*32)*(1 if side==0 else -1)
                b+=leaf(round(x,2),y,.62+(j%4)*.12,angle,green if k%2 else dark)
    for j in range(30):
        x=25+j*54
        for y,flip in [(68,180),(875,0)]:
            b+=leaf(x,y,.55+(j%5)*.11,flip+(-38+j%4*24),green if j%3 else soil)
    # Stone, moss and engraved strata clusters stay outside the central lane.
    for x,y,s in [(160,180,1),(420,775,.8),(1410,185,1.1),(1450,730,1),(70,550,.7),(1130,805,.85)]:
        b+=f'<g transform="translate({x} {y}) scale({s})">'
        b+=ellipse(0,12,65,22,ink,extra='opacity=".48"')
        b+=path('M-60 5 L-42 -30 -9 -43 36 -27 57 7 29 24 -32 22Z','url(#rock)',ink,3)
        b+=path('M-42 -27 L-12 -14 35 -25 M-12 -14 L-18 13 M0 7 L34 2','none',soil,1.5)
        for k in range(10):
            b+=ellipse(-40+k*8,-20+math.sin(k)*7,10,4,green,extra='opacity=".6"')
        b+='</g>'
    # Deterministic micro-detail follows edge bands rather than random scatter.
    for j in range(100):
        x=35+(j*137)%1530; y=(140+(j*29)%60) if j%2 else (735+(j*31)%80)
        b+=path(f'M{x} {y+8} q-8 -11 -3 -20 M{x} {y+8} q12 -12 11 -24','none',green,1.6)
        if j%4==0:
            b+=ellipse(x+4,y-11,4,6,'url(#dew)')
        if j%7==0:
            b+=ellipse(x,y,13,13,'url(#dew)',extra='opacity=".35"')
            b+=ellipse(x,y,1.4,1.4,glow)
    if biome=='amber':
        for j in range(18):
            b+=leaf(180+j*73,172 if j%2 else 758,.35,65+j*37,'#bd914b')
    if biome=='roots':
        for x,y in [(110,320),(1480,445),(230,790)]:
            b+=path(f'M{x} {y+35} Q{x-8} {y} {x+5} {y-5}','none','#c7bb87',5)
            b+=path(f'M{x-22} {y} Q{x+3} {y-35} {x+28} {y}Z','#aa7e52',ink,2)
    b+='<rect width="1600" height="115" fill="#071f20" opacity=".23"/><path d="M0 835 Q800 780 1600 835 V900 H0Z" fill="#071f20" opacity=".28"/>'
    svg(f'background-{biome}.svg',1600,900,b,defs)

# Architectural miniatures share neutral materials suitable for multiplicative faction tint.
defs='''<linearGradient id="earth" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#d8c795"/><stop offset=".48" stop-color="#a99d76"/><stop offset="1" stop-color="#5b6550"/></linearGradient><linearGradient id="shell"><stop stop-color="#edf1c9"/><stop offset=".5" stop-color="#b6c79a"/><stop offset="1" stop-color="#6f8870"/></linearGradient>'''
b=ellipse(80,139,64,14,'#0b2424',extra='opacity=".5"')
b+=path('M17 133 Q23 117 26 91 Q23 66 47 47 Q51 19 80 24 Q100 10 117 44 Q140 58 135 88 L147 132 Q119 148 86 143 Q47 151 17 133Z','url(#earth)','#203b31',4)
b+=path('M45 127 Q38 93 55 72 Q75 49 99 67 Q122 84 119 128Z','#273a2b','#e0d0a0',5)
b+=path('M57 128 Q51 97 66 82 Q83 67 100 84 Q111 100 108 128Z','#102823','#6d7353',3)
b+=path('M29 81 Q25 48 54 37 Q74 23 90 30 Q75 60 42 82Z','url(#shell)','#293f32',3)
b+=path('M46 67 Q57 44 77 36 M37 59 L57 64 M47 44 L66 50','none','#72866a',2)
for x,y in [(30,105),(124,104),(40,130),(117,133),(99,44),(69,53)]:
    b+=path(f'M{x-5} {y} q4 -7 11 -3 l-1 7 -9 2Z','#b8af85','#657259',1)
b+=leaf(126,110,.48,35,'#a8bd87')+leaf(29,116,.39,-35,'#8fa77b')
b+=path('M26 99 Q72 113 134 91 M27 104 Q81 118 135 97','none','#e2d6ac',2)
b+=path('M111 102 q-14 -15 -15 -2 q2 9 15 2 q17 -15 16 -2 q-2 9 -16 2 l-6 19 m6 -19 9 16','none','#e4dbb8',2)
svg('nest.svg',160,160,b,defs)
b=ellipse(80,139,62,13,'#0b2424',extra='opacity=".5"')
b+=path('M28 137 Q49 117 48 92 L55 65 99 60 115 94 Q108 117 137 135 L111 142 83 131 58 144Z','url(#earth)','#203b31',4)
b+=path('M58 126 L65 80 M81 122 L78 79 M103 127 L92 83','none','#646f50',3)
b+=path('M48 77 L42 48 Q44 30 67 27 L107 35 Q125 42 120 62 L106 83Z','url(#shell)','#203b31',4)
b+=path('M51 48 L78 21 Q91 10 105 25 L120 48 97 68Z','url(#earth)','#203b31',3)
b+=ellipse(96,36,20,19,'#d8d9b1','#263f33',3)
b+=ellipse(96,35,12,12,'#142d29','#819278',3)
b+=ellipse(94,32,6,6,'#081d1d')
b+=path('M53 64 L75 76 108 70 M58 55 L81 66 M57 89 Q99 105 111 79 M41 123 Q75 109 117 123','none','#e1d5a8',3)
for x,y,a in [(38,134,-50),(118,137,48),(53,109,-65),(108,107,65)]:b+=leaf(x,y,.31,a,'#9db78b')
b+=path('M40 136 Q35 112 65 108 T113 83 M60 134 Q120 130 107 102','none','#597b59',4)
svg('cannon.svg',160,160,b,defs)

# Sprite-sheet geometry is authored in each 24x32 cell and clipped as a hard guarantee.
for kind in ['agile','fast','strong']:
    b=''; sd=defs
    for frame in range(4):
        sd+=f'<clipPath id="cell{frame}"><rect x="0" y="0" width="24" height="32"/></clipPath>'
        b+=f'<g transform="translate({frame*24} 0)" data-frame="{frame}" data-bounds="0 0 24 32"><g clip-path="url(#cell{frame})">'
        b+=ellipse(12,23,9,5,'#092b26',extra='opacity=".3"')
        for side in [-1,1]:
            for leg in range(3):
                phase=[-2,0,2,0][(frame+leg+(0 if side==1 else 2))%4]
                y=12+leg*5
                b+=path(f'M{12+side*4} {y} L{12+side*8} {y-2+phase} L{12+side*10} {y+2+phase}','none','#193b31',2.4)
                b+=path(f'M{12+side*4} {y} L{12+side*8} {y-2+phase} L{12+side*10} {y+2+phase}','none','#cad6ad',1)
        b+=path('M9 8 L7 3 5 2 M15 8 L17 3 19 2','none','#c8d8b5',1.3)
        if kind=='fast':
            b+=ellipse(12,24,4.8,6,'url(#earth)','#193b31',1.3)
            b+=ellipse(12,16,3,4,'#c8c8a1','#193b31',1.3)
            b+=ellipse(12,9,4.5,4.7,'url(#shell)','#193b31',1.3)
            b+=path('M9 24 Q12 22 15 24','none','#ecdfb4',1)
        else:
            b+=ellipse(12,20,6.6 if kind=='strong' else 6,9,'url(#shell)','#193b31',1.4)
            b+=path('M12 12 L12 28 M7 17 Q8 23 10 26 M17 17 Q16 23 14 26','none','#6d896b',1)
            b+=ellipse(12,10,5.6,4.5,'url(#earth)','#193b31',1.3)
            if kind=='strong':b+=path('M10 9 L10 4 8 1 12 3 14 1 14 8Z','#e5dfba','#193b31',1)
            else:b+=path('M8 14 Q12 11 16 14','none','#eff1c9',1.4)
        b+=ellipse(9,9,.9,1,'#112d28')+ellipse(15,9,.9,1,'#112d28')
        b+='</g></g>'
    svg(f'bug-{kind}.svg',96,32,b,sd)

# Menu crest: engraved leaf wreath and crowned scarab.
defs+='''<radialGradient id="halo"><stop stop-color="#d9bf67" stop-opacity=".35"/><stop offset="1" stop-color="#d9bf67" stop-opacity="0"/></radialGradient><linearGradient id="gold" x2="1" y2="1"><stop stop-color="#fff0ae"/><stop offset=".45" stop-color="#c4a151"/><stop offset="1" stop-color="#66562c"/></linearGradient>'''
b=ellipse(128,133,125,122,'url(#halo)')
for side in [-1,1]:
    b+=path(f'M128 235 Q{128+side*111} 191 {128+side*83} 75','none','#c3a254',5)
    for j in range(8):
        t=j/7; x=128+side*(38+57*math.sin(t*2)); y=223-j*20
        b+=leaf(round(x,2),y,.38,side*(40+j*10),'url(#gold)')
for side in [-1,1]:
    for j in range(3):
        b+=path(f'M{128+side*30} {112+j*29} L{128+side*58} {104+j*30} {128+side*74} {120+j*31}','none','#132e29',9)
        b+=path(f'M{128+side*30} {112+j*29} L{128+side*58} {104+j*30} {128+side*74} {120+j*31}','none','url(#gold)',4)
b+=ellipse(128,154,43,62,'url(#shell)','#152f28',5)
b+=path('M128 98 L128 211 M91 127 Q99 171 119 198 M165 127 Q157 171 137 198','none','#617f60',3)
b+=path('M98 115 Q88 84 110 77 L146 77 Q168 85 158 115 Q128 130 98 115Z','url(#gold)','#19382e',4)
b+=path('M106 88 Q96 65 111 58 M150 88 Q160 65 145 58','none','#e5cd80',4)
b+=path('M96 63 L89 34 112 47 128 20 144 47 167 34 160 63Z','url(#gold)','#233b2e',3)
b+=path('M99 68 L157 68','none','#f7e1a0',5)
b+=ellipse(128,51,5,7,'#597d60','#fff1b1',2)
b+=ellipse(109,96,4,3,'#152e28')+ellipse(147,96,4,3,'#152e28')
b+=path('M113 226 L128 237 143 226 M115 144 L119 172 M141 144 L137 172','none','#ead89a',2)
svg('emblem.svg',256,256,b,defs)
print('Wrote 10 original SVG assets.')

# Machine-readable validation, including hard frame containment clips.
expected={**{f'background-{x}.svg':(1600,900) for x in palettes},'nest.svg':(160,160),'cannon.svg':(160,160),**{f'bug-{x}.svg':(96,32) for x in ['agile','fast','strong']},'emblem.svg':(256,256)}
ns={'s':'http://www.w3.org/2000/svg'}
report=[]
for name,(w,h) in expected.items():
    root=ET.parse(P/name).getroot()
    assert root.attrib['width']==str(w) and root.attrib['height']==str(h)
    assert root.attrib['viewBox']==f'0 0 {w} {h}'
    assert not any('href' in k for e in root.iter() for k in e.attrib),name
    if name.startswith('bug-'):
        frames=root.findall('s:g',ns); assert len(frames)==4
        for i,g in enumerate(frames):
            assert g.attrib['transform']==f'translate({i*24} 0)'
            assert g.attrib['data-bounds']=='0 0 24 32'
            clip=root.find(f'.//s:clipPath[@id="cell{i}"]/s:rect',ns)
            assert clip is not None and clip.attrib=={'x':'0','y':'0','width':'24','height':'32'}
            assert g[0].attrib['clip-path']==f'url(#cell{i})'
    report.append(f'PASS {name}: {w}x{h}; XML; local-only'+ ('; 4 clipped 24x32 frames' if name.startswith('bug-') else ''))
(P/'validation.txt').write_text('\n'.join(report)+'\n',encoding='utf-8')
print('\n'.join(report))
