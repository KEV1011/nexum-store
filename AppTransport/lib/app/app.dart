import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/app/theme/app_theme.dart';

/// Widget raíz de la aplicación Nexum Driver.
/// Configura: tema M3 (claro/oscuro), router, internacionalización (es_CO).
class NexumDriverApp extends ConsumerWidget {
  const NexumDriverApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);

    return MaterialApp.router(
      title: 'Nexum Driver',
      debugShowCheckedModeBanner: false,

      // Tema Material 3
      theme: AppTheme.lightTheme(),
      darkTheme: AppTheme.darkTheme(),
      themeMode: ThemeMode.system,

      // Navegación
      routerConfig: router,

      // Internacionalización
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('es', 'CO'), // Español Colombia (principal)
        Locale('en', 'US'), // Inglés (secundario)
      ],
      locale: const Locale('es', 'CO'),
    );
  }
}
