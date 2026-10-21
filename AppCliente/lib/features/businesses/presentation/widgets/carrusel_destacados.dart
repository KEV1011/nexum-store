// Los comercios con foto, en grande.
//
// La lista de abajo es de FILAS a propósito: con tarjetas de portada caben dos
// comercios en pantalla y comparar —que es lo que hace quien tiene hambre—
// obliga a subir y bajar. Ese argumento sigue en pie y por eso las filas se
// quedan.
//
// Lo que faltaba es lo otro: un catálogo de comida sin una sola imagen grande
// se lee como un directorio telefónico. Rappi y Uber Eats resuelven lo mismo
// con las dos cosas — carrusel con foto arriba, lista densa debajo—, y eso es
// lo que hace este archivo.
//
// REGLA: aquí solo entra quien TIENE foto. Si ninguno la tiene, la sección no
// se dibuja. Ni marcos grises ni degradados de relleno: una fila de huecos es
// peor que no tener la fila, y además avisa de lo que de verdad hay que
// arreglar (subir portadas desde el portal del negocio).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexum_client/app/theme/zipa_icon.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

class CarruselDestacados extends StatefulWidget {
  const CarruselDestacados({
    required this.comercios,
    required this.onAbrir,
    super.key,
  });

  final List<BusinessEntity> comercios;
  final void Function(BusinessEntity) onAbrir;

  /// Más de ocho no los ve nadie, y cada uno es una imagen que se descarga.
  static const _maximo = 8;

  /// Ancho de una tarjeta y hueco entre tarjetas: de aquí sale cuánto avanza
  /// el carrusel en cada paso, para que siempre se detenga con una tarjeta
  /// alineada al borde y no a medias.
  static const anchoTarjeta = 244.0;
  static const hueco = 12.0;
  static const paso = anchoTarjeta + hueco;
  static const margenLateral = 16.0;

  /// Cada cuánto avanza solo. Menos de tres segundos no deja leer el nombre y
  /// el tiempo de entrega; más de cinco ya no se percibe como movimiento.
  static const intervalo = Duration(seconds: 4);

  /// Tras tocar o arrastrar, cuánto se espera antes de volver a moverse.
  /// Quien está mirando una tarjeta no quiere que se la quiten de debajo del
  /// dedo, y si volviera a arrancar en cuanto lo levanta se sentiría como que
  /// la app le pelea.
  static const pausaTrasTocar = Duration(seconds: 7);

  static bool _tieneFoto(BusinessEntity b) =>
      b.imageUrl != null && b.imageUrl!.isNotEmpty;

  /// Los que se pintan: con foto y ABIERTOS.
  ///
  /// Antes entraban también los cerrados, ordenados detrás, con el argumento
  /// de que un sitio cerrado con buena foto sigue siendo un descubrimiento.
  /// En pantalla no se sostiene: la sección se llama «Para pedir ya» y salía
  /// un local con la insignia «No está recibiendo pedidos» debajo de ese
  /// título. Un encabezado que contradice a su propio contenido es peor que
  /// una sección más corta — y para descubrir están la lista de abajo y el
  /// buscador, donde un cerrado sí tiene sentido.
  static List<BusinessEntity> seleccion(List<BusinessEntity> todos) {
    return todos.where((b) => _tieneFoto(b) && b.isOpen).take(_maximo).toList();
  }

  /// A dónde va el siguiente paso automático, o `null` si no hay a dónde.
  ///
  /// Se avanza UNA tarjeta desde la que está más a la vista (no desde el
  /// desplazamiento crudo): si el dedo dejó el carrusel a media tarjeta, el
  /// paso siguiente lo vuelve a alinear en vez de arrastrar el desfase para
  /// siempre. Al llegar al final se vuelve al principio, porque un carrusel
  /// que se queda quieto en el último parece que se trabó.
  static double? siguienteDesplazamiento({
    required double actual,
    required double maximo,
  }) {
    if (maximo <= 0) return null; // todo cabe: no hay nada que mostrar
    if (actual >= maximo - 1) return 0;
    final indice = (actual / paso).round();
    final destino = (indice + 1) * paso;
    return destino > maximo ? maximo : destino;
  }

  /// Qué tarjeta marca el indicador. La última no siempre llega a alinearse al
  /// borde (el final de la lista lo impide), así que estar al final cuenta
  /// como estar en ella.
  static int indiceVisible({
    required double actual,
    required double maximo,
    required int total,
  }) {
    if (total <= 0) return 0;
    if (maximo > 0 && actual >= maximo - 1) return total - 1;
    return (actual / paso).round().clamp(0, total - 1);
  }

  /// Si las tarjetas no caben en el ancho, el carrusel se mueve; si caben
  /// (una o dos tarjetas en una tableta), moverlo no enseña nada nuevo.
  static bool desborda({required int total, required double anchoVisible}) {
    if (total <= 1) return false;
    final contenido =
        margenLateral * 2 + total * anchoTarjeta + (total - 1) * hueco;
    return contenido > anchoVisible + 0.5;
  }

  @override
  State<CarruselDestacados> createState() => _CarruselDestacadosState();
}

class _CarruselDestacadosState extends State<CarruselDestacados> {
  final _control = ScrollController();
  Timer? _reloj;

  /// La espera tras un toque. Es un reloj y no una hora guardada a propósito:
  /// así, al terminar, el carrusel arranca su ciclo desde cero (un paso entero
  /// después) en vez de moverse en cuanto se cumpla el plazo, que podría ser
  /// medio segundo después de que el dedo se fue.
  Timer? _pausa;

  /// El dedo está encima: mientras tanto no se mueve nada.
  bool _tocando = false;

  /// Lo que se leyó en el último build. El reloj no puede leer el `context`
  /// por su cuenta, así que el build deja aquí si tiene sentido moverse.
  bool _puedeMoverse = false;

  int _indice = 0;

  @override
  void initState() {
    super.initState();
    _control.addListener(_alDesplazar);
  }

  @override
  void dispose() {
    _reloj?.cancel();
    _pausa?.cancel();
    _control
      ..removeListener(_alDesplazar)
      ..dispose();
    super.dispose();
  }

  void _alDesplazar() {
    if (!_control.hasClients) return;
    final p = _control.position;
    final i = CarruselDestacados.indiceVisible(
      actual: p.pixels,
      maximo: p.maxScrollExtent,
      total: CarruselDestacados.seleccion(widget.comercios).length,
    );
    if (i != _indice) setState(() => _indice = i);
  }

  /// Enciende o apaga el reloj según lo que diga el build. Se llama en cada
  /// build, pero solo crea un reloj cuando no lo hay.
  void _sincronizarReloj(bool moverse) {
    _puedeMoverse = moverse;
    if (moverse && _reloj == null && _pausa == null) {
      _reloj = Timer.periodic(CarruselDestacados.intervalo, (_) => _avanzar());
    } else if (!moverse && _reloj != null) {
      _reloj!.cancel();
      _reloj = null;
    }
  }

  void _avanzar() {
    if (!mounted || !_puedeMoverse || _tocando) return;
    if (!_control.hasClients) return;
    // Con la app en segundo plano no se anima nada: nadie lo ve y al volver
    // el carrusel estaría en cualquier sitio.
    final estado = WidgetsBinding.instance.lifecycleState;
    if (estado != null && estado != AppLifecycleState.resumed) return;
    final p = _control.position;
    // Si el usuario lo está moviendo (inercia de un arrastre), se respeta.
    if (p.isScrollingNotifier.value) return;
    final destino = CarruselDestacados.siguienteDesplazamiento(
      actual: p.pixels,
      maximo: p.maxScrollExtent,
    );
    if (destino == null) return;
    final volviendo = destino < p.pixels;
    _control.animateTo(
      destino,
      // Volver al principio recorre varias tarjetas: más despacio, para que
      // se lea como «vuelve a empezar» y no como un salto.
      duration: Duration(milliseconds: volviendo ? 900 : 600),
      curve: volviendo ? Curves.easeInOutCubic : Curves.easeOutCubic,
    );
  }

  void _alTocar() {
    _tocando = true;
    _pausa?.cancel();
    _pausa = null;
    _reloj?.cancel();
    _reloj = null;
  }

  void _alSoltar() {
    _tocando = false;
    _pausa?.cancel();
    _pausa = Timer(CarruselDestacados.pausaTrasTocar, () {
      _pausa = null;
      if (mounted) _sincronizarReloj(_puedeMoverse);
    });
  }

  @override
  Widget build(BuildContext context) {
    final destacados = CarruselDestacados.seleccion(widget.comercios);
    if (destacados.isEmpty) {
      _sincronizarReloj(false);
      return const SizedBox.shrink();
    }

    // Quien pidió reducir el movimiento en su teléfono no ve nada moverse
    // solo: el carrusel sigue ahí y se desliza con el dedo.
    final sinMovimiento =
        MediaQuery.maybeOf(context)?.disableAnimations ?? false;
    // Tapado por otra pantalla (el detalle del local, el carrito) o en una
    // pestaña de fondo: moverse ahí es gastar batería en algo que nadie ve.
    final aLaVista = (ModalRoute.of(context)?.isCurrent ?? true) &&
        TickerMode.of(context);

    return LayoutBuilder(
      builder: (context, restricciones) {
        final seMueve = CarruselDestacados.desborda(
          total: destacados.length,
          anchoVisible: restricciones.maxWidth,
        );
        _sincronizarReloj(seMueve && !sinMovimiento && aLaVista);
        final indice = _indice.clamp(0, destacados.length - 1);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Text(
                'Para pedir ya',
                style: TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: context.zTexto,
                ),
              ),
            ),
            SizedBox(
              height: 206,
              // Listener y no GestureDetector: no compite con el arrastre del
              // propio carrusel ni con el toque de cada tarjeta, solo se entera.
              child: Listener(
                onPointerDown: (_) => _alTocar(),
                onPointerUp: (_) => _alSoltar(),
                onPointerCancel: (_) => _alSoltar(),
                child: ListView.separated(
                  controller: _control,
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(
                    horizontal: CarruselDestacados.margenLateral,
                  ),
                  itemCount: destacados.length,
                  separatorBuilder: (_, __) =>
                      const SizedBox(width: CarruselDestacados.hueco),
                  itemBuilder: (_, i) => _TarjetaDestacado(
                    comercio: destacados[i],
                    onTap: () => widget.onAbrir(destacados[i]),
                  ),
                ),
              ),
            ),
            if (seMueve) ...[
              const SizedBox(height: 4),
              _Indicador(total: destacados.length, activo: indice),
            ],
          ],
        );
      },
    );
  }
}

/// Puntos bajo el carrusel: dicen que hay más tarjetas de las que se ven y en
/// cuál va. Sin ellos, un carrusel que se mueve solo se lee como un anuncio.
class _Indicador extends StatelessWidget {
  const _Indicador({required this.total, required this.activo});

  final int total;
  final int activo;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (var i = 0; i < total; i++)
            AnimatedContainer(
              key: ValueKey('punto-$i'),
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOut,
              margin: const EdgeInsets.symmetric(horizontal: 3),
              height: 6,
              width: i == activo ? 18 : 6,
              decoration: BoxDecoration(
                // El verde de marca aquí es decoración, no letra: no le aplica
                // la regla de contraste del texto.
                color: i == activo ? ZipaTokens.marca : context.zBorde,
                borderRadius: BorderRadius.circular(3),
              ),
            ),
        ],
      ),
    );
  }
}

class _TarjetaDestacado extends StatefulWidget {
  const _TarjetaDestacado({required this.comercio, required this.onTap});

  final BusinessEntity comercio;
  final VoidCallback onTap;

  @override
  State<_TarjetaDestacado> createState() => _TarjetaDestacadoState();
}

class _TarjetaDestacadoState extends State<_TarjetaDestacado> {
  bool _pulsada = false;

  @override
  Widget build(BuildContext context) {
    final c = widget.comercio;
    final abierto = c.isOpen;

    return GestureDetector(
      onTapDown: (_) => setState(() => _pulsada = true),
      onTapCancel: () => setState(() => _pulsada = false),
      onTap: () {
        setState(() => _pulsada = false);
        HapticFeedback.selectionClick();
        widget.onTap();
      },
      child: AnimatedScale(
        scale: _pulsada ? 0.97 : 1,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: SizedBox(
          width: CarruselDestacados.anchoTarjeta,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: SizedBox(
                  height: 136,
                  width: double.infinity,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      // Atenuada si está cerrado, igual que en la fila: el
                      // sitio sigue ahí, pero no invita a pedir ahora.
                      Opacity(
                        opacity: abierto ? 1 : 0.45,
                        child: Image.network(
                          ApiConfig.resolveUrl(c.imageUrl!),
                          fit: BoxFit.cover,
                          // Con la foto caída se dibujaba un rectángulo
                          // oscuro vacío: una tarjeta de 136 px en blanco
                          // dentro del carrusel, que se lee como que la app
                          // se rompió. Pasa de verdad — sin S3 configurado
                          // las fotos viven en disco efímero y desaparecen
                          // en cada despliegue. Al menos se enseña de qué
                          // negocio se trata.
                          errorBuilder: (_, __, ___) => _SinFoto(nombre: c.name),
                          loadingBuilder: (_, hijo, progreso) => progreso == null
                              ? hijo
                              : ColoredBox(color: context.zHundida),
                        ),
                      ),
                      // Velo inferior: sin él, el tiempo de entrega escrito
                      // sobre una foto clara no se lee.
                      const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.center,
                            end: Alignment.bottomCenter,
                            colors: [Colors.transparent, Color(0xB3000000)],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 10,
                        right: 10,
                        bottom: 9,
                        child: Row(
                          children: [
                            _Pildora(
                              texto: '${c.etaMinutes} min',
                              destacada: true,
                            ),
                            const SizedBox(width: 6),
                            Flexible(
                              child: _Pildora(
                                texto: c.deliveryFee <= 0
                                    ? 'Envío gratis'
                                    : CurrencyFormatter.format(c.deliveryFee),
                              ),
                            ),
                          ],
                        ),
                      ),
                      if (!abierto)
                        Positioned(
                          top: 9,
                          left: 10,
                          child: _Pildora(
                            texto: c.cerradoMotivo ?? 'Cerrado',
                            destacada: true,
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 9),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      c.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: context.zTexto,
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  _Nota(rating: c.rating, votos: c.ratingCount),
                ],
              ),
              const SizedBox(height: 2),
              Text(
                c.category.label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontSize: 12.5, color: context.zTexto3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Dato corto sobre la foto. Fondo negro translúcido y texto blanco FIJOS: van
/// encima de una imagen, no de una superficie del tema.
class _Pildora extends StatelessWidget {
  const _Pildora({required this.texto, this.destacada = false});

  final String texto;
  final bool destacada;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: destacada ? const Color(0xE6000000) : const Color(0x99000000),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        texto,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11.5,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

/// La nota, o «Nuevo».
///
/// Sin calificaciones NO se pinta una estrella: cinco estrellas vacías se leen
/// como un cero, y un número inventado es peor. El conteo va al lado porque un
/// 4,9 con dos votos y otro con doscientos no son la misma información.
class _Nota extends StatelessWidget {
  const _Nota({required this.rating, required this.votos});

  final double? rating;
  final int votos;

  @override
  Widget build(BuildContext context) {
    if (rating == null || votos == 0) {
      return Text(
        'Nuevo',
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w700,
          color: context.zMarcaTexto,
        ),
      );
    }
    // La estrella va como ZipaIcon y no como «★»: el emoji lo dibuja el
    // sistema operativo, se ve distinto en cada teléfono y no es de la marca.
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        ZipaIcon(
          ZipaIconName.estrella,
          size: ZipaIconSize.inline,
          color: context.zTexto,
        ),
        const SizedBox(width: 2),
        Text(
          '${rating!.toStringAsFixed(1)} ($votos)',
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: context.zTexto,
          ),
        ),
      ],
    );
  }
}

/// Respaldo cuando la portada no carga: el nombre del local sobre el fondo
/// hundido, en vez de un rectángulo vacío.
class _SinFoto extends StatelessWidget {
  const _SinFoto({required this.nombre});

  final String nombre;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: context.zHundida,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ZipaIcon(ZipaIconName.sinFoto, color: context.zTexto3),
              const SizedBox(height: 8),
              Text(
                nombre,
                maxLines: 2,
                textAlign: TextAlign.center,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: context.zTexto2,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
