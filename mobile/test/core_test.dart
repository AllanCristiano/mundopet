import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mundopet_mobile/beauty/beauty_models.dart';
import 'package:mundopet_mobile/core/api.dart';
import 'package:mundopet_mobile/core/format.dart';
import 'package:mundopet_mobile/core/site.dart';
import 'package:mundopet_mobile/core/theme.dart';
import 'package:mundopet_mobile/core/widgets.dart';
import 'package:mundopet_mobile/shop/shop_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'helpers.dart';

ApiClient _client(MockClientHandler h, {Duration timeout = const Duration(seconds: 1)}) =>
    ApiClient(client: MockClient(h), baseUrl: 'http://api/', retryDelay: Duration.zero, timeout: timeout);

void main() {
  group('formatos', () {
    test('dinheiro, numeros, peso, distancia e estrelas no padrao brasileiro', () {
      expect(money(1234.5), 'R\$ 1.234,50');
      expect(money(0), 'R\$ 0,00');
      expect(money(-2), '-R\$ 2,00');
      expect(money(1000000), 'R\$ 1.000.000,00');
      expect(number(15000), '15.000');
      expect(number(4.86, 1), '4,9');
      expect(number(-1200), '-1.200');
      expect(kg(15.0), '15 kg');
      expect(kg(2.5), '2,5 kg');
      expect(kg(0.75), '0,75 kg');
      expect(km(3.2), '3,2 km');
      expect(km(null), '0 km');
      expect(stars(4), '★★★★☆');
      expect(stars(9), '★★★★★');
      expect(rating(4.75), anyOf('4,8', '4,7'));
      expect(hexColor('#4f9a5b', Colors.red), const Color(0xFF4F9A5B));
      expect(hexColor('azul', Colors.red), Colors.red);
    });
  });

  group('configuracao do site', () {
    test('sem nada salvo usa os padroes do site', () {
      final s = SiteSettings.fromJson(null);
      expect(s.store.name, 'MundoPet');
      expect(s.hero.highlight, 'merece');
      expect(s.enabledChapters.map((c) => c.id), ChapterId.values);
      expect(s.announcementText, isNull);
      expect(s.stats.where((x) => x.rating), hasLength(1));
    });

    test('junta com o servidor: campo de tipo errado vira padrao, ordem e capitulos desligados do dono', () {
      final s = SiteSettings.fromJson({
        'store': {'name': 'Pet Feliz', 'whatsapp': '55 11 99999-0000', 'email': 3},
        'address': {'city': 'Campinas', 'lat': -22.9},
        'hours': {'clinic': ''},
        'announcement': {'enabled': true, 'text': '  Black Friday na loja  '},
        'hero': {'title': 'Seu pet', 'subtitle': 7},
        'chapters': [
          {'id': 'veterinario', 'enabled': false},
          {'id': 'hotel', 'title': 'Hotel novo', 'features': ['A', 2, 'B']},
          {'id': 'desconhecido'},
        ],
        'stats': [
          {'label': 'nota', 'value': 4.5, 'source': 'RATING', 'decimals': 9},
        ],
        'delivery': {'pricePerKm': 3.5, 'maxKm': 'x'},
      });
      expect(s.store.name, 'Pet Feliz');
      expect(s.store.email, '');
      expect(s.address.city, 'Campinas');
      expect(s.address.lat, -22.9);
      expect(s.address.street, defaultSite.address.street);
      expect(s.clinicHours, '');
      expect(s.announcementText, 'Black Friday na loja');
      expect(s.hero.title, 'Seu pet');
      expect(s.hero.text, defaultSite.hero.text);
      expect(s.chapters.map((c) => c.id), [ChapterId.veterinario, ChapterId.hotel, ChapterId.racoes, ChapterId.beleza]);
      expect(s.isOn(ChapterId.veterinario), isFalse);
      expect(s.enabledChapters, hasLength(3));
      expect(s.chapters[1].title, 'Hotel novo');
      expect(s.chapters[1].features, ['A', 'B']);
      expect(s.stats.single.rating, isTrue);
      expect(s.stats.single.decimals, 2);
      expect(s.stats.single.withValue(4.8).value, 4.8);
      expect(s.pricePerKm, 3.5);
      expect(s.maxKm, 15);
      expect(s.address.line1, 'Rua Exemplo, 123 · Centro');
      expect(s.address.line2, 'Campinas – SP · 01000-000');
    });

    test('links do WhatsApp e do mapa', () {
      final wa = waLink('+55 (11) 99999-0000', 'Olá! Quero conhecer & agendar');
      expect(wa.host, 'wa.me');
      expect(wa.path, '/5511999990000');
      expect(wa.queryParameters['text'], 'Olá! Quero conhecer & agendar');
      expect(mapsLink(defaultSite.address).queryParameters['query'], '-23.5505,-46.6333');
      final named = defaultSite.address.merge({'mapsQuery': 'MundoPet, Rua X 1'});
      expect(mapsLink(named).queryParameters['query'], 'MundoPet, Rua X 1');
    });

    test('controlador: API fora do ar mantem os padroes e marca como carregado', () async {
      final c = SiteController(SiteApi(_client((_) async => throw http.ClientException('recusada'))));
      var notified = 0;
      c.addListener(() => notified++);
      await c.load();
      expect(c.loaded, isTrue);
      expect(c.settings.store.name, 'MundoPet');
      expect(notified, 1);
    });

    test('controlador: carrega o que o dono salvou', () async {
      final c = SiteController(SiteApi(_client((_) async => json({
            'version': 3,
            'settings': {
              'store': {'name': 'Pet Feliz'},
            },
          }))));
      await c.load();
      expect(c.settings.store.name, 'Pet Feliz');
    });
  });

  group('tema', () {
    test('sem escolha segue o sistema; alterna e salva com a mesma chave do site', () async {
      SharedPreferences.setMockInitialValues({});
      final prefs = await SharedPreferences.getInstance();
      final t = ThemeController(prefs);
      expect(t.mode, ThemeMode.system);
      t.toggle(Brightness.dark);
      expect(t.mode, ThemeMode.light);
      expect(prefs.getString('mundopet-theme'), 'light');
      t.toggle(Brightness.light);
      expect(t.mode, ThemeMode.dark);
      expect(ThemeController(prefs).mode, ThemeMode.dark);
      expect(ThemeController(null).mode, ThemeMode.system);
    });

    test('paletas iguais as do site', () {
      expect(buildTheme(Brightness.dark).scaffoldBackgroundColor, const Color(0xFF0B0908));
      expect(buildTheme(Brightness.light).scaffoldBackgroundColor, const Color(0xFFFAF6EF));
      expect(buildTheme(Brightness.light).extension<Palette>()!.gold, const Color(0xFF9A6418));
      expect(Palette.dark.lerp(Palette.light, 0.7), Palette.light);
      expect(Palette.dark.lerp(Palette.light, 0.2), Palette.dark);
      expect(Palette.dark.copyWith(), Palette.dark);
    });
  });

  group('cliente da API (falhas)', () {
    test('503 e repetido ate dar certo', () async {
      var calls = 0;
      final api = _client((_) async => ++calls < 3 ? http.Response('', 503) : json({'ok': true}));
      expect(await api.getJson('/x'), {'ok': true});
      expect(calls, 3);
    });

    test('429 nunca e repetido e usa a mensagem do servidor', () async {
      var calls = 0;
      final api = _client((_) async {
        calls++;
        return json({'detail': 'Calma! Muitas requisições.'}, 429);
      });
      await expectLater(api.getJson('/x'), throwsA(isA<ApiException>().having((e) => e.message, 'msg', 'Calma! Muitas requisições.').having((e) => e.status, 'status', 429)));
      expect(calls, 1);
    });

    test('sem detail usa a mensagem padrao do status', () async {
      for (final (status, text) in [(400, 'Confira'), (404, 'Não encontrado'), (413, 'grande'), (418, '418'), (503, 'indisponível')]) {
        final api = _client((_) async => http.Response('<html>', status));
        await expectLater(api.getJson('/x', attempts: 1), throwsA(isA<ApiException>().having((e) => e.message, 'msg', contains(text))));
      }
    });

    test('lenta: desiste depois das tentativas', () async {
      var calls = 0;
      final api = _client((_) async {
        calls++;
        await Future<void>.delayed(const Duration(milliseconds: 200));
        return json({});
      }, timeout: const Duration(milliseconds: 20));
      await expectLater(api.getJson('/x'), throwsA(isA<ApiException>().having((e) => e.message, 'msg', contains('não respondeu'))));
      expect(calls, ApiClient.maxAttempts);
      await expectLater(api.postJson('/x', {}), throwsA(isA<ApiException>().having((e) => e.message, 'msg', contains('não respondeu'))));
    });

    test('fora do ar e resposta invalida', () async {
      final down = _client((_) async => throw http.ClientException('Connection refused'));
      await expectLater(down.getJson('/x'), throwsA(isA<ApiException>().having((e) => e.message, 'msg', contains('Sem conexão'))));
      await expectLater(down.postJson('/x', {}), throwsA(isA<ApiException>().having((e) => e.message, 'msg', contains('Sem conexão'))));
      final broken = _client((_) async => http.Response('{nao e json', 200));
      await expectLater(broken.getJson('/x'), throwsA(isA<ApiException>().having((e) => e.message, 'msg', contains('inválida'))));
    });

    test('POST: corpo vazio vira null, erro traz o detail; acentos em UTF-8', () async {
      final api = _client((req) async {
        if (req.url.path == '/vazio') return http.Response('', 202);
        if (req.url.path == '/erro') return json({'detail': 'Mensagem curta demais'}, 400);
        return json({'texto': 'Ração 🐾'});
      });
      expect(await api.postJson('/vazio', {}), isNull);
      expect(await api.postJson('/ok', {}), {'texto': 'Ração 🐾'});
      await expectLater(api.postJson('/erro', {}), throwsA(isA<ApiException>().having((e) => e.status, 'status', 400)));
    });

    test('monta a URL: ignora vazios e repete listas', () {
      final api = _client((_) async => json({}));
      final u = api.uri('/p', {'a': 1, 'b': null, 'c': '', 'd': ['x', 'y'], 'e': <String>[]});
      expect(u.toString(), 'http://api/p?a=1&d=x&d=y');
      expect(api.uri('/p').toString(), 'http://api/p');
      expect(api.absolute('/img.jpg'), 'http://api/img.jpg');
      expect(api.absolute('https://cdn/x.jpg'), 'https://cdn/x.jpg');
    });

    test('leitores tolerantes a tipo errado', () {
      expect(str(1, 'd'), 'd');
      expect(optStr('  '), isNull);
      expect(numOr('1', 2), 2);
      expect(intOr(3.7), 3);
      expect(boolOr('true'), isFalse);
      expect(obj([]), isEmpty);
      expect(objList({'a': 1}), isEmpty);
    });
  });

  group('loja: regras', () {
    test('produto, promocao e limites do carrinho', () {
      final p = Product.fromJson(product('a', price: 100, promo: 80, stock: 3));
      expect(p.onPromo, isTrue);
      expect(p.discountPercent, 20);
      expect(p.maxQty, 3);
      final cart = Cart();
      var changes = 0;
      cart.addListener(() => changes++);
      cart.add(p);
      cart.add(p);
      expect(cart.count, 2);
      expect(cart.estimate, 160);
      cart.setQty(p, 50);
      expect(cart.qty('a'), 3);
      expect(cart.toApi(), [
        {'productId': 'a', 'quantity': 3}
      ]);
      cart.removeMany(['zzz']);
      final before = changes;
      cart.removeMany(['nao-existe']);
      expect(changes, before);
      cart.removeMany(['a']);
      expect(cart.isEmpty, isTrue);
      cart.add(p);
      cart.setQty(p, 0);
      expect(cart.isEmpty, isTrue);
      cart.add(p);
      cart.clear();
      expect(cart.count, 0);
      expect(Product.fromJson({}).color, '#e3b062');
    });

    test('endereco: mascara, validacao, formato da API e memoria', () async {
      expect(maskCep('01001000'), '01001-000');
      expect(maskCep('0100'), '0100');
      expect(cepDigits('01.001-000-99'), '01001000');
      const a = DeliveryAddress(cep: '01001-000', street: 'Praça da Sé', number: '10', district: 'Sé', city: 'São Paulo', state: 'sp');
      expect(a.isValid, isTrue);
      expect(const DeliveryAddress(cep: '01001-000', street: 'x', number: '1', district: 'x', city: 'x', state: 'XX').isValid, isFalse);
      expect(a.toApi()['state'], 'SP');
      expect(a.toApi()['complement'], isNull);

      SharedPreferences.setMockInitialValues({DeliveryAddress.storageKey: '{quebrado'});
      final prefs = await SharedPreferences.getInstance();
      expect(DeliveryAddress.load(prefs).cep, '');
      a.save(prefs);
      expect(DeliveryAddress.load(prefs).street, 'Praça da Sé');
      expect(DeliveryAddress.load(null).street, '');
      expect(DeliveryAddress.fromMap({'street': 'x' * 300, 'number': 1}).street.length, 120);
    });

    test('cotacao e CEP pela API', () async {
      final api = CatalogApi(_client((req) async {
        if (req.url.path.startsWith('/api/address/cep/00000000')) return http.Response('', 404);
        if (req.url.path.startsWith('/api/address/cep/')) {
          return json({'cep': '01001-000', 'street': 'Praça da Sé', 'district': 'Sé', 'city': 'São Paulo', 'state': 'SP'});
        }
        expect(jsonDecode(req.body)['fulfillment'], 'PICKUP');
        return json({
          'lines': [
            {'productId': 'a', 'name': 'R', 'quantity': 1, 'lineTotal': 10, 'promo': false, 'warning': 'Só 1 em estoque'}
          ],
          'unavailable': ['b'],
          'itemsCount': 1,
          'subtotal': 10,
          'discount': 0,
          'itemsTotal': 10,
          'deliveryFee': 0,
          'total': 10,
          'delivery': {'status': 'OK', 'distanceKm': 3.2, 'fee': 6.4, 'pricePerKm': 2, 'maxKm': 15},
          'whatsappText': 'pedido',
        });
      }));
      final q = await api.quote({'fulfillment': 'PICKUP'});
      expect(q.lines.single.warning, 'Só 1 em estoque');
      expect(q.unavailable, ['b']);
      expect(q.delivery!.fee, 6.4);
      expect((await api.cep('01001-000')).street, 'Praça da Sé');
      await expectLater(api.cep('00000-000'), throwsA(isA<ApiException>().having((e) => e.message, 'msg', 'CEP não encontrado.')));
      final down = CatalogApi(_client((_) async => http.Response('', 500)));
      await expectLater(down.cep('01001000'), throwsA(isA<ApiException>().having((e) => e.status, 'status', 500)));
    });

    test('filtros: copia sem perder campos', () {
      const f = Filters(q: 'golden', species: 'CAO');
      expect(f.copyWith(promo: true).species, 'CAO');
      expect(f.copyWith(species: () => null).species, isNull);
      expect(f.isEmpty, isFalse);
      expect(const Filters().isEmpty, isTrue);
    });
  });

  group('beleza: API', () {
    test('fotos com URL completa e depoimento enviado sem campos vazios (isca vazia)', () async {
      late Map<String, dynamic> sent;
      final api = BeautyApi(_client((req) async {
        if (req.method == 'POST') {
          sent = jsonDecode(req.body) as Map<String, dynamic>;
          return json({}, 202);
        }
        expect(req.url.queryParameters['service'], 'TOSA');
        return json({
          'items': [
            {'id': '1', 'petName': 'Thor', 'service': 'TOSA', 'thumbUrl': '/api/beauty/photos/1/thumb', 'fullUrl': '/api/beauty/photos/1/full'}
          ],
          'hasMore': true,
        });
      }));
      final page = await api.photos(service: 'TOSA');
      expect(page.items.single.thumbUrl, 'http://api/api/beauty/photos/1/thumb');
      expect(page.items.single.serviceLabel, 'Tosa');
      expect(page.hasMore, isTrue);
      final msg = await api.submit(author: ' Ana ', petName: '  ', rating: 5, message: ' Amei o banho! ');
      expect(msg, contains('aprovar'));
      expect(sent, {'author': 'Ana', 'petName': null, 'rating': 5, 'message': 'Amei o banho!', 'website': ''});
      expect(const Testimonial(id: '1', author: 'Ana', rating: 5, message: 'x', petName: 'Thor').authorLine, 'Ana · com Thor');
      expect(Testimonial.fromJson({'rating': 9}).rating, 5);
    });
  });

  testWidgets('openLink avisa quando nao consegue abrir', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => openLink(context, (_) async => false, Uri.parse('https://x')),
            child: const Text('abrir'),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('abrir'));
    await tester.pumpAndSettle();
    expect(find.text('Não foi possível abrir o link.'), findsOneWidget);
  });

  testWidgets('animacao de entrada some quando o sistema pede menos movimento', (tester) async {
    await tester.pumpWidget(const MediaQuery(
      data: MediaQueryData(disableAnimations: true),
      child: Directionality(textDirection: TextDirection.ltr, child: Reveal(child: Text('oi'))),
    ));
    expect(find.byType(FadeTransition), findsNothing);
    expect(find.text('oi'), findsOneWidget);
  });
}
