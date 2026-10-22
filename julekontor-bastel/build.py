# Erzeugt index.html (vollständige Seite) aus app.html (Inhalt ohne html/head/body).
from pathlib import Path
here = Path(__file__).parent
head = '<!doctype html>\n<html lang="de">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
(here / 'index.html').write_text(head + (here / 'app.html').read_text(encoding='utf-8') + '</html>\n', encoding='utf-8')
print('index.html geschrieben')
