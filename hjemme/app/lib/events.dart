import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'geo.dart';
import 'models.dart';
import 'notify.dart';

/// Texte und Symbole für Ereignisse – gemeinsam für App, Verlauf und Hintergrund
class EvText {
  final String icon, title, body;
  EvText(this.icon, this.title, this.body);
}

EvText describe(Ev e, String who, {String? targetName, String circleName = ''}) {
  final d = e.data;
  final place = '${d['icon'] ?? '📍'} ${d['name'] ?? 'Ort'}';
  switch (e.type) {
    case 'arrive':
      return EvText('📍', '$who ist angekommen', '$who ist bei $place angekommen.');
    case 'leave':
      final stay = d['stay'] is num ? ' (nach ${fmtDuration(Duration(milliseconds: (d['stay'] as num).toInt()))})' : '';
      return EvText('🚶', '$who ist losgegangen', '$who hat $place verlassen$stay.');
    case 'battery_low':
      return EvText('🪫', 'Akku fast leer', 'Der Akku von $who ist bei ${d['bat']} %.');
    case 'speeding':
      return EvText('⚠️', 'Zu schnell unterwegs', '$who fährt ${d['kmh']} km/h (Grenze ${(d['limit'] as num?)?.round()} km/h).');
    case 'sos':
      return EvText('🆘', 'SOS von $who!', '$who braucht Hilfe! Tippen, um den Standort zu sehen.${e.text.isEmpty ? '' : '\n„${e.text}“'}');
    case 'sos_cancel':
      return EvText('✅', 'SOS abgebrochen', '$who hat den Alarm zurückgenommen.');
    case 'sos_ok':
      return EvText('💚', '$who ist in Sicherheit', '$who hat sich nach dem SOS als „okay“ gemeldet.');
    case 'checkin':
      return EvText('✔️', '$who hat eingecheckt', '${d['place'] ?? 'Ort geteilt'}${e.text.isEmpty ? '' : ' – ${e.text}'}');
    case 'chat':
      return EvText('💬', who, e.text);
    case 'nudge':
      return EvText(d['emoji']?.toString() ?? '👋', '$who stupst dich an', '${d['emoji'] ?? '👋'} ${e.text.isEmpty ? 'Denk an dich!' : e.text}');
    case 'ring':
      return EvText('🔔', '$who sucht dein Handy', 'Tippen, um das Klingeln zu beenden.');
    case 'locate':
      return EvText('🛰️', '$who hat deinen Standort aktualisiert', 'Dein aktueller Standort wurde gesendet.');
    case 'eta_start':
      final m = d['minutes'] is num ? ' – Ankunft ca. ${hm(e.time.add(Duration(minutes: (d['minutes'] as num).toInt())))}' : '';
      return EvText('🧭', '$who ist unterwegs', '$who ist auf dem Weg nach ${d['name']}$m.');
    case 'eta_arrived':
      return EvText('🏁', '$who ist da', '$who ist sicher bei ${d['name']} angekommen.');
    case 'join':
      return EvText('🎉', 'Neu im Kreis', '$who ist ${circleName.isEmpty ? 'dem Kreis' : '„$circleName“'} beigetreten.');
    case 'left':
      return EvText('👋', '$who ist ausgetreten', '$who hat den Kreis verlassen.');
    case 'removed':
      return EvText('🚪', 'Aus dem Kreis entfernt', '${targetName ?? 'Jemand'} wurde von $who entfernt.');
    case 'paused':
      return EvText('⏸️', '$who pausiert', '$who teilt den Standort gerade nicht.');
    case 'resumed':
      return EvText('▶️', '$who teilt wieder', '$who teilt den Standort wieder.');
    case 'bubble':
      return EvText('🫧', '$who ist in der Blase', '$who zeigt bis ${hm(DateTime.fromMillisecondsSinceEpoch((d['until'] as num? ?? 0).toInt()))} nur einen ungefähren Ort.');
    case 'share_off':
      return EvText('🙈', '$who teilt nicht', '$who hat das Teilen in diesem Kreis ausgeschaltet.');
    case 'share_on':
      return EvText('👀', '$who teilt wieder', '$who teilt den Standort wieder in diesem Kreis.');
    case 'place_new':
      return EvText('🗺️', 'Neuer Ort', '$who hat $place angelegt.');
    case 'place_edit':
      return EvText('🗺️', 'Ort geändert', '$who hat $place geändert.');
    default:
      return EvText('•', e.type, '');
  }
}

/// Welche Ereignisse sollen eine Benachrichtigung auslösen? (Einstellungen)
const notifyKinds = {
  'places': 'Ankommen & Verlassen',
  'eta': 'Unterwegs & angekommen',
  'battery': 'Akku fast leer',
  'speed': 'Zu schnell gefahren',
  'chat': 'Chat-Nachrichten',
  'checkin': 'Check-ins & Anstupsen',
  'circle': 'Mitglieder & Orte',
};

String? kindOf(String type) => switch (type) {
      'arrive' || 'leave' => 'places',
      'eta_start' || 'eta_arrived' => 'eta',
      'battery_low' => 'battery',
      'speeding' => 'speed',
      'chat' => 'chat',
      'checkin' || 'nudge' => 'checkin',
      'join' || 'left' || 'place_new' => 'circle',
      'sos' || 'sos_cancel' || 'sos_ok' || 'ring' => 'always',
      _ => null,
    };

/// Neue Ereignisse als Benachrichtigung zeigen (doppelte vermeiden über gemeinsamen Zähler).
/// Gibt die Ereignisse zurück, die Befehle an dieses Gerät sind (ring/locate).
Future<List<Ev>> notifyNew(List<Ev> events, List<Circle> circles, String meId, {bool appVisible = false, int? openChatCircle}) async {
  final p = await SharedPreferences.getInstance();
  await p.reload();
  final seen = p.getInt('notifiedUpTo') ?? 0;
  final off = (p.getStringList('notifyOff') ?? []).toSet();
  final commands = <Ev>[];
  var maxId = seen;
  final now = DateTime.now().millisecondsSinceEpoch;
  for (final e in events) {
    if (e.id <= seen) continue;
    if (e.id > maxId) maxId = e.id;
    if (now - e.ts > 6 * 3600000) continue; // alte Ereignisse nicht nachträglich melden
    if (e.target != null && e.target != meId) continue;
    if (e.member == meId) continue;
    if (e.target == meId && (e.type == 'ring' || e.type == 'locate' || e.type == 'ring_stop')) commands.add(e);
    final kind = kindOf(e.type);
    if (kind == null || off.contains(kind)) continue;
    if (e.type == 'chat' && appVisible && openChatCircle == e.circle) continue;
    if (e.type == 'locate') continue;
    final c = circles.where((c) => c.id == e.circle).firstOrNull;
    final m = c?.member(e.member);
    final who = m?.name ?? 'Jemand';
    final t = describe(e, who, circleName: c?.name ?? '');
    final multi = circles.length > 1 && c != null ? ' · ${c.name}' : '';
    await Notify.show(
      e.type == 'ring' ? 900001 : e.id % 100000,
      '${t.icon} ${t.title}$multi',
      t.body,
      kind: e.type == 'sos' ? 'sos' : e.type == 'ring' ? 'ring' : (e.type == 'chat' ? 'chat' : 'alerts'),
      payload: jsonEncode({'type': e.type, 'circle': e.circle, 'member': e.member, 'id': e.id}),
      color: m?.color,
    );
  }
  if (maxId > seen) await p.setInt('notifiedUpTo', maxId);
  return commands;
}
