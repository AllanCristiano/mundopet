import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mundopet_mobile/app.dart';

import 'helpers.dart';

Map<String, dynamic> _reviews({double average = 4.75, int count = 2}) => {
      'items': [
        {'id': 't1', 'author': 'Ana', 'petName': 'Thor', 'rating': 5, 'message': 'Atendimento impecável!', 'status': 'APPROVED'},
        {'id': 't2', 'author': 'Bia', 'petName': null, 'rating': 4, 'message': 'Voltou cheirosinho.', 'status': 'APPROVED'},
      ],
      'page': 0,
      'size': 3,
      'hasMore': false,
      'summary': {'average': average, 'count': count},
    };

void main() {
  testWidgets('API fora do ar: inicio abre com os textos padrao do site', (tester) async {
    final b = FakeBackend()
      ..on('/api/site', (_) async => http.Response('', 503))
      ..on('/api/beauty/testimonials', (_) async => throw http.ClientException('recusada'));
    await pumpApp(tester, backend: b);
    expect(find.text('Tudo o que o seu melhor amigo merece'), findsOneWidget);
    expect(find.byKey(const Key('announcement')), findsNothing);
    for (final id in ['hotel', 'racoes', 'beleza', 'veterinario']) {
      expect(find.byKey(Key('chapter-$id')), findsOneWidget);
    }
    expect(find.byKey(const Key('reviews-invite')), findsOneWidget);
    expect(find.text('4,9★'), findsOneWidget); // numero padrao enquanto nao ha avaliacao real
  });

  testWidgets('usa o que o dono salvou na gestao: aviso, textos, ordem e servico desligado', (tester) async {
    final b = FakeBackend()
      ..on('/api/site', (_) async => json({
            'version': 2,
            'settings': {
              'store': {'name': 'Pet Feliz', 'whatsapp': '5511988887777', 'whatsappMessage': 'Oi, Pet Feliz!', 'facebook': 'https://facebook.com/petfeliz', 'email': 'oi@petfeliz.test'},
              'announcement': {'enabled': true, 'text': 'Vacinação com 10% off'},
              'hero': {'kicker': 'Desde 2010', 'title': 'Carinho de verdade', 'highlight': 'sempre', 'subtitle': 'Tudo num lugar só.'},
              'chapters': [
                {'id': 'veterinario', 'enabled': false},
              ],
              'address': {'mapsQuery': 'Pet Feliz, Campinas'},
            },
          }));
    final h = await pumpApp(tester, backend: b);
    expect(find.text('Vacinação com 10% off'), findsOneWidget);
    expect(find.textContaining('Carinho de verdade sempre'), findsOneWidget);
    expect(find.text('DESDE 2010'), findsOneWidget);
    expect(find.byKey(const Key('chapter-veterinario')), findsNothing);
    expect(find.textContaining('Pet Feliz · Feito com carinho'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('hero-whatsapp')));
    expect(h.opened.last.toString(), 'https://wa.me/5511988887777?text=${Uri.encodeComponent('Oi, Pet Feliz!')}');

    await tapAndSettle(tester, find.byKey(const Key('maps')));
    expect(h.opened.last.queryParameters['query'], 'Pet Feliz, Campinas');
    await tapAndSettle(tester, find.text('Facebook'));
    expect(h.opened.last.host, 'facebook.com');
    await tapAndSettle(tester, find.text('E-mail'));
    expect(h.opened.last.scheme, 'mailto');

    // CTA do hotel abre o WhatsApp com o pedido do servico
    await tapAndSettle(tester, find.descendant(of: find.byKey(const Key('chapter-hotel')), matching: find.text('Reservar hospedagem')));
    expect(h.opened.last.queryParameters['text'], contains('Reservar hospedagem'));
  });

  testWidgets('depoimentos reais aprovados e nota media real no numero de avaliacao', (tester) async {
    final b = FakeBackend()..on('/api/beauty/testimonials', (_) async => json(_reviews()));
    await pumpApp(tester, backend: b);
    expect(find.text('“Atendimento impecável!”'), findsOneWidget);
    expect(find.text('Ana · com Thor'), findsOneWidget);
    expect(find.text('Bia'), findsOneWidget);
    expect(find.byKey(const Key('rating-summary')), findsOneWidget);
    expect(find.textContaining('2 avaliações'), findsOneWidget);
    expect(find.byKey(const Key('reviews-invite')), findsNothing);
    expect(find.text('4,8★'), findsOneWidget);
    expect(b.calls('/api/beauty/testimonials').single.url.queryParameters['size'], '3');
  });

  testWidgets('botoes levam para as abas: loja, beleza', (tester) async {
    await pumpApp(tester);
    await tapAndSettle(tester, find.descendant(of: find.byKey(const Key('chapter-racoes')), matching: find.text('Ver catálogo de rações')));
    expect(find.byKey(const Key('search')), findsOneWidget);

    await tapAndSettle(tester, find.text('Início'));
    await tapAndSettle(tester, find.descendant(of: find.byKey(const Key('chapter-beleza')), matching: find.text('Ver fotos')));
    expect(find.byKey(const Key('write')), findsOneWidget);

    await tapAndSettle(tester, find.text('Início'));
    await tapAndSettle(tester, find.text('Deixe o primeiro depoimento →'));
    expect(find.byKey(const Key('write')), findsOneWidget);

    await tapAndSettle(tester, find.text('Pets'));
    expect(find.text('Nenhum pet cadastrado.'), findsOneWidget);
  });

  testWidgets('tema: alterna claro/escuro e lembra a escolha', (tester) async {
    final h = await pumpApp(tester, prefs: {'mundopet-theme': 'light'});
    final ctx = tester.element(find.byType(AppShell));
    expect(Theme.of(ctx).brightness, Brightness.light);
    await tapAndSettle(tester, find.byKey(const Key('theme-toggle')));
    expect(Theme.of(tester.element(find.byType(AppShell))).brightness, Brightness.dark);
    expect(h.prefs.getString('mundopet-theme'), 'dark');
  });

  testWidgets('WhatsApp indisponivel: avisa em vez de falhar calado', (tester) async {
    await pumpApp(tester, openOk: false);
    await tapAndSettle(tester, find.byTooltip('Falar no WhatsApp'));
    expect(find.text('Não foi possível abrir o link.'), findsOneWidget);
  });

  testWidgets('puxar para atualizar recarrega a configuracao', (tester) async {
    final h = await pumpApp(tester, height: 844); // o puxao depende da altura da tela
    await tester.fling(find.byKey(const Key('hero-whatsapp')), const Offset(0, 300), 1000);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    expect(h.backend.calls('/api/site').length, 2);
  });

  testWidgets('menu com calombo: o circulo dourado desliza ate a aba tocada', (tester) async {
    await pumpApp(tester, height: 844);
    double circleX() => tester.getCenter(find.byKey(const Key('nav-active'))).dx;
    double labelX(String l) => tester.getCenter(find.descendant(of: find.byKey(const Key('nav')), matching: find.text(l))).dx;
    expect(circleX(), closeTo(labelX('Início'), 1));
    expect(tester.getSemantics(find.bySemanticsLabel('Início')), isSemantics(isSelected: true, isButton: true));

    await tester.tap(find.text('Beleza'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));
    final midway = circleX();
    expect(midway, greaterThan(labelX('Início')));
    expect(midway, lessThan(labelX('Beleza')));
    await tester.pumpAndSettle();
    expect(circleX(), closeTo(labelX('Beleza'), 1));
  });
}
