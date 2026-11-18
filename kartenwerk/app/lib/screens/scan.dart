import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../models.dart';
import '../ui.dart';

class ScanResult {
  final String code;
  final CodeType type;
  ScanResult(this.code, this.type);
}

CodeType codeTypeFrom(BarcodeFormat f) => switch (f) {
      BarcodeFormat.qrCode || BarcodeFormat.microQrCode => CodeType.qr,
      BarcodeFormat.ean13 => CodeType.ean13,
      BarcodeFormat.ean8 => CodeType.ean8,
      BarcodeFormat.upcA => CodeType.upcA,
      BarcodeFormat.upcE => CodeType.upcE,
      BarcodeFormat.code39 => CodeType.code39,
      BarcodeFormat.code93 => CodeType.code93,
      BarcodeFormat.itf14 || BarcodeFormat.itf2of5 || BarcodeFormat.itf2of5WithChecksum => CodeType.itf,
      BarcodeFormat.codabar => CodeType.codabar,
      BarcodeFormat.pdf417 => CodeType.pdf417,
      BarcodeFormat.aztec => CodeType.aztec,
      BarcodeFormat.dataMatrix => CodeType.dataMatrix,
      _ => CodeType.code128,
    };

/// Kamera-Scanner für Barcodes und QR-Codes – auch aus Screenshots.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});
  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final ctrl = MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates);
  bool done = false;

  void _found(Barcode b) {
    if (done) return;
    final v = b.rawValue;
    if (v == null || v.isEmpty) return;
    done = true;
    Navigator.pop(context, ScanResult(v, codeTypeFrom(b.format)));
  }

  Future<void> _fromImage() async {
    final x = await ImagePicker().pickImage(source: ImageSource.gallery);
    if (x == null) return;
    final res = await ctrl.analyzeImage(x.path);
    if (!mounted) return;
    if (res == null || res.barcodes.isEmpty) {
      toast(context, 'Kein Code im Bild gefunden – versuch ein schärferes Bild.');
      return;
    }
    _found(res.barcodes.first);
  }

  @override
  void dispose() {
    ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    final w = size.width * .82;
    final rect = Rect.fromCenter(center: Offset(size.width / 2, size.height * .42), width: w, height: w * .62);
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(children: [
        MobileScanner(
          controller: ctrl,
          onDetect: (c) {
            if (c.barcodes.isNotEmpty) _found(c.barcodes.first);
          },
          errorBuilder: (ctx, e) => Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Text('Kamera nicht verfügbar.\nBitte Kamera-Zugriff erlauben oder Code aus einem Bild laden.\n\n(${e.errorCode.name})',
                  textAlign: TextAlign.center, style: const TextStyle(color: Colors.white)),
            ),
          ),
        ),
        // Abdunkeln außerhalb des Rahmens
        IgnorePointer(
          child: CustomPaint(size: size, painter: _FramePainter(rect)),
        ),
        Positioned(
          left: 0,
          right: 0,
          top: rect.bottom + 24,
          child: const Text('Barcode oder QR-Code in den Rahmen halten', textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600)),
        ),
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Row(children: [
              IconButton.filledTonal(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
              const Spacer(),
              IconButton.filledTonal(onPressed: () => ctrl.toggleTorch(), icon: const Icon(Icons.flashlight_on_rounded)),
            ]),
          ),
        ),
        Positioned(
          left: 24,
          right: 24,
          bottom: 40,
          child: SafeArea(
            child: Row(children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white54), padding: const EdgeInsets.symmetric(vertical: 14)),
                  onPressed: _fromImage,
                  icon: const Icon(Icons.image_rounded),
                  label: const Text('Aus Bild / Screenshot'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white54), padding: const EdgeInsets.symmetric(vertical: 14)),
                  onPressed: () => Navigator.pop(context, ScanResult('', CodeType.code128)),
                  icon: const Icon(Icons.keyboard_rounded),
                  label: const Text('Nummer tippen'),
                ),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

class _FramePainter extends CustomPainter {
  final Rect r;
  _FramePainter(this.r);
  @override
  void paint(Canvas canvas, Size size) {
    final rr = RRect.fromRectAndRadius(r, const Radius.circular(20));
    final p = Path()
      ..addRect(Offset.zero & size)
      ..addRRect(rr)
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(p, Paint()..color = Colors.black.withValues(alpha: .55));
    canvas.drawRRect(rr, Paint()
      ..color = K.gold
      ..style = PaintingStyle.stroke
      ..strokeWidth = 3);
  }

  @override
  bool shouldRepaint(covariant _FramePainter o) => o.r != r;
}
