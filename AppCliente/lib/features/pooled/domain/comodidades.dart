import 'package:flutter/material.dart';

/// Qué trae el bus, para pintarlo.
///
/// Espejo de `backend/src/lib/amenidades.ts`: el servidor manda las claves ya
/// resueltas —incluido el baño, que él deriva del plano de sillas— y aquí solo
/// se decide con qué icono y con qué palabra se leen.
///
/// UNA CLAVE DESCONOCIDA SE IGNORA, no se pinta con un icono genérico. Si
/// mañana el backend añade una comodidad, las apps ya instaladas la saltan en
/// vez de enseñar un cuadro sin sentido; en cuanto se actualicen, aparece.
class Comodidad {
  const Comodidad(this.etiqueta, this.icono);
  final String etiqueta;
  final IconData icono;
}

const Map<String, Comodidad> kComodidades = {
  'aire': Comodidad('Aire acondicionado', Icons.ac_unit_rounded),
  'bano': Comodidad('Baño a bordo', Icons.wc_rounded),
  'reclinable': Comodidad('Silla reclinable', Icons.airline_seat_recline_extra_rounded),
  'usb': Comodidad('Cargador USB', Icons.usb_rounded),
  'wifi': Comodidad('Wi-Fi', Icons.wifi_rounded),
  'tv': Comodidad('Pantallas', Icons.tv_rounded),
  'bodega': Comodidad('Bodega', Icons.luggage_rounded),
  'mantas': Comodidad('Mantas', Icons.bed_rounded),
};

/// Las que se pueden pintar, en el orden en que llegaron (el servidor ya las
/// ordena igual para todas las salidas).
List<Comodidad> comodidadesDe(List<String> claves) => [
      for (final c in claves)
        if (kComodidades[c] != null) kComodidades[c]!,
    ];
