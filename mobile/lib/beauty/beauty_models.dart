import '../core/api.dart';

// Espaco Beleza: fotos publicadas pela clinica (servidas pela API a partir do MinIO) e depoimentos aprovados.

const serviceLabels = {
  'BANHO': 'Banho',
  'TOSA': 'Tosa',
  'BANHO_TOSA': 'Banho & Tosa',
  'HIDRATACAO': 'Hidratação',
  'SPA': 'Spa',
  'OUTRO': 'Outro',
};

/// Ordem dos filtros da galeria (igual ao site).
const serviceFilters = ['BANHO_TOSA', 'BANHO', 'TOSA', 'HIDRATACAO', 'SPA'];

const messageMin = 10;
const messageMax = 600;

class BeautyPhoto {
  const BeautyPhoto({
    required this.id,
    required this.petName,
    required this.service,
    required this.thumbUrl,
    required this.fullUrl,
    this.caption,
    this.width = 0,
    this.height = 0,
  });

  final String id, petName, service, thumbUrl, fullUrl;
  final String? caption;
  final int width, height;

  String get serviceLabel => serviceLabels[service] ?? service;

  factory BeautyPhoto.fromJson(Map<String, dynamic> j, String Function(String) absolute) => BeautyPhoto(
        id: str(j['id']),
        petName: str(j['petName']),
        service: str(j['service'], 'OUTRO'),
        caption: optStr(j['caption']),
        width: intOr(j['width']),
        height: intOr(j['height']),
        thumbUrl: absolute(str(j['thumbUrl'])),
        fullUrl: absolute(str(j['fullUrl'])),
      );
}

class Testimonial {
  const Testimonial({required this.id, required this.author, required this.rating, required this.message, this.petName});

  final String id, author, message;
  final String? petName;
  final int rating;

  /// "Ana · com o Thor" de forma neutra: "Ana · com Thor".
  String get authorLine => petName == null ? author : '$author · com $petName';

  factory Testimonial.fromJson(Map<String, dynamic> j) => Testimonial(
        id: str(j['id']),
        author: str(j['author']),
        petName: optStr(j['petName']),
        rating: intOr(j['rating'], 5).clamp(1, 5),
        message: str(j['message']),
      );
}

class Paged<T> {
  const Paged(this.items, this.hasMore);

  final List<T> items;
  final bool hasMore;
}

class TestimonialPage extends Paged<Testimonial> {
  const TestimonialPage(super.items, super.hasMore, {required this.average, required this.count});

  final double average;
  final int count;
}

class BeautyApi {
  BeautyApi(this._api);

  final ApiClient _api;

  Future<Paged<BeautyPhoto>> photos({String? service, int page = 0, int size = 24}) async {
    final body = obj(await _api.getJson('/api/beauty/photos', query: {'page': page, 'size': size, 'service': service}));
    return Paged(objList(body['items']).map((j) => BeautyPhoto.fromJson(j, _api.absolute)).toList(), boolOr(body['hasMore']));
  }

  Future<TestimonialPage> testimonials({int page = 0, int size = 12}) async {
    final body = obj(await _api.getJson('/api/beauty/testimonials', query: {'page': page, 'size': size}));
    final summary = obj(body['summary']);
    return TestimonialPage(
      objList(body['items']).map(Testimonial.fromJson).toList(),
      boolOr(body['hasMore']),
      average: numOr(summary['average']),
      count: intOr(summary['count']),
    );
  }

  /// Envia para aprovacao da clinica. Devolve a mensagem do servidor.
  /// "website" e o campo-isca anti-robo: pessoas nunca preenchem.
  Future<String> submit({required String author, String? petName, required int rating, required String message}) async {
    final body = await _api.postJson('/api/beauty/testimonials', {
      'author': author.trim(),
      'petName': (petName ?? '').trim().isEmpty ? null : petName!.trim(),
      'rating': rating,
      'message': message.trim(),
      'website': '',
    });
    return str(obj(body)['message'], 'Obrigado! Seu depoimento aparece assim que a clínica aprovar.');
  }
}
