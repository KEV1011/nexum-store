import 'package:flutter/material.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';

/// La indicación que el pasajero le dejó al conductor («Estoy en la portería
/// del edificio azul»).
///
/// Es la llamada de «¿dónde está usted?» que no hace falta hacer. Va con
/// fondo ámbar y letra oscura FIJOS —no adaptativos— porque se pinta sobre la
/// oferta y las tarjetas del viaje, que en esta app son claras sobre el mapa
/// en los dos temas: un texto adaptativo saldría blanco sobre ámbar claro.
class NotaDelPasajero extends StatelessWidget {
  const NotaDelPasajero({required this.nota, super.key});

  final String nota;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.warningContainer,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.sticky_note_2_outlined,
            size: 18,
            color: AppColors.textPrimary,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text.rich(
              TextSpan(
                children: [
                  const TextSpan(
                    text: 'Nota del pasajero: ',
                    style: TextStyle(fontWeight: FontWeight.w800),
                  ),
                  TextSpan(text: nota),
                ],
              ),
              style: const TextStyle(
                fontSize: 13,
                height: 1.3,
                color: AppColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
