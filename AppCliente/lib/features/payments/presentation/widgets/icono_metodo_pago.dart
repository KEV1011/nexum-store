import 'package:flutter/material.dart';
import 'package:nexum_client/features/payments/presentation/providers/'
    'payment_method_provider.dart';

/// El distintivo de cada método de pago: una pastilla con su color y su dibujo.
///
/// Son marcas NUESTRAS, no los logotipos de las entidades. Reproducir el
/// logotipo de una billetera es usar una marca registrada ajena, y además
/// obligaría a arrastrar imágenes por cada densidad de pantalla. Aquí cada
/// método tiene un color propio y un dibujo que se entiende de un vistazo, y
/// el nombre va escrito al lado — que es lo que de verdad lo identifica.
///
/// Todo es vectorial: se ve nítido en cualquier pantalla, escala con el
/// tamaño de letra del sistema y no pesa nada en el APK.
class IconoMetodoPago extends StatelessWidget {
  const IconoMetodoPago(this.metodo, {this.tamano = 38, super.key});

  final MetodoPago metodo;
  final double tamano;

  /// El color con el que se reconoce cada uno. Los de las billeteras se
  /// acercan a su identidad para que se distingan de un golpe de vista en la
  /// lista, sin llegar a copiar ninguna marca.
  Color get _color => switch (metodo) {
        MetodoPago.efectivo => const Color(0xFF1B8A5A),
        MetodoPago.nequi => const Color(0xFF6C1EA0),
        MetodoPago.daviplata => const Color(0xFFD1232A),
        MetodoPago.bancolombia => const Color(0xFFB8860B),
        MetodoPago.transferencia => const Color(0xFF44546B),
        MetodoPago.enLinea => const Color(0xFF2B4CD1),
      };

  /// Un dibujo distinto por método. Repetir el mismo cambiando solo el color
  /// no serviría: quien no distingue bien los colores vería seis filas
  /// iguales.
  IconData get _glifo => switch (metodo) {
        MetodoPago.efectivo => Icons.payments_rounded,
        MetodoPago.nequi => Icons.smartphone_rounded,
        MetodoPago.daviplata => Icons.account_balance_wallet_rounded,
        MetodoPago.bancolombia => Icons.account_balance_rounded,
        MetodoPago.transferencia => Icons.swap_horiz_rounded,
        MetodoPago.enLinea => Icons.credit_card_rounded,
      };

  @override
  Widget build(BuildContext context) {
    return Container(
      width: tamano,
      height: tamano,
      decoration: BoxDecoration(
        color: _color,
        borderRadius: BorderRadius.circular(tamano * 0.28),
      ),
      alignment: Alignment.center,
      child: Icon(_glifo, size: tamano * 0.55, color: Colors.white),
    );
  }
}
