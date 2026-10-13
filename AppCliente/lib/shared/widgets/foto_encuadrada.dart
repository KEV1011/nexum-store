/// Una foto que se ve ENTERA sin dejar franjas vacías.
///
/// EL PROBLEMA. Los marcos de la app son panorámicos —la portada de un local,
/// el carrusel de un plato— y lo que sube la gente no siempre lo es. `cover`
/// llena el marco recortando, y eso funciona de maravilla con una foto
/// apaisada del sitio y destroza un logo cuadrado: al local «BETO» le cortaba
/// el letrero por arriba y por abajo, que es justo lo que el dueño quería
/// enseñar. Y `contain` a secas resuelve el logo pero deja dos franjas muertas
/// a los lados de cada foto apaisada.
///
/// LA REGLA, que es una sola y sirve para los dos casos: la foto se pinta
/// ENTERA (`contain`) sobre un fondo hecho con ella misma, ampliado y
/// desenfocado. Si la foto ya es panorámica, `contain` llena el marco y el
/// fondo no se ve: queda exactamente igual que antes. Si es cuadrada o
/// vertical, se ve completa y los lados los rellena su propio color en vez de
/// un gris que parece un fallo de carga. Es lo que hace YouTube con las
/// miniaturas verticales.
///
/// POR QUÉ NO SE MIDE LA PROPORCIÓN. La otra salida era leer el tamaño real
/// de la imagen y elegir `cover` o `contain` según saliera apaisada o no. Eso
/// obliga a resolver la imagen antes de pintar —o sea un primer fotograma sin
/// nada y un salto cuando llega—, y deja un umbral que acierta mal justo en
/// las proporciones de en medio. Esta regla no tiene umbral ni espera.
library;

import 'dart:ui' as ui;

import 'package:flutter/material.dart';

class FotoEncuadrada extends StatelessWidget {
  const FotoEncuadrada({
    required this.url,
    this.fallback,
    this.semanticLabel,
    super.key,
  });

  /// La URL ya resuelta a absoluta.
  final String url;

  /// Qué pintar si la foto no carga. Sin esto no se dibuja nada: un marco
  /// gris vacío se lee como «la app está rota», no como «falta la foto».
  final Widget? fallback;

  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final vacio = fallback ?? const SizedBox.shrink();

    return Stack(
      fit: StackFit.expand,
      children: [
        // El fondo: la misma foto llenando el marco y desenfocada. Se amplía
        // un 10 % porque el desenfoque chupa transparencia de los bordes y
        // sin el margen se ve un halo claro pegado al marco.
        ImageFiltered(
          imageFilter: ui.ImageFilter.blur(sigmaX: 22, sigmaY: 22),
          child: Transform.scale(
            scale: 1.1,
            child: Image.network(url, fit: BoxFit.cover, errorBuilder: (_, __, ___) => vacio),
          ),
        ),
        // Un velo para que el fondo no compita con la foto de delante ni con
        // el texto que va encima (el nombre del local lleva su propio scrim).
        const ColoredBox(color: Color(0x40000000)),
        // Y la foto entera. Es la MISMA URL, así que la descarga y el
        // descodificado se comparten con la capa de atrás.
        Image.network(
          url,
          fit: BoxFit.contain,
          semanticLabel: semanticLabel,
          errorBuilder: (_, __, ___) => vacio,
        ),
      ],
    );
  }
}
