import 'package:flutter/material.dart';

import '../app.dart';
import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../home/home_page.dart' show TestimonialCard;
import 'beauty_models.dart';

/// Espaco Beleza: galeria das fotos que a clinica publica + depoimentos aprovados + "deixe o seu".
class BeautyPage extends StatefulWidget {
  const BeautyPage({super.key});

  @override
  State<BeautyPage> createState() => _BeautyPageState();
}

class _BeautyPageState extends State<BeautyPage> {
  String? _service;
  final List<BeautyPhoto> _photos = [];
  int _page = 0;
  bool _hasMore = false;
  bool _loading = false;
  String? _error;
  int _request = 0;

  TestimonialPage? _reviews;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _loadPhotos(reset: true);
      _loadReviews();
    }
  }

  BeautyApi get _api => AppScope.of(context).services.beauty;

  Future<void> _loadPhotos({bool reset = false}) async {
    final id = ++_request;
    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _photos.clear();
        _page = 0;
      }
    });
    try {
      final page = await _api.photos(service: _service, page: reset ? 0 : _page + 1);
      if (!mounted || id != _request) return;
      setState(() {
        if (!reset) _page++;
        _photos.addAll(page.items);
        _hasMore = page.hasMore;
      });
    } on ApiException catch (e) {
      if (mounted && id == _request) setState(() => _error = e.message);
    } finally {
      if (mounted && id == _request) setState(() => _loading = false);
    }
  }

  Future<void> _loadReviews() async {
    try {
      final r = await _api.testimonials();
      if (mounted) setState(() => _reviews = r);
    } on ApiException {
      // segue sem depoimentos
    }
  }

  void _filter(String? service) {
    if (service == _service) return;
    _service = service;
    _loadPhotos(reset: true);
  }

  void _open(BeautyPhoto photo) => Navigator.of(context).push(
        PageRouteBuilder<void>(
          opaque: false,
          barrierColor: Colors.black,
          pageBuilder: (_, _, _) => PhotoViewer(photo: photo),
          transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
        ),
      );

  Future<void> _write() async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => TestimonialForm(api: _api),
    );
    if (sent == true && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Obrigado! Seu depoimento aparece assim que a clínica aprovar.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final p = context.pal;
    final r = _reviews;
    return RefreshIndicator(
      onRefresh: () => Future.wait([_loadPhotos(reset: true), _loadReviews()]),
      child: CustomScrollView(
        key: const Key('beauty-list'),
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Kicker('Espaço Beleza', color: p.beauty),
                const SizedBox(height: 10),
                HeadlineText('Saíram do spa', 'irresistíveis', size: 34, color: p.beauty),
                const SizedBox(height: 8),
                Text('Fotos reais dos pets que passaram pelo nosso banho & tosa — publicadas pela própria clínica.',
                    style: TextStyle(color: p.muted, height: 1.45)),
                if (r != null && r.count > 0) ...[
                  const SizedBox(height: 10),
                  Text('${stars(r.average)}  ${rating(r.average)} · ${r.count} ${r.count == 1 ? 'avaliação' : 'avaliações'}',
                      key: const Key('beauty-rating'), style: TextStyle(color: p.gold)),
                ],
                const SizedBox(height: 16),
                Wrap(spacing: 10, runSpacing: 10, children: [
                  FilledButton.icon(
                    onPressed: () => scope.whatsapp(context, 'Olá! Vim pelo app e quero agendar banho & tosa.'),
                    icon: const Icon(Icons.calendar_month_outlined, size: 18),
                    label: const Text('Agendar banho'),
                  ),
                  OutlinedButton(key: const Key('write'), onPressed: _write, child: const Text('Deixar depoimento')),
                ]),
                const SizedBox(height: 18),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    _chip('Todos', null),
                    for (final s in serviceFilters) _chip(serviceLabels[s]!, s),
                  ]),
                ),
              ]),
            ),
          ),
          if (_photos.isEmpty && _loading)
            const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())))
          else if (_photos.isEmpty && _error != null)
            SliverToBoxAdapter(child: ErrorRetry(message: _error!, onRetry: () => _loadPhotos(reset: true)))
          else if (_photos.isEmpty)
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.all(28),
                child: Text(
                  _service == null ? 'Em breve, as primeiras fotos do nosso spa. 🐾' : 'Nenhuma foto desse serviço ainda.',
                  key: const Key('no-photos'),
                  textAlign: TextAlign.center,
                  style: TextStyle(color: p.muted),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              sliver: SliverGrid.builder(
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 0.82,
                ),
                itemCount: _photos.length,
                itemBuilder: (_, i) => Reveal(
                  delay: Duration(milliseconds: 40 * (i % 6)),
                  child: _Thumb(photo: _photos[i], onTap: () => _open(_photos[i])),
                ),
              ),
            ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: Center(
                child: _photos.isNotEmpty && _error != null
                    ? ErrorRetry(message: _error!, onRetry: _loadPhotos)
                    : _hasMore
                        ? OutlinedButton(
                            key: const Key('more-photos'),
                            onPressed: _loading ? null : _loadPhotos,
                            child: Text(_loading ? 'Carregando…' : 'Carregar mais'),
                          )
                        : const SizedBox.shrink(),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 32, 20, 32),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Kicker('Depoimentos'),
                const SizedBox(height: 10),
                const HeadlineText('Quem passou por', 'aqui', size: 28),
                const SizedBox(height: 14),
                if (r == null || r.items.isEmpty)
                  Text('Ainda não há depoimentos. Que tal ser o primeiro?', key: const Key('no-reviews'), style: TextStyle(color: p.muted))
                else
                  for (final t in r.items) Padding(padding: const EdgeInsets.only(bottom: 12), child: TestimonialCard(t)),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _write,
                  icon: const Icon(Icons.edit_outlined, size: 18),
                  label: const Text('Escrever depoimento'),
                ),
              ]),
            ),
          ),
        ],
      ),
    );
  }

  Widget _chip(String label, String? value) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: ChoiceChip(
          key: Key('svc-${value ?? 'ALL'}'),
          label: Text(label),
          selected: _service == value,
          selectedColor: context.pal.beauty.withValues(alpha: 0.22),
          onSelected: (_) => _filter(value),
        ),
      );
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.photo, required this.onTap});

  final BeautyPhoto photo;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    return Semantics(
      button: true,
      label: 'Foto de ${photo.petName}, ${photo.serviceLabel}. Toque para ampliar.',
      excludeSemantics: true,
      child: Material(
        color: p.bg3,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          key: Key('photo-${photo.id}'),
          onTap: onTap,
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Expanded(
              child: Hero(
                tag: 'beauty-${photo.id}',
                child: Image.network(
                  photo.thumbUrl,
                  fit: BoxFit.cover,
                  errorBuilder: (_, _, _) => Icon(Icons.pets, color: p.muted),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Text.rich(
                TextSpan(children: [
                  TextSpan(text: photo.petName, style: const TextStyle(fontWeight: FontWeight.w700)),
                  TextSpan(text: ' · ${photo.serviceLabel}', style: TextStyle(color: p.muted)),
                ]),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12.5),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

/// Foto em tela cheia com zoom de pinça.
class PhotoViewer extends StatelessWidget {
  const PhotoViewer({super.key, required this.photo});

  final BeautyPhoto photo;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(photo.petName),
      ),
      body: Column(children: [
        Expanded(
          child: InteractiveViewer(
            maxScale: 4,
            child: Center(
              child: Hero(
                tag: 'beauty-${photo.id}',
                child: Image.network(
                  photo.fullUrl,
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) => const Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
                ),
              ),
            ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(photo.serviceLabel.toUpperCase(),
                  style: const TextStyle(color: Color(0xFFF4A9C6), fontSize: 11.5, letterSpacing: 2.4, fontWeight: FontWeight.w600)),
              if (photo.caption != null) ...[
                const SizedBox(height: 6),
                Text(photo.caption!, key: const Key('caption'), style: const TextStyle(color: Colors.white, fontSize: 15)),
              ],
            ]),
          ),
        ),
      ]),
    );
  }
}

/// Formulario do depoimento (vai para aprovacao da clinica antes de aparecer).
class TestimonialForm extends StatefulWidget {
  const TestimonialForm({super.key, required this.api});

  final BeautyApi api;

  @override
  State<TestimonialForm> createState() => _TestimonialFormState();
}

class _TestimonialFormState extends State<TestimonialForm> {
  final _author = TextEditingController();
  final _pet = TextEditingController();
  final _message = TextEditingController();
  int _rating = 5;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _author.dispose();
    _pet.dispose();
    _message.dispose();
    super.dispose();
  }

  bool get _valid {
    final a = _author.text.trim().length;
    final m = _message.text.trim().length;
    return a >= 2 && a <= 60 && m >= messageMin && m <= messageMax;
  }

  Future<void> _submit() async {
    if (!_valid || _sending) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await widget.api.submit(author: _author.text, petName: _pet.text, rating: _rating, message: _message.text);
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    final left = messageMax - _message.text.trim().length;
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const HeadlineText('Conte como', 'foi', size: 26),
          const SizedBox(height: 6),
          Text('Seu depoimento aparece depois que a clínica aprovar.', style: TextStyle(color: p.muted, fontSize: 13)),
          const SizedBox(height: 16),
          Semantics(
            label: 'Nota: $_rating de 5',
            child: Row(children: [
              for (var n = 1; n <= 5; n++)
                IconButton(
                  key: Key('star-$n'),
                  tooltip: '$n ${n == 1 ? 'estrela' : 'estrelas'}',
                  icon: Icon(n <= _rating ? Icons.star_rounded : Icons.star_border_rounded, color: p.gold, size: 30),
                  onPressed: () => setState(() => _rating = n),
                ),
            ]),
          ),
          const SizedBox(height: 8),
          TextField(
            key: const Key('t-author'),
            controller: _author,
            maxLength: 60,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Seu nome', counterText: ''),
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('t-pet'),
            controller: _pet,
            maxLength: 40,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Nome do pet (opcional)', counterText: ''),
          ),
          const SizedBox(height: 12),
          TextField(
            key: const Key('t-message'),
            controller: _message,
            maxLength: messageMax,
            minLines: 3,
            maxLines: 6,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              labelText: 'Depoimento',
              counterText: '',
              helperText: _message.text.trim().length < messageMin ? 'Mínimo de $messageMin caracteres' : '$left restantes',
            ),
            onChanged: (_) => setState(() {}),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, key: const Key('t-error'), style: TextStyle(color: p.danger)),
          ],
          const SizedBox(height: 16),
          FilledButton(
            key: const Key('t-send'),
            onPressed: _valid && !_sending ? _submit : null,
            child: Text(_sending ? 'Enviando…' : 'Enviar depoimento'),
          ),
        ]),
      ),
    );
  }
}
