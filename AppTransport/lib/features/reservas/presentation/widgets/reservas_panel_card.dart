import 'package:flutter/material.dart';
import 'package:nexum_driver/core/network/dio_client.dart';

/// Acceso a las reservas desde el panel del home.
///
/// Va en el panel y no solo en el menú lateral por la misma razón que la
/// tarjeta de Intermunicipal: una función que solo se encuentra abriendo un
/// cajón no la usa nadie, y esta es la que le permite al taxista cuadrar la
/// mañana siguiente.
///
/// Enseña CUÁNTAS hay libres porque un número es lo que hace que se toque;
/// si la petición falla no se inventa ninguno — se muestra la tarjeta sin
/// contador, que es lo honesto.
class ReservasPanelCard extends StatefulWidget {
  const ReservasPanelCard({required this.onOpen, super.key});

  final VoidCallback onOpen;

  @override
  State<ReservasPanelCard> createState() => _ReservasPanelCardState();
}

class _ReservasPanelCardState extends State<ReservasPanelCard> {
  int? _libres;
  int? _mias;

  static const _text = Color(0xFFE2E8F0);
  static const _sub = Color(0xFF94A3B8);
  static const _acento = Color(0xFF38BDF8);

  @override
  void initState() {
    super.initState();
    _contar();
  }

  Future<void> _contar() async {
    try {
      final dio = DioClient();
      final libres = await dio.get<Map<String, dynamic>>('/driver/reservas');
      final mias = await dio.get<Map<String, dynamic>>('/driver/reservas/mias');
      if (!mounted) return;
      setState(() {
        _libres = (libres.data?['data'] as List?)?.length;
        _mias = (mias.data?['data'] as List?)?.length;
      });
    } catch (_) {
      // Sin contador: la tarjeta sigue llevando a la pantalla, que es donde de
      // verdad se ve el estado.
    }
  }

  @override
  Widget build(BuildContext context) {
    final mias = _mias ?? 0;
    final libres = _libres ?? 0;

    final detalle = _libres == null && _mias == null
        ? 'Viajes programados para más tarde'
        : mias > 0
            ? 'Tienes $mias apartada${mias == 1 ? '' : 's'}'
                '${libres > 0 ? ' · $libres libre${libres == 1 ? '' : 's'}' : ''}'
            : libres > 0
                ? '$libres reserva${libres == 1 ? '' : 's'} para apartar'
                : 'Sin reservas por ahora';

    return Material(
      color: _acento.withValues(alpha: 0.14),
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: widget.onOpen,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _acento.withValues(alpha: 0.42)),
          ),
          child: Row(children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: _acento,
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(Icons.event_available_rounded,
                  color: Color(0xFF0F172A), size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Reservas',
                      style: TextStyle(
                        color: _text,
                        fontWeight: FontWeight.w800,
                        fontSize: 14,
                      )),
                  const SizedBox(height: 2),
                  Text(detalle,
                      style: const TextStyle(color: _sub, fontSize: 12)),
                ],
              ),
            ),
            if (libres > 0)
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: _acento,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text('$libres',
                    style: const TextStyle(
                      color: Color(0xFF0F172A),
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                    )),
              ),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right_rounded, color: _sub, size: 20),
          ]),
        ),
      ),
    );
  }
}
