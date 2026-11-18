"""Server-Test: startet php -S mit leerem Datenordner und spielt einen Familienalltag durch."""
import json, os, subprocess, sys, tempfile, time, urllib.request, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tmp = tempfile.mkdtemp()
shutil.copy(os.path.join(ROOT, 'server', 'api.php'), tmp)
srv = subprocess.Popen(['php', '-S', '127.0.0.1:8765', '-t', tmp], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
BASE = 'http://127.0.0.1:8765/api.php'

def call(a, body=None, who=None, qs='', expect_ok=True):
    req = urllib.request.Request(f'{BASE}?a={a}{qs}', data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json'})
    if who: req.add_header('X-Member', who['id']); req.add_header('X-Token', who['token'])
    try:
        r = json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        r = json.loads(e.read())
    if expect_ok: assert r.get('ok'), (a, r)
    return r

fails = 0
def check(name, cond):
    global fails
    print(('OK   ' if cond else 'FEHL ') + name)
    if not cond: fails += 1

try:
    check('ping', call('ping')['app'] == 'hjemme')
    mama = call('register', {'name': 'Mama', 'color': 0xE91E63})
    kind = call('register', {'name': 'Lena', 'color': 0x4CAF50})
    fremd = call('register', {'name': 'Fremder'})
    c = call('create_circle', {'name': 'Familie'}, mama)['circle']
    check('Kreis angelegt mit Code', len(c['code']) == 6)
    call('join', {'code': c['code'].lower()}, kind)
    check('falscher Code abgelehnt', not call('join', {'code': 'XXXXXX'}, fremd, expect_ok=False)['ok'])
    p0 = call('poll', who=mama, qs='&since=0')
    cur = p0['cursor']
    check('zwei Mitglieder', len(p0['circles'][0]['members']) == 2)
    call('place_save', {'circle': c['id'], 'place': {'name': 'Schule', 'icon': '🏫', 'lat': 55.0, 'lng': 10.0, 'radius': 150}}, mama)
    now = int(time.time() * 1000)
    call('loc', {'points': [{'lat': 55.01, 'lng': 10.0, 'acc': 10, 'ts': now - 60000}], 'bat': 40}, kind)
    call('loc', {'points': [{'lat': 55.0003, 'lng': 10.0, 'acc': 10, 'ts': now}], 'bat': 14}, kind)
    p = call('poll', who=mama, qs=f'&since={cur}')
    types = [e['type'] for e in p['events']]
    check('Ankunft an der Schule gemeldet', 'arrive' in types)
    check('Akku schwach gemeldet', 'battery_low' in types)
    lena = [m for m in p['circles'][0]['members'] if m['name'] == 'Lena'][0]
    check('Lena ist an der Schule', lena['place'] is not None)
    call('loc', {'points': [{'lat': 55.02, 'lng': 10.0, 'acc': 10, 'ts': now + 1000}], 'bat': 13}, kind)
    p2 = call('poll', who=mama, qs=f'&since={p["cursor"]}')
    check('Verlassen gemeldet', [e['type'] for e in p2['events']] == ['leave'])
    check('Akku nicht doppelt', 'battery_low' not in [e['type'] for e in p2['events']])
    h = call('history', who=mama, qs=f'&member={kind["id"]}&from={now-3600000}&to={now+3600000}')
    check('Verlauf 3 Punkte', len(h['points']) == 3)
    check('Fremder sieht keinen Verlauf', not call('history', who=fremd, qs=f'&member={kind["id"]}', expect_ok=False)['ok'])
    call('send', {'circle': c['id'], 'type': 'ring', 'target': kind['id']}, mama)
    pk = call('poll', who=kind, qs=f'&since={p2["cursor"]}')
    check('Klingeln kommt an', any(e['type'] == 'ring' and e['target'] == kind['id'] for e in pk['events']))
    call('share', {'paused': True}, kind)
    pm = call('poll', who=mama, qs=f'&since={p2["cursor"]}')
    lena = [m for m in pm['circles'][0]['members'] if m['name'] == 'Lena'][0]
    check('Pausiert: kein Ort sichtbar', 'lat' not in (lena['last'] or {}) and lena['paused'])
    call('share', {'paused': False, 'bubbleUntil': now + 3600000}, kind)
    pm = call('poll', who=mama, qs='&since=0')
    lena = [m for m in pm['circles'][0]['members'] if m['name'] == 'Lena'][0]
    check('Blase: ungefährer Ort', lena['bubble'] and lena['last']['acc'] == 2000)
    call('circle_update', {'circle': c['id'], 'settings': {'speedLimit': 50}}, mama)
    check('Nur Admin ändert Kreis', not call('circle_update', {'circle': c['id'], 'name': 'X'}, kind, expect_ok=False)['ok'])
    call('share', {'bubbleUntil': 0}, kind)
    cur = call('poll', who=mama, qs='&since=0')['cursor']
    call('loc', {'points': [{'lat': 55.03, 'lng': 10.0, 'acc': 8, 'spd': 25, 'ts': now + 5000}], 'bat': 50}, kind)
    check('Tempo-Warnung', 'speeding' in [e['type'] for e in call('poll', who=mama, qs=f'&since={cur}')['events']])
    call('eta', {'dest': {'name': 'Oma', 'lat': 55.1, 'lng': 10.0}, 'minutes': 12}, kind)
    call('loc', {'points': [{'lat': 55.1005, 'lng': 10.0, 'acc': 8, 'ts': now + 9000}], 'bat': 50}, kind)
    ev = [e['type'] for e in call('poll', who=mama, qs=f'&since={cur}')['events']]
    check('Unterwegs + angekommen', 'eta_start' in ev and 'eta_arrived' in ev)
    call('send', {'type': 'sos', 'lat': 55.1, 'lng': 10.0}, kind)
    call('send', {'circle': c['id'], 'type': 'chat', 'text': 'Hallo 👋'}, mama)
    ev = call('poll', who=kind, qs=f'&since={cur}')['events']
    check('SOS + Chat', 'sos' in [e['type'] for e in ev] and any(e['data'].get('text') == 'Hallo 👋' for e in ev))
    check('Fremder darf nicht in Kreis schreiben', not call('send', {'circle': c['id'], 'type': 'chat', 'text': 'x'}, fremd, expect_ok=False)['ok'])
    check('ungültiges Token', not call('poll', who={'id': kind['id'], 'token': 'falsch'}, expect_ok=False)['ok'])
    call('loc', {'points': [{'lat': 55.1006, 'lng': 10.0, 'acc': 8, 'ts': now + 12000}], 'bat': 0}, kind)
    lena = [m for m in call('poll', who=mama, qs='&since=0')['circles'][0]['members'] if m['name'] == 'Lena'][0]
    check('Akku 0 wird ignoriert, letzter Wert bleibt', lena['last']['bat'] == 50)
    call('loc', {'points': [{'lat': 55.1006, 'lng': 10.0, 'acc': 8, 'ts': now + 13000}], 'bat': 44, 'diag': {'bg': False, 'opt': True, 'save': False, 'svc': True, 'v': '1.0.13'}}, kind)
    lena = [m for m in call('poll', who=mama, qs='&since=0')['circles'][0]['members'] if m['name'] == 'Lena'][0]
    check('Geräte-Einstellungen kommen an', lena['last']['diag']['bg'] is False and lena['last']['diag']['opt'] is True)
    call('leave', {'circle': c['id']}, kind)
    check('Austreten', len(call('poll', who=mama, qs='&since=0')['circles'][0]['members']) == 1)
finally:
    srv.terminate()
    shutil.rmtree(tmp)
print('Fehler:', fails)
sys.exit(1 if fails else 0)
