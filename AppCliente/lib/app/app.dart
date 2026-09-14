import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/app_theme.dart';
import 'package:nexum_client/app/theme/theme_provider.dart';
import 'package:nexum_client/core/ui/escala_texto.dart';
import 'package:nexum_client/features/orders/presentation/providers/'
    'orders_provider.dart';
import 'package:nexum_client/features/transport/presentation/providers/'
    'transport_provider.dart';

class ZIPAClientApp extends ConsumerStatefulWidget {
  const ZIPAClientApp({super.key});

  @override
  ConsumerState<ZIPAClientApp> createState() => _ZIPAClientAppState();
}

class _ZIPAClientAppState extends ConsumerState<ZIPAClientApp>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Al volver del segundo plano hay que reengancharse.
  ///
  /// Mientras la app está en el fondo, el sistema corta el socket (y a menudo
  /// mata el proceso entero, que eso no lo puede evitar ninguna app). Antes no
  /// se escuchaba el ciclo de vida en absoluto: al volver, la pantalla seguía
  /// mostrando el último estado que llegó antes de salir — un viaje "buscando
  /// conductor" que ya tenía uno esperando en la puerta— y no se corregía
  /// hasta que la reconexión programada cayera, hasta 30 segundos después.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed) return;
    // Sin `await`: recuperar el estado no puede retrasar el pintado.
    unawaited(ref.read(transportProvider.notifier).reanudar());
    unawaited(ref.read(ordersProvider.notifier).reanudar());
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeProvider);

    return MaterialApp.router(
      title: 'ZIPA',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.lightTheme(),
      darkTheme: AppTheme.darkTheme(),
      themeMode: themeMode,
      routerConfig: router,
      builder: (context, child) => EscalaTexto.acotar(child ?? const SizedBox()),
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
