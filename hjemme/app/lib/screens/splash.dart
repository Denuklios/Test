import 'package:material_ui/material_ui.dart';

import '../ui.dart';

/// Startbildschirm bei jedem Öffnen: Canva-Bild, App-Icon mit Leuchten, Name.
/// Blendet nach kurzer Zeit weich aus und gibt die Karte frei.
class SplashOverlay extends StatefulWidget {
  final VoidCallback onDone;
  const SplashOverlay({super.key, required this.onDone});
  @override
  State<SplashOverlay> createState() => _SplashOverlayState();
}

class _SplashOverlayState extends State<SplashOverlay> with TickerProviderStateMixin {
  late final _in = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100))..forward();
  late final _out = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));

  @override
  void initState() {
    super.initState();
    Future.delayed(const Duration(milliseconds: 1900), () async {
      if (!mounted) return;
      await _out.forward();
      widget.onDone();
    });
  }

  @override
  void dispose() {
    _in.dispose();
    _out.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final icon = CurvedAnimation(parent: _in, curve: const Interval(0, 0.7, curve: Curves.easeOutBack));
    final text = CurvedAnimation(parent: _in, curve: const Interval(0.35, 1, curve: Curves.easeOut));
    return AnimatedBuilder(
      animation: Listenable.merge([_in, _out]),
      builder: (context, _) => IgnorePointer(
        ignoring: _out.value > 0.5,
        child: Opacity(
          opacity: 1 - _out.value,
          child: Material(
            color: navy,
            child: Stack(fit: StackFit.expand, children: [
              Transform.scale(
                scale: 1.08 - 0.08 * _in.value,
                child: Image.asset('assets/welcome.jpg', fit: BoxFit.cover),
              ),
              const DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Color(0x880B1433), Color(0x330B1433), Color(0xCC0B1433), Color(0xFF0B1433)],
                    stops: [0, 0.4, 0.75, 1],
                  ),
                ),
              ),
              Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Transform.scale(
                    scale: 0.6 + 0.4 * icon.value,
                    child: Opacity(
                      opacity: icon.value.clamp(0, 1),
                      child: Container(
                        width: 128,
                        height: 128,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(30),
                          boxShadow: [BoxShadow(color: magenta.withValues(alpha: 0.55), blurRadius: 40, spreadRadius: 2)],
                        ),
                        child: Image.asset('assets/icon.png'),
                      ),
                    ),
                  ),
                  const SizedBox(height: 22),
                  Opacity(
                    opacity: text.value,
                    child: Transform.translate(
                      offset: Offset(0, 14 * (1 - text.value)),
                      child: Column(children: [
                        ShaderMask(
                          shaderCallback: (r) => brandGradient.createShader(r),
                          child: const Text('Hjemme',
                              style: TextStyle(fontSize: 46, fontWeight: FontWeight.w900, color: Colors.white, letterSpacing: -1.2)),
                        ),
                        const SizedBox(height: 4),
                        Text('Wissen, dass alle gut ankommen.',
                            style: TextStyle(fontSize: 16, color: Colors.white.withValues(alpha: 0.85), fontWeight: FontWeight.w600)),
                      ]),
                    ),
                  ),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
