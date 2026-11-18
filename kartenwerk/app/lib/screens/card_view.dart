import 'dart:math';

import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';
import 'package:screen_brightness/screen_brightness.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models.dart';
import '../ocr.dart';
import '../parse.dart';
import '../store.dart';
import '../ui.dart';
import 'edit.dart';

class CardViewScreen extends StatefulWidget {
  final String cardId;
  const CardViewScreen({super.key, required this.cardId});
  @override
  State<CardViewScreen> createState() => _CardViewScreenState();
}

class _CardViewScreenState extends State<CardViewScreen> with SingleTickerProviderStateMixin {
  late final AnimationController flip = AnimationController(vsync: this, duration: const Duration(milliseconds: 450));
  bool showPin = false;

  WalletCard? get c => store.byId(widget.cardId);

  @override
  void initState() {
    super.initState();
    store.addListener(_r);
    final card = c;
    if (card != null) store.touch(card);
    if (store.brightOnShow && card != null && card.code.isNotEmpty) {
      ScreenBrightness.instance.setApplicationScreenBrightness(1.0).catchError((_) {});
    }
  }

  void _r() => mounted ? setState(() {}) : null;

  @override
  void dispose() {
    store.removeListener(_r);
    ScreenBrightness.instance.resetApplicationScreenBrightness().catchError((_) {});
    flip.dispose();
    super.dispose();
  }

  Future<void> _updatePoints(WalletCard card) async {
    final r = await showModalBottomSheet<double>(
      context: context,
      isScrollControlled: true,
      backgroundColor: K.navy2,
      showDragHandle: true,
      builder: (ctx) => _PointsSheet(card: card),
    );
    if (r == null) return;
    final old = card.points;
    card.setPoints(r, note: old == null ? 'Start' : (r >= old ? '+${fmtNum(r - old)}' : '−${fmtNum(old - r)}'));
    await store.changed();
    if (mounted) toast(context, 'Punktestand gespeichert: ${fmtNum(r)} ${card.pointsUnit}');
  }

  @override
  Widget build(BuildContext context) {
    final card = c;
    if (card == null) return const Scaffold(body: Center(child: Text('Karte nicht gefunden')));
    final hasBack = fileExists(card.backImage);
    final d = card.daysLeft;
    return Scaffold(
      appBar: AppBar(
        title: Text(card.name),
        actions: [
          IconButton(
            onPressed: () async {
              card.favorite = !card.favorite;
              await store.changed();
            },
            icon: Icon(card.favorite ? Icons.star_rounded : Icons.star_outline_rounded, color: card.favorite ? K.gold : null),
          ),
          IconButton(
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => EditCardScreen(card: card))),
            icon: const Icon(Icons.edit_rounded),
          ),
        ],
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 4, 16, 40), children: [
        GestureDetector(
          onTap: hasBack ? () => flip.isCompleted ? flip.reverse() : flip.forward() : null,
          child: AnimatedBuilder(
            animation: flip,
            builder: (_, _) {
              final a = flip.value * pi;
              final back = a > pi / 2;
              return Transform(
                alignment: Alignment.center,
                transform: Matrix4.identity()
                  ..setEntry(3, 2, 0.0012)
                  ..rotateY(a),
                child: back
                    ? Transform(
                        alignment: Alignment.center,
                        transform: Matrix4.identity()..rotateY(pi),
                        child: AspectRatio(
                          aspectRatio: 1.586,
                          child: ClipRRect(borderRadius: BorderRadius.circular(22), child: Image.file(store.image(card.backImage!), fit: BoxFit.cover)),
                        ),
                      )
                    : CardFace(card),
              );
            },
          ),
        ),
        if (hasBack)
          const Padding(
            padding: EdgeInsets.only(top: 6),
            child: Text('Tippen zum Umdrehen', textAlign: TextAlign.center, style: TextStyle(color: K.muted, fontSize: 12)),
          ),
        const SizedBox(height: 18),
        if (card.code.isNotEmpty && card.codeType != CodeType.none) ...[
          Center(child: CodeView(card, height: card.codeType.is2D ? 120 : 110)),
          const SizedBox(height: 10),
        ],
        if (card.displayNumber.isNotEmpty)
          Center(
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: () {
                Clipboard.setData(ClipboardData(text: card.displayNumber));
                toast(context, 'Nummer kopiert');
              },
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Flexible(
                    child: Text(card.displayNumber,
                        textAlign: TextAlign.center, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, letterSpacing: 2, fontFeatures: [FontFeature.tabularFigures()])),
                  ),
                  const SizedBox(width: 8),
                  const Icon(Icons.copy_rounded, size: 18, color: K.muted),
                ]),
              ),
            ),
          ),
        if (d != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: _banner(d <= 14 ? K.coral : K.teal, Icons.event_available_rounded, 'Gültig bis ${fmtDate(card.expires!)} · ${daysText(d)}'),
          ),
        if (card.eventDate != null)
          Padding(padding: const EdgeInsets.only(top: 8), child: _banner(K.gold, Icons.event_rounded, 'Termin: ${fmtDate(card.eventDate!)}')),
        if (card.hasPoints) _pointsCard(card),
        if (card.balance != null)
          Card(
            margin: const EdgeInsets.only(top: 14),
            child: ListTile(
              leading: const Icon(Icons.account_balance_wallet_rounded, color: K.teal),
              title: const Text('Guthaben'),
              trailing: Text(fmtMoney(card.balance!, card.currency), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: K.teal)),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => EditCardScreen(card: card))),
            ),
          ),
        if (card.website.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: 14),
            child: OutlinedButton.icon(
              style: OutlinedButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 14), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14))),
              onPressed: () => launchUrl(Uri.parse(card.website.startsWith('http') ? card.website : 'https://${card.website}'), mode: LaunchMode.externalApplication),
              icon: const Icon(Icons.open_in_new_rounded),
              label: Text(card.hasPoints ? 'Punktestand beim Anbieter ansehen' : 'Webseite öffnen'),
            ),
          ),
        if (card.pin.isNotEmpty)
          Card(
            margin: const EdgeInsets.only(top: 14),
            child: ListTile(
              leading: const Icon(Icons.password_rounded),
              title: Text(showPin ? card.pin : '•' * min(card.pin.length, 8)),
              trailing: IconButton(onPressed: () => setState(() => showPin = !showPin), icon: Icon(showPin ? Icons.visibility_off : Icons.visibility)),
            ),
          ),
        if (card.notes.isNotEmpty)
          Card(margin: const EdgeInsets.only(top: 14), child: Padding(padding: const EdgeInsets.all(16), child: Text(card.notes))),
        if (card.fields.isNotEmpty) ...[
          const SectionTitle('Angaben'),
          Card(
            child: Column(children: [
              for (final f in card.fields)
                ListTile(
                  dense: true,
                  title: Text(f.label, style: const TextStyle(color: K.muted)),
                  subtitle: SelectableText(f.value, style: const TextStyle(color: K.text, fontSize: 15)),
                ),
            ]),
          ),
        ],
        const SizedBox(height: 16),
        Text('Benutzt: ${card.uses}× · hinzugefügt ${fmtDate(card.created)}', textAlign: TextAlign.center, style: const TextStyle(color: K.muted, fontSize: 12)),
      ]),
    );
  }

  Widget _banner(Color c, IconData i, String t) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(color: c.withValues(alpha: .14), borderRadius: BorderRadius.circular(12), border: Border.all(color: c.withValues(alpha: .5))),
        child: Row(children: [Icon(i, color: c, size: 20), const SizedBox(width: 10), Expanded(child: Text(t, style: TextStyle(color: c, fontWeight: FontWeight.w600)))]),
      );

  Widget _pointsCard(WalletCard card) {
    final hist = card.history;
    final goal = card.pointsGoal;
    return Card(
      margin: const EdgeInsets.only(top: 14),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Icon(Icons.stars_rounded, color: K.gold),
            const SizedBox(width: 8),
            const Text('Punktestand', style: TextStyle(fontWeight: FontWeight.w700)),
            const Spacer(),
            FilledButton.tonalIcon(onPressed: () => _updatePoints(card), icon: const Icon(Icons.sync_rounded, size: 18), label: const Text('Aktualisieren')),
          ]),
          const SizedBox(height: 8),
          Text('${fmtNum(card.points)} ${card.pointsUnit}', style: const TextStyle(fontSize: 34, fontWeight: FontWeight.w900, color: K.gold)),
          if (card.pointsWorth != null)
            Text('≈ ${fmtMoney(card.pointsWorth!, card.currency)} wert', style: const TextStyle(color: K.muted)),
          if (goal != null && goal > 0 && card.points != null) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: LinearProgressIndicator(value: (card.points! / goal).clamp(0, 1), minHeight: 10, color: K.gold, backgroundColor: K.navy3),
            ),
            const SizedBox(height: 4),
            Text(card.points! >= goal ? 'Ziel erreicht 🎉' : 'Noch ${fmtNum(goal - card.points!)} bis zum Ziel (${fmtNum(goal)})', style: const TextStyle(color: K.muted, fontSize: 12)),
          ],
          if (hist.length >= 2) ...[
            const SizedBox(height: 14),
            SizedBox(height: 70, child: CustomPaint(size: Size.infinite, painter: Sparkline(hist.map((e) => e.value).toList()))),
          ],
          if (hist.isNotEmpty) ...[
            const SizedBox(height: 8),
            for (final e in hist.reversed.take(4))
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(children: [
                  Text(fmtDate(e.at), style: const TextStyle(color: K.muted, fontSize: 12)),
                  const Spacer(),
                  if (e.note.isNotEmpty) Text('${e.note}  ', style: const TextStyle(color: K.muted, fontSize: 12)),
                  Text(fmtNum(e.value), style: const TextStyle(fontWeight: FontWeight.w600)),
                ]),
              ),
          ],
        ]),
      ),
    );
  }
}

/// Eingabe des neuen Punktestands: tippen, +/-, oder aus Screenshot lesen
class _PointsSheet extends StatefulWidget {
  final WalletCard card;
  const _PointsSheet({required this.card});
  @override
  State<_PointsSheet> createState() => _PointsSheetState();
}

class _PointsSheetState extends State<_PointsSheet> {
  late final t = TextEditingController(text: widget.card.points == null ? '' : fmtNum(widget.card.points).replaceAll('.', ''));
  List<NumberCandidate> cands = [];
  bool reading = false;

  Future<void> _ocr(ImageSource src) async {
    final x = await ImagePicker().pickImage(source: src, maxWidth: 2000);
    if (x == null) return;
    setState(() => reading = true);
    try {
      final text = await readText(x.path);
      final c = findPointCandidates(text);
      setState(() {
        cands = c;
        if (c.isNotEmpty) t.text = fmtNum(c.first.value).replaceAll('.', '');
      });
      if (c.isEmpty && mounted) toast(context, 'Keine Zahl erkannt – bitte von Hand eingeben');
    } catch (e) {
      if (mounted) toast(context, 'Texterkennung fehlgeschlagen: $e');
    } finally {
      if (mounted) setState(() => reading = false);
    }
  }

  void _add(double d) {
    final v = (parseNumber(t.text) ?? 0) + d;
    t.text = fmtNum(max(0, v)).replaceAll('.', '');
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Punktestand ${widget.card.name}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        const Text('Tipp: Mach in der App des Anbieters einen Screenshot vom Punktestand – Kartenwerk liest die Zahl automatisch.',
            style: TextStyle(color: K.muted, fontSize: 13)),
        const SizedBox(height: 14),
        Row(children: [
          Expanded(
            child: OutlinedButton.icon(onPressed: reading ? null : () => _ocr(ImageSource.gallery), icon: const Icon(Icons.screenshot_rounded), label: const Text('Screenshot')),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: OutlinedButton.icon(onPressed: reading ? null : () => _ocr(ImageSource.camera), icon: const Icon(Icons.photo_camera_rounded), label: const Text('Foto (Bon)')),
          ),
        ]),
        if (reading) const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator()),
        if (cands.length > 1) ...[
          const SizedBox(height: 12),
          const Text('Gefundene Zahlen – tippen zum Übernehmen:', style: TextStyle(color: K.muted, fontSize: 12)),
          const SizedBox(height: 6),
          Wrap(spacing: 6, runSpacing: 6, children: [
            for (final c in cands)
              ChoiceChip(
                selected: parseNumber(t.text) == c.value,
                label: Text(fmtNum(c.value)),
                tooltip: c.context,
                onSelected: (_) => setState(() => t.text = fmtNum(c.value).replaceAll('.', '')),
              ),
          ]),
        ],
        const SizedBox(height: 14),
        TextField(
          controller: t,
          autofocus: cands.isEmpty,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: K.gold),
          decoration: InputDecoration(labelText: 'Neuer Stand', suffixText: widget.card.pointsUnit),
        ),
        const SizedBox(height: 10),
        Wrap(spacing: 6, alignment: WrapAlignment.center, children: [
          for (final d in [-500.0, -100.0, -10.0, 10.0, 100.0, 500.0])
            ActionChip(label: Text(d > 0 ? '+${fmtNum(d)}' : fmtNum(d)), onPressed: () => _add(d)),
        ]),
        const SizedBox(height: 14),
        FilledButton(
          onPressed: () {
            final v = parseNumber(t.text);
            if (v != null) Navigator.pop(context, v);
          },
          child: const Text('Speichern'),
        ),
      ]),
    );
  }
}

class Sparkline extends CustomPainter {
  final List<double> v;
  Sparkline(this.v);
  @override
  void paint(Canvas canvas, Size s) {
    if (v.length < 2) return;
    final mn = v.reduce(min), mx = v.reduce(max);
    final span = (mx - mn) == 0 ? 1 : (mx - mn);
    Offset p(int i) => Offset(i / (v.length - 1) * s.width, s.height - 6 - (v[i] - mn) / span * (s.height - 12));
    final path = Path()..moveTo(p(0).dx, p(0).dy);
    for (var i = 1; i < v.length; i++) {
      path.lineTo(p(i).dx, p(i).dy);
    }
    final fill = Path.from(path)
      ..lineTo(s.width, s.height)
      ..lineTo(0, s.height)
      ..close();
    canvas.drawPath(
        fill,
        Paint()
          ..shader = LinearGradient(begin: Alignment.topCenter, end: Alignment.bottomCenter, colors: [K.gold.withValues(alpha: .35), K.gold.withValues(alpha: 0)])
              .createShader(Offset.zero & s));
    canvas.drawPath(path, Paint()
      ..color = K.gold
      ..strokeWidth = 2.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round);
    canvas.drawCircle(p(v.length - 1), 4, Paint()..color = K.gold);
  }

  @override
  bool shouldRepaint(covariant Sparkline o) => o.v != v;
}
