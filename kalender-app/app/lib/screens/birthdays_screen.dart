import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../main.dart';
import '../models.dart';
import 'event_editor.dart';

class BirthdaysScreen extends StatelessWidget {
  final void Function(Occurrence) onOpen;
  const BirthdaysScreen({super.key, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final list = store.upcomingBirthdays();
        final today = dateOnly(DateTime.now());
        final color = Color(store.birthdayColor);
        return Scaffold(
          body: list.isEmpty
              ? const Center(child: Text('Noch keine Geburtstage eingetragen 🎂', style: TextStyle(color: Colors.grey)))
              : ListView.separated(
                  itemCount: list.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (context, i) {
                    final o = list[i];
                    final ev = o.ev;
                    final days = dateOnly(o.start).difference(today).inHours ~/ 24;
                    final age = ev.birthYear != null ? o.start.year - ev.birthYear! : null;
                    final when = days == 0 ? 'Heute! 🎉' : (days == 1 ? 'Morgen' : 'in $days Tagen');
                    return ListTile(
                      onTap: () => onOpen(o),
                      leading: CircleAvatar(
                        backgroundColor: days == 0 ? color : color.withValues(alpha: 0.18),
                        child: Text('${o.start.day}.${o.start.month}.', style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: days == 0 ? Colors.white : color)),
                      ),
                      title: Text(ev.title, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text([
                        DateFormat('EEEE, d. MMMM', 'de_DE').format(o.start),
                        if (age != null && age > 0) 'wird $age',
                      ].join(' · ')),
                      trailing: Text(when, style: TextStyle(color: days <= 7 ? color : Colors.grey.shade700, fontWeight: days <= 7 ? FontWeight.bold : null)),
                    );
                  },
                ),
          floatingActionButtonLocation: FloatingActionButtonLocation.startFloat,
          floatingActionButton: FloatingActionButton.extended(
            heroTag: 'bday',
            backgroundColor: color,
            foregroundColor: Colors.white,
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EventEditor(kind: EventKind.birthday))),
            icon: const Icon(Icons.cake),
            label: const Text('Geburtstag'),
          ),
        );
      },
    );
  }
}
