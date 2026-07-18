import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexum_client/app/app.dart';
import 'package:nexum_client/core/services/push_notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es_CO');

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
