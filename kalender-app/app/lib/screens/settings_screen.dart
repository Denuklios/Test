import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:share_plus/share_plus.dart';

import '../holidays.dart';
import '../main.dart';
import '../models.dart';
import '../notifications.dart';
import '../store.dart';
import '../widgets/common.dart';

String inviteText() => 'Komm in unseren Familienkalender „${store.groupName}“! 📅\n'
    'App installieren, dann diese Nachricht beim Start einfügen.\n'
    'Server: ${store.serverUrl}\n'
    'Code: ${store.code}';

void showInvite(BuildContext context) {
  showModalBottomSheet(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Jemanden einladen', style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          QrImageView(data: inviteText(), size: 200),
          const SizedBox(height: 8),
          SelectableText('Code: ${store.code}', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, letterSpacing: 2)),
          const SizedBox(height: 4),
          Text(store.serverUrl, style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
          const SizedBox(height: 16),
          FilledButton.icon(
            onPressed: () => SharePlus.instance.share(ShareParams(text: inviteText())),
            icon: const Icon(Icons.share),
            label: const Text('Einladung senden (WhatsApp, SMS …)'),
          ),
        ]),
      ),
    ),
  );
}

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  Future<void> _save() async {
    await store.saveSettings();
    setState(() {});
  }

  Widget _header(String t) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 6),
        child: Text(t, style: TextStyle(color: Theme.of(context).colorScheme.primary, fontWeight: FontWeight.bold)),
      );

  Future<void> _editMember(Member? m) async {
    final isNew = m == null;
    final mm = m ?? Member(id: newId(), name: '', color: memberPalette[store.activeMembers.length % memberPalette.length]);
    final c = TextEditingController(text: mm.name);
    var color = mm.color;
    final res = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text(isNew ? 'Person hinzufügen' : 'Person bearbeiten'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: c, autofocus: isNew, textCapitalization: TextCapitalization.words, decoration: const InputDecoration(labelText: 'Name')),
            const SizedBox(height: 16),
            Row(children: [
              const Text('Farbe'),
              const Spacer(),
              InkWell(
                onTap: () async {
                  final x = await pickColor(ctx, color, taken: store.activeMembers.map((e) => e.color).toList());
                  if (x != null) setD(() => color = x);
                },
                child: ColorDot(Color(color), size: 40),
              ),
            ]),
            if (isNew)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text('Für Kinder oder alle ohne Handy. Wer die App hat, legt sich beim Beitreten selbst an.',
                    style: TextStyle(color: Colors.grey.shade600, fontSize: 12)),
              ),
          ]),
          actions: [
            if (!isNew && m.id != store.myId)
              TextButton(onPressed: () => Navigator.pop(ctx, 'delete'), child: const Text('Entfernen', style: TextStyle(color: Colors.red))),
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Abbrechen')),
            FilledButton(onPressed: () => Navigator.pop(ctx, 'save'), child: const Text('Speichern')),
          ],
        ),
      ),
    );
    if (res == 'save' && c.text.trim().isNotEmpty) {
      mm
        ..name = c.text.trim()
        ..color = color;
      await store.saveMember(mm);
    } else if (res == 'delete') {
      mm.deleted = true;
      await store.saveMember(mm);
    }
    setState(() {});
  }

  Future<void> _editTemplate(Template? t) async {
    final tt = t ?? Template(id: newId(), title: '');
    final c = TextEditingController(text: tt.title);
    var allDay = tt.allDay;
    var s = tt.startTod, e = tt.endTod;
    Future<TimeOfDay?> pick(BuildContext ctx, TimeOfDay i) => showTimePicker(
          context: ctx,
          initialTime: i,
          builder: (c, child) => MediaQuery(data: MediaQuery.of(c).copyWith(alwaysUse24HourFormat: true), child: child!),
        );
    String f(TimeOfDay x) => '${two(x.hour)}:${two(x.minute)}';
    final res = await showDialog<String>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: Text(t == null ? 'Neue Vorlage' : 'Vorlage bearbeiten'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            TextField(controller: c, decoration: const InputDecoration(labelText: 'Name (z. B. Früh, Spät, Training)')),
            SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Ganztägig'), value: allDay, onChanged: (v) => setD(() => allDay = v)),
            if (!allDay)
              Row(children: [
                OutlinedButton(onPressed: () async {
                  final x = await pick(ctx, s);
                  if (x != null) setD(() => s = x);
                }, child: Text(f(s))),
                const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Text('bis')),
                OutlinedButton(onPressed: () async {
                  final x = await pick(ctx, e);
                  if (x != null) setD(() => e = x);
                }, child: Text(f(e))),
              ]),
          ]),
          actions: [
            if (t != null) TextButton(onPressed: () => Navigator.pop(ctx, 'delete'), child: const Text('Löschen', style: TextStyle(color: Colors.red))),
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Abbrechen')),
            FilledButton(onPressed: () => Navigator.pop(ctx, 'save'), child: const Text('Speichern')),
          ],
        ),
      ),
    );
    if (res == 'save' && c.text.trim().isNotEmpty) {
      tt
        ..title = c.text.trim()
        ..allDay = allDay
        ..startTime = f(s)
        ..endTime = f(e);
      await store.saveTemplate(tt);
    } else if (res == 'delete') {
      tt.deleted = true;
      await store.saveTemplate(tt);
    }
    setState(() {});
  }

  Future<void> _editPlace(Place? p) async {
    final pp = p ?? Place(id: newId(), name: '');
    final n = TextEditingController(text: pp.name);
    final a = TextEditingController(text: pp.address);
    final res = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(p == null ? 'Neuer Ort' : 'Ort bearbeiten'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: n, decoration: const InputDecoration(labelText: 'Name (z. B. Oma, Hundeschule)')),
          TextField(controller: a, decoration: const InputDecoration(labelText: 'Adresse')),
        ]),
        actions: [
          if (p != null) TextButton(onPressed: () => Navigator.pop(ctx, 'delete'), child: const Text('Löschen', style: TextStyle(color: Colors.red))),
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(ctx, 'save'), child: const Text('Speichern')),
        ],
      ),
    );
    if (res == 'save' && n.text.trim().isNotEmpty) {
      pp
        ..name = n.text.trim()
        ..address = a.text.trim();
      await store.savePlace(pp);
    } else if (res == 'delete') {
      pp.deleted = true;
      await store.savePlace(pp);
    }
    setState(() {});
  }

  Future<void> _editDefaultReminders() async {
    final sel = store.defaultReminders.toSet();
    await showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Standard-Erinnerungen'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: reminderOptions.entries
                .map((e) => CheckboxListTile(
                      dense: true,
                      value: sel.contains(e.key),
                      title: Text(e.value),
                      onChanged: (v) => setD(() => v == true ? sel.add(e.key) : sel.remove(e.key)),
                    ))
                .toList(),
          ),
          actions: [FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))],
        ),
      ),
    );
    store.defaultReminders = sel.toList()..sort();
    await _save();
  }

  @override
  Widget build(BuildContext context) {
    final me = store.me;
    return Scaffold(
      appBar: AppBar(title: const Text('Einstellungen')),
      body: ListenableBuilder(
        listenable: store,
        builder: (context, _) => ListView(children: [
          _header('Ich'),
          if (me != null)
            ListTile(
              leading: MemberAvatar(me),
              title: Text(me.name),
              subtitle: const Text('Name und Farbe ändern'),
              onTap: () => _editMember(me),
            ),
          _header('Gruppe „${store.groupName}“'),
          ...store.activeMembers.where((m) => m.id != store.myId).map((m) => ListTile(
                leading: MemberAvatar(m),
                title: Text(m.name),
                trailing: const Icon(Icons.edit_outlined, size: 20),
                onTap: () => _editMember(m),
              )),
          ListTile(leading: const Icon(Icons.person_add_alt_1), title: const Text('Person ohne App hinzufügen (z. B. Kind)'), onTap: () => _editMember(null)),
          ListTile(leading: const Icon(Icons.qr_code), title: const Text('Einladen (Code / QR / Nachricht)'), onTap: () => showInvite(context)),
          _header('Feiertage & Ferien'),
          ListTile(
            leading: const Icon(Icons.map_outlined),
            title: const Text('Bundesland'),
            trailing: DropdownButton<String>(
              value: store.state,
              items: bundeslaender.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
              onChanged: (v) {
                store.state = v ?? 'SH';
                _save();
              },
            ),
          ),
          SwitchListTile(title: const Text('🇩🇪 Feiertage Deutschland'), value: store.showDE, onChanged: (v) => _set(() => store.showDE = v)),
          SwitchListTile(title: const Text('🇩🇰 Helligdage Dänemark'), value: store.showDK, onChanged: (v) => _set(() => store.showDK = v)),
          SwitchListTile(
            title: const Text('Gedenk- & Aktionstage'),
            subtitle: const Text('Advent, Muttertag, Totensonntag, Zeitumstellung …'),
            value: store.showObservances,
            onChanged: (v) => _set(() => store.showObservances = v),
          ),
          SwitchListTile(
            title: const Text('Schulferien Deutschland'),
            subtitle: Text('${bundeslaender[store.state]} (aus dem Internet, wird gespeichert)'),
            value: store.schoolDE,
            onChanged: (v) => _set(() => store.schoolDE = v),
          ),
          SwitchListTile(
            title: const Text('Skoleferie Dänemark'),
            subtitle: const Text('Übliche Ferienwochen (je nach Kommune ±1 Woche)'),
            value: store.schoolDK,
            onChanged: (v) => _set(() => store.schoolDK = v),
          ),
          _header('Geburtstage'),
          ListTile(
            leading: ColorDot(Color(store.birthdayColor)),
            title: const Text('Farbe für Geburtstage'),
            subtitle: const Text('Gilt für alle Geburtstage, egal wer sie einträgt'),
            onTap: () async {
              final c = await pickColor(context, store.birthdayColor);
              if (c != null) _set(() => store.birthdayColor = c);
            },
          ),
          ListTile(
            leading: const Icon(Icons.card_giftcard),
            title: const Text('Vorab erinnern'),
            trailing: DropdownButton<int>(
              value: store.birthdayReminderDays,
              items: const [
                DropdownMenuItem(value: 0, child: Text('Nur am Tag')),
                DropdownMenuItem(value: 1, child: Text('1 Tag vorher')),
                DropdownMenuItem(value: 3, child: Text('3 Tage vorher')),
                DropdownMenuItem(value: 7, child: Text('1 Woche vorher')),
                DropdownMenuItem(value: 14, child: Text('2 Wochen vorher')),
              ],
              onChanged: (v) => _set(() => store.birthdayReminderDays = v ?? 1),
            ),
          ),
          _header('Benachrichtigungen'),
          ListTile(
            leading: const Icon(Icons.alarm),
            title: const Text('Standard-Erinnerung für neue Termine'),
            subtitle: Text(store.defaultReminders.isEmpty ? 'Keine' : store.defaultReminders.map(reminderOptionLabel).join(', ')),
            onTap: _editDefaultReminders,
          ),
          SwitchListTile(
            title: const Text('Melden, wenn andere etwas eintragen'),
            value: store.notifyChanges,
            onChanged: (v) => _set(() => store.notifyChanges = v),
          ),
          if (store.notifyChanges)
            SwitchListTile(
              title: const Text('… nur wenn ich dabei bin'),
              value: store.notifyOnlyMine,
              onChanged: (v) => _set(() => store.notifyOnlyMine = v),
            ),
          SwitchListTile(
            title: const Text('Tagesvorschau am Morgen'),
            subtitle: Text('Um ${store.morningHour}:00 Uhr: was heute ansteht'),
            value: store.morningSummary,
            onChanged: (v) => _set(() => store.morningSummary = v),
          ),
          if (store.morningSummary)
            ListTile(
              title: const Text('Uhrzeit der Tagesvorschau'),
              trailing: DropdownButton<int>(
                value: store.morningHour,
                items: List.generate(8, (i) => i + 5).map((h) => DropdownMenuItem(value: h, child: Text('$h:00'))).toList(),
                onChanged: (v) => _set(() => store.morningHour = v ?? 7),
              ),
            ),
          _header('Schnell-Vorlagen (Schicht-Pinsel)'),
          ...store.activeTemplates.map((t) => ListTile(
                leading: const Icon(Icons.bolt),
                title: Text(t.title),
                subtitle: Text(t.allDay ? 'Ganztägig' : '${t.startTime} – ${t.endTime}'),
                onTap: () => _editTemplate(t),
              )),
          ListTile(leading: const Icon(Icons.add), title: const Text('Vorlage hinzufügen'), onTap: () => _editTemplate(null)),
          _header('Gespeicherte Orte'),
          ...store.activePlaces.map((p) => ListTile(
                leading: const Icon(Icons.place_outlined),
                title: Text(p.name),
                subtitle: p.address.isEmpty ? null : Text(p.address),
                onTap: () => _editPlace(p),
              )),
          ListTile(leading: const Icon(Icons.add_location_alt_outlined), title: const Text('Ort hinzufügen'), onTap: () => _editPlace(null)),
          _header('Ansicht'),
          SwitchListTile(title: const Text('Kalenderwochen anzeigen'), value: store.showWeekNumbers, onChanged: (v) => _set(() => store.showWeekNumbers = v)),
          _header('Verbindung'),
          ListTile(
            leading: Icon(store.lastError == null ? Icons.cloud_done_outlined : Icons.cloud_off, color: store.lastError == null ? Colors.green : Colors.red),
            title: Text(store.serverUrl, style: const TextStyle(fontSize: 13)),
            subtitle: Text(store.lastError ?? 'Verbunden · Code ${store.code}${store.pending.isNotEmpty ? ' · ${store.pending.length} warten auf Upload' : ''}'),
            onTap: () => store.sync(),
          ),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Von der Gruppe abmelden'),
            subtitle: const Text('Daten bleiben auf dem Server erhalten'),
            onTap: () async {
              final ok = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Abmelden?'),
                  content: const Text('Du kannst jederzeit mit dem Gruppen-Code wieder beitreten.'),
                  actions: [
                    TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Abbrechen')),
                    FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Abmelden')),
                  ],
                ),
              );
              if (ok == true) {
                await store.resetConnection();
                await Notifier.rescheduleAll(store);
                if (context.mounted) Navigator.popUntil(context, (r) => r.isFirst);
              }
            },
          ),
          const SizedBox(height: 40),
        ]),
      ),
    );
  }

  void _set(void Function() f) {
    f();
    _save();
  }
}
