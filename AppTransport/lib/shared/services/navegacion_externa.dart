/// Llevar al conductor hasta el punto, con la app que él use.
///
/// Hasta ahora no había ningún botón para esto: el conductor leía la dirección
/// en la pantalla y la escribía a mano en Waze, conduciendo. Y en Ajustes había
/// un selector de «app de mapas» que no guardaba la elección ni la usaba nadie
/// — decoración pura.
///
/// NO es navegación paso a paso dentro de la app. Es el traspaso a la app que
/// la persona ya sabe usar, que es lo que hacen Uber y DiDi en casi todos los
/// mercados: nadie quiere aprender un navegador nuevo, y el suyo ya tiene sus
/// tráficos, sus voces y sus reportes.
library;

import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

enum AppDeMapas {
  googleMaps,
  waze,
  sistema;

  String get etiqueta => switch (this) {
        AppDeMapas.googleMaps => 'Google Maps',
        AppDeMapas.waze => 'Waze',
        AppDeMapas.sistema => 'La del sistema',
      };

  String get detalle => switch (this) {
        AppDeMapas.googleMaps => 'Navegación por voz y tráfico en vivo',
        AppDeMapas.waze => 'Avisos de la comunidad: retenes, huecos, tráfico',
        AppDeMapas.sistema => 'La que el teléfono tenga por defecto',
      };
}

/// Un destino al que llevar al conductor.
class Destino {
  const Destino({required this.lat, required this.lng, this.etiqueta});

  final double lat;
  final double lng;

  /// Nombre para que en el mapa aparezca algo legible en vez de dos números.
  final String? etiqueta;

  bool get esValido =>
      lat.isFinite &&
      lng.isFinite &&
      lat.abs() <= 90 &&
      lng.abs() <= 180 &&
      // (0,0) es el Golfo de Guinea: cuando aparece es porque faltaba el dato,
      // y mandar al conductor a mitad del Atlántico es peor que no ofrecerlo.
      !(lat == 0 && lng == 0);
}

/// Las direcciones que se van a intentar, en orden.
///
/// Siempre termina en una URL `https`, que es la red de seguridad: si la app
/// elegida no está instalada, se abre su versión web (que en un teléfono con la
/// app SÍ instalada la abre igual, y sin ella al menos enseña el mapa). Nunca
/// se queda en nada.
///
/// Pura a propósito: montar mal una de estas URL no da error, da un navegador
/// llevando al conductor a otro sitio, y eso solo se ve en la calle.
List<String> urlsDeNavegacion(
  AppDeMapas app,
  Destino destino, {
  required bool esAndroid,
}) {
  if (!destino.esValido) return const [];
  // Punto decimal SIEMPRE, sin importar el idioma del teléfono: con la coma
  // decimal de es-CO, «7,3754» partiría la coordenada en dos parámetros.
  final lat = destino.lat.toStringAsFixed(6);
  final lng = destino.lng.toStringAsFixed(6);
  final rotulo = Uri.encodeComponent(destino.etiqueta ?? '');

  return switch (app) {
    AppDeMapas.waze => [
        'waze://?ll=$lat,$lng&navigate=yes',
        'https://waze.com/ul?ll=$lat,$lng&navigate=yes',
      ],
    AppDeMapas.googleMaps => [
        if (esAndroid)
          // Arranca la navegación directamente, sin pantalla intermedia.
          'google.navigation:q=$lat,$lng&mode=d'
        else
          'comgooglemaps://?daddr=$lat,$lng&directionsmode=driving',
        'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving',
      ],
    AppDeMapas.sistema => [
        if (esAndroid)
          'geo:$lat,$lng?q=$lat,$lng${rotulo.isEmpty ? '' : '($rotulo)'}'
        else
          'maps://?daddr=$lat,$lng&dirflg=d',
        'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng&travelmode=driving',
      ],
  };
}

// ─── Preferencia guardada ────────────────────────────────────────────────────

const _clave = 'nexum_app_de_mapas';

Future<AppDeMapas> appDeMapasGuardada() async {
  try {
    final prefs = await SharedPreferences.getInstance();
    final guardada = prefs.getString(_clave);
    for (final a in AppDeMapas.values) {
      if (a.name == guardada) return a;
    }
  } catch (_) {
    // Sin preferencias legibles se usa Google Maps, que es la que viene en
    // prácticamente todos los Android.
  }
  return AppDeMapas.googleMaps;
}

Future<void> guardarAppDeMapas(AppDeMapas app) async {
  try {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_clave, app.name);
  } catch (_) {
    // Que no se guarde la preferencia no puede impedir navegar ahora.
  }
}

// ─── Abrir ───────────────────────────────────────────────────────────────────

/// Abre la navegación hacia el destino. Devuelve el motivo si NO se pudo.
///
/// Devuelve el motivo en vez de tragárselo: un botón que no hace nada y no
/// explica por qué es de las cosas que más desconfianza generan, y aquí el
/// conductor está esperando para arrancar.
Future<String?> abrirNavegacion(Destino destino, {AppDeMapas? app}) async {
  if (!destino.esValido) {
    return 'Este servicio no trae coordenadas: no se puede navegar hasta él.';
  }
  final elegida = app ?? await appDeMapasGuardada();
  final esAndroid = !kIsWeb && Platform.isAndroid;

  for (final url in urlsDeNavegacion(elegida, destino, esAndroid: esAndroid)) {
    try {
      final uri = Uri.parse(url);
      // `canLaunchUrl` sobre un esquema de otra app exige declararlo en
      // AndroidManifest (<queries>) y en Info.plist; están declarados. Aun así
      // se INTENTA lanzar cuando dice que no puede: un falso negativo dejaría
      // al conductor sin navegación teniendo la app instalada.
      if (await canLaunchUrl(uri)) {
        if (await launchUrl(uri, mode: LaunchMode.externalApplication)) {
          return null;
        }
      } else if (await launchUrl(uri, mode: LaunchMode.externalApplication)) {
        return null;
      }
    } catch (_) {
      // Esta no salió; se prueba la siguiente de la lista.
    }
  }
  return 'No se pudo abrir ${elegida.etiqueta}. Revisa que esté instalada.';
}
