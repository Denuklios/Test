import 'package:image_picker/image_picker.dart';
import 'package:material_ui/material_ui.dart';

import '../models.dart';
import '../parse.dart';
import '../store.dart';
import '../templates.dart';
import '../ui.dart';
import 'scan.dart';

class EditCardScreen extends StatefulWidget {
  final WalletCard card;
  final bool isNew;
  const EditCardScreen({super.key, required this.card, this.isNew = false});
  @override
  State<EditCardScreen> createState() => _EditCardScreenState();
}

class _EditCardScreenState extends State<EditCardScreen> {
  late WalletCard c;
  late final TextEditingController name, holder, code, number, points, unit, pv, goal, balance, currency, web, pin, notes;

  @override
  void initState() {
    super.initState();
    // Kopie bearbeiten, erst beim Speichern übernehmen
    c = WalletCard.fromJson(widget.card.toJson());
    String n(double? v) => v == null ? '' : fmtNum(v).replaceAll('.', '');
    name = TextEditingController(text: c.name);
    holder = TextEditingController(text: c.holder);
    code = TextEditingController(text: c.code);
    number = TextEditingController(text: c.number);
    points = TextEditingController(text: n(c.points));
    unit = TextEditingController(text: c.pointsUnit);
    pv = TextEditingController(text: c.pointValue?.toString().replaceAll('.', ',') ?? '');
    goal = TextEditingController(text: n(c.pointsGoal));
    balance = TextEditingController(text: c.balance == null ? '' : c.balance!.toStringAsFixed(2).replaceAll('.', ','));
    currency = TextEditingController(text: c.currency);
    web = TextEditingController(text: c.website);
    pin = TextEditingController(text: c.pin);
    notes = TextEditingController(text: c.notes);
  }

  void _sync() {
    c.name = name.text.trim();
    c.holder = holder.text.trim();
    c.code = code.text.trim();
    c.number = number.text.trim();
    c.pointsUnit = unit.text.trim().isEmpty ? 'Punkte' : unit.text.trim();
    c.pointValue = parseNumberDec(pv.text);
    c.pointsGoal = parseNumber(goal.text);
    c.balance = parseNumberDec(balance.text);
    c.currency = currency.text.trim().isEmpty ? '€' : currency.text.trim();
    c.website = web.text.trim();
    c.pin = pin.text.trim();
    c.notes = notes.text.trim();
  }

  /// Dezimalzahl mit Komma (Punktwert, Guthaben)
  double? parseNumberDec(String s) {
    final t = s.trim().replaceAll(' ', '');
    if (t.isEmpty) return null;
    return double.tryParse(t.replaceAll('.', '').replaceAll(',', '.')) ?? double.tryParse(t);
  }

  Future<void> _save() async {
    _sync();
    if (c.name.isEmpty) {
      toast(context, 'Bitte einen Namen eingeben');
      return;
    }
    final p = parseNumber(points.text);
    if (p != null && p != widget.card.points) {
      c.setPoints(p, note: widget.isNew ? 'Start' : 'geändert');
    } else if (p == null) {
      c.points = null;
    }
    await store.upsert(c);
    if (mounted) Navigator.pop(context, c);
  }

  Future<void> _delete() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Karte löschen?'),
        content: Text('„${widget.card.name}“ wird mit Fotos und Punkteverlauf entfernt.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Abbrechen')),
          FilledButton(style: FilledButton.styleFrom(backgroundColor: K.coral), onPressed: () => Navigator.pop(ctx, true), child: const Text('Löschen')),
        ],
      ),
    );
    if (ok != true) return;
    await store.remove(widget.card);
    if (mounted) Navigator.of(context).popUntil((r) => r.isFirst);
  }

  Future<void> _photo(bool front) async {
    final src = await showModalBottomSheet<ImageSource>(
      context: context,
      backgroundColor: K.navy2,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(leading: const Icon(Icons.photo_camera_rounded), title: const Text('Kamera'), onTap: () => Navigator.pop(ctx, ImageSource.camera)),
          ListTile(leading: const Icon(Icons.photo_library_rounded), title: const Text('Galerie / Screenshot'), onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
        ]),
      ),
    );
    if (src == null) return;
    final x = await ImagePicker().pickImage(source: src, imageQuality: 88, maxWidth: 1600);
    if (x == null) return;
    final n = await store.saveImageFile(x.path);
    setState(() => front ? c.frontImage = n : c.backImage = n);
  }

  Future<void> _scan() async {
    final r = await Navigator.push<ScanResult>(context, MaterialPageRoute(builder: (_) => const ScanScreen()));
    if (r == null || r.code.isEmpty) return;
    setState(() {
      code.text = r.code;
      c.codeType = r.type;
    });
  }

  Future<void> _pickDate(bool expiry) async {
    final now = DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: (expiry ? c.expires : c.eventDate) ?? now,
      firstDate: DateTime(now.year - 5),
      lastDate: DateTime(now.year + 30),
    );
    if (d != null) setState(() => expiry ? c.expires = d : c.eventDate = d);
  }

  Widget _f(TextEditingController t, String label, {TextInputType? kb, String? hint, int lines = 1, IconData? icon, Widget? suffix}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(
          controller: t,
          keyboardType: kb,
          maxLines: lines,
          onChanged: (_) => setState(_sync),
          decoration: InputDecoration(labelText: label, hintText: hint, prefixIcon: icon == null ? null : Icon(icon), suffixIcon: suffix),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final showPoints = c.tracksPoints || c.kind == CardKind.points;
    final showBalance = c.kind == CardKind.voucher || c.balance != null || c.kind == CardKind.payment;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.isNew ? 'Neue Karte' : 'Karte bearbeiten'),
        actions: [
          if (!widget.isNew) IconButton(onPressed: _delete, icon: const Icon(Icons.delete_outline_rounded)),
          Padding(padding: const EdgeInsets.only(right: 8), child: FilledButton(onPressed: _save, child: const Text('Speichern'))),
        ],
      ),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 8, 16, 40), children: [
        Padding(padding: const EdgeInsets.symmetric(horizontal: 24), child: CardFace(c)),
        const SizedBox(height: 18),
        _f(name, 'Name der Karte', icon: Icons.label_rounded, hint: 'z. B. PAYBACK, Fitnessstudio, Bahn-Ticket'),
        if (widget.isNew && c.name.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Wrap(spacing: 6, runSpacing: 6, children: [
              for (final t in templates.take(10))
                ActionChip(
                  label: Text(t.name),
                  avatar: CircleAvatar(backgroundColor: Color(t.color)),
                  onPressed: () => setState(() {
                    name.text = t.name;
                    c.color = t.color;
                    c.kind = t.kind;
                    unit.text = t.unit;
                    pv.text = t.pointValue?.toString().replaceAll('.', ',') ?? '';
                    currency.text = t.currency;
                    web.text = t.website;
                    c.tracksPoints = t.tracksPoints;
                    _sync();
                  }),
                ),
            ]),
          ),
        _f(holder, 'Inhaber / Name auf der Karte', icon: Icons.person_rounded),
        DropdownButtonFormField<CardKind>(
          initialValue: c.kind,
          decoration: const InputDecoration(labelText: 'Art', prefixIcon: Icon(Icons.category_rounded)),
          items: [for (final k in CardKind.values) DropdownMenuItem(value: k, child: Row(children: [Icon(k.icon, size: 18), const SizedBox(width: 8), Text(k.label)]))],
          onChanged: (k) => setState(() {
            c.kind = k!;
            if (k == CardKind.points) c.tracksPoints = true;
          }),
        ),
        const SizedBox(height: 16),
        const Text('Farbe', style: TextStyle(color: K.muted, fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final col in cardColors)
            GestureDetector(
              onTap: () => setState(() => c.color = col),
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: Color(col),
                  shape: BoxShape.circle,
                  border: Border.all(color: c.color == col ? K.gold : Colors.white24, width: c.color == col ? 3 : 1),
                ),
              ),
            ),
        ]),
        const SectionTitle('Code'),
        _f(code, 'Inhalt des Barcodes / QR-Codes',
            icon: Icons.qr_code_2_rounded, suffix: IconButton(onPressed: _scan, icon: const Icon(Icons.qr_code_scanner_rounded, color: K.gold))),
        DropdownButtonFormField<CodeType>(
          initialValue: c.codeType,
          decoration: const InputDecoration(labelText: 'Code-Art', prefixIcon: Icon(Icons.view_week_rounded)),
          items: [for (final t in CodeType.values) DropdownMenuItem(value: t, child: Text(t.label))],
          onChanged: (t) => setState(() => c.codeType = t!),
        ),
        const SizedBox(height: 12),
        _f(number, 'Kartennummer (falls anders als Code)', icon: Icons.numbers_rounded),
        if (c.code.isNotEmpty && c.codeType != CodeType.none) Padding(padding: const EdgeInsets.only(bottom: 8), child: CodeView(c, height: 80)),
        const SectionTitle('Fotos'),
        Row(children: [
          Expanded(child: _imgTile('Vorderseite', c.frontImage, () => _photo(true), () => setState(() => c.frontImage = null))),
          const SizedBox(width: 12),
          Expanded(child: _imgTile('Rückseite', c.backImage, () => _photo(false), () => setState(() => c.backImage = null))),
        ]),
        SectionTitle('Punkte',
            trailing: Switch(
              value: showPoints,
              activeThumbColor: K.gold,
              onChanged: (v) => setState(() => c.tracksPoints = v),
            )),
        if (showPoints) ...[
          Row(children: [
            Expanded(flex: 3, child: _f(points, 'Aktueller Stand', kb: TextInputType.number, icon: Icons.stars_rounded)),
            const SizedBox(width: 10),
            Expanded(flex: 2, child: _f(unit, 'Einheit')),
          ]),
          Row(children: [
            Expanded(child: _f(pv, 'Wert pro Punkt', kb: const TextInputType.numberWithOptions(decimal: true), hint: 'z. B. 0,01')),
            const SizedBox(width: 10),
            Expanded(child: _f(goal, 'Ziel (optional)', kb: TextInputType.number, hint: 'z. B. 5000')),
          ]),
        ],
        const SectionTitle('Guthaben & Daten'),
        if (showBalance)
          Row(children: [
            Expanded(flex: 3, child: _f(balance, 'Guthaben', kb: const TextInputType.numberWithOptions(decimal: true), icon: Icons.account_balance_wallet_rounded)),
            const SizedBox(width: 10),
            Expanded(flex: 2, child: _f(currency, 'Währung')),
          ])
        else
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(onPressed: () => setState(() => c.balance = 0), icon: const Icon(Icons.add), label: const Text('Guthaben hinzufügen')),
          ),
        Row(children: [
          Expanded(child: _dateTile('Gültig bis', c.expires, () => _pickDate(true), () => setState(() => c.expires = null))),
          const SizedBox(width: 10),
          Expanded(child: _dateTile('Termin / Event', c.eventDate, () => _pickDate(false), () => setState(() => c.eventDate = null))),
        ]),
        const SizedBox(height: 12),
        _f(web, 'Webseite (Punktestand prüfen, Konto)', kb: TextInputType.url, icon: Icons.public_rounded),
        _f(pin, 'PIN / Passwort-Hinweis', icon: Icons.password_rounded),
        _f(notes, 'Notizen', lines: 3, icon: Icons.notes_rounded),
        if (c.fields.isNotEmpty) ...[
          const SectionTitle('Weitere Angaben'),
          for (final f in [...c.fields])
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(f.label.isEmpty ? '–' : f.label, style: const TextStyle(color: K.muted, fontSize: 13)),
              subtitle: Text(f.value, style: const TextStyle(color: K.text, fontSize: 15)),
              trailing: IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => setState(() => c.fields.remove(f))),
            ),
        ],
        const SizedBox(height: 20),
        FilledButton.icon(onPressed: _save, icon: const Icon(Icons.check_rounded), label: const Text('Speichern')),
      ]),
    );
  }

  Widget _imgTile(String label, String? name, VoidCallback pick, VoidCallback clear) {
    final has = fileExists(name);
    return AspectRatio(
      aspectRatio: 1.586,
      child: Material(
        color: K.navy2,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: pick,
          child: has
              ? Stack(fit: StackFit.expand, children: [
                  Image.file(store.image(name!), fit: BoxFit.cover),
                  Positioned(right: 4, top: 4, child: IconButton.filledTonal(onPressed: clear, icon: const Icon(Icons.close, size: 16))),
                ])
              : Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Icon(Icons.add_a_photo_rounded, color: K.muted),
                  const SizedBox(height: 4),
                  Text(label, style: const TextStyle(color: K.muted)),
                ]),
        ),
      ),
    );
  }

  Widget _dateTile(String label, DateTime? d, VoidCallback pick, VoidCallback clear) => Material(
        color: K.navy2,
        borderRadius: BorderRadius.circular(14),
        child: ListTile(
          onTap: pick,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          title: Text(label, style: const TextStyle(color: K.muted, fontSize: 12)),
          subtitle: Text(d == null ? 'nicht gesetzt' : fmtDate(d), style: const TextStyle(color: K.text, fontWeight: FontWeight.w600)),
          trailing: d == null ? const Icon(Icons.event_rounded) : IconButton(onPressed: clear, icon: const Icon(Icons.close, size: 18)),
        ),
      );
}
