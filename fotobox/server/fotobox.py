#!/usr/bin/env python3
"""FotoBox – kleiner Foto- und Datei-Server für zu Hause.

Nur Python-Standardbibliothek, keine Zusatzpakete nötig.

Befehle:
  fotobox.py serve                 Server starten
  fotobox.py adduser NAME          Benutzer anlegen (fragt nach Passwort)
  fotobox.py passwd NAME           Passwort ändern
  fotobox.py deluser NAME          Benutzer löschen (Dateien bleiben liegen)
  fotobox.py users                 Benutzer auflisten
  fotobox.py logout NAME           Alle Geräte des Benutzers abmelden

Einstellungen über Umgebungsvariablen:
  FOTOBOX_HOME   Datenordner          (Standard: /srv/fotobox)
  FOTOBOX_PORT   Port                 (Standard: 8090)
  FOTOBOX_BIND   Adresse              (Standard: 0.0.0.0)
  FOTOBOX_CERT / FOTOBOX_KEY  optional: Zertifikat + Schlüssel für HTTPS
"""

import getpass
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import shutil
import ssl
import sys
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

VERSION = "1.0"
HOME = Path(os.environ.get("FOTOBOX_HOME", "/srv/fotobox"))
USERS_FILE = HOME / "users.json"
TOKENS_FILE = HOME / "tokens.json"
DATA_DIR = HOME / "data"
CHUNK = 1024 * 1024
NAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{1,32}$")

_lock = threading.Lock()


# ---------------------------------------------------------------- Speicher

def _load(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def _save(path, data):
    HOME.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.chmod(tmp, 0o600)
    os.replace(tmp, path)


def hash_password(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 200_000).hex()
    return f"{salt}${h}"


def check_password(pw, stored):
    salt, _ = stored.split("$", 1)
    return hmac.compare_digest(hash_password(pw, salt), stored)


def token_key(token):
    return hashlib.sha256(token.encode()).hexdigest()


def new_token(user, device):
    token = secrets.token_urlsafe(32)
    with _lock:
        tokens = _load(TOKENS_FILE)
        tokens[token_key(token)] = {"user": user, "device": device[:80], "created": int(time.time())}
        _save(TOKENS_FILE, tokens)
    return token


def user_for_token(token):
    if not token:
        return None
    with _lock:
        entry = _load(TOKENS_FILE).get(token_key(token))
        if not entry:
            return None
        if entry["user"] not in _load(USERS_FILE):
            return None
    return entry["user"]


def user_root(user):
    root = DATA_DIR / user
    root.mkdir(parents=True, exist_ok=True)
    return root


def safe_path(user, rel):
    """Relativen Pfad sicher in den Bereich des Benutzers auflösen."""
    rel = (rel or "").replace("\\", "/").strip("/")
    parts = [p for p in rel.split("/") if p not in ("", ".")]
    for p in parts:
        if p == ".." or p.startswith(".fotobox") or "\x00" in p:
            raise ValueError("ungültiger Pfad")
    root = user_root(user).resolve()
    target = root.joinpath(*parts) if parts else root
    resolved = target.resolve()
    if resolved != root and root not in resolved.parents:
        raise ValueError("ungültiger Pfad")
    return target


def free_name(path):
    """Freien Dateinamen finden: bild.jpg -> bild (1).jpg"""
    stem, suffix = path.stem, path.suffix
    n = 1
    while True:
        cand = path.with_name(f"{stem} ({n}){suffix}")
        if not cand.exists():
            return cand
        n += 1


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = "FotoBox/" + VERSION
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    # -- Hilfen
    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def error(self, code, msg):
        self.send_json({"error": msg}, code)

    def query(self):
        return {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).items()}

    def route(self):
        return urllib.parse.urlsplit(self.path).path

    def token(self):
        auth = self.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            return auth[7:].strip()
        return self.query().get("t")

    def auth(self):
        user = user_for_token(self.token())
        if not user:
            self.error(401, "nicht angemeldet")
        return user

    def read_body(self, limit=1024 * 64):
        n = int(self.headers.get("Content-Length") or 0)
        if n > limit:
            raise ValueError("zu groß")
        return self.rfile.read(n) if n else b""

    def drain(self):
        n = int(self.headers.get("Content-Length") or 0)
        while n > 0:
            chunk = self.rfile.read(min(CHUNK, n))
            if not chunk:
                break
            n -= len(chunk)

    # -- Methoden
    def do_GET(self):
        r = self.route()
        try:
            if r in ("/", "/index.html"):
                return self.send_page()
            if r.startswith("/assets/"):
                return self.send_asset(r[8:])
            if r == "/api/ping":
                return self.send_json({"ok": True, "app": "fotobox", "version": VERSION})
            user = self.auth()
            if not user:
                return
            q = self.query()
            if r == "/api/me":
                return self.send_json({"user": user})
            if r == "/api/stat":
                p = safe_path(user, q.get("path"))
                if p.is_file():
                    return self.send_json({"exists": True, "size": p.stat().st_size})
                return self.send_json({"exists": False})
            if r == "/api/list":
                return self.list_dir(user, q.get("path", ""))
            if r == "/api/file":
                return self.send_file(safe_path(user, q.get("path")), q.get("dl") == "1")
            if r == "/api/usage":
                return self.usage(user)
            self.error(404, "unbekannt")
        except ValueError as e:
            self.error(400, str(e))

    def do_POST(self):
        r = self.route()
        try:
            if r == "/api/login":
                data = json.loads(self.read_body() or b"{}")
                name = str(data.get("user", "")).strip()
                pw = str(data.get("password", ""))
                users = _load(USERS_FILE)
                if name in users and check_password(pw, users[name]["password"]):
                    tok = new_token(name, str(data.get("device", "Browser")))
                    return self.send_json({"token": tok, "user": name})
                time.sleep(1)
                return self.error(403, "Benutzer oder Passwort falsch")
            user = self.auth()
            if not user:
                return
            if r == "/api/logout":
                with _lock:
                    tokens = _load(TOKENS_FILE)
                    tokens.pop(token_key(self.token()), None)
                    _save(TOKENS_FILE, tokens)
                return self.send_json({"ok": True})
            data = json.loads(self.read_body() or b"{}")
            if r == "/api/mkdir":
                safe_path(user, data.get("path")).mkdir(parents=True, exist_ok=True)
                return self.send_json({"ok": True})
            if r == "/api/delete":
                p = safe_path(user, data.get("path"))
                if p == user_root(user):
                    return self.error(400, "Wurzel kann nicht gelöscht werden")
                if p.is_dir():
                    shutil.rmtree(p)
                elif p.exists():
                    p.unlink()
                return self.send_json({"ok": True})
            if r == "/api/rename":
                src = safe_path(user, data.get("path"))
                dst = safe_path(user, data.get("to"))
                if dst.exists():
                    return self.error(409, "Ziel existiert schon")
                dst.parent.mkdir(parents=True, exist_ok=True)
                src.rename(dst)
                return self.send_json({"ok": True})
            self.error(404, "unbekannt")
        except (ValueError, json.JSONDecodeError) as e:
            self.error(400, str(e))
        except FileNotFoundError:
            self.error(404, "nicht gefunden")

    def do_PUT(self):
        if self.route() != "/api/upload":
            self.drain()
            return self.error(404, "unbekannt")
        user = user_for_token(self.token())
        if not user:
            self.drain()
            return self.error(401, "nicht angemeldet")
        q = self.query()
        try:
            target = safe_path(user, q.get("path"))
        except ValueError as e:
            self.drain()
            return self.error(400, str(e))
        if target == user_root(user) or not target.name:
            self.drain()
            return self.error(400, "Dateiname fehlt")
        length = int(self.headers.get("Content-Length") or -1)
        if length < 0:
            return self.error(411, "Content-Length fehlt")
        if target.is_file() and target.stat().st_size == length and q.get("overwrite") != "1":
            self.drain()
            return self.send_json({"status": "exists", "path": q.get("path")})
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_name(f".fotobox-{secrets.token_hex(6)}.part")
        try:
            remaining = length
            with open(tmp, "wb") as f:
                while remaining > 0:
                    chunk = self.rfile.read(min(CHUNK, remaining))
                    if not chunk:
                        raise ConnectionError("Verbindung abgebrochen")
                    f.write(chunk)
                    remaining -= len(chunk)
            if target.exists() and q.get("overwrite") != "1":
                target = free_name(target)
            os.replace(tmp, target)
            mtime = q.get("mtime")
            if mtime and mtime.isdigit():
                t = int(mtime) / 1000
                os.utime(target, (t, t))
        except Exception as e:  # noqa: BLE001
            try:
                tmp.unlink()
            except OSError:
                pass
            self.close_connection = True
            return self.error(500, f"Upload fehlgeschlagen: {e}")
        rel = target.relative_to(user_root(user)).as_posix()
        self.send_json({"status": "saved", "path": rel})

    # -- Antworten
    def list_dir(self, user, rel):
        p = safe_path(user, rel)
        if not p.is_dir():
            return self.error(404, "Ordner nicht gefunden")
        items = []
        for e in p.iterdir():
            if e.name.startswith("."):
                continue
            st = e.stat()
            items.append({"name": e.name, "dir": e.is_dir(), "size": st.st_size, "mtime": int(st.st_mtime * 1000)})
        items.sort(key=lambda i: (not i["dir"], i["name"].lower()))
        self.send_json({"path": rel.strip("/"), "items": items})

    def usage(self, user):
        total = files = 0
        for dirpath, _, names in os.walk(user_root(user)):
            for n in names:
                try:
                    total += os.path.getsize(os.path.join(dirpath, n))
                    files += 1
                except OSError:
                    pass
        disk = shutil.disk_usage(DATA_DIR)
        self.send_json({"bytes": total, "files": files, "disk_free": disk.free, "disk_total": disk.total})

    def send_file(self, p, download):
        if not p.is_file():
            return self.error(404, "nicht gefunden")
        size = p.stat().st_size
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        start, end = 0, size - 1
        rng = self.headers.get("Range")
        m = re.match(r"bytes=(\d*)-(\d*)$", rng or "")
        if m and size:
            if m.group(1):
                start = int(m.group(1))
                if m.group(2):
                    end = min(int(m.group(2)), size - 1)
            elif m.group(2):
                start = max(0, size - int(m.group(2)))
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "private, max-age=3600")
        disp = "attachment" if download else "inline"
        self.send_header("Content-Disposition", f"{disp}; filename*=UTF-8''{urllib.parse.quote(p.name)}")
        self.end_headers()
        with open(p, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(CHUNK, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def send_asset(self, name):
        if not re.match(r"^[a-z0-9-]+\.(png|woff2)$", name):
            return self.error(404, "nicht gefunden")
        p = Path(__file__).with_name("assets") / name
        if not p.is_file():
            return self.error(404, "nicht gefunden")
        body = p.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "font/woff2" if name.endswith(".woff2") else "image/png")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "public, max-age=604800")
        self.end_headers()
        self.wfile.write(body)

    def send_page(self):
        page = Path(__file__).with_name("web.html")
        body = page.read_bytes() if page.exists() else b"<h1>FotoBox</h1>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


# ---------------------------------------------------------------- Verwaltung

def ask_password():
    while True:
        pw = getpass.getpass("Passwort: ")
        if len(pw) < 6:
            print("Bitte mindestens 6 Zeichen.")
            continue
        if pw != getpass.getpass("Passwort wiederholen: "):
            print("Stimmt nicht überein.")
            continue
        return pw


def cmd(argv):
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        return 0
    c, args = argv[0], argv[1:]
    if c == "serve":
        return serve()
    users = _load(USERS_FILE)
    if c == "users":
        for name, u in sorted(users.items()):
            print(f"{name:20} angelegt {time.strftime('%d.%m.%Y', time.localtime(u.get('created', 0)))}")
        if not users:
            print("(noch keine Benutzer)")
        return 0
    if not args:
        print("Name fehlt.")
        return 1
    name = args[0]
    if c == "adduser":
        if not NAME_RE.match(name):
            print("Name nur aus Buchstaben, Ziffern, . _ - (max. 32 Zeichen).")
            return 1
        if name in users:
            print("Gibt es schon.")
            return 1
        users[name] = {"password": hash_password(ask_password()), "created": int(time.time())}
        _save(USERS_FILE, users)
        user_root(name)
        print(f"Benutzer '{name}' angelegt. Ordner: {DATA_DIR / name}")
        return 0
    if name not in users:
        print("Benutzer nicht gefunden.")
        return 1
    if c == "passwd":
        users[name]["password"] = hash_password(ask_password())
        _save(USERS_FILE, users)
        print("Passwort geändert.")
        return 0
    if c in ("deluser", "logout"):
        tokens = {k: v for k, v in _load(TOKENS_FILE).items() if v["user"] != name}
        _save(TOKENS_FILE, tokens)
        if c == "deluser":
            del users[name]
            _save(USERS_FILE, users)
            print(f"Benutzer gelöscht. Dateien liegen weiter in {DATA_DIR / name}")
        else:
            print("Alle Geräte abgemeldet.")
        return 0
    print("Unbekannter Befehl. 'fotobox.py help' zeigt die Hilfe.")
    return 1


def serve():
    port = int(os.environ.get("FOTOBOX_PORT", "8090"))
    bind = os.environ.get("FOTOBOX_BIND", "0.0.0.0")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    httpd = ThreadingHTTPServer((bind, port), Handler)
    httpd.daemon_threads = True
    scheme = "http"
    cert, key = os.environ.get("FOTOBOX_CERT"), os.environ.get("FOTOBOX_KEY")
    if cert and key:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(cert, key)
        httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
        scheme = "https"
    print(f"FotoBox {VERSION} läuft auf {scheme}://{bind}:{port}  Daten: {HOME}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(cmd(sys.argv[1:]))
