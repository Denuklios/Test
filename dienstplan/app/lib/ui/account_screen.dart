import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app_model.dart';
import '../core/dates.dart';
import '../core/hours.dart';
import '../core/storage.dart';
import 'emp/hours_screen.dart';
import 'login_screen.dart';
import 'widgets.dart';

class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final m = context.watch<AppModel>();
    final st = m.state;
    final s = m.settings;
    final cs = Theme.of(context).colorScheme;
    final admin = st?.me.isAdmin ?? false;

    Future<void> upd(void Function(Settings s) f) async {
      final n = Settings.fromJson(s.toJson());
      f(n);
      await m.updateSettings(n);
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Konto')),
      body: ListView(padding: const EdgeInsets.fromLTRB(16, 0, 16, 32), children: [
        Card(
          child: ListTile(
            leading: CircleAvatar(backgroundColor: cs.primary, child: Text((st?.me.name ?? '?').characters.first.toUpperCase(), style: TextStyle(color: cs.onPrimary))),
            title: Text(st?.me.name ?? '', style: const TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('${admin ? 'Admin' : 'Mitarbeiter'} · ${Uri.tryParse(m.server)?.host ?? m.server}'),
          ),
        ),
        if (m.lastSync != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
            child: Text('Letzter Abgleich: ${dateTimeStamp(m.lastSync!)}', style: TextStyle(color: cs.outline, fontSize: 12)),
          ),
        if (admin) ...[
          const SectionTitle('Auswertung'),
          Card(
            child: ListTile(
              leading: const Icon(Icons.schedule),
              title: const Text('Stundenübersicht aller Mitarbeiter'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const HoursScreen())),
            ),
          ),
        ],
        if (!admin) ...[
          const SectionTitle('Erinnerungen'),
          Card(
            child: Column(children: [
              SwitchListTile(
                title: const Text('Am Vorabend erinnern'),
                subtitle: Text('um ${formatHm(s.eveningMinutes)} Uhr'),
                value: s.remindEvening,
                onChanged: (v) => upd((n) => n.remindEvening = v),
              ),
              if (s.remindEvening)
                ListTile(
                  contentPadding: const EdgeInsets.only(left: 32, right: 16),
                  title: const Text('Uhrzeit'),
                  trailing: Text(formatHm(s.eveningMinutes), style: const TextStyle(fontWeight: FontWeight.w600)),
                  onTap: () async {
                    final t = await showTimePicker(context: context, initialTime: TimeOfDay(hour: s.eveningMinutes ~/ 60, minute: s.eveningMinutes % 60));
                    if (t != null) await upd((n) => n.eveningMinutes = t.hour * 60 + t.minute);
                  },
                ),
              const Divider(height: 1),
              SwitchListTile(
                title: const Text('Vor Dienstbeginn erinnern'),
                subtitle: Text(_lead(s.beforeMinutes)),
                value: s.remindBefore,
                onChanged: (v) => upd((n) => n.remindBefore = v),
              ),
              if (s.remindBefore)
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 16, 12),
                  child: Wrap(spacing: 8, runSpacing: 8, children: [
                    for (final v in const [15, 30, 60, 90, 120])
                      ChoiceChip(label: Text(_lead(v)), selected: s.beforeMinutes == v, onSelected: (_) => upd((n) => n.beforeMinutes = v)),
                  ]),
                ),
              const Divider(height: 1),
              SwitchListTile(
                title: const Text('Bei Planänderungen benachrichtigen'),
                subtitle: const Text('z. B. „Dein Dienst am Montag hat sich geändert“'),
                value: s.notifyChanges,
                onChanged: (v) => upd((n) => n.notifyChanges = v),
              ),
              SwitchListTile(
                title: const Text('Im Hintergrund abgleichen'),
                subtitle: const Text('etwa alle 2 Stunden, wenn Internet da ist'),
                value: s.backgroundSync,
                onChanged: (v) => upd((n) => n.backgroundSync = v),
              ),
            ]),
          ),
          const SectionTitle('Stunden'),
          Card(
            child: Column(children: [
              RadioGroup<PauseMode>(
                groupValue: s.pause.mode,
                onChanged: (v) => upd((n) => n.pause = PauseRule(mode: v!, fixedMinutes: s.pause.fixedMinutes, fixedThreshold: s.pause.fixedThreshold)),
                child: const Column(children: [
                  RadioListTile(value: PauseMode.legal, title: Text('Gesetzliche Pause abziehen'), subtitle: Text('30 Min. ab 6 Std., 45 Min. ab 9 Std.')),
                  RadioListTile(value: PauseMode.fixed, title: Text('Feste Pause abziehen')),
                  RadioListTile(value: PauseMode.none, title: Text('Keine Pause abziehen')),
                ]),
              ),
              if (s.pause.mode == PauseMode.fixed)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Text('Pause pro Dienst'),
                    Wrap(spacing: 8, children: [
                      for (final v in const [15, 30, 45, 60])
                        ChoiceChip(
                          label: Text('$v Min.'),
                          selected: s.pause.fixedMinutes == v,
                          onSelected: (_) => upd((n) => n.pause = PauseRule(mode: PauseMode.fixed, fixedMinutes: v, fixedThreshold: s.pause.fixedThreshold)),
                        ),
                    ]),
                    const SizedBox(height: 8),
                    const Text('ab einer Dienstlänge von'),
                    Wrap(spacing: 8, children: [
                      for (final v in const [0, 240, 360, 480])
                        ChoiceChip(
                          label: Text(v == 0 ? 'immer' : '${v ~/ 60} Std.'),
                          selected: s.pause.fixedThreshold == v,
                          onSelected: (_) => upd((n) => n.pause = PauseRule(mode: PauseMode.fixed, fixedMinutes: s.pause.fixedMinutes, fixedThreshold: v)),
                        ),
                    ]),
                  ]),
                ),
            ]),
          ),
        ],
        const SectionTitle('Darstellung'),
        SegmentedButton<ThemeMode>(
          segments: const [
            ButtonSegment(value: ThemeMode.system, label: Text('System'), icon: Icon(Icons.brightness_auto)),
            ButtonSegment(value: ThemeMode.light, label: Text('Hell'), icon: Icon(Icons.light_mode)),
            ButtonSegment(value: ThemeMode.dark, label: Text('Dunkel'), icon: Icon(Icons.dark_mode)),
          ],
          selected: {s.themeMode},
          onSelectionChanged: (v) => upd((n) => n.themeMode = v.first),
        ),
        const SectionTitle('Passwort ändern'),
        const Card(child: Padding(padding: EdgeInsets.all(16), child: _PwBlock())),
        const SizedBox(height: 24),
        OutlinedButton.icon(
          style: OutlinedButton.styleFrom(foregroundColor: cs.error),
          onPressed: () async {
            if (await confirm(context, 'Abmelden?', 'Der gespeicherte Plan wird von diesem Gerät entfernt.', ok: 'Abmelden')) {
              await m.logout();
            }
          },
          icon: const Icon(Icons.logout),
          label: const Text('Abmelden'),
        ),
      ]),
    );
  }

  static String _lead(int m) => m >= 60 && m % 60 == 0 ? '${m ~/ 60} Std. vorher' : (m > 60 ? '${m ~/ 60}:${(m % 60).toString().padLeft(2, '0')} Std. vorher' : '$m Min. vorher');
}

class _PwBlock extends StatelessWidget {
  const _PwBlock();

  @override
  Widget build(BuildContext context) => PasswordForm(onDone: () => showMessage(context, 'Passwort gespeichert ✓'));
}
