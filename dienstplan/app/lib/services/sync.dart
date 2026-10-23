import 'dart:ui';

import 'package:flutter/widgets.dart';
import 'package:workmanager/workmanager.dart';

import '../core/api.dart';
import '../core/models.dart';
import '../core/schedule.dart';
import '../core/storage.dart';
import 'home_widget.dart';
import 'notifications.dart';

class SyncResult {
  final DienstState state;
  final List<ShiftChange> changes;

  const SyncResult(this.state, this.changes);
}

/// Holt den aktuellen Stand, vergleicht ihn mit dem Cache, speichert ihn
/// und plant Erinnerungen und Widget neu. Wird im Vordergrund und im Hintergrund benutzt.
Future<SyncResult> syncWith(ApiClient api, LocalStore store, {DienstState? fresh}) async {
  final before = store.cache?.$1;
  final st = fresh ?? await api.state();
  final changes = st.me.isAdmin ? const <ShiftChange>[] : diffOwnShifts(before, st, st.me.id, DateTime.now());
  await store.setCache(st, DateTime.now());
  await afterStateChange(st, store.settings);
  return SyncResult(st, changes);
}

Future<void> afterStateChange(DienstState st, Settings s) async {
  try {
    await Notifier.reschedule(st, s);
  } catch (_) {}
  await DienstWidget.update(st);
}

const _taskName = 'dienstplan-abgleich';

@pragma('vm:entry-point')
void backgroundDispatcher() {
  Workmanager().executeTask((task, input) async {
    WidgetsFlutterBinding.ensureInitialized();
    DartPluginRegistrant.ensureInitialized();
    try {
      final store = await LocalStore.open();
      await store.p.reload();
      final token = await SecureStore.token();
      final server = store.server;
      if (token == null || server == null) return true;
      final api = ApiClient(normalizeServer(server), token: token);
      final r = await syncWith(api, store);
      if (r.changes.isNotEmpty && store.settings.notifyChanges) await Notifier.showChanges(r.changes);
    } on ApiException catch (e) {
      if (e.unauthorized) {
        await SecureStore.setToken(null);
        await DienstWidget.update(null);
      }
      // Netzfehler: einfach beim nächsten Mal erneut versuchen
    } catch (_) {}
    return true;
  });
}

class BackgroundSync {
  static bool _init = false;

  static Future<void> configure(bool enabled) async {
    try {
      if (!_init) {
        await Workmanager().initialize(backgroundDispatcher);
        _init = true;
      }
      if (enabled) {
        await Workmanager().registerPeriodicTask(
          _taskName,
          _taskName,
          frequency: const Duration(hours: 2),
          constraints: Constraints(networkType: NetworkType.connected),
          existingWorkPolicy: ExistingPeriodicWorkPolicy.update,
        );
      } else {
        await Workmanager().cancelByUniqueName(_taskName);
      }
    } catch (_) {
      // Auf Plattformen ohne Hintergrundarbeit einfach weglassen
    }
  }
}
