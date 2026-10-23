import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

import 'models.dart';

/// Vorgabe beim ersten Start. Beim Bauen änderbar mit
/// --dart-define=DEFAULT_SERVER=https://deine-domain.de/dienstplan/
const defaultServer = String.fromEnvironment('DEFAULT_SERVER', defaultValue: 'https://www.deine-domain.de/dienstplan/');

class ApiException implements Exception {
  final String message;
  final int? status;

  /// true, wenn der Server gar nicht erreicht wurde (offline, Zeitüberschreitung)
  final bool network;

  const ApiException(this.message, {this.status, this.network = false});

  bool get unauthorized => status == 401;

  @override
  String toString() => message;
}

/// Prüft und normalisiert die Server-Adresse. Nur HTTPS ist erlaubt.
Uri normalizeServer(String input) {
  var s = input.trim();
  if (s.isEmpty) throw const ApiException('Bitte die Server-Adresse eingeben.');
  if (s.toLowerCase().startsWith('http://')) {
    throw const ApiException('Aus Sicherheitsgründen ist nur HTTPS erlaubt (https://…).');
  }
  if (!s.toLowerCase().startsWith('https://')) s = 'https://$s';
  final u = Uri.tryParse(s);
  if (u == null || u.host.isEmpty || !u.host.contains('.')) {
    throw const ApiException('Die Server-Adresse ist ungültig.');
  }
  var path = u.path;
  if (path.isEmpty) path = '/';
  if (!path.endsWith('/') && !path.endsWith('.php')) path = '$path/';
  return Uri(scheme: 'https', host: u.host, port: u.hasPort ? u.port : null, path: path);
}

class LoginResult {
  final String token;
  final DienstState state;

  const LoginResult(this.token, this.state);
}

class ApiClient {
  final Uri base;
  final String? token;
  final http.Client _http;

  ApiClient(this.base, {this.token, http.Client? client}) : _http = client ?? http.Client();

  Uri _uri(String api, [Map<String, String>? q]) {
    assert(base.scheme == 'https');
    return base.replace(queryParameters: {'api': api, ...?q});
  }

  Map<String, String> get _headers => {
        'X-Requested-With': 'dienstplan',
        'Accept': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
        // Fallback, falls der Webserver den Authorization-Header verwirft
        'X-Dienstplan-Token': ?token,
      };

  Future<Map<String, dynamic>> _send(String api, {Object? body, Map<String, String>? query}) async {
    final uri = _uri(api, query);
    if (uri.scheme != 'https') throw const ApiException('Nur HTTPS ist erlaubt.');
    http.Response r;
    try {
      final f = body == null
          ? _http.get(uri, headers: _headers)
          : _http.post(uri, headers: {..._headers, 'Content-Type': 'application/json'}, body: jsonEncode(body));
      r = await f.timeout(const Duration(seconds: 20));
    } on TimeoutException {
      throw const ApiException('Der Server antwortet nicht. Bitte später erneut versuchen.', network: true);
    } on HandshakeException {
      throw const ApiException('Sichere Verbindung fehlgeschlagen. Ist das HTTPS-Zertifikat gültig?', network: true);
    } on SocketException {
      throw const ApiException('Keine Verbindung zum Server. Bist du online?', network: true);
    } on http.ClientException {
      throw const ApiException('Keine Verbindung zum Server. Bist du online?', network: true);
    }
    Map<String, dynamic>? j;
    try {
      final d = jsonDecode(utf8.decode(r.bodyBytes));
      if (d is Map) j = Map<String, dynamic>.from(d);
    } catch (_) {}
    if (r.statusCode >= 200 && r.statusCode < 300 && j != null && j['error'] == null) return j;
    if (j != null && j['error'] is String) throw ApiException(j['error'] as String, status: r.statusCode);
    if (r.statusCode == 404) throw ApiException('Dienstplan unter dieser Adresse nicht gefunden.', status: r.statusCode);
    if (r.statusCode >= 500) throw ApiException('Serverfehler (${r.statusCode}). Bitte später erneut versuchen.', status: r.statusCode);
    throw ApiException('Unerwartete Antwort vom Server. Stimmt die Adresse?', status: r.statusCode);
  }

  DienstState _state(Map<String, dynamic> j) {
    if (j['setup'] != null) {
      throw const ApiException('Der Dienstplan ist noch nicht eingerichtet. Bitte zuerst im Browser die Einrichtung abschließen.');
    }
    if (j['me'] is! Map) throw const ApiException('Unerwartete Antwort vom Server.');
    return DienstState.fromJson(j);
  }

  Future<LoginResult> login(String user, String pw, String device, String label) async {
    final j = await _send('apilogin', body: {'user': user, 'pw': pw, 'device': device, 'label': label});
    final t = j['token'];
    if (t is! String || j['state'] is! Map) {
      throw const ApiException('Der Server unterstützt die App noch nicht. Bitte das Backend (index.php) aktualisieren.');
    }
    return LoginResult(t, _state(Map<String, dynamic>.from(j['state'] as Map)));
  }

  Future<void> logout() async {
    await _send('logout', body: const {});
  }

  Future<DienstState> state() async => _state(await _send('state'));

  Future<DienstState> changePassword(String old, String pw) async =>
      _state(await _send('password', body: {'old': old, 'pw': pw}));

  /// changes: Tag -> Mitarbeiter -> Eintrag (null = leeren). Höchstens 40 Tage je Anfrage.
  Future<DienstState> savePlan(Map<String, Map<String, PlanCell?>> changes) async {
    final body = {
      for (final d in changes.entries) d.key: {for (final c in d.value.entries) c.key: c.value?.toJson()}
    };
    return _state(await _send('plan', body: {'changes': body}));
  }

  Future<DienstState> addEmp(String name) async => _state(await _send('emp', body: {'name': name}));

  Future<DienstState> renameEmp(String id, String name) async =>
      _state(await _send('emp/rename', body: {'id': id, 'name': name}));

  Future<DienstState> resetEmp(String id) async => _state(await _send('emp/reset', body: {'id': id}));

  Future<DienstState> deleteEmp(String id) async => _state(await _send('emp/delete', body: {'id': id}));

  Future<DienstState> saveTemplates(List<ShiftTemplate> list) async =>
      _state(await _send('templates', body: {'templates': [for (final t in list) t.toJson()]}));
}
