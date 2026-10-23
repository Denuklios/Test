import 'dart:io';

import 'package:flutter/foundation.dart';

import 'core/api.dart';
import 'core/models.dart';
import 'core/schedule.dart';
import 'core/storage.dart';
import 'services/home_widget.dart';
import 'services/notifications.dart';
import 'services/sync.dart';

enum Phase { loading, login, ready }

typedef Changes = Map<String, Map<String, PlanCell?>>;

class AppModel extends ChangeNotifier {
  late LocalStore store;
  Settings settings = Settings();
  Phase phase = Phase.loading;

  DienstState? _server; // letzter Stand vom Server bzw. Cache
  DateTime? lastSync;
  bool offline = false;
  bool syncing = false;
  String? syncError;
  String? loginMessage;
  List<ShiftChange> recentChanges = const [];

  String? _token;
  Uri? _base;
  String? _loginPw; // nur im Arbeitsspeicher, für den erzwungenen Passwortwechsel direkt nach dem Login

  Changes _pending = {};
  bool _flushing = false;

  DienstState? get state => _server == null ? null : _withPending(_server!);
  bool get hasPending => _pending.isNotEmpty;
  int get pendingCount => _pending.values.fold(0, (a, b) => a + b.length);
  String get server => store.server ?? defaultServer;
  String get lastUser => store.lastUser;
  bool get hasLoginPassword => _loginPw != null;

  ApiClient get _api => ApiClient(_base!, token: _token);

  Future<void> init() async {
    store = await LocalStore.open();
    settings = store.settings;
    _token = await SecureStore.token();
    final srv = store.server;
    if (_token == null || srv == null) {
      phase = Phase.login;
      notifyListeners();
      return;
    }
    try {
      _base = normalizeServer(srv);
    } catch (_) {
      phase = Phase.login;
      notifyListeners();
      return;
    }
    final c = store.cache;
    if (c != null) {
      _server = c.$1;
      lastSync = c.$2;
    }
    _pending = store.pending;
    phase = Phase.ready;
    notifyListeners();
    await BackgroundSync.configure(settings.backgroundSync && !(state?.me.isAdmin ?? false));
    await refresh();
  }

  DienstState _withPending(DienstState s) {
    if (_pending.isEmpty) return s;
    final plan = {for (final d in s.plan.entries) d.key: Map<String, PlanCell>.from(d.value)};
    _pending.forEach((day, cells) {
      cells.forEach((emp, c) {
        if (c == null) {
          plan[day]?.remove(emp);
          if (plan[day]?.isEmpty ?? false) plan.remove(day);
        } else {
          (plan[day] ??= {})[emp] = c;
        }
      });
    });
    return s.copyWith(plan: plan);
  }

  /// Abgleich beim Öffnen, per Pull-to-Refresh und beim Zurückkehren in die App.
  Future<void> refresh() async {
    if (phase != Phase.ready || _base == null || syncing) return;
    syncing = true;
    notifyListeners();
    try {
      await store.p.reload();
      if (_pending.isNotEmpty) await _flush(silent: true);
      final r = await syncWith(_api, store);
      _server = r.state;
      lastSync = DateTime.now();
      offline = false;
      syncError = null;
      if (r.changes.isNotEmpty && !r.state.me.isAdmin) recentChanges = r.changes;
    } on ApiException catch (e) {
      if (e.unauthorized) {
        await _localLogout('Deine Anmeldung ist abgelaufen. Bitte neu anmelden.');
        return;
      }
      offline = e.network;
      syncError = e.message;
    } finally {
      syncing = false;
      notifyListeners();
    }
  }

  void dismissChanges() {
    recentChanges = const [];
    notifyListeners();
  }

  Future<void> login(String serverInput, String user, String pw) async {
    final base = normalizeServer(serverInput);
    final device = await SecureStore.deviceId();
    final label = Platform.isIOS ? 'iPhone' : 'Android';
    final r = await ApiClient(base).login(user.trim(), pw, device, label);
    _token = r.token;
    _base = base;
    await SecureStore.setToken(r.token);
    await store.setServer(base.toString());
    await store.setLastUser(user.trim());
    await store.clearAccountData();
    _pending = {};
    _server = r.state;
    lastSync = DateTime.now();
    offline = false;
    syncError = null;
    loginMessage = null;
    recentChanges = const [];
    _loginPw = r.state.me.mustChange ? pw : null;
    phase = Phase.ready;
    notifyListeners();
    await store.setCache(r.state, DateTime.now());
    if (!r.state.me.isAdmin) await Notifier.requestPermission();
    await afterStateChange(r.state, settings);
    await BackgroundSync.configure(settings.backgroundSync && !r.state.me.isAdmin);
  }

  Future<void> changePassword(String? old, String pw) async {
    final st = await _api.changePassword(old ?? _loginPw ?? '', pw);
    _loginPw = null;
    _server = st;
    await store.setCache(st, DateTime.now());
    notifyListeners();
  }

  Future<void> logout() async {
    try {
      await _api.logout();
    } catch (_) {
      // Auch offline abmelden: das Token wird lokal gelöscht und läuft auf dem Server ab.
    }
    await _localLogout(null);
  }

  Future<void> _localLogout(String? message) async {
    _token = null;
    _server = null;
    _pending = {};
    _loginPw = null;
    recentChanges = const [];
    await SecureStore.setToken(null);
    await store.clearAccountData();
    await Notifier.cancelAll();
    await DienstWidget.update(null);
    await BackgroundSync.configure(false);
    loginMessage = message;
    phase = Phase.login;
    notifyListeners();
  }

  Future<void> updateSettings(Settings s) async {
    settings = s;
    await store.setSettings(s);
    notifyListeners();
    final st = state;
    if (st != null) {
      if (!st.me.isAdmin && (s.remindBefore || s.remindEvening)) await Notifier.requestPermission();
      await afterStateChange(st, s);
      await BackgroundSync.configure(s.backgroundSync && !st.me.isAdmin);
    }
  }

  // ---------- Admin ----------

  /// Setzt Einträge sofort lokal und sendet sie an den Server.
  /// Ohne Netz bleiben sie gespeichert und werden später nachgesendet.
  Future<String?> setCells(Changes changes) async {
    changes.forEach((day, cells) {
      final m = _pending[day] ??= {};
      m.addAll(cells);
    });
    await store.setPending(_pending);
    notifyListeners();
    return _flush();
  }

  /// Gibt eine Fehlermeldung zurück oder null bei Erfolg.
  Future<String?> _flush({bool silent = false}) async {
    if (_flushing || _pending.isEmpty) return null;
    _flushing = true;
    try {
      while (_pending.isNotEmpty) {
        final days = _pending.keys.take(40).toList();
        final chunk = {for (final d in days) d: _pending[d]!};
        try {
          final st = await _api.savePlan(chunk);
          for (final d in days) {
            final sent = chunk[d]!;
            final now = _pending[d];
            // Nur entfernen, was unverändert gesendet wurde (neuere Taps bleiben stehen)
            if (now != null) {
              sent.forEach((emp, c) {
                if (now.containsKey(emp) && now[emp] == c) now.remove(emp);
              });
              if (now.isEmpty) _pending.remove(d);
            }
          }
          _server = st;
          lastSync = DateTime.now();
          offline = false;
          await store.setCache(st, DateTime.now());
        } on ApiException catch (e) {
          if (e.unauthorized) {
            await store.setPending(_pending);
            await _localLogout('Deine Anmeldung ist abgelaufen. Bitte neu anmelden. Deine Änderungen wurden nicht gespeichert.');
            return e.message;
          }
          if (e.network) {
            offline = true;
            await store.setPending(_pending);
            return 'Keine Verbindung. Die Änderung ist auf dem Gerät gespeichert und wird automatisch nachgesendet.';
          }
          // Vom Server abgelehnt (z. B. Dienst gelöscht): verwerfen, damit nichts hängen bleibt
          for (final d in days) {
            _pending.remove(d);
          }
          await store.setPending(_pending);
          return 'Nicht gespeichert: ${e.message}';
        }
      }
      await store.setPending(_pending);
      return null;
    } finally {
      _flushing = false;
      notifyListeners();
    }
  }

  Future<String?> retryPending() => _flush();

  Future<void> _adminCall(Future<DienstState> Function(ApiClient api) f) async {
    final st = await f(_api);
    _server = st;
    lastSync = DateTime.now();
    offline = false;
    await store.setCache(st, DateTime.now());
    notifyListeners();
  }

  Future<void> addEmp(String name) => _adminCall((a) => a.addEmp(name));
  Future<void> renameEmp(String id, String name) => _adminCall((a) => a.renameEmp(id, name));
  Future<void> resetEmp(String id) => _adminCall((a) => a.resetEmp(id));
  Future<void> deleteEmp(String id) => _adminCall((a) => a.deleteEmp(id));
  Future<void> saveTemplates(List<ShiftTemplate> list) => _adminCall((a) => a.saveTemplates(list));

  /// Start-Passwörter kommen nur frisch vom Server (nie aus dem Cache).
  Employee? empWithSecrets(String id) {
    for (final e in _server?.emps ?? const <Employee>[]) {
      if (e.id == id) return e;
    }
    return null;
  }
}
