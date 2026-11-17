import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'api.dart';
import 'events.dart';
import 'models.dart';
import 'tracker.dart';

/// Zentraler Zustand der App: Kreise, Mitglieder, Orte, Ereignisse.
class Store extends ChangeNotifier with WidgetsBindingObserver {
  Api api = Api();
  Member? me;
  List<Circle> circles = [];
  int? selectedCircleId;
  final List<Ev> events = [];
  int cursor = 0;
  String? error;
  bool online = true;
  bool visible = true;
  int? openChat; // gerade geöffneter Chat (keine Benachrichtigung dafür)
  Map<int, int> chatRead = {};
  String mapStyle = 'auto';
  Timer? _timer;
  bool _polling = false;
  SharedPreferences? _prefs;

  Circle? get circle =>
      circles.where((c) => c.id == selectedCircleId).firstOrNull ?? (circles.isEmpty ? null : circles.first);

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    api = await Api.load();
    selectedCircleId = _prefs!.getInt('circle');
    cursor = _prefs!.getInt('cursor') ?? 0;
    mapStyle = _prefs!.getString('mapStyle') ?? 'auto';
    chatRead = (jsonDecode(_prefs!.getString('chatRead') ?? '{}') as Map).map((k, v) => MapEntry(int.parse(k), (v as num).toInt()));
    _loadEvents();
    final cached = _prefs!.getString('circlesCache');
    if (cached != null) {
      try {
        circles = [for (final c in jsonDecode(cached) as List) Circle.fromJson(Map<String, dynamic>.from(c))];
      } catch (_) {}
    }
    WidgetsBinding.instance.addObserver(this);
  }

  void _loadEvents() {
    final s = _prefs!.getString('events');
    events.clear();
    if (s != null) {
      try {
        events.addAll([for (final e in jsonDecode(s) as List) Ev.fromJson(Map<String, dynamic>.from(e))]);
      } catch (_) {}
    }
    final ids = <int>{};
    events.retainWhere((e) => ids.add(e.id));
    events.sort((a, b) => a.id.compareTo(b.id));
  }

  Future<void> _saveEvents() async {
    final list = events.length > 600 ? events.sublist(events.length - 600) : events;
    await _prefs!.setString('events', jsonEncode(list.map((e) => e.toJson()).toList()));
  }

  void startPolling() {
    _timer?.cancel();
    _timer = Timer.periodic(Duration(seconds: visible ? 8 : 45), (_) => poll());
    poll();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final v = state == AppLifecycleState.resumed;
    if (v == visible) return;
    visible = v;
    if (api.loggedIn) {
      if (v) {
        // Neuigkeiten aus dem Hintergrund-Abgleich übernehmen
        _prefs?.reload().then((_) {
          _loadEvents();
          notifyListeners();
        });
        Tracker.i.sendNow();
      }
      startPolling();
    }
  }

  Future<void> poll() async {
    if (_polling || !api.loggedIn) return;
    _polling = true;
    try {
      await _prefs!.reload();
      cursor = _prefs!.getInt('cursor') ?? cursor;
      final j = await api.get('poll', {'since': '$cursor'});
      me = Member.fromJson(Map<String, dynamic>.from(j['me']));
      circles = [for (final c in j['circles'] as List) Circle.fromJson(Map<String, dynamic>.from(c))];
      await _prefs!.setString('circlesCache', jsonEncode(j['circles']));
      final newEvents = [for (final e in j['events'] as List) Ev.fromJson(Map<String, dynamic>.from(e))];
      final firstLoad = cursor == 0;
      final known = events.map((e) => e.id).toSet();
      events.addAll(newEvents.where((e) => !known.contains(e.id)));
      events.sort((a, b) => a.id.compareTo(b.id));
      cursor = (j['cursor'] as num).toInt();
      await _prefs!.setInt('cursor', cursor);
      if (firstLoad) {
        await _prefs!.setInt('notifiedUpTo', cursor);
      } else {
        final cmds = await notifyNew(newEvents, circles, api.memberId!, appVisible: visible, openChatCircle: openChat);
        await runCommands(cmds);
        for (final e in newEvents) {
          if (e.type == 'removed' && e.target == api.memberId) selectedCircleId = null;
        }
      }
      if (newEvents.isNotEmpty) await _saveEvents();
      online = true;
      error = null;
    } on ApiError catch (e) {
      error = e.message;
      if (e.status == 401) online = false;
    } catch (_) {
      online = false;
    } finally {
      _polling = false;
      notifyListeners();
    }
  }

  void selectCircle(int id) {
    selectedCircleId = id;
    _prefs?.setInt('circle', id);
    notifyListeners();
  }

  Future<void> setMapStyle(String s) async {
    mapStyle = s;
    await _prefs?.setString('mapStyle', s);
    notifyListeners();
  }

  // ---------- Konto & Kreise ----------

  Future<void> register(String name, int color, String emoji) async {
    final j = await api.post('register', {'name': name, 'color': color, 'emoji': emoji});
    api.memberId = j['id'];
    api.token = j['token'];
    await api.save();
  }

  Future<Circle> createCircle(String name) async {
    final j = await api.post('create_circle', {'name': name});
    final c = Circle.fromJson(Map<String, dynamic>.from(j['circle']));
    selectCircle(c.id);
    await poll();
    return c;
  }

  Future<Circle> join(String code) async {
    final j = await api.post('join', {'code': code});
    final c = Circle.fromJson(Map<String, dynamic>.from(j['circle']));
    selectCircle(c.id);
    await poll();
    return c;
  }

  Future<void> leave(int circleId) async {
    await api.post('leave', {'circle': circleId});
    if (selectedCircleId == circleId) selectedCircleId = null;
    await poll();
  }

  Future<void> send(String type, {int? circle, String? text, String? target, String? emoji, double? lat, double? lng, String? place}) async {
    await api.post('send', {
      'type': type,
      'circle': circle ?? this.circle?.id,
      if (text != null) 'text': text,
      if (target != null) 'target': target,
      if (emoji != null) 'emoji': emoji,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      if (place != null) 'place': place,
    });
    await poll();
  }

  Future<void> savePlace(Place p) async {
    await api.post('place_save', {'circle': circle!.id, 'place': p.toJson()});
    await poll();
  }

  Future<void> deletePlace(Place p) async {
    await api.post('place_delete', {'circle': circle!.id, 'id': p.id});
    await poll();
  }

  Future<void> share({int? circle, bool? share, bool? paused, int? bubbleUntil}) async {
    await api.post('share', {
      if (circle != null) 'circle': circle,
      if (share != null) 'share': share,
      if (paused != null) 'paused': paused,
      if (bubbleUntil != null) 'bubbleUntil': bubbleUntil,
    });
    await poll();
  }

  Future<void> profile({String? name, int? color, String? emoji, String? phone}) async {
    await api.post('profile', {
      if (name != null) 'name': name,
      if (color != null) 'color': color,
      if (emoji != null) 'emoji': emoji,
      if (phone != null) 'phone': phone,
    });
    await poll();
  }

  Future<void> uploadAvatar(List<int> jpeg) async {
    await api.post('avatar_upload', {'jpeg': base64Encode(jpeg)});
    await poll();
  }

  Future<void> updateCircle({String? name, Map<String, dynamic>? settings, bool newCode = false}) async {
    await api.post('circle_update', {'circle': circle!.id, if (name != null) 'name': name, if (settings != null) 'settings': settings, if (newCode) 'newCode': true});
    await poll();
  }

  Future<void> setEta(Map<String, dynamic>? dest, {int? minutes}) async {
    await api.post('eta', {'dest': dest, 'circle': circle?.id, 'minutes': minutes});
    await poll();
  }

  Future<List<List>> history(String memberId, DateTime from, DateTime to) async {
    final j = await api.get('history', {
      'member': memberId,
      'from': '${from.millisecondsSinceEpoch}',
      'to': '${to.millisecondsSinceEpoch}',
    });
    return [for (final r in j['points'] as List) r as List];
  }

  // ---------- Chat ----------

  List<Ev> chatOf(int circleId) =>
      events.where((e) => e.circle == circleId && const {'chat', 'checkin', 'sos', 'sos_ok', 'eta_arrived'}.contains(e.type)).toList();

  int unread(int circleId) {
    final read = chatRead[circleId] ?? 0;
    return events.where((e) => e.circle == circleId && e.type == 'chat' && e.id > read && e.member != api.memberId).length;
  }

  void markRead(int circleId) {
    final last = events.where((e) => e.circle == circleId).fold<int>(0, (m, e) => e.id > m ? e.id : m);
    chatRead[circleId] = last;
    _prefs?.setString('chatRead', jsonEncode(chatRead.map((k, v) => MapEntry('$k', v))));
    notifyListeners();
  }

  /// Offener SOS-Alarm eines Mitglieds (in den letzten 2 Stunden, nicht zurückgenommen)
  Ev? activeSos(String memberId) {
    Ev? last;
    for (final e in events) {
      if (e.member != memberId) continue;
      if (e.type == 'sos') last = e;
      if ((e.type == 'sos_cancel' || e.type == 'sos_ok') && last != null && e.id > last.id) last = null;
    }
    if (last == null || DateTime.now().difference(last.time).inHours >= 2) return null;
    return last;
  }

  Future<void> logout() async {
    await _prefs?.clear();
    api = Api();
    me = null;
    circles = [];
    events.clear();
    cursor = 0;
    await Tracker.i.stop();
    notifyListeners();
  }
}

final store = Store();
