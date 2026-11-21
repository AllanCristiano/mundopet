import 'package:flutter/material.dart';

import 'theme.dart';

class BumpNavItem {
  const BumpNavItem({required this.icon, required this.activeIcon, required this.label, this.badge});

  final IconData icon;
  final IconData activeIcon;
  final String label;

  /// Numero no selo (ex.: itens no carrinho). Nulo ou 0 = sem selo.
  final int? badge;
}

/// Barra de abas com "calombo": a barra sobe em curva sobre a aba atual e o icone dela
/// fica dentro de um circulo dourado. O calombo desliza ate a aba tocada.
class BumpNavBar extends StatelessWidget {
  const BumpNavBar({super.key, required this.items, required this.index, required this.onTap});

  final List<BumpNavItem> items;
  final int index;
  final ValueChanged<int> onTap;

  static const double hump = 18; // quanto o calombo sobe acima da barra
  static const double barHeight = 64;
  static const double circle = 42;

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    final still = MediaQuery.maybeDisableAnimationsOf(context) ?? false;
    final bottom = MediaQuery.paddingOf(context).bottom;
    return SizedBox(
      height: hump + barHeight + bottom,
      child: LayoutBuilder(
        builder: (context, box) {
          final slot = box.maxWidth / items.length;
          return TweenAnimationBuilder<double>(
            tween: Tween(end: index.toDouble()),
            duration: still ? Duration.zero : const Duration(milliseconds: 480),
            curve: Curves.easeOutCubic,
            builder: (context, pos, _) {
              final cx = slot * (pos + 0.5);
              return Stack(clipBehavior: Clip.none, children: [
                Positioned.fill(child: CustomPaint(painter: BumpPainter(cx: cx, top: hump, fill: p.bg2, line: p.line))),
                // circulo dourado do item atual
                Positioned(
                  key: const Key('nav-active'),
                  left: cx - circle / 2,
                  top: 2,
                  child: IgnorePointer(
                    child: Container(
                      width: circle,
                      height: circle,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Color.alphaBlend(p.gold.withValues(alpha: 0.22), p.bg2),
                        border: Border.all(color: p.gold, width: 1.5),
                        boxShadow: [BoxShadow(color: p.gold.withValues(alpha: 0.35), blurRadius: 14, spreadRadius: -2)],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 0,
                  right: 0,
                  top: hump,
                  height: barHeight,
                  child: Row(children: [
                    for (var i = 0; i < items.length; i++)
                      Expanded(child: _Item(item: items[i], active: i == index, onTap: () => onTap(i), still: still)),
                  ]),
                ),
              ]);
            },
          );
        },
      ),
    );
  }
}

class _Item extends StatelessWidget {
  const _Item({required this.item, required this.active, required this.onTap, required this.still});

  final BumpNavItem item;
  final bool active;
  final VoidCallback onTap;
  final bool still;

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    final badge = item.badge ?? 0;
    final duration = still ? Duration.zero : const Duration(milliseconds: 380);
    return Semantics(
      button: true,
      selected: active,
      label: item.label,
      excludeSemantics: true,
      child: InkResponse(
        onTap: onTap,
        radius: 32,
        child: Column(mainAxisAlignment: MainAxisAlignment.start, children: [
          const SizedBox(height: 8),
          // o icone ativo sobe 15px para o centro do circulo (y 23) saindo de y 38 (18 + 8 + 12)
          AnimatedSlide(
            offset: active ? const Offset(0, -0.625) : Offset.zero,
            duration: duration,
            curve: Curves.easeOutBack,
            child: Badge(
              isLabelVisible: badge > 0,
              label: Text('$badge'),
              child: Icon(active ? item.activeIcon : item.icon, size: 24, color: active ? p.gold : p.muted),
            ),
          ),
          const SizedBox(height: 4),
          AnimatedDefaultTextStyle(
            duration: duration,
            style: TextStyle(
              fontSize: 12,
              color: active ? p.gold : p.muted,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            ),
            child: Text(item.label),
          ),
        ]),
      ),
    );
  }
}

/// Barra com a curva subindo sobre a aba atual.
class BumpPainter extends CustomPainter {
  BumpPainter({required this.cx, required this.top, required this.fill, required this.line});

  final double cx;
  final double top;
  final Color fill;
  final Color line;

  static const double halfWidth = 46;

  Path edge(double width) => Path()
    ..moveTo(0, top)
    ..lineTo(cx - halfWidth, top)
    ..cubicTo(cx - halfWidth * 0.55, top, cx - halfWidth * 0.62, 0, cx, 0)
    ..cubicTo(cx + halfWidth * 0.62, 0, cx + halfWidth * 0.55, top, cx + halfWidth, top)
    ..lineTo(width, top);

  @override
  void paint(Canvas canvas, Size size) {
    final body = edge(size.width)
      ..lineTo(size.width, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawShadow(body, Colors.black, 6, false);
    canvas.drawPath(body, Paint()..color = fill);
    canvas.drawPath(
      edge(size.width),
      Paint()
        ..color = line
        ..style = PaintingStyle.stroke
        ..strokeWidth = 1,
    );
  }

  @override
  bool shouldRepaint(BumpPainter old) => old.cx != cx || old.fill != fill || old.line != line || old.top != top;
}
