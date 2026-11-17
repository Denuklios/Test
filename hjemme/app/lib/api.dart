import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const defaultServer = 'https://www.wunsch-fabrik.dk/hjemme/api.php';
const userAgent = 'Hjemme-Familienapp/1.0';

class ApiError implements Exception {
  final String message;
  final int status;
  ApiError(this.message, [this.status = 0]);
  @override
  String toString() => message;
}

/// Zugang zum Hjemme-Server. Zugangsdaten liegen in SharedPreferences,
/// damit auch der Hintergrund-Dienst (eigener Isolate) sie lesen kann.
class Api {
  String server;
  String? memberId, token;
  Api({this.server = defaultServer, this.memberId, this.token});

  static Future<Api> load() async {
    final p = await SharedPreferences.getInstance();
    await p.reload();
    return Api(
      server: p.getString('server') ?? defaultServer,
      memberId: p.getString('memberId'),
      token: p.getString('token'),
    );
  }

  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    await p.setString('server', server);
    if (memberId != null) await p.setString('memberId', memberId!);
    if (token != null) await p.setString('token', token!);
  }

  bool get loggedIn => memberId != null && token != null;

  Uri url(String a, [Map<String, String>? qs]) {
    final u = Uri.parse(server);
    return u.replace(queryParameters: {'a': a, ...?qs});
  }

  Map<String, String> get headers => {
        'Content-Type': 'application/json',
        'User-Agent': userAgent,
        if (memberId != null) 'X-Member': memberId!,
        if (token != null) 'X-Token': token!,
      };

  Future<Map<String, dynamic>> _handle(http.Response r) async {
    Map<String, dynamic> j;
    try {
      j = jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      throw ApiError(r.statusCode == 404
          ? 'Hjemme ist auf dem Server noch nicht eingerichtet (404). Bitte Server-Adresse in den Einstellungen prüfen.'
          : 'Server antwortet nicht richtig (${r.statusCode})', r.statusCode);
    }
    if (j['ok'] != true) throw ApiError((j['error'] ?? 'Fehler ${r.statusCode}').toString(), r.statusCode);
    return j;
  }

  Future<Map<String, dynamic>> get(String a, [Map<String, String>? qs]) async =>
      _handle(await http.get(url(a, qs), headers: headers).timeout(const Duration(seconds: 25)));

  Future<Map<String, dynamic>> post(String a, Map<String, dynamic> body) async =>
      _handle(await http.post(url(a), headers: headers, body: jsonEncode(body)).timeout(const Duration(seconds: 30)));

  String avatarUrl(String name) => url('avatar', {'name': name}).toString();
}
