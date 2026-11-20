import 'package:flutter/foundation.dart';

import 'api.dart';

// Configuracao do site editada pelo dono em /gestao (modulo "site" do backend).
// Os PADROES abaixo sao os mesmos do site (frontend/src/app/core/site-config.ts) e valem
// enquanto o dono nao salvar, para campo faltando, ou se a API estiver fora do ar.

enum ChapterId { hotel, racoes, beleza, veterinario }

class StoreInfo {
  const StoreInfo({
    required this.name,
    required this.about,
    required this.whatsapp,
    required this.whatsappMessage,
    required this.instagram,
    required this.facebook,
    required this.email,
  });

  final String name, about, whatsapp, whatsappMessage, instagram, facebook, email;

  StoreInfo merge(Map<String, dynamic> j) => StoreInfo(
        name: str(j['name'], name),
        about: str(j['about'], about),
        whatsapp: str(j['whatsapp'], whatsapp),
        whatsappMessage: str(j['whatsappMessage'], whatsappMessage),
        instagram: str(j['instagram'], instagram),
        facebook: str(j['facebook'], facebook),
        email: str(j['email'], email),
      );
}

class StoreAddress {
  const StoreAddress({
    required this.street,
    required this.district,
    required this.city,
    required this.state,
    required this.zip,
    required this.lat,
    required this.lng,
    required this.mapsQuery,
  });

  final String street, district, city, state, zip, mapsQuery;
  final double lat, lng;

  StoreAddress merge(Map<String, dynamic> j) => StoreAddress(
        street: str(j['street'], street),
        district: str(j['district'], district),
        city: str(j['city'], city),
        state: str(j['state'], state),
        zip: str(j['zip'], zip),
        lat: numOr(j['lat'], lat),
        lng: numOr(j['lng'], lng),
        mapsQuery: str(j['mapsQuery'], mapsQuery),
      );

  String get line1 => [street, district].where((s) => s.isNotEmpty).join(' · ');
  String get line2 => [[city, state].where((s) => s.isNotEmpty).join(' – '), zip].where((s) => s.isNotEmpty).join(' · ');
}

/// Titulo com a parte em destaque (dourada, italica): "Tudo o que o seu melhor amigo" + "merece".
class Headline {
  const Headline({required this.kicker, required this.title, required this.highlight, required this.text});

  final String kicker, title, highlight, text;

  Headline merge(Map<String, dynamic> j, {String textKey = 'text'}) => Headline(
        kicker: str(j['kicker'], kicker),
        title: str(j['title'], title),
        highlight: str(j['highlight'], highlight),
        text: str(j[textKey], text),
      );
}

class Chapter {
  const Chapter({
    required this.id,
    required this.enabled,
    required this.kicker,
    required this.title,
    required this.highlight,
    required this.text,
    required this.features,
    required this.cta,
  });

  final ChapterId id;
  final bool enabled;
  final String kicker, title, highlight, text, cta;
  final List<String> features;

  Chapter merge(Map<String, dynamic> j) => Chapter(
        id: id,
        enabled: boolOr(j['enabled'], enabled),
        kicker: str(j['kicker'], kicker),
        title: str(j['title'], title),
        highlight: str(j['highlight'], highlight),
        text: str(j['text'], text),
        features: j['features'] is List ? (j['features'] as List).whereType<String>().toList() : features,
        cta: str(j['cta'], cta),
      );
}

class Stat {
  const Stat({required this.label, required this.value, this.prefix = '', this.suffix = '', this.decimals = 0, this.rating = false});

  final String label, prefix, suffix;
  final double value;
  final int decimals;

  /// Fonte "RATING": mostra a nota media real dos depoimentos aprovados (quando existir).
  final bool rating;

  Stat merge(Map<String, dynamic> j) => Stat(
        label: str(j['label'], label),
        value: numOr(j['value'], value),
        prefix: str(j['prefix'], prefix),
        suffix: str(j['suffix'], suffix),
        decimals: intOr(j['decimals'], decimals).clamp(0, 2),
        rating: j['source'] is String ? j['source'] == 'RATING' : rating,
      );

  Stat withValue(double v) =>
      Stat(label: label, value: v, prefix: prefix, suffix: suffix, decimals: 1, rating: rating);
}

class SiteSettings {
  const SiteSettings({
    required this.store,
    required this.address,
    required this.storeHours,
    required this.clinicHours,
    required this.announcementEnabled,
    required this.announcement,
    required this.hero,
    required this.cta,
    required this.chapters,
    required this.stats,
    required this.pricePerKm,
    required this.maxKm,
  });

  final StoreInfo store;
  final StoreAddress address;
  final String storeHours, clinicHours, announcement;
  final bool announcementEnabled;
  final Headline hero, cta;

  /// Todos os capitulos, na ordem do dono (inclusive os desligados).
  final List<Chapter> chapters;
  final List<Stat> stats;
  final double pricePerKm, maxKm;

  List<Chapter> get enabledChapters => chapters.where((c) => c.enabled).toList();

  bool isOn(ChapterId id) => chapters.any((c) => c.id == id && c.enabled);

  String? get announcementText => announcementEnabled && announcement.trim().isNotEmpty ? announcement.trim() : null;

  /// Junta o que veio do servidor com os padroes (campo faltando ou de tipo errado = padrao).
  factory SiteSettings.fromJson(Object? json) {
    const d = defaultSite;
    if (json is! Map<String, dynamic>) return d;
    final hours = obj(json['hours']);
    final ann = obj(json['announcement']);
    final delivery = obj(json['delivery']);

    final server = objList(json['chapters']);
    final order = server.map((c) => c['id']).toList();
    int rank(Chapter c) {
      final i = order.indexOf(c.id.name);
      return i < 0 ? 99 : i;
    }

    final chapters = d.chapters
        .map((c) => c.merge(server.firstWhere((s) => s['id'] == c.id.name, orElse: () => const {})))
        .toList()
      ..sort((a, b) => rank(a).compareTo(rank(b)));

    final serverStats = objList(json['stats']).take(4).toList();
    final stats = serverStats.isEmpty
        ? d.stats
        : [for (var i = 0; i < serverStats.length; i++) d.stats[i < d.stats.length ? i : 0].merge(serverStats[i])];

    return SiteSettings(
      store: d.store.merge(obj(json['store'])),
      address: d.address.merge(obj(json['address'])),
      storeHours: str(hours['store'], d.storeHours),
      clinicHours: str(hours['clinic'], d.clinicHours),
      announcementEnabled: boolOr(ann['enabled'], d.announcementEnabled),
      announcement: str(ann['text'], d.announcement),
      hero: d.hero.merge(obj(json['hero']), textKey: 'subtitle'),
      cta: d.cta.merge(obj(json['cta'])),
      chapters: chapters,
      stats: stats,
      pricePerKm: numOr(delivery['pricePerKm'], d.pricePerKm),
      maxKm: numOr(delivery['maxKm'], d.maxKm),
    );
  }
}

const defaultSite = SiteSettings(
  store: StoreInfo(
    name: 'MundoPet',
    about: 'Hotel, rações, banho & tosa e clínica veterinária 24h. Tudo o que o seu melhor amigo merece, em um só lugar.',
    whatsapp: '5500000000000',
    whatsappMessage: 'Olá! Quero conhecer o MundoPet',
    instagram: 'https://www.instagram.com/',
    facebook: '',
    email: '',
  ),
  address: StoreAddress(
    street: 'Rua Exemplo, 123',
    district: 'Centro',
    city: 'São Paulo',
    state: 'SP',
    zip: '01000-000',
    lat: -23.5505,
    lng: -46.6333,
    mapsQuery: '',
  ),
  storeHours: 'Seg a Sáb · 8h às 20h',
  clinicHours: 'Clínica: 24 horas',
  announcementEnabled: false,
  announcement: '',
  hero: Headline(
    kicker: 'Pet shop · Hotel · Spa · Clínica',
    title: 'Tudo o que o seu melhor amigo',
    highlight: 'merece',
    text: 'Hospedagem com carinho, nutrição de verdade, beleza de spa e veterinários 24h — tudo em um só lugar.',
  ),
  cta: Headline(
    kicker: 'Portas abertas todos os dias',
    title: 'Venha nos',
    highlight: 'conhecer',
    text: 'Traga seu pet para um tour: conheça as suítes do hotel, o spa e a clínica. O primeiro petisco é por nossa conta.',
  ),
  chapters: [
    Chapter(
      id: ChapterId.hotel,
      enabled: true,
      kicker: 'Hotel & Day Care',
      title: 'Férias para ele,',
      highlight: 'paz para você',
      text: 'Suítes climatizadas, recreação em grupo e câmeras ao vivo para você matar a saudade pelo celular, de onde estiver.',
      features: ['Suítes climatizadas', 'Câmeras ao vivo 24h', 'Recreação monitorada', 'Relatório diário com fotos'],
      cta: 'Reservar hospedagem',
    ),
    Chapter(
      id: ChapterId.racoes,
      enabled: true,
      kicker: 'Rações & Petiscos',
      title: 'Nutrição que vira',
      highlight: 'energia',
      text: 'Rações premium, naturais e dietas veterinárias, com consultoria de nutrição para cada fase da vida do seu pet.',
      features: ['Linhas premium e naturais', 'Dietas veterinárias', 'Assinatura com desconto', 'Entrega no mesmo dia'],
      cta: 'Ver catálogo de rações',
    ),
    Chapter(
      id: ChapterId.beleza,
      enabled: true,
      kicker: 'Banho & Tosa',
      title: 'Saia do spa',
      highlight: 'irresistível',
      text: 'Banho com produtos hipoalergênicos, tosa na tesoura, hidratação e aromaterapia — com leva e traz.',
      features: ['Produtos hipoalergênicos', 'Tosa na tesoura e higiênica', 'Hidratação e aromaterapia', 'Leva e traz'],
      cta: 'Agendar banho',
    ),
    Chapter(
      id: ChapterId.veterinario,
      enabled: true,
      kicker: 'Clínica Veterinária',
      title: 'Cuidado de quem',
      highlight: 'entende',
      text: 'Consultas, vacinas, exames e especialistas. E se acontecer algo de madrugada, estamos aqui: atendimento 24h.',
      features: ['Pronto atendimento 24h', 'Vacinas e check-ups', 'Exames laboratoriais', 'Especialistas'],
      cta: 'Marcar consulta',
    ),
  ],
  stats: [
    Stat(value: 15000, prefix: '+', label: 'pets atendidos'),
    Stat(value: 12, suffix: ' anos', label: 'de experiência'),
    Stat(value: 4.9, suffix: '★', decimals: 1, label: 'avaliação média', rating: true),
    Stat(value: 24, suffix: 'h', label: 'de plantão veterinário'),
  ],
  pricePerKm: 2,
  maxKm: 15,
);

/// Le GET /api/site. Espera pouco e nunca falha: sem API o app segue com os padroes.
class SiteApi {
  SiteApi(this._api);

  final ApiClient _api;

  Future<SiteSettings> load({Duration wait = const Duration(seconds: 4)}) async {
    final body = await _api.getJson('/api/site', attempts: 1, wait: wait);
    return SiteSettings.fromJson(obj(body)['settings']);
  }
}

/// Configuracao viva: a tela inicial, a loja e o Espaco Beleza leem daqui.
class SiteController extends ChangeNotifier {
  SiteController(this._api);

  final SiteApi _api;
  SiteSettings _settings = defaultSite;
  bool _loaded = false;

  SiteSettings get settings => _settings;
  bool get loaded => _loaded;

  Future<void> load() async {
    try {
      _settings = await _api.load();
    } on ApiException {
      // fora do ar: mantem o que ja tinha (padroes ou a ultima versao)
    } finally {
      _loaded = true;
      notifyListeners();
    }
  }
}

/// Link do WhatsApp da loja com a mensagem pronta.
Uri waLink(String phone, String text) =>
    Uri.parse('https://wa.me/${phone.replaceAll(RegExp(r'\D'), '')}?text=${Uri.encodeComponent(text)}');

/// Google Maps: busca pelo nome/endereco cadastrado ou, sem isso, pelas coordenadas.
Uri mapsLink(StoreAddress a) {
  final q = a.mapsQuery.trim().isNotEmpty ? a.mapsQuery.trim() : '${a.lat},${a.lng}';
  return Uri.parse('https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(q)}');
}
