import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:material_ui/material_ui.dart';

import '../ui.dart';

/// Profilfoto zuschneiden: zoomen (zwei Finger), verschieben, drehen.
/// Gibt den runden Ausschnitt als PNG zurück (quadratisch, ca. 600 px).
Future<Uint8List?> cropPhoto(BuildContext context, Uint8List bytes) {
  return Navigator.push<Uint8List>(context, MaterialPageRoute(fullscreenDialog: true, builder: (_) => _CropScreen(bytes)));
}

class _CropScreen extends StatefulWidget {
  final Uint8List bytes;
  const _CropScreen(this.bytes);
  @override
  State<_CropScreen> createState() => _CropScreenState();
}

class _CropScreenState extends State<_CropScreen> {
  final _boundary = GlobalKey();
  final _ctl = TransformationController();
  int _turns = 0;
  bool _busy = false;

  Future<void> _done() async {
    setState(() => _busy = true);
    try {
      final ro = _boundary.currentContext!.findRenderObject() as RenderRepaintBoundary;
      final ratio = 600 / ro.size.width;
      final img = await ro.toImage(pixelRatio: ratio);
      final data = await img.toByteData(format: ui.ImageByteFormat.png);
      if (mounted) Navigator.pop(context, data!.buffer.asUint8List());
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        toast(context, 'Zuschneiden fehlgeschlagen');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Foto anpassen'),
        actions: [
          IconButton(
            tooltip: 'Zurücksetzen',
            icon: const Icon(Icons.restart_alt_rounded),
            onPressed: () => setState(() {
              _ctl.value = Matrix4.identity();
              _turns = 0;
            }),
          ),
        ],
      ),
      body: LayoutBuilder(builder: (context, box) {
        final side = (box.maxWidth < box.maxHeight ? box.maxWidth : box.maxHeight) - 40;
        return Column(children: [
          Expanded(
            child: Center(
              child: SizedBox(
                width: side,
                height: side,
                child: Stack(children: [
                  // Das ist der Ausschnitt, der gespeichert wird
                  RepaintBoundary(
                    key: _boundary,
                    child: ClipRect(
                      child: InteractiveViewer(
                        transformationController: _ctl,
                        minScale: 1,
                        maxScale: 6,
                        boundaryMargin: EdgeInsets.zero, // Foto füllt den Kreis immer ganz aus
                        clipBehavior: Clip.none,
                        child: SizedBox(
                          width: side,
                          height: side,
                          child: RotatedBox(
                            quarterTurns: _turns,
                            child: Image.memory(widget.bytes, fit: BoxFit.cover, width: side, height: side),
                          ),
                        ),
                      ),
                    ),
                  ),
                  // runder Rahmen, außen abgedunkelt
                  IgnorePointer(child: CustomPaint(size: Size(side, side), painter: _RingMask())),
                ]),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
            child: Text('Mit zwei Fingern zoomen, mit einem Finger verschieben.',
                textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.7))),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
              child: Row(children: [
                OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white38), padding: const EdgeInsets.all(16)),
                  onPressed: () => setState(() => _turns = (_turns + 1) % 4),
                  icon: const Icon(Icons.rotate_90_degrees_cw_rounded),
                  label: const Text('Drehen'),
                ),
                const SizedBox(width: 12),
                Expanded(child: GradientButton('Übernehmen', icon: Icons.check_rounded, onTap: _busy ? null : _done)),
              ]),
            ),
          ),
        ]);
      }),
    );
  }
}

class _RingMask extends CustomPainter {
  @override
  void paint(Canvas canvas, Size s) {
    final r = s.width / 2;
    final outside = Path()
      ..fillType = PathFillType.evenOdd
      ..addRect(Offset.zero & s)
      ..addOval(Rect.fromCircle(center: Offset(r, r), radius: r));
    canvas.drawPath(outside, Paint()..color = Colors.black.withValues(alpha: 0.7));
    canvas.drawCircle(Offset(r, r), r - 1, Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..color = Colors.white.withValues(alpha: 0.9));
  }

  @override
  bool shouldRepaint(_RingMask o) => false;
}
