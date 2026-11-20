import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'pet.dart';

/// URL da API definida no build: flutter build apk --dart-define=API_URL=http://...
const String defaultApiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:8088');

class ApiException implements Exception {
  ApiException(this.message, {this.status});

  final String message;
  final int? status;

  @override
  String toString() => message;
}

String messageForStatus(int status) {
  switch (status) {
    case 400:
      return 'Dados invalidos.';
    case 404:
      return 'Pet nao encontrado.';
    case 429:
      return 'Muitas requisicoes. Aguarde um instante.';
    case 503:
      return 'Servico temporariamente indisponivel.';
    default:
      return 'Erro inesperado ($status).';
  }
}

/// Cliente HTTP assincrono da API, com timeout e retentativa apenas para leituras.
class PetsApi {
  PetsApi({http.Client? client, String? baseUrl, this.timeout = const Duration(seconds: 10), this.retryDelay = const Duration(milliseconds: 300)})
      : _client = client ?? http.Client(),
        _baseUrl = baseUrl ?? defaultApiUrl;

  final http.Client _client;
  final String _baseUrl;
  final Duration timeout;
  final Duration retryDelay;

  static const int maxAttempts = 3;

  Future<List<Pet>> list({int page = 0, int size = 20}) async {
    final uri = Uri.parse('$_baseUrl/api/pets?page=$page&size=$size');
    for (var attempt = 1;; attempt++) {
      try {
        final res = await _client.get(uri).timeout(timeout);
        if (res.statusCode == 200) {
          final body = jsonDecode(res.body) as List<dynamic>;
          return body.map((e) => Pet.fromJson(e as Map<String, dynamic>)).toList();
        }
        // So repete em falha transitoria do servidor; 429 nao e repetido (respeita o rate limit)
        if (res.statusCode != 503 || attempt >= maxAttempts) {
          throw ApiException(messageForStatus(res.statusCode), status: res.statusCode);
        }
      } on ApiException {
        rethrow;
      } on FormatException {
        throw ApiException('Resposta invalida do servidor.');
      } on TimeoutException {
        if (attempt >= maxAttempts) throw ApiException('Servidor nao respondeu a tempo.');
      } on http.ClientException {
        if (attempt >= maxAttempts) throw ApiException('Sem conexao com o servidor.');
      }
      await Future<void>.delayed(retryDelay * attempt);
    }
  }

  Future<Pet> create({required String name, required String species, String? breed}) async {
    final uri = Uri.parse('$_baseUrl/api/pets');
    try {
      final res = await _client
          .post(uri,
              headers: {'Content-Type': 'application/json'},
              body: jsonEncode({'name': name, 'species': species, 'breed': breed}))
          .timeout(timeout);
      if (res.statusCode == 201) {
        return Pet.fromJson(jsonDecode(res.body) as Map<String, dynamic>);
      }
      throw ApiException(messageForStatus(res.statusCode), status: res.statusCode);
    } on TimeoutException {
      throw ApiException('Servidor nao respondeu a tempo.');
    } on http.ClientException {
      throw ApiException('Sem conexao com o servidor.');
    }
  }

  String photoUrl(Pet pet) => '$_baseUrl/api/pets/${pet.id}/photo';
}
