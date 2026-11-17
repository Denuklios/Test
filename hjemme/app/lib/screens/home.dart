import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart' hide Circle;

import '../geo.dart';
import '../models.dart';
import '../store.dart';
import '../tracker.dart';
import '../ui.dart';
import 'activity.dart';
import 'chat.dart';
import 'checkin.dart';
import 'member.dart';
import 'places.dart';
import 'settings.dart';
import 'sos.dart';

class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => HomeState();
}

class HomeState extends State<Home> with TickerProviderStateMixin {
  final map = MapController();
  final sheet = DraggableScrollableController();
  String? focused; // Mitglied, dem die Karte folgt
  bool _fitted = false;
  bool _bgOk = true;

  @override
  void initState() {
    super.initState();
    store.addListener(_changed);
    _checkBg();
    if (store.circle != null) {
      _fitted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => fitAll());
    }
  }

  @override
  void dispose() {
    store.removeListener(_changed);
    super.dispose();
  }

  Future<void> _checkBg() async {
    try {
      final ok = await Tracker.hasPermission(background: true);
      if (mounted) setState(() => _bgOk = ok);
    } catch (_) {}
  }

  void _changed() {
    if (!mounted) return;
    setState(() {});
    final c = store.circle;
    if (c == null) return;
    if (!_fitted) {
      _fitted = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => fitAll());
    } else if (focused != null) {
      final m = c.member(focused!);
      if (m?.last?.pos != null) _animateTo(m!.last!.pos!, map.camera.zoom);
    }
  }

  List<LatLng> _points() {
    final c = store.circle;
    if (c == null) return [];
    return [for (final m in c.members) if (m.last?.pos != null && !m.paused) m.last!.pos!];
  }

  void fitAll() {
    final pts = _points();
    if (pts.isEmpty) {
      final p = Tracker.i.lastPos;
      if (p != null) map.move(LatLng(p.latitude, p.longitude), 15);
      return;
    }
    focused = null;
    if (pts.length == 1) {
      _animateTo(pts.first, 15);
    } else {
      final cam = CameraFit.bounds(bounds: LatLngBounds.fromPoints(pts), padding: const EdgeInsets.fromLTRB(60, 140, 60, 320), maxZoom: 16)
          .fit(map.camera);
      _animateTo(cam.center, cam.zoom);
    }
  }

  AnimationController? _anim;
  void _animateTo(LatLng dest, double zoom) {
    _anim?.dispose();
    final start = map.camera.center, z0 = map.camera.zoom;
    final ctl = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));
    final curve = CurvedAnimation(parent: ctl, curve: Curves.easeInOutCubic);
    ctl.addListener(() {
      final t = curve.value;
      map.move(LatLng(start.latitude + (dest.latitude - start.latitude) * t, start.longitude + (dest.longitude - start.longitude) * t),
          z0 + (zoom - z0) * t);
    });
    _anim = ctl;
    ctl.forward();
  }

  void focusMember(Member m, {bool open = true}) {
    final p = m.last?.pos;
    if (p != null) {
      focused = m.id;
      _animateTo(p, 16);
    }
    if (open) showMember(context, m.id);
    setState(() {});
  }

  void focusPoint(LatLng p) {
    focused = null;
    _animateTo(p, 16);
  }

  @override
  Widget build(BuildContext context) {
    final c = store.circle;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final sosMembers = c == null ? <Member>[] : c.members.where((m) => m.id != store.api.memberId && store.activeSos(m.id) != null).toList();
    final unread = c == null ? 0 : store.unread(c.id);
    return Scaffold(
      body: Stack(children: [
        FlutterMap(
          mapController: map,
          options: MapOptions(
            initialCenter: const LatLng(51.1657, 10.4515),
            initialZoom: 5,
            onPositionChanged: (cam, gesture) {
              if (gesture && focused != null) setState(() => focused = null);
            },
            onLongPress: (_, p) => editPlace(context, Place(id: '', name: '', lat: p.latitude, lng: p.longitude)),
            interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
          ),
          children: [
            if (store.mapStyle != 'none') TileLayer(
              urlTemplate: tileUrl(store.mapStyle, dark),
              subdomains: const ['a', 'b', 'c', 'd'],
              retinaMode: true,
              userAgentPackageName: 'de.familie.hjemme',
              maxZoom: 19,
            ),
            if (c != null)
              CircleLayer(circles: [
                for (final p in c.places)
                  CircleMarker(
                    point: p.pos,
                    radius: p.radius,
                    useRadiusInMeter: true,
                    color: violet.withValues(alpha: 0.13),
                    borderColor: violet.withValues(alpha: 0.7),
                    borderStrokeWidth: 2,
                  ),
                for (final m in c.members)
                  if (m.last?.pos != null && (m.last!.acc ?? 0) > 60 && !m.paused)
                    CircleMarker(point: m.last!.pos!, radius: m.last!.acc!, useRadiusInMeter: true, color: mColor(m.color).withValues(alpha: 0.10)),
              ]),
            if (c != null)
              PolylineLayer(polylines: [
                for (final m in c.members)
                  if (m.eta != null && m.last?.pos != null)
                    Polyline(points: [m.last!.pos!, m.eta!.pos], strokeWidth: 3, color: mColor(m.color), pattern: StrokePattern.dashed(segments: const [8, 6])),
              ]),
            if (c != null)
              MarkerLayer(markers: [
                for (final p in c.places)
                  Marker(
                    point: p.pos,
                    width: 120,
                    height: 54,
                    child: GestureDetector(
                      onTap: () => editPlace(context, p),
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Text(p.icon, style: const TextStyle(fontSize: 22)),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.55), borderRadius: BorderRadius.circular(8)),
                          child: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                        ),
                      ]),
                    ),
                  ),
                for (final m in c.members)
                  if (m.eta != null)
                    Marker(point: m.eta!.pos, width: 36, height: 36, child: const Text('🏁', style: TextStyle(fontSize: 26))),
                for (final m in c.members)
                  if (m.last?.pos != null && !(m.paused && m.id != store.api.memberId))
                    Marker(
                      point: m.last!.pos!,
                      width: 76,
                      height: 76,
                      alignment: Alignment.topCenter,
                      child: GestureDetector(
                        onTap: () => focusMember(m),
                        child: MemberPin(m, selected: focused == m.id, sos: sosMembers.contains(m)),
                      ),
                    ),
              ]),
            const Align(alignment: Alignment.bottomLeft, child: Padding(
              padding: EdgeInsets.only(left: 6, bottom: 4),
              child: Text('© OpenStreetMap, CARTO', style: TextStyle(fontSize: 9, color: Colors.black54)),
            )),
          ],
        ),
        // ---------- obere Leiste ----------
        SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
            child: Column(children: [
              Row(children: [
                _glass(
                  child: InkWell(
                    borderRadius: BorderRadius.circular(24),
                    onTap: () => _circlePicker(context),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        ShaderMask(shaderCallback: (r) => brandGradient.createShader(r), child: const Icon(Icons.favorite_rounded, color: Colors.white, size: 20)),
                        const SizedBox(width: 8),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 150),
                          child: Text(c?.name ?? 'Kein Kreis', overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
                        ),
                        const Icon(Icons.expand_more_rounded),
                      ]),
                    ),
                  ),
                ),
                const Spacer(),
                _roundBtn(Icons.chat_bubble_rounded, () => _open(const ChatScreen()), badge: unread),
                const SizedBox(width: 8),
                _roundBtn(Icons.notifications_rounded, () => _open(const ActivityScreen())),
                const SizedBox(width: 8),
                _roundBtn(Icons.settings_rounded, () => _open(const SettingsScreen())),
              ]),
              if (!store.online)
                _banner('Keine Verbindung zum Server – neue Standorte werden gesammelt und später gesendet.', Icons.cloud_off_rounded, Colors.grey.shade800),
              if (!_bgOk)
                _banner('Für Benachrichtigungen bei Ankunft: Standort „Immer erlauben“ einschalten.', Icons.location_on_rounded, coral,
                    onTap: () async {
                  await askBackgroundPermission(context);
                  _checkBg();
                }),
              for (final m in sosMembers)
                _banner('SOS von ${m.name}! Tippen für Standort.', Icons.sos_rounded, const Color(0xFFE53935), onTap: () => focusMember(m)),
            ]),
          ),
        ),
        // ---------- rechte Knöpfe ----------
        Positioned(
          right: 12,
          top: MediaQuery.of(context).padding.top + 74 + (sosMembers.length + (!_bgOk ? 1 : 0) + (!store.online ? 1 : 0)) * 52,
          child: Column(children: [
            _roundBtn(Icons.layers_rounded, () => _styles(context)),
            const SizedBox(height: 8),
            _roundBtn(Icons.my_location_rounded, () {
              final me = c?.member(store.api.memberId ?? '');
              if (me != null) focusMember(me, open: false);
            }),
            const SizedBox(height: 8),
            _roundBtn(Icons.groups_rounded, fitAll),
          ]),
        ),
        // ---------- Liste unten ----------
        DraggableScrollableSheet(
          controller: sheet,
          initialChildSize: 0.34,
          minChildSize: 0.16,
          maxChildSize: 0.88,
          snap: true,
          snapSizes: const [0.16, 0.34, 0.88],
          builder: (ctx, scroll) => _sheet(ctx, scroll, c),
        ),
      ]),
    );
  }

  Widget _sheet(BuildContext context, ScrollController scroll, Circle? c) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: Theme.of(context).bottomSheetTheme.backgroundColor,
      borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      elevation: 12,
      shadowColor: Colors.black54,
      clipBehavior: Clip.antiAlias,
      child: ListView(controller: scroll, padding: EdgeInsets.zero, children: [
        Center(
          child: Container(
            margin: const EdgeInsets.symmetric(vertical: 10),
            width: 44,
            height: 5,
            decoration: BoxDecoration(color: cs.onSurface.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(3)),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Row(children: [
            Expanded(child: _action('✔️', 'Check-in', () => showCheckin(context))),
            const SizedBox(width: 8),
            Expanded(child: _action('🧭', 'Unterwegs', () => showEtaSheet(context))),
            const SizedBox(width: 8),
            Expanded(child: _action('🆘', 'SOS', () => _open(const SosScreen()), danger: true)),
          ]),
        ),
        const SizedBox(height: 8),
        if (c != null)
          for (final m in c.members) _memberTile(m, c),
        if (c != null)
          ListTile(
            leading: CircleAvatar(backgroundColor: violet.withValues(alpha: 0.15), child: const Icon(Icons.person_add_alt_1_rounded, color: violet)),
            title: const Text('Jemanden einladen', style: TextStyle(fontWeight: FontWeight.w700)),
            subtitle: Text('Code ${c.code}'),
            onTap: () => showInvite(context, c),
          ),
        const Divider(indent: 16, endIndent: 16),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 8, 0),
          child: Row(children: [
            const Text('Orte', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
            const Spacer(),
            TextButton.icon(onPressed: () => _open(const PlacesScreen()), icon: const Icon(Icons.edit_location_alt_rounded), label: const Text('Verwalten')),
          ]),
        ),
        if (c != null && c.places.isEmpty)
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Text('Lege Orte wie Zuhause oder Schule an – dann meldet Hjemme, wenn jemand ankommt oder losgeht. '
                'Tipp: lange auf die Karte drücken.'),
          ),
        if (c != null)
          SizedBox(
            height: 92,
            child: ListView(scrollDirection: Axis.horizontal, padding: const EdgeInsets.symmetric(horizontal: 12), children: [
              for (final p in c.places)
                _placeCard(p, c),
            ]),
          ),
        const SizedBox(height: 24),
      ]),
    );
  }

  Widget _placeCard(Place p, Circle c) {
    final here = c.members.where((m) => m.place == p.id).toList();
    return GestureDetector(
      onTap: () => focusPoint(p.pos),
      onLongPress: () => editPlace(context, p),
      child: Container(
        width: 130,
        margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: LinearGradient(colors: [violet.withValues(alpha: 0.16), magenta.withValues(alpha: 0.10)]),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(p.icon, style: const TextStyle(fontSize: 20)),
            const SizedBox(width: 6),
            Expanded(child: Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800))),
          ]),
          const Spacer(),
          if (here.isEmpty)
            Text('niemand da', style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.5)))
          else
            SizedBox(
              height: 26,
              child: Stack(children: [
                for (var i = 0; i < here.length && i < 4; i++) Positioned(left: i * 18.0, child: Avatar(here[i], size: 26)),
              ]),
            ),
        ]),
      ),
    );
  }

  Widget _memberTile(Member m, Circle c) {
    final isMe = m.id == store.api.memberId;
    final sos = store.activeSos(m.id) != null;
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
      leading: Avatar(m, size: 48),
      title: Row(children: [
        Flexible(child: Text(isMe ? '${m.name} (ich)' : m.name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w800))),
        if (sos) const Padding(padding: EdgeInsets.only(left: 6), child: Text('🆘')),
        if (m.isAdmin) Padding(padding: const EdgeInsets.only(left: 6), child: Icon(Icons.shield_rounded, size: 14, color: violet.withValues(alpha: 0.7))),
      ]),
      subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(statusLine(m, c), maxLines: 1, overflow: TextOverflow.ellipsis),
        if (m.eta != null)
          Text('🧭 Unterwegs nach ${m.eta!.name}${m.eta!.minutes != null ? ' · an ca. ${hm(DateTime.fromMillisecondsSinceEpoch(m.eta!.started).add(Duration(minutes: m.eta!.minutes!)))}' : ''}',
              style: const TextStyle(color: magenta, fontWeight: FontWeight.w600, fontSize: 12)),
      ]),
      trailing: BatteryChip(m.last),
      onTap: () => focusMember(m),
    );
  }

  Widget _action(String emoji, String label, VoidCallback onTap, {bool danger = false}) {
    return Material(
      color: Colors.transparent,
      child: Ink(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          gradient: danger
              ? const LinearGradient(colors: [Color(0xFFFF3B5C), coral])
              : LinearGradient(colors: [violet.withValues(alpha: 0.14), magenta.withValues(alpha: 0.10)]),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Column(children: [
              Text(emoji, style: const TextStyle(fontSize: 22)),
              const SizedBox(height: 2),
              Text(label, style: TextStyle(fontWeight: FontWeight.w800, color: danger ? Colors.white : null)),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _glass({required Widget child}) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: (dark ? const Color(0xFF0F1A3D) : Colors.white).withValues(alpha: 0.92),
      borderRadius: BorderRadius.circular(24),
      elevation: 4,
      shadowColor: Colors.black38,
      child: child,
    );
  }

  Widget _roundBtn(IconData icon, VoidCallback onTap, {int badge = 0}) {
    return Badge(
      isLabelVisible: badge > 0,
      label: Text('$badge'),
      child: _glass(
        child: InkWell(
          borderRadius: BorderRadius.circular(24),
          onTap: onTap,
          child: Padding(padding: const EdgeInsets.all(11), child: Icon(icon, size: 22)),
        ),
      ),
    );
  }

  Widget _banner(String text, IconData icon, Color color, {VoidCallback? onTap}) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Material(
        color: color,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(children: [
              Icon(icon, color: Colors.white),
              const SizedBox(width: 10),
              Expanded(child: Text(text, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
            ]),
          ),
        ),
      ),
    );
  }

  void _open(Widget w) => Navigator.push(context, MaterialPageRoute(builder: (_) => w));

  void _styles(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Kartenstil', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          for (final s in const [('auto', 'Automatisch (hell/dunkel)', Icons.brightness_auto_rounded), ('light', 'Hell', Icons.light_mode_rounded),
            ('dark', 'Nacht', Icons.dark_mode_rounded), ('satellite', 'Satellit', Icons.satellite_alt_rounded)])
            ListTile(
              leading: Icon(s.$3),
              title: Text(s.$2),
              trailing: store.mapStyle == s.$1 ? const Icon(Icons.check_rounded, color: violet) : null,
              onTap: () {
                store.setMapStyle(s.$1);
                Navigator.pop(ctx);
              },
            ),
        ]),
      ),
    );
  }

  void _circlePicker(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Deine Kreise', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          const SizedBox(height: 6),
          for (final c in store.circles)
            ListTile(
              leading: SizedBox(
                width: 56,
                height: 32,
                child: Stack(children: [
                  for (var i = 0; i < c.members.length && i < 3; i++) Positioned(left: i * 12.0, child: Avatar(c.members[i], size: 32, ring: false)),
                ]),
              ),
              title: Text(c.name, style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text('${c.members.length} ${c.members.length == 1 ? 'Person' : 'Personen'}'),
              trailing: c.id == store.circle?.id ? const Icon(Icons.check_circle_rounded, color: violet) : null,
              onTap: () {
                store.selectCircle(c.id);
                Navigator.pop(ctx);
                _fitted = false;
                _changed();
              },
            ),
          ListTile(
            leading: const Icon(Icons.add_circle_outline_rounded),
            title: const Text('Neuen Kreis gründen oder beitreten'),
            onTap: () {
              Navigator.pop(ctx);
              Navigator.push(context, MaterialPageRoute(builder: (_) => const AddCircleScreen()));
            },
          ),
        ]),
      ),
    );
  }
}

/// „Unterwegs teilen“: Ziel wählen, Ankunftszeit wird geschätzt und geteilt
Future<void> showEtaSheet(BuildContext context) async {
  final me = store.circle?.member(store.api.memberId ?? '');
  if (me?.eta != null) {
    final stop = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Unterwegs beenden?'),
        content: Text('Du teilst gerade deinen Weg nach ${me!.eta!.name}.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Weiter teilen')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Beenden')),
        ],
      ),
    );
    if (stop == true && context.mounted) await guard(context, () => store.setEta(null));
    return;
  }
  if (!context.mounted) return;
  final dest = await showModalBottomSheet<(String, LatLng)>(
    context: context,
    isScrollControlled: true,
    builder: (ctx) => const _DestPicker(),
  );
  if (dest == null || !context.mounted) return;
  final p = Tracker.i.lastPos;
  final mins = p == null ? null : await driveMinutes(LatLng(p.latitude, p.longitude), dest.$2);
  if (!context.mounted) return;
  await guard(context, () => store.setEta({'name': dest.$1, 'lat': dest.$2.latitude, 'lng': dest.$2.longitude}, minutes: mins));
  if (context.mounted) {
    toast(context, mins == null ? 'Dein Kreis sieht jetzt, wohin du unterwegs bist.' : 'Geteilt: Ankunft ca. ${hm(DateTime.now().add(Duration(minutes: mins)))} 🧭');
  }
}

class _DestPicker extends StatefulWidget {
  const _DestPicker();
  @override
  State<_DestPicker> createState() => _DestPickerState();
}

class _DestPickerState extends State<_DestPicker> {
  final q = TextEditingController();
  List<SearchHit> hits = [];
  Timer? _deb;

  void _search(String s) {
    _deb?.cancel();
    _deb = Timer(const Duration(milliseconds: 600), () async {
      final p = Tracker.i.lastPos;
      try {
        final r = await searchPlaces(s, near: p == null ? null : LatLng(p.latitude, p.longitude));
        if (mounted) setState(() => hits = r);
      } catch (_) {}
    });
  }

  @override
  Widget build(BuildContext context) {
    final c = store.circle;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.7,
        child: Column(children: [
          const Text('Wohin bist du unterwegs?', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
          Padding(
            padding: const EdgeInsets.all(14),
            child: TextField(
              controller: q,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Adresse oder Ort suchen'),
              onChanged: _search,
            ),
          ),
          Expanded(
            child: ListView(children: [
              for (final h in hits)
                ListTile(leading: const Icon(Icons.place_rounded), title: Text(h.name), subtitle: Text(h.detail), onTap: () => Navigator.pop(context, (h.name, h.pos))),
              if (hits.isEmpty && c != null) ...[
                for (final p in c.places)
                  ListTile(leading: Text(p.icon, style: const TextStyle(fontSize: 24)), title: Text(p.name), onTap: () => Navigator.pop(context, (p.name, p.pos))),
                for (final m in c.members)
                  if (m.id != store.api.memberId && m.last?.pos != null && !m.paused)
                    ListTile(leading: Avatar(m, size: 36), title: Text('Zu ${m.name}'), onTap: () => Navigator.pop(context, (m.name, m.last!.pos!))),
              ],
            ]),
          ),
        ]),
      ),
    );
  }
}
