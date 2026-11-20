// Formatos brasileiros (iguais ao site), sem depender de pacote de i18n.

String _group(String digits) {
  final out = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) out.write('.');
    out.write(digits[i]);
  }
  return out.toString();
}

/// 1234.5 -> "R$ 1.234,50"
String money(num value) {
  final cents = (value.abs() * 100).round();
  final sign = value < 0 && cents > 0 ? '-' : '';
  return '${sign}R\$ ${_group('${cents ~/ 100}')},${'${cents % 100}'.padLeft(2, '0')}';
}

/// 15000 -> "15.000"; 4.85 (1 casa) -> "4,9"
String number(num value, [int decimals = 0]) {
  final fixed = value.abs().toStringAsFixed(decimals);
  final parts = fixed.split('.');
  final sign = value < 0 ? '-' : '';
  return parts.length == 1 ? '$sign${_group(parts[0])}' : '$sign${_group(parts[0])},${parts[1]}';
}

/// Ate [max] casas, sem zeros a direita: 15.0 -> "15"; 2.50 -> "2,5"
String compact(num value, [int max = 2]) {
  var s = value.toStringAsFixed(max);
  if (s.contains('.')) s = s.replaceFirst(RegExp(r'\.?0+$'), '');
  return s.replaceAll('.', ',');
}

String kg(num value) => '${compact(value)} kg';

String km(num? value) => '${compact(value ?? 0, 1)} km';

/// 4 -> "★★★★☆"
String stars(num n) {
  final full = n.round().clamp(0, 5);
  return '★' * full + '☆' * (5 - full);
}

/// 4.75 -> "4,8"
String rating(num value) => number(value, 1);
