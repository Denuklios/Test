import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../app_model.dart';
import '../../core/api.dart';
import '../../core/models.dart';
import '../widgets.dart';

/// Admin: Namen ändern, Mitarbeiter hinzufügen/entfernen, Start-Passwort anzeigen und neu vergeben.
class TeamAdminScreen extends StatelessWidget {
  const TeamAdminScreen({super.key});

  Future<void> _run(BuildContext context, Future<void> Function() f, String ok) async {
    try {
      await f();
      if (context.mounted) showMessage(context, ok);
    } on ApiException catch (e) {
      if (context.mounted) showMessage(context, e.network ? 'Keine Verbindung – nicht gespeichert. Bitte erneut versuchen.' : e.message, error: true);
    }
  }

  Future<String?> _nameDialog(BuildContext context, String title, String initial) {
    final c = TextEditingController(text: initial);
    return showDialog<String>(
      context: context,
      builder: (d) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: c,
          autofocus: true,
          maxLength: 30,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Vorname (zugleich Login)'),
          onSubmitted: (v) => Navigator.pop(d, v),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(d), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(d, c.text), child: const Text('Speichern')),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    final st = m.state;
    if (st == null) return const SizedBox.shrink();
    final cs = Theme.of(context).colorScheme;
    final full = st.emps.length >= 15;

    return Scaffold(
      appBar: AppBar(title: const Text('Team')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: full
            ? () => showMessage(context, 'Maximal 15 Mitarbeiter.', error: true)
            : () async {
                final n = await _nameDialog(context, 'Mitarbeiter hinzufügen', '');
                if (n != null && n.trim().isNotEmpty && context.mounted) await _run(context, () => m.addEmp(n.trim()), 'Hinzugefügt ✓');
              },
        icon: const Icon(Icons.person_add),
        label: const Text('Hinzufügen'),
      ),
      body: RefreshIndicator(
        onRefresh: m.refresh,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 96),
          children: [
            const SyncBanner(),
            Text(
              'Der Vorname ist zugleich der Login. Das Start-Passwort gibst du weiter, danach vergibt der Mitarbeiter sein eigenes. '
              'Einträge, die noch „Mitarbeiter1“, „Mitarbeiter2“ … heißen, bleiben im Plan unsichtbar, bis du sie umbenennst.',
              style: TextStyle(color: cs.outline, fontSize: 13),
            ),
            const SizedBox(height: 12),
            Text('${st.emps.length} von 15', style: TextStyle(color: cs.outline, fontSize: 12)),
            const SizedBox(height: 4),
            for (final e in st.emps) _EmpCard(emp: m.empWithSecrets(e.id) ?? e, run: _run, nameDialog: _nameDialog),
          ],
        ),
      ),
    );
  }
}

class _EmpCard extends StatelessWidget {
  final Employee emp;
  final Future<void> Function(BuildContext, Future<void> Function(), String) run;
  final Future<String?> Function(BuildContext, String, String) nameDialog;

  const _EmpCard({required this.emp, required this.run, required this.nameDialog});

  @override
  Widget build(BuildContext context) {
    final m = context.read<AppModel>();
    final cs = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 12),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Expanded(
              child: Text(emp.name,
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: emp.isNamed ? null : cs.outline)),
            ),
            IconButton(
              tooltip: 'Namen ändern',
              icon: const Icon(Icons.edit_outlined),
              onPressed: () async {
                final n = await nameDialog(context, 'Namen ändern', emp.name);
                if (n != null && n.trim().isNotEmpty && n.trim() != emp.name && context.mounted) {
                  await run(context, () => m.renameEmp(emp.id, n.trim()), 'Gespeichert ✓');
                }
              },
            ),
            IconButton(
              tooltip: 'Entfernen',
              icon: Icon(Icons.delete_outline, color: cs.error),
              onPressed: () async {
                if (await confirm(context, '${emp.name} entfernen?', 'Alle Dienste dieses Mitarbeiters werden aus dem Plan gelöscht.', ok: 'Entfernen', danger: true) &&
                    context.mounted) {
                  await run(context, () => m.deleteEmp(emp.id), 'Entfernt ✓');
                }
              },
            ),
          ]),
          if (!emp.isNamed) Text('Unsichtbar, bis du einen Namen einträgst', style: TextStyle(color: cs.outline, fontSize: 12)),
          const SizedBox(height: 6),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(color: cs.surfaceContainerHighest.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(12)),
            child: emp.mustChange
                ? Row(children: [
                    const Text('Start-Passwort: '),
                    SelectableText(emp.initPw ?? '(nach Abgleich sichtbar)', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17, letterSpacing: 1.2)),
                    const Spacer(),
                    if (emp.initPw != null)
                      IconButton(
                        tooltip: 'Kopieren',
                        icon: const Icon(Icons.copy, size: 18),
                        onPressed: () {
                          Clipboard.setData(ClipboardData(text: emp.initPw!));
                          showMessage(context, 'Kopiert');
                        },
                      ),
                  ])
                : const Text('✓ Passwort vom Mitarbeiter selbst gewählt'),
          ),
          const SizedBox(height: 6),
          TextButton.icon(
            onPressed: () async {
              if (await confirm(context, 'Neues Start-Passwort?', '${emp.name} wird auf allen Geräten abgemeldet und muss beim nächsten Login ein neues Passwort wählen.',
                      ok: 'Neu vergeben') &&
                  context.mounted) {
                await run(context, () => m.resetEmp(emp.id), 'Neues Start-Passwort vergeben ✓');
              }
            },
            icon: const Icon(Icons.lock_reset),
            label: const Text('Neues Start-Passwort'),
          ),
        ]),
      ),
    );
  }
}
