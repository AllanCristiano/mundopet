import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api.dart';

// Loja de racoes: mesmos contratos do site (modulo "catalog" + "address" do backend).

const speciesLabel = {'CAO': 'Cães', 'GATO': 'Gatos'};
const stageLabel = {'FILHOTE': 'Filhote', 'ADULTO': 'Adulto', 'SENIOR': 'Sênior'};
const sizeLabel = {'PEQUENO': 'Pequeno', 'MEDIO': 'Médio', 'GRANDE': 'Grande', 'TODOS': 'Todos os portes'};
const lineLabel = {'PREMIUM': 'Premium', 'SUPER_PREMIUM': 'Super Premium', 'NATURAL': 'Natural', 'TERAPEUTICA': 'Terapêutica'};
const sortLabel = {
  'RELEVANCE': 'Destaques',
  'PRICE_ASC': 'Menor preço',
  'PRICE_DESC': 'Maior preço',
  'DISCOUNT': 'Maior desconto',
  'NAME': 'Nome (A–Z)',
};

class Product {
  const Product({
    required this.id,
    required this.sku,
    required this.name,
    required this.brand,
    required this.species,
    required this.lifeStage,
    required this.petSize,
    required this.line,
    required this.weightKg,
    required this.price,
    required this.effectivePrice,
    required this.pricePerKg,
    required this.stock,
    required this.inStock,
    required this.color,
    this.flavor,
    this.promoPrice,
    this.discountPercent,
    this.description,
  });

  final String id, sku, name, brand, species, lifeStage, petSize, line, color;
  final String? flavor, description;
  final double weightKg, price, effectivePrice, pricePerKg;
  final double? promoPrice;
  final int? discountPercent;
  final int stock;
  final bool inStock;

  bool get onPromo => promoPrice != null && effectivePrice < price;

  /// Quantidade maxima no carrinho (estoque, ate 99).
  int get maxQty => stock.clamp(0, 99);

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: str(j['id']),
        sku: str(j['sku']),
        name: str(j['name']),
        brand: str(j['brand']),
        species: str(j['species']),
        lifeStage: str(j['lifeStage']),
        petSize: str(j['petSize']),
        line: str(j['line']),
        flavor: optStr(j['flavor']),
        weightKg: numOr(j['weightKg']),
        price: numOr(j['price']),
        promoPrice: j['promoPrice'] is num ? (j['promoPrice'] as num).toDouble() : null,
        discountPercent: j['discountPercent'] is num ? (j['discountPercent'] as num).toInt() : null,
        effectivePrice: numOr(j['effectivePrice'], numOr(j['price'])),
        pricePerKg: numOr(j['pricePerKg']),
        stock: intOr(j['stock']),
        inStock: boolOr(j['inStock']),
        color: str(j['color'], '#e3b062'),
        description: optStr(j['description']),
      );
}

class ProductPage {
  const ProductPage(this.items, this.total, this.hasMore);

  final List<Product> items;
  final int total;
  final bool hasMore;
}

class Filters {
  const Filters({this.q = '', this.species, this.promo = false, this.sort = 'RELEVANCE'});

  final String q;
  final String? species;
  final bool promo;
  final String sort;

  Filters copyWith({String? q, String? Function()? species, bool? promo, String? sort}) => Filters(
        q: q ?? this.q,
        species: species != null ? species() : this.species,
        promo: promo ?? this.promo,
        sort: sort ?? this.sort,
      );

  bool get isEmpty => q.trim().isEmpty && species == null && !promo;
}

/// Taxa de entrega por distancia (preco fixo por km), calculada no servidor.
class DeliveryQuote {
  const DeliveryQuote({required this.status, this.distanceKm, this.fee, required this.pricePerKm, required this.maxKm});

  /// OK, OUT_OF_AREA ou UNKNOWN ("a combinar").
  final String status;
  final double? distanceKm, fee;
  final double pricePerKm, maxKm;

  factory DeliveryQuote.fromJson(Map<String, dynamic> j) => DeliveryQuote(
        status: str(j['status'], 'UNKNOWN'),
        distanceKm: j['distanceKm'] is num ? (j['distanceKm'] as num).toDouble() : null,
        fee: j['fee'] is num ? (j['fee'] as num).toDouble() : null,
        pricePerKm: numOr(j['pricePerKm']),
        maxKm: numOr(j['maxKm']),
      );
}

class QuoteLine {
  const QuoteLine({required this.productId, required this.name, required this.quantity, required this.lineTotal, required this.promo, this.warning});

  final String productId, name;
  final int quantity;
  final double lineTotal;
  final bool promo;
  final String? warning;

  factory QuoteLine.fromJson(Map<String, dynamic> j) => QuoteLine(
        productId: str(j['productId']),
        name: str(j['name']),
        quantity: intOr(j['quantity']),
        lineTotal: numOr(j['lineTotal']),
        promo: boolOr(j['promo']),
        warning: optStr(j['warning']),
      );
}

class Quote {
  const Quote({
    required this.lines,
    required this.unavailable,
    required this.itemsCount,
    required this.subtotal,
    required this.discount,
    required this.itemsTotal,
    required this.deliveryFee,
    required this.total,
    this.delivery,
    this.whatsappText,
  });

  final List<QuoteLine> lines;
  final List<String> unavailable;
  final int itemsCount;
  final double subtotal, discount, itemsTotal, deliveryFee, total;
  final DeliveryQuote? delivery;

  /// Nulo quando nao da para enviar (ex.: fora da area de entrega).
  final String? whatsappText;

  factory Quote.fromJson(Map<String, dynamic> j) => Quote(
        lines: objList(j['lines']).map(QuoteLine.fromJson).toList(),
        unavailable: j['unavailable'] is List ? (j['unavailable'] as List).whereType<String>().toList() : const [],
        itemsCount: intOr(j['itemsCount']),
        subtotal: numOr(j['subtotal']),
        discount: numOr(j['discount']),
        itemsTotal: numOr(j['itemsTotal']),
        deliveryFee: numOr(j['deliveryFee']),
        total: numOr(j['total']),
        delivery: j['delivery'] is Map<String, dynamic> ? DeliveryQuote.fromJson(j['delivery'] as Map<String, dynamic>) : null,
        whatsappText: optStr(j['whatsappText']),
      );
}

// ---------------- Endereco de entrega ----------------

const ufs = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

String cepDigits(String raw) {
  final d = raw.replaceAll(RegExp(r'\D'), '');
  return d.length > 8 ? d.substring(0, 8) : d;
}

/// 01001000 -> 01001-000
String maskCep(String raw) {
  final d = cepDigits(raw);
  return d.length > 5 ? '${d.substring(0, 5)}-${d.substring(5)}' : d;
}

class DeliveryAddress {
  const DeliveryAddress({
    this.cep = '',
    this.street = '',
    this.number = '',
    this.complement = '',
    this.district = '',
    this.city = '',
    this.state = '',
    this.reference = '',
  });

  final String cep, street, number, complement, district, city, state, reference;

  static const fields = ['cep', 'street', 'number', 'complement', 'district', 'city', 'state', 'reference'];

  Map<String, String> toMap() => {
        'cep': cep,
        'street': street,
        'number': number,
        'complement': complement,
        'district': district,
        'city': city,
        'state': state,
        'reference': reference,
      };

  factory DeliveryAddress.fromMap(Map<String, dynamic> m) {
    String f(String k) {
      final v = m[k];
      return v is String ? (v.length > 120 ? v.substring(0, 120) : v) : '';
    }

    return DeliveryAddress(
      cep: f('cep'),
      street: f('street'),
      number: f('number'),
      complement: f('complement'),
      district: f('district'),
      city: f('city'),
      state: f('state'),
      reference: f('reference'),
    );
  }

  bool get isValid =>
      cepDigits(cep).length == 8 &&
      street.trim().isNotEmpty &&
      number.trim().isNotEmpty &&
      district.trim().isNotEmpty &&
      city.trim().isNotEmpty &&
      ufs.contains(state.trim().toUpperCase());

  /// Formato aceito pelo backend (opcionais vazios viram null).
  Map<String, Object?> toApi() => {
        'cep': maskCep(cep),
        'street': street.trim(),
        'number': number.trim(),
        'complement': complement.trim().isEmpty ? null : complement.trim(),
        'district': district.trim(),
        'city': city.trim(),
        'state': state.trim().toUpperCase(),
        'reference': reference.trim().isEmpty ? null : reference.trim(),
      };

  static const storageKey = 'mundopet-address';

  static DeliveryAddress load(SharedPreferences? prefs) {
    try {
      final raw = prefs?.getString(storageKey);
      final parsed = raw == null ? null : jsonDecode(raw);
      return parsed is Map<String, dynamic> ? DeliveryAddress.fromMap(parsed) : const DeliveryAddress();
    } catch (_) {
      return const DeliveryAddress();
    }
  }

  void save(SharedPreferences? prefs) => prefs?.setString(storageKey, jsonEncode(toMap()));
}

class CepResult {
  const CepResult({required this.street, required this.district, required this.city, required this.state});

  final String street, district, city, state;
}

// ---------------- API ----------------

class CatalogApi {
  CatalogApi(this._api);

  final ApiClient _api;

  Future<ProductPage> search(Filters f, {int page = 0, int pageSize = 12}) async {
    final q = f.q.trim();
    final body = obj(await _api.getJson('/api/catalog/products', query: {
      'page': page,
      'pageSize': pageSize,
      'sort': f.sort,
      'q': q.length > 60 ? q.substring(0, 60) : q,
      'species': f.species,
      if (f.promo) 'promo': true,
    }));
    return ProductPage(objList(body['items']).map(Product.fromJson).toList(), intOr(body['total']), boolOr(body['hasMore']));
  }

  Future<Quote> quote(Map<String, Object?> request) async =>
      Quote.fromJson(obj(await _api.postJson('/api/catalog/cart/quote', request)));

  /// 404 => "CEP não encontrado".
  Future<CepResult> cep(String cep) async {
    try {
      final j = obj(await _api.getJson('/api/address/cep/${cepDigits(cep)}', attempts: 2));
      return CepResult(street: str(j['street']), district: str(j['district']), city: str(j['city']), state: str(j['state']));
    } on ApiException catch (e) {
      if (e.status == 404) throw ApiException('CEP não encontrado.', status: 404);
      rethrow;
    }
  }
}

// ---------------- Carrinho ----------------

class CartLine {
  CartLine(this.product, this.quantity);

  final Product product;
  int quantity;
}

/// Carrinho do app (memoria). O preco final sempre vem do servidor (cotacao).
class Cart extends ChangeNotifier {
  final Map<String, CartLine> _lines = {};

  List<CartLine> get lines => _lines.values.toList();
  int get count => _lines.values.fold(0, (s, l) => s + l.quantity);
  bool get isEmpty => _lines.isEmpty;

  /// Estimativa local (para a barra); o total real vem da cotacao.
  double get estimate => _lines.values.fold(0.0, (s, l) => s + l.product.effectivePrice * l.quantity);

  int qty(String productId) => _lines[productId]?.quantity ?? 0;

  void add(Product p) => setQty(p, qty(p.id) + 1);

  void setQty(Product p, int quantity) {
    final q = quantity.clamp(0, p.maxQty);
    if (q == 0) {
      _lines.remove(p.id);
    } else {
      (_lines[p.id] ??= CartLine(p, q)).quantity = q;
    }
    notifyListeners();
  }

  void removeMany(Iterable<String> ids) {
    var changed = false;
    for (final id in ids) {
      changed = _lines.remove(id) != null || changed;
    }
    if (changed) notifyListeners();
  }

  void clear() {
    _lines.clear();
    notifyListeners();
  }

  List<Map<String, Object>> toApi() => [
        for (final l in _lines.values) {'productId': l.product.id, 'quantity': l.quantity}
      ];
}
