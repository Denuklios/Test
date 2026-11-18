import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

/// Texterkennung auf dem Gerät (offline) – für Punktestände aus Screenshots
/// und Kartennamen/-nummern aus Fotos.
Future<String> readText(String imagePath) async {
  final r = TextRecognizer(script: TextRecognitionScript.latin);
  try {
    final res = await r.processImage(InputImage.fromFilePath(imagePath));
    return res.text;
  } finally {
    await r.close();
  }
}
