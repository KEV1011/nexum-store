import 'package:intl/intl.dart';

/// Utilidades de formateo de moneda para Colombia (COP).
/// Ejemplo: 15750.0 → '$15.750'
///
/// OJO con `NumberFormat.currency(locale: 'es_CO')`: el parámetro `symbol`
/// solo cambia el CARÁCTER, no dónde va. El patrón de moneda del locale es_CO
/// pone el símbolo DETRÁS con espacio, así que salía «5.200 $» — que no es
/// como se escribe un precio en Colombia y se lee como un error de la app.
/// Por eso el número se formatea suelto y el peso se antepone a mano.
abstract final class CurrencyFormatter {
  /// Solo el número, con el punto de miles de es_CO: 15750 → '15.750'.
  static final NumberFormat _numero = NumberFormat('#,##0', 'es_CO');
  static final NumberFormat _numeroConCentavos =
      NumberFormat('#,##0.00', 'es_CO');

  /// Formatea un valor como moneda COP sin decimales.
  /// Ej: 15750.0 → '$15.750'
  static String format(double amount) => '\$${_numero.format(amount)}';

  /// Formatea un valor como moneda COP con decimales.
  /// Ej: 15750.5 → '$15.750,50'
  static String formatWithCents(double amount) =>
      '\$${_numeroConCentavos.format(amount)}';

  /// Formatea como COP con texto explícito.
  /// Ej: 15750.0 → '$15.750 COP'
  static String formatWithCode(double amount) => '${format(amount)} COP';

  /// Convierte string a double (elimina símbolos de moneda).
  ///
  /// El punto es separador de MILES en Colombia: «$15.750» son quince mil
  /// setecientos cincuenta, no quince con setecientos cincuenta. Leerlo como
  /// decimal convertía quince mil pesos en quince.
  static double parse(String value) {
    final limpio = value
        .replaceAll(RegExp(r'[^\d.,]'), '')
        .replaceAll('.', '')
        .replaceAll(',', '.');
    return double.tryParse(limpio) ?? 0.0;
  }
}
