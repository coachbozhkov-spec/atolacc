"""Сглобява public/ от src/ (вгражда логото) и прави preview.html за прегледа."""
import re, shutil, pathlib
R = pathlib.Path(__file__).parent
src, pub = R/'src', R/'public'
logo = (pub/'assets'/'logo-horizontal-light.svg').read_text()
logo = re.sub(r'<\?xml[^>]*>|xmlns:c2pa="[^"]*"', '', logo)
def themed(svg, pre):
    svg = svg.replace('stop-color="#D6336C"', 'style="stop-color:var(--g1)"').replace('stop-color="#E8743B"', 'style="stop-color:var(--g2)"').replace('stop-color="#EBA53A"', 'style="stop-color:var(--g3)"')
    svg = svg.replace('lighth', pre)
    return svg.replace('role="img"', 'role="img" width="193" height="62"')
html = (src/'index.html').read_text()
html = html.replace('{{LOGO_HEADER}}', themed(logo, 'hd')).replace('{{LOGO_FOOTER}}', themed(logo, 'ft').replace('var(--g1)', '#FF5FA2').replace('var(--g2)', '#FF9A4D').replace('var(--g3)', '#FFD04D'))

import html as H
C = {}
exec((src/'content.py').read_text(), C)
def esc(t): return H.escape(t, quote=True)
svc = []
for i, x in enumerate(C['SERVICES']):
    cls = 'svc rv' + (' feature' if x.get('feature') else '') + (' dark' if x.get('dark') else '')
    tag = f'<span class="tag">{esc(x["tag"])}</span>' if x.get('tag') else ''
    items = ''.join(f'<li>{esc(t)}</li>' for t in x['items'])
    svc.append(f'   <a class="{cls}" href="#svc-{x["id"]}" data-detail="svc-{x["id"]}" data-service="{esc(x["title"])}">{tag}<span class="ic"><svg><use href="#i-{x["icon"]}"/></svg></span><h3>{esc(x["title"])}</h3><p>{esc(x["short"])}</p><span class="more">Какво включва <svg><use href="#i-arrow"/></svg></span></a>\n'
               f'   <template id="svc-{x["id"]}" data-kind="Услуга" data-icon="{x["icon"]}" data-title="{esc(x["title"])}"><h4>За кого е</h4><p>{esc(x["who"])}</p><h4>Какво включва</h4><ul class="checks">{items}</ul></template>')
ind = []
for i, x in enumerate(C['INDUSTRIES']):
    ind.append(f'   <li class="rv" style="--i:{i % 8}"><a href="#ind-{i}" data-detail="ind-{i}"><svg><use href="#i-{x["icon"]}"/></svg><span>{esc(x["short"])}</span><svg class="go"><use href="#i-arrow"/></svg></a>'
               f'<template id="ind-{i}" data-kind="Индустрия" data-icon="{x["icon"]}" data-title="{esc(x["title"])}"><p class="lead-in">{esc(x["intro"])}</p><h4>Какво предлагаме</h4><p>{esc(x["offer"])}</p></template></li>')
ind.append(f'   <li class="rv cta-tile" style="--i:6"><a href="#contacts"><svg><use href="#i-chat"/></svg><span>Друг бранш? Пишете ни</span><svg class="go"><use href="#i-arrow"/></svg></a></li>')
steps = ''.join(f'   <li class="rv" style="--i:{i}"><span class="n">{i+1}</span><h3>{esc(t)}</h3><p>{esc(d)}</p></li>\n' for i, (t, d) in enumerate(C['STEPS']))
html = html.replace('{{SERVICES}}', '\n'.join(svc)).replace('{{INDUSTRIES}}', '\n'.join(ind)).replace('{{STEPS}}', steps.rstrip())
(pub/'index.html').write_text(html)
shutil.copy(src/'styles.css', pub/'styles.css'); shutil.copy(src/'app.js', pub/'app.js')
for f in ('admin.html', 'admin.js'): shutil.copy(src/f, pub/f)
# preview: един файл, без собствени html/head/body тагове
body = html.split('<!--BODY-->')[1].split('<!--/BODY-->')[0]
fav = (pub/'assets'/'mark-light.svg').read_text()
prev = ('<title>ATOL Accounting</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap">\n'
  '<style>\n' + (src/'styles.css').read_text() + '\n</style>\n' + body + '\n<script>\n' + (src/'app.js').read_text() + '\n</script>\n')
import base64
prev = prev.replace('<source srcset="assets/desislava.webp" type="image/webp">','').replace('src="assets/desislava.jpg"', 'src="data:image/jpeg;base64,' + base64.b64encode((pub/'assets'/'desislava.jpg').read_bytes()).decode() + '"')
(R/'preview.html').write_text(prev)
print('built', len(prev))
