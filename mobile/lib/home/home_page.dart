import 'package:flutter/material.dart';

import '../app.dart';
import '../beauty/beauty_models.dart';
import '../core/api.dart';
import '../core/format.dart';
import '../core/site.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

/// Tela inicial: a mesma historia da landing do site (hero, numeros, servicos, depoimentos reais,
/// convite e "onde estamos"), com os textos que o dono edita em /gestao.
class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  TestimonialPage? _reviews;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _loadReviews();
    }
  }

  Future<void> _loadReviews() async {
    try {
      final page = await AppScope.of(context).services.beauty.testimonials(size: 3);
      if (mounted) setState(() => _reviews = page);
    } on ApiException {
      // sem depoimentos: a secao mostra o convite
    }
  }

  Future<void> _refresh() async {
    final scope = AppScope.of(context);
    await Future.wait([scope.site.load(), _loadReviews()]);
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    return ListenableBuilder(
      listenable: scope.site,
      builder: (context, _) {
        final s = scope.site.settings;
        return RefreshIndicator(
          onRefresh: _refresh,
          child: ListView(
            key: const Key('home-list'),
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              _Hero(settings: s),
              _Stats(stats: s.stats, reviews: _reviews),
              for (final (i, c) in s.enabledChapters.indexed) _ChapterCard(chapter: c, number: i + 1),
              _Reviews(page: _reviews),
              _Invite(settings: s),
              _WhereWeAre(settings: s),
              _Footer(name: s.store.name),
            ],
          ),
        );
      },
    );
  }
}

const _gutter = EdgeInsets.symmetric(horizontal: 20);

Color sceneColor(BuildContext context, ChapterId id) {
  final p = context.pal;
  switch (id) {
    case ChapterId.hotel:
      return p.hotel;
    case ChapterId.racoes:
      return p.food;
    case ChapterId.beleza:
      return p.beauty;
    case ChapterId.veterinario:
      return p.vet;
  }
}

IconData sceneIcon(ChapterId id) {
  switch (id) {
    case ChapterId.hotel:
      return Icons.night_shelter_outlined;
    case ChapterId.racoes:
      return Icons.rice_bowl_outlined;
    case ChapterId.beleza:
      return Icons.content_cut_rounded;
    case ChapterId.veterinario:
      return Icons.favorite_border_rounded;
  }
}

class _Hero extends StatelessWidget {
  const _Hero({required this.settings});

  final SiteSettings settings;

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final p = context.pal;
    final hero = settings.hero;
    return Container(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(0.9, -0.9),
          radius: 1.2,
          colors: [p.gold.withValues(alpha: 0.18), p.bg.withValues(alpha: 0)],
        ),
      ),
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 36),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        if (settings.announcementText case final text?)
          Reveal(
            child: Container(
              key: const Key('announcement'),
              margin: const EdgeInsets.only(bottom: 20),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: p.gold.withValues(alpha: 0.5)),
                color: p.gold.withValues(alpha: 0.1),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text('✦ ', style: TextStyle(color: p.gold)),
                Flexible(child: Text(text, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
              ]),
            ),
          ),
        Reveal(child: Kicker(hero.kicker)),
        const SizedBox(height: 14),
        Reveal(delay: const Duration(milliseconds: 80), child: HeadlineText(hero.title, hero.highlight, size: 40)),
        const SizedBox(height: 16),
        Reveal(
          delay: const Duration(milliseconds: 160),
          child: Text(hero.text, style: TextStyle(color: p.muted, fontSize: 16, height: 1.5)),
        ),
        const SizedBox(height: 26),
        Reveal(
          delay: const Duration(milliseconds: 240),
          child: Wrap(spacing: 10, runSpacing: 10, children: [
            FilledButton.icon(
              key: const Key('hero-whatsapp'),
              onPressed: () => scope.whatsapp(context),
              icon: const Icon(Icons.calendar_month_outlined, size: 18),
              label: const Text('Agendar visita'),
            ),
            if (settings.isOn(ChapterId.racoes))
              OutlinedButton(onPressed: () => scope.tab.value = AppTab.shop, child: const Text('Loja de rações')),
          ]),
        ),
        const SizedBox(height: 22),
        Reveal(
          delay: const Duration(milliseconds: 320),
          child: Row(children: [
            const _LiveDot(),
            const SizedBox(width: 8),
            Expanded(child: Text(settings.clinicHours, style: TextStyle(color: p.ink, fontSize: 13))),
          ]),
        ),
      ]),
    );
  }
}

/// Bolinha verde "aberto agora" da clinica.
class _LiveDot extends StatelessWidget {
  const _LiveDot();

  @override
  Widget build(BuildContext context) => Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: const Color(0xFF3ECF8E),
          boxShadow: [BoxShadow(color: const Color(0xFF3ECF8E).withValues(alpha: 0.5), blurRadius: 8, spreadRadius: 1)],
        ),
      );
}

class _Stats extends StatelessWidget {
  const _Stats({required this.stats, required this.reviews});

  final List<Stat> stats;
  final TestimonialPage? reviews;

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    final real = reviews != null && reviews!.count > 0 ? reviews!.average : null;
    final shown = [for (final s in stats) s.rating && real != null ? s.withValue(real) : s];
    Widget tile(int i) {
      final s = shown[i];
      return Expanded(
        child: Reveal(
          delay: Duration(milliseconds: 60 * i),
          child: Container(
            height: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: p.line),
              color: p.bg2,
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
              _CountUp(stat: s),
              const SizedBox(height: 6),
              Text(s.label, style: TextStyle(color: p.muted, fontSize: 12.5)),
            ]),
          ),
        ),
      );
    }

    // 2 por linha; a altura cresce com o texto (fonte grande do sistema nao corta nada)
    return Padding(
      padding: _gutter,
      child: Column(children: [
        for (var i = 0; i < shown.length; i += 2)
          Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: IntrinsicHeight(
              child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                tile(i),
                const SizedBox(width: 10),
                if (i + 1 < shown.length) tile(i + 1) else const Expanded(child: SizedBox.shrink()),
              ]),
            ),
          ),
      ]),
    );
  }
}

class _CountUp extends StatelessWidget {
  const _CountUp({required this.stat});

  final Stat stat;

  String _text(double v) => '${stat.prefix}${number(v, stat.decimals)}${stat.suffix}';

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(fontFamily: displayFont, fontSize: 28, color: context.pal.gold, height: 1);
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return Text(_text(stat.value), style: style);
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: stat.value),
      duration: const Duration(milliseconds: 1400),
      curve: Curves.easeOutCubic,
      builder: (_, v, _) => Text(_text(v), style: style),
    );
  }
}

class _ChapterCard extends StatelessWidget {
  const _ChapterCard({required this.chapter, required this.number});

  final Chapter chapter;
  final int number;

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final p = context.pal;
    final color = sceneColor(context, chapter.id);
    final opensTab = switch (chapter.id) {
      ChapterId.racoes => AppTab.shop,
      _ => null,
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 0),
      child: Reveal(
        child: Card(
          key: Key('chapter-${chapter.id.name}'),
          clipBehavior: Clip.antiAlias,
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
                colors: [color.withValues(alpha: 0.16), p.bg2.withValues(alpha: 0)],
                stops: const [0, 0.6],
              ),
            ),
            padding: const EdgeInsets.all(20),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: color.withValues(alpha: 0.6))),
                  child: Icon(sceneIcon(chapter.id), color: color, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(child: Kicker(chapter.kicker, color: color)),
                Text(number.toString().padLeft(2, '0'),
                    style: TextStyle(fontFamily: displayFont, fontSize: 22, color: p.muted.withValues(alpha: 0.6))),
              ]),
              const SizedBox(height: 16),
              HeadlineText(chapter.title, chapter.highlight, size: 28, color: color),
              const SizedBox(height: 10),
              Text(chapter.text, style: TextStyle(color: p.muted, height: 1.5)),
              const SizedBox(height: 14),
              for (final f in chapter.features)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Icon(Icons.check_rounded, size: 18, color: color),
                    const SizedBox(width: 8),
                    Expanded(child: Text(f)),
                  ]),
                ),
              const SizedBox(height: 16),
              Wrap(spacing: 10, runSpacing: 10, children: [
                FilledButton(
                  onPressed: () => opensTab != null
                      ? scope.tab.value = opensTab
                      : scope.whatsapp(context, 'Olá! Vim pelo app do ${scope.site.settings.store.name}. ${chapter.cta}, por favor.'),
                  child: Text(chapter.cta),
                ),
                if (chapter.id == ChapterId.beleza)
                  OutlinedButton(onPressed: () => scope.tab.value = AppTab.beauty, child: const Text('Ver fotos')),
              ]),
            ]),
          ),
        ),
      ),
    );
  }
}

class _Reviews extends StatelessWidget {
  const _Reviews({required this.page});

  final TestimonialPage? page;

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final p = context.pal;
    final items = page?.items ?? const <Testimonial>[];
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 40, 20, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Kicker('Quem conhece, recomenda'),
        const SizedBox(height: 10),
        const HeadlineText('O que dizem os', 'tutores', size: 28),
        if (page != null && page!.count > 0) ...[
          const SizedBox(height: 8),
          Text('${stars(page!.average)}  ${rating(page!.average)} · ${page!.count} ${page!.count == 1 ? 'avaliação' : 'avaliações'}',
              key: const Key('rating-summary'), style: TextStyle(color: p.gold)),
        ],
        const SizedBox(height: 16),
        if (items.isEmpty)
          Container(
            key: const Key('reviews-invite'),
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: p.line)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Ainda não há depoimentos publicados. Seu pet já passou pelo nosso spa?'),
              const SizedBox(height: 10),
              TextButton(onPressed: () => scope.tab.value = AppTab.beauty, child: const Text('Deixe o primeiro depoimento →')),
            ]),
          )
        else ...[
          for (final t in items) Padding(padding: const EdgeInsets.only(bottom: 12), child: TestimonialCard(t)),
          TextButton(onPressed: () => scope.tab.value = AppTab.beauty, child: const Text('Ver todos no Espaço Beleza →')),
        ],
      ]),
    );
  }
}

/// Cartao de depoimento (usado tambem no Espaco Beleza).
class TestimonialCard extends StatelessWidget {
  const TestimonialCard(this.t, {super.key});

  final Testimonial t;

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(18), border: Border.all(color: p.line), color: p.bg2),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Semantics(
          label: '${t.rating} de 5 estrelas',
          excludeSemantics: true,
          child: Text(stars(t.rating), style: TextStyle(color: p.gold, letterSpacing: 2)),
        ),
        const SizedBox(height: 8),
        Text('“${t.message}”', style: const TextStyle(fontFamily: displayFont, fontStyle: FontStyle.italic, fontSize: 16, height: 1.45)),
        const SizedBox(height: 10),
        Text(t.authorLine, style: TextStyle(color: p.gold, fontSize: 12.5)),
      ]),
    );
  }
}

class _Invite extends StatelessWidget {
  const _Invite({required this.settings});

  final SiteSettings settings;

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final p = context.pal;
    final cta = settings.cta;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 36, 20, 0),
      child: Reveal(
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(26),
            gradient: RadialGradient(
              center: const Alignment(-0.8, -1),
              radius: 1.4,
              colors: [p.gold.withValues(alpha: 0.22), p.bg2],
            ),
            border: Border.all(color: p.gold.withValues(alpha: 0.35)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Kicker(cta.kicker),
            const SizedBox(height: 12),
            HeadlineText(cta.title, cta.highlight, size: 32),
            const SizedBox(height: 12),
            Text(cta.text, style: TextStyle(color: p.muted, height: 1.5)),
            const SizedBox(height: 20),
            FilledButton.icon(
              onPressed: () => scope.whatsapp(context),
              icon: const Icon(Icons.chat_bubble_outline_rounded, size: 18),
              label: const Text('Chamar no WhatsApp'),
            ),
          ]),
        ),
      ),
    );
  }
}

class _WhereWeAre extends StatelessWidget {
  const _WhereWeAre({required this.settings});

  final SiteSettings settings;

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final p = context.pal;
    final s = settings.store;
    final a = settings.address;
    Widget row(IconData icon, String text) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Icon(icon, size: 18, color: p.gold),
            const SizedBox(width: 10),
            Expanded(child: Text(text)),
          ]),
        );
    final open = scope.services.open;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 40, 20, 0),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Kicker('Onde estamos'),
        const SizedBox(height: 10),
        Text(s.about, style: TextStyle(color: p.muted, height: 1.5)),
        const SizedBox(height: 14),
        row(Icons.place_outlined, [a.line1, a.line2].where((l) => l.isNotEmpty).join('\n')),
        row(Icons.schedule_rounded, settings.storeHours),
        if (settings.clinicHours.isNotEmpty) row(Icons.local_hospital_outlined, settings.clinicHours),
        if (s.email.isNotEmpty) row(Icons.mail_outline_rounded, s.email),
        const SizedBox(height: 14),
        Wrap(spacing: 10, runSpacing: 10, children: [
          OutlinedButton.icon(
            key: const Key('maps'),
            onPressed: () => openLink(context, open, mapsLink(a)),
            icon: const Icon(Icons.map_outlined, size: 18),
            label: const Text('Como chegar'),
          ),
          if (s.instagram.isNotEmpty)
            OutlinedButton(onPressed: () => openLink(context, open, Uri.parse(s.instagram)), child: const Text('Instagram')),
          if (s.facebook.isNotEmpty)
            OutlinedButton(onPressed: () => openLink(context, open, Uri.parse(s.facebook)), child: const Text('Facebook')),
          if (s.email.isNotEmpty)
            OutlinedButton(onPressed: () => openLink(context, open, Uri(scheme: 'mailto', path: s.email)), child: const Text('E-mail')),
        ]),
      ]),
    );
  }
}

class _Footer extends StatelessWidget {
  const _Footer({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 40, 20, 0),
        child: Column(children: [
          Divider(color: context.pal.line),
          const SizedBox(height: 18),
          const Logo(size: 15),
          const SizedBox(height: 8),
          Text('© ${DateTime.now().year} $name · Feito com carinho para quem tem quatro patas.',
              textAlign: TextAlign.center, style: TextStyle(color: context.pal.muted, fontSize: 12)),
        ]),
      );
}
