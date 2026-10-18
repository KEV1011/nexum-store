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

class BarraSecciones extends StatefulWidget {
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
  State<BarraSecciones> createState() => _BarraSeccionesState();
}

/// LA BARRA SIGUE A LA CARTA. Al desplazar la carta la sección activa
/// cambiaba, pero la barra se quedaba quieta: el chip resaltado se iba por
/// un lado de la pantalla y la barra dejaba de decir dónde estabas.
///
/// Por eso los chips van en una fila construida ENTERA (no en una lista
/// perezosa: un chip sin construir no tiene posición que centrar; una carta
/// tiene decenas de secciones, no miles) y, cuando cambia la activa, se
/// centra con `ScrollPosition.ensureVisible` de ESTA barra. No con
/// `Scrollable.ensureVisible`: ese recorre todos los desplazables de arriba y
/// también movería la carta, peleándose con el dedo de quien la desplaza.
class _BarraSeccionesState extends State<BarraSecciones> {
  final ScrollController _fila = ScrollController();
  final Map<String, GlobalKey> _claves = {};

  GlobalKey _claveDe(String s) => _claves.putIfAbsent(s, GlobalKey.new);

  @override
  void didUpdateWidget(covariant BarraSecciones old) {
    super.didUpdateWidget(old);
    if (old.activa != widget.activa && widget.activa != null) {
      final s = widget.activa!;
      WidgetsBinding.instance.addPostFrameCallback((_) => _centrar(s));
    }
  }

  void _centrar(String seccion) {
    if (!mounted || !_fila.hasClients) return;
    final caja = _claves[seccion]?.currentContext?.findRenderObject();
    if (caja == null || !caja.attached) return;
    _fila.position.ensureVisible(
      caja,
      alignment: 0.5,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void dispose() {
    _fila.dispose();
    super.dispose();
  }

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
        child: SingleChildScrollView(
          controller: _fila,
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            children: [
              for (var i = 0; i < widget.secciones.length; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                _Chip(
                  key: _claveDe(widget.secciones[i]),
                  texto: widget.secciones[i],
                  activa: widget.secciones[i] == widget.activa,
                  onTap: () {
                    HapticFeedback.selectionClick();
                    widget.onSeleccion(widget.secciones[i]);
                  },
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({
    required this.texto,
    required this.activa,
    required this.onTap,
    super.key,
  });

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
