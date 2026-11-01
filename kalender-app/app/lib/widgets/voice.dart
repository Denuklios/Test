import 'package:flutter/material.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

final _speech = SpeechToText();

/// Zeigt ein Mikrofon-Fenster und liefert den erkannten Text
Future<String?> listenSpeech(BuildContext context, {String hint = 'Sag z. B.: „Morgen um 15 Uhr Zahnarzt mit Jeannine“'}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _VoiceSheet(hint: hint),
  );
}

class _VoiceSheet extends StatefulWidget {
  final String hint;
  const _VoiceSheet({required this.hint});
  @override
  State<_VoiceSheet> createState() => _VoiceSheetState();
}

class _VoiceSheetState extends State<_VoiceSheet> {
  String _text = '';
  String? _error;
  bool _listening = false;
  double _level = 0;

  @override
  void initState() {
    super.initState();
    _start();
  }

  Future<void> _start() async {
    final ok = await _speech.initialize(
      onError: (e) => setState(() {
        _error = e.errorMsg == 'error_no_match' ? 'Nichts verstanden – nochmal?' : 'Fehler: ${e.errorMsg}';
        _listening = false;
      }),
      onStatus: (s) {
        if (s == 'done' || s == 'notListening') setState(() => _listening = false);
      },
    );
    if (!ok) {
      setState(() => _error = 'Spracherkennung nicht verfügbar. Mikrofon erlaubt?');
      return;
    }
    String? locale;
    try {
      final locales = await _speech.locales();
      locale = locales.where((l) => l.localeId.startsWith('de')).map((l) => l.localeId).firstOrNull;
    } catch (_) {}
    setState(() {
      _error = null;
      _listening = true;
    });
    await _speech.listen(
      onResult: (SpeechRecognitionResult r) {
        setState(() => _text = r.recognizedWords);
        if (r.finalResult && _text.isNotEmpty && mounted) {
          Navigator.pop(context, _text);
        }
      },
      onSoundLevelChange: (l) => setState(() => _level = l),
      listenOptions: SpeechListenOptions(
        localeId: locale ?? 'de_DE',
        partialResults: true,
        listenFor: const Duration(seconds: 30),
        pauseFor: const Duration(seconds: 3),
      ),
    );
  }

  @override
  void dispose() {
    _speech.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 24, 24, 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          GestureDetector(
            onTap: _listening ? () => _speech.stop() : _start,
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 120),
              width: 90 + (_listening ? (_level.clamp(0, 10) * 3) : 0),
              height: 90 + (_listening ? (_level.clamp(0, 10) * 3) : 0),
              decoration: BoxDecoration(color: _listening ? Colors.red : Colors.blue, shape: BoxShape.circle),
              child: Icon(_listening ? Icons.mic : Icons.mic_none, color: Colors.white, size: 44),
            ),
          ),
          const SizedBox(height: 16),
          Text(_listening ? 'Ich höre zu …' : (_error ?? 'Tippen zum Sprechen'), style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 10),
          Text(_text.isEmpty ? widget.hint : _text, textAlign: TextAlign.center, style: TextStyle(fontSize: 18, color: _text.isEmpty ? Colors.grey : Colors.black)),
          const SizedBox(height: 16),
          Row(mainAxisAlignment: MainAxisAlignment.end, children: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Abbrechen')),
            if (_text.isNotEmpty) FilledButton(onPressed: () => Navigator.pop(context, _text), child: const Text('Übernehmen')),
          ]),
        ]),
      ),
    );
  }
}
