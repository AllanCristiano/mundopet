import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mundopet_mobile/core/theme.dart';
import 'package:mundopet_mobile/pets/pets_api.dart';
import 'package:mundopet_mobile/pets/pets_page.dart';

Widget _app(PetsApi api) => MaterialApp(theme: buildTheme(Brightness.dark), home: PetsPage(api: api));

PetsApi _api(MockClientHandler handler) =>
    PetsApi(client: MockClient(handler), baseUrl: 'http://api', retryDelay: Duration.zero);

void main() {
  testWidgets('lista pets', (tester) async {
    await tester.pumpWidget(_app(
      _api((_) async => http.Response(
          jsonEncode([
            {'id': '1', 'name': 'Rex', 'species': 'cachorro', 'breed': 'vira-lata'}
          ]),
          200)),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Rex'), findsOneWidget);
    expect(find.text('cachorro - vira-lata'), findsOneWidget);
  });

  testWidgets('estado vazio', (tester) async {
    await tester.pumpWidget(_app(_api((_) async => http.Response('[]', 200))));
    await tester.pumpAndSettle();
    expect(find.text('Nenhum pet cadastrado.'), findsOneWidget);
  });

  testWidgets('erro da API mostra mensagem e permite tentar de novo', (tester) async {
    var calls = 0;
    await tester.pumpWidget(_app(
      _api((_) async => ++calls == 1 ? http.Response('', 429) : http.Response('[]', 200)),
    ));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('error')), findsOneWidget);

    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    expect(find.text('Nenhum pet cadastrado.'), findsOneWidget);
  });

  testWidgets('cadastra pet pelo dialogo', (tester) async {
    await tester.pumpWidget(_app(
      _api((req) async => req.method == 'POST'
          ? http.Response(jsonEncode({'id': '2', 'name': 'Mia', 'species': 'gato'}), 201)
          : http.Response('[]', 200)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('name')), 'Mia');
    await tester.enterText(find.byKey(const Key('species')), 'gato');
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();
    expect(find.text('Mia'), findsOneWidget);
  });

  testWidgets('falha no cadastro mostra snackbar', (tester) async {
    await tester.pumpWidget(_app(
      _api((req) async => req.method == 'POST' ? http.Response('', 503) : http.Response('[]', 200)),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('name')), 'Mia');
    await tester.enterText(find.byKey(const Key('species')), 'gato');
    await tester.tap(find.text('Salvar'));
    await tester.pumpAndSettle();
    expect(find.text('Servico temporariamente indisponivel.'), findsOneWidget);
  });

  testWidgets('cancelar nao chama a API', (tester) async {
    var posts = 0;
    await tester.pumpWidget(_app(
      _api((req) async {
        if (req.method == 'POST') posts++;
        return http.Response('[]', 200);
      }),
    ));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(FloatingActionButton));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(posts, 0);
  });
}
