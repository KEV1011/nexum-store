/// Qué color de letra se lee sobre un fondo, calculado y no elegido a ojo.
///
/// EL CASO QUE LO OBLIGÓ: el verde de ZIPA (#00C853) con texto blanco da
/// **2,24:1**, y la norma de accesibilidad —la que mira el informe previo de
/// Play— pide 4,5:1. Sobre ese mismo verde, el texto oscuro da **7,93:1**.
/// Es contraintuitivo: el verde parece oscuro porque está saturado, pero en
/// luminancia es claro, y por eso el blanco encima se diluye. Decidirlo «a
/// ojo» es justo lo que lleva a equivocarse.
///
/// Y no hay UN color correcto para todos los botones: el rojo de error y el
/// azul intermunicipal sí piden blanco, mientras el verde, el ámbar y el
/// naranja del taxi piden oscuro. Por eso se calcula por fondo en vez de
/// escribir el color en cada pantalla.
///
/// Misma regla que ya usa el servidor para el color de la marca de un local
/// (`backend/src/lib/marca-local.ts`): luminancia relativa de la WCAG y se
/// queda el que más contraste dé. Si las dos superficies decidieran distinto,
/// la carta del local y el botón de pedir se verían de familias diferentes.
library;

import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:nexum_client/app/theme/app_colors.dart';

/// Luminancia relativa de la WCAG (0 = negro, 1 = blanco).
///
/// `Color.computeLuminance()` de Flutter calcula exactamente esto, así que se
/// usa el de la plataforma en vez de repetir la fórmula.
double _luminancia(Color c) => c.computeLuminance();

/// Contraste entre dos colores, de 1 (iguales) a 21 (negro sobre blanco).
///
/// La norma pide **4,5** para texto normal y 3 para texto grande o iconos.
double contrasteWcag(Color a, Color b) {
  final la = _luminancia(a);
  final lb = _luminancia(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// El color de letra que mejor se lee sobre [fondo]: blanco o el oscuro de la
/// marca, el que más contraste dé.
///
/// Devuelve uno de los dos y no un gris intermedio a propósito: un texto de
/// botón en un tono a medio camino se ve descolorido, y dos botones con grises
/// distintos se leen como si uno estuviera deshabilitado.
Color colorDeTextoSobre(Color fondo) =>
    contrasteWcag(fondo, Colors.white) >= contrasteWcag(fondo, AppColors.textPrimary)
        ? Colors.white
        : AppColors.textPrimary;

/// `true` si sobre [fondo] NINGUNA de las dos letras llega a 4,5:1.
///
/// No se usa para decidir nada en pantalla: existe para que una prueba pueda
/// señalar un fondo que no se puede arreglar con la letra y hay que cambiar.
bool fondoImposible(Color fondo) =>
    contrasteWcag(fondo, colorDeTextoSobre(fondo)) < 4.5;
