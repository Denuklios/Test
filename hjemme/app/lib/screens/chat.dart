import 'package:material_ui/material_ui.dart';
import 'package:intl/intl.dart';

import '../events.dart';
import '../geo.dart';
import '../models.dart';
import '../store.dart';
import '../ui.dart';

/// Kreis-Chat mit Check-ins, SOS und Ankünften im Verlauf
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final text = TextEditingController();
  final scroll = ScrollController();
  bool sending = false;

  @override
  void initState() {
    super.initState();
    store.openChat = store.circle?.id;
    store.addListener(_upd);
    WidgetsBinding.instance.addPostFrameCallback((_) => store.markRead(store.circle!.id));
  }

  @override
  void dispose() {
    store.openChat = null;
    store.removeListener(_upd);
    super.dispose();
  }

  void _upd() {
    if (!mounted) return;
    setState(() {});
    final c = store.circle;
    if (c != null && store.unread(c.id) > 0) WidgetsBinding.instance.addPostFrameCallback((_) => store.markRead(c.id));
  }

  Future<void> _send([String? quick]) async {
    final t = (quick ?? text.text).trim();
    if (t.isEmpty) return;
    setState(() => sending = true);
    final ok = await guard(context, () async {
      await store.send('chat', text: t);
      return true;
    });
    if (!mounted) return;
    setState(() => sending = false);
    if (ok == true && quick == null) text.clear();
  }

  @override
  Widget build(BuildContext context) {
    final c = store.circle;
    if (c == null) return const Scaffold();
    final msgs = store.chatOf(c.id).reversed.toList();
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(c.name),
          Text('${c.members.length} Personen', style: const TextStyle(fontSize: 12)),
        ]),
      ),
      body: Column(children: [
        Expanded(
          child: msgs.isEmpty
              ? const Center(child: Text('Noch keine Nachrichten.\nSag Hallo! 👋', textAlign: TextAlign.center))
              : ListView.builder(
                  controller: scroll,
                  reverse: true,
                  padding: const EdgeInsets.all(12),
                  itemCount: msgs.length,
                  itemBuilder: (_, i) {
                    final e = msgs[i];
                    final prev = i + 1 < msgs.length ? msgs[i + 1] : null;
                    final newDay = prev == null || prev.time.day != e.time.day || prev.time.month != e.time.month;
                    return Column(children: [
                      if (newDay)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Text(DateFormat('EEEE, d. MMMM', 'de').format(e.time), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
                        ),
                      _bubble(e, c),
                    ]);
                  },
                ),
        ),
        SizedBox(
          height: 44,
          child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 8), children: [
            for (final q in const ['Bin gleich da 🏃', 'Alles gut 👍', 'Holt mich jemand ab? 🚗', 'Essen ist fertig 🍽️', 'Komme später ⏰'])
              Padding(padding: const EdgeInsets.only(right: 6), child: ActionChip(label: Text(q), onPressed: sending ? null : () => _send(q))),
          ]),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 6, 10, 10),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: text,
                  minLines: 1,
                  maxLines: 4,
                  textCapitalization: TextCapitalization.sentences,
                  decoration: const InputDecoration(hintText: 'Nachricht an alle …'),
                  onSubmitted: (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              Container(
                decoration: const BoxDecoration(gradient: brandGradient, shape: BoxShape.circle),
                child: IconButton(onPressed: sending ? null : _send, icon: const Icon(Icons.send_rounded, color: Colors.white)),
              ),
            ]),
          ),
        ),
      ]),
    );
  }

  Widget _bubble(Ev e, Circle c) {
    final m = c.member(e.member);
    final mine = e.member == store.api.memberId;
    final who = m?.name ?? 'Ehemaliges Mitglied';
    if (e.type != 'chat') {
      final t = describe(e, who);
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              color: e.type == 'sos' ? const Color(0xFFE53935) : violet.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Text('${t.icon} ${t.body} · ${hm(e.time)}',
                textAlign: TextAlign.center, style: TextStyle(fontWeight: FontWeight.w600, color: e.type == 'sos' ? Colors.white : null)),
          ),
        ),
      );
    }
    final color = m == null ? Colors.grey : mColor(m.color);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        mainAxisAlignment: mine ? MainAxisAlignment.end : MainAxisAlignment.start,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!mine && m != null) ...[Avatar(m, size: 30, ring: false), const SizedBox(width: 6)],
          Flexible(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
              decoration: BoxDecoration(
                gradient: mine ? brandGradient : null,
                color: mine ? null : color.withValues(alpha: 0.14),
                borderRadius: BorderRadius.only(
                  topLeft: const Radius.circular(18),
                  topRight: const Radius.circular(18),
                  bottomLeft: Radius.circular(mine ? 18 : 4),
                  bottomRight: Radius.circular(mine ? 4 : 18),
                ),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (!mine) Text(who, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: color)),
                Text(e.text, style: TextStyle(fontSize: 15, color: mine ? Colors.white : null)),
                Align(
                  alignment: Alignment.bottomRight,
                  child: Text(hm(e.time), style: TextStyle(fontSize: 10, color: mine ? Colors.white70 : null)),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}
