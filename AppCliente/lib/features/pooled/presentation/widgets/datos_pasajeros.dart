/// Quién viaja en cada silla.
///
/// Hasta ahora la reserva guardaba UN nombre —el de la cuenta— sin importar
/// cuántos puestos se compraran: una familia de cuatro quedaba registrada como
/// una sola persona y el conductor subía con una lista que no podía contrastar
/// con nada. Las reglas viven en el servidor (`lib/pasajeros-tiquete.ts`);
/// aquí solo se recogen.
///
/// El formulario CRECE Y SE ENCOGE con los puestos, porque el pasajero cambia
/// de opinión: elige tres sillas, quita una, y el tercer formulario tiene que
/// desaparecer con sus datos. Mantenerlo dejaría un pasajero de más y el
/// servidor rechazaría la compra sin que se entienda por qué.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:nexum_client/app/theme/adaptive_colors.dart';

/// Los mismos cuatro del servidor. Cambiar uno aquí sin cambiarlo allá deja
/// una opción que el backend rechaza al confirmar.
const Map<String, String> kTiposDocumento = {
  'CC': 'Cédula de ciudadanía',
  'TI': 'Tarjeta de identidad',
  'CE': 'Cédula de extranjería',
  'PA': 'Pasaporte',
};

class PasajeroTiquete {
  const PasajeroTiquete({
    required this.tipoDoc,
    required this.documento,
    required this.nombre,
  });

  final String tipoDoc;
  final String documento;
  final String nombre;

  /// Si tiene lo mínimo que el servidor exige. Se comprueba aquí para no
  /// dejar que el pasajero toque «Reservar» y reciba un rechazo.
  bool get completo =>
      documento.trim().length >= 4 && nombre.trim().length >= 3;

  Map<String, dynamic> toJson() => {
        'tipoDoc': tipoDoc,
        'documento': documento.trim(),
        'nombre': nombre.trim(),
      };
}

class DatosPasajeros extends StatefulWidget {
  const DatosPasajeros({
    required this.puestos,
    required this.onChanged,
    super.key,
  });

  /// Cuántas personas viajan. Una por silla comprada.
  final int puestos;

  /// Se emite en cada tecla: el padre decide si ya puede reservar.
  final ValueChanged<List<PasajeroTiquete>> onChanged;

  @override
  State<DatosPasajeros> createState() => _DatosPasajerosState();
}

class _Fila {
  _Fila() : documento = TextEditingController(), nombre = TextEditingController();
  String tipoDoc = 'CC';
  final TextEditingController documento;
  final TextEditingController nombre;

  void dispose() {
    documento.dispose();
    nombre.dispose();
  }
}

class _DatosPasajerosState extends State<DatosPasajeros> {
  final List<_Fila> _filas = [];

  @override
  void initState() {
    super.initState();
    _ajustar();
  }

  @override
  void didUpdateWidget(DatosPasajeros old) {
    super.didUpdateWidget(old);
    if (old.puestos != widget.puestos) _ajustar();
  }

  /// Deja exactamente `puestos` formularios, conservando lo ya escrito.
  ///
  /// Al quitar, se LIBERAN los controladores del que sobra: dejarlos vivos es
  /// una fuga silenciosa que solo se nota cuando alguien juega con el contador.
  void _ajustar() {
    while (_filas.length < widget.puestos) {
      _filas.add(_Fila());
    }
    while (_filas.length > widget.puestos) {
      _filas.removeLast().dispose();
    }
    // Después de cambiar el número, lo que el padre tenía en la mano ya no
    // corresponde: se reemite para que el botón se recalcule.
    WidgetsBinding.instance.addPostFrameCallback((_) => _emitir());
  }

  @override
  void dispose() {
    for (final f in _filas) {
      f.dispose();
    }
    super.dispose();
  }

  void _emitir() {
    if (!mounted) return;
    widget.onChanged([
      for (final f in _filas)
        PasajeroTiquete(
          tipoDoc: f.tipoDoc,
          documento: f.documento.text,
          nombre: f.nombre.text,
        ),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.puestos < 1) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.badge_outlined, size: 16, color: context.textSecondaryColor),
            const SizedBox(width: 6),
            const Text('Quién viaja', style: TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        const SizedBox(height: 4),
        Text(
          widget.puestos == 1
              ? 'La empresa necesita el documento de quien viaja.'
              : 'La empresa necesita el documento de cada una de las '
                  '${widget.puestos} personas.',
          style: TextStyle(fontSize: 12, color: context.textSecondaryColor, height: 1.35),
        ),
        const SizedBox(height: 10),
        for (var i = 0; i < _filas.length; i++) _tarjeta(i, _filas[i]),
      ],
    );
  }

  Widget _tarjeta(int i, _Fila f) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            widget.puestos == 1 ? 'Pasajero' : 'Pasajero ${i + 1}',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: context.textSecondaryColor,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              SizedBox(
                width: 96,
                child: DropdownButtonFormField<String>(
                  initialValue: f.tipoDoc,
                  isDense: true,
                  decoration: _deco(context, 'Tipo'),
                  items: [
                    for (final e in kTiposDocumento.entries)
                      DropdownMenuItem(
                        value: e.key,
                        // La sigla en la lista y el nombre completo en el menú:
                        // «Cédula de extranjería» no cabe en 96 px.
                        child: Text(e.key, style: const TextStyle(fontSize: 14)),
                      ),
                  ],
                  onChanged: (v) {
                    if (v == null) return;
                    setState(() => f.tipoDoc = v);
                    _emitir();
                  },
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  controller: f.documento,
                  decoration: _deco(context, 'Número de documento'),
                  // El pasaporte lleva letras, así que NO se puede forzar a
                  // dígitos: hacerlo dejaría fuera a quien viaja con pasaporte.
                  keyboardType: TextInputType.text,
                  textCapitalization: TextCapitalization.characters,
                  inputFormatters: [LengthLimitingTextInputFormatter(20)],
                  onChanged: (_) => _emitir(),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: f.nombre,
            decoration: _deco(context, 'Nombre y apellido'),
            textCapitalization: TextCapitalization.words,
            inputFormatters: [LengthLimitingTextInputFormatter(80)],
            onChanged: (_) => _emitir(),
          ),
        ],
      ),
    );
  }

  InputDecoration _deco(BuildContext context, String label) => InputDecoration(
        labelText: label,
        labelStyle: TextStyle(fontSize: 13, color: context.textSecondaryColor),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      );
}
