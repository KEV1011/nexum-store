import 'dart:async' show unawaited;

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexum_client/app/app.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/services/push_notification_service.dart';

/// Despierta el backend apenas abre la app. Render (plan free) duerme tras
/// 15 min y su primer request tarda ~50 s: si el usuario abre la app y toca
/// "Continuar" enseguida, el login se quedaría "pegado" esperando ese arranque.
/// Este ping fire-and-forget arranca a Render mientras el usuario lee el intro
/// y escribe su número, para que el login ya lo encuentre despierto.
Future<void> _warmUpBackend() async {
  try {
    final dio = Dio(
      BaseOptions(
        connectTimeout: const Duration(seconds: 60),
        receiveTimeout: const Duration(seconds: 60),
      ),
    );
    await dio.get<void>('${ApiConfig.baseUrl}/health');
  } catch (_) {
    // Best-effort: si falla no importa, el login reintenta con su propio timeout.
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es_CO');

  unawaited(_warmUpBackend());

  if (!kIsWeb) {
    try {
      await Firebase.initializeApp();
      await PushNotificationService().init();
    } catch (_) {
      // La app funciona sin Firebase si google-services.json no está.
    }
  }

  runApp(
    const ProviderScope(
      child: ZIPAClientApp(),
    ),
  );
}
