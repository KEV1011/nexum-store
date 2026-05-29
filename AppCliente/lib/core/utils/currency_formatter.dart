import 'package:intl/intl.dart';

/// Utilidades de formateo de moneda para Colombia (COP).
/// Ejemplo: 15750.0 → '$15.750'
abstract final class CurrencyFormatter {
  static final NumberFormat _copFormat = NumberFormat.currency(
    locale: 'es_CO',
    symbol: r'$',
    decimalDigits: 0,
  );

  static final NumberFormat _copFormatWithCents = NumberFormat.currency(
    locale: 'es_CO',
    symbol: r'$',
    decimalDigits: 2,
  );

  /// Formatea un valor como moneda COP sin decimales.
  /// Ej: 15750.0 → '$15.750'
  static String format(double amount) {
    return _copFormat.format(amount);
  }

  /// Formatea un valor como moneda COP con decimales.
  static String formatWithCents(double amount) {
    return _copFormatWithCents.format(amount);
  }

  /// Formatea como COP con texto explícito.
  /// Ej: 15750.0 → '$15.750 COP'
  static String formatWithCode(double amount) {
    return '${_copFormat.format(amount)} COP';
  }

  /// Convierte string a double (elimina símbolos de moneda).
  static double parse(String value) {
    final cleaned = value.replaceAll(RegExp(r'[^\d.]'), '');
    return double.tryParse(cleaned) ?? 0.0;
  }
}
