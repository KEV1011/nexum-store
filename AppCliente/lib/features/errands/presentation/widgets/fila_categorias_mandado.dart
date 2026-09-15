// Las siete cosas que ZIPA te trae, visibles sin abrir nada.
//
// Existían desde el principio —Farmacia, Mercado, Documentos, Pagos, Comida,
// Compras, Otro— con su pantalla completa, y estaban a CINCO toques: home →
// Movilidad → hoja → Envíos → hoja → «Compra o diligencia». Nadie descubre un
// servicio así. Quien quiere que le traigan algo de la droguería no sabe que
// la app lo hace, y la mitad de la oferta no existe en la práctica.
//
// Por eso van en el home y cada una entra a SU categoría ya elegida: tocar
// «Droguería» y tener que volver a decir «droguería» es preguntar dos veces.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:nexum_client/app/router/app_router.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/features/errands/domain/entities/errand_entity.dart';

/// Carrusel de categorías de encargo para el home.
class FilaCategoriasMandado extends StatelessWidget {
  const FilaCategoriasMandado({super.key});

  /// «Otro» se queda fuera del carrusel: no comunica nada y ocuparía el sitio
  /// de algo que sí. Sigue disponible dentro de la pantalla del encargo, que
  /// es donde tiene sentido («no era ninguna de esas»).
  static const _visibles = [
    ErrandCategory.pharmacy,
    ErrandCategory.groceries,
    ErrandCategory.food,
    ErrandCategory.payments,
    ErrandCategory.documents,
    ErrandCategory.shopping,
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 2),
          child: Text(
            '¿Qué te traemos?',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: context.zTexto,
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Text(
            'Lo compramos, lo recogemos y te lo llevamos',
            style: TextStyle(fontSize: 12.5, color: context.zTexto2),
          ),
        ),
        // Horizontal a propósito: que asome media tarjeta al borde dice «hay
        // más» sin gastar una línea de texto en decirlo.
        SizedBox(
          height: 104,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            itemCount: _visibles.length,
            separatorBuilder: (_, __) => const SizedBox(width: 10),
            itemBuilder: (_, i) => _Categoria(categoria: _visibles[i]),
          ),
        ),
      ],
    );
  }
}

class _Categoria extends StatefulWidget {
  const _Categoria({required this.categoria});

  final ErrandCategory categoria;

  @override
  State<_Categoria> createState() => _CategoriaState();
}

class _CategoriaState extends State<_Categoria> {
  bool _pulsada = false;

  @override
  Widget build(BuildContext context) {
    final oscuro = Theme.of(context).brightness == Brightness.dark;
    final acento = widget.categoria.color;

    // El color de la categoría es fijo (lo define el dominio, y lo comparte
    // con la pantalla del encargo). En oscuro se sube el velo y se aclara el
    // glifo, o un azul saturado sobre #1A1D27 se lee como una mancha.
    final fondo = acento.withValues(alpha: oscuro ? 0.22 : 0.12);
    final glifo =
        oscuro ? Color.lerp(acento, Colors.white, 0.35)! : acento;

    return GestureDetector(
      onTapDown: (_) => setState(() => _pulsada = true),
      onTapCancel: () => setState(() => _pulsada = false),
      onTap: () {
        setState(() => _pulsada = false);
        HapticFeedback.selectionClick();
        context.push(AppRoutes.errandBooking, extra: widget.categoria);
      },
      child: AnimatedScale(
        scale: _pulsada ? 0.95 : 1,
        duration: const Duration(milliseconds: 110),
        curve: Curves.easeOut,
        child: SizedBox(
          width: 78,
          child: Column(
            children: [
              Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  color: fondo,
                  borderRadius: BorderRadius.circular(20),
                ),
                alignment: Alignment.center,
                child: Icon(widget.categoria.icon, color: glifo, size: 30),
              ),
              const SizedBox(height: 8),
              Text(
                _etiqueta(widget.categoria),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: context.zTexto,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// «Farmacia» es como se llama el negocio; «Droguería» es como lo llama la
  /// gente en Colombia, y es la palabra que busca.
  static String _etiqueta(ErrandCategory c) =>
      c == ErrandCategory.pharmacy ? 'Droguería' : c.label;
}
