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
(pub/'index.html').write_text(html)
shutil.copy(src/'styles.css', pub/'styles.css'); shutil.copy(src/'app.js', pub/'app.js')
# preview: един файл, без собствени html/head/body тагове
body = html.split('<!--BODY-->')[1].split('<!--/BODY-->')[0]
fav = (pub/'assets'/'mark-light.svg').read_text()
prev = ('<title>ATOL Accounting</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&family=Manrope:wght@400;500;600;700&display=swap">\n'
  '<style>\n' + (src/'styles.css').read_text() + '\n</style>\n' + body + '\n<script>\n' + (src/'app.js').read_text() + '\n</script>\n')
(R/'preview.html').write_text(prev)
print('built', len(prev))
