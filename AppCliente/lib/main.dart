import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:nexum_client/app/app.dart';
import 'package:nexum_client/shared/services/push_notification_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('es_CO');

  if (!kIsWeb) {
    try {
      await Firebase.initializeApp();
      await PushNotificationService().init();
    } catch (_) {
      // Firebase not configured — app still works without push notifications.
    }
  }

  runApp(
    const ProviderScope(
      child: NexumClientApp(),
    ),
  );
}
