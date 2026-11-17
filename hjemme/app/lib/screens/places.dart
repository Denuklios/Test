import 'dart:async';

import 'package:material_ui/material_ui.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../geo.dart';
import '../models.dart';
import '../store.dart';
import '../tracker.dart';
import '../ui.dart';

class PlacesScreen extends StatelessWidget {
  const PlacesScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final c = store.circle;
        return Scaffold(
          appBar: AppBar(title: const Text('Orte')),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () {
              final p = Tracker.i.lastPos;
              editPlace(context, Place(id: '', name: '', lat: p?.latitude ?? 51.1657, lng: p?.longitude ?? 10.4515));
            },
            icon: const Icon(Icons.add_location_alt_rounded),
            label: const Text('Ort hinzufügen'),
          ),
          body: c == null || c.places.isEmpty
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(32),
                    child: Text('Noch keine Orte.\n\nLege Zuhause, Schule, Arbeit oder Oma an. Hjemme meldet dann automatisch, '
                        'wenn jemand ankommt oder losgeht.', textAlign: TextAlign.center),
                  ),
                )
              : ListView(padding: const EdgeInsets.only(bottom: 90), children: [
                  for (final p in c.places)
                    ListTile(
                      leading: CircleAvatar(backgroundColor: violet.withValues(alpha: 0.15), child: Text(p.icon, style: const TextStyle(fontSize: 20))),
                      title: Text(p.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                      subtitle: Text([
                        'Umkreis ${p.radius.round()} m',
                        ...c.members.where((m) => m.place == p.id).map((m) => '${m.name} ist da'),
                      ].join(' · ')),
                      trailing: const Icon(Icons.chevron_right_rounded),
                      onTap: () => editPlace(context, p),
                    ),
                ]),
        );
      },
    );
  }
}

Future<void> editPlace(BuildContext context, Place p) => Navigator.push(context, MaterialPageRoute(builder: (_) => _PlaceEditor(p)));

class _PlaceEditor extends StatefulWidget {
  final Place place;
  const _PlaceEditor(this.place);
  @override
  State<_PlaceEditor> createState() => _PlaceEditorState();
}

class _PlaceEditorState extends State<_PlaceEditor> {
  final map = MapController();
  late final name = TextEditingController(text: widget.place.name);
  late LatLng pos = widget.place.pos;
  late double radius = widget.place.radius;
  late String icon = widget.place.icon;
  List<SearchHit> hits = [];
  Timer? _deb;
  bool busy = false;

  bool get isNew => widget.place.id.isEmpty;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(
        title: Text(isNew ? 'Neuer Ort' : widget.place.name),
        actions: [
          if (!isNew)
            IconButton(
              icon: const Icon(Icons.delete_outline_rounded),
              onPressed: () async {
                final ok = await showDialog<bool>(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: Text('„${widget.place.name}“ löschen?'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Abbrechen')),
                      FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Löschen')),
                    ],
                  ),
                );
                if (ok == true && context.mounted) {
                  await guard(context, () => store.deletePlace(widget.place));
                  if (context.mounted) Navigator.pop(context);
                }
              },
            ),
        ],
      ),
      body: Column(children: [
        Expanded(
          child: Stack(children: [
            FlutterMap(
              mapController: map,
              options: MapOptions(
                initialCenter: pos,
                initialZoom: 16,
                onTap: (_, p) => setState(() => pos = p),
                interactionOptions: const InteractionOptions(flags: InteractiveFlag.all & ~InteractiveFlag.rotate),
              ),
              children: [
                TileLayer(urlTemplate: tileUrl(store.mapStyle, dark), subdomains: const ['a', 'b', 'c', 'd'], retinaMode: true, userAgentPackageName: 'de.familie.hjemme'),
                CircleLayer(circles: [
                  CircleMarker(point: pos, radius: radius, useRadiusInMeter: true, color: magenta.withValues(alpha: 0.18), borderColor: magenta, borderStrokeWidth: 2.5),
                ]),
                MarkerLayer(markers: [Marker(point: pos, width: 40, height: 40, child: Center(child: Text(icon, style: const TextStyle(fontSize: 30))))]),
              ],
            ),
            Positioned(
              top: 10,
              left: 10,
              right: 10,
              child: Column(children: [
                Material(
                  elevation: 4,
                  borderRadius: BorderRadius.circular(14),
                  child: TextField(
                    decoration: const InputDecoration(prefixIcon: Icon(Icons.search_rounded), hintText: 'Adresse suchen …'),
                    onChanged: (s) {
                      _deb?.cancel();
                      _deb = Timer(const Duration(milliseconds: 600), () async {
                        try {
                          final r = await searchPlaces(s, near: pos);
                          if (mounted) setState(() => hits = r);
                        } catch (_) {}
                      });
                    },
                  ),
                ),
                if (hits.isNotEmpty)
                  Material(
                    elevation: 4,
                    borderRadius: BorderRadius.circular(14),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 240),
                      child: ListView(shrinkWrap: true, children: [
                        for (final h in hits)
                          ListTile(
                            dense: true,
                            title: Text(h.name),
                            subtitle: Text(h.detail, maxLines: 1, overflow: TextOverflow.ellipsis),
                            onTap: () {
                              setState(() {
                                pos = h.pos;
                                hits = [];
                                if (name.text.isEmpty) name.text = h.name;
                              });
                              map.move(h.pos, 16);
                              FocusScope.of(context).unfocus();
                            },
                          ),
                      ]),
                    ),
                  ),
              ]),
            ),
            Positioned(
              right: 12,
              bottom: 12,
              child: FloatingActionButton.small(
                heroTag: 'here',
                onPressed: () {
                  final p = Tracker.i.lastPos;
                  if (p == null) return;
                  setState(() => pos = LatLng(p.latitude, p.longitude));
                  map.move(pos, 16);
                },
                child: const Icon(Icons.my_location_rounded),
              ),
            ),
          ]),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              TextField(controller: name, textCapitalization: TextCapitalization.sentences, decoration: const InputDecoration(labelText: 'Name, z. B. Zuhause')),
              const SizedBox(height: 10),
              SizedBox(
                height: 44,
                child: ListView(scrollDirection: Axis.horizontal, children: [
                  for (final i in placeIcons)
                    Padding(
                      padding: const EdgeInsets.only(right: 6),
                      child: ChoiceChip(label: Text(i, style: const TextStyle(fontSize: 18)), selected: icon == i, onSelected: (_) => setState(() => icon = i)),
                    ),
                ]),
              ),
              Row(children: [
                const Text('Umkreis'),
                Expanded(
                  child: Slider(value: radius, min: 50, max: 1000, divisions: 19, label: '${radius.round()} m', onChanged: (v) => setState(() => radius = v)),
                ),
                SizedBox(width: 60, child: Text('${radius.round()} m', style: const TextStyle(fontWeight: FontWeight.w800))),
              ]),
              const Text('Tippe auf die Karte, um den Ort zu verschieben.', style: TextStyle(fontSize: 12)),
              const SizedBox(height: 10),
              GradientButton(isNew ? 'Ort speichern' : 'Änderungen speichern', icon: Icons.check_rounded, onTap: busy || name.text.trim().isEmpty && false ? null : _save),
            ]),
          ),
        ),
      ]),
    );
  }

  Future<void> _save() async {
    if (name.text.trim().isEmpty) {
      toast(context, 'Bitte einen Namen eingeben');
      return;
    }
    setState(() => busy = true);
    final ok = await guard(context, () async {
      await store.savePlace(Place(id: widget.place.id, name: name.text.trim(), icon: icon, lat: pos.latitude, lng: pos.longitude, radius: radius));
      return true;
    });
    if (!mounted) return;
    setState(() => busy = false);
    if (ok == true) {
      toast(context, 'Gespeichert – ihr bekommt Bescheid bei Ankunft und Abfahrt.');
      Navigator.pop(context);
    }
  }
}
