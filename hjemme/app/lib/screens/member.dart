import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

import '../geo.dart';
import '../models.dart';
import '../store.dart';
import '../tracker.dart';
import '../ui.dart';
import 'history.dart';
import 'home.dart';
import 'settings.dart';
import 'stats.dart';

/// Detailkarte zu einer Person
void showMember(BuildContext context, String id) {
  showModalBottomSheet(context: context, isScrollControlled: true, builder: (_) => _MemberSheet(id));
}

class _MemberSheet extends StatefulWidget {
  final String id;
  const _MemberSheet(this.id);
  @override
  State<_MemberSheet> createState() => _MemberSheetState();
}

class _MemberSheetState extends State<_MemberSheet> {
  String? address;
  int? _addrTs;

  @override
  void initState() {
    super.initState();
    store.addListener(_upd);
  }

  @override
  void dispose() {
    store.removeListener(_upd);
    super.dispose();
  }

  void _upd() => mounted ? setState(() {}) : null;

  void _loadAddress(LastLoc l) {
    if (_addrTs == l.ts || l.pos == null) return;
    _addrTs = l.ts;
    addressOf(l.pos!).then((a) {
      if (mounted) setState(() => address = a);
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = store.circle;
    final m = c?.member(widget.id);
    if (c == null || m == null) return const SizedBox(height: 200, child: Center(child: Text('Nicht mehr im Kreis')));
    final isMe = m.id == store.api.memberId;
    final l = m.last;
    if (l != null && !m.bubble && !m.paused) _loadAddress(l);
    final myPos = Tracker.i.lastPos;
    final dist = (!isMe && l?.pos != null && myPos != null) ? meters(l!.pos!, LatLngX.of(myPos)) : null;
    final sos = store.activeSos(m.id);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Avatar(m, size: 68),
            const SizedBox(width: 16),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(isMe && m.name.trim().toLowerCase() != 'ich' ? '${m.name} (ich)' : m.name, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                const SizedBox(height: 2),
                Text(statusLine(m, c), style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.7))),
              ]),
            ),
          ]),
          if (sos != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFFE53935), borderRadius: BorderRadius.circular(16)),
              child: Row(children: [
                const Text('🆘', style: TextStyle(fontSize: 26)),
                const SizedBox(width: 10),
                Expanded(
                  child: Text('SOS um ${hm(sos.time)}${sos.text.isEmpty ? '' : ': „${sos.text}“'}',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                ),
                if (sos.pos != null)
                  IconButton(
                      onPressed: () => _route(sos.pos!.latitude, sos.pos!.longitude),
                      icon: const Icon(Icons.directions_rounded, color: Colors.white)),
              ]),
            ),
          ],
          const SizedBox(height: 16),
          Wrap(spacing: 10, runSpacing: 10, children: [
            if (l?.bat != null) _info(BatteryChip(l)),
            if (l?.driving == true) _info(Text('🚗 ${l!.kmh.round()} km/h', style: const TextStyle(fontWeight: FontWeight.w700))),
            if (dist != null) _info(Text('📏 ${fmtDist(dist)} entfernt', style: const TextStyle(fontWeight: FontWeight.w700))),
            if (l?.acc != null && !m.bubble) _info(Text('🎯 ±${l!.acc!.round()} m')),
            if (m.bubble) _info(const Text('🫧 nur ungefähr')),
          ]),
          if (address != null && !m.bubble && !m.paused) ...[
            const SizedBox(height: 12),
            Row(children: [
              const Icon(Icons.place_outlined, size: 18),
              const SizedBox(width: 6),
              Expanded(child: Text(address!, style: const TextStyle(fontWeight: FontWeight.w600))),
            ]),
          ],
          if (m.eta != null) ...[
            const SizedBox(height: 12),
            _etaCard(m),
          ],
          const SizedBox(height: 20),
          if (!isMe)
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 0.9,
              children: [
                if (l?.pos != null) _btn('🗺️', 'Route', () => _route(l!.lat!, l.lng!)),
                if (m.phone != null) _btn('📞', 'Anrufen', () => launchUrl(Uri.parse('tel:${m.phone}'))),
                if (m.phone != null) _btn('✉️', 'SMS', () => launchUrl(Uri.parse('sms:${m.phone}'))),
                _btn('🛰️', 'Jetzt orten', () async {
                  await guard(context, () => store.send('locate', target: m.id));
                  if (context.mounted) toast(context, 'Anfrage gesendet – der Standort kommt gleich.');
                }),
                _btn('🔔', 'Klingeln', () => _ring(m)),
                _btn('👋', 'Anstupsen', () => _nudge(m)),
                _btn('🕓', 'Verlauf', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HistoryScreen(member: m)))),
                _btn('📊', 'Woche', () => Navigator.push(context, MaterialPageRoute(builder: (_) => StatsScreen(member: m)))),
              ],
            )
          else ...[
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 0.9,
              children: [
                _btn('🧭', m.eta == null ? 'Unterwegs' : 'Ziel aus', () {
                  Navigator.pop(context);
                  showEtaSheet(context);
                }),
                _btn('🕓', 'Verlauf', () => Navigator.push(context, MaterialPageRoute(builder: (_) => HistoryScreen(member: m)))),
                _btn('📊', 'Woche', () => Navigator.push(context, MaterialPageRoute(builder: (_) => StatsScreen(member: m)))),
                _btn('👤', 'Profil', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ProfileScreen()))),
              ],
            ),
            const SizedBox(height: 16),
            privacyControls(context, m),
          ],
          if (!isMe && (store.circle?.member(store.api.memberId ?? '')?.isAdmin ?? false)) ...[
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => _remove(m),
                icon: const Icon(Icons.person_remove_rounded, color: Colors.red),
                label: const Text('Aus dem Kreis entfernen', style: TextStyle(color: Colors.red)),
              ),
            ),
          ],
        ]),
      ),
    );
  }

  Widget _etaCard(Member m) {
    final e = m.eta!;
    final l = m.last;
    final left = l?.pos == null ? null : meters(l!.pos!, e.pos);
    final arrive = e.minutes == null ? null : DateTime.fromMillisecondsSinceEpoch(e.started).add(Duration(minutes: e.minutes!));
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(gradient: LinearGradient(colors: [violet.withValues(alpha: 0.2), magenta.withValues(alpha: 0.15)]), borderRadius: BorderRadius.circular(16)),
      child: Row(children: [
        const Text('🧭', style: TextStyle(fontSize: 26)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Unterwegs nach ${e.name}', style: const TextStyle(fontWeight: FontWeight.w800)),
            Text([
              if (arrive != null) 'Ankunft ca. ${hm(arrive)}',
              if (left != null) 'noch ${fmtDist(left)}',
            ].join(' · ')),
          ]),
        ),
      ]),
    );
  }

  Widget _info(Widget child) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(12)),
        child: child,
      );

  Widget _btn(String emoji, String label, VoidCallback onTap) => Material(
        color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text(emoji, style: const TextStyle(fontSize: 26)),
            const SizedBox(height: 4),
            Text(label, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          ]),
        ),
      );

  void _route(double lat, double lng) {
    launchUrl(Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$lat,$lng'), mode: LaunchMode.externalApplication);
  }

  Future<void> _ring(Member m) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${m.name}s Handy klingeln lassen?'),
        content: const Text('Das Handy spielt laut einen Klingelton – auch wenn es leise gestellt ist (je nach Gerät). '
            'Praktisch, wenn es zuhause verlegt wurde.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Klingeln 🔔')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await guard(context, () => store.send('ring', target: m.id));
    if (!mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(SnackBar(
      content: Text('${m.name}s Handy klingelt gleich …'),
      duration: const Duration(seconds: 20),
      action: SnackBarAction(label: 'Stopp', onPressed: () => store.send('ring_stop', target: m.id)),
    ));
  }

  Future<void> _nudge(Member m) async {
    const options = ['👋', '❤️', '🏠', '🍽️', '📞', '🛌', '🙏', '😘'];
    const texts = {'👋': 'Hallo!', '❤️': 'Hab dich lieb', '🏠': 'Komm bitte nach Hause', '🍽️': 'Essen ist fertig!', '📞': 'Ruf mich bitte an',
      '🛌': 'Gute Nacht', '🙏': 'Danke!', '😘': 'Kuss'};
    final pick = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('${m.name} anstupsen', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            const SizedBox(height: 12),
            Wrap(spacing: 10, runSpacing: 10, alignment: WrapAlignment.center, children: [
              for (final o in options)
                ActionChip(avatar: Text(o, style: const TextStyle(fontSize: 18)), label: Text(texts[o]!), onPressed: () => Navigator.pop(ctx, o)),
            ]),
          ]),
        ),
      ),
    );
    if (pick == null || !mounted) return;
    await guard(context, () => store.send('nudge', target: m.id, emoji: pick, text: texts[pick]));
    if (mounted) toast(context, '$pick an ${m.name} gesendet');
  }

  Future<void> _remove(Member m) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('${m.name} entfernen?'),
        content: const Text('Die Person sieht den Kreis danach nicht mehr und kann nur mit dem Code wieder beitreten.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Abbrechen')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Entfernen')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await guard(context, () => store.api.post('remove_member', {'circle': store.circle!.id, 'member': m.id}));
    await store.poll();
    if (mounted) Navigator.pop(context);
  }
}

/// Eigene Privatsphäre: Pause, Blase, Teilen pro Kreis
Widget privacyControls(BuildContext context, Member me) {
  final bubbleOn = me.bubbleUntil > DateTime.now().millisecondsSinceEpoch;
  final c = store.circle!;
  return Column(children: [
    SwitchListTile(
      contentPadding: EdgeInsets.zero,
      secondary: const Text('⏸️', style: TextStyle(fontSize: 24)),
      title: const Text('Standort pausieren', style: TextStyle(fontWeight: FontWeight.w700)),
      subtitle: const Text('Alle Kreise sehen nur noch Akku und „zuletzt gesehen“'),
      value: me.paused,
      onChanged: (v) => guard(context, () => store.share(paused: v)),
    ),
    SwitchListTile(
      contentPadding: EdgeInsets.zero,
      secondary: const Text('🫧', style: TextStyle(fontSize: 24)),
      title: const Text('Blase', style: TextStyle(fontWeight: FontWeight.w700)),
      subtitle: Text(bubbleOn
          ? 'Nur ungefährer Ort (ca. 2 km) bis ${hm(DateTime.fromMillisecondsSinceEpoch(me.bubbleUntil))}'
          : 'Zeitweise nur den ungefähren Ort zeigen'),
      value: bubbleOn,
      onChanged: (v) async {
        if (!v) return guard(context, () => store.share(bubbleUntil: 0));
        final h = await showDialog<int>(
          context: context,
          builder: (ctx) => SimpleDialog(title: const Text('Wie lange?'), children: [
            for (final h in [1, 2, 4, 8, 24])
              SimpleDialogOption(onPressed: () => Navigator.pop(ctx, h), child: Text('$h ${h == 1 ? 'Stunde' : 'Stunden'}')),
          ]),
        );
        if (h != null && context.mounted) {
          await guard(context, () => store.share(bubbleUntil: DateTime.now().add(Duration(hours: h)).millisecondsSinceEpoch));
        }
      },
    ),
    SwitchListTile(
      contentPadding: EdgeInsets.zero,
      secondary: const Text('👀', style: TextStyle(fontSize: 24)),
      title: Text('In „${c.name}“ teilen', style: const TextStyle(fontWeight: FontWeight.w700)),
      subtitle: const Text('Nur für diesen Kreis ein- oder ausschalten'),
      value: me.sharing,
      onChanged: (v) => guard(context, () => store.share(circle: c.id, share: v)),
    ),
  ]);
}
