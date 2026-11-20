import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../app.dart';
import '../core/api.dart';
import '../core/format.dart';
import '../core/site.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import 'shop_models.dart';
import 'shop_page.dart' show QtyStepper;

/// Pedido: itens, retirada/entrega (endereco pelo CEP), taxa por km calculada no servidor
/// e envio do pedido pronto para o WhatsApp da loja.
class CartPage extends StatefulWidget {
  const CartPage({super.key});

  @override
  State<CartPage> createState() => _CartPageState();
}

class _CartPageState extends State<CartPage> {
  final _name = TextEditingController();
  final _notes = TextEditingController();
  final Map<String, TextEditingController> _addr = {for (final f in DeliveryAddress.fields) f: TextEditingController()};

  bool _delivery = false;
  Quote? _quote;
  String? _quotedKey;
  bool _quoting = false;
  String? _quoteError;
  int _request = 0;

  bool _cepLoading = false;
  String? _cepError;
  bool _started = false;

  late AppScope _scope;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _scope = AppScope.of(context);
    if (!_started) {
      _started = true;
      final saved = DeliveryAddress.load(_scope.prefs).toMap();
      for (final f in DeliveryAddress.fields) {
        _addr[f]!.text = saved[f] ?? '';
      }
      _addr['cep']!.text = maskCep(_addr['cep']!.text);
      _scope.cart.addListener(_onCart);
      _requote();
    }
  }

  @override
  void dispose() {
    _scope.cart.removeListener(_onCart);
    _name.dispose();
    _notes.dispose();
    for (final c in _addr.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _onCart() {
    if (_scope.cart.isEmpty) {
      setState(() => _quote = null);
    } else {
      _requote();
    }
  }

  DeliveryAddress get _address => DeliveryAddress.fromMap({for (final e in _addr.entries) e.key: e.value.text});

  bool get _needsAddress => _delivery && !_address.isValid;

  Map<String, Object?> get _requestBody => {
        'items': _scope.cart.toApi(),
        'customerName': _name.text.trim().isEmpty ? null : _name.text.trim(),
        'fulfillment': _delivery && _address.isValid ? 'DELIVERY' : 'PICKUP',
        'notes': _notes.text.trim().isEmpty ? null : _notes.text.trim(),
        'address': _delivery && _address.isValid ? _address.toApi() : null,
      };

  String get _key => jsonEncode(_requestBody);

  /// O pedido so pode ir para o WhatsApp com uma cotacao do servidor feita para ESTES dados.
  bool get _fresh => !_quoting && _quote != null && _quotedKey == _key;

  bool get _canSend => _fresh && _quote!.whatsappText != null && !_needsAddress;

  Future<void> _requote() async {
    if (_scope.cart.isEmpty) return;
    final id = ++_request;
    final body = _requestBody;
    final key = jsonEncode(body);
    setState(() {
      _quoting = true;
      _quoteError = null;
    });
    try {
      final q = await _scope.services.catalog.quote(body);
      if (!mounted || id != _request) return;
      setState(() {
        _quote = q;
        _quotedKey = key;
      });
      if (q.unavailable.isNotEmpty) {
        _scope.cart.removeMany(q.unavailable);
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Alguns itens esgotaram e saíram do pedido.')),
          );
        }
      }
    } on ApiException catch (e) {
      if (mounted && id == _request) setState(() => _quoteError = e.message);
    } finally {
      if (mounted && id == _request) setState(() => _quoting = false);
    }
  }

  Future<void> _lookupCep() async {
    final cep = cepDigits(_addr['cep']!.text);
    if (cep.length != 8) return;
    setState(() {
      _cepLoading = true;
      _cepError = null;
    });
    try {
      final r = await _scope.services.catalog.cep(cep);
      if (!mounted) return;
      setState(() {
        if (r.street.isNotEmpty) _addr['street']!.text = r.street;
        if (r.district.isNotEmpty) _addr['district']!.text = r.district;
        if (r.city.isNotEmpty) _addr['city']!.text = r.city;
        if (r.state.isNotEmpty) _addr['state']!.text = r.state;
      });
      _addressChanged();
    } on ApiException catch (e) {
      if (mounted) setState(() => _cepError = e.message);
    } finally {
      if (mounted) setState(() => _cepLoading = false);
    }
  }

  void _addressChanged() {
    _address.save(_scope.prefs);
    setState(() {});
    if (_address.isValid) _requote();
  }

  Future<void> _send() async {
    final text = _quote?.whatsappText;
    if (!_canSend || text == null) return;
    final s = _scope.site.settings.store;
    final ok = await _scope.services.open(waLink(s.whatsapp, text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(ok ? 'Pedido aberto no WhatsApp. É só enviar!' : 'Não foi possível abrir o WhatsApp.'),
      action: ok ? SnackBarAction(label: 'Limpar carrinho', onPressed: _scope.cart.clear) : null,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final cart = _scope.cart;
    return Scaffold(
      appBar: AppBar(title: const Text('Seu pedido')),
      body: ListenableBuilder(
        listenable: cart,
        builder: (context, _) {
          if (cart.isEmpty) return _emptyCart(context);
          return ListView(
            key: const Key('cart-list'),
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              for (final l in cart.lines) _line(context, l),
              const SizedBox(height: 20),
              _section('Como você quer receber?'),
              SegmentedButton<bool>(
                key: const Key('fulfillment'),
                segments: const [
                  ButtonSegment(value: false, label: Text('Retirar na loja'), icon: Icon(Icons.storefront_outlined)),
                  ButtonSegment(value: true, label: Text('Entregar'), icon: Icon(Icons.delivery_dining_outlined)),
                ],
                selected: {_delivery},
                onSelectionChanged: (v) {
                  setState(() => _delivery = v.first);
                  _requote();
                },
              ),
              if (_delivery) ...[const SizedBox(height: 16), _addressForm(context)],
              const SizedBox(height: 20),
              _section('Seus dados (opcional)'),
              TextField(
                key: const Key('customer'),
                controller: _name,
                maxLength: 60,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Seu nome', counterText: ''),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _notes,
                maxLength: 300,
                maxLines: 2,
                decoration: const InputDecoration(labelText: 'Observações', hintText: 'Ex.: troco para R\$ 200', counterText: ''),
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: 20),
              _summary(context),
            ],
          );
        },
      ),
    );
  }

  Widget _emptyCart(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.shopping_bag_outlined, size: 40, color: context.pal.muted),
            const SizedBox(height: 12),
            const Text('Seu carrinho está vazio.'),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Ver rações')),
          ]),
        ),
      );

  Widget _section(String title) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
      );

  Widget _line(BuildContext context, CartLine l) {
    final p = context.pal;
    final quoted = _quote?.lines.where((q) => q.productId == l.product.id).firstOrNull;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(children: [
        Container(
          width: 10,
          height: 48,
          decoration: BoxDecoration(color: hexColor(l.product.color, p.gold), borderRadius: BorderRadius.circular(6)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(l.product.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('${l.product.brand} · ${kg(l.product.weightKg)} · ${money(l.product.effectivePrice)}',
                style: TextStyle(color: p.muted, fontSize: 12)),
            if (quoted?.warning != null) Text(quoted!.warning!, style: TextStyle(color: p.danger, fontSize: 12)),
          ]),
        ),
        QtyStepper(
          value: l.quantity,
          max: l.product.maxQty,
          label: l.product.name,
          onChanged: (v) => _scope.cart.setQty(l.product, v),
        ),
      ]),
    );
  }

  Widget _addressForm(BuildContext context) {
    final p = context.pal;
    Widget field(String key, String label, {TextInputType? type, int max = 120, List<TextInputFormatter>? fmt, TextCapitalization cap = TextCapitalization.sentences}) =>
        TextField(
          key: Key('addr-$key'),
          controller: _addr[key],
          keyboardType: type,
          maxLength: max,
          inputFormatters: fmt,
          textCapitalization: cap,
          decoration: InputDecoration(labelText: label, counterText: ''),
          onChanged: (_) => setState(() {}),
          onEditingComplete: () {
            _addressChanged();
            FocusScope.of(context).nextFocus();
          },
        );
    final site = _scope.site.settings;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Entrega a ${money(site.pricePerKm)}/km, até ${km(site.maxKm)} da loja.', style: TextStyle(color: p.muted, fontSize: 13)),
      const SizedBox(height: 12),
      TextField(
        key: const Key('addr-cep'),
        controller: _addr['cep'],
        keyboardType: TextInputType.number,
        inputFormatters: [_CepFormatter()],
        decoration: InputDecoration(
          labelText: 'CEP',
          hintText: '00000-000',
          errorText: _cepError,
          suffixIcon: _cepLoading
              ? const Padding(padding: EdgeInsets.all(14), child: SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)))
              : null,
        ),
        onChanged: (v) {
          setState(() => _cepError = null);
          if (cepDigits(v).length == 8) _lookupCep();
        },
      ),
      const SizedBox(height: 12),
      field('street', 'Rua'),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(child: field('number', 'Número', type: TextInputType.streetAddress, max: 10)),
        const SizedBox(width: 12),
        Expanded(flex: 2, child: field('complement', 'Complemento (opcional)', max: 60)),
      ]),
      const SizedBox(height: 12),
      field('district', 'Bairro', max: 60),
      const SizedBox(height: 12),
      Row(children: [
        Expanded(flex: 3, child: field('city', 'Cidade', max: 60, cap: TextCapitalization.words)),
        const SizedBox(width: 12),
        Expanded(
          child: field('state', 'UF', max: 2, cap: TextCapitalization.characters, fmt: [
            FilteringTextInputFormatter.allow(RegExp('[A-Za-z]')),
          ]),
        ),
      ]),
      const SizedBox(height: 12),
      field('reference', 'Ponto de referência (opcional)', max: 80),
      if (_needsAddress) ...[
        const SizedBox(height: 10),
        Text('Preencha o endereço para calcular a entrega.', key: const Key('needs-address'), style: TextStyle(color: p.danger, fontSize: 13)),
      ],
    ]);
  }

  Widget _summary(BuildContext context) {
    final p = context.pal;
    final q = _quote;
    final d = q?.delivery;
    Widget row(String label, String value, {bool strong = false, Color? color, Key? key}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 4),
          child: Row(children: [
            Expanded(child: Text(label, style: TextStyle(color: strong ? p.ink : p.muted, fontWeight: strong ? FontWeight.w700 : null))),
            Text(value,
                key: key,
                style: TextStyle(
                  color: color ?? p.ink,
                  fontWeight: strong ? FontWeight.w700 : FontWeight.w500,
                  fontSize: strong ? 18 : null,
                  fontFamily: strong ? displayFont : null,
                )),
          ]),
        );

    String? deliveryLabel;
    String? deliveryValue;
    String? outOfArea;
    if (_delivery && !_needsAddress && d != null) {
      switch (d.status) {
        case 'OK':
          deliveryLabel = 'Entrega (${km(d.distanceKm)} × ${money(d.pricePerKm)}/km)';
          deliveryValue = money(d.fee ?? q!.deliveryFee);
        case 'OUT_OF_AREA':
          outOfArea = 'Endereço fora da área de entrega (até ${km(d.maxKm)} da loja). Escolha retirar na loja.';
        default:
          deliveryLabel = 'Entrega';
          deliveryValue = 'a combinar';
      }
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (q == null && _quoting)
            const Padding(padding: EdgeInsets.all(12), child: Center(child: CircularProgressIndicator()))
          else if (q != null) ...[
            row('Produtos (${q.itemsCount})', money(q.subtotal)),
            if (q.discount > 0) row('Descontos', '-${money(q.discount)}', color: p.vet),
            if (!_delivery) row('Retirada na loja', 'grátis'),
            if (deliveryLabel != null) row(deliveryLabel, deliveryValue!, key: const Key('delivery-fee')),
            const Divider(height: 20),
            row('Total', money(q.total), strong: true, key: const Key('total')),
          ],
          if (outOfArea != null) ...[
            const SizedBox(height: 8),
            Text(outOfArea, key: const Key('out-of-area'), style: TextStyle(color: p.danger)),
          ],
          if (_quoteError != null) ...[
            const SizedBox(height: 8),
            Text(_quoteError!, key: const Key('quote-error'), style: TextStyle(color: p.danger)),
          ],
          const SizedBox(height: 16),
          if (_fresh || _needsAddress)
            FilledButton.icon(
              key: const Key('send'),
              onPressed: _canSend ? _send : null,
              icon: const Icon(Icons.send_rounded, size: 18),
              label: const Text('Enviar pedido pelo WhatsApp'),
            )
          else
            OutlinedButton.icon(
              key: const Key('requote'),
              onPressed: _quoting ? null : _requote,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: Text(_quoting ? 'Calculando…' : 'Calcular total'),
            ),
          const SizedBox(height: 8),
          Text('Valores e estoque são confirmados pela loja no WhatsApp.',
              textAlign: TextAlign.center, style: TextStyle(color: p.muted, fontSize: 12)),
        ]),
      ),
    );
  }
}

/// Mascara do CEP enquanto digita: 01001000 -> 01001-000
class _CepFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    final masked = maskCep(newValue.text);
    return TextEditingValue(text: masked, selection: TextSelection.collapsed(offset: masked.length));
  }
}
