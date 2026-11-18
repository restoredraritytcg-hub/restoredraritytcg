"""Shiny Asset Exchange — refreshed logo concept (pitch). Writes outlined SVGs (no font dependency).
Usage: python3 make_logo.py OUT_DIR"""
import math, sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

OUT = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
G = TTFont(os.path.join(HERE, 'grotesk.woff2'))
P = TTFont(os.path.join(HERE, 'playfair.woff2'))

RED, RED_D, GOLD, GOLD_L, GOLD_D, INK = '#e3202a', '#9e1119', '#e8c27e', '#f8e4b8', '#b0843f', '#0a0a0c'

def glyph(font, ch):
    cmap = font.getBestCmap(); gs = font.getGlyphSet()
    name = cmap[ord(ch)]
    pen = SVGPathPen(gs); gs[name].draw(pen)
    return pen.getCommands(), gs[name].width

def text_path(font, s, size, tracking=0.0):
    """Straight text → list of (path, x_offset, advance_px); baseline y=0, y flipped for SVG."""
    k = size / font['head'].unitsPerEm; out = []; x = 0
    for ch in s:
        d, adv = glyph(font, ch)
        out.append((d, x)); x += adv * k + tracking * size
    return out, x - tracking * size, k

def straight(font, s, size, x, y, fill, tracking=0.0, anchor='start'):
    parts, w, k = text_path(font, s, size, tracking)
    if anchor == 'middle': x -= w / 2
    elif anchor == 'end': x -= w
    g = ''.join(f'<path d="{d}" transform="translate({x+ox:.2f} {y:.2f}) scale({k:.5f} {-k:.5f})"/>' for d, ox in parts if d)
    return f'<g fill="{fill}">{g}</g>', w

def arc_text(font, s, size, cx, cy, r, center_deg, fill, tracking=0.12, bottom=False):
    """Text centred on angle center_deg along a circle of radius r (band centre). Top: reads clockwise,
    letters point out. Bottom: reads left→right, letters upright (point in)."""
    parts, w, k = text_path(font, s, size, tracking)
    cap = 0.70 * size
    rb = r + cap / 2 if bottom else r - cap / 2            # baseline radius so caps sit centred on r
    span = w / rb
    out = []
    for (d, ox), ch in zip(parts, s):
        _, adv = glyph(font, ch); advpx = adv * k
        t = (ox + advpx / 2)
        if bottom: a = math.radians(center_deg) + span / 2 - t / rb; rot = math.degrees(a) - 90
        else:      a = math.radians(center_deg) - span / 2 + t / rb; rot = math.degrees(a) + 90
        px, py = cx + rb * math.cos(a), cy + rb * math.sin(a)
        if d: out.append(f'<path d="{d}" transform="translate({px:.2f} {py:.2f}) rotate({rot:.2f}) translate({-advpx/2:.2f} 0) scale({k:.5f} {-k:.5f})"/>')
    return f'<g fill="{fill}">{"".join(out)}</g>', math.degrees(span)

def arrow_arc(cx, cy, r, a0, a1, color, width):
    """Clockwise arc from a0 to a1 (degrees) with an arrowhead at a1."""
    head = 7.5  # degrees used by the head
    a1b = a1 - head * 0.55
    p = lambda a, rr=r: (cx + rr * math.cos(math.radians(a)), cy + rr * math.sin(math.radians(a)))
    x0, y0 = p(a0); x1, y1 = p(a1b)
    large = 1 if (a1b - a0) % 360 > 180 else 0
    arc = f'<path d="M{x0:.2f} {y0:.2f} A{r} {r} 0 {large} 1 {x1:.2f} {y1:.2f}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'
    tip = p(a1); hw = width * 1.55
    bl, br = p(a1 - head, r - hw), p(a1 - head, r + hw)
    return arc + f'<path d="M{tip[0]:.2f} {tip[1]:.2f} L{bl[0]:.2f} {bl[1]:.2f} L{br[0]:.2f} {br[1]:.2f} Z" fill="{color}" stroke="{color}" stroke-width="3" stroke-linejoin="round"/>'

def sparkle(x, y, r, fill, rot=0):
    i = r * 0.22
    return (f'<path transform="translate({x} {y}) rotate({rot})" fill="{fill}" d="M0 {-r} C{i} {-i} {i} {-i} {r} 0 C{i} {i} {i} {i} 0 {r} '
            f'C{-i} {i} {-i} {i} {-r} 0 C{-i} {-i} {-i} {-i} 0 {-r} Z"/>')

DEFS = f'''<defs>
  <radialGradient id="disc" cx="50%" cy="38%" r="65%"><stop offset="0" stop-color="#1d1d23"/><stop offset="1" stop-color="{INK}"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{GOLD_L}"/><stop offset=".5" stop-color="{GOLD}"/><stop offset="1" stop-color="{GOLD_D}"/></linearGradient>
  <linearGradient id="red" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff4a52"/><stop offset=".55" stop-color="{RED}"/><stop offset="1" stop-color="{RED_D}"/></linearGradient>
  <linearGradient id="holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#e9ecf2"/>
    <stop offset=".55" stop-color="#fbe9ef"/><stop offset=".75" stop-color="#e6eef8"/><stop offset="1" stop-color="#c9ced8"/></linearGradient>
  <linearGradient id="shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <linearGradient id="backcard" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2c2c33"/><stop offset="1" stop-color="#141418"/></linearGradient>
  <clipPath id="frontclip"><rect x="-105" y="-147" width="210" height="294" rx="18"/></clipPath>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="{RED}" stop-opacity=".45"/><stop offset="1" stop-color="{RED}" stop-opacity="0"/></radialGradient>
</defs>'''

def cards(cx, cy, scale=1.0):
    """The two-card mark centred at (cx, cy)."""
    return f'''<g transform="translate({cx} {cy}) scale({scale})">
  <circle r="230" fill="url(#glow)"/>
  <g transform="translate(-52 6) rotate(-13)"><rect x="-105" y="-147" width="210" height="294" rx="18" fill="url(#backcard)" stroke="url(#red)" stroke-width="9"/>
    <rect x="-84" y="-126" width="168" height="252" rx="10" fill="none" stroke="{RED}" stroke-opacity=".35" stroke-width="3"/></g>
  <g transform="translate(44 -14) rotate(9)">
    <rect x="-105" y="-147" width="210" height="294" rx="18" fill="url(#holo)" stroke="url(#gold)" stroke-width="9"/>
    <g clip-path="url(#frontclip)"><rect x="-60" y="-260" width="70" height="560" fill="url(#shine)" transform="rotate(28)"/>
      <rect x="40" y="-260" width="26" height="560" fill="url(#shine)" opacity=".7" transform="rotate(28)"/></g>
    <rect x="-84" y="-126" width="168" height="160" rx="8" fill="none" stroke="{GOLD_D}" stroke-opacity=".55" stroke-width="3"/>
    <rect x="-84" y="50" width="168" height="10" rx="5" fill="{GOLD_D}" opacity=".35"/><rect x="-84" y="72" width="120" height="10" rx="5" fill="{GOLD_D}" opacity=".25"/></g>
  {sparkle(150, -150, 46, 'url(#gold)', 0)}{sparkle(196, -86, 20, '#ffffff', 0)}{sparkle(-160, 150, 16, GOLD, 0)}
</g>'''

def plate(cx, cy, w=520):
    a, _ = straight(G, 'SHINY ASSET', 34, cx, cy - 12, 'url(#gold)', tracking=0.32, anchor='middle')
    b, bw = straight(G, 'EXCHANGE', 78, cx, cy + 62, '#ffffff', tracking=0.06, anchor='middle')
    return f'''<g><rect x="{cx-w/2}" y="{cy-60}" width="{w}" height="146" rx="14" fill="{INK}" fill-opacity=".92" stroke="#2c2c33" stroke-width="2"/>
  <rect x="{cx-w/2+24}" y="{cy-60}" width="{w-48}" height="4" fill="url(#red)"/><rect x="{cx-w/2+24}" y="{cy+82}" width="{w-48}" height="4" fill="url(#red)"/>
  {a}{b}</g>'''

def badge():
    cx = cy = 500; band = 412
    t1, s1 = arc_text(G, 'REVIVE', 54, cx, cy, band, -90, '#ffffff', 0.16)
    t2, s2 = arc_text(G, 'RESALE', 54, cx, cy, band, 30, '#ffffff', 0.16, bottom=True)
    t3, s3 = arc_text(G, 'REPEAT', 54, cx, cy, band, 150, '#ffffff', 0.16, bottom=True)
    gap = 7
    arrows = ''.join(arrow_arc(cx, cy, band, a0 + gap, a1 - gap, 'url(#red)', 13) for a0, a1 in
                     [(-90 + s1 / 2, 30 - s2 / 2), (30 + s2 / 2, 150 - s3 / 2), (150 + s3 / 2, 270 - s1 / 2)])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
<title>Shiny Asset Exchange — logo concept</title>{DEFS}
<circle cx="500" cy="500" r="490" fill="url(#disc)"/>
<circle cx="500" cy="500" r="478" fill="none" stroke="url(#gold)" stroke-width="6"/>
<circle cx="500" cy="500" r="346" fill="#0e0e12" stroke="#2c2c33" stroke-width="3"/>
<circle cx="500" cy="500" r="336" fill="none" stroke="url(#gold)" stroke-opacity=".5" stroke-width="2"/>
{arrows}{t1}{t2}{t3}
{cards(500, 452, 1.0)}
{plate(500, 618, 500)}
</svg>'''

def icon():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
<title>Shiny Asset Exchange — icon</title>{DEFS}
<rect width="1000" height="1000" rx="220" fill="url(#disc)"/>
<rect x="18" y="18" width="964" height="964" rx="204" fill="none" stroke="url(#gold)" stroke-width="8" stroke-opacity=".8"/>
{cards(500, 520, 1.45)}
</svg>'''

def mark():
    """Word-free circular mark: arrow cycle + cards (for the horizontal logo, avatars)."""
    cx = cy = 500; band = 412
    arrows = ''.join(arrow_arc(cx, cy, band, a0, a1, 'url(#red)', 16) for a0, a1 in [(-80, 20), (40, 140), (160, 260)])
    return f'''<circle cx="500" cy="500" r="490" fill="url(#disc)"/>
<circle cx="500" cy="500" r="478" fill="none" stroke="url(#gold)" stroke-width="7"/>
<circle cx="500" cy="500" r="346" fill="#0e0e12" stroke="#2c2c33" stroke-width="3"/>
{arrows}{cards(500, 505, 1.12)}'''

def horizontal(dark=True):
    fg = '#ffffff' if dark else INK
    a, aw = straight(G, 'SHINY ASSET', 52, 650, 290, 'url(#gold)' if dark else GOLD_D, tracking=0.3)
    b, bw = straight(G, 'EXCHANGE', 150, 642, 440, fg, tracking=0.03)
    c, cw = straight(P, 'Revive · Resale · Repeat', 54, 650, 560, RED)
    w = max(650 + aw, 642 + bw, 650 + cw) + 70
    bg = f'<rect width="{w:.0f}" height="700" fill="{INK}"/>' if dark else f'<rect width="{w:.0f}" height="700" fill="#ffffff"/>'
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} 700" width="{w:.0f}" height="700">
<title>Shiny Asset Exchange — horizontal logo</title>{DEFS}{bg}
<g transform="translate(50 75) scale(.55)">{mark()}</g>
<rect x="650" y="474" width="120" height="8" rx="4" fill="url(#red)"/><rect x="782" y="474" width="40" height="8" rx="4" fill="url(#gold)"/>
{a}{b}{c}
</svg>'''

def avatar():
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">
<title>Shiny Asset Exchange — round mark</title>{DEFS}{mark()}</svg>'''

def badge_inner():
    s = badge(); return s[s.index('</defs>') + 7:s.rindex('</svg>')]

os.makedirs(OUT, exist_ok=True)
for name, svg in [('sae-logo-badge.svg', badge()), ('sae-logo-icon.svg', icon()),
                  ('sae-logo-horizontal-dark.svg', horizontal(True)), ('sae-logo-mark.svg', avatar()), ('sae-logo-horizontal-light.svg', horizontal(False))]:
    open(os.path.join(OUT, name), 'w').write(svg); print(name, len(svg) // 1024, 'KB')
