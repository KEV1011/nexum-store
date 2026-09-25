import 'dart:math' as math;
import 'dart:ui';

import 'package:flutter/material.dart';

/// La lupa de vidrio que viaja por la barra inferior hasta el ítem activo.
///
/// POR QUÉ EXISTE ESTE WIDGET. Antes era un `AnimatedAlign` escrito dos veces
/// —una en el shell del cliente y otra en el home del conductor— con los
/// mismos números copiados. Dos copias de una animación divergen en cuanto
/// alguien toca una, y la barra es lo primero que se ve al abrir cualquiera de
/// las dos apps.
///
/// QUÉ LE FALTABA PARA VERSE COMO EN INSTAGRAM O EN iOS. Moverse ya se movía;
/// el problema era CÓMO:
///
///  1. `Curves.easeOutBack` SOBREPASA el destino y vuelve. Con los ítems a un
///     ancho de distancia, ese sobrepaso mete la lupa encima del vecino y
///     retrocede: se lee como un fallo, no como fluidez.
///  2. 420 ms es lento para una selección. Cuando el dedo ya se levantó, la
///     barra sigue viajando.
///  3. El cristal no se DEFORMABA. Eso es lo que separa un rectángulo que se
///     teletransporta de algo que parece líquido: al viajar se estira en la
///     dirección del movimiento y se recupera al llegar.
///
/// EL ESTIRAMIENTO NO MIDE LA VELOCIDAD REAL, y es deliberado: se usa una
/// campana `sin(pi·t)` —cero al salir, máxima a mitad de camino, cero al
/// llegar—, que es justo el perfil de velocidad de una curva de este tipo.
/// Derivarlo de la posición frame a frame daría lo mismo y dependería del
/// `dt`, que en un teléfono lento salta. Además se escala con la DISTANCIA:
/// saltar de «Inicio» a «Cuenta» estira más que ir al vecino, porque de verdad
/// se recorre más.
///
/// Y POR ESO NUNCA SE SALE DEL CLIP: la campana vale cero en los extremos del
/// recorrido, así que la lupa solo está estirada mientras viaja — quieta sobre
/// la primera o la última columna, su ancho es exactamente el de la columna.
/// Dónde cae el centro de la columna `pos` en el eje de `Alignment`.
///
/// Con un hijo de ancho W/n dentro de un padre de ancho W, la columna i queda
/// centrada en `2i/(n−1) − 1`. Se admite `pos` fraccionaria porque es lo que se
/// interpola mientras la lupa viaja. Equivocar esta cuenta deja la lupa entre
/// dos ítems y no lo delata ningún error: solo se ve torcida.
double alineacionDeColumna(double pos, int columnas) {
  if (columnas <= 1) return 0;
  return (2 * pos / (columnas - 1)) - 1;
}

/// Cuánto se alarga el cristal en un instante del viaje.
///
/// Campana `sin(pi·t)`: vale 1 (sin estirar) al salir y al llegar, y es máxima
/// a mitad de camino. **Que valga 1 en los extremos es lo que impide que la
/// lupa se salga del recorte de la barra** estando sobre la primera o la
/// última columna, donde no hay holgura. Se gradúa con la distancia del salto
/// —tres columnas es el más largo de una barra de cuatro— porque ir al vecino
/// y cruzar la barra entera no recorren lo mismo.
double estironDeViaje(double avance, double salto, {double maximo = 0.22}) {
  final t = avance.clamp(0.0, 1.0).toDouble();
  final intensidad = math.min(1.0, math.max(0.0, salto) / 3);
  return 1 + maximo * math.sin(math.pi * t) * intensidad;
}

class LupaVidrio extends StatefulWidget {
  const LupaVidrio({
    required this.columnas,
    required this.activa,
    this.radio = 26,
    this.margenH = 6,
    this.margenV = 7,
    super.key,
  });

  /// Cuántas posiciones tiene la barra (en el conductor, el botón central
  /// cuenta como una).
  final int columnas;

  /// Columna iluminada, o negativo cuando la pantalla actual no tiene botón.
  /// En ese caso la lupa se DESVANECE en su sitio en vez de irse a la primera:
  /// iluminar «Inicio» estando en otra pantalla es mentir sobre dónde está uno.
  final int activa;

  final double radio;
  final double margenH;
  final double margenV;

  @override
  State<LupaVidrio> createState() => _LupaVidrioState();
}

class _LupaVidrioState extends State<LupaVidrio>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  /// Posición en columnas (fraccionaria mientras viaja).
  late double _desde;
  late double _hasta;

  /// Cuántas columnas cubre el salto en curso: es lo que gradúa el estirón.
  double _salto = 0;

  @override
  void initState() {
    super.initState();
    _desde = _hasta = math.max(0, widget.activa).toDouble();
    _ctrl = AnimationController(
      vsync: this,
      value: 1,
      // Se reasigna en cada salto según la distancia; esta es solo para que el
      // controlador nunca exista sin duración.
      duration: const Duration(milliseconds: 260),
    )..addListener(() => setState(() {}));
  }

  @override
  void didUpdateWidget(covariant LupaVidrio anterior) {
    super.didUpdateWidget(anterior);
    if (widget.activa == anterior.activa) return;
    // Al volver de una pantalla sin botón no se viaja desde ningún sitio: la
    // lupa reaparece donde toca. Animar desde la última posición conocida
    // haría un barrido que el usuario no pidió.
    if (widget.activa < 0 || anterior.activa < 0) {
      _desde = _hasta = math.max(0, widget.activa).toDouble();
      _salto = 0;
      _ctrl.value = 1;
      return;
    }
    _desde = _posicionActual();
    _hasta = widget.activa.toDouble();
    _salto = (_hasta - _desde).abs();
    // La duración crece con la distancia, pero no proporcionalmente: un salto
    // de tres columnas con el triple de tiempo se arrastra. Base corta y un
    // incremento pequeño, con tope.
    final ms = math.min(380.0, 220 + (_salto * 45)).round();
    _ctrl
      ..duration = Duration(milliseconds: ms)
      ..forward(from: 0);
  }

  double _posicionActual() {
    final t =
        Curves.easeOutCubic.transform(_ctrl.value.clamp(0.0, 1.0).toDouble());
    return _desde + (_hasta - _desde) * t;
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.columnas;
    final pos = _posicionActual();

    final x = alineacionDeColumna(pos, n);

    final estiron = estironDeViaje(_ctrl.value, _salto);
    // Se conserva el volumen aparente: lo que se alarga se adelgaza, como
    // haría una gota. La mitad del estirón, y hacia dentro.
    final aplastado = 1 - (estiron - 1) * 0.45;

    return IgnorePointer(
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 180),
        opacity: widget.activa < 0 ? 0 : 1,
        child: Align(
          alignment: Alignment(x, 0),
          child: FractionallySizedBox(
            widthFactor: 1 / n,
            child: Padding(
              padding: EdgeInsets.symmetric(
                horizontal: widget.margenH,
                vertical: widget.margenV,
              ),
              child: Transform.scale(
                scaleX: estiron,
                scaleY: aplastado,
                child: _cristal(),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _cristal() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.radio),
      // Un desenfoque PROPIO, además del de la barra. Es deliberadamente flojo
      // (4 frente a los 22 de la barra): detrás de la lupa el fondo ya viene
      // desenfocado por el padre, así que subirlo no se notaría y solo costaría
      // otro `saveLayer` por fotograma. Lo poco que añade es profundidad — que
      // el borde de la lupa se lea como un canto de vidrio y no como un velo
      // pintado encima.
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 4, sigmaY: 4),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radio),
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.white.withValues(alpha: 0.26),
                Colors.white.withValues(alpha: 0.06),
              ],
            ),
            // Borde ASIMÉTRICO: arriba el reflejo, abajo casi nada. Un borde
            // uniforme se ve como una línea dibujada; así se lee el grosor.
            border: Border(
              top: BorderSide(color: Colors.white.withValues(alpha: 0.42), width: 1.2),
              left: BorderSide(color: Colors.white.withValues(alpha: 0.24), width: 1.2),
              right: BorderSide(color: Colors.white.withValues(alpha: 0.24), width: 1.2),
              bottom: BorderSide(color: Colors.white.withValues(alpha: 0.10), width: 1.2),
            ),
          ),
          child: const SizedBox.expand(),
        ),
      ),
    );
  }
}
