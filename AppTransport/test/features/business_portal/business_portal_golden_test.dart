import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexum_driver/app/theme/app_theme.dart';
import 'package:nexum_driver/features/business_portal/domain/entities/'
    'business_order_entity.dart';
import 'package:nexum_driver/features/business_portal/presentation/screens/'
    'business_portal_screen.dart';
import 'package:nexum_driver/features/business_portal/presentation/screens/'
    'order_detail_screen.dart';

/// Carga las fuentes Inter empaquetadas para que los goldens rendericen
/// texto real en vez de cajas del font de prueba.
Future<void> _loadInterFonts() async {
  final entries = {
    'Inter': [
      'assets/fonts/Inter-Regular.ttf',
      'assets/fonts/Inter-Medium.ttf',
      'assets/fonts/Inter-SemiBold.ttf',
      'assets/fonts/Inter-Bold.ttf',
      'assets/fonts/Inter-ExtraBold.ttf',
    ],
  };

  for (final family in entries.keys) {
    final loader = FontLoader(family);
    for (final path in entries[family]!) {
      final bytes = File(path).readAsBytesSync();
      loader.addFont(
        Future.value(ByteData.view(bytes.buffer)),
      );
    }
    await loader.load();
  }
}

void main() {
  setUpAll(() async {
    // Sin red en tests: google_fonts (Sora) no debe intentar descargar;
    // el texto cae al fallback Inter cargado localmente más abajo.
    GoogleFonts.config.allowRuntimeFetching = false;
    await initializeDateFormatting('es_CO');
    await _loadInterFonts();
  });

  testWidgets('Portal del negocio — lista de pedidos', (tester) async {
    tester.view.physicalSize = const Size(420, 1750);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.lightTheme(),
          home: const BusinessPortalScreen(),
        ),
      ),
    );

    await tester.pumpAndSettle(const Duration(seconds: 1));

    await expectLater(
      find.byType(BusinessPortalScreen),
      matchesGoldenFile('goldens/business_portal_screen.png'),
    );
  });

  testWidgets('Detalle de pedido — cadena de custodia', (tester) async {
    tester.view.physicalSize = const Size(420, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);

    final now = DateTime.now();
    final order = BusinessOrderEntity(
      id: 'order_001',
      orderRef: '#4521',
      businessName: 'Restaurante El Sabor Pamplonés',
      customerName: 'María González',
      customerAddress: 'Cra. 5 #12-34, Barrio San Francisco',
      status: BusinessOrderStatus.delivered,
      createdAt: now.subtract(const Duration(hours: 3, minutes: 15)),
      pickedUpAt: now.subtract(const Duration(hours: 3)),
      deliveredAt: now.subtract(const Duration(hours: 2, minutes: 42)),
      hasSignature: true,
      grossFare: 8500,
      driverName: 'Carlos Ruiz',
      driverPhone: '+57 310 555 0101',
    );

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.lightTheme(),
          home: OrderDetailScreen(order: order),
        ),
      ),
    );

    await tester.pumpAndSettle();

    await expectLater(
      find.byType(OrderDetailScreen),
      matchesGoldenFile('goldens/order_detail_screen.png'),
    );
  });
}
