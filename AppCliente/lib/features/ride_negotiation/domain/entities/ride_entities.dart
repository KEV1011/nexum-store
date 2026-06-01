import 'package:flutter/material.dart';

enum RideStatus {
  open,
  matched,
  arriving,
  arrived,
  inProgress,
  completed,
  cancelled;

  static RideStatus fromApi(String? s) {
    switch (s) {
      case 'matched':
        return RideStatus.matched;
      case 'arriving':
        return RideStatus.arriving;
      case 'arrived':
        return RideStatus.arrived;
      case 'in_progress':
        return RideStatus.inProgress;
      case 'completed':
        return RideStatus.completed;
      case 'cancelled':
        return RideStatus.cancelled;
      default:
        return RideStatus.open;
    }
  }

  String get label {
    switch (this) {
      case RideStatus.open:
        return 'Buscando conductor';
      case RideStatus.matched:
        return 'Conductor asignado';
      case RideStatus.arriving:
        return 'En camino';
      case RideStatus.arrived:
        return 'Llegó al punto';
      case RideStatus.inProgress:
        return 'En viaje';
      case RideStatus.completed:
        return 'Completado';
      case RideStatus.cancelled:
        return 'Cancelado';
    }
  }

  Color get color {
    switch (this) {
      case RideStatus.open:
        return const Color(0xFFFF9800);
      case RideStatus.matched:
      case RideStatus.arriving:
      case RideStatus.arrived:
      case RideStatus.inProgress:
        return const Color(0xFF1565C0);
      case RideStatus.completed:
        return const Color(0xFF00C853);
      case RideStatus.cancelled:
        return const Color(0xFFDC2626);
    }
  }

  bool get isActive =>
      this == RideStatus.open ||
      this == RideStatus.matched ||
      this == RideStatus.arriving ||
      this == RideStatus.arrived ||
      this == RideStatus.inProgress;
}

class RideBidEntity {
  const RideBidEntity({
    required this.id,
    required this.driverId,
    required this.driverName,
    required this.driverPhone,
    required this.driverRating,
    required this.driverTotalTrips,
    required this.vehicleDescription,
    required this.fare,
    required this.etaMinutes,
    required this.status,
  });

  final String id;
  final String driverId;
  final String driverName;
  final String driverPhone;
  final double driverRating;
  final int driverTotalTrips;
  final String vehicleDescription;
  final double fare;
  final int etaMinutes;
  final String status;

  factory RideBidEntity.fromJson(Map<String, dynamic> j) => RideBidEntity(
        id: j['id'] as String? ?? '',
        driverId: j['driverId'] as String? ?? '',
        driverName: j['driverName'] as String? ?? 'Conductor',
        driverPhone: j['driverPhone'] as String? ?? '',
        driverRating: (j['driverRating'] as num?)?.toDouble() ?? 5.0,
        driverTotalTrips: (j['driverTotalTrips'] as num?)?.toInt() ?? 0,
        vehicleDescription: j['vehicleDescription'] as String? ?? '',
        fare: (j['fare'] as num?)?.toDouble() ?? 0,
        etaMinutes: (j['etaMinutes'] as num?)?.toInt() ?? 0,
        status: j['status'] as String? ?? 'pending',
      );
}

class RideEntity {
  const RideEntity({
    required this.id,
    required this.rideRef,
    required this.serviceType,
    required this.originAddress,
    required this.destinationAddress,
    required this.offeredFare,
    required this.distanceKm,
    required this.etaMinutes,
    required this.status,
    required this.bids,
    required this.bidCount,
    this.notes,
    this.matchedDriverId,
    this.driverLat,
    this.driverLng,
  });

  final String id;
  final String rideRef;
  final String serviceType;
  final String originAddress;
  final String destinationAddress;
  final double offeredFare;
  final double distanceKm;
  final int etaMinutes;
  final RideStatus status;
  final List<RideBidEntity> bids;
  final int bidCount;
  final String? notes;
  final String? matchedDriverId;
  final double? driverLat;
  final double? driverLng;

  RideBidEntity? get acceptedBid {
    for (final b in bids) {
      if (b.status == 'accepted') return b;
    }
    return null;
  }

  factory RideEntity.fromJson(Map<String, dynamic> j) => RideEntity(
        id: j['id'] as String? ?? '',
        rideRef: j['rideRef'] as String? ?? '',
        serviceType: j['serviceType'] as String? ?? 'particular',
        originAddress: j['originAddress'] as String? ?? '',
        destinationAddress: j['destinationAddress'] as String? ?? '',
        offeredFare: (j['offeredFare'] as num?)?.toDouble() ?? 0,
        distanceKm: (j['distanceKm'] as num?)?.toDouble() ?? 0,
        etaMinutes: (j['etaMinutes'] as num?)?.toInt() ?? 0,
        status: RideStatus.fromApi(j['status'] as String?),
        bids: (j['bids'] as List<dynamic>? ?? [])
            .whereType<Map<String, dynamic>>()
            .map(RideBidEntity.fromJson)
            .toList(),
        bidCount: (j['bidCount'] as num?)?.toInt() ?? 0,
        notes: j['notes'] as String?,
        matchedDriverId: j['matchedDriverId'] as String?,
        driverLat: (j['driverLat'] as num?)?.toDouble(),
        driverLng: (j['driverLng'] as num?)?.toDouble(),
      );
}

class ChatMessageEntity {
  const ChatMessageEntity({
    required this.id,
    required this.rideId,
    required this.fromRole,
    required this.text,
    required this.sentAt,
  });

  final String id;
  final String rideId;
  final String fromRole;
  final String text;
  final DateTime sentAt;

  bool get isFromClient => fromRole == 'client';

  factory ChatMessageEntity.fromJson(Map<String, dynamic> j) =>
      ChatMessageEntity(
        id: j['id'] as String? ?? '',
        rideId: j['rideId'] as String? ?? '',
        fromRole: j['fromRole'] as String? ?? 'driver',
        text: j['text'] as String? ?? '',
        sentAt:
            DateTime.tryParse(j['sentAt'] as String? ?? '') ?? DateTime.now(),
      );
}
