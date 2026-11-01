import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final String message;
  ApiException(this.message);
  @override
  String toString() => message;
}

class Api {
  final String baseUrl; // .../api.php
  final String code;
  Api(this.baseUrl, this.code);

  static String normalizeUrl(String input) {
    var u = input.trim();
    if (u.isEmpty) return u;
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://$u';
    if (u.endsWith('/')) u = u.substring(0, u.length - 1);
    if (!u.endsWith('.php')) u = '$u/api.php';
    return u;
  }

  Uri _u(String action, [Map<String, String>? q]) {
    final base = Uri.parse(baseUrl);
    return base.replace(queryParameters: {...base.queryParameters, 'a': action, ...?q});
  }

  Map<String, String> get _headers => {'Content-Type': 'application/json', 'X-Group-Key': code};

  Map<String, dynamic> _decode(http.Response r) {
    Map<String, dynamic> j;
    try {
      j = jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      throw ApiException('Server antwortet nicht richtig (HTTP ${r.statusCode}). Stimmt die Adresse?');
    }
    if (j['ok'] != true) throw ApiException((j['error'] ?? 'Fehler').toString());
    return j;
  }

  static Future<void> ping(String url) async {
    final r = await http.get(Uri.parse(url).replace(queryParameters: {'a': 'ping'})).timeout(const Duration(seconds: 15));
    final j = jsonDecode(utf8.decode(r.bodyBytes));
    if (j is! Map || j['app'] != 'familienkalender') throw ApiException('Unter dieser Adresse läuft kein Kalender-Server.');
  }

  static Future<String> createGroup(String url, String name) async {
    final r = await http
        .post(Uri.parse(url).replace(queryParameters: {'a': 'create_group'}),
            headers: {'Content-Type': 'application/json'}, body: jsonEncode({'name': name}))
        .timeout(const Duration(seconds: 15));
    final j = jsonDecode(utf8.decode(r.bodyBytes)) as Map<String, dynamic>;
    if (j['ok'] != true) throw ApiException((j['error'] ?? 'Fehler').toString());
    return j['code'] as String;
  }

  Future<String> groupName() async {
    final r = await http.get(_u('group'), headers: _headers).timeout(const Duration(seconds: 15));
    return (_decode(r)['name'] ?? '') as String;
  }

  Future<Map<String, dynamic>> sync(int since) async {
    final r = await http.get(_u('sync', {'since': '$since'}), headers: _headers).timeout(const Duration(seconds: 20));
    return _decode(r);
  }

  Future<int> save(String kind, Map<String, dynamic> item) async {
    final r = await http
        .post(_u('save'), headers: _headers, body: jsonEncode({'kind': kind, 'item': item}))
        .timeout(const Duration(seconds: 20));
    return (_decode(r)['updatedAt'] as num).toInt();
  }

  Future<String> uploadPhoto(File f) async {
    final req = http.MultipartRequest('POST', _u('photo_upload'));
    req.headers['X-Group-Key'] = code;
    req.files.add(await http.MultipartFile.fromPath('photo', f.path));
    final res = await http.Response.fromStream(await req.send().timeout(const Duration(seconds: 60)));
    return _decode(res)['name'] as String;
  }

  String photoUrl(String name) => _u('photo', {'name': name, 'k': code}).toString();
}
