import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'theme.dart';

/// Abre um link fora do app (WhatsApp, mapa, Instagram). Injetavel para os testes.
typedef LinkOpener = Future<bool> Function(Uri uri);

Future<bool> launchExternal(Uri uri) async {
  try {
    return await launchUrl(uri, mode: LaunchMode.externalApplication);
  } catch (_) {
    return false;
  }
}

/// Abre o link e avisa se nao deu (ex.: WhatsApp nao instalado e sem navegador).
Future<void> openLink(BuildContext context, LinkOpener opener, Uri uri) async {
  final messenger = ScaffoldMessenger.maybeOf(context);
  final ok = await opener(uri);
  if (!ok) messenger?.showSnackBar(const SnackBar(content: Text('Não foi possível abrir o link.')));
}

/// Entrada suave (sobe + aparece), como os "reveal" do site.
/// So mexe em opacidade/posicao e respeita "remover animacoes" do sistema.
class Reveal extends StatefulWidget {
  const Reveal({super.key, required this.child, this.delay = Duration.zero, this.offset = 0.06});

  final Widget child;
  final Duration delay;
  final double offset;

  @override
  State<Reveal> createState() => _RevealState();
}

class _RevealState extends State<Reveal> with SingleTickerProviderStateMixin {
  static const _duration = Duration(milliseconds: 650);
  late final AnimationController _c = AnimationController(vsync: this, duration: _duration + widget.delay);
  late final Animation<double> _t = CurvedAnimation(
    parent: _c,
    curve: Interval(widget.delay.inMilliseconds / (_duration + widget.delay).inMilliseconds, 1, curve: Curves.easeOutCubic),
  );

  @override
  void initState() {
    super.initState();
    _c.forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (MediaQuery.maybeDisableAnimationsOf(context) ?? false) return widget.child;
    return FadeTransition(
      opacity: _t,
      child: SlideTransition(
        position: Tween(begin: Offset(0, widget.offset), end: Offset.zero).animate(_t),
        child: widget.child,
      ),
    );
  }
}

/// Rotulo pequeno em caixa alta, espacado (o "kicker" do site).
class Kicker extends StatelessWidget {
  const Kicker(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w600, letterSpacing: 2.6, color: color ?? context.pal.gold),
      );
}

/// Titulo serifado com a parte em destaque em italico dourado.
class HeadlineText extends StatelessWidget {
  const HeadlineText(this.title, this.highlight, {super.key, this.size = 30, this.color, this.textAlign});

  final String title;
  final String highlight;
  final double size;
  final Color? color;
  final TextAlign? textAlign;

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    return Text.rich(
      TextSpan(children: [
        TextSpan(text: title),
        if (highlight.isNotEmpty) TextSpan(text: title.isEmpty ? highlight : ' $highlight', style: TextStyle(fontStyle: FontStyle.italic, color: color ?? p.gold)),
      ]),
      textAlign: textAlign,
      style: TextStyle(fontFamily: displayFont, fontSize: size, height: 1.1, color: p.ink, fontWeight: FontWeight.w500),
    );
  }
}

/// "MUNDO ✦ PET"
class Logo extends StatelessWidget {
  const Logo({super.key, this.size = 17});

  final double size;

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    return Semantics(
      label: 'MundoPet',
      excludeSemantics: true,
      child: Text.rich(
        TextSpan(children: [
          const TextSpan(text: 'MUNDO '),
          TextSpan(text: '✦', style: TextStyle(color: p.gold)),
          const TextSpan(text: ' PET'),
        ]),
        style: TextStyle(fontFamily: displayFont, fontSize: size, letterSpacing: size * 0.3, color: p.ink),
      ),
    );
  }
}

/// Estado de erro com "Tentar de novo".
class ErrorRetry extends StatelessWidget {
  const ErrorRetry({super.key, required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 32, horizontal: 20),
        child: Column(children: [
          Icon(Icons.cloud_off_rounded, color: context.pal.muted, size: 32),
          const SizedBox(height: 10),
          Text(message, key: const Key('error'), textAlign: TextAlign.center),
          const SizedBox(height: 14),
          OutlinedButton(onPressed: onRetry, child: const Text('Tentar de novo')),
        ]),
      );
}

/// Cor "#4f9a5b" do produto (cai no dourado se vier invalida).
Color hexColor(String? hex, Color fallback) {
  final h = (hex ?? '').replaceFirst('#', '');
  final v = h.length == 6 ? int.tryParse(h, radix: 16) : null;
  return v == null ? fallback : Color(0xFF000000 | v);
}
