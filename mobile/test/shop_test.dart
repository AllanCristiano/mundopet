import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mundopet_mobile/app.dart';

import 'helpers.dart';

const _waText = '🐾 *MUNDOPET · PEDIDO DE RAÇÕES*\nTotal R\$ 329,90';

Map<String, dynamic> _quote(Map<String, dynamic> req, {Map<String, dynamic>? delivery, String? text = _waText, List<String> unavailable = const []}) {
  final items = (req['items'] as List).cast<Map<String, dynamic>>();
  final qty = items.fold<int>(0, (s, i) => s + (i['quantity'] as int));
  final fee = delivery?['fee'] as num? ?? 0;
  return {
    'lines': [
      for (final i in items)
        {'productId': i['productId'], 'name': 'x', 'quantity': i['quantity'], 'lineTotal': 329.9 * (i['quantity'] as int), 'promo': true, 'warning': null}
    ],
    'unavailable': unavailable,
    'itemsCount': qty,
    'subtotal': 379.9 * qty,
    'discount': 50 * qty,
    'itemsTotal': 329.9 * qty,
    'deliveryFee': fee,
    'total': 329.9 * qty + fee,
    'delivery': delivery,
    'whatsappText': text,
  };
}

Map<String, dynamic> _body(http.Request r) => jsonDecode(r.body) as Map<String, dynamic>;

Future<void> _openCart(WidgetTester tester) async {
  await tapAndSettle(tester, find.byKey(const Key('add-p1')));
  await tapAndSettle(tester, find.byKey(const Key('cart-bar')));
}

void main() {
  testWidgets('lista racoes com promocao e coloca no carrinho (barra e selo na aba)', (tester) async {
    await pumpApp(tester, tab: AppTab.shop);
    expect(find.text('Ração Bosque'), findsOneWidget);
    expect(find.text('R\$ 379,90'), findsOneWidget); // preco cheio riscado
    expect(find.text('R\$ 329,90'), findsOneWidget);
    expect(find.text('-13%'), findsOneWidget);
    expect(find.text('1 produto'), findsOneWidget);
    expect(find.byKey(const Key('cart-bar')), findsNothing);

    await tapAndSettle(tester, find.byKey(const Key('add-p1')));
    expect(find.text('1 item · R\$ 329,90'), findsOneWidget);
    await tapAndSettle(tester, find.byTooltip('Aumentar'));
    expect(find.text('2 itens · R\$ 659,80'), findsOneWidget);
    expect(find.descendant(of: find.byType(NavigationBar), matching: find.text('2')), findsOneWidget);
    await tapAndSettle(tester, find.byTooltip('Diminuir'));
    await tapAndSettle(tester, find.byTooltip('Remover Ração Bosque'));
    expect(find.byKey(const Key('cart-bar')), findsNothing);
  });

  testWidgets('filtros viram parametros da API; sem resultado oferece limpar', (tester) async {
    final b = FakeBackend()
      ..on('/api/catalog/products', (req) async =>
          json(productPage(req.url.queryParameters.containsKey('q') ? [] : [product('p1'), product('p2', stock: 0, name: 'Esgotada')])));
    await pumpApp(tester, backend: b, tab: AppTab.shop);
    expect(find.text('Esgotado'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('species-GATO')));
    expect(b.calls('/api/catalog/products').last.url.queryParameters['species'], 'GATO');
    await tapAndSettle(tester, find.byKey(const Key('promo')));
    expect(b.calls('/api/catalog/products').last.url.queryParameters['promo'], 'true');
    await tapAndSettle(tester, find.byKey(const Key('sort')));
    await tapAndSettle(tester, find.text('Menor preço').last);
    expect(b.calls('/api/catalog/products').last.url.queryParameters['sort'], 'PRICE_ASC');

    await tester.enterText(find.byKey(const Key('search')), 'golden');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    final last = b.calls('/api/catalog/products').last.url.queryParameters;
    expect(last['q'], 'golden');
    expect(last['species'], 'GATO');
    expect(find.text('Nenhuma ração encontrada com esses filtros.'), findsOneWidget);

    await tapAndSettle(tester, find.text('Limpar filtros'));
    final cleared = b.calls('/api/catalog/products').last.url.queryParameters;
    expect(cleared.containsKey('q'), isFalse);
    expect(cleared.containsKey('species'), isFalse);
    expect(find.text('2 produtos'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('search')), 'x');
    await tester.pump();
    await tapAndSettle(tester, find.byTooltip('Limpar busca'));
    expect(b.calls('/api/catalog/products').last.url.queryParameters.containsKey('q'), isFalse);
  });

  testWidgets('carregar mais pede a proxima pagina e junta na lista', (tester) async {
    final b = FakeBackend()
      ..on('/api/catalog/products', (req) async => req.url.queryParameters['page'] == '0'
          ? json(productPage([product('p1', name: 'Primeira')], hasMore: true, total: 2))
          : json(productPage([product('p2', name: 'Segunda')], total: 2)));
    await pumpApp(tester, backend: b, tab: AppTab.shop);
    await tapAndSettle(tester, find.byKey(const Key('more')));
    expect(find.text('Primeira'), findsOneWidget);
    expect(find.text('Segunda'), findsOneWidget);
    expect(find.byKey(const Key('more')), findsNothing);
  });

  testWidgets('falha da API: mensagem e tentar de novo (429 nao trava a tela)', (tester) async {
    var calls = 0;
    final b = FakeBackend()
      ..on('/api/catalog/products', (_) async => ++calls == 1 ? json({'detail': 'Muitas requisições. Aguarde.'}, 429) : json(productPage([product('p1')])));
    await pumpApp(tester, backend: b, tab: AppTab.shop);
    expect(find.text('Muitas requisições. Aguarde.'), findsOneWidget);
    await tapAndSettle(tester, find.text('Tentar de novo'));
    expect(find.byKey(const Key('product-p1')), findsOneWidget);
  });

  testWidgets('pedido para retirar: cotacao do servidor e envio pelo WhatsApp da loja', (tester) async {
    final b = FakeBackend()..on('/api/catalog/cart/quote', (req) async => json(_quote(_body(req))));
    final h = await pumpApp(tester, backend: b, tab: AppTab.shop);
    await _openCart(tester);

    final req = _body(b.calls('/api/catalog/cart/quote').single);
    expect(req['fulfillment'], 'PICKUP');
    expect(req['address'], isNull);
    expect(req['items'], [
      {'productId': 'p1', 'quantity': 1}
    ]);
    expect(find.text('Retirada na loja'), findsOneWidget);
    expect(find.text('-R\$ 50,00'), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('total'))).data, 'R\$ 329,90');

    // mudar o nome invalida a cotacao: precisa recalcular antes de enviar
    await tester.enterText(find.byKey(const Key('customer')), 'Ana');
    await tester.pump();
    expect(find.byKey(const Key('send')), findsNothing);
    await tapAndSettle(tester, find.byKey(const Key('requote')));
    expect(_body(b.calls('/api/catalog/cart/quote').last)['customerName'], 'Ana');

    await tapAndSettle(tester, find.byKey(const Key('send')));
    expect(h.opened.single.host, 'wa.me');
    expect(h.opened.single.path, '/5500000000000');
    expect(h.opened.single.queryParameters['text'], _waText);
    expect(find.text('Pedido aberto no WhatsApp. É só enviar!'), findsOneWidget);

    // trocar a quantidade recalcula sozinho
    await tapAndSettle(tester, find.byTooltip('Aumentar'));
    expect(_body(b.calls('/api/catalog/cart/quote').last)['items'], [
      {'productId': 'p1', 'quantity': 2}
    ]);
    await tapAndSettle(tester, find.text('Limpar carrinho'));
    expect(find.text('Seu carrinho está vazio.'), findsOneWidget);
  });

  testWidgets('entrega: CEP preenche o endereco, taxa por km do servidor e endereco lembrado', (tester) async {
    final b = FakeBackend()
      ..on('/api/address/cep/01001000', (_) async => json({'cep': '01001-000', 'street': 'Praça da Sé', 'district': 'Sé', 'city': 'São Paulo', 'state': 'SP', 'source': 'ViaCEP'}))
      ..on('/api/catalog/cart/quote', (req) async {
        final body = _body(req);
        return json(_quote(body,
            delivery: body['fulfillment'] == 'DELIVERY' ? {'status': 'OK', 'distanceKm': 3.2, 'fee': 6.4, 'pricePerKm': 2, 'maxKm': 15} : null));
      });
    final h = await pumpApp(tester, backend: b, tab: AppTab.shop);
    await _openCart(tester);

    await tapAndSettle(tester, find.text('Entregar'));
    expect(find.text('Entrega a R\$ 2,00/km, até 15 km da loja.'), findsOneWidget);
    expect(find.byKey(const Key('needs-address')), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('send'))).onPressed, isNull);

    await tester.enterText(find.byKey(const Key('addr-cep')), '01001000');
    await tester.pumpAndSettle();
    expect(find.text('01001-000'), findsOneWidget);
    expect(find.text('Praça da Sé'), findsOneWidget);
    expect(find.text('SP'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('addr-number')), '100');
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();

    final req = _body(b.calls('/api/catalog/cart/quote').last);
    expect(req['fulfillment'], 'DELIVERY');
    expect((req['address'] as Map)['cep'], '01001-000');
    expect((req['address'] as Map)['number'], '100');
    expect(find.text('Entrega (3,2 km × R\$ 2,00/km)'), findsOneWidget);
    expect(tester.widget<Text>(find.byKey(const Key('delivery-fee'))).data, 'R\$ 6,40');
    expect(tester.widget<Text>(find.byKey(const Key('total'))).data, 'R\$ 336,30');
    expect(h.prefs.getString('mundopet-address'), contains('Praça da Sé'));

    await tapAndSettle(tester, find.byKey(const Key('send')));
    expect(h.opened.single.host, 'wa.me');
  });

  testWidgets('entrega: fora da area bloqueia o envio; "a combinar" quando nao da para medir', (tester) async {
    var status = 'OUT_OF_AREA';
    final b = FakeBackend()
      ..on('/api/catalog/cart/quote', (req) async {
        final body = _body(req);
        if (body['fulfillment'] != 'DELIVERY') return json(_quote(body));
        final d = {'status': status, 'distanceKm': status == 'OK' ? 1 : null, 'fee': null, 'pricePerKm': 2, 'maxKm': 15};
        return json(_quote(body, delivery: d, text: status == 'OUT_OF_AREA' ? null : _waText));
      });
    const saved = '{"cep":"01001-000","street":"Rua A","number":"1","complement":"","district":"Centro","city":"São Paulo","state":"SP","reference":""}';
    await pumpApp(tester, backend: b, tab: AppTab.shop, prefs: {'mundopet-address': saved});
    await _openCart(tester);
    await tapAndSettle(tester, find.text('Entregar'));
    expect(find.text('Rua A'), findsOneWidget); // endereco salvo da ultima vez
    expect(find.byKey(const Key('out-of-area')), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('send'))).onPressed, isNull);

    status = 'UNKNOWN';
    await tapAndSettle(tester, find.text('Retirar na loja'));
    await tapAndSettle(tester, find.text('Entregar'));
    expect(tester.widget<Text>(find.byKey(const Key('delivery-fee'))).data, 'a combinar');
    expect(tester.widget<FilledButton>(find.byKey(const Key('send'))).onPressed, isNotNull);
  });

  testWidgets('falhas no pedido: CEP inexistente, cotacao fora do ar e item que esgotou', (tester) async {
    var quoteCalls = 0;
    final b = FakeBackend()
      ..on('/api/catalog/products', (_) async => json(productPage([product('p1', name: 'Ração Bosque'), product('p2', name: 'Outra')])))
      ..on('/api/catalog/cart/quote', (req) async {
        quoteCalls++;
        if (quoteCalls == 1) return http.Response('', 503);
        return json(_quote(_body(req), unavailable: quoteCalls == 2 ? ['p2'] : []));
      });
    await pumpApp(tester, backend: b, tab: AppTab.shop);
    await tapAndSettle(tester, find.byKey(const Key('add-p2')));
    await _openCart(tester);
    expect(find.byKey(const Key('quote-error')), findsOneWidget);
    expect(find.text('Serviço temporariamente indisponível.'), findsOneWidget);

    await tapAndSettle(tester, find.byKey(const Key('requote')));
    expect(find.text('Alguns itens esgotaram e saíram do pedido.'), findsOneWidget);
    expect(find.text('Outra'), findsNothing);

    await tapAndSettle(tester, find.text('Entregar'));
    await tester.enterText(find.byKey(const Key('addr-cep')), '99999999');
    await tester.pumpAndSettle();
    expect(find.text('CEP não encontrado.'), findsOneWidget);
  });

  testWidgets('carrinho vazio volta para a loja', (tester) async {
    await pumpApp(tester, tab: AppTab.shop);
    await _openCart(tester);
    await tapAndSettle(tester, find.byTooltip('Remover Ração Bosque').last);
    expect(find.text('Seu carrinho está vazio.'), findsOneWidget);
    await tapAndSettle(tester, find.text('Ver rações'));
    expect(find.byKey(const Key('search')), findsOneWidget);
  });
}
