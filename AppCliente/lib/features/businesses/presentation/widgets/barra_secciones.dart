/// La barra de secciones de una carta: «Hamburguesas · Perros · Bebidas».
///
/// POR QUÉ HACE FALTA. El detalle del negocio ya agrupaba los platos por
/// sección, pero para saber QUÉ secciones hay había que desplazarse hasta el
/// final. En una carta de sesenta platos eso significa que las bebidas y los
/// postres no existen para la mayoría de la gente. La carta del QR (`/carta`)
/// ya tenía esta barra; la app no, y es la misma carta del mismo local.
///
/// EL SALTO, Y POR QUÉ ES EN DOS FASES. En un `CustomScrollView` las secciones
/// que están lejos no están construidas, así que su `GlobalKey` no tiene
/// contexto y `Scrollable.ensureVisible` no puede hacer nada con ellas. La
/// salida es avanzar una pantalla en la dirección correcta —lo que obliga a
/// construir lo que viene— y volver a intentarlo. Con el número de intentos
/// acotado: si algo sale mal, la carta se queda donde esté y el dedo sigue
/// funcionando, que es mucho mejor que un bucle que no termina.
///
/// LO QUE NO SE HACE: marcar una sección activa cuando no se sabe cuál es. Al
/// desplazarse a mano se resalta la última cuyo encabezado pasó por el tope;
/// si ninguna está construida todavía, no se resalta ninguna en vez de dejar
/// marcada la primera, que diría que estás en un sitio donde no estás.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:nexum_client/app/theme/adaptive_colors.dart';
import 'package:nexum_client/app/theme/app_colors.dart';
import 'package:nexum_client/app/theme/contraste.dart';

/// Alto de la barra. Fijo, porque es un encabezado fijado (`pinned`).
const double kAltoBarraSecciones = 52;

class BarraSecciones extends StatelessWidget {
  const BarraSecciones({
    required this.secciones,
    required this.activa,
    required this.onSeleccion,
    super.key,
  });

  /// Los títulos, en el MISMO orden en que aparecen en la carta.
  final List<String> secciones;

  /// La que está a la vista, o `null` si todavía no se sabe.
  final String? activa;

  final void Function(String seccion) onSeleccion;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: context.surfaceColor,
        border: Border(
          bottom: BorderSide(color: context.appDividerColor, width: 0.5),
        ),
      ),
      child: SizedBox(
        height: kAltoBarraSecciones,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          itemCount: secciones.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, i) {
            final s = secciones[i];
            final esActiva = s == activa;
            return _Chip(
              texto: s,
              activa: esActiva,
              onTap: () {
                HapticFeedback.selectionClick();
                onSeleccion(s);
              },
            );
          },
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.texto, required this.activa, required this.onTap});

  final String texto;
  final bool activa;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    // La letra sobre el verde de marca la decide el cálculo de contraste, no
    // un blanco fijo: #00C853 con texto blanco da 2,24:1 y la norma pide 4,5.
    final fondo = activa ? AppColors.primary : context.cardColor2;
    final texto2 = activa ? colorDeTextoSobre(fondo) : context.textSecondaryColor;

    return Material(
      color: fondo,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          child: Center(
            child: Text(
              texto,
              style: TextStyle(
                fontFamily: 'Inter',
                fontSize: 13,
                fontWeight: activa ? FontWeight.w700 : FontWeight.w600,
                color: texto2,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// El `SliverPersistentHeaderDelegate` que la deja fijada arriba.
class BarraSeccionesDelegate extends SliverPersistentHeaderDelegate {
  const BarraSeccionesDelegate({
    required this.secciones,
    required this.activa,
    required this.onSeleccion,
  });

  final List<String> secciones;
  final String? activa;
  final void Function(String seccion) onSeleccion;

  @override
  double get minExtent => kAltoBarraSecciones;

  @override
  double get maxExtent => kAltoBarraSecciones;

  @override
  Widget build(BuildContext context, double shrinkOffset, bool overlapsContent) {
    return BarraSecciones(
      secciones: secciones,
      activa: activa,
      onSeleccion: onSeleccion,
    );
  }

  @override
  bool shouldRebuild(covariant BarraSeccionesDelegate old) {
    return old.activa != activa || !_mismaLista(old.secciones, secciones);
  }

  static bool _mismaLista(List<String> a, List<String> b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}
