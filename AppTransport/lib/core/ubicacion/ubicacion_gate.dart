import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:nexum_driver/app/theme/adaptive_colors.dart';

// ── La única puerta por la que se pide la ubicación ──────────────────────────
//
// Google Play exige una **divulgación destacada** DENTRO de la app antes de
// que salte el diálogo del sistema: qué dato se recoge, para qué, con quién se
// comparte y cuándo deja de recogerse, con una acción afirmativa para
// aceptar. No es letra pequeña de la política de privacidad: tiene que verse
// justo antes de pedirlo, y es de lo que más suspensiones provoca.
//
// Antes esto no existía: `LocationService.requestPermissions()` llamaba
// directo al diálogo del sistema desde `_connectWs`, sin una palabra de por
// medio. Y aquí el dato es más sensible que en la app del pasajero —es rastreo
// continuo mientras se está en línea—, así que la divulgación no es un
// trámite.
//
// La regla se sostiene por construcción, no por disciplina: este es el único
// archivo autorizado a llamar a `requestPermission`, y una prueba recorre
// `lib/` para comprobarlo. `LocationService` pregunta con [concedido], que
// nunca abre un diálogo.

abstract final class Ubicacion {
  /// ¿Tenemos permiso YA? Nunca pregunta ni abre nada.
  ///
  /// Para los sitios que solo quieren aprovechar el GPS si ya está disponible
  /// y que no deben interrumpir a nadie.
  static Future<bool> concedido() async {
    if (!await Geolocator.isLocationServiceEnabled()) return false;
    final p = await Geolocator.checkPermission();
    return p == LocationPermission.always || p == LocationPermission.whileInUse;
  }

  /// Pide la ubicación, enseñando ANTES la divulgación.
  ///
  /// Devuelve `true` solo si al final hay permiso. Si la persona dice «ahora
  /// no», el diálogo del sistema **no se llega a mostrar**: pedirlo igual
  /// después de que alguien haya dicho que no es lo que gasta el único intento
  /// que da Android antes del «no volver a preguntar».
  static Future<bool> pedir(BuildContext context) async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      if (!context.mounted) return false;
      await _hoja(
        context,
        titulo: 'La ubicación del teléfono está apagada',
        cuerpo: 'ZIPA no puede saber dónde estás hasta que la actives en los '
            'ajustes del sistema.',
        accion: 'Abrir ajustes',
        alAceptar: Geolocator.openLocationSettings,
      );
      return false;
    }

    var permiso = await Geolocator.checkPermission();

    // Ya concedido: no se vuelve a explicar nada. La divulgación va antes de
    // PEDIR, y aquí no hay nada que pedir.
    if (permiso == LocationPermission.always ||
        permiso == LocationPermission.whileInUse) {
      return true;
    }

    if (permiso == LocationPermission.deniedForever) {
      if (!context.mounted) return false;
      await _hoja(
        context,
        titulo: 'El permiso de ubicación está bloqueado',
        cuerpo: 'Lo denegaste antes, así que el sistema ya no vuelve a '
            'preguntar. Se activa desde los ajustes de la app.',
        accion: 'Abrir ajustes',
        alAceptar: Geolocator.openAppSettings,
      );
      return false;
    }

    if (!context.mounted) return false;
    final sigue = await _divulgacion(context);
    if (sigue != true) return false;

    permiso = await Geolocator.requestPermission();
    return permiso == LocationPermission.always ||
        permiso == LocationPermission.whileInUse;
  }

  // ── La divulgación ─────────────────────────────────────────────────────────

  static Future<bool?> _divulgacion(BuildContext context) {
    return showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.surfaceColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: ctx.appDividerColor,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              Text(
                'Para conectarte hace falta tu ubicación',
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w700,
                  color: ctx.textPrimaryColor,
                ),
              ),
              const SizedBox(height: 14),
              // Los cuatro puntos que Play exige: qué, para qué, con quién y
              // hasta cuándo. En ese orden y sin rodeos.
              const _Punto(
                icono: Icons.my_location_rounded,
                texto: 'Recogemos tu ubicación precisa mientras estés EN LÍNEA, '
                    'también con la app en segundo plano o la pantalla apagada.',
              ),
              const _Punto(
                icono: Icons.route_rounded,
                texto: 'Sirve para ofrecerte los viajes que tienes más cerca y '
                    'para mostrarle al pasajero por dónde vas durante el '
                    'servicio.',
              ),
              const _Punto(
                icono: Icons.people_alt_rounded,
                texto: 'Se envía a los servidores de ZIPA. La ve el pasajero de '
                    'tu servicio en curso y, si estás afiliado a una empresa, '
                    'también su central.',
              ),
              const _Punto(
                icono: Icons.timer_off_rounded,
                texto: 'Deja de recogerse en cuanto te desconectas. Mientras se '
                    'comparte, el sistema te lo muestra con su propio aviso.',
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: () => Navigator.of(ctx).pop(false),
                      child: const Text('Ahora no'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: () => Navigator.of(ctx).pop(true),
                      child: const Text('Continuar'),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  static Future<void> _hoja(
    BuildContext context, {
    required String titulo,
    required String cuerpo,
    required String accion,
    required Future<bool> Function() alAceptar,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: context.surfaceColor,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                titulo,
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: ctx.textPrimaryColor,
                ),
              ),
              const SizedBox(height: 10),
              Text(
                cuerpo,
                style: TextStyle(fontSize: 14, color: ctx.textSecondaryColor),
              ),
              const SizedBox(height: 20),
              Row(
                children: [
                  Expanded(
                    child: TextButton(
                      onPressed: () => Navigator.of(ctx).pop(),
                      child: const Text('Cerrar'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: FilledButton(
                      onPressed: () {
                        Navigator.of(ctx).pop();
                        alAceptar();
                      },
                      child: Text(accion),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Punto extends StatelessWidget {
  const _Punto({required this.icono, required this.texto});

  final IconData icono;
  final String texto;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icono, size: 18, color: context.textSecondaryColor),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              texto,
              style: TextStyle(
                fontSize: 13.5,
                height: 1.4,
                color: context.textPrimaryColor,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
