import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'beauty/beauty_models.dart';
import 'beauty/beauty_page.dart';
import 'core/api.dart';
import 'core/site.dart';
import 'core/theme.dart';
import 'core/widgets.dart';
import 'home/home_page.dart';
import 'pets/pets_api.dart';
import 'pets/pets_page.dart';
import 'shop/shop_models.dart';
import 'shop/shop_page.dart';

/// Tudo o que fala com o mundo de fora (API e links). Nos testes, tudo e trocado por fakes.
class AppServices {
  AppServices({ApiClient? api, PetsApi? pets, LinkOpener? open})
      : api = api ?? ApiClient(),
        open = open ?? launchExternal,
        pets = pets ?? PetsApi(client: api?.client, baseUrl: api?.baseUrl, retryDelay: api?.retryDelay ?? const Duration(milliseconds: 300)) {
    site = SiteApi(this.api);
    catalog = CatalogApi(this.api);
    beauty = BeautyApi(this.api);
  }

  final ApiClient api;
  final PetsApi pets;
  final LinkOpener open;
  late final SiteApi site;
  late final CatalogApi catalog;
  late final BeautyApi beauty;
}

/// Abas do app (mesmas areas do site).
enum AppTab { home, shop, beauty, pets }

/// Estado compartilhado entre as telas.
class AppScope extends InheritedWidget {
  const AppScope({
    super.key,
    required this.services,
    required this.site,
    required this.cart,
    required this.theme,
    required this.tab,
    required this.prefs,
    required super.child,
  });

  final AppServices services;
  final SiteController site;
  final Cart cart;
  final ThemeController theme;
  final ValueNotifier<AppTab> tab;
  final SharedPreferences? prefs;

  static AppScope of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope ausente');
    return scope!;
  }

  /// Abre o WhatsApp da loja com a mensagem pronta.
  Future<void> whatsapp(BuildContext context, [String? text]) {
    final s = site.settings.store;
    return openLink(context, services.open, waLink(s.whatsapp, text ?? s.whatsappMessage));
  }

  @override
  bool updateShouldNotify(AppScope oldWidget) => false;
}

class MundoPetApp extends StatefulWidget {
  const MundoPetApp({super.key, required this.services, this.prefs, this.initialTab = AppTab.home});

  final AppServices services;
  final SharedPreferences? prefs;
  final AppTab initialTab;

  @override
  State<MundoPetApp> createState() => _MundoPetAppState();
}

class _MundoPetAppState extends State<MundoPetApp> {
  late final site = SiteController(widget.services.site);
  late final theme = ThemeController(widget.prefs);
  late final tab = ValueNotifier<AppTab>(widget.initialTab);
  final cart = Cart();

  @override
  void initState() {
    super.initState();
    site.load();
  }

  @override
  void dispose() {
    site.dispose();
    theme.dispose();
    tab.dispose();
    cart.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      services: widget.services,
      site: site,
      cart: cart,
      theme: theme,
      tab: tab,
      prefs: widget.prefs,
      child: ListenableBuilder(
        listenable: theme,
        builder: (_, _) => MaterialApp(
          title: 'MundoPet',
          debugShowCheckedModeBanner: false,
          theme: buildTheme(Brightness.light),
          darkTheme: buildTheme(Brightness.dark),
          themeMode: theme.mode,
          home: const AppShell(),
        ),
      ),
    );
  }
}

/// Barra de abas embaixo (polegar) + topo com a marca e o tema.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  // so monta a aba quando ela e aberta pela primeira vez (nao chama a API a toa)
  final Set<AppTab> _opened = {};

  @override
  Widget build(BuildContext context) {
    final scope = AppScope.of(context);
    final p = context.pal;
    return ValueListenableBuilder<AppTab>(
      valueListenable: scope.tab,
      builder: (context, current, _) {
        _opened.add(current);
        return Scaffold(
          appBar: AppBar(
            title: const Logo(),
            actions: [
              IconButton(
                key: const Key('theme-toggle'),
                tooltip: Theme.of(context).brightness == Brightness.dark ? 'Usar tema claro' : 'Usar tema escuro',
                icon: Icon(Theme.of(context).brightness == Brightness.dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
                onPressed: () => scope.theme.toggle(Theme.of(context).brightness),
              ),
              IconButton(
                tooltip: 'Falar no WhatsApp',
                icon: Icon(Icons.chat_bubble_outline_rounded, color: p.gold),
                onPressed: () => scope.whatsapp(context),
              ),
              const SizedBox(width: 4),
            ],
            bottom: PreferredSize(preferredSize: const Size.fromHeight(1), child: Divider(height: 1, color: p.line)),
          ),
          body: IndexedStack(
            index: current.index,
            children: [
              for (final t in AppTab.values) _opened.contains(t) ? _page(t, scope) : const SizedBox.shrink(),
            ],
          ),
          bottomNavigationBar: ListenableBuilder(
            listenable: scope.cart,
            builder: (context, _) => NavigationBar(
              selectedIndex: current.index,
              onDestinationSelected: (i) => scope.tab.value = AppTab.values[i],
              destinations: [
                const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Início'),
                NavigationDestination(
                  icon: Badge(
                    isLabelVisible: !scope.cart.isEmpty,
                    label: Text('${scope.cart.count}'),
                    child: const Icon(Icons.shopping_bag_outlined),
                  ),
                  selectedIcon: Badge(
                    isLabelVisible: !scope.cart.isEmpty,
                    label: Text('${scope.cart.count}'),
                    child: const Icon(Icons.shopping_bag_rounded),
                  ),
                  label: 'Rações',
                ),
                const NavigationDestination(icon: Icon(Icons.auto_awesome_outlined), selectedIcon: Icon(Icons.auto_awesome), label: 'Beleza'),
                const NavigationDestination(icon: Icon(Icons.pets_outlined), selectedIcon: Icon(Icons.pets), label: 'Pets'),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _page(AppTab t, AppScope scope) {
    switch (t) {
      case AppTab.home:
        return const HomePage();
      case AppTab.shop:
        return const ShopPage();
      case AppTab.beauty:
        return const BeautyPage();
      case AppTab.pets:
        return PetsPage(api: scope.services.pets);
    }
  }
}
