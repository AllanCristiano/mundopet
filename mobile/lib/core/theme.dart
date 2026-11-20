import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Mesmas cores do site (frontend/src/styles.scss): noite + dourado no escuro, creme + dourado escuro no claro.
@immutable
class Palette extends ThemeExtension<Palette> {
  const Palette({
    required this.bg,
    required this.bg2,
    required this.bg3,
    required this.ink,
    required this.muted,
    required this.line,
    required this.gold,
    required this.hotel,
    required this.food,
    required this.beauty,
    required this.vet,
    required this.danger,
  });

  final Color bg, bg2, bg3, ink, muted, line, gold, hotel, food, beauty, vet, danger;

  /// Botao dourado: igual nos dois temas (como no site).
  static const btnGold = Color(0xFFE3B062);
  static const onGold = Color(0xFF1A1208);

  static const dark = Palette(
    bg: Color(0xFF0B0908),
    bg2: Color(0xFF15110D),
    bg3: Color(0xFF1D1813),
    ink: Color(0xFFF5EEE4),
    muted: Color(0xFFB3A797),
    line: Color(0x24F5EEE4),
    gold: Color(0xFFE3B062),
    hotel: Color(0xFF9DB8FF),
    food: Color(0xFFE3B062),
    beauty: Color(0xFFF4A9C6),
    vet: Color(0xFF7FE0C2),
    danger: Color(0xFFFF8A80),
  );

  static const light = Palette(
    bg: Color(0xFFFAF6EF),
    bg2: Color(0xFFF2EBDF),
    bg3: Color(0xFFE8DCC8),
    ink: Color(0xFF1D1712),
    muted: Color(0xFF5F5347),
    line: Color(0x241D1712),
    gold: Color(0xFF9A6418),
    hotel: Color(0xFF3354C4),
    food: Color(0xFF9A6418),
    beauty: Color(0xFFB8346C),
    vet: Color(0xFF0F7D61),
    danger: Color(0xFFB3261E),
  );

  @override
  Palette copyWith() => this;

  @override
  Palette lerp(ThemeExtension<Palette>? other, double t) => other is Palette && t >= 0.5 ? other : this;
}

extension PaletteX on BuildContext {
  Palette get pal => Theme.of(this).extension<Palette>() ?? Palette.dark;
}

/// Fonte "de revista" dos titulos (no site e a Playfair Display; no app, a serifada do sistema).
const String displayFont = 'serif';

ThemeData buildTheme(Brightness brightness) {
  final p = brightness == Brightness.dark ? Palette.dark : Palette.light;
  final scheme = ColorScheme.fromSeed(seedColor: Palette.btnGold, brightness: brightness).copyWith(
    primary: p.gold,
    onPrimary: brightness == Brightness.dark ? Palette.onGold : Colors.white,
    secondary: p.beauty,
    surface: p.bg,
    onSurface: p.ink,
    onSurfaceVariant: p.muted,
    surfaceContainerLowest: p.bg,
    surfaceContainerLow: p.bg2,
    surfaceContainer: p.bg2,
    surfaceContainerHigh: p.bg3,
    surfaceContainerHighest: p.bg3,
    outline: p.line,
    outlineVariant: p.line,
    error: p.danger,
  );
  final base = ThemeData(useMaterial3: true, brightness: brightness, colorScheme: scheme);
  final text = base.textTheme.apply(bodyColor: p.ink, displayColor: p.ink);
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(22), side: BorderSide(color: p.line));
  return base.copyWith(
    scaffoldBackgroundColor: p.bg,
    extensions: [p],
    textTheme: text.copyWith(
      displaySmall: text.displaySmall?.copyWith(fontFamily: displayFont, height: 1.08),
      headlineMedium: text.headlineMedium?.copyWith(fontFamily: displayFont, height: 1.1),
      headlineSmall: text.headlineSmall?.copyWith(fontFamily: displayFont, height: 1.15),
      titleLarge: text.titleLarge?.copyWith(fontFamily: displayFont),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: p.bg,
      foregroundColor: p.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: p.bg2,
      indicatorColor: p.gold.withValues(alpha: 0.22),
      surfaceTintColor: Colors.transparent,
      labelTextStyle: WidgetStatePropertyAll(TextStyle(fontSize: 12, color: p.ink, fontWeight: FontWeight.w500)),
    ),
    cardTheme: CardThemeData(color: p.bg2, elevation: 0, margin: EdgeInsets.zero, shape: shape),
    dividerTheme: DividerThemeData(color: p.line, space: 1),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Palette.btnGold,
        foregroundColor: Palette.onGold,
        disabledBackgroundColor: p.bg3,
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 22),
        shape: const StadiumBorder(),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, letterSpacing: 0.3),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: p.ink,
        minimumSize: const Size(48, 48),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        side: BorderSide(color: p.line),
        shape: const StadiumBorder(),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: p.gold, minimumSize: const Size(48, 44))),
    chipTheme: base.chipTheme.copyWith(
      backgroundColor: p.bg,
      selectedColor: p.gold.withValues(alpha: 0.2),
      side: BorderSide(color: p.line),
      shape: const StadiumBorder(),
      labelStyle: TextStyle(color: p.ink, fontSize: 13),
      showCheckmark: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: p.bg,
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: p.line)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: p.line)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: p.gold, width: 1.5)),
      labelStyle: TextStyle(color: p.muted),
      hintStyle: TextStyle(color: p.muted),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: p.ink,
      contentTextStyle: TextStyle(color: p.bg),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
    ),
    bottomSheetTheme: BottomSheetThemeData(backgroundColor: p.bg2, surfaceTintColor: Colors.transparent),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: p.gold),
  );
}

/// Tema claro/escuro. Ordem: escolha salva > tema do sistema (igual ao site; mesma chave "mundopet-theme").
class ThemeController extends ChangeNotifier {
  ThemeController(this._prefs) : _mode = _read(_prefs);

  static const storageKey = 'mundopet-theme';
  final SharedPreferences? _prefs;
  ThemeMode _mode;

  ThemeMode get mode => _mode;

  static ThemeMode _read(SharedPreferences? prefs) {
    switch (prefs?.getString(storageKey)) {
      case 'dark':
        return ThemeMode.dark;
      case 'light':
        return ThemeMode.light;
      default:
        return ThemeMode.system;
    }
  }

  /// Alterna a partir do tema que esta na tela agora.
  void toggle(Brightness current) {
    _mode = current == Brightness.dark ? ThemeMode.light : ThemeMode.dark;
    _prefs?.setString(storageKey, _mode == ThemeMode.dark ? 'dark' : 'light');
    notifyListeners();
  }
}
