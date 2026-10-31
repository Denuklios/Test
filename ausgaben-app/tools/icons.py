"""Eigenes Symbol-Set des AusgabenKompass.
Erzeugt: Web-Symbole (assets/www/icons.js) und Android-Vektoren fürs Widget (res/drawable/ic_w_*.xml).
Aufruf:  python3 tools/icons.py   (im Ordner ausgaben-app)
Jedes Symbol: Liste von (Pfad, Art) – 'l' = Linie, 'f' = Akzentfläche (halbtransparent) + Linie, 'd' = nur Fläche."""
import json, os

ICONS = {
  # Euro-Münze mit Plus
  'amount': [("M10.5,3.5a7,7 0 1,0 0,14a7,7 0 1,0 0,-14z", 'l'),
             ("M13.2,7.8A3.4,3.4 0 1,0 13.2,13.2", 'l'),
             ("M7.3,9.6h4.4M7.3,11.5h4.4", 'l'),
             ("M18,13.8a4.2,4.2 0 1,0 0,8.4a4.2,4.2 0 1,0 0,-8.4z", 'f'),
             ("M18,16.2v3.6M16.2,18h3.6", 'l')],
  # Kassenbon im Scan-Rahmen
  'photo': [("M3,8V5.5A2.5,2.5 0 0,1 5.5,3H8M16,3h2.5A2.5,2.5 0 0,1 21,5.5V8M21,16v2.5A2.5,2.5 0 0,1 18.5,21H16M8,21H5.5A2.5,2.5 0 0,1 3,18.5V16", 'l'),
            ("M8.5,6.5h7v10.8l-1.4,-1 -1.4,1 -1.4,-1 -1.4,1 -1.4,-1z", 'f'),
            ("M10.5,9.5h3M10.5,12h3", 'l')],
  # Einkaufstüte mit Pfeil nach oben
  'upload': [("M5,8.5h14l-1,11a1.8,1.8 0 0,1 -1.8,1.5H7.8A1.8,1.8 0 0,1 6,19.5z", 'f'),
             ("M9,8.5V7a3,3 0 0,1 6,0v1.5", 'l'),
             ("M12,18.2v-6M9.6,14.4L12,12l2.4,2.4", 'l')],
  # Kontoauszug mit Buchungszeilen
  'bank': [("M7,3h7l5,5v11a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V5a2,2 0 0,1 2,-2z", 'l'),
           ("M14,3v5h5z", 'f'),
           ("M8.6,12h0.01M11,12h5M8.6,15h0.01M11,15h5M8.6,18h0.01M11,18h3", 'l')],
  # Geldbörse
  'income': [("M4,7.5V18a2,2 0 0,0 2,2h13V9.5H6a2,2 0 0,1 -2,-2a2,2 0 0,1 2,-2h11v4", 'l'),
             ("M15.5,13h3.5v3h-3.5a1.5,1.5 0 0,1 0,-3z", 'f')],
  # Reiter: Tacho
  'home': [("M5.6,18.4A9,9 0 1,1 18.4,18.4", 'l'),
           ("M12,12l3.6,-3.6", 'l'),
           ("M12,10a2,2 0 1,0 0,4a2,2 0 1,0 0,-4z", 'f')],
  # Reiter: Bonrolle
  'tx': [("M6,3h12v18l-2,-1.4 -2,1.4 -2,-1.4 -2,1.4 -2,-1.4 -2,1.4z", 'f'),
         ("M9,8h6M9,11.5h6M9,15h3.5", 'l')],
  # Reiter: Kalender mit Wiederholung
  'fix': [("M4,7a2,2 0 0,1 2,-2h12a2,2 0 0,1 2,2v2.5H4z", 'd'),
          ("M4,7a2,2 0 0,1 2,-2h12a2,2 0 0,1 2,2v11a2,2 0 0,1 -2,2H6a2,2 0 0,1 -2,-2z", 'l'),
          ("M8.5,3v4M15.5,3v4", 'l'),
          ("M15,15A3,3 0 1,1 14.1,12.9M14.1,12.9l0.3,-1.8M14.1,12.9l-1.8,-0.2", 'l')],
  # Reiter: Balken mit Trendlinie
  'stats': [("M6,20v-4M11,20v-6.5M16,20v-3", 'l'),
            ("M4,11.5l5,-4.5 4,3 7,-6", 'l'),
            ("M20,4a1.6,1.6 0 1,0 0.01,0z", 'f')],
  # Reiter: Kacheln
  'more': [("M5.5,4h3.5a1.5,1.5 0 0,1 1.5,1.5V9a1.5,1.5 0 0,1 -1.5,1.5H5.5A1.5,1.5 0 0,1 4,9V5.5A1.5,1.5 0 0,1 5.5,4z"
            "M15,4h3.5a1.5,1.5 0 0,1 1.5,1.5V9a1.5,1.5 0 0,1 -1.5,1.5H15A1.5,1.5 0 0,1 13.5,9V5.5A1.5,1.5 0 0,1 15,4z"
            "M5.5,13.5h3.5a1.5,1.5 0 0,1 1.5,1.5v3.5a1.5,1.5 0 0,1 -1.5,1.5H5.5A1.5,1.5 0 0,1 4,18.5V15a1.5,1.5 0 0,1 1.5,-1.5z", 'l'),
           ("M16.75,13.5a3.25,3.25 0 1,0 0,6.5a3.25,3.25 0 1,0 0,-6.5z", 'f')],
}

# Kategorien (Präfix c_)
CATS = {
  'lebensmittel': [("M6.2,7h13.6l-2,7.5H7.4z", 'd'), ("M3,4h2.2l2.2,10.5h10.2l2,-7.5H6.2", 'l'), ("M9,17.8a1.5,1.5 0 1,0 0.01,0zM17,17.8a1.5,1.5 0 1,0 0.01,0z", 'f')],
  'drogerie': [("M10,3h4v3l1.5,2v11a2,2 0 0,1 -2,2h-3a2,2 0 0,1 -2,-2V8l1.5,-2z", 'l'), ("M8.5,11h7v5h-7z", 'f')],
  'restaurant': [("M7,3v6a2,2 0 0,0 4,0V3M9,3v18", 'l'), ("M16.5,3c-2,1.5 -3,4 -3,7.5h3z", 'f'), ("M16.5,3v18", 'l')],
  'mobilitaet': [("M7,6h6v4H7z", 'f'), ("M5,21V5a2,2 0 0,1 2,-2h6a2,2 0 0,1 2,2v16M3.5,21h13M15,9h2a1.5,1.5 0 0,1 1.5,1.5V16a1.5,1.5 0 0,0 3,0V8l-2.5,-2.5", 'l')],
  'oepnv': [("M6.5,6.5h11v4h-11z", 'd'), ("M7,3h10a3,3 0 0,1 3,3v8a3,3 0 0,1 -3,3H7a3,3 0 0,1 -3,-3V6a3,3 0 0,1 3,-3zM8,14h0.01M16,14h0.01M8,17l-2,4M16,17l2,4", 'l')],
  'wohnen': [("M4,10.5L12,4l8,6.5V19a2,2 0 0,1 -2,2H6a2,2 0 0,1 -2,-2z", 'l'), ("M10,21v-5.5h4V21z", 'f')],
  'energie': [("M13,3L5.5,13.5H11L10,21l7.5,-10.5H12z", 'f')],
  'versicherung': [("M12,3l7,3v5.5c0,4.5 -3,8 -7,9.5c-4,-1.5 -7,-5 -7,-9.5V6z", 'f'), ("M9,12l2,2 4,-4", 'l')],
  'abos': [("M4,6a2,2 0 0,1 2,-2h12a2,2 0 0,1 2,2v9a2,2 0 0,1 -2,2H6a2,2 0 0,1 -2,-2zM9,21h6M12,17v4", 'l'), ("M10.5,8v5l4,-2.5z", 'f')],
  'telefon': [("M7.5,5h9v12h-9z", 'd'), ("M8,2.5h8a2,2 0 0,1 2,2v15a2,2 0 0,1 -2,2H8a2,2 0 0,1 -2,-2v-15a2,2 0 0,1 2,-2zM11,19h2", 'l')],
  'online': [("M12,3l8,4.5 -8,4.5 -8,-4.5z", 'd'), ("M12,3l8,4.5v9L12,21l-8,-4.5v-9zM4,7.5l8,4.5 8,-4.5M12,12v9", 'l')],
  'kleidung': [("M8.5,3.5L4,6l1.5,4H8v10.5h8V10h2.5L20,6l-4.5,-2.5c-0.5,1.5 -2,2.5 -3.5,2.5s-3,-1 -3.5,-2.5z", 'f')],
  'gesundheit': [("M12,20s-7,-4.4 -7,-10a4,4 0 0,1 7,-2.6A4,4 0 0,1 19,10c0,5.6 -7,10 -7,10z", 'f'), ("M12,9.5v4M10,11.5h4", 'l')],
  'freizeit': [("M6,5h12a2,2 0 0,1 2,2v2.5a2,2 0 0,0 0,4V17a2,2 0 0,1 -2,2H6a2,2 0 0,1 -2,-2v-3.5a2,2 0 0,0 0,-4V7a2,2 0 0,1 2,-2z", 'f'), ("M14.5,7.5v1M14.5,11v2M14.5,15.5v1", 'l')],
  'kinder': [("M6.5,6a2.3,2.3 0 1,0 0.01,0zM17.5,6a2.3,2.3 0 1,0 0.01,0z", 'f'), ("M12,7.5a6.5,6.5 0 1,0 0.01,0zM10,13h0.01M14,13h0.01M10.5,16.2c0.8,0.7 2.2,0.7 3,0", 'l')],
  'kredit': [("M5,11a6,5 0 0,1 6,-5h3a6,5 0 0,1 5.5,3.5H21v4h-1.6a6,5 0 0,1 -2.4,2.7V19h-2.5v-2h-4v2H8v-3c-1.8,-1 -3,-2.8 -3,-5z", 'f'), ("M10.5,8.8h3M16.5,10.5h0.01", 'l')],
  'bar': [("M4.5,6.5h15a1.5,1.5 0 0,1 1.5,1.5v8a1.5,1.5 0 0,1 -1.5,1.5h-15A1.5,1.5 0 0,1 3,16V8a1.5,1.5 0 0,1 1.5,-1.5z", 'f'), ("M12,9.5a2.5,2.5 0 1,0 0.01,0zM6.5,9.8h0.01M17.5,14.2h0.01", 'l')],
  'sonstiges': [("M3.5,12.5V5a1.5,1.5 0 0,1 1.5,-1.5h7.5l8,8a1.5,1.5 0 0,1 0,2.1l-6.4,6.4a1.5,1.5 0 0,1 -2.1,0z", 'f'), ("M8,8h0.01", 'l')],
  'einnahme': [("M12,3.5a8.5,8.5 0 1,0 0.01,0z", 'f'), ("M12,7.5v8M8.8,12.5L12,15.7l3.2,-3.2", 'l')],
}
ICONS.update({'c_' + k: v for k, v in CATS.items()})

root = os.path.join(os.path.dirname(__file__), '..', 'app', 'src', 'main')
with open(os.path.join(root, 'assets', 'www', 'icons.js'), 'w') as f:
    f.write('/* Erzeugt von tools/icons.py – nicht von Hand ändern. */\nwindow.ICONS = ' + json.dumps(ICONS) + ';\n')

for name in ('amount', 'photo', 'upload'):
    parts = []
    for d, k in ICONS[name]:
        if k in ('f', 'd'):
            parts.append(f'  <path android:fillColor="#FFFFFF" android:fillAlpha="0.3" android:pathData="{d}"/>')
        if k in ('l', 'f'):
            parts.append(f'  <path android:strokeColor="#FFFFFF" android:strokeWidth="1.8" android:strokeLineCap="round" android:strokeLineJoin="round" android:pathData="{d}"/>')
    with open(os.path.join(root, 'res', 'drawable', f'ic_w_{name}.xml'), 'w') as f:
        f.write('<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n' + '\n'.join(parts) + '\n</vector>\n')
print('ok:', ', '.join(ICONS))
