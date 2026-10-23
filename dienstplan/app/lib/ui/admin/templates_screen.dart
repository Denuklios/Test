import 'dart:math';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_model.dart';
import '../../core/api.dart';
import '../../core/dates.dart';
import '../../core/models.dart';
import '../theme.dart';
import '../widgets.dart';

const _palette = [
  '#2f80ed', '#f2994a', '#94a3b8', '#27ae60', '#eb5757', '#8e44ad',
  '#16a085', '#e67e22', '#f1c40f', '#d35400', '#c2185b', '#5d4037',
];

/// Admin: Dienst-Vorlagen anlegen, ändern und löschen.
class TemplatesScreen extends StatelessWidget {
  const TemplatesScreen({super.key});

  Future<void> _save(BuildContext context, List<ShiftTemplate> list, String ok) async {
    try {
      await context.read<AppModel>().saveTemplates(list);
      if (context.mounted) showMessage(context, ok);
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, e.network ? 'Keine Verbindung – nicht gespeichert. Bitte erneut versuchen.' : e.message, error: true);
      rethrow;
    }
  }

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    final st = m.state;
    if (st == null) return const SizedBox.shrink();
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Dienste')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: st.templates.length >= 20
            ? () => showMessage(context, 'Maximal 20 Dienste.', error: true)
            : () => _edit(context, st, null),
        icon: const Icon(Icons.add),
        label: const Text('Neuer Dienst'),
      ),
      body: RefreshIndicator(
        onRefresh: m.refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
          children: [
            const SyncBanner(),
            Text('Ohne Zeiten = ganztägig (Frei, Urlaub, Krank). Im Plan kannst du die Zeit pro Tag trotzdem abweichend setzen.',
                style: TextStyle(color: cs.outline, fontSize: 13)),
            const SizedBox(height: 12),
            for (final t in st.templates)
              Card(
                margin: const EdgeInsets.only(bottom: 8),
                color: tint(context, t.colorValue, 0.16, 0.26),
                child: ListTile(
                  contentPadding: const EdgeInsets.fromLTRB(12, 4, 4, 4),
                  leading: Container(width: 8, height: 40, decoration: BoxDecoration(color: t.colorValue, borderRadius: BorderRadius.circular(4))),
                  title: Text(t.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                  subtitle: Text(t.allDay ? 'ganztägig' : '${t.start}–${t.end}'),
                  trailing: IconButton(
                    tooltip: 'Löschen',
                    icon: Icon(Icons.delete_outline, color: cs.error),
                    onPressed: () async {
                      if (await confirm(context, '„${t.name}“ löschen?', 'Bereits eingetragene Dienste dieser Vorlage werden danach als „?“ angezeigt.', ok: 'Löschen', danger: true) &&
                          context.mounted) {
                        try {
                          await _save(context, st.templates.where((x) => x.id != t.id).toList(), 'Gelöscht ✓');
                        } catch (_) {}
                      }
                    },
                  ),
                  onTap: () => _edit(context, st, t),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _edit(BuildContext context, DienstState st, ShiftTemplate? t) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      useSafeArea: true,
      builder: (c) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(c).viewInsets.bottom),
        child: _TemplateEditor(
          initial: t,
          onSave: (n) async {
            final list = t == null ? [...st.templates, n] : [for (final x in st.templates) x.id == t.id ? n : x];
            await _save(context, list, 'Gespeichert ✓');
          },
        ),
      ),
    );
  }
}

class _TemplateEditor extends StatefulWidget {
  final ShiftTemplate? initial;
  final Future<void> Function(ShiftTemplate) onSave;
  const _TemplateEditor({required this.initial, required this.onSave});

  @override
  State<_TemplateEditor> createState() => _TemplateEditorState();
}

class _TemplateEditorState extends State<_TemplateEditor> {
  late final TextEditingController _name;
  late String _color;
  late bool _allDay;
  late int _start;
  late int _end;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    final t = widget.initial;
    _name = TextEditingController(text: t?.name ?? '');
    _color = t?.color ?? _palette[5];
    _allDay = t?.allDay ?? false;
    _start = parseHm(t?.start ?? '') ?? 540;
    _end = parseHm(t?.end ?? '') ?? 1020;
  }

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _time(bool start) async {
    final v = start ? _start : _end;
    final t = await showTimePicker(context: context, initialTime: TimeOfDay(hour: v ~/ 60, minute: v % 60), helpText: start ? 'Beginn' : 'Ende');
    if (t != null) setState(() => start ? _start = t.hour * 60 + t.minute : _end = t.hour * 60 + t.minute);
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      showMessage(context, 'Jeder Dienst braucht einen Namen.', error: true);
      return;
    }
    final id = widget.initial?.id ?? 't${DateTime.now().millisecondsSinceEpoch.toRadixString(36)}${Random().nextInt(99)}';
    setState(() => _busy = true);
    try {
      await widget.onSave(ShiftTemplate(
        id: id,
        name: name,
        start: _allDay ? '' : formatHm(_start),
        end: _allDay ? '' : formatHm(_end),
        color: _color,
      ));
      if (mounted) Navigator.pop(context);
    } catch (_) {
      // Fehlermeldung kam schon; Eingaben bleiben erhalten
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(widget.initial == null ? 'Neuer Dienst' : 'Dienst bearbeiten', style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        TextField(controller: _name, maxLength: 20, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Name, z. B. Früh')),
        const SectionTitle('Farbe'),
        Wrap(spacing: 10, runSpacing: 10, children: [
          for (final c in _palette)
            InkWell(
              customBorder: const CircleBorder(),
              onTap: () => setState(() => _color = c),
              child: Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: parseHexColor(c),
                  shape: BoxShape.circle,
                  border: _color.toLowerCase() == c ? Border.all(color: cs.onSurface, width: 3) : null,
                ),
                child: _color.toLowerCase() == c ? const Icon(Icons.check, color: Colors.white) : null,
              ),
            ),
        ]),
        const SizedBox(height: 12),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Ganztägig (ohne Zeiten)'),
          subtitle: const Text('z. B. Frei, Urlaub, Krank'),
          value: _allDay,
          onChanged: (v) => setState(() => _allDay = v),
        ),
        if (!_allDay)
          Row(children: [
            Expanded(child: OutlinedButton(onPressed: () => _time(true), child: Text('Beginn ${formatHm(_start)}'))),
            const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('bis')),
            Expanded(child: OutlinedButton(onPressed: () => _time(false), child: Text('Ende ${formatHm(_end)}'))),
          ]),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _busy ? null : _submit,
          child: _busy ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5)) : const Text('Speichern'),
        ),
      ]),
    );
  }
}
