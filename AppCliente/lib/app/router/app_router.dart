import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_transitions.dart';
import 'package:nexum_client/app/router/splash_screen.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/addresses/presentation/screens/'
    'addresses_screen.dart';
import 'package:nexum_client/features/auth/presentation/providers/'
    'auth_provider.dart';
import 'package:nexum_client/features/auth/presentation/screens/'
    'otp_screen.dart';
import 'package:nexum_client/features/auth/presentation/screens/'
    'phone_input_screen.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/screens/'
    'business_detail_screen.dart';
import 'package:nexum_client/features/cart/presentation/screens/'
    'cart_screen.dart';
import 'package:nexum_client/features/cart/presentation/screens/'
    'checkout_screen.dart';
import 'package:nexum_client/features/errands/presentation/screens/'
    'errand_booking_screen.dart';
import 'package:nexum_client/features/errands/presentation/screens/'
    'errand_status_screen.dart';
import 'package:nexum_client/features/intercity/presentation/screens/'
    'intercity_booking_screen.dart';
import 'package:nexum_client/features/intercity/presentation/screens/'
    'intercity_history_screen.dart';
import 'package:nexum_client/features/intercity/presentation/screens/'
    'intercity_status_screen.dart';
import 'package:nexum_client/features/freight/presentation/screens/'
    'freight_screen.dart';
import 'package:nexum_client/features/pooled/presentation/screens/'
    'pooled_search_screen.dart';
import 'package:nexum_client/features/pooled/presentation/screens/'
    'pooled_bookings_screen.dart';
import 'package:nexum_client/features/ride_negotiation/presentation/screens/'
    'request_ride_screen.dart';
import 'package:nexum_client/features/onboarding/presentation/screens/'
    'onboarding_screen.dart';
import 'package:nexum_client/features/safety/presentation/screens/'
    'trusted_contact_screen.dart';
import 'package:nexum_client/features/orders/presentation/screens/'
    'order_tracking_screen.dart';
import 'package:nexum_client/features/shell/presentation/screens/'
    'home_shell.dart';
import 'package:nexum_client/features/transport/domain/entities/'
    'transport_request_entity.dart';
import 'package:nexum_client/features/transport/presentation/screens/'
    'transport_booking_screen.dart';
import 'package:nexum_client/features/transport/presentation/screens/'
    'transport_tracking_screen.dart';
import 'package:nexum_client/features/transport/presentation/screens/'
    'trip_history_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Rutas con nombre de la app Nexum Cliente.
abstract final class AppRoutes {
  static const String splash = '/';
  static const String onboarding = '/onboarding';
  static const String login = '/login';
  static const String otp = '/otp';
  static const String home = '/home';
  static const String cart = '/cart';
  static const String checkout = '/checkout';
  static const String addresses = '/addresses';

  // Rutas paramétricas
  static const String business = '/business/:id';
  static const String order = '/order/:id';
  static const String transportTracking = '/transport/tracking/:id';
  static const String tripHistory = '/transport/history';

  // Rutas de transporte
  static const String transportBooking = '/transport/booking';

  // Rutas intermunicipales
  static const String intercityBooking = '/intercity/booking';
  static const String intercityStatus = '/intercity/status';
  static const String intercityHistory = '/intercity/history';
  static const String freight = '/freight';
  static const String pooledSearch = '/pooled/search';
  static const String pooledBookings = '/pooled/bookings';
  static const String requestRide = '/ride/request';

  // Rutas de envíos por encargo (motor errands)
  static const String errandBooking = '/errand/booking';
  static const String errandStatus = '/errand/status';

  // Seguridad
  static const String trustedContact = '/safety/trusted-contact';

  static String businessPath(String id) => '/business/$id';
  static String orderPath(String id) => '/order/$id';
  static String transportTrackingPath(String id) => '/transport/tracking/$id';
}

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: AppRoutes.splash,
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        pageBuilder: (context, state) => AppTransitions.fade(
          pageKey: state.pageKey,
          child: const _SplashGate(),
        ),
      ),
      GoRoute(
        path: AppRoutes.onboarding,
        pageBuilder: (context, state) => AppTransitions.fade(
          pageKey: state.pageKey,
          child: const OnboardingScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.login,
        pageBuilder: (context, state) => AppTransitions.fade(
          pageKey: state.pageKey,
          child: const PhoneInputScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.otp,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: OtpScreen(phone: state.extra as String? ?? ''),
        ),
      ),
      GoRoute(
        path: AppRoutes.home,
        pageBuilder: (context, state) => AppTransitions.fade(
          pageKey: state.pageKey,
          child: const HomeShell(),
        ),
      ),
      GoRoute(
        path: AppRoutes.business,
        pageBuilder: (context, state) {
          final business = state.extra as BusinessEntity?;
          return AppTransitions.slideLeft(
            pageKey: state.pageKey,
            child: BusinessDetailScreen(
              businessId: state.pathParameters['id'] ?? '',
              initialBusiness: business,
            ),
          );
        },
      ),
      GoRoute(
        path: AppRoutes.cart,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const CartScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.checkout,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: const CheckoutScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.order,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: OrderTrackingScreen(
            orderId: state.pathParameters['id'] ?? '',
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.addresses,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: const AddressesScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.transportBooking,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: TransportBookingScreen(
            serviceType: state.extra! as TransportServiceType,
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.transportTracking,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: TransportTrackingScreen(
            requestId: state.pathParameters['id'] ?? '',
          ),
        ),
      ),
      GoRoute(
        path: AppRoutes.tripHistory,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: const TripHistoryScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.intercityBooking,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: const IntercityBookingScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.intercityStatus,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const IntercityStatusScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.intercityHistory,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: const IntercityHistoryScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.freight,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: const FreightScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.pooledSearch,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: const PooledSearchScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.pooledBookings,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const PooledBookingsScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.requestRide,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const RequestRideScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.trustedContact,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: const TrustedContactScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.errandBooking,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: const ErrandBookingScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.errandStatus,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const ErrandStatusScreen(),
        ),
      ),
    ],
    errorBuilder: (context, state) => _RouterErrorScreen(error: state.error),
  );
});

/// Muestra el splash brevemente y luego redirige según estado de auth.
class _SplashGate extends ConsumerStatefulWidget {
  const _SplashGate();

  @override
  ConsumerState<_SplashGate> createState() => _SplashGateState();
}

class _SplashGateState extends ConsumerState<_SplashGate> {
  @override
  void initState() {
    super.initState();
    Future<void>.delayed(const Duration(milliseconds: 1600), _navigate);
  }

  Future<void> _navigate() async {
    if (!mounted) return;
    final router = GoRouter.of(context);
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    final done =
        prefs.getBool(AppConstants.onboardingCompleteKey) ?? false;
    if (!done) {
      router.go(AppRoutes.onboarding);
      return;
    }
    final auth = ref.read(authProvider);
    router.go(
      auth is AuthAuthenticated ? AppRoutes.home : AppRoutes.login,
    );
  }

  @override
  Widget build(BuildContext context) => const SplashScreen();
}

class _RouterErrorScreen extends StatelessWidget {
  const _RouterErrorScreen({this.error});

  final Exception? error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Página no encontrada')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.red),
            const SizedBox(height: 16),
            const Text(
              'Ruta no encontrada',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 8),
            Text(
              error?.toString() ?? 'Error desconocido',
              style: const TextStyle(color: Colors.grey),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => context.go(AppRoutes.home),
              child: const Text('Ir al inicio'),
            ),
          ],
        ),
      ),
    );
  }
}
