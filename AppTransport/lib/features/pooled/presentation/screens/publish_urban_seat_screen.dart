/// Publicar un viaje por puestos dentro de la ciudad.
///
/// Es lo que los taxis ya hacen: en vez de quedarse quietos en el paradero,
/// salen recogiendo persona por persona sobre un trayecto conocido. Aquí eso
/// se publica, se reserva y el precio queda dicho antes de subirse.
///
/// EL PRECIO NO SE ESCRIBE: lo pone la plataforma. La carrera compartida vale
/// una cifra fija y el puesto es esa cifra repartida entre las sillas que se
/// publican. Antes había un campo de texto con un tope derivado del taxímetro,
/// y eso tenía dos problemas: dos taxistas cobraban distinto por el mismo
/// trayecto, y el tope dependía de que Google resolviera la ruta (si fallaba
/// caía al piso en silencio). El formulario sigue enseñando la carrera sola
/// para que se vea el ahorro, pero el número ya no se discute.
library;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:nexum_driver/app/theme/app_colors.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/utils/currency_formatter.dart';
import 'package:nexum_driver/core/utils/safe_back.dart';
import 'package:nexum_driver/features/pooled/domain/entities/pooled_trip_entity.dart';
import 'package:nexum_driver/features/pooled/presentation/providers/pooled_driver_provider.dart';
import 'package:nexum_driver/features/pooled/presentation/providers/municipalities_provider.dart';
import 'package:nexum_driver/features/pooled/presentation/widgets/city_search_sheet.dart';

const _kUrbano = AppColors.serviceTaxi;

class PublishUrbanSeatScreen extends ConsumerStatefulWidget {
  const PublishUrbanSeatScreen({super.key});

  @override
  ConsumerState<PublishUrbanSeatScreen> createState() =>
      _PublishUrbanSeatScreenState();
}

class _PublishUrbanSeatScreenState
    extends ConsumerState<PublishUrbanSeatScreen> {
  PooledCity _ciudad = PooledCity.pamplona;
  DateTime _salida = DateTime.now().add(const Duration(minutes: 30));
  int _puestos = 4;
  bool _enviando = false;

  final _origenCtrl = TextEditingController();
  final _destinoCtrl = TextEditingController();
  final _vehiculoCtrl = TextEditingController();
  final _notasCtrl = TextEditingController();

  TopePuestoUrbano? _tope;
  bool _consultando = false;

  @override
  void dispose() {
    _origenCtrl.dispose();
    _destinoCtrl.dispose();
    _vehiculoCtrl.dispose();
    _notasCtrl.dispose();
    super.dispose();
  }

  /// Pregunta el tope. Solo con los dos extremos escritos: sin ellos el
  /// servidor no tiene qué medir y el número saldría del piso, que confunde.
  Future<void> _refrescarTope() async {
    final origen = _origenCtrl.text.trim();
    final destino = _destinoCtrl.text.trim();
    if (origen.isEmpty || destino.isEmpty) {
      setState(() => _tope = null);
      return;
    }
    setState(() => _consultando = true);
    final tope = await ref.read(pooledDriverProvider.notifier).fetchTopeUrbano(
          ciudad: _ciudad,
          origen: origen,
          destino: destino,
          puestos: _puestos,
        );
    if (!mounted) return;
    setState(() {
      _tope = tope;
      _consultando = false;
    });
  }

  Future<void> _elegirHora() async {
    final ahora = DateTime.now();
    final fecha = await showDatePicker(
      context: context,
      initialDate: _salida.isAfter(ahora) ? _salida : ahora,
      firstDate: ahora,
      lastDate: ahora.add(const Duration(days: 7)),
    );
    if (fecha == null || !mounted) return;
    final hora = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_salida),
    );
    if (hora == null) return;
    setState(() {
      _salida =
          DateTime(fecha.year, fecha.month, fecha.day, hora.hour, hora.minute);
    });
  }

  Future<void> _publicar() async {
    final origen = _origenCtrl.text.trim();
    final destino = _destinoCtrl.text.trim();
    if (origen.isEmpty || destino.isEmpty) {
      _aviso('Escribe de dónde sales y a dónde llegas');
      return;
    }
    if (_vehiculoCtrl.text.trim().isEmpty) {
      _aviso('Describe tu vehículo (ej: Chevrolet Spark Amarillo · TAX 123)');
      return;
    }
    if (_salida.isBefore(DateTime.now())) {
      _aviso('La hora de salida debe ser en el futuro');
      return;
    }

    setState(() => _enviando = true);
    final error =
        await ref.read(pooledDriverProvider.notifier).publicarPuestoUrbano(
              ciudad: _ciudad,
              origen: origen,
              destino: destino,
              salida: _salida,
              puestos: _puestos,
              vehiculo: _vehiculoCtrl.text.trim(),
              notas: _notasCtrl.text.trim(),
            );
    if (!mounted) return;
    if (error == null) {
      HapticFeedback.mediumImpact();
      context.pushReplacement('/pooled-trips');
    } else {
      setState(() => _enviando = false);
      _aviso(error);
    }
  }

  void _aviso(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: AppColors.error),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Carga la lista real de municipios: el respaldo de siete dejaría fuera la
    // ciudad de cualquier taxista que no sea de las capitales.
    ref.watch(municipalitiesProvider);

    final d = _salida;
    final cuando = '${d.day}/${d.month} · '
        '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        backgroundColor: _kUrbano,
        foregroundColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => safeBack(context, fallback: '/pooled-trips'),
        ),
        title: const Text('Viaje por puestos'),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          const _Explicacion(),
          const SizedBox(height: 20),

          _label('Ciudad'),
          _tile(
            icon: Icons.location_city_rounded,
            text: _ciudad.displayName,
            onTap: () async {
              final elegida = await showCitySearchSheet(
                context,
                titulo: 'Ciudad de la ruta',
                seleccionado: _ciudad,
              );
              if (elegida == null) return;
              setState(() => _ciudad = elegida);
              _refrescarTope();
            },
          ),
          const SizedBox(height: 16),

          _label('Recorrido'),
          TextField(
            controller: _origenCtrl,
            textCapitalization: TextCapitalization.sentences,
            onEditingComplete: _refrescarTope,
            onTapOutside: (_) => _refrescarTope(),
            decoration: const InputDecoration(
              hintText: 'Sales de… (ej: Terminal de transportes)',
              prefixIcon: Icon(Icons.trip_origin_rounded),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _destinoCtrl,
            textCapitalization: TextCapitalization.sentences,
            onEditingComplete: _refrescarTope,
            onTapOutside: (_) => _refrescarTope(),
            decoration: const InputDecoration(
              hintText: 'Llegas a… (ej: Universidad de Pamplona)',
              prefixIcon: Icon(Icons.place_rounded),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),

          _label('Sale a las'),
          _tile(icon: Icons.schedule_rounded, text: cuando, onTap: _elegirHora),
          const SizedBox(height: 16),

          _label('Puestos'),
          Row(
            children: [
              _paso(Icons.remove_rounded, _puestos > 2, () {
                setState(() => _puestos--);
                _refrescarTope();
              }),
              Expanded(
                child: Center(
                  child: Text(
                    '$_puestos',
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: context.textPrimaryColor,
                    ),
                  ),
                ),
              ),
              _paso(Icons.add_rounded, _puestos < 4, () {
                setState(() => _puestos++);
                _refrescarTope();
              }),
            ],
          ),
          const SizedBox(height: 16),

          _label('Precio por puesto'),
          _PanelPrecio(
            tope: _tope,
            consultando: _consultando,
            puestos: _puestos,
          ),
          const SizedBox(height: 16),

          _label('Tu vehículo'),
          TextField(
            controller: _vehiculoCtrl,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(
              hintText: 'Ej: Chevrolet Spark Amarillo · TAX 123',
              prefixIcon: Icon(Icons.local_taxi_rounded),
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),

          _label('Nota para los pasajeros (opcional)'),
          TextField(
            controller: _notasCtrl,
            maxLines: 2,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              hintText: 'Ej: salgo puntual, espero 3 minutos',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 24),

          SizedBox(
            height: 52,
            child: FilledButton.icon(
              style: FilledButton.styleFrom(backgroundColor: _kUrbano),
              onPressed: _enviando ? null : _publicar,
              icon: _enviando
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white),
                    )
                  : const Icon(Icons.campaign_rounded),
              label: Text(_enviando ? 'Publicando…' : 'Publicar viaje'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          t,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: context.textSecondaryColor,
          ),
        ),
      );

  Widget _tile({
    required IconData icon,
    required String text,
    required VoidCallback onTap,
  }) =>
      InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
            border: Border.all(color: context.outlineColor),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            children: [
              Icon(icon, color: _kUrbano, size: 20),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  text,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: context.textPrimaryColor,
                  ),
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: context.textSecondaryColor),
            ],
          ),
        ),
      );

  Widget _paso(IconData icon, bool activo, VoidCallback onTap) => IconButton.filled(
        onPressed: activo ? onTap : null,
        icon: Icon(icon),
        style: IconButton.styleFrom(
          backgroundColor: activo ? _kUrbano : context.outlineColor,
          foregroundColor: Colors.white,
        ),
      );
}

/// Por qué existe esta pantalla, en dos líneas. El taxista que la abre por
/// primera vez tiene que entender que no es una carrera normal.
class _Explicacion extends StatelessWidget {
  const _Explicacion();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppColors.serviceTaxiContainer,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.groups_rounded, color: _kUrbano),
            const SizedBox(width: 12),
            const Expanded(
              child: Text(
                'Publica el recorrido que vas a hacer y véndelo por puestos. '
                'Los pasajeros de tu ciudad lo ven y reservan su silla antes de '
                'que salgas.',
                style: TextStyle(
                  fontSize: 13,
                  height: 1.35,
                  // Sobre el contenedor ámbar claro: fijo a propósito, es un
                  // fondo que no cambia con el tema.
                  color: Color(0xFF5B3D00),
                ),
              ),
            ),
          ],
        ),
      );
}

/// El precio en firme, y con qué se compara.
///
/// Ya no hay nada que decidir: enseña lo que cuesta el puesto, lo que deja el
/// carro lleno y lo que costaría esa carrera llevando a una sola persona —que
/// es lo que le dice al taxista si le conviene—.
class _PanelPrecio extends StatelessWidget {
  const _PanelPrecio({
    required this.tope,
    required this.consultando,
    required this.puestos,
  });

  final TopePuestoUrbano? tope;
  final bool consultando;
  final int puestos;

  @override
  Widget build(BuildContext context) {
    if (consultando) {
      return Row(
        children: [
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2, color: _kUrbano),
          ),
          const SizedBox(width: 10),
          Text(
            'Calculando el precio de la carrera…',
            style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
          ),
        ],
      );
    }
    final t = tope;
    if (t == null) {
      return Text(
        'Escribe de dónde sales y a dónde llegas para ver el precio del puesto.',
        style: TextStyle(fontSize: 13, color: context.textSecondaryColor),
      );
    }

    // `sugerido` trae el precio FIJO que fija la plataforma (el backend lo
    // devuelve también en `precioPorPuesto`). No es una propuesta editable: es
    // lo que se va a cobrar.
    final porPuesto = t.sugerido;
    final lleno = porPuesto * puestos;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: context.surfaceVariantColor,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _fila(context, 'Cada puesto', CurrencyFormatter.format(porPuesto)),
          if (lleno > 0)
            _fila(context, 'Con el carro lleno ($puestos puestos)',
                CurrencyFormatter.format(lleno), destacado: true),
          _fila(context, 'Esa carrera, llevando a uno solo',
              CurrencyFormatter.format(t.tarifaSolo)),
          const SizedBox(height: 6),
          Text(
            'El precio lo fija ZIPA, igual para todos los taxis. No hay nada '
            'que discutir a bordo.',
            style: TextStyle(fontSize: 12, color: context.textSecondaryColor),
          ),
        ],
      ),
    );
  }

  Widget _fila(BuildContext context, String k, String v,
          {bool destacado = false}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Expanded(
              child: Text(k,
                  style: TextStyle(
                      fontSize: 13, color: context.textSecondaryColor)),
            ),
            Text(
              v,
              style: TextStyle(
                fontSize: destacado ? 15 : 13,
                fontWeight: destacado ? FontWeight.w800 : FontWeight.w600,
                color: destacado ? _kUrbano : context.textPrimaryColor,
              ),
            ),
          ],
        ),
      );
}
