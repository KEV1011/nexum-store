import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/constants/app_constants.dart';
import 'package:nexum_client/features/addresses/domain/entities/address_entity.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AddressesNotifier extends StateNotifier<List<AddressEntity>> {
  AddressesNotifier() : super(const []) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(AppConstants.addressesStorageKey);
    if (!mounted) return;
    if (raw == null) {
      const seed = [
        AddressEntity(
          id: 'addr-default',
          alias: 'Casa',
          fullAddress: 'Calle 6 #2-30, Barrio Belén',
          isDefault: true,
        ),
      ];
      state = seed;
      unawaited(_persist(seed));
      return;
    }
    final decoded = jsonDecode(raw) as List<dynamic>;
    state = decoded
        .map((e) => AddressEntity.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> _persist(List<AddressEntity> list) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      AppConstants.addressesStorageKey,
      jsonEncode(list.map((a) => a.toJson()).toList()),
    );
  }

  void add({required String alias, required String fullAddress}) {
    final id = 'addr-${DateTime.now().millisecondsSinceEpoch}';
    final newAddress = AddressEntity(
      id: id,
      alias: alias.trim(),
      fullAddress: fullAddress.trim(),
      isDefault: state.isEmpty,
    );
    final updated = [...state, newAddress];
    state = updated;
    unawaited(_persist(updated));
  }

  void remove(String id) {
    var updated = state.where((a) => a.id != id).toList();
    if (updated.isNotEmpty && !updated.any((a) => a.isDefault)) {
      updated = [
        updated.first.copyWith(isDefault: true),
        ...updated.skip(1),
      ];
    }
    state = updated;
    unawaited(_persist(updated));
  }

  void setDefault(String id) {
    final updated = [
      for (final a in state) a.copyWith(isDefault: a.id == id),
    ];
    state = updated;
    unawaited(_persist(updated));
  }
}

final addressesProvider =
    StateNotifierProvider<AddressesNotifier, List<AddressEntity>>((ref) {
  return AddressesNotifier();
});

final defaultAddressProvider = Provider<AddressEntity?>((ref) {
  final list = ref.watch(addressesProvider);
  final def = list.where((a) => a.isDefault).firstOrNull;
  return def ?? list.firstOrNull;
});
