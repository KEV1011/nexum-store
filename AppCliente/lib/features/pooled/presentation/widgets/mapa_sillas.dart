import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/zipa_vehiculos.dart';
import 'package:nexum_client/features/pooled/domain/entities/pooled_trip_entity.dart';

/// El plano del vehículo para elegir dónde sentarse.
///
/// POR QUÉ SE DIBUJA EL VEHÍCULO Y NO UNA LISTA DE NÚMEROS
/// -------------------------------------------------------
/// Quien elige silla no está eligiendo un número: está eligiendo ventana,
/// adelante porque se marea, o al lado de quien viaja con él. Una lista de
/// casillas «1, 2, 3…» no responde ninguna de esas preguntas; el plano sí, de
/// un vistazo y sin leer.
///
/// LA ORIENTACIÓN IMPORTA. El frente va arriba, con el conductor y la puerta
/// dibujados: sin esa referencia, «adelante» es una lotería y el pasajero
/// descubre en el bus que pidió la última fila.
///
/// Lo ocupado se ve ocupado y no se puede tocar. No se esconde: saber que el
/// bus va casi lleno es parte de la decisión de comprar ya.
class MapaSillas extends StatelessWidget {
  const MapaSillas({
    required this.mapa,
    required this.seleccionadas,
    required this.onToque,
    this.maximo,
    super.key,
  });

  final MapaAsientos mapa;

  /// Las que lleva elegidas ahora mismo.
  final Set<int> seleccionadas;

  final void Function(int numero) onToque;

  /// Cuántas puede llevar como mucho. Al llegar al tope, las libres que no
  /// tenga elegidas se apagan — es más claro que dejar tocar y luego negar.
  final int? maximo;

  @override
  Widget build(BuildContext context) {
    final tope = maximo;
    final lleno = tope != null && seleccionadas.length >= tope;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            // La silueta del vehículo REAL al lado del nombre: con «Buseta»
            // escrito no se sabe si es la van de doce o el bus de cuarenta, y
            // es lo primero que pregunta quien compra en una taquilla.
            if (vehiculoDeTipo(mapa.tipo) != null) ...[
              SizedBox(
                width: 34,
                height: 20,
                child: CustomPaint(
                  painter: ZipaVehiculoPainter(
                    vehiculo: vehiculoDeTipo(mapa.tipo)!,
                    cuerpo: AppColors.primary,
                    hueco: context.surfaceColor,
                    rueda: AppColors.primary,
                  ),
                ),
              ),
              const SizedBox(width: 7),
            ],
            Text(
              mapa.etiqueta,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: context.textPrimaryColor,
              ),
            ),
            const Spacer(),
            Text(
              '${mapa.libres} libre${mapa.libres == 1 ? '' : 's'}',
              style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
            ),
          ],
        ),
        const SizedBox(height: 10),
        // La carrocería: da el marco que convierte una rejilla en un vehículo.
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: context.surfaceVariantColor,
            borderRadius: const BorderRadius.vertical(
              top: Radius.circular(26),
              bottom: Radius.circular(12),
            ),
            border: Border.all(color: context.outlineColor),
          ),
          child: Column(
            children: [
              for (final fila in mapa.filas)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (final celda in fila)
                        _Celda(
                          celda: celda,
                          elegida: celda.numero != null &&
                              seleccionadas.contains(celda.numero),
                          // Con el tope alcanzado, las demás libres se apagan.
                          bloqueada: lleno &&
                              celda.esSilla &&
                              !celda.ocupada &&
                              !seleccionadas.contains(celda.numero),
                          onToque: onToque,
                        ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 14,
          runSpacing: 6,
          children: [
            _Leyenda(color: context.surfaceColor, borde: context.outlineColor, texto: 'Libre'),
            _Leyenda(color: AppColors.primary, borde: AppColors.primary, texto: 'Tuya'),
            _Leyenda(
              color: context.outlineColor,
              borde: context.outlineColor,
              texto: 'Ocupada',
            ),
          ],
        ),
      ],
    );
  }
}

class _Celda extends StatelessWidget {
  const _Celda({
    required this.celda,
    required this.elegida,
    required this.bloqueada,
    required this.onToque,
  });

  final CeldaAsiento celda;
  final bool elegida;
  final bool bloqueada;
  final void Function(int numero) onToque;

  static const double _lado = 34;

  @override
  Widget build(BuildContext context) {
    // El pasillo y los huecos ocupan sitio pero no se pintan: son lo que hace
    // que la rejilla se lea como un vehículo y no como un tablero.
    if (celda.tipo == 'pasillo' || celda.tipo == 'vacio') {
      return const SizedBox(width: _lado, height: _lado);
    }

    if (celda.tipo == 'conductor' || celda.tipo == 'puerta') {
      final esConductor = celda.tipo == 'conductor';
      return SizedBox(
        width: _lado,
        height: _lado,
        child: Center(
          child: Icon(
            esConductor ? Icons.airline_seat_recline_normal : Icons.sensor_door_outlined,
            size: 18,
            color: context.textTertiaryColor,
            semanticLabel: esConductor ? 'Conductor' : 'Puerta',
          ),
        ),
      );
    }

    final numero = celda.numero!;
    final libre = !celda.ocupada && !bloqueada;

    final fondo = celda.ocupada
        ? context.outlineColor
        : elegida
            ? AppColors.primary
            : context.surfaceColor;
    final texto = elegida
        ? Colors.white
        : celda.ocupada
            ? context.textTertiaryColor
            : context.textPrimaryColor;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 3),
      child: Opacity(
        opacity: bloqueada ? 0.45 : 1,
        child: Semantics(
          button: libre,
          selected: elegida,
          label: celda.ocupada ? 'Silla $numero, ocupada' : 'Silla $numero',
          child: GestureDetector(
            onTap: libre
                ? () {
                    HapticFeedback.selectionClick();
                    onToque(numero);
                  }
                : null,
            child: Container(
              width: _lado,
              height: _lado,
              decoration: BoxDecoration(
                color: fondo,
                borderRadius: const BorderRadius.vertical(
                  top: Radius.circular(10),
                  bottom: Radius.circular(5),
                ),
                border: Border.all(
                  color: elegida ? AppColors.primary : context.outlineColor,
                  width: elegida ? 2 : 1,
                ),
              ),
              alignment: Alignment.center,
              child: Text(
                '$numero',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: elegida ? FontWeight.w800 : FontWeight.w600,
                  color: texto,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Leyenda extends StatelessWidget {
  const _Leyenda({required this.color, required this.borde, required this.texto});

  final Color color;
  final Color borde;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 14,
          height: 14,
          decoration: BoxDecoration(
            color: color,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: borde),
          ),
        ),
        const SizedBox(width: 5),
        Text(
          texto,
          style: TextStyle(fontSize: 11.5, color: context.textSecondaryColor),
        ),
      ],
    );
  }
}
