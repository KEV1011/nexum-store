// Filtro por tipo de comercio, en el home.
//
// POR QUÉ EXISTE. La puerta «Restaurantes» de la rejilla es, por dentro, un
// atajo de filtro (`_filtro = restaurant`): no abre otra pantalla. Era el
// ÚNICO atajo que había, así que el resto de rubros —tiendas de mercancía,
// supermercados, droguerías— solo se alcanzaban desplazándose por la lista
// entera. Con un almacén de ropa y electrodomésticos en el catálogo eso deja
// de ser un detalle: su sección no existía.
//
// Son PÍLDORAS y no tarjetas cuadradas como las del carrusel de mandados, a
// propósito: esto filtra la lista que hay justo debajo, y un filtro que se
// parece a una puerta hace esperar que abra otra pantalla.
//
// Y NO SE DIBUJA UNA CATEGORÍA QUE NO TENGA COMERCIOS. Una píldora
// «Droguerías» en una plaza sin droguerías lleva a una lista vacía, que se
// lee como que la app está rota; la lista sale de lo que de verdad llegó.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'business_visuals.dart';

/// Devuelve las categorías presentes en [comercios], en orden fijo.
///
/// El orden es el del enum y no el de llegada: si dependiera de qué comercio
/// cargó primero, las píldoras cambiarían de sitio entre una apertura y otra
/// y la gente tocaría la equivocada.
///
/// Con una sola categoría devuelve vacío: filtrar por lo único que hay no
/// filtra nada, y la fila solo ocuparía sitio.
List<BusinessCategory> categoriasPresentes(List<BusinessEntity> comercios) {
  final presentes = comercios.map((c) => c.category).toSet();
  final ordenadas =
      BusinessCategory.values.where(presentes.contains).toList();
  return ordenadas.length < 2 ? const [] : ordenadas;
}

class FilaCategoriasComercio extends StatelessWidget {
  const FilaCategoriasComercio({
    required this.categorias,
    required this.seleccionada,
    required this.onSeleccionar,
    super.key,
  });

  final List<BusinessCategory> categorias;

  /// Null = «Todo», que es como abre la pantalla.
  final BusinessCategory? seleccionada;

  /// Recibe null cuando se toca la píldora ya activa: se des-elige tocándola
  /// otra vez. Sin eso, quien filtra una vez se queda dentro del filtro.
  final ValueChanged<BusinessCategory?> onSeleccionar;

  @override
  Widget build(BuildContext context) {
    if (categorias.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: categorias.length + 1,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          if (i == 0) {
            return _Pildora(
              texto: 'Todo',
              activa: seleccionada == null,
              onTap: () => onSeleccionar(null),
            );
          }
          final c = categorias[i - 1];
          return _Pildora(
            texto: c.plural,
            icono: c.icon,
            acento: c.color,
            activa: seleccionada == c,
            onTap: () => onSeleccionar(seleccionada == c ? null : c),
          );
        },
      ),
    );
  }
}

class _Pildora extends StatelessWidget {
  const _Pildora({
    required this.texto,
    required this.activa,
    required this.onTap,
    this.icono,
    this.acento,
  });

  final String texto;
  final IconData? icono;
  final Color? acento;
  final bool activa;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    final tinte = acento ?? ZipaTokens.marca;
    // Activa: el tinte de la categoría de fondo y su glifo en blanco. En
    // oscuro el mismo tinte plano se apaga contra #1A1D27, así que se aclara.
    final fondo = activa
        ? (oscuro ? Color.lerp(tinte, Colors.white, 0.18)! : tinte)
        : context.zSuperficie;
    final texto2 = activa ? Colors.white : context.zTexto;

    return Material(
      color: fondo,
      borderRadius: BorderRadius.circular(20),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: activa ? null : Border.all(color: context.zBorde),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icono != null) ...[
                Icon(icono, size: 16, color: texto2),
                const SizedBox(width: 6),
              ],
              Text(
                texto,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: texto2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
