import 'dart:async' show unawaited;

import 'package:dio/dio.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'package:nexum_driver/app/app.dart';
import 'package:nexum_driver/core/config/api_config.dart';
import 'package:nexum_driver/shared/services/push_notification_service.dart';

/// Despierta el backend apenas abre la app. Render (plan free) duerme tras
/// 15 min y su primer request tarda ~50 s: sin esto el login se quedaría
/// "pegado" esperando el arranque. Fire-and-forget mientras el usuario navega.
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
    // Best-effort.
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Carga los datos de localización es_CO usados por DateFormatter y
  // CurrencyFormatter. Sin esto, intl lanza un error al formatear fechas.
  await initializeDateFormatting('es_CO', null);

  unawaited(_warmUpBackend());

  if (!kIsWeb) {
    try {
      await Firebase.initializeApp();
      await PushNotificationService().init();
    } catch (_) {
      // La app funciona sin Firebase si google-services.json no está.
    }
  }

  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.transparent,
    ),
  );

  runApp(const ProviderScope(child: ZIPADriverApp()));
}
