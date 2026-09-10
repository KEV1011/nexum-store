import 'package:flutter/material.dart';

/// Cuánto se deja crecer y encoger la letra respecto al ajuste del teléfono.
///
/// El problema real: mucha gente lleva el teléfono con la letra y el zoom de
/// pantalla al máximo porque no ve bien. Android permite llegar a 2× e incluso
/// más en algunas capas de fabricante, y a esa escala una pantalla pensada a
/// 1× no se "adapta": los textos se comen los botones, las tarjetas se
/// desbordan y el botón principal queda fuera de la pantalla.
///
/// Aquí se acota, y el tope está elegido a conciencia:
///
/// - **No se baja de 1× nunca por debajo de [minimo]**. Si alguien puso la
///   letra pequeña, se respeta, pero por debajo de 0,85 los textos de apoyo
///   quedan ilegibles para cualquiera.
/// - **[maximo] es 1,3**, que es justo el ajuste "más grande" del propio
///   Android. O sea: quien sube la letra por el menú normal la recibe entera.
///   Lo que se recorta es el rango de accesibilidad extremo (1,5×–2×), donde
///   ninguna pantalla de la app sobrevive.
///
/// Lo honesto es decir lo que esto NO hace: acotar evita que la app se rompa,
/// pero no la vuelve cómoda para quien necesita 2×. Eso pide revisar pantalla
/// por pantalla en un teléfono de verdad, que es lo único que juzga si algo se
/// solapa. Esto es el suelo, no el techo.
abstract final class EscalaTexto {
  static const double minimo = 0.85;
  static const double maximo = 1.3;

  /// Envuelve el árbol de la app acotando el escalado del sistema.
  static Widget acotar(Widget child) => MediaQuery.withClampedTextScaling(
        minScaleFactor: minimo,
        maxScaleFactor: maximo,
        child: child,
      );
}
