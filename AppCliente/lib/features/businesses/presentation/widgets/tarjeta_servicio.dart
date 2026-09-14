import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';

/// Una de las cuatro puertas de ZIPA, en la rejilla de la home.
///
/// El tinte de categoría vive SOLO aquí y en los badges. Antes estas tarjetas
/// eran dos rectángulos con degradado a sangre —naranja y azul— compitiendo
/// entre sí y con el verde de marca: con tres acentos, ninguno significaba
/// nada. Ahora el color se reduce al cuadro del icono y el resto de la tarjeta
/// es superficie, así que lo que destaca es el contenido y no el envase.
///
/// El subtítulo va acotado a tres palabras a propósito. En una rejilla de dos
/// columnas, una frase más larga parte en tres líneas y descuadra la fila
/// entera; y si se deja en una línea con puntos suspensivos, no dice nada.
class TarjetaServicio extends StatelessWidget {
  const TarjetaServicio({
    required this.icono,
    required this.tinte,
    required this.titulo,
    required this.subtitulo,
    required this.onTap,
    super.key,
  });

  final ZipaIconName icono;
  final ZipaTinte tinte;
  final String titulo;

  /// Tres palabras como mucho.
  final String subtitulo;

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    final fondoIcono = oscuro ? tinte.fondo.oscuro : tinte.fondo.claro;
    final glifo = oscuro ? tinte.glifo.oscuro : tinte.glifo.claro;

    return Material(
      color: context.zSuperficie,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            // Borde de un pelo en vez de sombra: separa de la superficie sin
            // levantar la tarjeta, que es lo que hacía que la home pareciera
            // un montón de cajas flotando.
            border: Border.all(color: context.zBorde),
          ),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    color: fondoIcono,
                    borderRadius: BorderRadius.circular(14),
                  ),
                  alignment: Alignment.center,
                  child: ZipaIcon(icono, color: glifo),
                ),
                const SizedBox(height: 12),
                Text(
                  titulo,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: context.zTexto,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitulo,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12.5, color: context.zTexto2),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
