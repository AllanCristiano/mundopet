import 'package:flutter/material.dart';

import '../app.dart';
import '../core/api.dart';
import '../core/format.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import 'cart_page.dart';
import 'shop_models.dart';

/// Loja de racoes: busca, filtros rapidos, cards com promocao e carrinho que vira pedido no WhatsApp.
class ShopPage extends StatefulWidget {
  const ShopPage({super.key});

  @override
  State<ShopPage> createState() => _ShopPageState();
}

class _ShopPageState extends State<ShopPage> {
  final _search = TextEditingController();
  Filters _filters = const Filters();
  final List<Product> _items = [];
  int _page = 0;
  int _total = 0;
  bool _hasMore = false;
  bool _loading = false;
  String? _error;
  int _request = 0;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _load(reset: true);
    }
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  CatalogApi get _api => AppScope.of(context).services.catalog;

  Future<void> _load({bool reset = false}) async {
    final id = ++_request; // resposta antiga (filtro trocado no meio) e descartada
    setState(() {
      _loading = true;
      _error = null;
      if (reset) {
        _items.clear();
        _page = 0;
      }
    });
    try {
      final page = await _api.search(_filters, page: reset ? 0 : _page + 1);
      if (!mounted || id != _request) return;
      setState(() {
        if (!reset) _page++;
        _items.addAll(page.items);
        _total = page.total;
        _hasMore = page.hasMore;
      });
    } on ApiException catch (e) {
      if (mounted && id == _request) setState(() => _error = e.message);
    } finally {
      if (mounted && id == _request) setState(() => _loading = false);
    }
  }

  void _apply(Filters f) {
    _filters = f;
    _load(reset: true);
  }

  void _openCart() => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const CartPage()));

  @override
  Widget build(BuildContext context) {
    final cart = AppScope.of(context).cart;
    return Stack(children: [
      RefreshIndicator(
        onRefresh: () => _load(reset: true),
        child: CustomScrollView(
          key: const Key('shop-list'),
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            SliverToBoxAdapter(child: _header(context)),
            if (_items.isEmpty && _loading)
              const SliverToBoxAdapter(child: Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator())))
            else if (_items.isEmpty && _error != null)
              SliverToBoxAdapter(child: ErrorRetry(message: _error!, onRetry: () => _load(reset: true)))
            else if (_items.isEmpty)
              SliverToBoxAdapter(child: _empty(context))
            else
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverList.separated(
                  itemCount: _items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 12),
                  itemBuilder: (_, i) => ProductCard(product: _items[i]),
                ),
              ),
            SliverToBoxAdapter(child: _footer(context)),
          ],
        ),
      ),
      Positioned(
        left: 16,
        right: 16,
        bottom: 12,
        child: ListenableBuilder(
          listenable: cart,
          builder: (context, _) => AnimatedSlide(
            offset: cart.isEmpty ? const Offset(0, 2) : Offset.zero,
            duration: const Duration(milliseconds: 300),
            curve: Curves.easeOutCubic,
            child: cart.isEmpty ? const SizedBox.shrink() : _CartBar(cart: cart, onOpen: _openCart),
          ),
        ),
      ),
    ]);
  }

  Widget _header(BuildContext context) {
    final p = context.pal;
    final f = _filters;
    Widget chip(String label, bool on, VoidCallback tap, {Key? key}) => Padding(
          padding: const EdgeInsets.only(right: 8),
          child: ChoiceChip(key: key, label: Text(label), selected: on, onSelected: (_) => tap()),
        );
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Kicker('Loja de rações'),
        const SizedBox(height: 10),
        const HeadlineText('Nutrição que vira', 'energia', size: 32),
        const SizedBox(height: 8),
        Text('Monte o pedido aqui e finalize pelo WhatsApp. Retire na loja ou receba em casa.',
            style: TextStyle(color: p.muted, height: 1.45)),
        const SizedBox(height: 18),
        TextField(
          key: const Key('search'),
          controller: _search,
          textInputAction: TextInputAction.search,
          maxLength: 60,
          decoration: InputDecoration(
            hintText: 'Buscar marca, sabor, porte…',
            counterText: '',
            prefixIcon: const Icon(Icons.search_rounded),
            suffixIcon: _search.text.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Limpar busca',
                    icon: const Icon(Icons.close_rounded),
                    onPressed: () {
                      _search.clear();
                      _apply(f.copyWith(q: ''));
                    },
                  ),
          ),
          onChanged: (_) => setState(() {}),
          onSubmitted: (q) => _apply(f.copyWith(q: q)),
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            chip('Todos', f.species == null, () => _apply(f.copyWith(species: () => null))),
            for (final e in speciesLabel.entries)
              chip(e.value, f.species == e.key, () => _apply(f.copyWith(species: () => f.species == e.key ? null : e.key)),
                  key: Key('species-${e.key}')),
            chip('🔥 Promoções', f.promo, () => _apply(f.copyWith(promo: !f.promo)), key: const Key('promo')),
          ]),
        ),
        const SizedBox(height: 6),
        Row(children: [
          Expanded(
            child: Text(
              _loading && _items.isEmpty ? 'Carregando…' : '$_total ${_total == 1 ? 'produto' : 'produtos'}',
              style: TextStyle(color: p.muted, fontSize: 13),
            ),
          ),
          PopupMenuButton<String>(
            key: const Key('sort'),
            tooltip: 'Ordenar',
            initialValue: f.sort,
            onSelected: (v) => _apply(f.copyWith(sort: v)),
            itemBuilder: (_) => [for (final e in sortLabel.entries) PopupMenuItem(value: e.key, child: Text(e.value))],
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.swap_vert_rounded, size: 18, color: p.gold),
                const SizedBox(width: 4),
                Text(sortLabel[f.sort]!, style: TextStyle(color: p.gold, fontWeight: FontWeight.w600, fontSize: 13)),
              ]),
            ),
          ),
        ]),
      ]),
    );
  }

  Widget _empty(BuildContext context) => Padding(
        padding: const EdgeInsets.all(32),
        child: Column(children: [
          const Text('Nenhuma ração encontrada com esses filtros.', textAlign: TextAlign.center),
          if (!_filters.isEmpty) ...[
            const SizedBox(height: 12),
            OutlinedButton(
              onPressed: () {
                _search.clear();
                _apply(const Filters());
              },
              child: const Text('Limpar filtros'),
            ),
          ],
        ]),
      );

  Widget _footer(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 110),
        child: Column(children: [
          if (_items.isNotEmpty && _error != null)
            ErrorRetry(message: _error!, onRetry: _load)
          else if (_hasMore)
            OutlinedButton(
              key: const Key('more'),
              onPressed: _loading ? null : _load,
              child: Text(_loading ? 'Carregando…' : 'Carregar mais'),
            ),
        ]),
      );
}

class _CartBar extends StatelessWidget {
  const _CartBar({required this.cart, required this.onOpen});

  final Cart cart;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) => Material(
        color: Palette.btnGold,
        shape: const StadiumBorder(),
        elevation: 6,
        child: InkWell(
          key: const Key('cart-bar'),
          customBorder: const StadiumBorder(),
          onTap: onOpen,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            child: DefaultTextStyle.merge(
              style: const TextStyle(color: Palette.onGold, fontWeight: FontWeight.w600),
              child: Row(children: [
                const Icon(Icons.shopping_bag_rounded, color: Palette.onGold, size: 20),
                const SizedBox(width: 10),
                Expanded(
                  child: Text('${cart.count} ${cart.count == 1 ? 'item' : 'itens'} · ${money(cart.estimate)}',
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                const SizedBox(width: 8),
                const Text('Ver pedido →'),
              ]),
            ),
          ),
        ),
      );
}

class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    final pr = product;
    final color = hexColor(pr.color, p.gold);
    final details = [
      stageLabel[pr.lifeStage],
      if (pr.petSize != 'TODOS') sizeLabel[pr.petSize],
      lineLabel[pr.line],
    ].whereType<String>().join(' · ');
    return Card(
      key: Key('product-${pr.id}'),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // "embalagem" na cor da marca
          Container(
            width: 92,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [color.withValues(alpha: 0.95), Color.lerp(color, Colors.black, 0.35)!],
              ),
            ),
            child: Stack(children: [
              Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.pets, color: Colors.white, size: 26),
                  const SizedBox(height: 6),
                  Text(kg(pr.weightKg), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13)),
                  Text(speciesLabel[pr.species] ?? '', style: const TextStyle(color: Colors.white70, fontSize: 11)),
                ]),
              ),
              if (pr.discountPercent != null && pr.onPromo)
                Positioned(
                  top: 8,
                  left: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                    decoration: BoxDecoration(color: const Color(0xFFC62828), borderRadius: BorderRadius.circular(999)),
                    child: Text('-${pr.discountPercent}%',
                        style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700)),
                  ),
                ),
            ]),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(pr.brand.toUpperCase(), style: TextStyle(color: p.gold, fontSize: 10.5, letterSpacing: 1.6, fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(pr.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, height: 1.25)),
                const SizedBox(height: 4),
                Text([if (pr.flavor != null) pr.flavor!, details].join(' · '),
                    maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(color: p.muted, fontSize: 12)),
                const SizedBox(height: 10),
                Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      if (pr.onPromo)
                        Text(money(pr.price),
                            style: TextStyle(color: p.muted, fontSize: 12, decoration: TextDecoration.lineThrough)),
                      Text(money(pr.effectivePrice), style: TextStyle(fontFamily: displayFont, fontSize: 20, color: p.ink)),
                      Text('${money(pr.pricePerKg)}/kg', style: TextStyle(color: p.muted, fontSize: 11)),
                    ]),
                  ),
                  _AddButton(product: pr),
                ]),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _AddButton extends StatelessWidget {
  const _AddButton({required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final cart = AppScope.of(context).cart;
    if (!product.inStock) {
      return Text('Esgotado', style: TextStyle(color: context.pal.danger, fontWeight: FontWeight.w600));
    }
    return ListenableBuilder(
      listenable: cart,
      builder: (context, _) {
        final q = cart.qty(product.id);
        if (q == 0) {
          return FilledButton(
            key: Key('add-${product.id}'),
            style: FilledButton.styleFrom(minimumSize: const Size(44, 44), padding: const EdgeInsets.symmetric(horizontal: 16)),
            onPressed: () => cart.add(product),
            child: const Text('Adicionar'),
          );
        }
        return QtyStepper(
          value: q,
          max: product.maxQty,
          onChanged: (v) => cart.setQty(product, v),
          label: product.name,
        );
      },
    );
  }
}

/// [-] 2 [+] com alvos de toque de 44px.
class QtyStepper extends StatelessWidget {
  const QtyStepper({super.key, required this.value, required this.max, required this.onChanged, required this.label});

  final int value;
  final int max;
  final ValueChanged<int> onChanged;
  final String label;

  @override
  Widget build(BuildContext context) {
    final p = context.pal;
    return Container(
      decoration: BoxDecoration(borderRadius: BorderRadius.circular(999), border: Border.all(color: p.line)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(
          tooltip: value == 1 ? 'Remover $label' : 'Diminuir',
          icon: Icon(value == 1 ? Icons.delete_outline_rounded : Icons.remove_rounded, size: 18),
          onPressed: () => onChanged(value - 1),
        ),
        Text('$value', style: const TextStyle(fontWeight: FontWeight.w700)),
        IconButton(
          tooltip: 'Aumentar',
          icon: const Icon(Icons.add_rounded, size: 18),
          onPressed: value >= max ? null : () => onChanged(value + 1),
        ),
      ]),
    );
  }
}
