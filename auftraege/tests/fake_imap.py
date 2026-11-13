#!/usr/bin/env python3
"""Mini-IMAP-Server nur für Tests (ohne Verschlüsselung, ein Postfach im Speicher).
Aufruf: fake_imap.py PORT ORDNER   – ORDNER enthält *.eml für den Posteingang; APPEND landet in „Sent“.
Kann: LOGIN (auch als Literal), LIST, SELECT, UID SEARCH, UID FETCH (FLAGS/RFC822.SIZE/BODY.PEEK[]), UID STORE, UID MOVE, APPEND, LOGOUT.
"""
import os, re, socketserver, sys, json

PORT = int(sys.argv[1]); DIR = sys.argv[2]
BOXES = {'INBOX': [], 'Sent': [], 'Trash': []}   # Liste von dicts: uid, data(bytes), flags(set)
for i, name in enumerate(sorted(os.listdir(DIR))):
    if name.endswith('.eml'):
        BOXES['INBOX'].append({'uid': i + 1, 'data': open(os.path.join(DIR, name), 'rb').read(), 'flags': set()})
LOG = os.path.join(DIR, 'imap-log.json')

def save_log():
    json.dump({b: [{'uid': m['uid'], 'flags': sorted(m['flags']), 'size': len(m['data'])} for m in v] for b, v in BOXES.items()}, open(LOG, 'w'))

class H(socketserver.StreamRequestHandler):
    def w(self, s):
        self.wfile.write(s if isinstance(s, bytes) else s.encode()); self.wfile.flush()

    def read_cmd(self):
        line = self.rfile.readline()
        if not line:
            return None, []
        lits = []
        while True:
            m = re.search(rb'\{(\d+)\}\r\n$', line)
            if not m:
                break
            self.w('+ OK\r\n')
            n = int(m.group(1)); data = self.rfile.read(n); lits.append(data)
            line = line[:m.start()] + b'\x00LIT' + str(len(lits) - 1).encode() + b'\x00' + self.rfile.readline()
        return line.decode('utf-8', 'replace').rstrip('\r\n'), lits

    def handle(self):
        self.w('* OK fake IMAP ready\r\n')
        box = None
        while True:
            line, lits = self.read_cmd()
            if line is None:
                return
            parts = line.split(' ', 2)
            tag = parts[0]; cmd = (parts[1] if len(parts) > 1 else '').upper(); rest = parts[2] if len(parts) > 2 else ''
            if cmd == 'UID':
                sub, _, rest = rest.partition(' '); cmd = 'UID ' + sub.upper()
            if cmd == 'LOGIN':
                self.w(f'{tag} OK logged in\r\n')
            elif cmd == 'LOGOUT':
                self.w('* BYE\r\n'); self.w(f'{tag} OK bye\r\n'); return
            elif cmd == 'LIST':
                self.w('* LIST (\\HasNoChildren) "." "INBOX"\r\n* LIST (\\HasNoChildren \\Sent) "." "Sent"\r\n* LIST (\\HasNoChildren \\Trash) "." "Trash"\r\n'); self.w(f'{tag} OK\r\n')
            elif cmd == 'SELECT':
                box = rest.strip('"'); msgs = BOXES.get(box, [])
                self.w(f'* {len(msgs)} EXISTS\r\n* OK [UIDVALIDITY 42] ok\r\n* OK [UIDNEXT {len(msgs) + 1}] ok\r\n'); self.w(f'{tag} OK [READ-WRITE] selected\r\n')
            elif cmd == 'UID SEARCH':
                msgs = BOXES.get(box, [])
                m = re.match(r'UID (\d+):\*', rest)
                uids = [x['uid'] for x in msgs if not m or x['uid'] >= int(m.group(1))]
                if m and not uids and msgs:
                    uids = [msgs[-1]['uid']]   # wie echte Server: n:* liefert mindestens die höchste UID
                self.w('* SEARCH ' + ' '.join(map(str, uids)) + '\r\n'); self.w(f'{tag} OK\r\n')
            elif cmd == 'UID FETCH':
                ids, _, what = rest.partition(' ')
                want = set(int(x) for x in ids.split(','))
                for seq, x in enumerate(BOXES.get(box, []), 1):
                    if x['uid'] not in want:
                        continue
                    if 'BODY.PEEK[' in what:
                        data = x['data']
                        if 'HEADER' in what:
                            data = data.split(b'\r\n\r\n', 1)[0] + b'\r\n\r\n'
                        self.w(f'* {seq} FETCH (UID {x["uid"]} BODY[] {{{len(data)}}}\r\n'.encode() + data + b')\r\n')
                    else:
                        fl = ' '.join(sorted(x['flags']))
                        self.w(f'* {seq} FETCH (UID {x["uid"]} RFC822.SIZE {len(x["data"])} FLAGS ({fl}))\r\n')
                self.w(f'{tag} OK\r\n')
            elif cmd == 'UID STORE':
                ids, _, what = rest.partition(' ')
                for x in BOXES.get(box, []):
                    if str(x['uid']) in ids.split(',') and '\\Seen' in what:
                        x['flags'].add('\\Seen')
                save_log(); self.w(f'{tag} OK\r\n')
            elif cmd == 'UID MOVE':
                ids, _, dest = rest.partition(' ')
                dest = dest.strip('"'); want = set(int(x) for x in ids.split(','))
                keep, moved = [], []
                for x in BOXES.get(box, []):
                    (moved if x['uid'] in want else keep).append(x)
                BOXES[box] = keep
                tgt = BOXES.setdefault(dest, [])
                for x in moved:
                    tgt.append({'uid': len(tgt) + 1, 'data': x['data'], 'flags': x['flags']})
                save_log(); self.w(f'{tag} OK MOVE completed\r\n')
            elif cmd == 'APPEND':
                name = re.match(r'"([^"]+)"', rest).group(1)
                lst = BOXES.setdefault(name, [])
                lst.append({'uid': len(lst) + 1, 'data': lits[0] if lits else b'', 'flags': {'\\Seen'}})
                save_log(); self.w(f'{tag} OK APPEND completed\r\n')
            else:
                self.w(f'{tag} BAD unknown {cmd}\r\n')

class S(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

save_log()
S(('127.0.0.1', PORT), H).serve_forever()
