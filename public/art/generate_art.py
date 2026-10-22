"""After the Rain — original procedural botanical engravings. Python stdlib only."""
from pathlib import Path
import math, random, json
import xml.etree.ElementTree as ET
P=Path(__file__).parent

def path(d,f='none',s='none',w=1,o=1):
    return f'<path d="{d}" fill="{f}" stroke="{s}" stroke-width="{w}" opacity="{o}" stroke-linejoin="round" stroke-linecap="round"/>'
def el(x,y,rx,ry,f,s='none',w=1,o=1):
    return f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" fill="{f}" stroke="{s}" stroke-width="{w}" opacity="{o}"/>'
def grad(id,colors,rad=False):
    tag='radialGradient' if rad else 'linearGradient'
    attrs='cx="35%" cy="27%" r="80%"' if rad else 'x1="0%" y1="0%" x2="85%" y2="100%"'
    return f'<{tag} id="{id}" {attrs}>'+''.join(f'<stop offset="{i/(len(colors)-1):.3f}" stop-color="{c}"/>' for i,c in enumerate(colors))+f'</{tag}>'
MAT=grad('wood',['#9b8661','#574d38','#252e28'])+grad('shell',['#d4c5a0','#8e9175','#3b5047'])+grad('copper',['#e0cb94','#9c8051','#493f30','#b49b66'])+grad('resin',['#ead2a0','#ac864e','#614e32','#273934'])+grad('wing',['#b0bda0','#597b6d','#223e39'])+grad('dark',['#091919','#26352e'])+grad('lamp',['#fff0c0','#b58d4d','#473c2d'],True)
def svg(name,w,h,b,defs=''):
    (P/name).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><defs>{defs}</defs>{b}</svg>',encoding='utf8')
def leaf(x,y,scale,angle,col,vein='#b1b49a'):
    b=f'<g transform="translate({x} {y}) rotate({angle}) scale({scale})">'
    b+=path('M0 0 C-24 -22 -32 -65 -8 -99 C19 -90 36 -32 0 0Z',col,'#34453b',.8)
    b+=path('M0 -3 Q-10 -45 -8 -94','none',vein,.8,.6)
    for j in range(1,8):
        y=-j*11
        b+=path(f'M-5 {y} Q-18 {y-6} -21 {y-14} M-5 {y-2} Q13 {y-9} 17 {y-18}','none',vein,.45,.35)
    return b+'</g>'

# Four independently composed paper strata: no repeating perimeter tile or mirror.
pal={
'meadow':['#253d36','#526357','#859078','#c2b783','#526450'],
'roots':['#111f21','#2b3b34','#4c5140','#987c54','#344c3e'],
'marsh':['#172d35','#354b50','#59706e','#94a8a0','#3e5e59'],
'amber':['#272b28','#4e4d3e','#7c7255','#b9a178','#625f44']}
for index,(kind,c) in enumerate(pal.items()):
    r=random.Random(410+index)
    defs=grad('soil',[c[1],c[2],c[1],c[0]])+grad('bank',[c[2],c[1],c[0]])+MAT
    b='<rect width="1600" height="900" fill="url(#soil)"/>'
    # Broad, very quiet middle relief, not a blank radial spotlight.
    curves={
    'meadow':['M0 330 Q310 209 690 313 T1600 270 L1600 900 H0Z','M0 633 Q460 505 880 620 T1600 540 L1600 900 H0Z'],
    'roots':['M0 395 Q260 298 510 386 T1600 365 L1600 900 H0Z','M0 775 Q380 545 790 680 T1600 594 L1600 900 H0Z'],
    'marsh':['M0 440 Q330 540 680 403 T1600 456 L1600 900 H0Z','M0 725 Q400 619 790 713 T1600 641 L1600 900 H0Z'],
    'amber':['M0 260 Q420 420 810 294 T1600 385 L1600 900 H0Z','M0 639 Q590 725 1050 554 T1600 650 L1600 900 H0Z']}
    for d in curves[kind]: b+=path(d,'url(#bank)',c[3],.6,.19)
    # Interrupted moss shelves and etched sediment eddies in the middle distance.
    # Their translucent relief remains beneath buildings, never a wall or blocked lane.
    for ci in range(24):
        cx=r.uniform(170,1430); cy=r.uniform(250,735)
        span=r.uniform(40,135)
        for k in range(3):
            yy=cy+k*3.5
            b+=path(f'M{cx-span:.1f} {yy:.1f} q{span*.55:.1f} -11 {span:.1f} -5 t{span*.7:.1f} -3','none',c[3],.7,.10)
        for k in range(25):
            xx=cx+r.uniform(-span,span); yy=cy+r.uniform(-10,17)
            b+=el(round(xx,1),round(yy,1),r.uniform(1.5,5),r.uniform(.5,1.5),c[4] if k%3 else c[3],o=.19)
        if ci%3==0:
            b+=leaf(round(cx,1),round(cy+10,1),.16,ci*47,c[2],c[3])
        if kind=='marsh':
            b+=path(f'M{cx-span:.1f} {cy+18:.1f} q{span:.1f} 12 {span*2:.1f} 0','none',c[3],.6,.18)
    # Fine sediment/short fibers across the playable field stay low contrast.
    for j in range(1450):
        x=r.uniform(65,1540); y=r.uniform(160,814)
        b+=el(round(x,1),round(y,1),round(r.uniform(.4,2.7),1),r.choice([.4,.6,.9]),r.choice([c[0],c[3],c[4]]),o=r.uniform(.07,.18))
        if j%13==0:
            b+=path(f'M{x:.1f} {y:.1f} q8 -3 16 -1','none',c[3],.45,.13)
    if kind=='marsh':
        for j in range(50):
            x=r.uniform(150,1450); y=r.uniform(270,750); width=r.uniform(25,130)
            b+=path(f'M{x:.1f} {y:.1f} q{width/2:.1f} 5 {width:.1f} -2','none','#aec1b6',.65,.12)
        b+=path('M0 780 Q250 690 344 790 T890 846 L1600 900 H0Z','#273c3d',o=.65)
    # Tapered roots with branching grain. Different landmarks in every biome.
    roots={'meadow':[(10,850,80,-360),(1600,60,-80,270)],'roots':[(0,-30,113,580),(20,925,180,-260),(1580,950,-90,-660),(1300,-40,-360,205)],'marsh':[(0,30,54,290),(1620,880,-120,-160)],'amber':[(1570,-25,-90,520),(0,820,220,-100)]}[kind]
    for x,y,dx,dy in roots:
        b+=f'<g transform="translate({x} {y})">'
        b+=path(f'M-52 0 Q{dx-43} {dy*.55} {dx} {dy} Q{dx+10} {dy*.53} 53 0Z','url(#wood)',c[0],1.2)
        for k in range(17):
            a=-43+k*5
            b+=path(f'M{a} 0 Q{dx+a*.45} {dy*.56} {dx+(k-8)*.6} {dy*.96}','none',c[3] if k%3==0 else c[0],.7,.4)
        for t in [.38,.67]:
            xx=dx*t; yy=dy*t
            b+=path(f'M{xx:.1f} {yy:.1f} Q{xx+70:.1f} {yy+20:.1f} {xx+94:.1f} {yy+83:.1f} Q{xx+50:.1f} {yy+21:.1f} {xx-9:.1f} {yy-10:.1f}Z','url(#wood)',c[0],.8)
        b+='</g>'
    # Foreground masses only outside x120..1480,y235..710.
    anchors={'meadow':[(0,400,1.6,38),(80,840,1.8,-5),(1470,200,1.4,110),(1570,740,1.4,-35),(470,890,1.2,-32)],'roots':[(0,710,1.8,22),(1600,410,1.5,-60),(230,80,1.4,144),(1230,900,1.5,5)],'marsh':[(45,790,1.4,6),(1550,200,1.5,160),(1380,890,1.1,-65),(50,190,1.3,90)],'amber':[(30,240,1.5,90),(1580,760,1.9,-40),(1050,870,1.2,8),(1370,90,1.5,140)]}[kind]
    for ax,ay,s,a in anchors:
        for k in range(5):
            b+=leaf(ax+k*12,ay+k*9,s*(.65+k*.13),a+(k-2)*27,'url(#shell)' if kind=='meadow' and k==2 else ('url(#resin)' if kind=='amber' else c[4]))
    # Irregular tiny bank moss and fallen material, never coarse obstacles.
    for j in range(100):
        x=r.uniform(65,1530); y=r.choice([r.uniform(167,225),r.uniform(735,836)])
        for k in range(r.randint(3,7)):
            b+=el(round(x+r.uniform(-14,14),1),round(y+r.uniform(-5,5),1),r.uniform(2,6),r.uniform(1,2),c[4],o=.6)
        if j%4==0:b+=leaf(round(x,1),round(y,1),r.uniform(.09,.23),r.uniform(0,360),'url(#resin)' if kind=='amber' else c[2])
    if kind=='meadow':
        for j in range(35):
            x=r.choice([r.uniform(30,115),r.uniform(1490,1580)]); y=r.uniform(180,800)
            b+=path(f'M{x:.1f} {y:.1f} q-20 -40 4 -84','none','#929b7a',.85,.65)
            b+=el(round(x+4,1),round(y-84,1),1.5,2.4,'#ddd2ab',o=.65)
    if kind=='marsh':
        for j in range(39):
            x=r.choice([r.uniform(30,110),r.uniform(1495,1590)]); y=r.uniform(150,840)
            b+=path(f'M{x:.1f} {y:.1f} q-12 -50 3 -110','none','#6f8370',1.2,.7)
            if j%4==0:b+=el(round(x,1),round(y-60,1),1.5,2,'#c9d3a3',o=.7)
    if kind=='amber':
        for x,y in [(42,540),(1510,210),(1250,845)]:
            b+=path(f'M{x} {y} q-30 -65 8 -110 q45 59 32 100Z','url(#resin)','#a88b58',.7,.8)
            b+=path(f'M{x+4} {y-13} q-15 -40 4 -82','none','#e1c693',1,.65)
    # UI bands remain darker, with no physical boundary implied.
    b+=path('M0 0H1600V130Q900 103 0 142Z',c[0],o=.38)+path('M0 810Q900 780 1600 814V900H0Z',c[0],o=.5)
    svg(f'background-{kind}.svg',1600,900,b,defs)

# Seedpod watch-nest. Cut shell ribs, woven root rafters and recessed lamplit doorway.
b=el(81,140,65,11,'#081b19',o=.45)
b+=path('M20 132 L37 115 125 114 143 132 133 141 33 143Z','url(#wood)','#38463b',.8)
b+=path('M31 130 L43 117 122 117 133 130Z','url(#shell)')
b+=path('M32 118 Q25 83 40 59 Q44 28 76 21 Q117 16 133 62 L136 121 Q84 136 32 118Z','url(#shell)','#52604b',.9)
# Unmatched overlapping roof valves.
for i,d in enumerate(['M27 91 Q21 54 56 31 Q74 17 92 23 Q68 57 43 95Z','M43 85 Q52 37 91 20 Q116 31 125 58 L112 89 Q81 59 43 85Z','M109 90 Q103 63 119 46 Q139 62 138 100Z']):
    b+=path(d,'url(#wood)' if i==1 else 'url(#shell)','#56624c',.9)
for k in range(12):
    b+=path(f'M{30+k*1.5} {84-k*.7} Q{31+k*3} {47-k*.7} {63+k*2.7} {28+k*.3}','none','#d6c7a0',.55,.55)
for k in range(10):
    b+=path(f'M{53+k*6} {72+math.sin(k)*4:.1f} Q{66+k*3} 48 {91+k*.4} 26','none','#b8a47a',.6,.65)
# Root rafters and rope lashings.
for d in ['M28 115 Q37 88 52 77 Q78 62 106 76 Q126 87 134 118','M33 120 Q30 100 45 83 Q75 52 109 76 Q132 96 131 120']:
    b+=path(d,'none','url(#wood)',4)+path(d,'none','#c1ad7f',.65,.7)
b+=path('M49 123 L49 99 Q51 78 80 76 Q108 78 112 99 L114 124Z','url(#dark)','#a99972',2)
b+=path('M58 121 L58 99 Q61 85 80 84 Q100 86 103 101 L104 122Z','#0c1c1b','#565a43',.8)
b+=path('M62 118 L64 101 Q80 89 99 103 L99 119Z','url(#lamp)',o=.32)
b+=path('M50 125 L112 125 120 131 45 133Z','url(#shell)','#63705a',.5)
b+=path('M45 134 L119 132 125 138 39 141Z','url(#wood)','#a19570',.6)
for x,y in [(40,88),(120,95)]:
    for k in range(4):b+=path(f'M{x+k} {y-5} l-4 10','none','#c5b58b',.8)
b+=path('M116 76 L117 107','none','#625b40',1)
b+=path('M112 94 L122 94 122 105 112 105Z','url(#lamp)','#bda36a',.7)
b+=path('M115 96 V103 M119 96 V103','none','#f1d7a0',.6)
for j in range(22):
    x=24+(j*17)%115;y=135+(j%3)*2
    b+=el(x,y,3,1.3,'#61715a',o=.7)
svg('nest.svg',160,160,b,MAT)

# Resonance cannon: open resin throat on triangulated timber, brass hoops.
b=el(80,140,63,10,'#081b19',o=.45)
b+=path('M22 135 L36 123 119 123 141 138 115 146 37 144Z','url(#wood)','#46513e',.8)
for d in ['M39 135 L55 70 67 74 55 137Z','M112 137 L91 73 105 68 128 133Z','M44 126 L110 93 115 101 53 136Z','M40 99 L113 122 111 130 38 106Z']:
    b+=path(d,'url(#wood)','#3d4939',.8)
for x,y in [(51,99),(113,124),(60,78),(103,80)]:
    b+=el(x,y,3,3,'url(#copper)','#4e4b38',.5)+el(x-.5,y-.7,.6,.6,'#e6d1a4')
b+=path('M39 82 Q30 66 44 50 L83 24 Q109 12 126 36 Q142 59 119 77 L79 101 Q53 110 39 82Z','url(#resin)','#77734d',1)
for k in range(9):
    b+=path(f'M{43+k*4} {86+k*.4} Q{76+k*2} {67+k*.3} {104+k*1.8} {38+k*1.1}','none','#e3c18b',.65,.38)
for d in ['M48 48 Q37 70 61 96 L72 101 Q46 72 59 42Z','M80 28 Q68 50 94 85 L104 80 Q80 48 91 22Z']:
    b+=path(d,'url(#copper)','#786442',.7)
b+=el(110,46,23,27,'url(#copper)','#a68b58',.9)
b+=el(111,45,17,21,'url(#dark)','#d0b67c',1)
b+=el(114,43,10,15,'#081b1b','#6b6d4a',1)
b+=path('M104 29 Q96 41 102 52','none','#c0a574',1.2)
b+=path('M38 138 Q82 129 132 139','none','#9b9469',1)
svg('cannon.svg',160,160,b,MAT)

# Six jointed legs; face at top. Four independent gait phases in hard cell clips.
for kind in ['agile','fast','strong']:
    b=''; defs=MAT
    for frame in range(4):
        defs+=f'<clipPath id="cell{frame}" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="24" height="32"/></clipPath>'
        b+=f'<g transform="translate({frame*24} 0)" data-frame="{frame}" data-bounds="0 0 24 32"><g clip-path="url(#cell{frame})">'
        b+=el(12,22,8,7,'#081a18',o=.25)
        for side in [-1,1]:
            for j in range(3):
                phase=math.sin((frame/4+j/2+(side+1)/4)*math.tau)*1.8
                a=12+side*3.5; knee=12+side*7.4; tip=12+side*9.0; y=11+j*5
                d=f'M{a} {y} L{knee} {y-2+phase:.2f} L{tip} {y+3-phase:.2f} l{side*.4} 1.3'
                b+=path(d,'none','#273b32',1.55)+path(d,'none','#baae84',.65)
                b+=el(knee,round(y-2+phase,2),.85,.85,'#82927b')
        b+=path('M10 7 Q8 4 7 2 L5 1 M14 7 Q16 4 17 2 L19 1','none','#b6ac85',.65)
        if kind=='fast':
            b+=el(12,23,4,6.7,'url(#resin)','#786b4c',.65)
            for y in [21,24,27]:b+=path(f'M8.7 {y} Q12 {y+2} 15.3 {y}','none','#d6bd89',.45)
            b+=el(12,15,2.7,3.8,'url(#wood)','#9c9571',.5)
        else:
            width=6.1 if kind=='strong' else 5.2
            b+=el(12,21,width,9,'url(#wing)','#8a9b7e',.65)
            b+=path('M12 12 V29','none','#162f2b',.85)
            for side in [-1,1]:
                for k in range(3):
                    x=12+side*(2+k)
                    b+=path(f'M{x} 15 Q{x+side} 22 {12+side*(1.5+k*.7)} 27','none','#b7c2a0',.35,.65)
            if kind=='strong':b+=path('M7 16 L6 12 8 9 16 9 18 12 17 16Z','url(#copper)','#918663',.55)
        b+=path('M8 11 L8 8 Q9 5 12 5 Q15 5 16 8 L16 11 Q12 13 8 11Z','url(#wood)','#9c9b75',.55)
        b+=path('M9 6 L9 4 11 5 M15 6 L15 4 13 5','none','#d2c498',.6)
        b+=el(8.3,8.3,.55,1,'#122725')+el(15.7,8.3,.55,1,'#122725')
        b+='</g></g>'
    svg(f'bug-{kind}.svg',96,32,b,defs)

# Watch-ring is an instrument of return, not a monarch's crown.
b=''
for radius,sw,col in [(109,1.4,'#b49b66'),(104,.45,'#7e805e'),(96,.65,'#b7a477')]:b+=el(128,128,radius,radius,'none',col,sw)
for j in range(72):
    a=math.tau*j/72; ri=100 if j%6 else 96; ro=108
    b+=path(f'M{128+ri*math.cos(a):.2f} {128+ri*math.sin(a):.2f} L{128+ro*math.cos(a):.2f} {128+ro*math.sin(a):.2f}','none','#c4ad77',.5,.7)
# Thirteen seed sockets in the ring.
for j in range(13):
    a=-math.pi/2+j*math.tau/13; x=128+109*math.cos(a);y=128+109*math.sin(a)
    b+=el(round(x,2),round(y,2),2.8,2.8,'url(#copper)','#d8c28f',.5)
for side in [-1,1]:
    for j in range(3):
        d=f'M{128+side*28} {108+j*27} L{128+side*(49+j*3)} {94+j*28} L{128+side*(66+j*3)} {107+j*31} l{side*8} 5'
        b+=path(d,'none','#536752',5)+path(d,'none','url(#copper)',2.2)
        b+=el(128+side*(49+j*3),94+j*28,2.5,2.5,'url(#copper)')
b+=path('M128 100 Q81 102 87 154 Q90 191 128 211 Q168 190 170 151 Q174 105 128 100Z','url(#wing)','#a1ad85',1)
b+=path('M128 103 V207','none','#0d2927',2)
for side in [-1,1]:
    for k in range(7):
        x=128+side*(8+k*4)
        b+=path(f'M{x} {111+k*2} Q{x+side*5} 156 {128+side*(4+k*2)} {201-k*2}','none','#b8c69c',.55,.6)
    for j in range(24):
        y=119+j*3; x=128+side*(31+math.sin(j*.23)*3)
        b+=path(f'M{x:.1f} {y} l{side*2} -1','none','#d0caa2',.5,.6)
b+=path('M102 110 L99 91 Q104 71 128 72 Q151 74 157 92 L153 110 Q128 121 102 110Z','url(#copper)','#a99e71',.8)
b+=path('M112 78 Q106 60 120 55 L137 55 Q151 63 143 79Z','url(#wing)','#b8bb8c',.8)
b+=path('M114 59 Q99 44 106 33 M141 59 Q156 44 150 32','none','url(#copper)',1.7)
b+=path('M119 55 L118 47 122 44 M137 55 L138 47 134 44','none','#c6b582',1)
# The translucent seed core is held before the beetle's thorax.
b+=path('M128 79 Q112 90 116 102 Q128 115 140 101 Q144 89 128 79Z','url(#lamp)','#e0c18a',.8)
b+=path('M128 84 Q121 96 128 106 Q136 95 128 84Z','none','#f2dfb1',.65)
b+=path('M106 104 Q112 110 119 103 M150 104 Q144 111 138 103','none','url(#copper)',2)
# Botanical marginal etchings do not form a clipart laurel.
for x,y,s,a in [(52,202,.35,-50),(70,220,.27,-80),(206,61,.31,130)]:b+=leaf(x,y,s,a,'none','#a69d73')
svg('emblem.svg',256,256,b,MAT)

expected={**{f'background-{k}.svg':(1600,900) for k in pal},'nest.svg':(160,160),'cannon.svg':(160,160),**{f'bug-{k}.svg':(96,32) for k in ['agile','fast','strong']},'emblem.svg':(256,256)}
ns={'s':'http://www.w3.org/2000/svg'}; report=[]
for name,(w,h) in expected.items():
    root=ET.parse(P/name).getroot()
    assert (root.get('width'),root.get('height'),root.get('viewBox'))==(str(w),str(h),f'0 0 {w} {h}')
    ids={e.get('id') for e in root.iter() if e.get('id')}
    for e in root.iter():
        for k,v in e.attrib.items():
            assert 'href' not in k and 'http:' not in v and 'https:' not in v
            if 'url(' in v:assert v.startswith('url(#') and v[5:-1] in ids,(name,v)
    if name.startswith('bug-'):
        frames=root.findall('s:g',ns);assert len(frames)==4
        for i,g in enumerate(frames):
            assert g.get('transform')==f'translate({24*i} 0)' and g.get('data-bounds')=='0 0 24 32'
            clip=root.find(f'.//s:clipPath[@id="cell{i}"]',ns)
            assert clip.get('clipPathUnits')=='userSpaceOnUse'
            assert clip[0].attrib=={'x':'0','y':'0','width':'24','height':'32'}
            assert g[0].get('clip-path')==f'url(#cell{i})'
    report.append(f'PASS {name}: XML, {w}x{h}, local references resolved'+('; 4 clipped 24x32 cells, head up' if name.startswith('bug-') else ''))
(P/'validation.txt').write_text('\n'.join(report)+'\n',encoding='utf8')
print('\n'.join(report))
