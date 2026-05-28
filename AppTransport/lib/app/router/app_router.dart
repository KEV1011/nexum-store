import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/active_trip/presentation/screens/active_trip_screen.dart';
import 'package:nexum_driver/features/active_trip/presentation/screens/trip_summary_screen.dart';
import 'package:nexum_driver/features/auth/presentation/screens/otp_screen.dart';
import 'package:nexum_driver/features/auth/presentation/screens/phone_input_screen.dart';
import 'package:nexum_driver/features/driver_status/presentation/screens/home_screen.dart';
import 'package:nexum_driver/features/earnings/presentation/screens/earnings_screen.dart';
import 'package:nexum_driver/features/profile/presentation/screens/profile_screen.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';

abstract final class AppRoutes {
  static const String splash = '/';
  static const String login = '/login';
  static const String otp = '/otp';
  static const String home = '/home';
  static const String activeTrip = '/active-trip';
  static const String tripSummary = '/trip-summary';
  static const String earnings = '/earnings';
  static const String profile = '/profile';
}

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: AppRoutes.splash,
    redirect: _authRedirect,
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        redirect: (context, state) async => _authRedirect(context, state),
        builder: (context, state) => const _SplashScreen(),
      ),
      GoRoute(
        path: AppRoutes.login,
        builder: (context, state) => const PhoneInputScreen(),
      ),
      GoRoute(
        path: AppRoutes.otp,
        builder: (context, state) {
          final phone = state.uri.queryParameters['phone'] ?? '';
          return OtpScreen(phone: phone);
        },
      ),
      GoRoute(
        path: AppRoutes.home,
        builder: (context, state) => const HomeScreen(),
      ),
      GoRoute(
        path: AppRoutes.activeTrip,
        builder: (context, state) => const ActiveTripScreen(),
      ),
      GoRoute(
        path: AppRoutes.tripSummary,
        builder: (context, state) {
          final trip = state.extra as TripModel?;
          return trip == null
              ? const HomeScreen()
              : TripSummaryScreen(trip: trip);
        },
      ),
      GoRoute(
        path: AppRoutes.earnings,
        builder: (context, state) => const EarningsScreen(),
      ),
      GoRoute(
        path: AppRoutes.profile,
        builder: (context, state) => const ProfileScreen(),
      ),
    ],
    errorBuilder: (context, state) => _RouterErrorScreen(error: state.error),
  );
});

Future<String?> _authRedirect(BuildContext context, GoRouterState state) async {
  const storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  final token = await storage.read(key: AppConstants.authTokenKey);
  final isAuthenticated = token != null && token.isNotEmpty;
  final isOnAuthRoute = state.matchedLocation == AppRoutes.login ||
      state.matchedLocation == AppRoutes.otp;

  if (!isAuthenticated && !isOnAuthRoute) return AppRoutes.login;
  if (isAuthenticated && state.matchedLocation == AppRoutes.splash) {
    return AppRoutes.home;
  }
  if (isAuthenticated && isOnAuthRoute) return AppRoutes.home;
  return null;
}

class _SplashScreen extends StatelessWidget {
  const _SplashScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.local_taxi_rounded, size: 80, color: Color(0xFF00C853)),
            SizedBox(height: 16),
            Text(
              'Nexum Driver',
              style: TextStyle(
                fontSize: 28,
                fontWeight: FontWeight.bold,
                color: Color(0xFF1A237E),
              ),
            ),
            SizedBox(height: 32),
            CircularProgressIndicator(color: Color(0xFF00C853)),
          ],
        ),
      ),
    );
  }
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
