"""Simulierter Tuya-Stecker (3.3/3.4/3.5) auf Basis von tinytuya – nur zum Testen."""
import hmac, json, os, socket, struct, sys, threading
from hashlib import sha256
import tinytuya
from tinytuya.core import header as H
from tinytuya.core.message_helper import TuyaMessage, pack_message, unpack_message, parse_header
from tinytuya.core.crypto_helper import AESCipher

DEV_ID = "bf1234567890abcdef"
REAL_KEY = b"0123456789abcdef"

def serve(version, port):
    vbytes = version.encode()
    vheader = vbytes + 12 * b"\x00"
    state = {"1": False, "2": 0}
    srv = socket.socket(); srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", port)); srv.listen(5)
    print("ready", version, port, flush=True)
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=handle, args=(conn, version, vbytes, vheader, state), daemon=True).start()

def handle(conn, version, vbytes, vheader, state):
    v = float(version)
    key = REAL_KEY
    local_nonce = remote_nonce = None
    seq = 100
    buf = b""
    def send(cmd, payload):
        nonlocal seq
        seq += 1
        if v >= 3.5:
            conn.sendall(pack_message(TuyaMessage(seq, cmd, 0, payload, 0, True, H.PREFIX_6699_VALUE, True), hmac_key=key))
        elif v >= 3.4:
            enc = AESCipher(key).encrypt(payload, False) if payload else b""
            conn.sendall(pack_message(TuyaMessage(seq, cmd, 0, struct.pack(">I", 0) + enc, 0, True, H.PREFIX_55AA_VALUE, False), hmac_key=key))
        else:
            conn.sendall(pack_message(TuyaMessage(seq, cmd, 0, struct.pack(">I", 0) + payload, 0, True, H.PREFIX_55AA_VALUE, False)))
    def status_json():
        return json.dumps({"devId": DEV_ID, "dps": state, "t": 1}).encode()
    try:
        while True:
            data = conn.recv(4096)
            if not data: return
            buf += data
            while True:
                try:
                    hdr = parse_header(buf)
                except Exception:
                    break
                if len(buf) < hdr.total_length: break
                pkt, buf = buf[:hdr.total_length], buf[hdr.total_length:]
                msg = unpack_message(pkt, hmac_key=(key if v >= 3.4 else None), header=hdr, no_retcode=True)
                assert msg.crc_good, "Prüfsumme/HMAC falsch"
                p = msg.payload
                if v >= 3.4 and v < 3.5 and p:
                    p = AESCipher(key).decrypt(p, False, decode_text=False)
                if msg.cmd == 3:
                    local_nonce = p
                    remote_nonce = os.urandom(16)
                    send(4, remote_nonce + hmac.new(REAL_KEY, local_nonce, sha256).digest())
                    continue
                if msg.cmd == 5:
                    assert p == hmac.new(REAL_KEY, remote_nonce, sha256).digest(), "Finish-HMAC falsch"
                    x = bytes(a ^ b for a, b in zip(local_nonce, remote_nonce))
                    c = AESCipher(REAL_KEY)
                    key = c.encrypt(x, False, pad=False) if v < 3.5 else c.encrypt(x, use_base64=False, pad=False, iv=local_nonce[:12])[12:28]
                    continue
                if p.startswith(vbytes):
                    p = p[len(vheader):]
                if v < 3.4:
                    p = AESCipher(key).decrypt(p, False, decode_text=False)
                j = json.loads(p.decode())
                if msg.cmd in (7, 0x0d):
                    dps = j["data"]["dps"] if "data" in j else j["dps"]
                    state.update(dps)
                    send(msg.cmd, b"")
                    st = status_json() if v >= 3.4 else AESCipher(key).encrypt(status_json(), False)
                    send(8, vheader + st)
                elif msg.cmd == 0x0a:
                    send(0x0a, AESCipher(key).encrypt(status_json(), False))
                elif msg.cmd == 0x10:
                    send(0x10, (vheader if v < 3.5 else b"") + status_json())
    except Exception as e:
        print("Fehler", version, repr(e), flush=True)
    finally:
        conn.close()

if __name__ == "__main__":
    for spec in sys.argv[1:]:
        ver, port = spec.split(":")
        threading.Thread(target=serve, args=(ver, int(port)), daemon=True).start()
    threading.Event().wait()
