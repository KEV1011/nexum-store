import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';

/// Una de las cuatro puertas de ZIPA, en la rejilla de la home.
///
/// El tinte de categoría vive SOLO aquí y en los badges. Antes estas tarjetas
/// eran dos rectángulos con degradado a sangre —naranja y azul— compitiendo
/// entre sí y con el verde de marca: con tres acentos, ninguno significaba
/// nada. Por eso el color sigue acotado al tinte de la categoría y el verde de
/// marca no aparece: eso no cambia.
///
/// Lo que sí cambió: eran cuatro cajas blancas idénticas con un borde de un
/// pelo, y de lejos la home se leía como un formulario. Ahora cada puerta
/// tiene cuerpo —un velo de su propio tinte y el cuadro del icono con
/// volumen— sin salirse de la paleta.
///
/// Dentro del cuadro va una ILUSTRACIÓN a color, no el glifo pintado. Se
/// empezó con todo dibujado a mano para no depender de archivos, y el glifo
/// sigue ahí como respaldo, pero en pantalla un taxi ilustrado se reconoce
/// antes que una silueta de un solo tono y comunica a qué huele cada puerta.
///
/// El subtítulo va acotado a tres palabras a propósito. En una rejilla de dos
/// columnas, una frase más larga parte en tres líneas y descuadra la fila
/// entera; y si se deja en una línea con puntos suspensivos, no dice nada.
class TarjetaServicio extends StatefulWidget {
  const TarjetaServicio({
    required this.icono,
    required this.tinte,
    required this.titulo,
    required this.subtitulo,
    required this.onTap,
    this.ilustracion,
    super.key,
  });

  final ZipaIconName icono;

  /// Ilustración a color que reemplaza al glifo dentro del cuadro.
  ///
  /// El glifo sigue siendo obligatorio aunque haya ilustración: si el archivo
  /// falta o no carga, la puerta se dibuja igual en vez de dejar un cuadro
  /// vacío en la primera pantalla de la app.
  ///
  /// Hoy las cuatro puertas la llevan, y así debe seguir: una ilustración a
  /// color al lado de un glifo monocromo canta, y se vio en cuanto se montó
  /// solo la de Envíos. O todas, o ninguna.
  final String? ilustracion;

  final ZipaTinte tinte;
  final String titulo;

  /// Tres palabras como mucho.
  final String subtitulo;

  final VoidCallback onTap;

  @override
  State<TarjetaServicio> createState() => _TarjetaServicioState();
}

class _TarjetaServicioState extends State<TarjetaServicio> {
  bool _pulsada = false;

  @override
  Widget build(BuildContext context) {
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    final fondoIcono = oscuro ? widget.tinte.fondo.oscuro : widget.tinte.fondo.claro;
    final glifo = oscuro ? widget.tinte.glifo.oscuro : widget.tinte.glifo.claro;

    return AnimatedScale(
      scale: _pulsada ? 0.97 : 1,
      duration: const Duration(milliseconds: 110),
      curve: Curves.easeOut,
      child: Material(
        color: context.zSuperficie,
        borderRadius: BorderRadius.circular(18),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () {
            HapticFeedback.selectionClick();
            widget.onTap();
          },
          onTapDown: (_) => setState(() => _pulsada = true),
          onTapCancel: () => setState(() => _pulsada = false),
          onTapUp: (_) => setState(() => _pulsada = false),
          child: Ink(
            decoration: BoxDecoration(
              // Velo diagonal del propio tinte: separa una puerta de otra sin
              // que ninguna grite. Muy bajo a propósito — al 4 % se nota que
              // la tarjeta tiene temperatura, al 15 % vuelve el degradado a
              // sangre que ya se había retirado.
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  fondoIcono.withValues(alpha: oscuro ? 0.30 : 0.42),
                  context.zSuperficie,
                ],
              ),
              // Borde de un pelo en vez de sombra: separa de la superficie sin
              // levantar la tarjeta, que es lo que hacía que la home pareciera
              // un montón de cajas flotando.
              border: Border.all(color: context.zBorde),
            ),
            // Sin marca de agua. Se probó un glifo enorme y casi transparente
            // asomando por la esquina y en pantalla NO se lee como decoración:
            // se lee como una mancha recortada, como si algo se hubiera
            // dibujado mal. Un adorno que hace dudar de si la app está rota
            // resta más de lo que suma, y el velo del tinte ya da el cuerpo
            // que buscaba.
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 54,
                    height: 54,
                    decoration: BoxDecoration(
                      // El cuadro con volumen: el mismo tinte, más denso
                      // arriba. Es lo que lo despega del velo de la tarjeta,
                      // que ahora es del mismo color.
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          fondoIcono,
                          Color.lerp(fondoIcono, glifo, 0.16)!,
                        ],
                      ),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    alignment: Alignment.center,
                    // Con ilustración: entra casi llenando el cuadro, porque
                    // un dibujo a color reducido a un tercio se convierte en
                    // una mancha. `errorBuilder` vuelve al glifo si el archivo
                    // falta — una puerta sin icono en la primera pantalla es
                    // peor que un icono monocromo.
                    //
                    // Sin ella: el glifo agrandado dentro del cuadro. A 20 px
                    // en un cuadro de 54 ocupaba poco más de un tercio y las
                    // puertas se leían flojas. Se escala desde el tamaño del
                    // catálogo en vez de añadir una medida a `ZipaIconSize`,
                    // que tiene dos y una prueba lo vigila.
                    child: widget.ilustracion != null
                        ? Padding(
                            padding: const EdgeInsets.all(3),
                            child: Image.asset(
                              widget.ilustracion!,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => Transform.scale(
                                scale: 1.45,
                                child: ZipaIcon(widget.icono, color: glifo),
                              ),
                            ),
                          )
                        : Transform.scale(
                            scale: 1.45,
                            child: ZipaIcon(widget.icono, color: glifo),
                          ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    widget.titulo,
                    style: TextStyle(
                      fontSize: 15.5,
                      fontWeight: FontWeight.w800,
                      color: context.zTexto,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    widget.subtitulo,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(fontSize: 12.5, color: context.zTexto2),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
