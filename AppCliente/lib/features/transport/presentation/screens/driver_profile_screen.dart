import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/network/api_client.dart';
import 'package:nexum_client/core/utils/safe_back.dart';

/// El perfil del conductor, tal como lo ve el pasajero.
///
/// Existía el endpoint y no lo abría ninguna pantalla: los datos que dan
/// confianza —identidad comprobada, antecedentes consultados, papeles al día—
/// llevaban meses guardados sin que los viera nadie, justo en el momento en el
/// que hacen falta: antes de subirse al carro de un desconocido.
///
/// Regla de la pantalla: **nada se inventa cuando el dato falta**. Sin foto van
/// las iniciales, sin calificaciones dice «Nuevo» en vez de un número, y las
/// verificaciones que faltan se enseñan apagadas en vez de esconderse —
/// esconderlas haría que «3 verificaciones» pareciera la lista completa.
class DriverProfileScreen extends ConsumerStatefulWidget {
  const DriverProfileScreen({required this.driverId, super.key});

  final String driverId;

  @override
  ConsumerState<DriverProfileScreen> createState() => _DriverProfileScreenState();
}

class _DriverProfileScreenState extends ConsumerState<DriverProfileScreen> {
  Map<String, dynamic>? _perfil;
  String? _error;
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final res = await ref.read(apiClientProvider).get<Map<String, dynamic>>(
            '/client/drivers/${widget.driverId}/profile',
          );
      if (!mounted) return;
      setState(() {
        _perfil = res.data?['data'] as Map<String, dynamic>?;
        _cargando = false;
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() {
        _cargando = false;
        _error = (e.response?.data as Map?)?['error'] as String? ??
            'No se pudo cargar el perfil. Revisa tu conexión.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => safeBack(context),
        ),
        title: const Text('Tu conductor'),
      ),
      body: _cuerpo(),
    );
  }

  Widget _cuerpo() {
    if (_cargando) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.cloud_off_rounded, size: 40, color: context.textSecondaryColor),
              const SizedBox(height: 12),
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              FilledButton(onPressed: _cargar, child: const Text('Reintentar')),
            ],
          ),
        ),
      );
    }
    final p = _perfil;
    if (p == null) {
      return const Center(child: Text('No encontramos este conductor.'));
    }

    final verificaciones =
        (p['verificaciones'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
            const [];
    final elogios =
        (p['elogios'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ??
            const [];
    final hitos =
        (p['hitos'] as List<dynamic>?)?.cast<Map<String, dynamic>>() ?? const [];
    final nivelPro = p['nivelPro'] as String?;

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        _Encabezado(perfil: p),
        const SizedBox(height: 24),
        _Cifras(perfil: p),
        if (verificaciones.isNotEmpty) ...[
          const SizedBox(height: 28),
          _Verificaciones(
            items: verificaciones,
            cumplidas: (p['verificacionesCumplidas'] as num?)?.toInt() ?? 0,
            total: (p['verificacionesTotal'] as num?)?.toInt() ??
                verificaciones.length,
          ),
        ],
        // Nivel de Nexum Pro y hitos. Van juntos porque son lo mismo: lo que
        // este conductor lleva hecho. La insignia se prometía en los
        // beneficios de Plata y Oro («visible en tu perfil») y hasta ahora no
        // se enseñaba en ninguna parte.
        if (nivelPro != null || hitos.isNotEmpty) ...[
          const SizedBox(height: 28),
          _Seccion(titulo: 'Trayectoria'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (nivelPro != null) _Insignia(texto: 'Nexum Pro $nivelPro'),
              for (final h in hitos)
                _Insignia(texto: h['etiqueta'] as String? ?? ''),
            ],
          ),
        ],
        // Solo si alguien destacó algo: una sección vacía con el título
        // «Lo que destacan sus pasajeros» y nada debajo se lee como un vacío
        // en su contra, y lo único que dice es que aún no lo han calificado.
        if (elogios.isNotEmpty) ...[
          const SizedBox(height: 28),
          _Seccion(titulo: 'Lo que destacan sus pasajeros'),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final e in elogios)
                _Elogio(
                  etiqueta: e['etiqueta'] as String? ?? '',
                  veces: (e['veces'] as num?)?.toInt() ?? 0,
                ),
            ],
          ),
        ],
        if ((p['vehicleDescription'] as String?)?.trim().isNotEmpty ?? false) ...[
          const SizedBox(height: 28),
          _Seccion(titulo: 'Vehículo'),
          const SizedBox(height: 8),
          Text(
            p['vehicleDescription'] as String,
            style: TextStyle(fontSize: 15, color: context.textPrimaryColor),
          ),
        ],
      ],
    );
  }
}

class _Encabezado extends StatelessWidget {
  const _Encabezado({required this.perfil});
  final Map<String, dynamic> perfil;

  /// Iniciales de respaldo. Un muñeco genérico dice menos que las letras de su
  /// propio nombre, y además parece que faltara el dato.
  String get _iniciales {
    final partes = (perfil['fullName'] as String? ?? '')
        .trim()
        .split(RegExp(r'\s+'))
        .where((s) => s.isNotEmpty)
        .toList();
    if (partes.isEmpty) return '?';
    if (partes.length == 1) return partes.first.substring(0, 1).toUpperCase();
    return (partes.first.substring(0, 1) + partes[1].substring(0, 1))
        .toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final foto = perfil['photoUrl'] as String?;
    return Row(
      children: [
        CircleAvatar(
          radius: 38,
          backgroundColor: context.surfaceVariantColor,
          foregroundImage: (foto != null && foto.isNotEmpty)
              ? NetworkImage(ApiConfig.resolveUrl(foto))
              : null,
          child: Text(
            _iniciales,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: context.textSecondaryColor,
            ),
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                perfil['fullName'] as String? ?? 'Conductor',
                style: TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w800,
                  color: context.textPrimaryColor,
                ),
              ),
              if ((perfil['bio'] as String?)?.trim().isNotEmpty ?? false) ...[
                const SizedBox(height: 4),
                Text(
                  perfil['bio'] as String,
                  style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Cifras extends StatelessWidget {
  const _Cifras({required this.perfil});
  final Map<String, dynamic> perfil;

  @override
  Widget build(BuildContext context) {
    final rating = (perfil['rating'] as num?)?.toDouble();
    final conteo = (perfil['ratingCount'] as num?)?.toInt() ?? 0;
    final viajes = (perfil['totalTrips'] as num?)?.toInt() ?? 0;
    final desde = _anio(perfil['memberSince'] as String?);

    return Row(
      children: [
        // «Nuevo» y no un cinco de fábrica: nadie lo ha calificado todavía, y
        // enseñar una nota inventada en la pantalla con la que alguien decide
        // si se sube a un carro es de lo peor que puede hacer esta app.
        _Cifra(
          valor: rating == null ? 'Nuevo' : rating.toStringAsFixed(2),
          etiqueta: conteo > 0 ? 'Nota ($conteo)' : 'Nota',
        ),
        _Cifra(valor: '$viajes', etiqueta: 'Servicios'),
        if (desde != null) _Cifra(valor: desde, etiqueta: 'Con ZIPA desde'),
      ],
    );
  }

  String? _anio(String? iso) {
    if (iso == null) return null;
    final d = DateTime.tryParse(iso);
    return d == null ? null : DateFormat('MMM yyyy', 'es_CO').format(d);
  }
}

class _Cifra extends StatelessWidget {
  const _Cifra({required this.valor, required this.etiqueta});
  final String valor;
  final String etiqueta;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            valor,
            style: TextStyle(
              fontSize: 19,
              fontWeight: FontWeight.w800,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            etiqueta,
            style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
          ),
        ],
      ),
    );
  }
}

class _Verificaciones extends StatelessWidget {
  const _Verificaciones({
    required this.items,
    required this.cumplidas,
    required this.total,
  });

  final List<Map<String, dynamic>> items;
  final int cumplidas;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _Seccion(titulo: 'Verificaciones'),
            Text(
              '$cumplidas de $total',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: context.textSecondaryColor,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        // Las que faltan se enseñan apagadas, no se esconden: una lista de tres
        // marcas verdes parecería completa, y no lo estaría.
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final v in items)
              _Chip(
                texto: v['etiqueta'] as String? ?? '',
                verificada: v['verificada'] as bool? ?? false,
              ),
          ],
        ),
      ],
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.texto, required this.verificada});
  final String texto;
  final bool verificada;

  @override
  Widget build(BuildContext context) {
    final color = verificada ? const Color(0xFF1B8A5A) : context.textSecondaryColor;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(
          color: verificada
              ? const Color(0xFF1B8A5A).withValues(alpha: 0.35)
              : Colors.transparent,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            verificada ? Icons.check_circle_rounded : Icons.circle_outlined,
            size: 16,
            color: color,
          ),
          const SizedBox(width: 7),
          Text(
            texto,
            style: TextStyle(
              fontSize: 13,
              fontWeight: verificada ? FontWeight.w600 : FontWeight.w400,
              color: verificada ? context.textPrimaryColor : context.textSecondaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

/// Una insignia: el nivel Pro o un hito alcanzado.
class _Insignia extends StatelessWidget {
  const _Insignia({required this.texto});
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF8A6D1B).withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF8A6D1B).withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.workspace_premium_rounded,
              size: 16, color: Color(0xFF8A6D1B)),
          const SizedBox(width: 7),
          Text(
            texto,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: context.textPrimaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

/// Un elogio con su número de veces.
///
/// El número va SIEMPRE. «Puntual» a secas podría venir de un solo viaje y
/// parecería una costumbre; «Puntual · 7» dice lo que de verdad hay.
class _Elogio extends StatelessWidget {
  const _Elogio({required this.etiqueta, required this.veces});

  final String etiqueta;
  final int veces;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            etiqueta,
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: context.textPrimaryColor,
            ),
          ),
          const SizedBox(width: 8),
          Text(
            '$veces',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w800,
              color: context.textSecondaryColor,
            ),
          ),
        ],
      ),
    );
  }
}

class _Seccion extends StatelessWidget {
  const _Seccion({required this.titulo});
  final String titulo;

  @override
  Widget build(BuildContext context) {
    return Text(
      titulo,
      style: TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w800,
        color: context.textPrimaryColor,
      ),
    );
  }
}
