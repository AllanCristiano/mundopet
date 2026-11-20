import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../pets/pets_api.dart' show ApiException, defaultApiUrl;

export '../pets/pets_api.dart' show ApiException;

/// Mensagem amigavel para cada status (quando o servidor nao manda "detail").
String friendlyStatus(int status) {
  switch (status) {
    case 400:
      return 'Confira os dados e tente de novo.';
    case 404:
      return 'Não encontrado.';
    case 413:
      return 'Arquivo grande demais.';
    case 429:
      return 'Muitas tentativas. Aguarde um instante.';
    case 503:
      return 'Serviço temporariamente indisponível.';
    default:
      return 'Erro inesperado ($status).';
  }
}

/// Cliente HTTP do app (site, loja e Espaco Beleza).
///
/// - Leituras repetem so em falha transitoria (rede, timeout, 503), com espera crescente.
/// - 429 nunca e repetido (respeita o rate limit da API).
/// - Usa o "detail" do ProblemDetail (mensagem em portugues do servidor) quando houver.
/// - Decodifica sempre como UTF-8 (acentos e emojis do pedido do WhatsApp).
class ApiClient {
  ApiClient({
    http.Client? client,
    String? baseUrl,
    this.timeout = const Duration(seconds: 10),
    this.retryDelay = const Duration(milliseconds: 300),
  })  : client = client ?? http.Client(),
        baseUrl = _trim(baseUrl ?? defaultApiUrl);

  final http.Client client;
  final String baseUrl;
  final Duration timeout;
  final Duration retryDelay;

  static const int maxAttempts = 3;
  static const _json = {'Accept': 'application/json'};

  static String _trim(String url) => url.endsWith('/') ? url.substring(0, url.length - 1) : url;

  /// Monta a URL; valores nulos/vazios sao ignorados e listas viram parametros repetidos.
  Uri uri(String path, [Map<String, Object?> query = const {}]) {
    final params = <String, dynamic>{};
    query.forEach((key, value) {
      if (value == null) return;
      if (value is Iterable) {
        final list = value.map((e) => '$e').toList();
        if (list.isNotEmpty) params[key] = list;
      } else if ('$value'.isNotEmpty) {
        params[key] = '$value';
      }
    });
    final base = Uri.parse('$baseUrl$path');
    return params.isEmpty ? base : base.replace(queryParameters: params);
  }

  /// Caminho relativo da API (ex.: "/api/beauty/photos/1/thumb") vira URL completa.
  String absolute(String path) => path.startsWith('http') ? path : '$baseUrl$path';

  Future<dynamic> getJson(String path, {Map<String, Object?> query = const {}, int attempts = maxAttempts, Duration? wait}) async {
    final target = uri(path, query);
    for (var attempt = 1;; attempt++) {
      try {
        final res = await client.get(target, headers: _json).timeout(wait ?? timeout);
        if (res.statusCode == 200) return _decode(res);
        if (res.statusCode != 503 || attempt >= attempts) throw _error(res);
      } on ApiException {
        rethrow;
      } on TimeoutException {
        if (attempt >= attempts) throw ApiException('O servidor não respondeu a tempo.');
      } on http.ClientException {
        if (attempt >= attempts) throw ApiException('Sem conexão com o servidor.');
      }
      await Future<void>.delayed(retryDelay * attempt);
    }
  }

  /// Escrita: uma tentativa so (nunca duplica pedido/depoimento).
  Future<dynamic> postJson(String path, Object body) async {
    try {
      final res = await client
          .post(uri(path), headers: {..._json, 'Content-Type': 'application/json'}, body: jsonEncode(body))
          .timeout(timeout);
      if (res.statusCode >= 200 && res.statusCode < 300) return res.bodyBytes.isEmpty ? null : _decode(res);
      throw _error(res);
    } on TimeoutException {
      throw ApiException('O servidor não respondeu a tempo.');
    } on http.ClientException {
      throw ApiException('Sem conexão com o servidor.');
    }
  }

  dynamic _decode(http.Response res) {
    try {
      return jsonDecode(utf8.decode(res.bodyBytes));
    } on FormatException {
      throw ApiException('Resposta inválida do servidor.');
    }
  }

  ApiException _error(http.Response res) {
    String? detail;
    try {
      final body = jsonDecode(utf8.decode(res.bodyBytes));
      if (body is Map && body['detail'] is String && (body['detail'] as String).trim().isNotEmpty) {
        detail = body['detail'] as String;
      }
    } catch (_) {
      // corpo vazio ou nao-JSON: usa a mensagem padrao
    }
    return ApiException(detail ?? friendlyStatus(res.statusCode), status: res.statusCode);
  }
}

/// Le um campo com tipo garantido (dado do servidor nunca derruba a tela).
String str(Object? v, [String fallback = '']) => v is String ? v : fallback;
String? optStr(Object? v) => v is String && v.trim().isNotEmpty ? v : null;
double numOr(Object? v, [double fallback = 0]) => v is num ? v.toDouble() : fallback;
int intOr(Object? v, [int fallback = 0]) => v is num ? v.toInt() : fallback;
bool boolOr(Object? v, [bool fallback = false]) => v is bool ? v : fallback;
Map<String, dynamic> obj(Object? v) => v is Map<String, dynamic> ? v : const {};
List<Map<String, dynamic>> objList(Object? v) => v is List ? v.whereType<Map<String, dynamic>>().toList() : const [];
