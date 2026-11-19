#!/usr/bin/env python3
"""Vertont jede Szene eines Video-Projekts und speichert Wort-Zeitstempel.

Aufruf:  python3 stimme.py <projektordner>

Liest <projektordner>/projekt.json und schreibt:
  audio/szene_NN.wav       Ton je Szene (auf Szenenlänge aufgefüllt)
  audio/gesamt.wav         alle Szenen hintereinander
  timing.json              Szenenlängen und Wörter mit Start/Ende (Sekunden)

Stimme: ElevenLabs, wenn ELEVENLABS_API_KEY gesetzt ist (oder "anbieter": "elevenlabs"
im Projekt), sonst die kostenlose Microsoft-Edge-Stimme.
"""
import asyncio, base64, json, os, subprocess, sys, urllib.request
from pathlib import Path

PAUSE_NACH_SZENE = 0.30  # Sekunden Luft zwischen den Szenen
SR = 44100


def ffprobe_dauer(datei):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", str(datei)])
    return float(out.strip())


async def edge_vertonen(text, stimme, tempo, ziel_mp3):
    import edge_tts, ssl
    import edge_tts.communicate as ec
    ca = os.environ.get("SSL_CERT_FILE") or ("/root/.ccr/ca-bundle.crt" if os.path.exists("/root/.ccr/ca-bundle.crt") else None)
    if ca:  # hinter einem Proxy mit eigenem Zertifikat
        ec._SSL_CTX = ssl.create_default_context(cafile=ca)
    com = edge_tts.Communicate(text, stimme, rate=tempo, boundary="WordBoundary")
    woerter = []
    with open(ziel_mp3, "wb") as f:
        async for teil in com.stream():
            if teil["type"] == "audio":
                f.write(teil["data"])
            elif teil["type"] == "WordBoundary":
                s = teil["offset"] / 1e7
                woerter.append({"wort": teil["text"], "start": s,
                                "ende": s + teil["duration"] / 1e7})
    return woerter


def elevenlabs_vertonen(text, stimme_id, ziel_mp3):
    key = os.environ.get("ELEVENLABS_API_KEY", "x")  # der Proxy ersetzt ggf. den Schlüssel
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{stimme_id}/with-timestamps"
    body = json.dumps({"text": text, "model_id": "eleven_multilingual_v2",
                       "voice_settings": {"stability": 0.45, "similarity_boost": 0.8,
                                          "style": 0.35}}).encode()
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "xi-api-key": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as r:
        daten = json.load(r)
    Path(ziel_mp3).write_bytes(base64.b64decode(daten["audio_base64"]))
    al = daten["alignment"]
    zeichen, starts, enden = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    woerter, akt, s0 = [], "", None
    for z, s, e in zip(zeichen, starts, enden):
        if z.isspace():
            if akt:
                woerter.append({"wort": akt, "start": s0, "ende": letzte})
            akt, s0 = "", None
            continue
        if s0 is None:
            s0 = s
        akt += z
        letzte = e
    if akt:
        woerter.append({"wort": akt, "start": s0, "ende": letzte})
    return woerter


def main():
    ordner = Path(sys.argv[1]).resolve()
    projekt = json.loads((ordner / "projekt.json").read_text())
    audio = ordner / "audio"
    audio.mkdir(exist_ok=True)

    anbieter = projekt.get("anbieter") or ("elevenlabs" if os.environ.get("ELEVENLABS_API_KEY") else "edge")
    stimme = projekt.get("stimme", "de-DE-ConradNeural")
    tempo = projekt.get("tempo", "+8%")

    szenen_info, alle_woerter, t = [], [], 0.0
    wavs = []
    for i, sz in enumerate(projekt["szenen"]):
        mp3 = audio / f"szene_{i:02d}.mp3"
        wav = audio / f"szene_{i:02d}.wav"
        if anbieter == "elevenlabs":
            woerter = elevenlabs_vertonen(sz["text"], projekt.get("elevenlabs_stimme", "pNInz6obpgDQGcFmaJgB"), mp3)
        else:
            woerter = asyncio.run(edge_vertonen(sz["text"], stimme, tempo, mp3))
        dauer_ton = ffprobe_dauer(mp3)
        dauer = round(max(dauer_ton + PAUSE_NACH_SZENE, sz.get("min_dauer", 0)), 3)
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(mp3), "-af",
                        f"apad=whole_dur={dauer}", "-ar", str(SR), "-ac", "2", str(wav)], check=True)
        for w in woerter:
            alle_woerter.append({"wort": w["wort"], "start": round(t + w["start"], 3),
                                 "ende": round(t + w["ende"], 3), "szene": i})
        szenen_info.append({"start": round(t, 3), "dauer": dauer})
        wavs.append(wav)
        t += dauer
        print(f"Szene {i+1}: {dauer:.2f}s, {len(woerter)} Wörter")

    liste = audio / "liste.txt"
    liste.write_text("".join(f"file '{w.name}'\n" for w in wavs))
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(liste),
                    "-c", "copy", str(audio / "gesamt.wav")], check=True)
    (ordner / "timing.json").write_text(json.dumps(
        {"gesamt": round(t, 3), "szenen": szenen_info, "woerter": alle_woerter,
         "anbieter": anbieter}, ensure_ascii=False, indent=1))
    print(f"Gesamt: {t:.2f}s ({anbieter})")


if __name__ == "__main__":
    main()
