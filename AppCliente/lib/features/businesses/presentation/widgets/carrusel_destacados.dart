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

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/core/config/api_config.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';

class CarruselDestacados extends StatelessWidget {
  const CarruselDestacados({
    required this.comercios,
    required this.onAbrir,
    super.key,
  });

  final List<BusinessEntity> comercios;
  final void Function(BusinessEntity) onAbrir;

  /// Más de ocho no los ve nadie, y cada uno es una imagen que se descarga.
  static const _maximo = 8;

  static bool _tieneFoto(BusinessEntity b) =>
      b.imageUrl != null && b.imageUrl!.isNotEmpty;

  /// Los que se pintan: con foto, y los abiertos primero. Un sitio cerrado con
  /// buena foto sigue siendo un descubrimiento, pero no le gana el sitio a uno
  /// al que se le puede pedir ahora.
  static List<BusinessEntity> seleccion(List<BusinessEntity> todos) {
    final conFoto = todos.where(_tieneFoto).toList()
      ..sort((a, b) {
        if (a.isOpen == b.isOpen) return 0;
        return a.isOpen ? -1 : 1;
      });
    return conFoto.take(_maximo).toList();
  }

  @override
  Widget build(BuildContext context) {
    final destacados = seleccion(comercios);
    if (destacados.isEmpty) return const SizedBox.shrink();

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
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: destacados.length,
            separatorBuilder: (_, __) => const SizedBox(width: 12),
            itemBuilder: (_, i) => _TarjetaDestacado(
              comercio: destacados[i],
              onTap: () => onAbrir(destacados[i]),
            ),
          ),
        ),
      ],
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
          width: 244,
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
                          errorBuilder: (_, __, ___) =>
                              ColoredBox(color: context.zHundida),
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
    return Text(
      '★ ${rating!.toStringAsFixed(1)} ($votos)',
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        color: context.zTexto,
      ),
    );
  }
}
