import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mundopet_mobile/pets/pets_api.dart';

const _petJson = {'id': '1', 'name': 'Rex', 'species': 'cachorro', 'breed': null, 'photoKey': null};

PetsApi _api(MockClientHandler handler) => PetsApi(
      client: MockClient(handler),
      baseUrl: 'http://api',
      timeout: const Duration(milliseconds: 100),
      retryDelay: Duration.zero,
    );

void main() {
  group('list', () {
    test('retorna pets', () async {
      final api = _api((req) async {
        expect(req.url.toString(), 'http://api/api/pets?page=0&size=20');
        return http.Response(jsonEncode([_petJson]), 200);
      });
      final pets = await api.list();
      expect(pets.single.name, 'Rex');
    });

    test('repete em 503 e recupera', () async {
      var calls = 0;
      final api = _api((_) async => ++calls < 3 ? http.Response('', 503) : http.Response('[]', 200));
      expect(await api.list(), isEmpty);
      expect(calls, 3);
    });

    test('desiste apos 3 tentativas com 503', () async {
      var calls = 0;
      final api = _api((_) async {
        calls++;
        return http.Response('', 503);
      });
      await expectLater(api.list(), throwsA(isA<ApiException>().having((e) => e.status, 'status', 503)));
      expect(calls, PetsApi.maxAttempts);
    });

    test('nao repete em 429', () async {
      var calls = 0;
      final api = _api((_) async {
        calls++;
        return http.Response('', 429);
      });
      await expectLater(api.list(), throwsA(isA<ApiException>().having((e) => e.message, 'msg', contains('Muitas'))));
      expect(calls, 1);
    });

    test('sem conexao vira mensagem amigavel', () async {
      final api = _api((_) async => throw http.ClientException('conexao recusada'));
      await expectLater(api.list(), throwsA(isA<ApiException>().having((e) => e.message, 'msg', contains('Sem conexao'))));
    });

    test('timeout vira mensagem amigavel', () async {
      final api = _api((_) => Completer<http.Response>().future);
      await expectLater(api.list(), throwsA(isA<ApiException>().having((e) => e.message, 'msg', contains('tempo'))));
    });

    test('resposta invalida', () async {
      final api = _api((_) async => http.Response('<html>', 200));
      await expectLater(api.list(), throwsA(isA<ApiException>()));
    });
  });

  group('create', () {
    test('cria pet', () async {
      final api = _api((req) async {
        expect(req.method, 'POST');
        expect(jsonDecode(req.body)['name'], 'Rex');
        return http.Response(jsonEncode(_petJson), 201);
      });
      expect((await api.create(name: 'Rex', species: 'cachorro')).id, '1');
    });

    test('erro de validacao', () async {
      final api = _api((_) async => http.Response('{}', 400));
      await expectLater(api.create(name: '', species: ''), throwsA(isA<ApiException>().having((e) => e.status, 's', 400)));
    });

    test('sem conexao', () async {
      final api = _api((_) async => throw http.ClientException('x'));
      await expectLater(api.create(name: 'a', species: 'b'), throwsA(isA<ApiException>()));
    });

    test('timeout', () async {
      final api = _api((_) => Completer<http.Response>().future);
      await expectLater(api.create(name: 'a', species: 'b'), throwsA(isA<ApiException>()));
    });
  });

  test('mensagens por status', () {
    expect(messageForStatus(404), contains('nao encontrado'));
    expect(messageForStatus(500), contains('500'));
    expect(ApiException('x').toString(), 'x');
  });
}
