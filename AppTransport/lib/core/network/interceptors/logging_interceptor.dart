import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// Interceptor de logging para el cliente Dio.
///
/// Solo activo en modo debug ([kDebugMode]).
/// Registra:
/// - Requests: método HTTP, URL completa, headers (token enmascarado), body.
/// - Responses: código de estado HTTP y duración de la petición.
/// - Errors: mensaje, código y URL afectada.
class LoggingInterceptor extends Interceptor {
  /// Mapa de tiempos de inicio indexado por URL + método para calcular
  /// la duración de cada petición.
  final Map<String, DateTime> _requestTimestamps = {};

  // ── Request ───────────────────────────────────────────────────────────────

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (!kDebugMode) {
      handler.next(options);
      return;
    }

    final key = _requestKey(options);
    _requestTimestamps[key] = DateTime.now();

    final maskedHeaders = _maskAuthHeader(Map<String, dynamic>.from(options.headers));

    // ignore: avoid_print
    print(
      '\n┌── [HTTP REQUEST] ─────────────────────────────────────────────\n'
      '│  Method  : ${options.method}\n'
      '│  URL     : ${options.uri}\n'
      '│  Headers : $maskedHeaders\n'
      '│  Body    : ${_formatBody(options.data)}\n'
      '└───────────────────────────────────────────────────────────────',
    );

    handler.next(options);
  }

  // ── Response ──────────────────────────────────────────────────────────────

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (!kDebugMode) {
      handler.next(response);
      return;
    }

    final key = _requestKey(response.requestOptions);
    final duration = _elapsedMs(key);

    // ignore: avoid_print
    print(
      '\n┌── [HTTP RESPONSE] ────────────────────────────────────────────\n'
      '│  Status  : ${response.statusCode} ${response.statusMessage ?? ''}\n'
      '│  URL     : ${response.requestOptions.uri}\n'
      '│  Duration: ${duration}ms\n'
      '└───────────────────────────────────────────────────────────────',
    );

    handler.next(response);
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (!kDebugMode) {
      handler.next(err);
      return;
    }

    final key = _requestKey(err.requestOptions);
    final duration = _elapsedMs(key);

    // ignore: avoid_print
    print(
      '\n┌── [HTTP ERROR] ───────────────────────────────────────────────\n'
      '│  Type    : ${err.type.name}\n'
      '│  Status  : ${err.response?.statusCode ?? 'N/A'}\n'
      '│  URL     : ${err.requestOptions.uri}\n'
      '│  Message : ${err.message}\n'
      '│  Duration: ${duration}ms\n'
      '└───────────────────────────────────────────────────────────────',
    );

    handler.next(err);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /// Builds a unique key per request for timestamp tracking.
  String _requestKey(RequestOptions options) =>
      '${options.method}:${options.uri}';

  /// Returns elapsed milliseconds since the request was initiated, then
  /// removes the timestamp entry to avoid memory leaks.
  String _elapsedMs(String key) {
    final start = _requestTimestamps.remove(key);
    if (start == null) return '?';
    return DateTime.now().difference(start).inMilliseconds.toString();
  }

  /// Replaces the Authorization header value with `Bearer ***` to avoid
  /// leaking tokens in logs.
  Map<String, dynamic> _maskAuthHeader(Map<String, dynamic> headers) {
    if (headers.containsKey('Authorization')) {
      headers['Authorization'] = 'Bearer ***';
    }
    return headers;
  }

  /// Formats the request body for display, truncating large payloads.
  String _formatBody(dynamic data) {
    if (data == null) return 'null';
    final raw = data.toString();
    const maxLength = 500;
    if (raw.length > maxLength) {
      return '${raw.substring(0, maxLength)}... [truncated]';
    }
    return raw;
  }
}
