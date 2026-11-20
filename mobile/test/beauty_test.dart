import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mundopet_mobile/app.dart';

import 'helpers.dart';

Map<String, dynamic> _photo(String id, String pet, String service, {String? caption}) => {
      'id': id,
      'petName': pet,
      'species': 'CAO',
      'service': service,
      'caption': caption,
      'width': 1600,
      'height': 1200,
      'createdAt': '2026-11-20T10:00:00Z',
      'thumbUrl': '/api/beauty/photos/$id/thumb',
      'fullUrl': '/api/beauty/photos/$id/full',
    };

void main() {
  testWidgets('galeria com as fotos da clinica, filtro por servico e foto ampliada', (tester) async {
    final b = FakeBackend()
      ..on('/api/beauty/photos', (req) async {
        final svc = req.url.queryParameters['service'];
        final all = [_photo('1', 'Thor', 'TOSA', caption: 'Tosa bebê com laço 🎀'), _photo('2', 'Mel', 'BANHO')];
        return json({'items': all.where((p) => svc == null || p['service'] == svc).toList(), 'hasMore': false});
      });
    await pumpApp(tester, backend: b, tab: AppTab.beauty);
    expect(find.byKey(const Key('photo-1')), findsOneWidget);
    expect(find.byKey(const Key('photo-2')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('Foto de Thor, Tosa')), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('svc-TOSA')));
    expect(b.calls('/api/beauty/photos').last.url.queryParameters['service'], 'TOSA');
    expect(find.byKey(const Key('photo-2')), findsNothing);

    await tapAndSettle(tester, find.byKey(const Key('svc-SPA')));
    expect(find.text('Nenhuma foto desse serviço ainda.'), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('svc-ALL')));
    final calls = b.calls('/api/beauty/photos').length;
    await tapAndSettle(tester, find.byKey(const Key('svc-ALL'))); // mesmo filtro nao chama de novo
    expect(b.calls('/api/beauty/photos').length, calls);

    await tapAndSettle(tester, find.byKey(const Key('photo-1')));
    expect(find.byType(InteractiveViewer), findsOneWidget);
    expect(find.text('Tosa bebê com laço 🎀'), findsOneWidget);
    await tapAndSettle(tester, find.byType(BackButton));
    expect(find.byType(InteractiveViewer), findsNothing);
  });

  testWidgets('sem fotos e sem depoimentos: convites; agendar abre o WhatsApp', (tester) async {
    final h = await pumpApp(tester, tab: AppTab.beauty);
    expect(find.byKey(const Key('no-photos')), findsOneWidget);
    expect(find.byKey(const Key('no-reviews')), findsOneWidget);
    expect(find.byKey(const Key('beauty-rating')), findsNothing);
    await tapAndSettle(tester, find.text('Agendar banho'));
    expect(h.opened.single.queryParameters['text'], contains('banho & tosa'));
  });

  testWidgets('depoimentos aprovados com a nota media', (tester) async {
    final b = FakeBackend()
      ..on('/api/beauty/testimonials', (_) async => json({
            'items': [
              {'id': 't1', 'author': 'Ana', 'petName': 'Thor', 'rating': 5, 'message': 'Amei o resultado!'}
            ],
            'hasMore': false,
            'summary': {'average': 5, 'count': 1},
          }));
    await pumpApp(tester, backend: b, tab: AppTab.beauty);
    expect(find.text('“Amei o resultado!”'), findsOneWidget);
    expect(find.textContaining('1 avaliação'), findsOneWidget);
  });

  testWidgets('fotos: erro com tentar de novo e carregar mais', (tester) async {
    var calls = 0;
    final b = FakeBackend()
      ..on('/api/beauty/photos', (req) async {
        calls++;
        if (calls <= 3) throw http.ClientException('recusada'); // as 3 tentativas falham
        final page = req.url.queryParameters['page'];
        return json(page == '0' ? {'items': [_photo('1', 'Thor', 'TOSA')], 'hasMore': true} : {'items': [_photo('2', 'Mel', 'SPA')], 'hasMore': false});
      });
    await pumpApp(tester, backend: b, tab: AppTab.beauty);
    expect(find.text('Sem conexão com o servidor.'), findsOneWidget);
    await tapAndSettle(tester, find.text('Tentar de novo'));
    expect(find.byKey(const Key('photo-1')), findsOneWidget);
    await tapAndSettle(tester, find.byKey(const Key('more-photos')));
    expect(find.byKey(const Key('photo-2')), findsOneWidget);
    expect(b.calls('/api/beauty/photos').last.url.queryParameters['page'], '1');
  });

  testWidgets('deixar depoimento: valida, envia para aprovacao (isca vazia) e agradece', (tester) async {
    final b = FakeBackend()
      ..on('/api/beauty/testimonials', (req) async => req.method == 'POST'
          ? json({'message': 'Recebido!'}, 202)
          : json({'items': [], 'hasMore': false, 'summary': {'average': 0, 'count': 0}}));
    await pumpApp(tester, backend: b, tab: AppTab.beauty, height: 900);
    await tapAndSettle(tester, find.byKey(const Key('write')));

    FilledButton send() => tester.widget<FilledButton>(find.byKey(const Key('t-send')));
    expect(send().onPressed, isNull);
    await tester.enterText(find.byKey(const Key('t-author')), 'Ana');
    await tester.enterText(find.byKey(const Key('t-message')), 'curto');
    await tester.pump();
    expect(find.text('Mínimo de 10 caracteres'), findsOneWidget);
    expect(send().onPressed, isNull);

    await tester.enterText(find.byKey(const Key('t-message')), 'O Thor voltou lindo e cheiroso!');
    await tester.pump();
    await tapAndSettle(tester, find.byKey(const Key('star-4')));
    await tapAndSettle(tester, find.byKey(const Key('t-send')));

    final body = jsonDecode(b.calls('/api/beauty/testimonials', 'POST').single.body);
    expect(body, {'author': 'Ana', 'petName': null, 'rating': 4, 'message': 'O Thor voltou lindo e cheiroso!', 'website': ''});
    expect(find.text('Obrigado! Seu depoimento aparece assim que a clínica aprovar.'), findsOneWidget);
    expect(find.byKey(const Key('t-send')), findsNothing);
  });

  testWidgets('depoimento: limite de envios mostra a mensagem do servidor e mantem o texto', (tester) async {
    final b = FakeBackend()
      ..on('/api/beauty/testimonials', (req) async => req.method == 'POST'
          ? json({'detail': 'Você já enviou depoimentos demais. Tente mais tarde.'}, 429)
          : json({'items': [], 'hasMore': false, 'summary': {'average': 0, 'count': 0}}));
    await pumpApp(tester, backend: b, tab: AppTab.beauty, height: 900);
    await tapAndSettle(tester, find.byKey(const Key('write')));
    await tester.enterText(find.byKey(const Key('t-author')), 'Ana');
    await tester.enterText(find.byKey(const Key('t-pet')), 'Thor');
    await tester.enterText(find.byKey(const Key('t-message')), 'Atendimento excelente sempre.');
    await tester.pump();
    await tapAndSettle(tester, find.byKey(const Key('t-send')));
    expect(find.byKey(const Key('t-error')), findsOneWidget);
    expect(find.text('Você já enviou depoimentos demais. Tente mais tarde.'), findsOneWidget);
    expect(find.text('Atendimento excelente sempre.'), findsOneWidget);
    expect(jsonDecode(b.calls('/api/beauty/testimonials', 'POST').single.body)['petName'], 'Thor');
  });
}
