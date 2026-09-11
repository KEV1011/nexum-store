import 'package:flutter/material.dart';

// ── Tokens de ZIPA ───────────────────────────────────────────────────────────
//
// UN SOLO COLOR DE MARCA: el verde `#00C853`. Todo lo demás que tenga color en
// esta app es un **tinte de categoría**, no un acento de marca, y solo aparece
// en dos sitios: el contenedor del icono de un servicio y los badges.
//
// El problema que resuelve: la home tenía verde, naranja y azul compitiendo sin
// jerarquía. Con tres acentos, ninguno significa nada — el usuario no sabe cuál
// mirar. Con uno solo, el verde quiere decir «ZIPA» y «esto es lo principal», y
// los tintes solo distinguen categorías entre sí.
//
// SOBRE EL TEMA: esta app NO es de tema oscuro. Arranca en CLARO
// (`ThemeNotifier() : super(ThemeMode.light)`) y el oscuro es opcional, así que
// cada token se declara como PAR claro/oscuro y se resuelve por el tema. Fijar
// aquí solo los valores oscuros dejaría ilegible a la mayoría de los usuarios,
// que están en claro.
//
// CONTRASTE: los valores de abajo están MEDIDOS, no estimados, y todo texto
// alcanza 4.5:1 sobre su superficie. La medición encontró dos incumplimientos
// reales en lo que ya había, anotados en cada sitio.

/// Un color que cambia con el tema. Se resuelve con `de(context)`.
@immutable
class ZipaColor {
  const ZipaColor({required this.claro, required this.oscuro});
  final Color claro;
  final Color oscuro;

  Color de(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark ? oscuro : claro;
}

/// Un tinte de categoría: SIEMPRE el par fondo + glifo.
///
/// Va emparejado a propósito. Declarar el fondo suelto invita a poner encima un
/// glifo blanco puro, y blanco sobre un tinte claro no se lee. El glifo es
/// siempre de la misma familia que su fondo, unos cuantos pasos más oscuro (o
/// más claro, en tema oscuro).
@immutable
class ZipaTinte {
  const ZipaTinte({required this.fondo, required this.glifo});
  final ZipaColor fondo;
  final ZipaColor glifo;
}

abstract final class ZipaTokens {
  // ── Marca ─────────────────────────────────────────────────────────────────

  /// El único color de marca. Para rellenos: botones, indicadores, el activo
  /// de la barra inferior.
  static const Color marca = Color(0xFF00C853);

  /// El verde cuando es TEXTO o un glifo fino.
  ///
  /// `#00C853` sobre blanco da 2,24:1 — ilegible. No es un capricho de norma:
  /// un verde brillante sobre blanco literalmente no se distingue. En claro se
  /// usa un verde hondo (5,48:1) y en oscuro uno claro (9,65:1).
  static const marcaTexto = ZipaColor(
    claro: Color(0xFF037A32),
    oscuro: Color(0xFF4ADE80),
  );

  // ── Texto ─────────────────────────────────────────────────────────────────
  //
  // MEDIDO: el terciario que había (`#9CA3AF`) daba 2,41:1 sobre el fondo de la
  // app. Es justo el gris de los metadatos de un comercio —«categoría · tiempo
  // · envío»—, o sea la línea que alguien lee para decidir dónde pedir, y no se
  // veía.
  //
  // La superficie que manda NO es el fondo de la app: es la HUNDIDA
  // (`#F0F2F5`), la del buscador, que es la más oscura de las claras. La
  // primera medición la pasó por alto y se quedó en `#6B7280`, que da 4,59:1
  // sobre el fondo pero **4,31:1** sobre la hundida. Lo cazó la prueba, no yo.
  // Ahora `#666D7A`: 4,64:1 en la peor de las tres.
  //
  // Y como el terciario subió hasta donde estaba el secundario, el secundario
  // baja un paso (`#565E6B`, 5,83:1 en la peor). Se mantiene la jerarquía con
  // dos grises que CUMPLEN los dos, en vez de tres donde el último no se leía.
  // Sobre un fondo casi blanco no caben tres grises legibles: el tercer nivel
  // se hace con tamaño y peso, no con más gris.

  static const textoPrincipal = ZipaColor(
    claro: Color(0xFF111827),
    oscuro: Color(0xFFE2E8F0),
  );

  static const textoSecundario = ZipaColor(
    claro: Color(0xFF565E6B),
    oscuro: Color(0xFFA8B3C4),
  );

  static const textoTerciario = ZipaColor(
    claro: Color(0xFF666D7A),
    oscuro: Color(0xFF94A3B8),
  );

  // ── Superficies ───────────────────────────────────────────────────────────

  static const fondo = ZipaColor(
    claro: Color(0xFFF8F9FA),
    oscuro: Color(0xFF0F1117),
  );

  static const superficie = ZipaColor(
    claro: Color(0xFFFFFFFF),
    oscuro: Color(0xFF1A1D27),
  );

  /// Para el buscador y los campos: se distingue del fondo sin ser una tarjeta.
  static const superficieHundida = ZipaColor(
    claro: Color(0xFFF0F2F5),
    oscuro: Color(0xFF252836),
  );

  /// Borde de un pelo. Separa sin dibujar una caja.
  static const borde = ZipaColor(
    claro: Color(0xFFDDE1E7),
    oscuro: Color(0xFF2E3347),
  );

  // ── Tintes de categoría ───────────────────────────────────────────────────
  //
  // Solo para el contenedor del icono de un servicio y para badges. NO son
  // acentos de marca y no deben aparecer en botones, enlaces ni cabeceras: ahí
  // el color es el verde, y solo el verde.

  static const movilidad = ZipaTinte(
    fondo: ZipaColor(claro: Color(0xFFE8EAF6), oscuro: Color(0xFF1E2440)),
    glifo: ZipaColor(claro: Color(0xFF3949AB), oscuro: Color(0xFF9FA8DA)),
  );

  static const restaurantes = ZipaTinte(
    fondo: ZipaColor(claro: Color(0xFFFFF3E0), oscuro: Color(0xFF3A2A17)),
    glifo: ZipaColor(claro: Color(0xFFB45309), oscuro: Color(0xFFFBBF24)),
  );

  static const envios = ZipaTinte(
    fondo: ZipaColor(claro: Color(0xFFE0F2F1), oscuro: Color(0xFF14302D)),
    glifo: ZipaColor(claro: Color(0xFF00695C), oscuro: Color(0xFF5EEAD4)),
  );

  static const intermunicipal = ZipaTinte(
    fondo: ZipaColor(claro: Color(0xFFE3F2FD), oscuro: Color(0xFF16273D)),
    glifo: ZipaColor(claro: Color(0xFF1565C0), oscuro: Color(0xFF93C5FD)),
  );

  // ── Estado de un comercio ─────────────────────────────────────────────────

  static const abierto = ZipaTinte(
    fondo: ZipaColor(claro: Color(0xFFDCFCE7), oscuro: Color(0xFF14321F)),
    glifo: ZipaColor(claro: Color(0xFF166534), oscuro: Color(0xFF86EFAC)),
  );

  /// Cerrado no es un error: es información. Por eso va en gris y no en rojo —
  /// un comercio cerrado a las 3 de la mañana está haciendo lo correcto.
  static const cerrado = ZipaTinte(
    fondo: ZipaColor(claro: Color(0xFFF0F2F5), oscuro: Color(0xFF252836)),
    glifo: ZipaColor(claro: Color(0xFF565E6B), oscuro: Color(0xFFA8B3C4)),
  );
}

/// Acceso corto desde el `context`, para no arrastrar `.de(context)` por todas
/// partes en el árbol de widgets.
extension ZipaTokensX on BuildContext {
  Color get zFondo => ZipaTokens.fondo.de(this);
  Color get zSuperficie => ZipaTokens.superficie.de(this);
  Color get zHundida => ZipaTokens.superficieHundida.de(this);
  Color get zBorde => ZipaTokens.borde.de(this);
  Color get zTexto => ZipaTokens.textoPrincipal.de(this);
  Color get zTexto2 => ZipaTokens.textoSecundario.de(this);
  Color get zTexto3 => ZipaTokens.textoTerciario.de(this);
  Color get zMarcaTexto => ZipaTokens.marcaTexto.de(this);
}
