/// Traducción de las ofertas crudas del despacho a la entidad que pintan las
/// pantallas.
///
/// Vivían dentro de `home_screen`, que era su único consumidor. Dejaron de
/// serlo con los viajes encadenados: ahora la oferta también puede llegar con
/// el conductor a mitad de otro servicio, y quien la enseña entonces es la
/// pantalla del viaje activo. Copiarlas allí habría dejado dos versiones del
/// mismo mapeo destinadas a separarse en cuanto una de las dos se tocara.
library;

import 'package:nexum_driver/core/constants/map_constants.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/errand_details.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/passenger_entity.dart';
import 'package:nexum_driver/shared/models/location_model.dart';

TripRequestEntity? ofertaDeViaje(Map<String, dynamic> t) {
  try {
    final p = t['passenger'] as Map<String, dynamic>;
    final o = t['origin'] as Map<String, dynamic>;
    final d = t['destination'] as Map<String, dynamic>;
    final name = p['name'] as String;
    return TripRequestEntity(
      id: t['id'] as String,
      passenger: PassengerEntity(
        id: (p['id'] as String?) ?? '',
        name: name,
        rating: (p['rating'] as num).toDouble(),
        totalTrips: 0,
        verified: (p['verified'] as bool?) ?? false,
        photoUrl:
            'https://ui-avatars.com/api/?name=${Uri.encodeComponent(name)}'
            '&background=00C853&color=fff&size=128',
      ),
      origin: LocationModel(
        latitude: (o['lat'] as num).toDouble(),
        longitude: (o['lng'] as num).toDouble(),
        address: o['address'] as String,
      ),
      destination: LocationModel(
        latitude: (d['lat'] as num).toDouble(),
        longitude: (d['lng'] as num).toDouble(),
        address: d['address'] as String,
      ),
      distanceKm: (t['distanceKm'] as num).toDouble(),
      durationMinutes: (t['estimatedMinutes'] as num).toInt(),
      estimatedFare: (t['estimatedFare'] as num).toDouble(),
      distanceToPickupKm: 0.5,
      etaToPickupMinutes: 3,
      requestedAt: DateTime.now(),
      serviceType: t['serviceType'] as String?,
      paymentMethod: t['paymentMethod'] as String?,
      // Solo el nombre: al conductor le sirve para decidir y para orientarse;
      // las coordenadas ya las usó el servidor para medir y cobrar.
      stops: ((t['stops'] as List<dynamic>?) ?? const [])
          .map((e) => (e as Map<String, dynamic>)['name']?.toString() ?? '')
          .where((n) => n.isNotEmpty)
          .toList(),
    );
  } catch (_) {
    return null;
  }
}

/// Build a [TripRequestEntity] from a raw `order_request` (entrega de pedido
/// a negocio). Origen = el negocio donde recoger; destino = dirección de
/// entrega; tarifa = el domicilio que gana el repartidor.
TripRequestEntity? ofertaDePedido(Map<String, dynamic> o) {
  try {
    const double fallbackLat = MapConstants.pamplonaCenterLat;
    const double fallbackLng = MapConstants.pamplonaCenterLng;
    final businessName = o['businessName'] as String? ?? 'Negocio';
    final itemsCount = (o['itemsCount'] as num?)?.toInt() ?? 0;
    // Coordenadas reales del backend: negocio (recogida) y entrega. La entrega
    // cae al negocio si el pedido no trajo coords de destino.
    final bizLat = (o['businessLat'] as num?)?.toDouble() ?? fallbackLat;
    final bizLng = (o['businessLng'] as num?)?.toDouble() ?? fallbackLng;
    final delLat = (o['deliveryLat'] as num?)?.toDouble() ?? bizLat;
    final delLng = (o['deliveryLng'] as num?)?.toDouble() ?? bizLng;

    return TripRequestEntity(
      id: o['id'] as String,
      orderId: o['id'] as String,
      passenger: PassengerEntity(
        id: '',
        name: businessName,
        rating: 5.0,
        totalTrips: 0,
        photoUrl: '',
      ),
      origin: LocationModel(
        latitude: bizLat,
        longitude: bizLng,
        address: o['businessAddress'] as String? ?? businessName,
      ),
      destination: LocationModel(
        latitude: delLat,
        longitude: delLng,
        address: o['deliveryAddress'] as String? ?? '',
      ),
      distanceKm: 0,
      durationMinutes: 0,
      estimatedFare: (o['deliveryFee'] as num?)?.toDouble() ?? 0,
      distanceToPickupKm: 0.5,
      etaToPickupMinutes: 3,
      requestedAt: DateTime.now(),
      errand: ErrandDetails(
        category: ErrandCategory.other,
        description:
            'Pedido ${o['orderRef'] ?? ''} · $itemsCount producto(s) de $businessName',
      ),
    );
  } catch (_) {
    return null;
  }
}

/// Build a [TripRequestEntity] (with [ErrandDetails]) from a raw errand
/// JSON map received via WS. Uses Pamplona-centre placeholder coords
/// because the WS errand payload does not include coordinates.
TripRequestEntity? ofertaDeMandado(Map<String, dynamic> e) {
  try {
    const double pamplonaCenterLat = MapConstants.pamplonaCenterLat;
    const double pamplonaCenterLng = MapConstants.pamplonaCenterLng;

    final categoryStr = e['category'] as String? ?? 'other';
    final category = ErrandCategory.values.firstWhere(
      (c) => c.name == categoryStr,
      orElse: () => ErrandCategory.other,
    );

    final errand = ErrandDetails(
      category: category,
      description: e['description'] as String? ?? '',
      purchaseBudget:
          e['purchaseBudget'] != null ? (e['purchaseBudget'] as num).toDouble() : null,
      notes: e['notes'] as String?,
    );

    return TripRequestEntity(
      id: e['id'] as String,
      passenger: const PassengerEntity(
        id: '',
        name: 'Cliente',
        rating: 5.0,
        totalTrips: 0,
        photoUrl: '',
      ),
      origin: LocationModel(
        latitude: pamplonaCenterLat,
        longitude: pamplonaCenterLng,
        address: e['pickupAddress'] as String? ?? '',
      ),
      destination: LocationModel(
        latitude: pamplonaCenterLat,
        longitude: pamplonaCenterLng,
        address: e['dropoffAddress'] as String? ?? '',
      ),
      distanceKm: 0,
      durationMinutes: 0,
      estimatedFare:
          e['serviceFee'] != null ? (e['serviceFee'] as num).toDouble() : 0,
      distanceToPickupKm: 0.5,
      etaToPickupMinutes: 3,
      requestedAt: DateTime.now(),
      errand: errand,
    );
  } catch (_) {
    return null;
  }
}
