import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mundopet_mobile/app.dart';
import 'package:mundopet_mobile/core/api.dart';
import 'package:shared_preferences/shared_preferences.dart';

http.Response json(Object? body, [int status = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(body)), status, headers: {'content-type': 'application/json'});

typedef Handler = Future<http.Response> Function(http.Request req);

Map<String, dynamic> product(String id, {String name = 'Ração Teste', double price = 100, double? promo, int stock = 10, String species = 'CAO'}) => {
      'id': id,
      'sku': 'SKU-$id',
      'name': name,
      'brand': 'Marca $id',
      'species': species,
      'lifeStage': 'ADULTO',
      'petSize': 'MEDIO',
      'line': 'PREMIUM',
      'flavor': 'Frango',
      'weightKg': 10.0,
      'price': price,
      'promoPrice': promo,
      'discountPercent': promo == null ? null : ((1 - promo / price) * 100).round(),
      'effectivePrice': promo ?? price,
      'pricePerKg': (promo ?? price) / 10,
      'stock': stock,
      'inStock': stock > 0,
      'color': '#4f9a5b',
      'description': null,
    };

Map<String, dynamic> productPage(List<Map<String, dynamic>> items, {bool hasMore = false, int? total}) =>
    {'items': items, 'total': total ?? items.length, 'page': 0, 'pageSize': 12, 'hasMore': hasMore};

/// API falsa: responde por caminho e guarda as chamadas.
class FakeBackend {
  FakeBackend() {
    on('/api/site', (_) async => json({'version': 0, 'settings': null, 'updatedAt': null}));
    on('/api/beauty/testimonials', (_) async => json({'items': [], 'page': 0, 'size': 12, 'hasMore': false, 'summary': {'average': 0, 'count': 0}}));
    on('/api/beauty/photos', (_) async => json({'items': [], 'page': 0, 'size': 24, 'hasMore': false}));
    on('/api/catalog/products', (_) async => json(productPage([product('p1', name: 'Ração Bosque', price: 379.9, promo: 329.9)])));
    on('/api/pets', (_) async => json([]));
  }

  final requests = <http.Request>[];
  final _routes = <String, Handler>{};

  void on(String path, Handler handler) => _routes[path] = handler;

  List<http.Request> calls(String path, [String? method]) =>
      requests.where((r) => r.url.path == path && (method == null || r.method == method)).toList();

  MockClient get client => MockClient((req) async {
        requests.add(req);
        final handler = _routes[req.url.path];
        return handler == null ? http.Response('', 404) : handler(req);
      });

  ApiClient api() => ApiClient(client: client, baseUrl: 'http://api', retryDelay: Duration.zero, timeout: const Duration(seconds: 2));
}

class Harness {
  Harness(this.backend, this.opened, this.prefs);

  final FakeBackend backend;
  final List<Uri> opened;
  final SharedPreferences prefs;
}

/// Sobe o app inteiro com tela de celular "alta" (todas as secoes montadas).
Future<Harness> pumpApp(
  WidgetTester tester, {
  FakeBackend? backend,
  AppTab tab = AppTab.home,
  Map<String, Object> prefs = const {},
  bool openOk = true,
  double height = 6000,
}) async {
  tester.view.physicalSize = Size(390, height);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  SharedPreferences.setMockInitialValues(prefs);
  final sp = await SharedPreferences.getInstance();
  final b = backend ?? FakeBackend();
  final opened = <Uri>[];
  await tester.pumpWidget(MundoPetApp(
    services: AppServices(api: b.api(), open: (uri) async {
      opened.add(uri);
      return openOk;
    }),
    prefs: sp,
    initialTab: tab,
  ));
  await tester.pumpAndSettle();
  return Harness(b, opened, sp);
}

Future<void> tapAndSettle(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}
