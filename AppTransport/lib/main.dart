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
import 'package:nexum_driver/core/observability/crash_reporting.dart';
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

Future<void> main() => runWithCrashReporting(_arrancar);

Future<void> _arrancar() async {
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

  // ── Borde a borde, declarado y no heredado ──────────────────────────────
  //
  // Desde Android 15 una app con targetSdk 35+ se dibuja de borde a borde
  // SIEMPRE, lo pida o no, y Play lo avisa. La auditoría dice que las
  // pantallas ya están bien: las que van a pantalla completa son los mapas,
  // y lo hacen a propósito; el resto tiene AppBar, SafeArea o se suma
  // `padding.top` a mano.
  //
  // Lo que faltaba era DECIRLO. `edgeToEdge` es la forma soportada por
  // Flutter de declararlo, y además quita el velo que el motor dibuja
  // detrás de la barra de navegación en versiones anteriores — así en
  // Android 14 y en Android 15 se ve igual, en vez de depender de la
  // versión del teléfono.
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  // Solo el BRILLO de los iconos: `statusBarColor` y
  // `systemNavigationBarColor` están obsoletos y Android 15 los IGNORA, así
  // que pedir «transparente» era código que no hacía nada y que hacía
  // pensar que el borde a borde estaba resuelto aquí.
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarIconBrightness: Brightness.dark,
      statusBarBrightness: Brightness.light,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );

  runApp(const ProviderScope(child: ZIPADriverApp()));
}
