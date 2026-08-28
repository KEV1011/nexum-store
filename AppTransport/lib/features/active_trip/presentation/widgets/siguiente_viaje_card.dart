/// Oferta del SIGUIENTE viaje, enseñada mientras el conductor termina el actual.
///
/// Deliberadamente pequeña. La oferta normal ocupa la pantalla entera y está
/// bien: quien la mira está parado esperando trabajo. Esta llega cuando va
/// conduciendo con un pasajero dentro, así que taparle el mapa y la navegación
/// con una pantalla completa sería, además de molesto, peligroso. Ocupa una
/// franja arriba, dice lo justo para decidir de un vistazo —cuánto y a cuánto
/// está la recogida— y tiene dos botones grandes.
///
/// Si no la toca, se descarta sola: el servidor deja de esperar a los quince
/// segundos y se la ofrece a otro. Aquí la cuenta atrás se ve, para que sepa
/// que no la va a tener ahí toda la carrera.
library;

import 'package:flutter/material.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/features/trip_requests/domain/entities/trip_request_entity.dart';

class SiguienteViajeCard extends StatelessWidget {
  const SiguienteViajeCard({
    required this.oferta,
    required this.segundos,
    required this.onAceptar,
    required this.onRechazar,
    super.key,
  });

  final TripRequestEntity oferta;
  final int segundos;
  final VoidCallback onAceptar;
  final VoidCallback onRechazar;

  String get _queEs {
    if (oferta.isOrder) return 'Siguiente entrega';
    if (oferta.isErrand) return 'Siguiente mandado';
    return 'Siguiente viaje';
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 12,
      right: 12,
      top: 0,
      child: SafeArea(
        child: Material(
          elevation: 10,
          borderRadius: BorderRadius.circular(18),
          color: AppColors.textPrimary,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.bolt_rounded,
                        color: AppColors.primary, size: 18),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        _queEs,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.3,
                        ),
                      ),
                    ),
                    // La cuenta atrás: sin ella no se sabe si hay tiempo de
                    // mirar el retrovisor antes de decidir.
                    Text(
                      '${segundos}s',
                      style: TextStyle(
                        color: segundos <= 5
                            ? AppColors.error
                            : Colors.white.withValues(alpha: 0.7),
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Text(
                      CurrencyFormatter.format(oferta.estimatedFare),
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        oferta.origin.address,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.75),
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: onRechazar,
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(44),
                          foregroundColor: Colors.white,
                          side: BorderSide(
                            color: Colors.white.withValues(alpha: 0.35),
                          ),
                        ),
                        child: const Text('Ahora no'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: onAceptar,
                        style: ElevatedButton.styleFrom(
                          minimumSize: const Size.fromHeight(44),
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                        ),
                        child: const Text('Aceptar para después'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
