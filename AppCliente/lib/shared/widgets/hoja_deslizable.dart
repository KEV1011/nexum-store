/// El marco de una hoja inferior que SÍ se puede deslizar.
///
/// EL FALLO QUE ESTO CIERRA. Las hojas del repo eran un `Column` con
/// `mainAxisSize.min` dentro de un `Container`, sin nada que deslizara.
/// Mientras el contenido cupo en pantalla no se notó. Dejó de caber en la
/// reserva intermunicipal —mapa de sillas, recogida, notas, cupón,
/// comodidades y un formulario de datos POR CADA pasajero— y el botón de
/// confirmar quedó debajo del borde de la pantalla, sin forma de llegar a
/// él. No había error, no había aviso: la hoja simplemente terminaba.
///
/// Y NO ES SOLO LA HOJA LARGA. Cualquier hoja con un campo de texto se
/// desborda igual en cuanto sale el teclado: la mitad de la pantalla
/// desaparece y lo que cabía deja de caber. De las quince hojas del repo,
/// trece tienen campos.
///
/// EL MARCO VA FUERA DEL SCROLL, A PROPÓSITO. Si el fondo redondeado
/// viajara dentro, al deslizar se vería subir el borde superior y
/// aparecería el velo oscuro detrás. Aquí el marco se queda quieto y solo
/// se mueve el contenido, que es como se comporta una hoja de Material.
///
/// USO: `showModalBottomSheet(isScrollControlled: true, backgroundColor:
/// Colors.transparent, builder: …)` y dentro `HojaDeslizable(children: […])`.
/// `isScrollControlled` es obligatorio: sin él la hoja no pasa de la mitad
/// de la pantalla y el límite de aquí no sirve de nada.
library;

import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';

class HojaDeslizable extends StatelessWidget {
  const HojaDeslizable({
    required this.children,
    this.padding = const EdgeInsets.all(20),
    this.fraccionMaxima = 0.92,
    this.asa = true,
    this.crossAxisAlignment = CrossAxisAlignment.start,
    super.key,
  });

  /// El contenido, tal cual estaba en el `Column` de antes.
  ///
  /// Ninguno puede ser `Expanded` ni `Spacer` en este nivel: dentro de un
  /// scroll la altura es ilimitada y «ocupa lo que sobre» no significa
  /// nada. Dentro de un `Row` siguen siendo correctos.
  final List<Widget> children;

  final EdgeInsets padding;

  /// Cuánto de la pantalla puede ocupar como mucho. No llega a 1 para que
  /// siempre se vea un poco del fondo: es la pista de que se puede cerrar
  /// tocando fuera.
  final double fraccionMaxima;

  final bool asa;
  final CrossAxisAlignment crossAxisAlignment;

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    return Padding(
      // El teclado empuja la hoja hacia arriba; el scroll de abajo lleva al
      // campo enfocado. Hacen falta los dos: con solo el primero, la hoja
      // sube y el contenido de arriba se pierde.
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: Container(
        constraints: BoxConstraints(
          maxHeight: media.size.height * fraccionMaxima,
        ),
        decoration: BoxDecoration(
          color: context.surfaceColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (asa) ...[
              const SizedBox(height: 10),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: context.outlineColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ],
            // `Flexible` y no `Expanded`: con poco contenido la hoja se
            // encoge a su alto en vez de estirarse hasta el tope.
            Flexible(
              child: SingleChildScrollView(
                padding: padding,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: crossAxisAlignment,
                  children: children,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Envuelve una hoja QUE YA EXISTE para que se pueda deslizar.
///
/// POR QUÉ HAY DOS FORMAS. [HojaDeslizable] es la buena: pone el marco y
/// deja dentro solo el contenido, así el borde superior se queda quieto al
/// deslizar. Pero pasar a ella una hoja ya escrita obliga a desmontarle el
/// `Container`, el `Padding` y el `Column`, y eso en catorce pantallas que
/// no se pueden ver aquí es mucho riesgo por una mejora estética.
///
/// Esta función hace lo que de verdad falta —el límite de alto, el inset
/// del teclado y el scroll— sin tocar una línea del aspecto de la hoja.
/// Cada una conserva exactamente sus colores, sus márgenes y su asa.
///
/// El contenido no puede llevar `Expanded` ni `Spacer` en su nivel raíz:
/// dentro de un scroll la altura es ilimitada y «ocupa lo que sobre» no
/// significa nada. Dentro de un `Row` siguen siendo correctos.
Widget envolverHoja(
  BuildContext context,
  Widget contenido, {
  double fraccionMaxima = 0.92,
}) {
  final media = MediaQuery.of(context);
  return Padding(
    padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
    child: ConstrainedBox(
      constraints: BoxConstraints(maxHeight: media.size.height * fraccionMaxima),
      child: SingleChildScrollView(child: contenido),
    ),
  );
}
