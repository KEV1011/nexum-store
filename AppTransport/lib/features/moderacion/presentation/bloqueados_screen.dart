import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';
import 'package:nexum_driver/core/utils/safe_back.dart';
import 'package:nexum_driver/features/moderacion/data/moderacion_api.dart';

/// Quién está bloqueado, y cómo deshacerlo.
///
/// Existe porque un bloqueo sin vuelta atrás es una trampa: la gente se
/// arrepiente, y aquí el coste es directo — cada pasajero bloqueado es un
/// viaje que este conductor ya no va a recibir. Poder ver y deshacer lo que
/// uno bloqueó es además parte de lo que revisan las tiendas.
class BloqueadosScreen extends ConsumerStatefulWidget {
  const BloqueadosScreen({super.key});

  @override
  ConsumerState<BloqueadosScreen> createState() => _BloqueadosScreenState();
}

class _BloqueadosScreenState extends ConsumerState<BloqueadosScreen> {
  List<Bloqueado>? _lista;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    try {
      final l = await ref.read(moderacionApiProvider).bloqueados();
      if (!mounted) return;
      setState(() => _lista = l);
    } catch (_) {
      if (!mounted) return;
      // Cargando, falló y vacío son tres cosas distintas: una lista vacía por
      // un fallo de red diría que no hay nadie bloqueado, que es mentira.
      setState(() => _error = 'No pudimos cargar la lista.');
    }
  }

  Future<void> _desbloquear(Bloqueado b) async {
    try {
      await ref.read(moderacionApiProvider).desbloquear(b.personaId);
      if (!mounted) return;
      setState(() => _lista = _lista?.where((x) => x.id != b.id).toList());
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${b.nombre ?? 'Persona'} desbloqueada.')),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No se pudo desbloquear. Intenta de nuevo.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.backgroundColor,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => safeBack(context),
        ),
        title: const Text('Personas bloqueadas'),
      ),
      body: _cuerpo(),
    );
  }

  Widget _cuerpo() {
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, style: TextStyle(color: context.textSecondaryColor)),
            const SizedBox(height: 12),
            TextButton(onPressed: _cargar, child: const Text('Reintentar')),
          ],
        ),
      );
    }
    final lista = _lista;
    if (lista == null) return const Center(child: CircularProgressIndicator());
    if (lista.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Text(
            'No has bloqueado a nadie.\n\nSi un pasajero se comporta mal, '
            'puedes bloquearlo desde el chat del viaje: no volveremos a '
            'asignarles un servicio juntos.',
            textAlign: TextAlign.center,
            style: TextStyle(color: context.textSecondaryColor, height: 1.5),
          ),
        ),
      );
    }
    return ListView.separated(
      itemCount: lista.length,
      separatorBuilder: (_, __) => Divider(height: 1, color: context.appDividerColor),
      itemBuilder: (_, i) {
        final b = lista[i];
        return ListTile(
          leading: CircleAvatar(
            backgroundColor: context.surfaceVariantColor,
            child: Icon(Icons.person_outline, color: context.textSecondaryColor),
          ),
          title: Text(b.nombre ?? 'Pasajero'),
          subtitle: const Text('No se les asignarán servicios juntos'),
          trailing: TextButton(
            onPressed: () => _desbloquear(b),
            child: const Text('Desbloquear'),
          ),
        );
      },
    );
  }
}
