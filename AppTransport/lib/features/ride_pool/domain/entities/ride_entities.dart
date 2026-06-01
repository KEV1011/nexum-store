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
        return 'Buscando';
      case RideStatus.matched:
        return 'Asignado';
      case RideStatus.arriving:
        return 'En camino';
      case RideStatus.arrived:
        return 'En el punto';
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
        return const Color(0xFFE53935);
    }
  }
}

enum BidStatus { pending, accepted, rejected }

BidStatus _bidStatus(String? s) {
  switch (s) {
    case 'accepted':
      return BidStatus.accepted;
    case 'rejected':
      return BidStatus.rejected;
    default:
      return BidStatus.pending;
  }
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
  final BidStatus status;

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
        status: _bidStatus(j['status'] as String?),
      );
}

class RideEntity {
  const RideEntity({
    required this.id,
    required this.rideRef,
    required this.clientId,
    required this.clientName,
    required this.clientPhone,
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
    this.matchedBidId,
    this.driverLat,
    this.driverLng,
  });

  final String id;
  final String rideRef;
  final String clientId;
  final String clientName;
  final String clientPhone;
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
  final String? matchedBidId;
  final double? driverLat;
  final double? driverLng;

  factory RideEntity.fromJson(Map<String, dynamic> j) => RideEntity(
        id: j['id'] as String? ?? '',
        rideRef: j['rideRef'] as String? ?? '',
        clientId: j['clientId'] as String? ?? '',
        clientName: j['clientName'] as String? ?? 'Pasajero',
        clientPhone: j['clientPhone'] as String? ?? '',
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
        matchedBidId: j['matchedBidId'] as String?,
        driverLat: (j['driverLat'] as num?)?.toDouble(),
        driverLng: (j['driverLng'] as num?)?.toDouble(),
      );
}

class ChatMessageEntity {
  const ChatMessageEntity({
    required this.id,
    required this.rideId,
    required this.fromRole,
    required this.fromId,
    required this.text,
    required this.sentAt,
  });

  final String id;
  final String rideId;
  final String fromRole; // 'client' | 'driver'
  final String fromId;
  final String text;
  final DateTime sentAt;

  bool get isFromDriver => fromRole == 'driver';

  factory ChatMessageEntity.fromJson(Map<String, dynamic> j) => ChatMessageEntity(
        id: j['id'] as String? ?? '',
        rideId: j['rideId'] as String? ?? '',
        fromRole: j['fromRole'] as String? ?? 'client',
        fromId: j['fromId'] as String? ?? '',
        text: j['text'] as String? ?? '',
        sentAt: DateTime.tryParse(j['sentAt'] as String? ?? '') ?? DateTime.now(),
      );
}
