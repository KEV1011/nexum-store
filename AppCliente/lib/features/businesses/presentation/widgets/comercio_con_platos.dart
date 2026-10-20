// Un local en los resultados de un antojo o de una búsqueda, con los platos
// que casaron debajo.
//
// Sin los platos, buscar «hamburguesa» devolvería «BETOS» a secas y la
// persona tendría que entrar a adivinar por qué salió. Con ellos ve QUÉ tiene
// y a CUÁNTO sin abrir nada, que es la comparación que hace quien tiene
// hambre: la misma hamburguesa en tres locales, una debajo de otra.

import 'package:flutter/material.dart';
import 'package:nexum_client/app/theme/zipa_tokens.dart';
import 'package:nexum_client/core/utils/currency_formatter.dart';
import 'package:nexum_client/features/businesses/domain/entities/'
    'business_entity.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'fila_comercio.dart';
import 'package:nexum_client/features/businesses/presentation/widgets/'
    'nombre_plato.dart';

class ComercioConPlatos extends StatelessWidget {
  const ComercioConPlatos({
    required this.comercio,
    required this.platos,
    required this.onTap,
    super.key,
  });

  final BusinessEntity comercio;
  final List<ProductEntity> platos;
  final VoidCallback onTap;

  /// Más de tres y la fila deja de ser una fila: el resto va en «y N más».
  static const _maxVisibles = 3;

  @override
  Widget build(BuildContext context) {
    final visibles = platos.take(_maxVisibles).toList();
    final resto = platos.length - visibles.length;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilaComercio(comercio: comercio, onTap: onTap),
        if (visibles.isNotEmpty)
          InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(10),
            child: Padding(
              // Alineado con el texto de la fila (miniatura + separación), no
              // con su borde: así se lee como «de este local».
              padding: const EdgeInsets.fromLTRB(14, 6, 10, 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final p in visibles) _Plato(producto: p),
                  if (resto > 0)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        resto == 1 ? 'y 1 más' : 'y $resto más',
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w600,
                          color: context.zMarcaTexto,
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _Plato extends StatelessWidget {
  const _Plato({required this.producto});

  final ProductEntity producto;

  @override
  Widget build(BuildContext context) {
    // Solo el título: las cartas leídas de una foto traen los ingredientes
    // dentro del nombre, y aquí se compara, no se lee la carta.
    final titulo = partirNombrePlato(producto.name, producto.description).titulo;
    final precio = CurrencyFormatter.format(producto.price);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(
              titulo,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 13.5, color: context.zTexto2),
            ),
          ),
          const SizedBox(width: 10),
          // «Desde» cuando el precio de la lista no es el que se paga (hay
          // un tamaño obligatorio más caro): la misma regla de la carta, para
          // que la comparación entre locales no mienta.
          Text(
            producto.precioDesde ? 'Desde $precio' : precio,
            style: TextStyle(
              fontSize: 13.5,
              fontWeight: FontWeight.w700,
              color: context.zTexto,
            ),
          ),
        ],
      ),
    );
  }
}
