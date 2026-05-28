import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_driver/app/router/app_transitions.dart';
import 'package:nexum_driver/app/router/splash_screen.dart';
import 'package:nexum_driver/core/constants/app_constants.dart';
import 'package:nexum_driver/features/active_trip/presentation/screens/active_trip_screen.dart';
import 'package:nexum_driver/features/active_trip/presentation/screens/trip_summary_screen.dart';
import 'package:nexum_driver/features/auth/presentation/screens/otp_screen.dart';
import 'package:nexum_driver/features/auth/presentation/screens/phone_input_screen.dart';
import 'package:nexum_driver/features/auth/presentation/screens/register_screen.dart';
import 'package:nexum_driver/features/driver_status/presentation/screens/home_screen.dart';
import 'package:nexum_driver/features/earnings/presentation/screens/earnings_screen.dart';
import 'package:nexum_driver/features/onboarding/presentation/screens/onboarding_screen.dart';
import 'package:nexum_driver/features/profile/presentation/screens/profile_screen.dart';
import 'package:nexum_driver/features/promotions/presentation/screens/promotions_screen.dart';
import 'package:nexum_driver/features/ratings/presentation/screens/ratings_screen.dart';
import 'package:nexum_driver/features/safety/presentation/screens/safety_screen.dart';
import 'package:nexum_driver/features/settings/presentation/screens/settings_screen.dart';
import 'package:nexum_driver/features/support/presentation/screens/support_screen.dart';
import 'package:nexum_driver/features/trip_history/presentation/screens/trip_history_screen.dart';
import 'package:nexum_driver/features/wallet/presentation/screens/wallet_screen.dart';
import 'package:nexum_driver/shared/models/trip_model.dart';
import 'package:shared_preferences/shared_preferences.dart';

abstract final class AppRoutes {
  static const String splash = '/';
  static const String onboarding = '/onboarding';
  static const String login = '/login';
  static const String otp = '/otp';
  static const String register = '/register';
  static const String home = '/home';
  static const String activeTrip = '/active-trip';
  static const String tripSummary = '/trip-summary';
  static const String earnings = '/earnings';
  static const String profile = '/profile';
  static const String wallet = '/wallet';
  static const String tripHistory = '/trip-history';
  static const String ratings = '/ratings';
  static const String safety = '/safety';
  static const String settings = '/settings';
  static const String support = '/support';
  static const String promotions = '/promotions';
}

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: AppRoutes.splash,
    redirect: _authRedirect,
    routes: [
      GoRoute(
        path: AppRoutes.splash,
        redirect: (context, state) async => _authRedirect(context, state),
        pageBuilder: (context, state) => AppTransitions.fade(
          pageKey: state.pageKey,
          child: const SplashScreen(),
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
          child: OtpScreen(phone: state.uri.queryParameters['phone'] ?? ''),
        ),
      ),
      GoRoute(
        path: AppRoutes.register,
        pageBuilder: (context, state) => AppTransitions.slideLeft(
          pageKey: state.pageKey,
          child: RegisterScreen(
              phone: state.uri.queryParameters['phone'] ?? ''),
        ),
      ),
      GoRoute(
        path: AppRoutes.home,
        pageBuilder: (context, state) => AppTransitions.fade(
          pageKey: state.pageKey,
          child: const HomeScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.activeTrip,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const ActiveTripScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.tripSummary,
        pageBuilder: (context, state) {
          final trip = state.extra as TripModel?;
          return AppTransitions.slideUp(
            pageKey: state.pageKey,
            child:
                trip == null ? const HomeScreen() : TripSummaryScreen(trip: trip),
          );
        },
      ),
      GoRoute(
        path: AppRoutes.earnings,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const EarningsScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.profile,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const ProfileScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.wallet,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const WalletScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.tripHistory,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const TripHistoryScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.ratings,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const RatingsScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.safety,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const SafetyScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.settings,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const SettingsScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.support,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const SupportScreen(),
        ),
      ),
      GoRoute(
        path: AppRoutes.promotions,
        pageBuilder: (context, state) => AppTransitions.slideUp(
          pageKey: state.pageKey,
          child: const PromotionsScreen(),
        ),
      ),
    ],
    errorBuilder: (context, state) => _RouterErrorScreen(error: state.error),
  );
});

Future<String?> _authRedirect(
    BuildContext context, GoRouterState state) async {
  final prefs = await SharedPreferences.getInstance();
  final onboardingDone =
      prefs.getBool(AppConstants.onboardingCompleteKey) ?? false;

  if (!onboardingDone) {
    if (state.matchedLocation == AppRoutes.onboarding) return null;
    return AppRoutes.onboarding;
  }

  const storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  final token = await storage.read(key: AppConstants.authTokenKey);
  final isAuthenticated = token != null && token.isNotEmpty;

  if (!isAuthenticated) {
    final isOnAuthRoute = state.matchedLocation == AppRoutes.login ||
        state.matchedLocation == AppRoutes.otp;
    return isOnAuthRoute ? null : AppRoutes.login;
  }

  final pendingPhone =
      await storage.read(key: AppConstants.needsRegistrationKey);
  if (pendingPhone != null && pendingPhone.isNotEmpty) {
    if (state.matchedLocation == AppRoutes.register) return null;
    return '${AppRoutes.register}?phone=${Uri.encodeComponent(pendingPhone)}';
  }

  final isOnAuthRoute = state.matchedLocation == AppRoutes.login ||
      state.matchedLocation == AppRoutes.otp ||
      state.matchedLocation == AppRoutes.splash ||
      state.matchedLocation == AppRoutes.onboarding;
  if (isOnAuthRoute) return AppRoutes.home;

  return null;
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
