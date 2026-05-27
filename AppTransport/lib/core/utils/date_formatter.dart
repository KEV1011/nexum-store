import 'package:intl/intl.dart';

/// Utilidades de formateo de fechas para Colombia (español).
/// Usa configuración regional 'es_CO'.
abstract final class DateFormatter {
  static final DateFormat _dateFormat = DateFormat('dd/MM/yyyy', 'es_CO');
  static final DateFormat _timeFormat = DateFormat('hh:mm a', 'es_CO');
  static final DateFormat _dateTimeFormat =
      DateFormat('dd/MM/yyyy hh:mm a', 'es_CO');
  static final DateFormat _dayNameFormat = DateFormat('EEEE', 'es_CO');
  static final DateFormat _shortDateFormat = DateFormat('dd MMM', 'es_CO');

  /// Formatea fecha: 27/05/2025
  static String formatDate(DateTime date) => _dateFormat.format(date);

  /// Formatea hora: 02:30 PM
  static String formatTime(DateTime date) => _timeFormat.format(date);

  /// Formatea fecha y hora: 27/05/2025 02:30 PM
  static String formatDateTime(DateTime date) => _dateTimeFormat.format(date);

  /// Nombre del día: lunes, martes, etc.
  static String formatDayName(DateTime date) => _dayNameFormat.format(date);

  /// Fecha corta: 27 may
  static String formatShortDate(DateTime date) =>
      _shortDateFormat.format(date);

  /// Duración en formato mm:ss (para cronómetro)
  static String formatDuration(Duration duration) {
    final minutes =
        duration.inMinutes.remainder(60).toString().padLeft(2, '0');
    final seconds =
        duration.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$minutes:$seconds';
  }

  /// Duración en texto natural: "2 min", "1 h 15 min"
  static String formatDurationNatural(Duration duration) {
    if (duration.inMinutes < 60) {
      return '${duration.inMinutes} min';
    }
    final hours = duration.inHours;
    final minutes = duration.inMinutes.remainder(60);
    if (minutes == 0) return '$hours h';
    return '$hours h $minutes min';
  }

  /// Fecha relativa: "Hoy", "Ayer", o fecha corta
  static String formatRelativeDate(DateTime date) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final dateDay = DateTime(date.year, date.month, date.day);
    final difference = today.difference(dateDay).inDays;

    if (difference == 0) return 'Hoy';
    if (difference == 1) return 'Ayer';
    return formatShortDate(date);
  }
}
