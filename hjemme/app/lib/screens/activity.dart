import 'package:material_ui/material_ui.dart';
import 'package:intl/intl.dart';

import '../events.dart';
import '../geo.dart';
import '../store.dart';
import '../ui.dart';
import 'member.dart';

/// Alles, was im Kreis passiert ist
class ActivityScreen extends StatelessWidget {
  const ActivityScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final c = store.circle;
        final list = c == null
            ? []
            : store.events
                .where((e) => e.circle == c.id && e.type != 'chat' && e.type != 'ring_stop' && e.type != 'react' && (e.target == null || e.target == store.api.memberId || e.member == store.api.memberId))
                .toList()
                .reversed
                .toList();
        return Scaffold(
          appBar: AppBar(title: const Text('Aktivitäten')),
          body: list.isEmpty
              ? const Center(child: Text('Noch nichts passiert.'))
              : ListView.builder(
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final e = list[i];
                    final m = c!.member(e.member);
                    final t = describe(e, m?.name ?? 'Jemand', targetName: e.target == null ? null : c.member(e.target!)?.name, circleName: c.name);
                    final prev = i > 0 ? list[i - 1] : null;
                    final newDay = prev == null || prev.time.day != e.time.day;
                    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      if (newDay)
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                          child: Text(DateFormat('EEEE, d. MMMM', 'de').format(e.time), style: const TextStyle(fontWeight: FontWeight.w800)),
                        ),
                      ListTile(
                        leading: Stack(clipBehavior: Clip.none, children: [
                          if (m != null) Avatar(m, size: 42) else const CircleAvatar(child: Icon(Icons.person)),
                          Positioned(right: -6, bottom: -6, child: Text(t.icon, style: const TextStyle(fontSize: 18))),
                        ]),
                        title: Text(t.body.isEmpty ? t.title : t.body, style: TextStyle(fontWeight: e.type == 'sos' ? FontWeight.w900 : FontWeight.w600,
                            color: e.type == 'sos' ? Colors.red : null)),
                        subtitle: Text(ago(e.time)),
                        onTap: m == null ? null : () => showMember(context, m.id),
                      ),
                    ]);
                  },
                ),
        );
      },
    );
  }
}
