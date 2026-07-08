import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/app/router/app_router.dart';
import 'package:nexum_driver/app/theme/app_theme.dart';
import 'package:nexum_driver/app/theme/theme_provider.dart';
import 'package:nexum_driver/core/network/interceptors/auth_interceptor.dart';

class NexumDriverApp extends ConsumerWidget {
  const NexumDriverApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeProvider);

    // Sesión vencida (401 del backend) → de vuelta al login.
    AuthInterceptor.onSessionExpired = () => router.go(AppRoutes.login);

    return MaterialApp.router(
      title: 'Nexum Driver',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme(),
      darkTheme: AppTheme.darkTheme(),
      themeMode: themeMode,
      routerConfig: router,
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: const [
        Locale('es', 'CO'),
        Locale('en', 'US'),
      ],
      locale: const Locale('es', 'CO'),
    );
  }
}
