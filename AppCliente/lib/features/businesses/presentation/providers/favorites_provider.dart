import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:shared_preferences/shared_preferences.dart';

class FavoritesNotifier extends StateNotifier<Set<String>> {
  FavoritesNotifier() : super(const {}) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final ids =
        prefs.getStringList(AppConstants.favoritesStorageKey) ?? <String>[];
    if (!mounted) return;
    state = ids.toSet();
  }

  void toggle(String businessId) {
    final next = Set<String>.of(state);
    if (next.contains(businessId)) {
      next.remove(businessId);
    } else {
      next.add(businessId);
    }
    state = next;
    unawaited(_persist());
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
      AppConstants.favoritesStorageKey,
      state.toList(),
    );
  }
}

final favoritesProvider =
    StateNotifierProvider<FavoritesNotifier, Set<String>>((ref) {
  return FavoritesNotifier();
});
