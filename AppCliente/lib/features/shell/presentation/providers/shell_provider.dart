import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Índice activo del tab del HomeShell.
/// Permite que cualquier pantalla navegue a un tab sin callbacks ni
/// InheritedWidgets.
final shellTabProvider = StateProvider<int>((ref) => 0);

// ── Los índices, con nombre ──────────────────────────────────────────────────
//
// Estaban escritos a mano en tres sitios (`= 2`, `= 3`) y eran una bomba de
// relojería: reordenar la barra inferior mandaba a la gente a la pestaña
// equivocada, y nada lo habría avisado porque un entero siempre compila.
// Ocurrió al sacar Movilidad de la barra — el `2` que la abría pasó a ser
// Favoritos.
//
// MOVILIDAD NO ESTÁ EN LA BARRA pero sigue en la pila: es una pantalla con
// mapa, suscripción por WebSocket y, a veces, un viaje en curso. Sacarla de la
// pila la destruiría cada vez que se sale de ella, y volver costaría recargar
// el mapa y reconectar. Se entra por la tarjeta de la rejilla.
const int kTabInicio = 0;
const int kTabPedidos = 1;
const int kTabFavoritos = 2;
const int kTabCuenta = 3;
const int kTabMovilidad = 4;
