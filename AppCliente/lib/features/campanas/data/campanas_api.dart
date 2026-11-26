// Campañas de temporada («Burger Show», «Pizza Fest»…).
//
// El admin las crea, cada local inscribe sus productos y la app las anuncia
// SOLO mientras rigen. Las fechas y qué productos existen las decide el
// servidor (`backend/src/lib/campanas.ts`): la app no calcula vigencias, así
// que un anuncio nunca puede abrir una sección que ya terminó.

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/lista_json.dart';
import 'package:nexum_client/features/addresses/presentation/providers/'
    'addresses_provider.dart';
import 'package:nexum_client/features/businesses/data/datasources/'
    'businesses_real_datasource.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

class Campana {
  const Campana({
    required this.id,
    required this.title,
    required this.desde,
    required this.hasta,
    required this.productos,
    this.subtitle,
    this.icon,
    this.color,
  });

  factory Campana.fromJson(Map<String, dynamic> j) => Campana(
        id: j['id'] as String,
        title: j['title'] as String,
        subtitle: j['subtitle'] as String?,
        icon: j['icon'] as String?,
        color: j['color'] as String?,
        desde: j['desde'] as String? ?? '',
        hasta: j['hasta'] as String? ?? '',
        productos: (j['productos'] as num?)?.toInt() ?? 0,
      );

  final String id;
  final String title;
  final String? subtitle;

  /// Antojo cuyo dibujo usa el anuncio ('hamburguesas', 'pizza'…).
  final String? icon;

  /// «#RRGGBB», o null para el color por defecto.
  final String? color;

  /// AAAA-MM-DD, día de Colombia.
  final String desde;
  final String hasta;
  final int productos;
}

/// Un producto de la campaña con el local que lo vende.
class ItemCampana {
  const ItemCampana({
    required this.product,
    required this.businessId,
    required this.businessName,
    required this.abierto,
    this.businessImageUrl,
    this.cerradoMotivo,
  });

  factory ItemCampana.fromJson(Map<String, dynamic> j) {
    final b = j['business'] as Map<String, dynamic>;
    return ItemCampana(
      product: BusinessesRealDataSource.productoDesdeJson(
        j['product'] as Map<String, dynamic>,
      ),
      businessId: b['id'] as String,
      businessName: b['name'] as String? ?? '',
      businessImageUrl: b['imageUrl'] as String?,
      abierto: b['isOpen'] as bool? ?? false,
      cerradoMotivo: b['cerradoMotivo'] as String?,
    );
  }

  final ProductEntity product;
  final String businessId;
  final String businessName;
  final String? businessImageUrl;
  final bool abierto;
  final String? cerradoMotivo;
}

const _meses = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

String _dia(String fecha) {
  final p = fecha.split('-');
  if (p.length != 3) return fecha;
  final mes = int.tryParse(p[1]) ?? 0;
  final dia = int.tryParse(p[2]) ?? 0;
  if (mes < 1 || mes > 12 || dia == 0) return fecha;
  return '$dia ${_meses[mes - 1]}';
}

/// «Del 27 nov al 3 dic» (o «Solo el 27 nov» si es de un día).
String fechasDeCampana(Campana c) => c.desde == c.hasta
    ? 'Solo el ${_dia(c.desde)}'
    : 'Del ${_dia(c.desde)} al ${_dia(c.hasta)}';

class CampanasApi {
  const CampanasApi(this._dio);

  final Dio _dio;

  Future<List<Campana>> vigentes({double? lat, double? lng}) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/client/campanas',
      queryParameters: {
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
      },
    );
    return listaDeJson(res.data?['data'], Campana.fromJson);
  }

  Future<List<ItemCampana>> items(String id) async {
    final res = await _dio.get<Map<String, dynamic>>('/client/campanas/$id');
    return listaDeJson(res.data?['data'], ItemCampana.fromJson);
  }
}

final campanasApiProvider = Provider<CampanasApi>(
  (ref) => CampanasApi(ref.watch(apiClientProvider)),
);

/// Las campañas que rigen ahora en la plaza de la dirección guardada. Un fallo
/// de red devuelve vacío: el anuncio es un extra, nunca bloquea el inicio.
final campanasVigentesProvider = FutureProvider<List<Campana>>((ref) async {
  final dir = ref.watch(defaultAddressProvider);
  try {
    return await ref
        .read(campanasApiProvider)
        .vigentes(lat: dir?.lat, lng: dir?.lng);
  } on DioException {
    return const [];
  }
});

/// Los productos de una campaña. Aquí SÍ se propaga el error: la pantalla
/// distingue «terminó» de «no hay conexión».
final campanaItemsProvider =
    FutureProvider.family<List<ItemCampana>, String>((ref, id) {
  return ref.read(campanasApiProvider).items(id);
});
