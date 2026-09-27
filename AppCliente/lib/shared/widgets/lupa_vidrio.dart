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
/// QUÉ LE FALTABA PARA VERSE COMO LA DE WHATSAPP O iOS. Se fue por partes:
///
///  1. `Curves.easeOutBack` SOBREPASA el destino y vuelve. Con los ítems a un
///     ancho de distancia, ese sobrepaso mete la lupa encima del vecino y
///     retrocede: se lee como un fallo, no como fluidez.
///  2. 420 ms es lento para una selección. Cuando el dedo ya se levantó, la
///     barra sigue viajando.
///  3. El cristal no se DEFORMABA al viajar.
///  4. **No se podía ARRASTRAR.** Es lo que de verdad se pedía y lo que hacía
///     que la barra siguiera pareciendo la de siempre: en WhatsApp se mantiene
///     el dedo y la lupa lo sigue, pasando por encima de los ítems, y al
///     soltar se queda en el que toque. Sin eso, animar el salto es solo un
///     salto más bonito.
///  5. **No MAGNIFICABA.** Una píldora blanca translúcida no es una lupa: en
///     la referencia se ve que lo de debajo se agranda y el borde irisa. Eso
///     es lo que la hace leerse como un cristal y no como un velo pintado.
///
/// EL ESTIRAMIENTO NO MIDE LA VELOCIDAD REAL, y es deliberado: se usa una
/// campana `sin(pi·t)` —cero al salir, máxima a mitad de camino, cero al
/// llegar—, que es justo el perfil de velocidad de una curva de este tipo.
/// Derivarlo de la posición frame a frame daría lo mismo y dependería del
/// `dt`, que en un teléfono lento salta. Además se escala con la DISTANCIA:
/// saltar de «Inicio» a «Cuenta» estira más que ir al vecino.
///
/// Y POR ESO NUNCA SE SALE DEL CLIP: la campana vale cero en los extremos del
/// recorrido, así que la lupa solo está estirada mientras viaja — quieta sobre
/// la primera o la última columna, su ancho es exactamente el de la columna.
library;

/// Dónde cae el centro de la columna `pos` en el eje de `Alignment`.
///
/// Con un hijo de ancho W/n dentro de un padre de ancho W, la columna i queda
/// centrada en `2i/(n−1) − 1`. Se admite `pos` fraccionaria porque es lo que se
/// interpola mientras la lupa viaja y lo que vale mientras el dedo la arrastra.
/// Equivocar esta cuenta deja la lupa entre dos ítems y no lo delata ningún
/// error: solo se ve torcida.
double alineacionDeColumna(double pos, int columnas) {
  if (columnas <= 1) return 0;
  return (2 * pos / (columnas - 1)) - 1;
}

/// En qué columna (fraccionaria) está el dedo.
///
/// La inversa de repartir el ancho en `n` columnas iguales. Se ACOTA a
/// `[0, n−1]`: arrastrar más allá del borde deja la lupa pegada al extremo en
/// vez de salirse del recorte, que es lo que hace WhatsApp y lo que evita que
/// un dedo que se va por el lado de la pantalla mande la lupa a ninguna parte.
double columnaDesdeX(double dx, double ancho, int columnas) {
  if (columnas <= 1 || ancho <= 0) return 0;
  final col = (dx / ancho) * columnas - 0.5;
  return col.clamp(0.0, (columnas - 1).toDouble()).toDouble();
}

/// Cuánto se alarga el cristal en un instante del viaje.
///
/// Campana `sin(pi·t)`: vale 1 (sin estirar) al salir y al llegar, y es máxima
/// a mitad de camino. **Que valga 1 en los extremos es lo que impide que la
/// lupa se salga del recorte de la barra** estando sobre la primera o la
/// última columna, donde no hay holgura.
double estironDeViaje(double avance, double salto, {double maximo = 0.22}) {
  final t = avance.clamp(0.0, 1.0).toDouble();
  final intensidad = math.min(1.0, math.max(0.0, salto) / 3);
  return 1 + maximo * math.sin(math.pi * t) * intensidad;
}

class LupaVidrio extends StatefulWidget {
  const LupaVidrio({
    required this.columnas,
    required this.activa,
    this.arrastre,
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

  /// Columna (fraccionaria) donde está el dedo mientras arrastra.
  ///
  /// Manda sobre la animación y la corta: si no, al empezar a arrastrar en
  /// mitad de un salto la lupa pelearía entre el dedo y su destino.
  final double? arrastre;

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

  /// El área de la barra en coordenadas de pantalla, para poder magnificar
  /// JUSTO lo que hay debajo de la lupa. Se lee del render object y no cambia
  /// mientras la barra está en pantalla, así que basta con tenerla una vez.
  final GlobalKey _claveArea = GlobalKey();
  Rect? _areaGlobal;

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
    WidgetsBinding.instance.addPostFrameCallback((_) => _medirArea());
  }

  void _medirArea() {
    if (!mounted) return;
    final box = _claveArea.currentContext?.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return;
    final r = box.localToGlobal(Offset.zero) & box.size;
    if (r != _areaGlobal) setState(() => _areaGlobal = r);
  }

  @override
  void didUpdateWidget(covariant LupaVidrio anterior) {
    super.didUpdateWidget(anterior);
    // Mientras el dedo manda, la animación no pinta nada; al soltar, el cambio
    // de `activa` la relanza desde donde quedó el dedo.
    if (widget.arrastre != null) {
      _ctrl.stop();
      return;
    }
    if (widget.activa == anterior.activa && anterior.arrastre == null) return;
    // Al volver de una pantalla sin botón no se viaja desde ningún sitio: la
    // lupa reaparece donde toca. Animar desde la última posición conocida
    // haría un barrido que el usuario no pidió.
    if (widget.activa < 0 || anterior.activa < 0) {
      _desde = _hasta = math.max(0, widget.activa).toDouble();
      _salto = 0;
      _ctrl.value = 1;
      return;
    }
    // Si venía de un arrastre, se sale desde donde estaba el dedo: así el
    // remate al soltar es corto y continuo, no un salto desde el ítem viejo.
    _desde = anterior.arrastre ?? _posicionAnimada();
    _hasta = widget.activa.toDouble();
    _salto = (_hasta - _desde).abs();
    if (_salto < 0.01) {
      _ctrl.value = 1;
      return;
    }
    // La duración crece con la distancia, pero no proporcionalmente: un salto
    // de tres columnas con el triple de tiempo se arrastra.
    final ms = math.min(380.0, 220 + (_salto * 45)).round();
    _ctrl
      ..duration = Duration(milliseconds: ms)
      ..forward(from: 0);
  }

  double _posicionAnimada() {
    final t =
        Curves.easeOutCubic.transform(_ctrl.value.clamp(0.0, 1.0).toDouble());
    return _desde + (_hasta - _desde) * t;
  }

  double _posicionActual() => widget.arrastre ?? _posicionAnimada();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    WidgetsBinding.instance.addPostFrameCallback((_) => _medirArea());

    final n = widget.columnas;
    final pos = _posicionActual();
    final x = alineacionDeColumna(pos, n);
    final arrastrando = widget.arrastre != null;

    // Arrastrando no se estira por el viaje: la deformación la da el dedo, y
    // sumarle la campana haría que se ensanchara sola al pasar por el medio.
    final estiron = arrastrando ? 1.0 : estironDeViaje(_ctrl.value, _salto);
    // Se conserva el volumen aparente: lo que se alarga se adelgaza, como
    // haría una gota. La mitad del estirón, y hacia dentro.
    final aplastado = 1 - (estiron - 1) * 0.45;

    return IgnorePointer(
      child: AnimatedOpacity(
        duration: const Duration(milliseconds: 180),
        opacity: widget.activa < 0 && !arrastrando ? 0 : 1,
        child: SizedBox.expand(
          key: _claveArea,
          child: Align(
            alignment: Alignment(x, 0),
            child: FractionallySizedBox(
              widthFactor: 1 / n,
              child: Padding(
                padding: EdgeInsets.symmetric(
                  horizontal: widget.margenH,
                  vertical: widget.margenV,
                ),
                child: AnimatedScale(
                  // Al agarrarla se levanta un pelo: es la señal de que el
                  // dedo la tiene cogida, la misma que da iOS.
                  scale: arrastrando ? 1.06 : 1,
                  duration: const Duration(milliseconds: 120),
                  child: Transform.scale(
                    scaleX: estiron,
                    scaleY: aplastado,
                    child: LayoutBuilder(
                      builder: (_, c) => _cristal(x, n, c.biggest),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  /// El filtro del cristal: magnifica lo que tiene debajo y lo desenfoca poco.
  ///
  /// UN `BackdropFilter` APLICA SU FILTRO EN COORDENADAS DE PANTALLA, no en las
  /// suyas. Una escala a secas agrandaría el fondo respecto del origen de la
  /// pantalla y lo que se ve dentro de la lupa sería un trozo de otro sitio.
  /// Por eso se compone `trasladar(+c) · escalar · trasladar(−c)` con `c` = el
  /// centro de la lupa EN PANTALLA: así aumenta justo lo que tapa, que es lo
  /// que hace una lente de verdad.
  ///
  /// Sin el área medida todavía (primer fotograma) se usa solo el desenfoque:
  /// una lupa sin aumento durante un frame no la ve nadie; una lupa enseñando
  /// el trozo equivocado de pantalla, sí.
  ImageFilter _filtro(double x, int n, Size tam) {
    const desenfoque = 3.0;
    final area = _areaGlobal;
    if (area == null || tam.isEmpty) {
      return ImageFilter.blur(sigmaX: desenfoque, sigmaY: desenfoque);
    }
    // Dónde cae el centro de la lupa dentro del área, con la misma cuenta que
    // hace `Align`: izquierda = (x+1)/2 · (ancho − anchoLupa).
    final izquierda = ((x + 1) / 2) * (area.width - tam.width);
    final cx = area.left + izquierda + tam.width / 2;
    final cy = area.top + area.height / 2;

    const aumento = 1.16;
    final m = Matrix4.identity()
      ..translate(cx, cy)
      ..scale(aumento, aumento)
      ..translate(-cx, -cy);

    return ImageFilter.compose(
      outer: ImageFilter.blur(sigmaX: desenfoque, sigmaY: desenfoque),
      inner: ImageFilter.matrix(m.storage, filterQuality: FilterQuality.high),
    );
  }

  Widget _cristal(double x, int n, Size tam) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.radio),
      child: BackdropFilter(
        filter: _filtro(x, n, tam),
        child: DecoratedBox(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(widget.radio),
            // Mucho más transparente que antes: ahora lo que se ve dentro es
            // el fondo AUMENTADO, y taparlo con un velo blanco era justo lo
            // que hacía que pareciera una pastilla y no una lente.
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Colors.white.withValues(alpha: 0.16),
                Colors.white.withValues(alpha: 0.03),
              ],
            ),
          ),
          child: Stack(
            children: [
              // El canto irisado. En la referencia el borde descompone la luz
              // en colores muy apagados; con un borde blanco uniforme se ve
              // una línea dibujada, no un canto de vidrio. Alphas bajísimos a
              // propósito: en cuanto se suben, esto parece un arcoíris.
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(widget.radio),
                    border: GradientBoxBorder(
                      width: 1.3,
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [
                          Colors.white.withValues(alpha: 0.55),
                          const Color(0xFF7DD3FC).withValues(alpha: 0.30),
                          const Color(0xFFF0ABFC).withValues(alpha: 0.26),
                          Colors.white.withValues(alpha: 0.10),
                        ],
                        stops: const [0, 0.35, 0.7, 1],
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox.expand(),
            ],
          ),
        ),
      ),
    );
  }
}

/// Un borde con degradado.
///
/// `Border.all` no acepta uno, y pintar cuatro `BorderSide` de colores
/// distintos deja las esquinas cortadas en inglete con un salto de color. Se
/// pinta el trazo del propio rectángulo redondeado con un `SweepGradient`
/// lineal, que es lo que da el canto continuo.
class GradientBoxBorder extends BoxBorder {
  const GradientBoxBorder({required this.gradient, this.width = 1});

  final Gradient gradient;
  final double width;

  @override
  BorderSide get bottom => BorderSide.none;
  @override
  BorderSide get top => BorderSide.none;
  @override
  bool get isUniform => true;
  @override
  EdgeInsetsGeometry get dimensions => EdgeInsets.all(width);

  @override
  void paint(
    Canvas canvas,
    Rect rect, {
    TextDirection? textDirection,
    BoxShape shape = BoxShape.rectangle,
    BorderRadius? borderRadius,
  }) {
    final pincel = Paint()
      ..strokeWidth = width
      ..shader = gradient.createShader(rect)
      ..style = PaintingStyle.stroke;
    final r = (borderRadius ?? BorderRadius.zero)
        .toRRect(rect)
        .deflate(width / 2);
    canvas.drawRRect(r, pincel);
  }

  @override
  ShapeBorder scale(double t) =>
      GradientBoxBorder(gradient: gradient, width: width * t);
}
