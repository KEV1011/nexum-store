// «¿Qué se te antoja?»: el carrusel de antojos de la home.
//
// El estilo es el que eligió el dueño con su captura de referencia: tarjeta
// gris clara y redondeada, el render 3D con su sombra de contacto arriba y el
// nombre debajo, DENTRO de la tarjeta. No es una píldora: aquí se elige qué se
// quiere comer, y eso pide una cosa que se reconozca de un vistazo.
//
// Va FUERA del bloque de explorar, como las píldoras de categoría: con un
// antojo elegido es la única forma de saltar a otro sin quitarlo antes.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/features/businesses/domain/antojos.dart';

class FilaAntojos extends StatelessWidget {
  const FilaAntojos({
    required this.antojos,
    required this.seleccionado,
    required this.onSeleccionar,
    super.key,
  });

  /// Solo los que tienen locales (ver `antojosPresentes`).
  final List<Antojo> antojos;

  /// Clave del elegido, o null.
  final String? seleccionado;

  /// Tocar el elegido lo quita: así se sale sin buscar otro botón.
  final ValueChanged<String?> onSeleccionar;

  @override
  Widget build(BuildContext context) {
    // Sin antojos no se dibuja NADA, ni el título: un título sobre una fila
    // vacía promete algo que no hay.
    if (antojos.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
          child: Text(
            '¿Qué se te antoja?',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: context.zTexto,
            ),
          ),
        ),
        SizedBox(
          height: 108,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: antojos.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) {
              final a = antojos[i];
              final elegido = a.clave == seleccionado;
              return TarjetaAntojo(
                antojo: a,
                elegido: elegido,
                onTap: () => onSeleccionar(elegido ? null : a.clave),
              );
            },
          ),
        ),
      ],
    );
  }
}

class TarjetaAntojo extends StatefulWidget {
  const TarjetaAntojo({
    required this.antojo,
    required this.elegido,
    required this.onTap,
    super.key,
  });

  final Antojo antojo;
  final bool elegido;
  final VoidCallback onTap;

  @override
  State<TarjetaAntojo> createState() => _TarjetaAntojoState();
}

class _TarjetaAntojoState extends State<TarjetaAntojo> {
  bool _pulsada = false;

  @override
  Widget build(BuildContext context) {
    final elegido = widget.elegido;
    return Semantics(
      button: true,
      selected: elegido,
      label: elegido
          ? '${widget.antojo.nombre}, elegido. Toca para quitarlo'
          : 'Ver ${widget.antojo.nombre}',
      excludeSemantics: true,
      child: GestureDetector(
        onTapDown: (_) => setState(() => _pulsada = true),
        onTapCancel: () => setState(() => _pulsada = false),
        onTap: () {
          setState(() => _pulsada = false);
          HapticFeedback.selectionClick();
          widget.onTap();
        },
        child: AnimatedScale(
          scale: _pulsada ? 0.95 : 1,
          duration: const Duration(milliseconds: 110),
          curve: Curves.easeOut,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 160),
            width: 88,
            decoration: BoxDecoration(
              // Gris hundido, como la referencia: sobre el fondo casi blanco
              // de la home una tarjeta blanca no se distingue.
              color: context.zHundida,
              borderRadius: BorderRadius.circular(22),
              // El elegido se marca con un borde de marca, no cambiando el
              // fondo: el render tiene que seguir leyéndose igual.
              border: Border.all(
                color: elegido ? ZipaTokens.marca : Colors.transparent,
                width: 2,
              ),
            ),
            padding: const EdgeInsets.fromLTRB(4, 10, 4, 8),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Image.asset(
                  widget.antojo.ilustracion,
                  width: 56,
                  height: 56,
                  // Si el archivo faltara, un hueco del mismo tamaño y el
                  // nombre debajo: la tarjeta sigue sirviendo.
                  errorBuilder: (_, __, ___) =>
                      const SizedBox(width: 56, height: 56),
                ),
                Text(
                  widget.antojo.nombre,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: elegido ? FontWeight.w800 : FontWeight.w600,
                    color: context.zTexto,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
