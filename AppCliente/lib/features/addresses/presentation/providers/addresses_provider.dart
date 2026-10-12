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
    // SIN DIRECCIONES SE EMPIEZA VACÍO. Aquí se sembraba una «Casa» en
    // «Calle 6 #2-30, Barrio Belén» —una calle inventada— marcada como
    // predeterminada, así que todo el que instalaba la app estrenaba una
    // dirección de entrega que nunca escribió: el chip del inicio la
    // enseñaba y el checkout la usaba, con el repartidor yendo a un sitio que
    // no es el de nadie. La pantalla ya dice «Elige tu dirección» cuando no
    // hay ninguna, y el checkout ofrece «Agregar dirección».
    if (raw == null || raw.isEmpty) return;

    // DIRECCIÓN A DIRECCIÓN, y con el JSON entero protegido: esto corre en el
    // constructor sin `await`, así que lanzar aquí era un error asíncrono sin
    // dueño que dejaba a la persona sin NINGUNA de sus direcciones guardadas.
    final guardadas = <AddressEntity>[];
    try {
      for (final e in jsonDecode(raw) as List<dynamic>) {
        if (e is! Map<String, dynamic>) continue;
        try {
          guardadas.add(AddressEntity.fromJson(e));
        } catch (_) {
          // Esa dirección no se puede leer; las demás sí.
        }
      }
    } catch (_) {
      // El archivo entero está corrupto. No se sobreescribe: así, una
      // versión futura que sepa leerlo todavía puede recuperarlo.
      return;
    }
    if (!mounted) return;
    state = guardadas;
  }

  Future<void> _persist(List<AddressEntity> list) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      AppConstants.addressesStorageKey,
      jsonEncode(list.map((a) => a.toJson()).toList()),
    );
  }

  void add({
    required String alias,
    required String fullAddress,
    double? lat,
    double? lng,
  }) {
    final id = 'addr-${DateTime.now().millisecondsSinceEpoch}';
    final newAddress = AddressEntity(
      id: id,
      alias: alias.trim(),
      fullAddress: fullAddress.trim(),
      isDefault: state.isEmpty,
      lat: lat,
      lng: lng,
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
